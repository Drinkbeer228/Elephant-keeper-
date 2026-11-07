// Моча — не мгновенное событие, а струя. Сколько её, зависит от того, сколько слониха выпила
// (выпитое доходит до пузыря за час-два): бывает литра четыре — секунд десять, бывает
// одиннадцать — полминуты. Где — там, где она стоит: кипер с ведром у её задних ног ловит струю
// где угодно, и ведро тяжелеет; мимо — на подстилку или бетон, над решёткой стока — в канализацию.
// Пока она мочится рядом с кипером, время идёт как в жизни (см. step.ts).

import { FLOOR, KEEPER, TIME } from '../../data/balance';
import { DRAIN, ROOMS, inRect, zoneAt } from '../../data/facility';
import { fx, log } from '../events';
import { inPool } from '../geometry';
import { clamp } from '../rng';
import type { Elephant, State, UrineWhere, Vec } from '../types';
import { tankUnder, wetPatch } from '../world';
import { rearPos } from './perceive';

const round2 = (v: number) => Math.round(v * 100) / 100;

// Полный пузырь в литрах — у крупной больше
export function bladderLitres(e: Elephant): number {
  return FLOOR.bladderLitres * e.profile.look.size;
}

// Куда бьёт струя: между задними ногами, у самого края корпуса
export function streamPoint(e: Elephant): Vec {
  return rearPos(e, 1.35);
}

// Где встать с ведром: прямо позади неё или сбоку у задних ног — у самого края корпуса,
// на расстоянии вытянутой руки от струи
export function bucketSpots(e: Elephant): Vec[] {
  const L = e.profile.look;
  const c = Math.cos(e.heading);
  const sn = Math.sin(e.heading);
  const p = streamPoint(e);
  const rC = 0.82 * L.size * L.girth; // задний круг корпуса
  const dz = (1.35 - 0.78) * L.size * L.length;
  const half = Math.sqrt(Math.max(0, rC * rC - dz * dz));
  const side = half + 0.36;
  const back = 0.78 * L.size * L.length + rC + 0.34 - 1.35 * L.size * L.length;
  return [
    { x: p.x - c * back, y: p.y - sn * back },
    { x: p.x - sn * side, y: p.y + c * side },
    { x: p.x + sn * side, y: p.y - c * side },
  ];
}

export function keeperIndoors(s: State): boolean {
  return ROOMS.some((r) => inRect(r.rect, s.keeper.x, s.keeper.y));
}

// Кипер держит ведро под струёй: стоит у её задних ног с ведром в руках
export function keeperCatching(s: State, e: Elephant): boolean {
  const k = s.keeper;
  if (k.held?.kind !== 'tank' || k.running) return false;
  const p = streamPoint(e);
  return Math.hypot(k.x - p.x, k.y - p.y) <= KEEPER.catchReach * Math.max(1, e.profile.look.size);
}

// Мочится ли кто-то рядом с кипером (тогда время идёт как в жизни)
export function urinatingNearKeeper(s: State): boolean {
  const k = s.keeper;
  for (const e of s.elephants) {
    if (e.act.kind !== 'urinate' || e.act.phase !== 'do') continue;
    if (Math.hypot(e.x - k.x, e.y - k.y) <= TIME.catchRange && !keeperIndoors(s)) return true;
  }
  return false;
}

// Начало: сколько литров и сколько это займёт (в игровых минутах)
export function startStream(e: Elephant): number {
  const litres = Math.max(1.5, (e.needs.bladder / 100) * bladderLitres(e));
  const sec = clamp(litres / FLOOR.urineFlow, FLOOR.urineMinSec, FLOOR.urineMaxSec);
  e.mem.stream = { litres: round2(litres), bladder: e.needs.bladder, caught: 0, drain: 0, floor: 0, bedding: false };
  const p = streamPoint(e);
  fx('urine', p.x, p.y, e.id);
  return sec / 60;
}

function spill(s: State, e: Elephant, p: Vec, litres: number): void {
  const st = e.mem.stream!;
  st.floor += litres;
  if (inPool(p.x, p.y)) {
    s.world.pool.dirt = clamp(s.world.pool.dirt + (0.02 * litres) / FLOOR.urineLiters);
    return;
  }
  if (wetPatch(s, p.x, p.y, litres / FLOOR.urineLiters)) st.bedding = true;
}

// Шаг струи: доля dt/dur всего объёма — в ведро кипера, в ведро на полу, в сток или на пол
export function flowStream(s: State, e: Elephant, dt: number, dur: number): void {
  const st = e.mem.stream;
  if (!st) return;
  const frac = Math.min(1, dt / Math.max(1e-6, dur));
  const litres = st.litres * frac;
  e.needs.bladder = Math.max(0, e.needs.bladder - st.bladder * frac);
  const p = streamPoint(e);
  const k = s.keeper;
  if (keeperCatching(s, e)) {
    const h = k.held!;
    const put = Math.min(Math.max(0, KEEPER.tankLiters - h.load), litres);
    h.load += put;
    h.aux = 1;
    st.caught += put;
    if (put < litres) {
      spill(s, e, p, litres - put);
      log(s, 'warn', 'Ведро полное — льётся мимо. Вылей его в сток и подставь снова.', { key: 'tankFull', cooldown: 30 });
    }
    return;
  }
  const tank = tankUnder(s, p.x, p.y);
  if (tank) {
    const put = Math.min(Math.max(0, KEEPER.tankLiters - tank.load), litres);
    tank.load += put;
    tank.aux = 1;
    st.caught += put;
    if (put < litres) spill(s, e, p, litres - put);
    return;
  }
  if (zoneAt(p.x, p.y) === 'barn' && Math.hypot(p.x - DRAIN.x, p.y - DRAIN.y) <= DRAIN.r) {
    st.drain += litres;
    return;
  }
  spill(s, e, p, litres);
}

// Струя кончилась: куда ушла большая часть
export function endStream(s: State, e: Elephant): UrineWhere {
  const st = e.mem.stream;
  e.mem.stream = null;
  if (!st) return 'none';
  const total = st.caught + st.drain + st.floor || 1;
  const p = streamPoint(e);
  let where: UrineWhere;
  if (st.caught >= 0.5 * total) where = 'bucket';
  else if (st.drain >= 0.5 * total) where = 'drain';
  else if (inPool(p.x, p.y)) where = 'pool';
  else if (zoneAt(p.x, p.y) === 'paddock') where = 'outside';
  else where = st.bedding ? 'bedding' : 'concrete';
  e.mem.lastPee = { t: s.t, where };
  e.day.caughtLitres = round2(e.day.caughtLitres + st.caught);
  const name = e.profile.name;
  const caught = Math.round(st.caught);
  switch (where) {
    case 'bucket':
      e.day.urineTank++;
      fx('tank', s.keeper.x, s.keeper.y, e.id);
      log(s, 'good', `${name} — в ведро, ${caught} л! Похвали её сейчас.`, { elephantId: e.id, x: p.x, y: p.y, kind: 'tank' });
      break;
    case 'drain':
      e.day.urineDrain++;
      fx('drain', p.x, p.y);
      log(s, 'good', `${name} справилась над стоком — подстилка сухая.`, { elephantId: e.id, x: p.x, y: p.y, silent: true });
      break;
    case 'bedding':
      e.day.urineBedding++;
      log(s, 'warn', `${name} помочилась на подстилку — мокрое пятно.`, { key: `urine:${e.id}`, cooldown: 15, elephantId: e.id, x: p.x, y: p.y, kind: 'mess' });
      break;
    default:
      e.day.urineOutside++;
  }
  if (where !== 'bucket' && st.caught > 0.5) log(s, 'info', `В ведро попала только часть (${caught} л) — остальное мимо. Стой у самых задних ног.`, { key: `partial:${e.id}`, cooldown: 10, elephantId: e.id, kind: 'refuse' });
  return where;
}
