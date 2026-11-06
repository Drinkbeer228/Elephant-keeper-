// Оценка вариантов поведения: каждая потребность и черта характера дают вклад в полезность.
// Здесь только «что хочется сделать и насколько», исполнение — в act.ts.

import { ELEPHANT } from '../../data/balance';
import {
  BEDDING,
  BOULDERS,
  DRUM,
  DUST_PIT,
  LOG,
  POOL,
  STATIONS,
  TIRE,
  TREES,
  inEllipse,
  inRect,
  shadeAt,
  zoneAt,
  type StationId,
  type ZoneId,
} from '../../data/facility';
import { dist, inPool } from '../geometry';
import { openCells, elephantCanStand } from '../nav';
import { clamp, random, range } from '../rng';
import { darkness, indoorPull, sleepPressure, temperature } from '../time';
import type { ActivityKind, Elephant, FoodKind, ObjectId, SignalKind, State, TargetRef, Vec } from '../types';
import { lyingComfort, troughSpoiled } from '../world';
import { cachedDirt } from './needs';
import {
  bond,
  canReachZone,
  freeSlot,
  keeperContact,
  radiusOf,
  rankOf,
  reachableZones,
  slotTakenBy,
  zoneOf,
} from './perceive';
import { signalWillingness } from './signals';
import { nameCase } from '../herd';

export interface Candidate {
  kind: ActivityKind;
  target: TargetRef | null;
  score: number;
  dur: number;
  key: string;
  signal: SignalKind | null;
  note: string;
  aux: Vec | null;
}

export function urg(v: number, lo: number, hi: number): number {
  return clamp((v - lo) / (hi - lo));
}

function distMul(d: number): number {
  return 1 / (1 + d / 45);
}

// Физиологическая срочность: от 0.12 у нижнего порога до 1.42 у верхнего — выше любых «хотелок»
export function phys(v: number, lo: number, hi: number): number {
  return 0.12 + 1.3 * urg(v, lo, hi) ** 1.35;
}

// Ресурс в другой зоне чуть менее привлекателен: идти через ворота дольше
function zoneMul(c: { zone: ZoneId }, zone: ZoneId): number {
  return c.zone === zone ? 1 : 0.78;
}

function prefMul(e: Elephant, food: FoodKind): number {
  return e.profile.favoriteFood === food ? 1.18 : 1;
}

function habit(e: Elephant, key: string): number {
  return e.mem.habit[key] ?? 0;
}

interface Ctx {
  s: State;
  e: Elephant;
  zone: ZoneId;
  zones: ZoneId[];
  temp: number;
  daylight: number;
  heatU: number;
  r: number;
}

function cand(kind: ActivityKind, target: TargetRef | null, score: number, dur: number, key: string, note: string, signal: SignalKind | null = null, aux: Vec | null = null): Candidate {
  return { kind, target, score, dur, key, signal, note, aux };
}

// ---------------------------------------------------------------------------
// Еда
// ---------------------------------------------------------------------------

function addFeeding(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const T = e.profile.traits;
  const n = e.needs;
  const w = s.world;
  const satiety = 12 + 26 * (1 - T.foodDrive);
  if (n.hunger <= satiety * 0.6) return;
  const hayU = phys(n.hunger, 18, 88) * (0.72 + 0.5 * T.foodDrive) * prefMul(e, 'hay');
  for (const station of ['barnRack', 'paddockFeeder'] as const) {
    const zone = STATIONS[station].zone!;
    if (!c.zones.includes(zone) || w.hay[station] < 1) continue;
    let slot = freeSlot(s, e, station);
    let crowd = 1;
    if (slot < 0) {
      // Все места заняты: властная может оттеснить младшую по рангу, робкая — подождёт
      const slots = STATIONS[station].slots!;
      let weakest = -1;
      let weakestRank = Infinity;
      slots.forEach((_, i) => {
        const o = slotTakenBy(s, e, station, i);
        if (o && rankOf(o) < weakestRank) {
          weakestRank = rankOf(o);
          weakest = i;
        }
      });
      if (weakest < 0 || weakestRank >= rankOf(e) || T.confidence < 0.4) continue;
      slot = weakest;
      crowd = 0.6 + 0.4 * T.confidence;
    }
    const p = STATIONS[station].slots![slot];
    out.push(cand('eat', { t: 'slot', station, slot }, hayU * crowd * distMul(dist(e, p)) * zoneMul(c, zone), 30 + 45 * T.foodDrive + 20 * T.persistence, `eat:${station}`, 'ест сено'));
  }
  // Овощи в кормушке у решётки — самое желанное
  if (c.zones.includes('barn') && w.trough.portions > 0.05 && !troughSpoiled(s)) {
    const taken = slotTakenBy(s, e, 'barnTrough', 0);
    if (!taken || (rankOf(taken) < rankOf(e) && T.confidence > 0.45)) {
      const p = STATIONS.barnTrough.slots![0];
      const score = (0.3 + phys(n.hunger, 8, 80)) * (0.8 + 0.5 * T.foodDrive) * prefMul(e, 'produce') * (taken ? 0.75 : 1) * distMul(dist(e, p)) * zoneMul(c, 'barn');
      out.push(cand('eat', { t: 'slot', station: 'barnTrough', slot: 0 }, score, 20, 'eat:barnTrough', 'ест овощи'));
    }
  }
  // Разбросанный корм и ветки — ещё и занятие для хобота
  for (const f of w.food) {
    if (f.kind === 'remains' || !c.zones.includes(f.zone)) continue;
    const d = dist(e, f);
    if (d > 30) continue;
    if (s.elephants.some((o) => o !== e && o.act.target?.t === 'food' && o.act.target.id === f.id)) continue;
    let score: number;
    let dur: number;
    let note: string;
    if (f.kind === 'browse') {
      score = (0.25 + 0.4 * urg(n.hunger, 10, 80) + 0.5 * urg(n.boredom, 10, 70)) * (0.5 + 0.6 * T.curiosity) * prefMul(e, 'browse') * (1 - 0.6 * habit(e, 'browse'));
      dur = 10 + 15 * T.persistence;
      note = 'обдирает ветки';
    } else if (f.kind === 'hay') {
      score = hayU * 0.95;
      dur = 20 + 30 * T.foodDrive;
      note = 'ест сено с пола';
    } else {
      score = (0.3 + 0.7 * urg(n.hunger, 5, 70)) * (0.6 + 0.6 * T.foodDrive) * (0.7 + 0.6 * T.curiosity) * prefMul(e, 'produce') * (1 - 0.35 * habit(e, 'scatter'));
      dur = 4;
      note = 'собирает разбросанный корм';
    }
    out.push(cand('eat', { t: 'food', id: f.id }, score * distMul(d), dur, `eat:food:${f.id}`, note));
  }
  // Кормовой барабан: корм достаётся медленно — для упорных и любопытных
  if (c.zones.includes('paddock') && w.drum > 0.2) {
    const score = (0.25 + 0.4 * urg(n.hunger, 10, 80) + 0.45 * urg(n.boredom, 15, 75)) * (0.45 + 0.4 * T.curiosity + 0.45 * T.persistence) * (1 - 0.6 * habit(e, 'drum'));
    out.push(cand('eat', { t: 'obj', id: 'drum', x: DRUM.x, y: DRUM.y }, score * distMul(dist(e, DRUM)), 5 + 16 * T.persistence, 'eat:drum', 'достаёт корм из барабана'));
  }
}

// ---------------------------------------------------------------------------
// Вода
// ---------------------------------------------------------------------------

function addDrinking(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const n = e.needs;
  if (n.thirst < 18) return;
  const base = phys(n.thirst, 18, 85) * (1 + 0.3 * c.heatU);
  for (const station of ['barnWater', 'paddockWater'] as const) {
    const zone = STATIONS[station].zone!;
    if (!c.zones.includes(zone) || s.world.water[station].level < 3) continue;
    const slot = freeSlot(s, e, station);
    if (slot < 0) continue;
    const p = STATIONS[station].slots![slot];
    out.push(cand('drink', { t: 'slot', station, slot }, base * 1.05 * distMul(dist(e, p)) * zoneMul(c, zone), 12, `drink:${station}`, 'пьёт'));
  }
  if (c.zones.includes('paddock')) {
    const aversion = clamp(s.world.pool.dirt * (0.6 + 1.3 * e.profile.traits.sensitivity));
    if (aversion < 0.9) {
      const p = poolEdgePoint(s, e);
      if (p) out.push(cand('drink', { t: 'obj', id: 'pool', x: p.x, y: p.y }, base * 0.8 * (1 - aversion) * distMul(dist(e, p)), 10, 'drink:pool', 'пьёт из бассейна'));
    }
  }
}

function poolEdgePoint(s: State, e: Elephant): Vec | null {
  // Точка у кромки бассейна со стороны слона
  const a = Math.atan2(e.y - POOL.y, e.x - POOL.x) + range(s, -0.5, 0.5);
  for (let k = 0; k < 6; k++) {
    const ang = a + (k % 2 ? 1 : -1) * k * 0.35;
    const x = POOL.x + Math.cos(ang) * (POOL.rx + 1.1);
    const y = POOL.y + Math.sin(ang) * (POOL.ry + 1.1);
    if (zoneAt(x, y) === 'paddock' && elephantCanStand(x, y, 0.9, false)) return { x, y };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Туалет
// ---------------------------------------------------------------------------

function addElimination(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const n = e.needs;
  const T = e.profile.traits;
  if (n.bladder >= ELEPHANT.urgeBladder) {
    const u = urg(n.bladder, ELEPHANT.urgeBladder, 100);
    if (c.zone === 'paddock') {
      out.push(cand('urinate', { t: 'point', x: e.x, y: e.y, face: null }, 0.75 + 0.5 * u, 1.2, 'urinate', 'мочится'));
    } else if (s.world.gateOpen) {
      // Из слоновника — выйти на песок: так поступают почти все, особенно чистоплотные
      const p = { x: 20 + range(s, -3, 3), y: 14 + range(s, -2, 2) };
      out.push(cand('urinate', { t: 'point', x: p.x, y: p.y, face: null }, (0.7 + 0.4 * u) * (0.75 + 0.4 * T.sensitivity), 1.2, 'urinate', 'идёт на выгул в туалет'));
    } else {
      const will = signalWillingness(e);
      out.push(cand('signal', { t: 'gate', side: 'barn' }, (0.55 + 0.5 * u) * (0.35 + 0.75 * will), 0, 'signal:toilet', 'просится в туалет', 'toilet'));
    }
  }
  if (n.bowel >= ELEPHANT.urgeBowel && T.sensitivity > 0.45) {
    // Чистоплотные отходят подальше от еды и лежанки
    const p = latrineSpot(c);
    if (p) out.push(cand('defecate', { t: 'point', x: p.x, y: p.y, face: null }, (0.6 + 0.4 * urg(n.bowel, 82, 100)) * (0.6 + 0.5 * T.sensitivity), 1, 'defecate', 'отходит в сторону по-большому'));
  }
}

function latrineSpot(c: Ctx): Vec | null {
  const { s, e } = c;
  const cells = openCells(c.zone, radiusOf(e));
  let best: Vec | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 10; i++) {
    const p = cells[Math.floor(random(s) * cells.length)];
    if (!p) break;
    const d = dist(e, p);
    if (d > 16) continue;
    let score = -d * 0.15;
    for (const st of ['barnRack', 'paddockFeeder', 'barnWater', 'paddockWater', 'barnTrough'] as StationId[]) {
      const slot = STATIONS[st].slots![0];
      score += Math.min(8, dist(p, slot)) * 0.25;
    }
    if (c.zone === 'barn' && inRect(BEDDING, p.x, p.y)) score -= 3;
    if (inEllipse(POOL, p.x, p.y, 1.2)) score -= 5;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Сон и отдых
// ---------------------------------------------------------------------------

function addRest(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const n = e.needs;
  const T = e.profile.traits;
  const press = sleepPressure(s.t);
  if (n.fatigue > 25 && press > 0.15) {
    const spot = sleepSpot(c);
    if (spot) {
      const need = 0.3 + 0.45 * T.sensitivity; // чувствительная не ляжет на мокрое и грязное
      const ok = spot.comfort >= need ? 1 : 0.12;
      const score = (0.15 + 0.8 * press) * phys(n.fatigue, 25, 90) * ok * (1 - 0.35 * urg(n.stress, 40, 90));
      out.push(cand('sleep', { t: 'point', x: spot.x, y: spot.y, face: null }, score, 70 + 0.9 * n.fatigue, 'sleep', spot.comfort >= need ? 'ложится спать' : 'хотела лечь, но подстилка плохая'));
    }
  }
  if (n.fatigue > 15) {
    const shade = c.heatU > 0.25 ? shadeSpot(c) : null;
    const target: TargetRef = shade ? { t: 'point', x: shade.x, y: shade.y, face: null } : { t: 'point', x: e.x, y: e.y, face: null };
    const score = urg(n.fatigue, 15, 75) * (0.3 + 0.55 * (1 - T.activity)) * (1 + 0.6 * c.heatU * (shade ? 1 : 0.3)) * (press > 0.5 ? 0.7 : 1) * 0.85;
    out.push(cand('rest', target, score, 10 + 20 * (1 - T.activity), 'rest', shade ? 'дремлет в тени' : 'дремлет стоя'));
  }
}

function sleepSpot(c: Ctx): { x: number; y: number; comfort: number } | null {
  const { s, e } = c;
  let best: { x: number; y: number; comfort: number } | null = null;
  let bestScore = -Infinity;
  const zones = c.zones.includes('barn') ? ['barn' as const] : c.zones;
  for (const zone of zones) {
    const cells = openCells(zone, radiusOf(e) + 0.15);
    for (let i = 0; i < 14; i++) {
      const p = cells[Math.floor(random(s) * cells.length)];
      if (!p) break;
      const comfort = lyingComfort(s, p.x, p.y);
      let score = comfort - dist(e, p) * 0.01;
      // Не ложиться в проходах: у кормушек, поилок, стока и ворот
      for (const st of Object.values(STATIONS)) for (const sl of st.slots ?? []) if (dist(sl, p) < 2.6) score -= 0.5;
      if (Math.abs(p.x - 20) < 3.5 && Math.abs(p.y - 20) < 3) score -= 0.5;
      for (const o of s.elephants) {
        if (o === e) continue;
        const d = dist(o, p);
        if (d < 3.4) score -= 0.6;
        else if (d < 6 && bond(s, e.id, o.id) > 0.2) score += 0.1 * e.profile.traits.sociability;
      }
      if (score > bestScore) {
        bestScore = score;
        best = { x: p.x, y: p.y, comfort };
      }
    }
  }
  return best;
}

function shadeSpot(c: Ctx): Vec | null {
  const { s, e } = c;
  if (c.zone === 'barn') return null;
  let best: Vec | null = null;
  let bestD = Infinity;
  for (const t of TREES) {
    const p = { x: t.x + 0.6 + range(s, -1.2, 1.2), y: t.y + 1.6 + range(s, -0.6, 0.8) };
    if (shadeAt(p.x, p.y) < 0.4 || !elephantCanStand(p.x, p.y, radiusOf(e), false)) continue;
    if (s.elephants.some((o) => o !== e && dist(o, p) < 2.8)) continue;
    const d = dist(e, p);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Вода, пыль, игра
// ---------------------------------------------------------------------------

function addCoolingAndPlay(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const n = e.needs;
  const T = e.profile.traits;
  const tired = urg(n.fatigue, 55, 95);
  if (c.zones.includes('paddock')) {
    const aversion = clamp(s.world.pool.dirt * (0.5 + 1.2 * T.sensitivity));
    if (c.temp > 15 && c.daylight > 0.3) {
      const score = (0.12 + 0.5 * c.heatU + 0.35 * urg(n.boredom, 20, 80) * T.playfulness) * (0.4 + 0.8 * T.playfulness) * (1 - aversion) * (1 - 0.45 * habit(e, 'pool')) * (1 - tired * 0.7);
      const p = poolInnerPoint(s);
      out.push(cand('bathe', { t: 'obj', id: 'pool', x: p.x, y: p.y }, score * distMul(dist(e, p)), 10 + 18 * T.playfulness, 'bathe', 'купается'));
    }
    if (c.daylight > 0.3) {
      const score = (0.35 * c.heatU + 0.55 * e.wet + 0.1) * (0.35 + 0.5 * T.activity) * (1 - 0.5 * habit(e, 'dust')) * (1 - e.dust * 0.8);
      const p = { x: DUST_PIT.x + range(s, -1.6, 1.6), y: DUST_PIT.y + range(s, -1, 1) };
      out.push(cand('dust', { t: 'obj', id: 'dust', x: p.x, y: p.y }, score * distMul(dist(e, p)), 3 + 4 * T.activity, 'dust', 'посыпается песком'));
    }
    // Мяч
    const b = s.world.ball;
    if (!s.elephants.some((o) => o !== e && o.act.kind === 'play' && o.act.target?.t === 'obj' && o.act.target.id === 'ball')) {
      const score = urg(n.boredom, 12, 70) * T.playfulness * (0.55 + 0.45 * T.activity) * (1 - 0.7 * habit(e, 'ball')) * (1 - tired) * 1.3;
      out.push(cand('play', { t: 'obj', id: 'ball', x: b.x, y: b.y }, score * distMul(dist(e, b)), 6 + 14 * T.playfulness, 'play:ball', 'играет с мячом'));
    }
  }
  if (c.zones.includes('barn') && !s.elephants.some((o) => o !== e && o.act.kind === 'play' && o.act.target?.t === 'obj' && o.act.target.id === 'tire')) {
    const score = urg(n.boredom, 15, 75) * T.playfulness * (0.5 + 0.4 * T.activity) * (1 - 0.7 * habit(e, 'tire')) * (1 - tired) * 1.05;
    out.push(cand('play', { t: 'obj', id: 'tire', x: TIRE.x, y: TIRE.y }, score * distMul(dist(e, TIRE)), 4 + 10 * T.playfulness, 'play:tire', 'качает покрышку'));
  }
  // Возня с подругой
  if (T.playfulness > 0.4 && n.fatigue < 70) {
    for (const o of s.elephants) {
      if (o === e || !canReachZone(s, e, zoneOf(o)) || o.lying) continue;
      const ot = o.profile.traits;
      if (ot.playfulness < 0.4 || o.needs.fatigue > 70) continue;
      if (!['idle', 'wander', 'rest', 'explore', 'play', 'socialize'].includes(o.act.kind)) continue;
      const b = bond(s, e.id, o.id);
      if (b < 0.05) continue;
      const d = dist(e, o);
      if (d > 20) continue;
      const score = urg(n.boredom, 10, 65) * T.playfulness * ot.playfulness * (0.6 + b) * (1 - habit(e, 'social') * 0.5) * 1.45;
      out.push(cand('play', { t: 'el', id: o.id }, score * distMul(d), 5 + 8 * T.playfulness, `play:${o.id}`, `возится с ${nameCase(o.profile.name, 'ins')}`));
    }
  }
}

function poolInnerPoint(s: State): Vec {
  const a = range(s, 0, Math.PI * 2);
  const k = range(s, 0.15, 0.6);
  return { x: POOL.x + Math.cos(a) * POOL.rx * k, y: POOL.y + Math.sin(a) * POOL.ry * k };
}

// ---------------------------------------------------------------------------
// Исследование
// ---------------------------------------------------------------------------

function addExplore(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const n = e.needs;
  const T = e.profile.traits;
  const drive = T.curiosity * (0.3 + 0.7 * urg(n.boredom, 10, 70));
  if (drive < 0.05) return;
  // Вещи кипера: свои в зоне или забытые у самой решётки
  for (const it of s.world.items) {
    const z = zoneAt(it.x, it.y);
    const inside = z !== null && c.zones.includes(z);
    const reachable = !inside && grabbableFromZone(it.x, it.y, c.zones);
    if (!inside && !reachable) continue;
    const d = dist(e, it);
    if (d > 25) continue;
    out.push(cand('explore', { t: 'item', id: it.id }, drive * 1.15 * distMul(d), 3 + 6 * T.curiosity, `explore:item:${it.id}`, reachable ? 'тянется к вещи за решёткой' : 'изучает забытую вещь'));
  }
  // Кипер работает рядом — любопытные подходят посмотреть
  const k = keeperContact(s);
  if (k && c.zones.includes(k.zone) && (s.keeper.task || s.keeper.held)) {
    const trustK = 0.4 + 0.6 * e.learned.trust;
    out.push(cand('explore', { t: 'point', x: k.spot.x, y: k.spot.y, face: k.face }, drive * 0.75 * trustK * distMul(dist(e, k.spot)), 3 + 4 * T.curiosity, 'explore:keeper', 'наблюдает за кипером'));
  }
  // Природа: деревья, камни, бревно — почесаться, обнюхать
  if (c.zones.includes('paddock')) {
    const spots: { id: ObjectId | null; x: number; y: number }[] = [
      ...TREES.map((t) => ({ id: t.id as ObjectId, x: t.x, y: t.y })),
      ...BOULDERS.map((b) => ({ id: null, x: b.x, y: b.y })),
      { id: 'log', x: (LOG.x0 + LOG.x1) / 2, y: (LOG.y0 + LOG.y1) / 2 },
    ];
    const p = spots[Math.floor(random(s) * spots.length)];
    out.push(cand('explore', { t: 'obj', id: p.id ?? 'log', x: p.x, y: p.y }, drive * 0.55 * (1 - 0.6 * habit(e, 'explore')) * distMul(dist(e, p)), 2 + 6 * T.curiosity, `explore:obj`, p.id?.startsWith('tree') ? 'чешется о дерево' : 'обследует вольер'));
  }
}

// Вещь кипера лежит так близко к решётке, что слон дотянется хоботом
export function grabbableFromZone(x: number, y: number, zones: ZoneId[]): boolean {
  if (zones.includes('barn') && x > 10.5 && x < 29.5 && y > 30 && y < 31.05) return true;
  if (zones.includes('paddock') && y > 20 && y < 21.05 && ((x > 2.5 && x < 9.5) || (x > 30.5 && x < 45.5))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Общество, переходы между зонами, кипер
// ---------------------------------------------------------------------------

function addSocial(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const n = e.needs;
  const T = e.profile.traits;
  if (n.social > 15) {
    for (const o of s.elephants) {
      if (o === e || !canReachZone(s, e, zoneOf(o))) continue;
      const b = bond(s, e.id, o.id);
      if (b < 0.05) continue;
      const d = dist(e, o);
      if (d < 3.5) continue;
      const score = urg(n.social, 15, 75) * (0.25 + 0.9 * T.sociability) * (0.4 + b) * distMul(d);
      out.push(cand('socialize', { t: 'el', id: o.id }, score, 3 + 7 * T.sociability, `socialize:${o.id}`, `идёт к ${nameCase(o.profile.name, 'dat')}`));
    }
  }
}

function friendsIn(s: State, e: Elephant, zone: ZoneId): number {
  let v = 0;
  for (const o of s.elephants) if (o !== e && zoneOf(o) === zone) v += Math.max(0, bond(s, e.id, o.id) + 0.2);
  return v;
}

function addZoneMoves(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const n = e.needs;
  const T = e.profile.traits;
  const pull = indoorPull(s.t);
  const will = signalWillingness(e);
  if (c.zone === 'barn') {
    const lonely = T.sociability * clamp(friendsIn(s, e, 'paddock') - friendsIn(s, e, 'barn') * 0.6);
    const settled = s.t - e.mem.zoneSince < 35 ? 0.3 : 1; // только что пришла — не бегает туда-сюда
    const want = Math.min(0.8, ((0.3 + 0.7 * c.daylight) * (0.3 + 0.7 * urg(n.boredom, 15, 75)) * (0.5 + 0.25 * T.curiosity + 0.25 * T.activity) + 0.4 * lonely) * (1 - 0.9 * pull)) * settled;
    if (want > 0.05) {
      if (s.world.gateOpen) {
        const p = randomPoint(c, 'paddock');
        if (p) out.push(cand('wander', { t: 'point', x: p.x, y: p.y, face: null }, want * 1.05, 0, 'go:paddock', 'выходит на выгул'));
      } else {
        out.push(cand('signal', { t: 'gate', side: 'barn' }, want * (0.25 + 0.8 * will), 0, 'signal:out', 'просится наружу', 'out'));
      }
    }
  } else {
    const lonely = T.sociability * clamp(friendsIn(s, e, 'barn') - friendsIn(s, e, 'paddock') * 0.6);
    const hayInside = s.world.hay.barnRack > 10 ? 1 : 0.45;
    const cold = c.temp < 13 ? 0.3 : 0;
    const settled = s.t - e.mem.zoneSince < 35 && pull < 0.5 ? 0.3 : 1;
    const want = Math.min(0.85, pull * (0.45 + 0.4 * urg(n.fatigue, 15, 70)) * (0.6 + 0.4 * hayInside) + 0.4 * lonely + cold) * settled;
    if (want > 0.05) {
      if (s.world.gateOpen) {
        const p = randomPoint(c, 'barn');
        if (p) out.push(cand('wander', { t: 'point', x: p.x, y: p.y, face: null }, want * 1.05, 0, 'go:barn', 'идёт в слоновник'));
      } else {
        out.push(cand('signal', { t: 'gate', side: 'paddock' }, want * (0.25 + 0.8 * will), 0, 'signal:in', 'хочет в слоновник', 'in'));
      }
    }
  }
}

function addKeeper(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const n = e.needs;
  const T = e.profile.traits;
  const L = e.learned;
  const k = keeperContact(s);
  if (!k || !c.zones.includes(k.zone)) {
    // Нужда без выхода: пустая кормушка или поилка — позвать кипера
    addNeedSignals(c, out);
    return;
  }
  const d = dist(e, k.spot);
  if (d > 26) return;
  // Кипер несёт еду — прожорливые идут следом вдоль решётки
  const held = s.keeper.held;
  if (held && (held.kind === 'ration' || held.kind === 'hay' || held.kind === 'browse')) {
    const score = (0.3 + 0.7 * urg(n.hunger, 10, 70)) * T.foodDrive * (0.45 + 0.55 * L.trust) * 0.95;
    out.push(cand('seekKeeper', { t: 'point', x: k.spot.x, y: k.spot.y, face: k.face }, score * distMul(d), 6, 'seekKeeper', 'ждёт угощения у решётки'));
  }
  // Просит внимания: общительные и доверчивые
  const social = Math.max(urg(n.social, 10, 70), urg(n.boredom, 25, 85));
  const att = social * (0.2 + 0.8 * T.sociability) * L.trust * (0.35 + 0.65 * L.expectation) * (1 - 0.5 * T.nervousness) * 0.95;
  out.push(cand('signal', { t: 'point', x: k.spot.x, y: k.spot.y, face: k.face }, att * distMul(d), 0, 'signal:attention', 'просит внимания', 'attention'));
  addNeedSignals(c, out);
}

function addNeedSignals(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const n = e.needs;
  const w = s.world;
  const will = signalWillingness(e);
  // Голодна, а еды в доступных зонах нет
  if (n.hunger > 58) {
    const anyHay = c.zones.some((z) => (z === 'barn' ? w.hay.barnRack : w.hay.paddockFeeder) >= 1);
    const anyProduce = c.zones.includes('barn') && w.trough.portions > 0.05 && !troughSpoiled(s);
    const anyItems = w.food.some((f) => f.kind !== 'remains' && c.zones.includes(f.zone));
    const anyDrum = c.zones.includes('paddock') && w.drum > 0.2;
    if (!anyHay && !anyProduce && !anyItems && !anyDrum) {
      const station = c.zone === 'barn' ? 'barnRack' : 'paddockFeeder';
      const slot = Math.max(0, freeSlot(s, e, station));
      out.push(cand('signal', { t: 'slot', station, slot }, urg(n.hunger, 55, 95) * (0.3 + 0.9 * will) * 1.1, 0, 'signal:food', 'требует еды', 'food'));
    }
  }
  if (n.thirst > 55) {
    const station = c.zone === 'barn' ? 'barnWater' : 'paddockWater';
    const any = c.zones.some((z) => w.water[z === 'barn' ? 'barnWater' : 'paddockWater'].level >= 3) || (c.zones.includes('paddock') && w.pool.dirt < 0.7);
    if (!any || w.water[station].level < 3) {
      const slot = Math.max(0, freeSlot(s, e, station));
      out.push(cand('signal', { t: 'slot', station, slot }, urg(n.thirst, 50, 95) * (0.3 + 0.9 * will) * (any ? 0.5 : 1.2), 0, 'signal:water', 'просит воды', 'water'));
    }
  }
}

// ---------------------------------------------------------------------------
// Бродить, стоять, нервно ходить взад-вперёд
// ---------------------------------------------------------------------------

export function randomPoint(c: Ctx, zone: ZoneId): Vec | null {
  const { s, e } = c;
  const cells = openCells(zone, radiusOf(e) + 0.1);
  const T = e.profile.traits;
  let best: Vec | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 9; i++) {
    const p = cells[Math.floor(random(s) * cells.length)];
    if (!p) break;
    const d = dist(e, p);
    let score = -Math.abs(d - (5 + 14 * T.activity)) * 0.08;
    for (const o of s.elephants) {
      if (o === e) continue;
      const od = dist(o, p);
      const b = bond(s, e.id, o.id);
      if (od < 3) score -= 1.2;
      else if (od < 8) score += (T.sociability - 0.45) * 0.6 + b * 0.3;
    }
    if (c.heatU > 0.3) score += shadeAt(p.x, p.y) * c.heatU * 1.5;
    if (T.sensitivity > 0.5 && s.world.dung.some((d2) => dist(d2, p) < 1.8)) score -= 0.8;
    if (inPool(p.x, p.y, 0.5)) score -= 0.6;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function addIdleAndWander(c: Ctx, out: Candidate[]): void {
  const { e } = c;
  const T = e.profile.traits;
  const n = e.needs;
  const zone = c.zones.length > 1 ? (c.daylight > 0.5 ? 'paddock' : 'barn') : c.zone;
  const p = randomPoint(c, c.zones.includes(zone) ? zone : c.zone);
  if (p) {
    out.push(cand('wander', { t: 'point', x: p.x, y: p.y, face: null }, 0.12 + 0.22 * T.activity + 0.18 * urg(n.boredom, 30, 90) * T.activity, 0, 'wander', 'бродит'));
  }
  out.push(cand('idle', null, 0.1 + 0.08 * (1 - T.activity), 1.5 + 3 * (1 - T.activity), 'idle', 'стоит'));
  // Стереотипия: нервное хождение — признак стресса или тоски
  const distress = Math.max(n.stress, n.boredom - 12);
  if (distress > 52) {
    const aux = paceLine(c);
    if (aux) {
      const score = urg(distress, 52, 95) * (0.3 + 0.7 * Math.max(T.nervousness, T.sensitivity)) * 0.95;
      out.push(cand('pace', { t: 'point', x: e.x, y: e.y, face: null }, score, 10 + 15 * T.nervousness, 'pace', n.stress > n.boredom ? 'нервно ходит взад-вперёд' : 'ходит взад-вперёд от скуки', null, aux));
    }
  }
}

function paceLine(c: Ctx): Vec | null {
  const { s, e } = c;
  const r = radiusOf(e);
  for (let k = 0; k < 8; k++) {
    const a = e.heading + (k * Math.PI) / 4;
    const len = 4.5;
    const x = e.x + Math.cos(a) * len;
    const y = e.y + Math.sin(a) * len;
    let ok = true;
    for (let j = 1; j <= 6 && ok; j++) {
      const px = e.x + (Math.cos(a) * len * j) / 6;
      const py = e.y + (Math.sin(a) * len * j) / 6;
      if (!elephantCanStand(px, py, r, s.world.gateOpen)) ok = false;
    }
    if (ok) return { x, y };
  }
  return null;
}

// ---------------------------------------------------------------------------

export function candidates(s: State, e: Elephant): Candidate[] {
  const zone = zoneOf(e);
  const temp = temperature(s.seed, s.t);
  const c: Ctx = {
    s,
    e,
    zone,
    zones: reachableZones(s, e),
    temp,
    daylight: 1 - darkness(s.t),
    heatU: urg(e.needs.heat, 15, 70),
    r: radiusOf(e),
  };
  const out: Candidate[] = [];
  addFeeding(c, out);
  addDrinking(c, out);
  addElimination(c, out);
  addRest(c, out);
  addCoolingAndPlay(c, out);
  addExplore(c, out);
  addSocial(c, out);
  addZoneMoves(c, out);
  addKeeper(c, out);
  addIdleAndWander(c, out);
  const filtered = out.filter((x) => x.score > 0.005 && (e.mem.cooldown[x.key] ?? -1) <= s.t && (e.mem.cooldown[x.key.split(':')[0]] ?? -1) <= s.t);
  // Небольшой разброс: одинаковые условия не дают одинакового поведения у разных слонов
  for (const x of filtered) x.score *= 1 + (random(s) - 0.5) * 0.18;
  // Грязная зона давит на чувствительных: им хочется уйти в другую
  if (e.profile.traits.sensitivity > 0.55 && c.zones.length > 1) {
    const other = zone === 'barn' ? 'paddock' : 'barn';
    if (cachedDirt(s, zone) > cachedDirt(s, other) + 0.15) {
      for (const x of filtered) if (x.kind === 'wander' && x.target?.t === 'point' && zoneAt(x.target.x, x.target.y) === other) x.score *= 1.4;
    }
  }
  return filtered.sort((a, b) => b.score - a.score);
}
