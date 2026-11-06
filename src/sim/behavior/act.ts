// Исполнение поведения: подход к цели, поворот, само действие и его последствия.
// Каждое занятие — состояние конечного автомата с фазами «идти» и «делать».

import { ELEPHANT, FOOD, LEARN, NEEDS, WATER } from '../../data/balance';
import { DRUM, STATIONS, TIRE, TREES, zoneAt, type ZoneId } from '../../data/facility';
import { fx, log } from '../events';
import { angleDiff, dist, inPool } from '../geometry';
import { elephantCanStand, elephantRoute, nearestStandable } from '../nav';
import { clamp, random, range } from '../rng';
import type { Activity, Elephant, State, TargetRef, Vec } from '../types';
import { addFood, dropDung, kickBall, troughSpoiled, urinateAt } from '../world';
import type { Candidate } from './options';
import { grabbableFromZone } from './options';
import { adjustBond, elephantById, headPos, keeperContact, radiusOf, rankOf, rearPos, slotTakenBy, zoneOf } from './perceive';
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

// Выход из занятия: снять сигнал, встать, записать откат
function leaveActivity(s: State, e: Elephant, outcome: 'done' | 'fail' | 'interrupted'): void {
  const a = e.act;
  if (e.lying && a.kind === 'sleep') {
    e.lying = false;
    fx('standUp', e.x, e.y, e.id);
  }
  if (a.kind === 'signal' && e.signal && outcome !== 'done') {
    // Сигнал брошен на полпути (например, приспичило) — без последствий для научения
    e.signal = null;
  }
  const cd = cooldownFor(e, a, outcome);
  if (cd > 0) e.mem.cooldown[a.key] = s.t + cd;
}

function cooldownFor(e: Elephant, a: Activity, outcome: 'done' | 'fail' | 'interrupted'): number {
  if (a.kind === 'idle' || a.kind === 'wander' || a.kind === 'avoid' || a.kind === 'follow') return 0;
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

function standableNear(e: Elephant, p: Vec, gateOpen: boolean): Vec | null {
  const r = radiusOf(e);
  if (elephantCanStand(p.x, p.y, r, gateOpen)) return p;
  return nearestStandable(p, r + 0.05, gateOpen);
}

export function approachOf(s: State, e: Elephant, t: TargetRef): Approach | null {
  const gate = s.world.gateOpen;
  const reach = 1.75 * e.profile.look.size;
  switch (t.t) {
    case 'point': {
      const p = standableNear(e, { x: t.x, y: t.y }, gate);
      return p ? { x: p.x, y: p.y, face: t.face, tol: 0.35 } : null;
    }
    case 'slot': {
      const p = STATIONS[t.station].slots![t.slot];
      return { x: p.x, y: p.y, face: p.face, tol: 0.3 };
    }
    case 'gate':
      return t.side === 'barn' ? { x: 20, y: 22.45, face: -Math.PI / 2, tol: 0.4 } : { x: 20, y: 17.55, face: Math.PI / 2, tol: 0.4 };
    case 'obj': {
      if (t.id === 'pool' || t.id === 'dust') return { x: t.x, y: t.y, face: null, tol: 0.6 };
      if (t.id === 'tire') return { x: TIRE.x, y: TIRE.y + 1.95, face: -Math.PI / 2, tol: 0.35 };
      if (t.id === 'drum') return { x: DRUM.x + 1.95, y: DRUM.y, face: Math.PI, tol: 0.35 };
      if (t.id === 'ball') {
        const b = s.world.ball;
        const p = standableNear(e, toward(e, b, reach), gate);
        return p ? { x: p.x, y: p.y, face: Math.atan2(b.y - p.y, b.x - p.x), tol: 0.6 } : null;
      }
      const tree = TREES.find((tr) => tr.id === t.id);
      const center = tree ? { x: tree.x, y: tree.y } : { x: t.x, y: t.y };
      const p = standableNear(e, toward(e, center, reach + 0.4), gate);
      return p ? { x: p.x, y: p.y, face: Math.atan2(center.y - p.y, center.x - p.x), tol: 0.5 } : null;
    }
    case 'food': {
      const f = s.world.food.find((x) => x.id === t.id);
      if (!f) return null;
      const p = standableNear(e, toward(e, f, reach), gate);
      return p ? { x: p.x, y: p.y, face: Math.atan2(f.y - p.y, f.x - p.x), tol: 0.45 } : null;
    }
    case 'item': {
      const it = s.world.items.find((x) => x.id === t.id);
      if (!it) return null;
      if (zoneAt(it.x, it.y)) {
        const p = standableNear(e, toward(e, it, reach), gate);
        return p ? { x: p.x, y: p.y, face: Math.atan2(it.y - p.y, it.x - p.x), tol: 0.45 } : null;
      }
      // Вещь за решёткой: встать вплотную к линии и тянуться хоботом
      const line = it.y > 25 ? 30 : 20;
      const p = standableNear(e, { x: it.x, y: line - 2.1 }, gate);
      return p ? { x: p.x, y: p.y, face: Math.PI / 2, tol: 0.4 } : null;
    }
    case 'el': {
      const o = elephantById(s, t.id);
      if (!o) return null;
      const side = Math.atan2(e.y - o.y, e.x - o.x);
      const want = { x: o.x + Math.cos(side) * 2.7, y: o.y + Math.sin(side) * 2.7 };
      const p = standableNear(e, want, gate);
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
  const base = 0.85 + 0.3 * T.activity;
  switch (a.kind) {
    case 'avoid':
      return ELEPHANT.speedTrot;
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
  const gate = s.world.gateOpen;
  const r = radiusOf(e);
  const d = dist(e, goal);
  if (d <= tol) {
    e.speed = Math.max(0, e.speed - 2.5 * dtSec);
    return 'arrived';
  }
  if (!e.pathGoal || dist(e.pathGoal, goal) > 0.4 || !e.path.length) {
    const route = elephantRoute(e, goal, r, gate);
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
  const desired = Math.atan2(wp.y - e.y, wp.x - e.x);
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
  if (elephantCanStand(nx, ny, r, gate)) {
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
    if (elephantCanStand(sx, sy, r, gate)) {
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
    a.flag = 1;
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
  if (res === 'blocked') return;
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

export function displace(s: State, winner: Elephant, loser: Elephant): void {
  const away = Math.atan2(loser.y - winner.y, loser.x - winner.x);
  const r = radiusOf(loser);
  let flee: Vec | null = null;
  for (const k of [0, 0.6, -0.6, 1.2, -1.2, 2]) {
    const p = { x: loser.x + Math.cos(away + k) * 4.5, y: loser.y + Math.sin(away + k) * 4.5 };
    if (elephantCanStand(p.x, p.y, r, s.world.gateOpen)) {
      flee = p;
      break;
    }
  }
  const prevKey = loser.act.key;
  startActivity(s, loser, { kind: 'avoid', target: flee ? { t: 'point', x: flee.x, y: flee.y, face: null } : null, score: 1, dur: 0.5, key: 'avoid', signal: null, note: `уступила место ${nameCase(winner.profile.name, 'dat')}`, aux: null }, true);
  loser.mem.cooldown[prevKey] = s.t + 12;
  loser.needs.stress = clamp(loser.needs.stress + 6 + 10 * loser.profile.traits.nervousness, 0, 100);
  winner.day.conflicts++;
  loser.day.conflicts++;
  adjustBond(s, winner.id, loser.id, -0.025);
  log(s, 'info', `${winner.profile.name} оттеснила ${nameCase(loser.profile.name, 'acc')} от еды.`, {
    key: `displace:${winner.id}:${loser.id}`,
    cooldown: 40,
    elephantId: loser.id,
    x: loser.x,
    y: loser.y,
    kind: 'conflict',
    silent: loser.profile.traits.confidence > 0.4,
  });
  fx('trumpet', winner.x, winner.y, winner.id);
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
      else if (spot === 'bedding') e.day.urineBedding++;
      else e.day.urineOutside++;
      fx('urine', p.x, p.y, e.id);
      if (spot === 'bedding') {
        log(s, 'warn', `${e.profile.name} помочилась на подстилку — мокрое пятно.`, { key: `urine:${e.id}`, cooldown: 15, elephantId: e.id, x: p.x, y: p.y, kind: 'mess' });
      } else if (spot === 'drain') {
        log(s, 'good', `${e.profile.name} справилась над стоком — подстилка сухая.`, { elephantId: e.id, x: p.x, y: p.y, silent: true });
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
    case 'signal':
      if (a.signal) beginSignal(s, e, a.signal);
      break;
    case 'follow':
      if (e.mem.call) e.mem.call.arrivedAt = s.t;
      break;
    case 'explore':
      if (a.target?.t === 'item') grabItem(s, e, a.target.id);
      break;
    default:
      break;
  }
}

function grabItem(s: State, e: Elephant, id: number): void {
  const it = s.world.items.find((x) => x.id === id);
  if (!it) return;
  const zone = zoneOf(e);
  const inside = zoneAt(it.x, it.y) !== null;
  if (!inside && !grabbableFromZone(it.x, it.y, [zone])) return;
  const h = headPos(e, 1.2);
  if (!inside) {
    // Хобот через решётку: вещь оказывается внутри
    s.world.items = s.world.items.filter((x) => x !== it);
    const names: Record<string, string> = { fork: 'вилы', rake: 'грабли', hay: 'тюк сена', straw: 'тюк соломы', ration: 'ведро с овощами', browse: 'охапку веток' };
    if (it.kind === 'hay') addFood(s, 'hay', h.x, h.y, FOOD.bale, zone);
    else if (it.kind === 'ration') addFood(s, 'produce', h.x, h.y, it.portions * FOOD.portionHunger, zone);
    else if (it.kind === 'browse') addFood(s, 'browse', h.x, h.y, 1, zone);
    else if (it.kind === 'straw') {
      // Солому растаскивает — пользы никакой, но и вреда мало
    } else s.world.items.push({ ...it, x: h.x, y: h.y });
    log(s, 'warn', `${e.profile.name} утащила через решётку ${names[it.kind] ?? 'вещь'}.`, { key: `grab:${e.id}`, cooldown: 10, elephantId: e.id, x: h.x, y: h.y, kind: 'grab' });
  } else {
    // Внутри — перекладывает с места на место
    const a = range(s, 0, Math.PI * 2);
    const nx = it.x + Math.cos(a) * range(s, 1, 2.5);
    const ny = it.y + Math.sin(a) * range(s, 1, 2.5);
    if (zoneAt(nx, ny) === zone && elephantCanStand(nx, ny, 0.3, s.world.gateOpen)) {
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
      if (t?.t === 'slot' && (t.station === 'barnWater' || t.station === 'paddockWater')) {
        const wp = w.water[t.station];
        if (wp.level <= 0) available = false;
        else wp.level = Math.max(0, wp.level - WATER.use * dt);
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
      if ((n.fatigue < 6 && elapsed > 40) || elapsed >= a.dur || (morning && elapsed > 25)) return 'done';
      if (random(s) < dt * 0.04) fx('snore', e.x, e.y, e.id);
      return 'continue';
    }
    case 'play':
      return stepPlay(s, e, dt, dtSec, elapsed);
    case 'bathe':
      if (!inPool(e.x, e.y)) return elapsed > 1 ? 'done' : 'continue';
      e.wet = Math.min(1, e.wet + 0.3 * dt);
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
    case 'socialize': {
      const o = a.target?.t === 'el' ? elephantById(s, a.target.id) : undefined;
      if (!o || zoneOf(o) !== zoneOf(e) && !w.gateOpen) return 'done';
      const d = dist(e, o);
      if (d > 12) return 'done';
      if (d > 3.8) {
        moveTo(s, e, { x: o.x, y: o.y }, ELEPHANT.speedAmble, dtSec, 3.2);
        return elapsed >= a.dur + 3 ? 'done' : 'continue';
      }
      n.social -= 2 * dt;
      n.boredom -= 0.35 * dt;
      adjustBond(s, e.id, o.id, 0.0015 * dt);
      if (random(s) < dt * 0.3) fx('greet', (e.x + o.x) / 2, (e.y + o.y) / 2, e.id);
      return elapsed >= a.dur ? 'done' : 'continue';
    }
    case 'signal': {
      if (!e.signal) return 'done';
      const clarity = 0.25 + 0.75 * T.expressiveness;
      if (random(s) < dt * 0.6 * clarity) fx(T.expressiveness > 0.6 && random(s) < 0.3 ? 'trumpet' : 'rumble', e.x, e.y, e.id);
      return 'continue';
    }
    case 'seekKeeper': {
      const k = keeperContact(s);
      const held = s.keeper.held;
      const carryingFood = held && (held.kind === 'ration' || held.kind === 'hay' || held.kind === 'browse');
      if (!k || !carryingFood || zoneOf(e) !== k.zone) return 'done';
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
      // Позвали к стоку, а пузырь полон — справится прямо здесь
      if (n.bladder > 45 && zoneOf(e) === 'barn' && dist(e, STATIONS.trainingWall.slots![0]) < 1.2) {
        const c: Candidate = { kind: 'urinate', target: null, score: 1, dur: 1.2, key: 'urinate', signal: null, note: 'мочится над стоком', aux: null };
        startActivity(s, e, c, true);
        // Награда за правильное место возможна ещё несколько минут — окно отсчитывается заново
        e.mem.call = { ...call, arrivedAt: s.t };
        return 'continue';
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

function stepEat(s: State, e: Elephant, dt: number, elapsed: number): DoResult {
  const a = e.act;
  const n = e.needs;
  const T = e.profile.traits;
  const w = s.world;
  const t = a.target;
  if (!t) return 'done';
  const before = n.hunger;
  const speed = 0.85 + 0.35 * T.foodDrive;
  if (t.t === 'slot' && (t.station === 'barnRack' || t.station === 'paddockFeeder')) {
    if (w.hay[t.station] <= 0) return n.hunger > 55 ? 'fail' : 'done';
    n.hunger = Math.max(0, n.hunger - FOOD.hayEat * speed * dt);
    w.hay[t.station] = Math.max(0, w.hay[t.station] - FOOD.hayUse * speed * dt);
    n.boredom -= 0.08 * dt;
  } else if (t.t === 'slot' && t.station === 'barnTrough') {
    if (w.trough.portions <= 0 || troughSpoiled(s)) return 'done';
    const eat = Math.min(w.trough.portions, (dt / FOOD.portionMinutes) * speed);
    w.trough.portions = Math.max(0, w.trough.portions - eat);
    n.hunger = Math.max(0, n.hunger - eat * FOOD.portionHunger);
    n.boredom -= 0.2 * dt;
    // Разборчивая наедается и оставляет остатки — они испортятся, если не вычистить
    if (n.hunger < satiety(e) - 4 && w.trough.portions > 0.2) {
      log(s, 'info', `${e.profile.name} наелась и оставила часть овощей в кормушке.`, { key: `leftover:${e.id}`, cooldown: 120, elephantId: e.id, silent: T.foodDrive > 0.35 });
      return 'done';
    }
  } else if (t.t === 'food') {
    const f = w.food.find((x) => x.id === t.id);
    if (!f || f.kind === 'remains') return 'done';
    if (f.kind === 'produce') {
      const eat = Math.min(f.amount, 7 * speed * dt);
      f.amount -= eat;
      n.hunger = Math.max(0, n.hunger - eat);
      n.boredom -= 0.5 * dt;
      bumpHabit(e, 'scatter', 0.01 * dt);
      if (f.amount <= 0.01) w.food = w.food.filter((x) => x !== f);
      if (f.amount <= 0.01) return 'done';
    } else if (f.kind === 'hay') {
      n.hunger = Math.max(0, n.hunger - FOOD.hayEat * speed * dt);
      f.amount -= FOOD.hayUse * speed * dt;
      if (f.amount <= 0) {
        w.food = w.food.filter((x) => x !== f);
        return 'done';
      }
    } else {
      n.hunger = Math.max(0, n.hunger - FOOD.browseEat * dt);
      n.boredom -= 0.65 * dt;
      f.amount -= FOOD.browseUse * dt;
      bumpHabit(e, 'browse', 0.01 * dt);
      if (f.amount <= 0) {
        f.kind = 'remains';
        f.amount = 1;
        return 'done';
      }
    }
  } else if (t.t === 'obj' && t.id === 'drum') {
    if (w.drum <= 0) return 'done';
    const use = Math.min(w.drum, FOOD.drumUse * dt * (0.7 + 0.6 * T.persistence));
    w.drum -= use;
    n.hunger = Math.max(0, n.hunger - FOOD.drumEat * dt);
    n.boredom -= 0.85 * dt;
    bumpHabit(e, 'drum', 0.006 * dt);
    if (random(s) < dt * 0.4) fx('drum', DRUM.x, DRUM.y, e.id);
  } else return 'done';
  const eaten = before - n.hunger;
  n.bowel = Math.min(100, n.bowel + eaten * NEEDS.eatToBowel);
  e.day.ate += eaten;
  e.mem.lastAte = s.t;
  if (random(s) < dt * 0.2) fx('munch', e.x, e.y, e.id);
  if (n.hunger < satiety(e) - (elapsed < 6 ? 6 : 0) && elapsed > 3) return 'done';
  return elapsed >= a.dur ? 'done' : 'continue';
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
  let flee: Vec | null = null;
  for (const k of [0, 0.5, -0.5, 1.1, -1.1]) {
    const p = { x: e.x + Math.cos(away + k) * 5, y: e.y + Math.sin(away + k) * 5 };
    if (zoneAt(p.x, p.y) === zoneOf(e) && elephantCanStand(p.x, p.y, r, s.world.gateOpen)) {
      flee = p;
      break;
    }
  }
  startActivity(s, e, { kind: 'avoid', target: flee ? { t: 'point', x: flee.x, y: flee.y, face: null } : null, score: 1.5, dur: 0.5, key: 'avoid', signal: null, note: why, aux: null }, true);
}

export function respondToCall(s: State, e: Elephant, spot: Vec, face: number, note: string): void {
  e.mem.call = { until: s.t + 12, x: spot.x, y: spot.y, arrivedAt: -1, rewarded: false };
  const c: Candidate = { kind: 'follow', target: { t: 'point', x: spot.x, y: spot.y, face }, score: 1.2, dur: LEARN.rewardWindow, key: 'follow', signal: null, note, aux: null };
  const keepCall = e.mem.call;
  startActivity(s, e, c, true);
  e.mem.call = keepCall;
}

export const ZONE_LABEL: Record<ZoneId, string> = { barn: 'слоновник', paddock: 'выгул' };
