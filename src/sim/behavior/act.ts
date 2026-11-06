// Исполнение поведения: подход к цели, поворот, само действие и его последствия.
// Каждое занятие — состояние конечного автомата с фазами «идти» и «делать».

import { BODY, ELEPHANT, FOOD, HOSE, LEARN, NEEDS, WATER } from '../../data/balance';
import { DRUM, GATE_BY_ID, STATIONS, TIRE, TREES, areaAt, zoneAt, type FeederId, type TroughId } from '../../data/facility';
import { VEG_KINDS } from '../../data/rations';
import { fx, log } from '../events';
import { angleDiff, dist, inPool } from '../geometry';
import { elephantCanStand, elephantRoute, nearestStandable } from '../nav';
import { clamp, random, range } from '../rng';
import type { Activity, Elephant, FoodItem, State, TargetRef, Tub, Vec } from '../types';
import { addFood, addLitter, cellOf, dropDung, dropFruit, fruitStage, kickBall, touchCells, tubById, tubKg, urinateAt } from '../world';
import type { Candidate } from './options';
import { grabbableFromArea, hoseApproach } from './options';
import { adjustBond, areaOf, bond, elephantById, gateMask, headPos, keeperContact, radiusOf, rankOf, reachableAreas, rearPos, slotTakenBy, zoneOf } from './perceive';
import { beginSignal } from './signals';
import { nameCase } from '../herd';

export function idleActivity(t: number): Activity {
  return { kind: 'idle', target: null, phase: 'do', start: t, doStart: t, dur: 1, score: 0.1, forced: false, signal: null, note: 'стоит', key: 'idle', aux: null, flag: 0 };
}

export function activityFrom(s: State, c: Candidate, forced = false): Activity {
  return {
    kind: c.kind,
    target: c.target,
    phase: c.target ? 'go' : 'do',
    start: s.t,
    doStart: c.target ? -1 : s.t,
    dur: c.dur,
    score: c.score,
    forced,
    signal: c.signal,
    note: c.note,
    key: c.key,
    aux: c.aux,
    flag: 0,
  };
}

export function startActivity(s: State, e: Elephant, c: Candidate, forced = false): void {
  leaveActivity(s, e, 'interrupted');
  e.act = activityFrom(s, c, forced);
  e.path = [];
  e.pathGoal = null;
  e.stuck = 0;
  e.bestDist = 1e6;
  if (e.act.kind === 'play' && e.act.target?.t === 'el') invitePartner(s, e, e.act.target.id);
  if (e.act.phase === 'do') enterDo(s, e);
}

// Выход из занятия: снять сигнал, встать, положить то, что несла, записать откат
function leaveActivity(s: State, e: Elephant, outcome: 'done' | 'fail' | 'interrupted'): void {
  const a = e.act;
  if (e.lying && (a.kind === 'sleep' || a.kind === 'lie')) {
    e.lying = false;
    fx('standUp', e.x, e.y, e.id);
  }
  if (e.trunk.kind && e.trunk.amount > 0) {
    const h = headPos(e, 1.4);
    if (zoneAt(h.x, h.y)) addFood(s, e.trunk.kind === 'fruit' ? 'fruit' : e.trunk.kind, h.x, h.y, e.trunk.amount, zoneOf(e));
    e.trunk = { kind: null, amount: 0 };
  }
  if (a.kind === 'signal' && e.signal && outcome !== 'done') {
    // Сигнал брошен на полпути (например, приспичило) — без последствий для научения
    e.signal = null;
  }
  const cd = cooldownFor(e, a, outcome);
  if (cd > 0) e.mem.cooldown[a.key] = s.t + cd;
}

function cooldownFor(e: Elephant, a: Activity, outcome: 'done' | 'fail' | 'interrupted'): number {
  if (a.kind === 'idle' || a.kind === 'wander' || a.kind === 'avoid' || a.kind === 'follow' || a.kind === 'lie') return 0;
  if (outcome === 'fail') return 6 + 6 * (1 - e.profile.traits.persistence);
  if (outcome === 'interrupted') return 0;
  switch (a.kind) {
    case 'play':
      return 25 + 30 * (1 - e.profile.traits.playfulness);
    case 'bathe':
      return 50;
    case 'dust':
      return 35;
    case 'explore':
      return 8;
    case 'socialize':
      return 25;
    case 'rest':
      return 6;
    case 'eat':
      return 4;
    case 'drink':
      return 8;
    case 'seekKeeper':
      return 12;
    case 'pace':
      return 6;
    case 'carry':
      return 20;
    case 'toss':
      return 30;
    case 'shake':
      return 40;
    case 'manipulate':
      return 18 + 30 * (1 - e.profile.traits.mischief);
    case 'signal':
      return a.signal === 'attention' ? 35 : 10;
    default:
      return 0;
  }
}

export function finishActivity(s: State, e: Elephant, outcome: 'done' | 'fail'): void {
  leaveActivity(s, e, outcome);
  e.act = idleActivity(s.t);
  e.act.dur = 0; // сразу пересмотреть
  e.path = [];
  e.pathGoal = null;
  e.mem.nextThink = s.t;
}

function invitePartner(s: State, e: Elephant, id: string): void {
  const o = elephantById(s, id);
  if (!o || o.act.forced || o.lying) return;
  if (!['idle', 'wander', 'rest', 'explore', 'socialize', 'play'].includes(o.act.kind)) return;
  if (o.act.kind === 'play' && o.act.target?.t === 'el' && o.act.target.id === e.id) return;
  const c: Candidate = { kind: 'play', target: { t: 'el', id: e.id }, score: 0.8, dur: e.act.dur, key: `play:${e.id}`, signal: null, note: `возится с ${nameCase(e.profile.name, 'ins')}`, aux: null };
  startActivity(s, o, c);
}

// ---------------------------------------------------------------------------
// Куда идти ради цели
// ---------------------------------------------------------------------------

export interface Approach {
  x: number;
  y: number;
  face: number | null;
  tol: number;
}

function toward(from: Vec, to: Vec, back: number): Vec {
  const d = dist(from, to) || 1;
  return { x: to.x + ((from.x - to.x) / d) * back, y: to.y + ((from.y - to.y) / d) * back };
}

function standableNear(e: Elephant, p: Vec, mask: number): Vec | null {
  const r = radiusOf(e);
  if (elephantCanStand(p.x, p.y, r, mask)) return p;
  return nearestStandable(p, r + 0.05, mask);
}

export function approachOf(s: State, e: Elephant, t: TargetRef): Approach | null {
  const mask = gateMask(s);
  const reach = 1.75 * e.profile.look.size;
  switch (t.t) {
    case 'point': {
      const p = standableNear(e, { x: t.x, y: t.y }, mask);
      return p ? { x: p.x, y: p.y, face: t.face, tol: 0.35 } : null;
    }
    case 'slot': {
      const p = STATIONS[t.station].slots![t.slot];
      return { x: p.x, y: p.y, face: p.face, tol: 0.3 };
    }
    case 'gate': {
      const p = GATE_BY_ID[t.gate].approach[t.side];
      return p ? { x: p.x, y: p.y, face: p.face, tol: 0.4 } : null;
    }
    case 'obj': {
      if (t.id === 'pool' || t.id === 'dust') return { x: t.x, y: t.y, face: null, tol: 0.6 };
      if (t.id === 'tire') return { x: TIRE.x, y: TIRE.y + 1.95, face: -Math.PI / 2, tol: 0.35 };
      if (t.id === 'drum') return { x: DRUM.x + 1.95, y: DRUM.y, face: Math.PI, tol: 0.35 };
      if (t.id === 'ball') {
        const b = s.world.ball;
        const p = standableNear(e, toward(e, b, reach), mask);
        return p ? { x: p.x, y: p.y, face: Math.atan2(b.y - p.y, b.x - p.x), tol: 0.6 } : null;
      }
      if (t.id === 'hose') {
        const inside = reachableAreas(s, e).includes(areaAt(t.x, t.y) as never);
        const want = inside ? toward(e, t, reach) : hoseApproach(t);
        const p = standableNear(e, want, mask);
        return p ? { x: p.x, y: p.y, face: Math.atan2(t.y - p.y, t.x - p.x), tol: 0.5 } : null;
      }
      const tree = TREES.find((tr) => tr.id === t.id);
      const center = tree ? { x: tree.x, y: tree.y } : { x: t.x, y: t.y };
      const p = standableNear(e, toward(e, center, reach + 0.4), mask);
      return p ? { x: p.x, y: p.y, face: Math.atan2(center.y - p.y, center.x - p.x), tol: 0.5 } : null;
    }
    case 'food': {
      const f = s.world.food.find((x) => x.id === t.id);
      if (!f) return null;
      const p = standableNear(e, toward(e, f, reach), mask);
      return p ? { x: p.x, y: p.y, face: Math.atan2(f.y - p.y, f.x - p.x), tol: 0.45 } : null;
    }
    case 'tub': {
      const tub = tubById(s, t.id);
      if (!tub || tub.where !== 'floor') return null;
      const p = standableNear(e, toward(e, tub, reach), mask);
      return p ? { x: p.x, y: p.y, face: Math.atan2(tub.y - p.y, tub.x - p.x), tol: 0.45 } : null;
    }
    case 'item': {
      const it = s.world.items.find((x) => x.id === t.id);
      if (!it) return null;
      if (zoneAt(it.x, it.y)) {
        const p = standableNear(e, toward(e, it, reach), mask);
        return p ? { x: p.x, y: p.y, face: Math.atan2(it.y - p.y, it.x - p.x), tol: 0.45 } : null;
      }
      // Вещь за решёткой: встать вплотную к линии и тянуться хоботом
      const line = it.y > 25 ? 30 : 20;
      const p = standableNear(e, { x: it.x, y: line - 2.1 }, mask);
      return p ? { x: p.x, y: p.y, face: Math.PI / 2, tol: 0.4 } : null;
    }
    case 'el': {
      const o = elephantById(s, t.id);
      if (!o) return null;
      if (areaOf(o) !== areaOf(e) && !reachableAreas(s, e).includes(areaOf(o))) {
        // Подруга в соседнем стойле: к решётке напротив неё
        const x = areaOf(e) === 'stallW' ? 18.4 : 21.6;
        const p = standableNear(e, { x, y: Math.max(21.6, Math.min(28.2, o.y)) }, mask);
        return p ? { x: p.x, y: p.y, face: areaOf(e) === 'stallW' ? 0 : Math.PI, tol: 0.6 } : null;
      }
      const side = Math.atan2(e.y - o.y, e.x - o.x);
      const want = { x: o.x + Math.cos(side) * 2.7, y: o.y + Math.sin(side) * 2.7 };
      const p = standableNear(e, want, mask);
      return p ? { x: p.x, y: p.y, face: Math.atan2(o.y - p.y, o.x - p.x), tol: 0.8 } : null;
    }
  }
}

// ---------------------------------------------------------------------------
// Движение: слон поворачивает корпус постепенно и идёт по сглаженному маршруту
// ---------------------------------------------------------------------------

function speedFor(e: Elephant): number {
  const a = e.act;
  const T = e.profile.traits;
  const n = e.needs;
  const base = (0.85 + 0.3 * T.activity) * (1 - 0.35 * e.tipsy);
  switch (a.kind) {
    case 'avoid':
      return ELEPHANT.speedTrot * (1 - 0.3 * e.tipsy);
    case 'follow':
    case 'signal':
    case 'urinate':
    case 'defecate':
      return ELEPHANT.speedPurpose * base;
    case 'eat':
      return (n.hunger > 70 ? ELEPHANT.speedPurpose : ELEPHANT.speedAmble) * base;
    case 'drink':
      return (n.thirst > 70 ? ELEPHANT.speedPurpose : ELEPHANT.speedAmble) * base;
    case 'play':
      return (a.target?.t === 'obj' && a.target.id === 'tire' ? ELEPHANT.speedAmble : ELEPHANT.speedTrot * (0.7 + 0.3 * T.playfulness)) * base;
    case 'bathe':
    case 'dust':
      return (n.heat > 60 ? ELEPHANT.speedPurpose : ELEPHANT.speedAmble) * base;
    default:
      return ELEPHANT.speedAmble * base;
  }
}

function turnToward(e: Elephant, target: number, dtSec: number, rate: number): number {
  const d = angleDiff(e.heading, target);
  const step = Math.sign(d) * Math.min(Math.abs(d), rate * dtSec);
  e.heading += step;
  if (e.heading > Math.PI) e.heading -= Math.PI * 2;
  if (e.heading < -Math.PI) e.heading += Math.PI * 2;
  return Math.abs(d - step);
}

export type MoveResult = 'arrived' | 'moving' | 'blocked';

export function moveTo(s: State, e: Elephant, goal: Vec, maxSpeed: number, dtSec: number, tol = 0.35): MoveResult {
  const mask = gateMask(s);
  const r = radiusOf(e);
  const d = dist(e, goal);
  if (d <= tol) {
    e.speed = Math.max(0, e.speed - 2.5 * dtSec);
    return 'arrived';
  }
  if (!e.pathGoal || dist(e.pathGoal, goal) > 0.4 || !e.path.length) {
    const route = elephantRoute(e, goal, r, mask);
    if (!route || !route.length) {
      e.speed = 0;
      return 'blocked';
    }
    e.path = route.map((p) => ({ x: p.x, y: p.y }));
    e.pathGoal = { x: goal.x, y: goal.y };
  }
  while (e.path.length > 1 && dist(e, e.path[0]) < 0.45) e.path.shift();
  if (e.path.length === 1 && dist(e, e.path[0]) < 0.3) {
    // Маршрут пройден, а цель чуть в стороне (точно туда не встать) — считаем, что пришли
    if (d < 1.3) return 'arrived';
    e.path = [];
    e.pathGoal = null;
    return 'blocked';
  }
  const wp = e.path[0];
  let desired = Math.atan2(wp.y - e.y, wp.x - e.x);
  // Захмелевшую слегка водит из стороны в сторону
  if (e.tipsy > 0.2) desired += Math.sin(s.t * 2.3 + e.profile.look.seed % 7) * 0.4 * e.tipsy;
  const diff = Math.abs(angleDiff(e.heading, desired));
  if (diff > 1.7) {
    // Слишком круто — разворот на месте
    e.speed = Math.max(0, e.speed - 3 * dtSec);
    turnToward(e, desired, dtSec, ELEPHANT.pivot);
    return 'moving';
  }
  turnToward(e, desired, dtSec, ELEPHANT.turn);
  const slow = Math.min(1, d / 1.3);
  const want = maxSpeed * Math.max(0.3, Math.cos(diff)) * Math.max(0.35, slow);
  e.speed += Math.max(-3 * dtSec, Math.min(1.6 * dtSec, want - e.speed));
  const step = e.speed * dtSec;
  const nx = e.x + Math.cos(e.heading) * step;
  const ny = e.y + Math.sin(e.heading) * step;
  if (elephantCanStand(nx, ny, r, mask)) {
    e.day.distance += step;
    e.x = nx;
    e.y = ny;
    if (dist(e, wp) < 0.3 && e.path.length > 1) e.path.shift();
    return 'moving';
  }
  // Упёрлись: попробовать соскользнуть вдоль препятствия
  for (const off of [0.5, -0.5, 1.0, -1.0]) {
    const h = e.heading + off;
    const sx = e.x + Math.cos(h) * step * 0.7;
    const sy = e.y + Math.sin(h) * step * 0.7;
    if (elephantCanStand(sx, sy, r, mask)) {
      e.x = sx;
      e.y = sy;
      return 'moving';
    }
  }
  e.speed = 0;
  e.path = [];
  e.pathGoal = null;
  return 'blocked';
}

// ---------------------------------------------------------------------------
// Шаг занятия
// ---------------------------------------------------------------------------

export function stepActivity(s: State, e: Elephant, dt: number, dtSec: number): void {
  const a = e.act;
  if (a.phase === 'go') {
    stepGo(s, e, dtSec);
    return;
  }
  e.speed = Math.max(0, e.speed - 2.5 * dtSec);
  const elapsed = s.t - a.doStart;
  const res = doStep(s, e, dt, dtSec, elapsed);
  if (res !== 'continue') finishActivity(s, e, res);
}

function stepGo(s: State, e: Elephant, dtSec: number): void {
  const a = e.act;
  const ap = a.target ? approachOf(s, e, a.target) : null;
  if (!ap) {
    finishActivity(s, e, 'fail');
    return;
  }
  // Спор за место у кормушки решается один раз — на подходе
  if (a.target?.t === 'slot' && a.flag === 0 && dist(e, ap) < 3.6) {
    if (!resolveSlot(s, e)) {
      finishActivity(s, e, 'fail');
      return;
    }
    a.flag = a.kind === 'carry' ? 0 : 1;
  }
  const res = moveTo(s, e, ap, speedFor(e), dtSec, ap.tol);
  // Нет продвижения к цели (заперто, место занято лежащим слоном, толкотня) — отказаться
  const d = dist(e, ap);
  if (d < e.bestDist - 0.25) {
    e.bestDist = d;
    e.stuck = 0;
  } else e.stuck += res === 'blocked' ? dtSec * 3 : dtSec;
  if (e.stuck > 7) {
    e.stuck = 0;
    finishActivity(s, e, 'fail');
    return;
  }
  if (res !== 'arrived') return;
  if (ap.face !== null) {
    const left = turnToward(e, ap.face, dtSec, ELEPHANT.pivot);
    if (left > 0.12) return;
  }
  a.phase = 'do';
  a.doStart = s.t;
  enterDo(s, e);
}

// Подход к занятому месту: старшая по рангу и уверенная оттесняет, младшая уступает
function resolveSlot(s: State, e: Elephant): boolean {
  const t = e.act.target;
  if (!t || t.t !== 'slot') return true;
  const o = slotTakenBy(s, e, t.station, t.slot);
  if (!o) return true;
  // Если соседка только идёт к месту, а мы ближе — пусть ищет другое
  if (o.act.phase === 'go' && dist(o, STATIONS[t.station].slots![t.slot]) > dist(e, STATIONS[t.station].slots![t.slot])) {
    finishActivity(s, o, 'fail');
    return true;
  }
  const T = e.profile.traits;
  const OT = o.profile.traits;
  if (rankOf(e) > rankOf(o) + 0.03 && T.confidence > 0.38 && !o.act.forced) {
    const yieldP = 0.55 + 0.35 * OT.nervousness - 0.35 * OT.persistence + 0.25 * (T.confidence - OT.confidence);
    if (random(s) < clamp(yieldP, 0.15, 0.95)) {
      displace(s, e, o);
      return true;
    }
  }
  return false;
}

// Старшая прогоняет младшую: оттесняет корпусом, а резкая и недружная — и пинком
export function displace(s: State, winner: Elephant, loser: Elephant, food = true): void {
  const away = Math.atan2(loser.y - winner.y, loser.x - winner.x);
  const r = radiusOf(loser);
  const mask = gateMask(s);
  let flee: Vec | null = null;
  for (const k of [0, 0.6, -0.6, 1.2, -1.2, 2]) {
    const p = { x: loser.x + Math.cos(away + k) * 4.5, y: loser.y + Math.sin(away + k) * 4.5 };
    if (elephantCanStand(p.x, p.y, r, mask)) {
      flee = p;
      break;
    }
  }
  const kick = winner.profile.traits.confidence > 0.68 && bond(s, winner.id, loser.id) < 0.05;
  const prevKey = loser.act.key;
  startActivity(s, loser, { kind: 'avoid', target: flee ? { t: 'point', x: flee.x, y: flee.y, face: null } : null, score: 1, dur: 0.5, key: 'avoid', signal: null, note: `уступила ${nameCase(winner.profile.name, 'dat')}`, aux: null }, true);
  loser.mem.cooldown[prevKey] = s.t + 12;
  loser.needs.stress = clamp(loser.needs.stress + (kick ? 12 : 6) + 10 * loser.profile.traits.nervousness, 0, 100);
  winner.day.conflicts++;
  loser.day.conflicts++;
  adjustBond(s, winner.id, loser.id, kick ? -0.05 : -0.025);
  const how = kick ? 'отогнала пинком' : 'оттеснила';
  log(s, kick ? 'warn' : 'info', `${winner.profile.name} ${how} ${nameCase(loser.profile.name, 'acc')}${food ? ' от еды' : ''}.`, {
    key: `displace:${winner.id}:${loser.id}`,
    cooldown: 40,
    elephantId: loser.id,
    x: loser.x,
    y: loser.y,
    kind: 'conflict',
    silent: !kick && loser.profile.traits.confidence > 0.4,
  });
  fx(kick ? 'kick' : 'trumpet', winner.x, winner.y, winner.id);
}

// Кто сейчас ест эту еду (в фазе «делать», рядом)
function eatingIt(s: State, e: Elephant, t: TargetRef): Elephant | null {
  for (const o of s.elephants) {
    if (o === e || o.act.kind !== 'eat' || o.act.phase !== 'do') continue;
    const ot = o.act.target;
    if (!ot) continue;
    if ((t.t === 'food' && ot.t === 'food' && ot.id === t.id) || (t.t === 'tub' && ot.t === 'tub' && ot.id === t.id)) return dist(o, e) < 5 ? o : null;
  }
  return null;
}

// Вход в фазу «делать»: разовые эффекты
function enterDo(s: State, e: Elephant): void {
  const a = e.act;
  switch (a.kind) {
    case 'urinate': {
      const p = rearPos(e);
      const spot = urinateAt(s, p.x, p.y);
      e.needs.bladder = 0;
      if (spot === 'drain') e.day.urineDrain++;
      else if (spot === 'tank') e.day.urineTank++;
      else if (spot === 'bedding') e.day.urineBedding++;
      else e.day.urineOutside++;
      fx('urine', p.x, p.y, e.id);
      if (spot === 'bedding') {
        log(s, 'warn', `${e.profile.name} помочилась на подстилку — мокрое пятно.`, { key: `urine:${e.id}`, cooldown: 15, elephantId: e.id, x: p.x, y: p.y, kind: 'mess' });
      } else if (spot === 'drain') {
        log(s, 'good', `${e.profile.name} справилась над стоком — подстилка сухая.`, { elephantId: e.id, x: p.x, y: p.y, silent: true });
      } else if (spot === 'tank') {
        log(s, 'good', `${e.profile.name} — в бак! Похвали её сейчас.`, { elephantId: e.id, x: p.x, y: p.y, kind: 'tank' });
      }
      break;
    }
    case 'defecate': {
      const p = rearPos(e, 1.25);
      const where = dropDung(s, p.x, p.y);
      e.needs.bowel = 0;
      e.day.dung++;
      fx('dung', p.x, p.y, e.id);
      if (where === 'pool') log(s, 'warn', `${e.profile.name} сходила прямо в бассейн — вода мутнеет.`, { key: `poolDung`, cooldown: 60, elephantId: e.id, x: p.x, y: p.y });
      break;
    }
    case 'sleep':
      e.lying = true;
      fx('lieDown', e.x, e.y, e.id);
      log(s, 'info', `${e.profile.name} легла спать.`, { elephantId: e.id, silent: true });
      break;
    case 'lie':
      e.lying = true;
      fx('lieDown', e.x, e.y, e.id);
      break;
    case 'signal':
      if (a.signal) beginSignal(s, e, a.signal);
      break;
    case 'follow':
      if (e.mem.call) e.mem.call.arrivedAt = s.t;
      break;
    case 'explore':
      if (a.target?.t === 'item') grabItem(s, e, a.target.id);
      break;
    case 'carry':
      enterCarry(s, e);
      break;
    case 'eat': {
      const t = a.target;
      if (t && (t.t === 'food' || t.t === 'tub')) {
        const o = eatingIt(s, e, t);
        if (o) {
          if (rankOf(e) > rankOf(o) + 0.03 && e.profile.traits.confidence > 0.4 && !o.act.forced) {
            displace(s, e, o);
            e.day.stolen++;
            o.day.robbed++;
          } else a.flag = 9; // уступила — ищет другое
        }
      }
      break;
    }
    default:
      break;
  }
}

// Унести охапку: у кормушки взять, на месте положить и есть
function enterCarry(s: State, e: Elephant): void {
  const a = e.act;
  const t = a.target;
  if (a.flag === 0 && t?.t === 'slot' && a.aux) {
    const fs = s.world.feeders[t.station as FeederId];
    const take = fs ? Math.min(fs.hay, FOOD.carryAmount) : 0;
    if (take < 1) {
      a.flag = 9;
      return;
    }
    fs.hay -= take;
    e.trunk = { kind: 'hay', amount: take };
    a.flag = 1;
    a.target = { t: 'point', x: a.aux.x, y: a.aux.y, face: null };
    a.phase = 'go';
    e.path = [];
    e.pathGoal = null;
    e.stuck = 0;
    e.bestDist = 1e6;
    fx('hayGrab', e.x, e.y, e.id);
    return;
  }
  if (a.flag === 1 && e.trunk.kind) {
    const h = headPos(e, 1.4);
    const kind = e.trunk.kind === 'fruit' ? 'fruit' : e.trunk.kind;
    const item = addFood(s, kind, h.x, h.y, e.trunk.amount, zoneOf(e));
    e.trunk = { kind: null, amount: 0 };
    bumpHabit(e, 'carry', 0.2);
    log(s, 'info', `${e.profile.name} унесла охапку сена и ест в сторонке.`, { key: `carry:${e.id}`, cooldown: 90, elephantId: e.id, silent: true });
    startActivity(s, e, { kind: 'eat', target: { t: 'food', id: item.id }, score: 0.9, dur: 15 + 25 * e.profile.traits.foodDrive, key: `eat:food:${item.id}`, signal: null, note: 'ест унесённое сено', aux: null });
    return;
  }
  a.flag = 9;
}

const ITEM_NAMES: Record<string, string> = {
  shovel: 'лопату',
  rake: 'грабли',
  broom: 'метлу',
  mop: 'швабру',
  brush: 'щётку',
  hay: 'тюк сена',
  straw: 'тюк соломы',
  ration: 'ведро с овощами',
  browse: 'охапку веток',
  bamboo: 'бамбук',
  sawdust: 'мешок опилок',
  tank: 'бак',
  washKit: 'ведро для мытья',
  chem: 'средство для поилок',
  porridge: 'ведро каши',
};

function grabItem(s: State, e: Elephant, id: number): void {
  const it = s.world.items.find((x) => x.id === id);
  if (!it) return;
  const areas = reachableAreas(s, e);
  const inside = zoneAt(it.x, it.y) !== null;
  if (!inside && !grabbableFromArea(it.x, it.y, areas)) return;
  const h = headPos(e, 1.2);
  const zone = zoneOf(e);
  if (!inside) {
    // Хобот через решётку: вещь оказывается внутри
    s.world.items = s.world.items.filter((x) => x !== it);
    if (it.kind === 'hay') addFood(s, 'hay', h.x, h.y, FOOD.bale, zone);
    else if (it.kind === 'straw') addFood(s, 'straw', h.x, h.y, FOOD.bale * 0.6, zone);
    else if (it.kind === 'ration') addFood(s, 'produce', h.x, h.y, it.load * FOOD.portionHunger, zone);
    else if (it.kind === 'browse') addFood(s, 'browse', h.x, h.y, 1, zone);
    else if (it.kind === 'bamboo') addFood(s, 'bamboo', h.x, h.y, 1, zone);
    else if (it.kind === 'porridge') addFood(s, 'produce', h.x, h.y, it.load * FOOD.porridgeHunger, zone);
    else if (it.kind === 'sawdust') addLitter(s, h.x, h.y, 0.3, 1.2);
    else s.world.items.push({ ...it, x: h.x, y: h.y, aux: it.kind === 'tank' ? 0 : it.aux });
    log(s, 'warn', `${e.profile.name} утащила через решётку ${ITEM_NAMES[it.kind] ?? 'вещь'}.`, { key: `grab:${e.id}`, cooldown: 10, elephantId: e.id, x: h.x, y: h.y, kind: 'grab' });
  } else {
    // Внутри — перекладывает с места на место
    const a = range(s, 0, Math.PI * 2);
    const nx = it.x + Math.cos(a) * range(s, 1, 2.5);
    const ny = it.y + Math.sin(a) * range(s, 1, 2.5);
    if (areaAt(nx, ny) === areaAt(it.x, it.y) && elephantCanStand(nx, ny, 0.3, gateMask(s))) {
      it.x = nx;
      it.y = ny;
    }
  }
}

type DoResult = 'continue' | 'done' | 'fail';

function doStep(s: State, e: Elephant, dt: number, dtSec: number, elapsed: number): DoResult {
  const a = e.act;
  const n = e.needs;
  const T = e.profile.traits;
  const w = s.world;
  switch (a.kind) {
    case 'idle':
    case 'rest':
      return elapsed >= a.dur ? 'done' : 'continue';
    case 'wander':
      return elapsed >= 0.4 ? 'done' : 'continue';
    case 'avoid':
      return 'done';
    case 'carry':
      return a.flag === 9 ? 'fail' : 'done';
    case 'urinate':
    case 'defecate':
      return elapsed >= a.dur ? 'done' : 'continue';
    case 'explore':
      n.boredom -= 0.55 * dt;
      bumpHabit(e, a.target?.t === 'item' ? 'item' : 'explore', 0.004 * dt);
      return elapsed >= a.dur ? 'done' : 'continue';
    case 'eat':
      return stepEat(s, e, dt, elapsed);
    case 'drink': {
      const t = a.target;
      let available = true;
      if (t?.t === 'slot' && t.station in w.troughs) {
        const tr = w.troughs[t.station as TroughId];
        if (tr.level <= 0 || tr.chem > 0.05) available = false;
        else {
          tr.level = Math.max(0, tr.level - WATER.use * dt);
          // С хобота, перемазанного сеном, в воду попадает сор
          const recent = s.t - e.mem.lastAte < 20 ? 1 : 0.15;
          tr.debris = clamp(tr.debris + WATER.debrisDrink * recent * dt * 0.25);
        }
      } else if (!inPool(headPos(e, 2.2).x, headPos(e, 2.2).y, 0.6) && !inPool(e.x, e.y, 1.5)) available = false;
      if (!available) return n.thirst > 30 ? 'fail' : 'done';
      const before = n.thirst;
      n.thirst = Math.max(0, n.thirst - WATER.drink * dt);
      n.bladder = Math.min(100, n.bladder + (before - n.thirst) * NEEDS.drinkToBladder);
      if (random(s) < dt * 0.15) fx('drink', e.x, e.y, e.id);
      return n.thirst < 6 || elapsed >= a.dur ? 'done' : 'continue';
    }
    case 'sleep': {
      if (!e.lying) e.lying = true;
      const morning = sleepPressureLow(s);
      if ((n.fatigue < 6 && elapsed > 40) || elapsed >= a.dur || (morning && elapsed > 25 && e.tipsy < 0.3)) return 'done';
      if (random(s) < dt * 0.04) fx('snore', e.x, e.y, e.id);
      return 'continue';
    }
    case 'lie':
      if (!e.lying) e.lying = true;
      n.fatigue = Math.max(0, n.fatigue - NEEDS.fatigueRest * 0.6 * dt);
      return elapsed >= a.dur ? 'done' : 'continue';
    case 'play':
      return stepPlay(s, e, dt, dtSec, elapsed);
    case 'bathe':
      if (!inPool(e.x, e.y)) return elapsed > 1 ? 'done' : 'continue';
      e.wet = Math.min(1, e.wet + 0.3 * dt);
      e.body.side = Math.max(0, e.body.side - 0.02 * dt);
      e.body.legs = Math.max(0, e.body.legs - 0.03 * dt);
      e.body.hay = Math.max(0, e.body.hay - 0.03 * dt);
      n.boredom -= 0.7 * dt;
      w.pool.dirt = Math.min(1, w.pool.dirt + WATER.poolDirtBathe * dt);
      bumpHabit(e, 'pool', 0.008 * dt);
      if (random(s) < dt * 0.5) fx('splash', e.x + range(s, -1, 1), e.y + range(s, -1, 1), e.id);
      return elapsed >= a.dur ? 'done' : 'continue';
    case 'dust':
      e.dust = Math.min(1, e.dust + 0.32 * dt);
      e.wet = Math.max(0, e.wet - 0.1 * dt);
      n.boredom -= 0.4 * dt;
      bumpHabit(e, 'dust', 0.02 * dt);
      if (random(s) < dt * 1.2) fx('dustThrow', e.x, e.y, e.id);
      return elapsed >= a.dur ? 'done' : 'continue';
    case 'toss': {
      const t = a.target;
      const f = t?.t === 'food' ? w.food.find((x) => x.id === t.id) : undefined;
      if (!f || f.amount <= 0.3) return 'done';
      f.amount -= FOOD.tossUse * dt;
      e.body.hay = clamp(e.body.hay + BODY.hayToss * dt * 0.4);
      n.boredom -= 0.6 * dt;
      n.heat = Math.max(0, n.heat - 0.25 * dt);
      if (random(s) < dt * 0.5) {
        const h = headPos(e, 1.2);
        addLitter(s, h.x + range(s, -1, 1), h.y + range(s, -1, 1), 0.06, 1.0);
        fx('toss', h.x, h.y, e.id);
      }
      bumpHabit(e, 'toss', 0.01 * dt);
      if (f.amount <= 0.3) {
        w.food = w.food.filter((x) => x !== f);
        return 'done';
      }
      return elapsed >= a.dur ? 'done' : 'continue';
    }
    case 'shake': {
      const t = a.target;
      if (t?.t !== 'obj') return 'done';
      n.boredom -= 0.5 * dt;
      if (random(s) < dt * 1.5) fx('shake', t.x, t.y, e.id);
      if (elapsed < a.dur) return 'continue';
      const want = 2 + Math.floor(random(s) * (3 + 3 * T.persistence));
      const fell = dropFruit(s, t.id, want);
      bumpHabit(e, 'shake', 0.15);
      if (fell) log(s, 'info', `${e.profile.name} трясёт яблоню — нападали яблоки (${fell}).`, { key: `shake:${e.id}`, cooldown: 60, elephantId: e.id, x: t.x, y: t.y, silent: true });
      return 'done';
    }
    case 'manipulate':
      return stepManipulate(s, e, dt, elapsed);
    case 'socialize': {
      const o = a.target?.t === 'el' ? elephantById(s, a.target.id) : undefined;
      if (!o) return 'done';
      const d = dist(e, o);
      if (d > 12) return 'done';
      const through = !reachableAreas(s, e).includes(areaOf(o));
      if (d > (through ? 5.5 : 3.8)) {
        if (!through) moveTo(s, e, { x: o.x, y: o.y }, ELEPHANT.speedAmble, dtSec, 3.2);
        return elapsed >= a.dur + 3 ? 'done' : 'continue';
      }
      n.social -= (through ? 1.3 : 2) * dt;
      n.boredom -= 0.35 * dt;
      adjustBond(s, e.id, o.id, 0.0015 * dt);
      if (random(s) < dt * 0.3) fx('greet', (e.x + o.x) / 2, (e.y + o.y) / 2, e.id);
      return elapsed >= a.dur ? 'done' : 'continue';
    }
    case 'signal': {
      if (!e.signal) return 'done';
      const clarity = 0.25 + 0.75 * T.expressiveness;
      const style = e.profile.habits.signal;
      // У каждой свой ритм и жест: топот, урчание, пристальный взгляд, ожидание у ворот, выпрашивание
      if (s.t - e.mem.lastSignalFx > 1.4 - 0.8 * clarity && random(s) < dt * 2) {
        e.mem.lastSignalFx = s.t;
        const kind = style === 'stomp' ? `stomp:${e.profile.habits.foot}` : style === 'rumble' ? 'rumble' : style === 'beg' ? 'beg' : style === 'gate' ? 'rumbleLow' : 'stare';
        fx(kind, e.x, e.y, e.id);
        if (T.expressiveness > 0.7 && random(s) < 0.15) fx('trumpet', e.x, e.y, e.id);
      }
      return 'continue';
    }
    case 'seekKeeper': {
      const k = keeperContact(s);
      const held = s.keeper.held;
      const carryingFood = held && ['ration', 'hay', 'browse', 'bamboo', 'porridge', 'tub'].includes(held.kind);
      if (!k || !carryingFood || !reachableAreas(s, e).includes(k.area)) return 'done';
      if (dist(e, k.spot) > 1.2) {
        moveTo(s, e, k.spot, ELEPHANT.speedPurpose, dtSec, 0.6);
        return elapsed >= a.dur + 4 ? 'done' : 'continue';
      }
      turnToward(e, k.face, dtSec, ELEPHANT.pivot);
      return elapsed >= a.dur ? 'done' : 'continue';
    }
    case 'follow': {
      const call = e.mem.call;
      if (!call) return 'done';
      if (call.rewarded && elapsed > 0.5) return 'done';
      if (call.why === 'toilet') {
        // Стоит боком у стенки и ждёт команды; совсем приспичит — справится сама
        if (n.bladder > 92) {
          startActivity(s, e, { kind: 'urinate', target: null, score: 1, dur: 1.2, key: 'urinate', signal: null, note: 'мочится у стенки', aux: null }, true);
          e.mem.call = { ...call, arrivedAt: s.t };
          return 'continue';
        }
        return elapsed >= 7 ? 'done' : 'continue';
      }
      return elapsed >= LEARN.rewardWindow ? 'done' : 'continue';
    }
    case 'pace': {
      const target = a.aux && a.target?.t === 'point' ? a.target : null;
      if (!target || !a.aux) return 'done';
      const goal = a.flag === 0 ? a.aux : { x: target.x, y: target.y };
      const r = moveTo(s, e, goal, ELEPHANT.speedAmble, dtSec, 0.5);
      if (r !== 'moving') a.flag = a.flag === 0 ? 1 : 0;
      n.boredom -= 0.05 * dt;
      if (elapsed >= a.dur) {
        log(s, 'warn', `${e.profile.name} долго ходила взад-вперёд — это признак стресса или скуки.`, { key: `pace:${e.id}`, cooldown: 120, elephantId: e.id, x: e.x, y: e.y });
        return 'done';
      }
      return 'continue';
    }
  }
}

function sleepPressureLow(s: State): boolean {
  const m = ((s.t % 1440) + 1440) % 1440;
  return m >= 6 * 60 && m < 20 * 60;
}

export function bumpHabit(e: Elephant, key: string, v: number): void {
  e.mem.habit[key] = clamp((e.mem.habit[key] ?? 0) + v);
}

function satiety(e: Elephant): number {
  return 12 + 26 * (1 - e.profile.traits.foodDrive);
}

// Сдвинуть таз хоботом (не выкатывая из отсека)
function nudgeTub(s: State, tub: Tub, ang: number, d: number): void {
  const nx = tub.x + Math.cos(ang) * d;
  const ny = tub.y + Math.sin(ang) * d;
  if (areaAt(nx, ny) === areaAt(tub.x, tub.y) && elephantCanStand(nx, ny, 0.35, 0)) {
    tub.x = nx;
    tub.y = ny;
    tub.heading += range(s, -0.4, 0.4);
  }
}

function stepEat(s: State, e: Elephant, dt: number, elapsed: number): DoResult {
  const a = e.act;
  const n = e.needs;
  const T = e.profile.traits;
  const w = s.world;
  const t = a.target;
  if (!t || a.flag === 9) return 'fail';
  const before = n.hunger;
  const speed = 0.85 + 0.35 * T.foodDrive;
  if (t.t === 'slot' && t.station in w.feeders) {
    const fs = w.feeders[t.station as FeederId];
    const h = headPos(e, 1.7);
    if (fs.hay > 0) {
      n.hunger = Math.max(0, n.hunger - FOOD.hayEat * speed * dt);
      fs.hay = Math.max(0, fs.hay - FOOD.hayUse * speed * dt);
      n.boredom -= 0.08 * dt;
      // Солому из той же кормушки выдёргивают и бросают под ноги
      if (fs.straw > 0 && random(s) < dt * 0.12 * (0.5 + T.playfulness)) {
        const pull = Math.min(fs.straw, 1.0);
        fs.straw -= pull;
        addLitter(s, h.x + range(s, -0.8, 0.8), h.y - range(s, 0.3, 1.4), 0.12, 1.0);
      }
      // Играючи подбрасывает клок сена на спину — немного рассыпается
      if (random(s) < dt * 0.05 * (0.3 + T.playfulness)) {
        e.body.hay = clamp(e.body.hay + BODY.hayToss);
        fs.hay = Math.max(0, fs.hay - 0.5);
        addLitter(s, h.x, h.y - 0.8, 0.05, 1.2);
        fx('toss', h.x, h.y, e.id);
      }
    } else if (fs.straw > 0) {
      n.hunger = Math.max(0, n.hunger - FOOD.strawEat * speed * dt);
      fs.straw = Math.max(0, fs.straw - FOOD.strawUse * dt);
      if (random(s) < dt * 0.25) {
        const pull = Math.min(fs.straw, 1.2);
        fs.straw -= pull;
        addLitter(s, h.x + range(s, -1, 1), h.y - range(s, 0.3, 1.6), 0.14, 1.1);
      }
      n.boredom -= 0.05 * dt;
      if (n.hunger < 42 && elapsed > 4) return 'done'; // солому доедать не будет
    } else return n.hunger > 55 ? 'fail' : 'done';
  } else if (t.t === 'tub') {
    const tub = tubById(s, t.id);
    if (!tub || tub.where !== 'floor' || tub.broken) return 'done';
    const kg = tubKg(tub);
    if (kg <= 0.05) return 'done';
    const take = Math.min(kg, FOOD.vegKgPerMin * speed * dt);
    for (const k of VEG_KINDS) tub.veg[k] = Math.max(0, tub.veg[k] - take * (tub.veg[k] / kg));
    n.hunger = Math.max(0, n.hunger - take * FOOD.vegHunger);
    if (tub.owner === e.id) e.day.tubKg += take;
    else if (a.flag !== 2) {
      a.flag = 2;
      e.day.stolen++;
      const owner = s.elephants.find((o) => o.id === tub.owner);
      if (owner) {
        owner.day.robbed++;
        log(s, 'info', `${e.profile.name} ест из таза ${nameCase(owner.profile.name, 'gen')}.`, { key: `tubSteal:${e.id}`, cooldown: 60, elephantId: owner.id, x: tub.x, y: tub.y, silent: true });
      }
    }
    if (random(s) < dt * 0.4) nudgeTub(s, tub, e.heading + range(s, -0.7, 0.7), 0.15);
    n.boredom -= 0.15 * dt;
    if (n.hunger < satiety(e) - 4 && elapsed > 4) return 'done';
  } else if (t.t === 'food') {
    const f = w.food.find((x) => x.id === t.id);
    if (!f || f.kind === 'remains') return 'done';
    const r = eatFoodItem(s, e, f, dt, speed);
    if (r !== 'continue') return r;
  } else if (t.t === 'obj' && t.id === 'drum') {
    if (w.drum <= 0) return 'done';
    const use = Math.min(w.drum, FOOD.drumUse * dt * (0.7 + 0.6 * T.persistence));
    w.drum -= use;
    n.hunger = Math.max(0, n.hunger - FOOD.drumEat * dt);
    n.boredom -= 0.85 * dt;
    bumpHabit(e, 'drum', 0.006 * dt);
    if (random(s) < dt * 0.4) fx('drum', DRUM.x, DRUM.y, e.id);
  } else if (t.t === 'point') {
    // Голодная жуёт подстилку под ногами
    const i = cellOf(headPos(e, 1.4).x, headPos(e, 1.4).y);
    const c = w.cells;
    if (c.bedding[i] < 0.05) return 'done';
    const before2 = c.bedding[i];
    c.bedding[i] = Math.max(0, c.bedding[i] - 0.04 * dt);
    if (Math.floor(before2 * 10) !== Math.floor(c.bedding[i] * 10)) touchCells(s);
    n.hunger = Math.max(0, n.hunger - FOOD.beddingEat * dt);
    if (n.hunger < 52) return 'done';
  } else return 'done';
  const eaten = before - n.hunger;
  n.bowel = Math.min(100, n.bowel + eaten * NEEDS.eatToBowel);
  e.day.ate += eaten;
  e.mem.lastAte = s.t;
  if (random(s) < dt * 0.2) fx('munch', e.x, e.y, e.id);
  if (n.hunger < satiety(e) - (elapsed < 6 ? 6 : 0) && elapsed > 3 && t.t !== 'tub') return 'done';
  return elapsed >= a.dur ? 'done' : 'continue';
}

function eatFoodItem(s: State, e: Elephant, f: FoodItem, dt: number, speed: number): DoResult {
  const n = e.needs;
  const w = s.world;
  switch (f.kind) {
    case 'produce': {
      const eat = Math.min(f.amount, 5 * speed * dt);
      f.amount -= eat;
      n.hunger = Math.max(0, n.hunger - eat);
      n.boredom -= 0.5 * dt;
      bumpHabit(e, 'scatter', 0.01 * dt);
      if (f.amount <= 0.01) {
        w.food = w.food.filter((x) => x !== f);
        return 'done';
      }
      return 'continue';
    }
    case 'fruit': {
      const eat = Math.min(f.amount, 2.2 * speed * dt);
      f.amount -= eat;
      n.hunger = Math.max(0, n.hunger - eat);
      if (f.amount <= 0.01) {
        const stage = fruitStage(f.rot);
        w.food = w.food.filter((x) => x !== f);
        if (stage === 'ferment' || stage === 'rotten') {
          const before = e.tipsy;
          e.tipsy = clamp(e.tipsy + FOOD.tipsyPerFruit * (stage === 'rotten' ? 0.5 : 1));
          e.day.fermented++;
          if (stage === 'rotten') n.stress = Math.min(100, n.stress + 3 * e.profile.traits.sensitivity);
          if (before < 0.35 && e.tipsy >= 0.35) {
            log(s, 'warn', `${e.profile.name} наелась забродивших яблок и пошатывается.`, { key: `tipsy:${e.id}`, cooldown: 240, elephantId: e.id, x: e.x, y: e.y, kind: 'tipsy' });
          }
        }
        return 'done';
      }
      return 'continue';
    }
    case 'hay':
    case 'straw': {
      const straw = f.kind === 'straw';
      n.hunger = Math.max(0, n.hunger - (straw ? FOOD.strawEat : FOOD.hayEat) * speed * dt);
      f.amount -= (straw ? FOOD.strawUse : FOOD.hayUse) * speed * dt;
      if (straw && random(s) < dt * 0.5) addLitter(s, f.x + range(s, -1, 1), f.y + range(s, -1, 1), 0.08, 1.0);
      if (f.amount <= 0) {
        w.food = w.food.filter((x) => x !== f);
        return 'done';
      }
      if (straw && n.hunger < 45) return 'done';
      return 'continue';
    }
    case 'browse':
    case 'bamboo': {
      const bamboo = f.kind === 'bamboo';
      n.hunger = Math.max(0, n.hunger - (bamboo ? FOOD.bambooEat : FOOD.browseEat) * dt);
      n.boredom -= (bamboo ? 0.75 : 0.65) * dt;
      f.amount -= (bamboo ? FOOD.bambooUse : FOOD.browseUse) * dt;
      bumpHabit(e, bamboo ? 'bamboo' : 'browse', 0.01 * dt);
      if (random(s) < dt * 0.3) fx(bamboo ? 'bamboo' : 'munch', f.x, f.y, e.id);
      if (f.amount <= 0) {
        f.kind = 'remains';
        f.amount = 1;
        return 'done';
      }
      return 'continue';
    }
    default:
      return 'done';
  }
}

function stepPlay(s: State, e: Elephant, dt: number, dtSec: number, elapsed: number): DoResult {
  const a = e.act;
  const n = e.needs;
  const T = e.profile.traits;
  const t = a.target;
  if (!t) return 'done';
  n.fatigue += 0.04 * dt;
  if (t.t === 'obj' && t.id === 'ball') {
    const b = s.world.ball;
    const h = headPos(e, 1.65);
    if (dist(h, b) < 0.95) {
      const dir = e.heading + range(s, -0.5, 0.5);
      kickBall(s, Math.cos(dir), Math.sin(dir), 1.1 + 1.6 * T.playfulness * range(s, 0.6, 1));
      e.speed *= 0.5;
    } else {
      const goal = toward(e, b, 1.55 * e.profile.look.size);
      moveTo(s, e, goal, ELEPHANT.speedTrot * (0.65 + 0.35 * T.playfulness), dtSec, 0.3);
    }
    n.boredom -= 1.3 * dt;
    bumpHabit(e, 'ball', 0.012 * dt);
    return elapsed >= a.dur ? 'done' : 'continue';
  }
  if (t.t === 'obj' && t.id === 'tire') {
    n.boredom -= 1.1 * dt;
    bumpHabit(e, 'tire', 0.012 * dt);
    if (random(s) < dt * 0.8) fx('tire', TIRE.x, TIRE.y, e.id);
    return elapsed >= a.dur ? 'done' : 'continue';
  }
  if (t.t === 'el') {
    const o = elephantById(s, t.id);
    if (!o || o.lying) return 'done';
    const d = dist(e, o);
    if (d > 4.2) {
      moveTo(s, e, { x: o.x, y: o.y }, ELEPHANT.speedTrot * 0.7, dtSec, 3);
      return elapsed >= a.dur + 3 ? 'done' : 'continue';
    }
    turnToward(e, Math.atan2(o.y - e.y, o.x - e.x), dtSec, ELEPHANT.pivot);
    const mutual = o.act.kind === 'play' && o.act.target?.t === 'el' && o.act.target.id === e.id;
    if (!mutual && elapsed > 2) return 'done';
    n.boredom -= 1.4 * dt;
    n.social -= 1.2 * dt;
    adjustBond(s, e.id, o.id, 0.002 * dt);
    bumpHabit(e, 'social', 0.006 * dt);
    if (random(s) < dt * 0.5) fx('spar', (e.x + o.x) / 2, (e.y + o.y) / 2, e.id);
    return elapsed >= a.dur ? 'done' : 'continue';
  }
  return 'done';
}

// Шалости хоботом: шланг тянут и грызут, пустой таз катают и ломают — по характеру
function stepManipulate(s: State, e: Elephant, dt: number, elapsed: number): DoResult {
  const a = e.act;
  const n = e.needs;
  const T = e.profile.traits;
  const w = s.world;
  const t = a.target;
  if (t?.t === 'obj' && t.id === 'hose') {
    const hose = w.hose;
    if (hose.state === 'reel') return 'done';
    const h = headPos(e, 1.7);
    // Ближайшая точка шланга у хобота
    const pts = [...hose.path, hose.end];
    let best = -1;
    let bestD = 2.4;
    for (let i = 1; i < pts.length; i++) {
      const d = dist(pts[i], h);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return 'done';
    n.boredom -= 0.7 * dt;
    hose.damage = clamp(hose.damage + HOSE.chew * (0.2 + 1.3 * T.mischief) * dt);
    // Конец шланга тянет к себе — он заползает за решётку
    if (best === pts.length - 1 && hose.state === 'floor') {
      const end = hose.end;
      const k = Math.min(1, (0.3 * dt) / Math.max(0.01, bestD));
      end.x += (h.x - end.x) * k;
      end.y += (h.y - end.y) * k;
    }
    if (random(s) < dt * 0.8) fx('chew', h.x, h.y, e.id);
    bumpHabit(e, 'hose', 0.02 * dt);
    if (hose.damage >= HOSE.cutAt) {
      hose.length = Math.max(0, hose.length - HOSE.cutLength);
      hose.chewed++;
      hose.damage = 0.4;
      w.checks.hoseIncidents++;
      const broken = hose.length < HOSE.minLength;
      log(s, 'bad', broken ? `${e.profile.name} перекусила шланг — им больше не пользоваться, нужен новый.` : `${e.profile.name} прокусила шланг: он течёт и стал на ${HOSE.cutLength} м короче.`, {
        key: `hoseCut:${e.id}`,
        cooldown: 5,
        elephantId: e.id,
        x: h.x,
        y: h.y,
        kind: 'hoseCut',
      });
      return 'done';
    }
    return elapsed >= a.dur ? 'done' : 'continue';
  }
  if (t?.t === 'tub') {
    const tub = tubById(s, t.id);
    if (!tub || tub.where !== 'floor' || tub.broken) return 'done';
    const h = headPos(e, 1.5);
    if (dist(h, tub) > 2.4) return 'done';
    n.boredom -= 0.8 * dt;
    if (random(s) < dt * 0.8) {
      nudgeTub(s, tub, e.heading + range(s, -0.9, 0.9), 0.4);
      fx('tub', tub.x, tub.y, e.id);
    }
    const harm = (T.mischief > 0.5 ? 0.06 * (T.mischief - 0.3) : 0.006) * (1 + 0.5 * T.playfulness);
    tub.damage = clamp(tub.damage + harm * dt);
    bumpHabit(e, 'tub', 0.015 * dt);
    if (tub.damage >= 1) {
      tub.broken = true;
      w.checks.tubsBroken++;
      for (let i = 0; i < 3; i++) w.items.push({ id: s.nextId++, kind: 'shard', x: tub.x + range(s, -0.8, 0.8), y: tub.y + range(s, -0.8, 0.8), load: 1, aux: 0, owner: tub.owner });
      const owner = s.elephants.find((o) => o.id === tub.owner);
      log(s, 'warn', `${e.profile.name} раскрошила пустой таз${owner && owner !== e ? ` ${nameCase(owner.profile.name, 'gen')}` : ''} — осколки надо убрать.`, {
        key: `tubBreak:${tub.id}`,
        cooldown: 5,
        elephantId: e.id,
        x: tub.x,
        y: tub.y,
        kind: 'tubBreak',
      });
      fx('crack', tub.x, tub.y, e.id);
      return 'done';
    }
    return elapsed >= a.dur ? 'done' : 'continue';
  }
  return 'done';
}

// ---------------------------------------------------------------------------
// Внешние запуски: принудительные действия
// ---------------------------------------------------------------------------

export function forceElimination(s: State, e: Elephant, kind: 'urinate' | 'defecate'): void {
  const c: Candidate = { kind, target: null, score: 2, dur: kind === 'urinate' ? 1.2 : 1, key: kind, signal: null, note: kind === 'urinate' ? 'мочится' : 'испражняется', aux: null };
  if (e.signal && e.act.kind === 'signal') {
    // Не дождалась ответа — справляется где стоит
    const sig = e.signal;
    e.signal = null;
    e.mem.cooldown[`signal:${sig.kind}`] = s.t + 30;
  }
  startActivity(s, e, c, true);
}

export function spook(s: State, e: Elephant, from: Vec, why: string): void {
  const away = Math.atan2(e.y - from.y, e.x - from.x);
  const r = radiusOf(e);
  const mask = gateMask(s);
  const area = areaOf(e);
  let flee: Vec | null = null;
  for (const k of [0, 0.5, -0.5, 1.1, -1.1]) {
    const p = { x: e.x + Math.cos(away + k) * 5, y: e.y + Math.sin(away + k) * 5 };
    if (areaAt(p.x, p.y) === area && elephantCanStand(p.x, p.y, r, mask)) {
      flee = p;
      break;
    }
  }
  startActivity(s, e, { kind: 'avoid', target: flee ? { t: 'point', x: flee.x, y: flee.y, face: null } : null, score: 1.5, dur: 0.5, key: 'avoid', signal: null, note: why, aux: null }, true);
}

export function respondToCall(s: State, e: Elephant, spot: Vec, face: number, note: string, why: 'call' | 'toilet' | 'lie' = 'call'): void {
  // Зов ждёт, пока она дойдёт: через оба стойла идти дольше, чем от решётки
  const walk = dist(e, spot) * 1.3;
  e.mem.call = { until: s.t + 12 + walk, x: spot.x, y: spot.y, arrivedAt: -1, rewarded: false, why };
  const c: Candidate = { kind: 'follow', target: { t: 'point', x: spot.x, y: spot.y, face }, score: 1.2, dur: LEARN.rewardWindow, key: 'follow', signal: null, note, aux: null };
  const keepCall = e.mem.call;
  startActivity(s, e, c, true);
  e.mem.call = keepCall;
}

// Лечь по просьбе кипера на столько минут (если согласилась)
export function lieOnCommand(s: State, e: Elephant, minutes: number): void {
  startActivity(s, e, { kind: 'lie', target: null, score: 1.1, dur: minutes, key: 'lie', signal: null, note: 'лежит по просьбе кипера', aux: null }, true);
  e.mem.call = { until: s.t + minutes, x: e.x, y: e.y, arrivedAt: s.t, rewarded: false, why: 'lie' };
}
