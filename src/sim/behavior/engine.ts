// Единый движок поведения. Для каждого слона на каждом шаге:
//   1) потребности (физиология не зависит от отношений с кипером);
//   2) неотложное: моча и навоз при полном пузыре — всегда, где бы ни стоял;
//   3) сигналы: ответили или терпение кончилось;
//   4) решение: раз в пару минут сравнить варианты; смена занятия — только если
//      новое заметно лучше текущего (гистерезис растёт с упрямством);
//   5) исполнение занятия (act.ts).
// Затем — встречи слонов между собой и расталкивание тел.

import { ELEPHANT, LEARN } from '../../data/balance';
import { fx, log } from '../events';
import { dist } from '../geometry';
import { elephantCanStand } from '../nav';
import { chance, clamp, random, range } from '../rng';
import type { Elephant, State } from '../types';
import { lyingComfort, trample } from '../world';
import { activityFrom, finishActivity, forceElimination, spook, startActivity, stepActivity } from './act';
import { onCallUnrewarded, onSpooked } from './learning';
import { updateNeeds } from './needs';
import { candidates, urg, type Candidate } from './options';
import { adjustBond, bond, gateMask, rankOf, radiusOf, zoneOf } from './perceive';
import { updateSignal } from './signals';
import { nameCase } from '../herd';

export function updateElephants(s: State, dt: number, dtSec: number): void {
  for (const e of s.elephants) updateOne(s, e, dt, dtSec);
  encounters(s);
  separate(s);
}

function isElimination(kind: string): boolean {
  return kind === 'urinate' || kind === 'defecate';
}

function updateOne(s: State, e: Elephant, dt: number, dtSec: number): void {
  updateNeeds(s, e, dt);
  const z = zoneOf(e);
  if (z !== e.mem.zone) {
    e.mem.zone = z;
    e.mem.zoneSince = s.t;
  }
  resolveCall(s, e);

  const n = e.needs;
  if (n.bladder >= 100 && !isElimination(e.act.kind)) forceElimination(s, e, 'urinate');
  else if (n.bowel >= 100 && !isElimination(e.act.kind)) forceElimination(s, e, 'defecate');

  updateSignal(s, e);
  spookCheck(s, e, dt);
  // Захмелевшая иногда спотыкается и замирает
  if (e.tipsy > 0.45 && !e.lying && e.speed > 0.3 && random(s) < dt * 0.12 * e.tipsy) {
    e.speed = 0;
    fx('stumble', e.x, e.y, e.id);
    log(s, 'info', `${e.profile.name} спотыкается — яблоки были забродившие.`, { key: `stumble:${e.id}`, cooldown: 40, elephantId: e.id, silent: true });
  }

  const a = e.act;
  const idleDone = a.kind === 'idle' && a.phase === 'do' && s.t - a.doStart >= a.dur;
  if (idleDone || s.t >= e.mem.nextThink) think(s, e, idleDone);

  stepActivity(s, e, dt, dtSec);
  // Занятия сами снимают скуку и одиночество — держим шкалы в границах
  for (const k of Object.keys(n) as (keyof typeof n)[]) n[k] = clamp(n[k], 0, 100);

  if (e.speed > 0.15 && trample(s, e.x, e.y, 0.95 * e.profile.look.size)) {
    log(s, 'info', `${e.profile.name} растоптала залежавшийся навоз — грязь разнесётся.`, {
      key: `trample:${e.id}`,
      cooldown: 45,
      elephantId: e.id,
      x: e.x,
      y: e.y,
      silent: true,
    });
  }
}

// Награда за приход на зов ждёт недолго: не угостили — в следующий раз пойдёт неохотнее
function resolveCall(s: State, e: Elephant): void {
  const call = e.mem.call;
  if (!call) return;
  // У стенки она ждёт команды «Давай гуляй» — награда будет после туалета, не раньше
  if (call.why === 'toilet' && e.act.kind === 'follow') return;
  if (call.arrivedAt >= 0 && s.t - call.arrivedAt > LEARN.rewardWindow) {
    if (!call.rewarded) {
      onCallUnrewarded(e, call.why);
      log(s, 'info', `${e.profile.name} ${call.why === 'lie' ? 'полежала по просьбе' : call.why === 'toilet' ? 'сходила по команде' : 'пришла на зов'}, но похвалы не дождалась.`, { elephantId: e.id, silent: true });
    }
    e.mem.call = null;
  } else if (call.arrivedAt < 0 && s.t > call.until) {
    e.mem.call = null;
  }
}

function interruptible(s: State, e: Elephant, best: Candidate): boolean {
  const a = e.act;
  if (a.forced) return false;
  const elapsed = a.phase === 'do' ? s.t - a.doStart : 0;
  switch (a.kind) {
    case 'urinate':
    case 'defecate':
    case 'follow':
    case 'avoid':
    case 'sleep':
    case 'lie':
      return false;
    case 'carry':
      return a.phase === 'go' && a.flag === 0;
    case 'shake':
    case 'toss':
    case 'manipulate':
      return elapsed >= 1 || a.phase === 'go';
    case 'signal':
      // Физиология сильнее желаний: голод, жажда и сон прерывают ожидание у ворот
      if (a.phase === 'go') return true;
      return ['eat', 'drink', 'sleep', 'urinate', 'defecate'].includes(best.kind) ? best.score > a.score + 0.08 : best.score > a.score + 0.35;
    case 'eat':
    case 'drink':
      // Начатую еду бросают только ради чего-то срочного
      if (a.phase === 'go') return true;
      return elapsed >= 4 && (PHYSIO.has(best.kind) || best.score > a.score + 0.25);
    case 'play':
      return elapsed >= 3 || a.phase === 'go';
    case 'bathe':
      return elapsed >= 4 || a.phase === 'go';
    default:
      return true;
  }
}

export function think(s: State, e: Elephant, idleDone: boolean): void {
  e.mem.nextThink = s.t + range(s, ELEPHANT.thinkEvery[0], ELEPHANT.thinkEvery[1]);
  const list = candidates(s, e);
  const best = list[0];
  if (!best) return;
  if (idleDone) {
    startActivity(s, e, best);
    return;
  }
  const a = e.act;
  if (!interruptible(s, e, best)) return;
  if (best.key === a.key) return;
  const same = list.find((c) => c.key === a.key);
  const T = e.profile.traits;
  const commitment = a.phase === 'do' ? 0.08 + 0.3 * T.persistence : 0.04 + 0.12 * T.persistence;
  const current = (same ? same.score : a.score * 0.8) + commitment;
  if (best.score > current + 0.06) startActivity(s, e, best);
}

// Кипер бежит рядом — нервная и недоверчивая слониха шарахается
function spookCheck(s: State, e: Elephant, dt: number): void {
  const k = s.keeper;
  if (!k.running || !k.moving) return;
  const T = e.profile.traits;
  if (T.nervousness < 0.45 || s.t - e.mem.spooked < 6) return;
  if (dist(e, k) > ELEPHANT.keeperSpookDistance) return;
  if (e.act.forced && e.act.kind !== 'sleep') return;
  const p = (T.nervousness - 0.4) * (1 - e.learned.trust) * 2.4;
  if (!chance(s, p * dt)) return;
  e.mem.spooked = s.t;
  e.needs.stress = clamp(e.needs.stress + 10 + 10 * T.nervousness, 0, 100);
  onSpooked(e);
  spook(s, e, k, 'шарахнулась от бегущего кипера');
  fx('trumpet', e.x, e.y, e.id);
  log(s, 'warn', `${e.profile.name} шарахнулась: рядом бегали. Возле нервных слонов лучше ходить шагом.`, {
    key: `spook:${e.id}`,
    cooldown: 25,
    elephantId: e.id,
    x: e.x,
    y: e.y,
    kind: 'spook',
  });
}

const CALM_KINDS = new Set(['idle', 'wander', 'rest', 'explore']);
const PHYSIO = new Set(['urinate', 'defecate', 'drink', 'eat', 'avoid']);

// Встречи: подруги приветствуют друг друга хоботом, недруги расходятся
function encounters(s: State): void {
  const es = s.elephants;
  for (let i = 0; i < es.length; i++) {
    for (let j = i + 1; j < es.length; j++) {
      const a = es[i];
      const b = es[j];
      if (a.lying || b.lying || a.act.forced || b.act.forced) continue;
      const d = dist(a, b);
      if (d > 3.6) continue;
      const bd = bond(s, a.id, b.id);
      const last = a.mem.lastGreet[b.id] ?? -1e9;
      if (bd > 0.15 && s.t - last > 150 && CALM_KINDS.has(a.act.kind) && CALM_KINDS.has(b.act.kind)) {
        a.mem.lastGreet[b.id] = s.t;
        b.mem.lastGreet[a.id] = s.t;
        greet(s, a, b);
        greet(s, b, a);
        adjustBond(s, a.id, b.id, 0.01);
        log(s, 'info', `${a.profile.name} и ${b.profile.name} поприветствовали друг друга хоботами.`, { elephantId: a.id, silent: true });
        continue;
      }
      if (bd < -0.15 && s.t - last > 40) {
        a.mem.lastGreet[b.id] = s.t;
        b.mem.lastGreet[a.id] = s.t;
        const low = rankOf(a) < rankOf(b) ? a : b;
        const high = low === a ? b : a;
        if (!CALM_KINDS.has(low.act.kind) && low.act.kind !== 'socialize') continue;
        low.needs.stress = clamp(low.needs.stress + 4 + 8 * low.profile.traits.nervousness, 0, 100);
        spook(s, low, high, `держится подальше от ${nameCase(high.profile.name, 'gen')}`);
        log(s, 'info', `${low.profile.name} обходит ${nameCase(high.profile.name, 'acc')} стороной — они не ладят.`, {
          key: `tension:${low.id}:${high.id}`,
          cooldown: 90,
          elephantId: low.id,
          silent: true,
        });
      }
    }
  }
}

function greet(s: State, e: Elephant, other: Elephant): void {
  const act = activityFrom(s, {
    kind: 'socialize',
    target: { t: 'el', id: other.id },
    score: 0.6,
    dur: 2 + 2 * e.profile.traits.sociability,
    key: `socialize:${other.id}`,
    signal: null,
    note: `здоровается с ${nameCase(other.profile.name, 'ins')}`,
    aux: null,
  });
  act.phase = 'do';
  act.doStart = s.t;
  e.act = act;
  e.path = [];
  e.pathGoal = null;
  fx('greet', (e.x + other.x) / 2, (e.y + other.y) / 2, e.id);
}

// Тела слонов не проходят друг сквозь друга: два круга на корпус, младшая уступает
function bodyCircles(e: Elephant): { x: number; y: number; r: number }[] {
  const L = e.profile.look;
  const o = ELEPHANT.bodyOffset * L.size * L.length;
  const r = ELEPHANT.bodyCircle * L.size * L.girth * (e.lying ? 1.15 : 1);
  const c = Math.cos(e.heading);
  const sn = Math.sin(e.heading);
  return [
    { x: e.x + c * o, y: e.y + sn * o, r },
    { x: e.x - c * o, y: e.y - sn * o, r },
  ];
}

function separate(s: State): void {
  const es = s.elephants;
  const gate = gateMask(s);
  for (let i = 0; i < es.length; i++) {
    for (let j = i + 1; j < es.length; j++) {
      const a = es[i];
      const b = es[j];
      if (Math.abs(a.x - b.x) > 5 || Math.abs(a.y - b.y) > 5) continue;
      let best: { dx: number; dy: number; overlap: number } | null = null;
      for (const ca of bodyCircles(a)) {
        for (const cb of bodyCircles(b)) {
          const dx = cb.x - ca.x;
          const dy = cb.y - ca.y;
          const d = Math.hypot(dx, dy) || 0.001;
          const overlap = ca.r + cb.r - d;
          if (overlap > 0 && (!best || overlap > best.overlap)) best = { dx: dx / d, dy: dy / d, overlap };
        }
      }
      if (!best) continue;
      const push = Math.min(0.12, best.overlap * 0.5);
      // Кто сдвинется: лежащий не двигается, старшая по рангу — меньше
      let wa = a.lying ? 0 : 1 / (1 + Math.max(0, rankOf(a) - rankOf(b)) * 3);
      let wb = b.lying ? 0 : 1 / (1 + Math.max(0, rankOf(b) - rankOf(a)) * 3);
      if (wa + wb === 0) continue;
      const sum = wa + wb;
      wa /= sum;
      wb /= sum;
      const ax = a.x - best.dx * push * wa;
      const ay = a.y - best.dy * push * wa;
      const bx = b.x + best.dx * push * wb;
      const by = b.y + best.dy * push * wb;
      if (wa > 0 && elephantCanStand(ax, ay, radiusOf(a), gate)) {
        a.x = ax;
        a.y = ay;
      }
      if (wb > 0 && elephantCanStand(bx, by, radiusOf(b), gate)) {
        b.x = bx;
        b.y = by;
      }
    }
  }
}

// «Торгующаяся» без лакомства в сумке слушается неохотно, с лакомством — охотнее
function negotiation(e: Elephant, hasTreats: boolean): number {
  if (e.profile.habits.signal !== 'beg') return 1;
  return hasTreats ? 1.2 : 0.45;
}

// Зов кипера: пойдёт или нет — покладистость, доверие, голод, чем занята сейчас
export function callCompliance(e: Elephant, hasTreats: boolean, atDrain: boolean): number {
  const T = e.profile.traits;
  const L = e.learned;
  const a = e.act;
  const engaged = a.kind === 'idle' || a.kind === 'wander' ? 0 : clamp(a.score) * (0.5 + T.persistence);
  let p = 0.08 + 0.45 * L.cooperation + 0.22 * L.trust + 0.2 * T.foodDrive * (hasTreats ? 1 : 0.35) - 0.3 * engaged - 0.25 * (e.needs.stress / 100);
  if (e.signal?.kind === 'toilet' && atDrain) p += 0.45 + 0.3 * L.toilet;
  if (e.signal?.kind === 'attention') p += 0.3;
  if (e.lying) p *= 0.35;
  p *= negotiation(e, hasTreats);
  return clamp(p, 0.03, 0.97);
}

// Просьба лечь: доверие и покладистость, удобство пола, усталость, нервы, недавний испуг
export function lieCompliance(s: State, e: Elephant, hasTreats: boolean): { p: number; why: string } {
  const T = e.profile.traits;
  const L = e.learned;
  const n = e.needs;
  if (e.lying) return { p: 0, why: 'уже лежит' };
  const busy = ['eat', 'drink', 'urinate', 'defecate', 'avoid', 'play', 'bathe'].includes(e.act.kind) && e.act.phase === 'do';
  const comfort = lyingComfort(s, e.x, e.y);
  let p = 0.02 + 0.55 * L.trust + 0.35 * L.cooperation - 0.35 * T.nervousness - 0.3 * (n.stress / 100) + 0.25 * urg(n.fatigue, 20, 80);
  let why = 'не хочет';
  if (comfort < 0.32) {
    p -= 0.25 + 0.3 * T.sensitivity;
    why = 'здесь жёстко или мокро — на такое не ляжет';
  }
  if (busy) {
    p -= 0.35;
    why = 'занята';
  }
  if (s.t - e.mem.spooked < 30) {
    p -= 0.3;
    why = 'ещё не успокоилась после испуга';
  }
  if (L.trust < 0.3) why = 'не доверяет настолько';
  if (e.profile.habits.signal === 'beg' && !hasTreats) why = 'ждёт, что сначала покажешь лакомство';
  p *= negotiation(e, hasTreats);
  return { p: clamp(p, 0.02, 0.95), why };
}

// Команда «Давай гуляй» у бака: есть ли что — и приучена ли
export function toiletCompliance(e: Elephant, hasTreats: boolean): number {
  const n = e.needs;
  const L = e.learned;
  if (n.bladder < 28) return 0.04;
  let p = 0.1 + 0.6 * urg(n.bladder, 28, 85) + 0.35 * L.toilet + 0.15 * L.cooperation + 0.1 * L.trust;
  p *= negotiation(e, hasTreats);
  return clamp(p, 0.03, 0.97);
}

export { finishActivity };
