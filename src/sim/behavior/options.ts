// Оценка вариантов поведения: каждая потребность и черта характера дают вклад в полезность.
// Здесь только «что хочется сделать и насколько», исполнение — в act.ts.

import { ELEPHANT, FOOD } from '../../data/balance';
import {
  AREA_ZONE,
  BEDDING,
  BOULDERS,
  DRUM,
  DUST_PIT,
  FEEDER_IDS,
  GATE_BY_ID,
  LOG,
  POOL,
  STATIONS,
  TIRE,
  TOILET_STANCE,
  TREES,
  TROUGH_IDS,
  areaAt,
  inEllipse,
  inRect,
  shadeAt,
  type AreaId,
  type StationId,
  type ZoneId,
} from '../../data/facility';
import { closestOnSegment, dist, inPool } from '../geometry';
import { openCells, elephantCanStand } from '../nav';
import { clamp, random, range } from '../rng';
import { darkness, indoorPull, sleepPressure, temperature } from '../time';
import type { ActivityKind, Elephant, FoodKind, ObjectId, SignalKind, State, TargetRef, Vec } from '../types';
import { fruitStage, lyingComfort, troughDrinkable, troughOfArea, tubKg } from '../world';
import { cachedDirt } from './needs';
import {
  areaOf,
  blockingGate,
  bond,
  canReachArea,
  freeSlot,
  gateMask,
  keeperMeet,
  radiusOf,
  rankOf,
  reachableAreas,
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
  area: AreaId;
  areas: AreaId[];
  zones: ZoneId[];
  temp: number;
  daylight: number;
  heatU: number;
  r: number;
  mask: number;
}

// Ресурс в другом отсеке чуть менее привлекателен: идти через ворота дольше
function areaMul(c: Ctx, area: AreaId | null | undefined): number {
  if (!area) return 0.7;
  if (area === c.area) return 1;
  return AREA_ZONE[area] === c.zone ? 0.9 : 0.78;
}

function reach(c: Ctx, area: AreaId | null | undefined): boolean {
  return !!area && c.areas.includes(area);
}

function cand(kind: ActivityKind, target: TargetRef | null, score: number, dur: number, key: string, note: string, signal: SignalKind | null = null, aux: Vec | null = null): Candidate {
  return { kind, target, score, dur, key, signal, note, aux };
}

function satiety(e: Elephant): number {
  return 12 + 26 * (1 - e.profile.traits.foodDrive);
}

// ---------------------------------------------------------------------------
// Еда
// ---------------------------------------------------------------------------

function eaterOf(s: State, e: Elephant, t: TargetRef): Elephant | null {
  for (const o of s.elephants) {
    if (o === e) continue;
    const ot = o.act.target;
    if (o.act.kind !== 'eat' || !ot) continue;
    if (t.t === 'food' && ot.t === 'food' && ot.id === t.id) return o;
    if (t.t === 'tub' && ot.t === 'tub' && ot.id === t.id) return o;
  }
  return null;
}

// Можно ли отнять: старшая по рангу, уверенная и достаточно голодная
function canSteal(e: Elephant, o: Elephant): boolean {
  const T = e.profile.traits;
  return rankOf(e) > rankOf(o) + 0.05 && T.confidence > 0.45;
}

function addFeeding(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const T = e.profile.traits;
  const n = e.needs;
  const w = s.world;
  const sat = satiety(e);
  const before = out.length;
  const hungry = n.hunger > sat * 0.6;
  const hayU = phys(n.hunger, 18, 88) * (0.72 + 0.5 * T.foodDrive) * prefMul(e, 'hay');
  if (hungry) {
    for (const station of FEEDER_IDS) {
      const st = STATIONS[station];
      if (!reach(c, st.area)) continue;
      const fs = w.feeders[station];
      if (fs.hay < 1 && fs.straw < 1) continue;
      let slot = freeSlot(s, e, station);
      let crowd = 1;
      if (slot < 0) {
        // Все места заняты: властная может оттеснить младшую по рангу, робкая — подождёт
        let weakest = -1;
        let weakestRank = Infinity;
        st.slots!.forEach((_, i) => {
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
      const p = st.slots![slot];
      const d = dist(e, p);
      if (fs.hay >= 1) {
        out.push(cand('eat', { t: 'slot', station, slot }, hayU * crowd * distMul(d) * areaMul(c, st.area), 30 + 45 * T.foodDrive + 20 * T.persistence, `eat:${station}`, fs.straw >= 1 ? 'ест сено, выдёргивая солому' : 'ест сено'));
        // Унести охапку в сторону: самостоятельные, робкие у кормушки с соседями, любопытные
        if (fs.hay >= FOOD.carryAmount + 2 && crowd === 1) {
          let pressure = 0;
          for (const o of s.elephants) if (o !== e && dist(o, p) < 4.5 && rankOf(o) > rankOf(e)) pressure += 1;
          const dest = carrySpot(c, p);
          if (dest) {
            const score = hayU * 0.55 * (0.15 + 0.5 * (1 - T.sociability) + 0.55 * Math.min(1, pressure) * (1 - T.confidence) + 0.2 * T.curiosity) * (1 - 0.5 * habit(e, 'carry'));
            out.push(cand('carry', { t: 'slot', station, slot }, score * distMul(d) * areaMul(c, st.area), 0, `carry:${station}`, 'уносит охапку сена в сторону', null, dest));
          }
        }
      } else {
        // Одна солома: едят без охоты, разборчивые почти не трогают
        const score = phys(n.hunger, 35, 92) * (0.3 + 0.45 * T.foodDrive) * (1 - 0.45 * T.sensitivity) * crowd * distMul(d) * areaMul(c, st.area);
        out.push(cand('eat', { t: 'slot', station, slot }, score, 12 + 16 * T.foodDrive, `eat:${station}`, 'нехотя жуёт солому'));
      }
    }
  }
  // Свой таз с овощами — самое желанное; чужой — для уверенных и прожорливых
  for (const tub of w.tubs) {
    if (tub.where !== 'floor' || tub.broken) continue;
    const kg = tubKg(tub);
    if (kg < 0.3) continue;
    const a = areaAt(tub.x, tub.y);
    if (!reach(c, a)) continue;
    if (n.hunger < sat * 0.3) continue;
    const own = tub.owner === e.id;
    const eater = eaterOf(s, e, { t: 'tub', id: tub.id });
    let score = (0.35 + phys(n.hunger, 5, 80)) * (0.85 + 0.5 * T.foodDrive) * prefMul(e, 'produce') * distMul(dist(e, tub)) * areaMul(c, a);
    let note = 'ест овощи из своего таза';
    if (!own) {
      const owner = s.elephants.find((o) => o.id === tub.owner);
      score *= Math.min(0.85, 0.15 + 1.1 * T.foodDrive * T.confidence);
      if (eater) {
        if (!canSteal(e, eater)) continue;
        score *= 0.8;
      }
      note = owner ? `лезет в таз ${nameCase(owner.profile.name, 'gen')}` : 'ест из чужого таза';
    } else if (eater && !canSteal(e, eater)) score *= 0.3;
    out.push(cand('eat', { t: 'tub', id: tub.id }, score, 6 + kg / FOOD.vegKgPerMin, `eat:tub:${tub.id}`, note));
  }
  // Разбросанный корм, ветки, бамбук, яблоки — ещё и занятие для хобота
  for (const f of w.food) {
    if (f.kind === 'remains') continue;
    const a = areaAt(f.x, f.y);
    if (!reach(c, a)) continue;
    const d = dist(e, f);
    if (d > 30) continue;
    const eater = eaterOf(s, e, { t: 'food', id: f.id });
    if (eater && (!canSteal(e, eater) || dist(eater, f) > 4)) continue;
    let score: number;
    let dur: number;
    let note: string;
    switch (f.kind) {
      case 'browse':
        score = (0.25 + 0.4 * urg(n.hunger, 10, 80) + 0.5 * urg(n.boredom, 10, 70)) * (0.5 + 0.6 * T.curiosity) * prefMul(e, 'browse') * (1 - 0.6 * habit(e, 'browse'));
        dur = 10 + 15 * T.persistence;
        note = 'обдирает ветки';
        break;
      case 'bamboo':
        score = (0.22 + 0.35 * urg(n.hunger, 10, 80) + 0.55 * urg(n.boredom, 10, 70)) * (0.45 + 0.4 * T.curiosity + 0.3 * T.persistence) * prefMul(e, 'browse') * (1 - 0.55 * habit(e, 'bamboo'));
        dur = 14 + 18 * T.persistence;
        note = 'расщепляет бамбук и грызёт листья';
        break;
      case 'hay':
        if (!hungry) continue;
        score = hayU * 0.95;
        dur = 20 + 30 * T.foodDrive;
        note = 'ест сено с пола';
        break;
      case 'straw':
        if (n.hunger < 50) continue;
        score = phys(n.hunger, 40, 92) * (0.25 + 0.4 * T.foodDrive);
        dur = 8;
        note = 'перебирает солому';
        break;
      case 'fruit': {
        const stage = fruitStage(f.rot);
        score = (0.35 + 0.6 * urg(n.hunger, 5, 70)) * (0.7 + 0.5 * T.foodDrive) * prefMul(e, 'produce') * 1.1;
        if (stage === 'ferment') score *= 0.9 + 0.6 * T.foodDrive - 0.4 * T.sensitivity;
        if (stage === 'rotten') score *= 0.15;
        dur = 2.5;
        note = stage === 'ferment' ? 'подбирает забродившее яблоко' : 'подбирает яблоко';
        break;
      }
      default:
        score = (0.3 + 0.7 * urg(n.hunger, 5, 70)) * (0.6 + 0.6 * T.foodDrive) * (0.7 + 0.6 * T.curiosity) * prefMul(e, 'produce') * (1 - 0.35 * habit(e, 'scatter'));
        dur = 3;
        note = 'ищет разбросанные куски';
    }
    if (eater) {
      score *= (0.5 + 0.6 * T.confidence) * (0.6 + 0.5 * T.foodDrive);
      note = `отнимает корм у ${nameCase(eater.profile.name, 'gen')}`;
    } else {
      // Властные тянутся туда, где едят другие
      const near = s.elephants.some((o) => o !== e && o.act.kind === 'eat' && dist(o, f) < 3.5 && rankOf(o) < rankOf(e));
      if (near) score *= 1 + 0.35 * T.confidence;
    }
    out.push(cand('eat', { t: 'food', id: f.id }, score * distMul(d) * areaMul(c, a), dur, `eat:food:${f.id}`, note));
  }
  // Кормовой барабан: корм достаётся медленно — для упорных и любопытных
  if (reach(c, 'paddock') && w.drum > 0.2) {
    const score = (0.25 + 0.4 * urg(n.hunger, 10, 80) + 0.45 * urg(n.boredom, 15, 75)) * (0.45 + 0.4 * T.curiosity + 0.45 * T.persistence) * (1 - 0.6 * habit(e, 'drum'));
    out.push(cand('eat', { t: 'obj', id: 'drum', x: DRUM.x, y: DRUM.y }, score * distMul(dist(e, DRUM)), 5 + 16 * T.persistence, 'eat:drum', 'достаёт корм из барабана'));
  }
  // Яблоня: потрясти — нападают яблоки
  if (reach(c, 'paddock')) {
    for (const tree of TREES) {
      if (!tree.fruit || (w.trees[tree.id] ?? 0) < 2) continue;
      const lying = w.food.filter((f) => f.kind === 'fruit' && dist(f, tree) < tree.canopy + 0.6 && f.rot < FOOD.fruitRotten).length;
      if (lying >= 4) continue;
      const score = (0.1 + 0.35 * urg(n.hunger, 10, 70) + 0.3 * urg(n.boredom, 15, 70)) * (0.3 + 0.35 * T.curiosity + 0.3 * T.foodDrive + 0.25 * T.playfulness) * prefMul(e, 'produce') * (1 - 0.6 * habit(e, 'shake'));
      out.push(cand('shake', { t: 'obj', id: tree.id as ObjectId, x: tree.x, y: tree.y }, score * distMul(dist(e, tree)), 1.5 + 2 * T.persistence, `shake:${tree.id}`, 'трясёт яблоню'));
    }
  }
  // Совсем голодна и есть нечего — жуёт подстилку
  if (out.length === before && n.hunger > 66 && inRect(BEDDING, e.x, e.y)) {
    out.push(cand('eat', { t: 'point', x: e.x, y: e.y, face: null }, urg(n.hunger, 60, 95) * 0.55, 8, 'eat:bedding', 'жуёт подстилку от голода'));
  }
}

// Куда унести охапку: подальше от старших, в тени снаружи или на подстилке внутри
function carrySpot(c: Ctx, from: Vec): Vec | null {
  const { s, e } = c;
  const T = e.profile.traits;
  let best: Vec | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 10; i++) {
    const area = c.areas[Math.floor(random(s) * c.areas.length)];
    const cells = openCells(area, c.r + 0.1);
    const p = cells[Math.floor(random(s) * cells.length)];
    if (!p) continue;
    const d = dist(p, from);
    if (d < 4 || d > 13) continue;
    let score = -Math.abs(d - 7) * 0.08;
    if (area !== c.area) score -= 0.4;
    if (AREA_ZONE[area] === 'barn' && inRect(BEDDING, p.x, p.y)) score += 0.3;
    if (AREA_ZONE[area] === 'paddock') score += shadeAt(p.x, p.y) * 0.5;
    for (const o of s.elephants) {
      if (o === e) continue;
      const od = dist(o, p);
      if (od < 3) score -= 1;
      else if (od < 7) score += rankOf(o) > rankOf(e) ? -0.5 : (T.sociability - 0.4) * 0.4 + bond(s, e.id, o.id) * 0.3;
    }
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Вода
// ---------------------------------------------------------------------------

function addDrinking(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const n = e.needs;
  if (n.thirst < 18) return;
  const T = e.profile.traits;
  const base = phys(n.thirst, 18, 85) * (1 + 0.3 * c.heatU);
  for (const station of TROUGH_IDS) {
    const st = STATIONS[station];
    if (!reach(c, st.area)) continue;
    if (!troughDrinkable(s, station, T.sensitivity, n.thirst)) continue;
    const slot = freeSlot(s, e, station);
    if (slot < 0) continue;
    const p = st.slots![slot];
    const debris = s.world.troughs[station].debris;
    out.push(cand('drink', { t: 'slot', station, slot }, base * 1.05 * (1 - 0.4 * debris) * distMul(dist(e, p)) * areaMul(c, st.area), 12, `drink:${station}`, 'пьёт'));
  }
  if (reach(c, 'paddock')) {
    const aversion = clamp(s.world.pool.dirt * (0.6 + 1.3 * T.sensitivity));
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
    if (areaAt(x, y) === 'paddock' && elephantCanStand(x, y, 0.9, 0)) return { x, y };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Туалет
// ---------------------------------------------------------------------------

// Куда встать, чтобы просить открыть ворота в нужный отсек
function gateTarget(c: Ctx, to: AreaId): TargetRef | null {
  const g = blockingGate(c.s, c.area, to);
  if (!g) return null;
  const def = GATE_BY_ID[g];
  const side = c.areas.includes(def.a) ? def.a : def.b;
  return { t: 'gate', gate: g, side };
}

// Где слониха просится в туалет: у каждой своя манера
function toiletSignalTarget(c: Ctx): TargetRef {
  const { s, e } = c;
  const h = e.profile.habits;
  // Приученная идёт к стоку сама и ждёт там кипера с баком
  if (e.learned.toilet > 0.5 && reach(c, areaAt(TOILET_STANCE.x, TOILET_STANCE.y))) return { t: 'point', x: TOILET_STANCE.x, y: TOILET_STANCE.y, face: TOILET_STANCE.face };
  if (h.signal === 'gate') return gateTarget(c, 'paddock') ?? { t: 'point', x: e.x, y: e.y, face: null };
  if (h.signal === 'stare') {
    // Встаёт перед кипером и смотрит на него
    const m = keeperMeet(s, e);
    if (m && reach(c, m.area)) return { t: 'point', x: m.spot.x, y: m.spot.y, face: m.face };
  }
  return { t: 'point', x: e.x, y: e.y, face: null };
}

function addElimination(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const n = e.needs;
  const T = e.profile.traits;
  if (n.bladder >= ELEPHANT.urgeBladder) {
    const u = urg(n.bladder, ELEPHANT.urgeBladder, 100);
    if (c.zone === 'paddock') {
      out.push(cand('urinate', { t: 'point', x: e.x, y: e.y, face: null }, 0.75 + 0.5 * u, 1.2, 'urinate', 'мочится'));
    } else if (reach(c, 'paddock')) {
      // Из слоновника — выйти на песок: так поступают почти все, особенно чистоплотные
      const p = { x: 15.5 + range(s, -3, 4), y: 14 + range(s, -2, 2) };
      out.push(cand('urinate', { t: 'point', x: p.x, y: p.y, face: null }, (0.7 + 0.4 * u) * (0.75 + 0.4 * T.sensitivity), 1.2, 'urinate', 'идёт на выгул в туалет'));
    } else {
      const will = signalWillingness(e) * (0.7 + 0.6 * e.learned.toilet);
      out.push(cand('signal', toiletSignalTarget(c), (0.55 + 0.5 * u) * (0.35 + 0.75 * will), 0, 'signal:toilet', 'просится в туалет', 'toilet'));
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
  const cells = openCells(c.area, radiusOf(e));
  let best: Vec | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 10; i++) {
    const p = cells[Math.floor(random(s) * cells.length)];
    if (!p) break;
    const d = dist(e, p);
    if (d > 16) continue;
    let score = -d * 0.15;
    for (const st of ['barnRackW', 'barnRackE', 'paddockFeeder', 'barnWaterW', 'barnWaterE', 'paddockWater'] as StationId[]) {
      const slot = STATIONS[st].slots![0];
      score += Math.min(8, dist(p, slot)) * 0.2;
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
  const press = sleepPressure(s.t) + 0.35 * e.tipsy;
  if (n.fatigue > 25 && press > 0.15) {
    const spot = sleepSpot(c);
    if (spot) {
      const need = 0.3 + 0.45 * T.sensitivity; // чувствительная не ляжет на мокрое и грязное
      const ok = spot.comfort >= need ? 1 : 0.12;
      const score = (0.15 + 0.8 * Math.min(1, press)) * phys(n.fatigue, 25, 90) * ok * (1 - 0.35 * urg(n.stress, 40, 90));
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
  const barn = c.areas.filter((a) => AREA_ZONE[a] === 'barn');
  const areas = barn.length ? barn : c.areas;
  for (const area of areas) {
    const cells = openCells(area, radiusOf(e) + 0.15);
    for (let i = 0; i < 12; i++) {
      const p = cells[Math.floor(random(s) * cells.length)];
      if (!p) break;
      const comfort = lyingComfort(s, p.x, p.y);
      let score = comfort - dist(e, p) * 0.01;
      // Не ложиться в проходах: у кормушек, поилок, стока и ворот
      for (const st of Object.values(STATIONS)) for (const sl of st.slots ?? []) if (dist(sl, p) < 2.6) score -= 0.5;
      for (const g of Object.values(GATE_BY_ID)) {
        const cx = (g.rect.x0 + g.rect.x1) / 2;
        const cy = (g.rect.y0 + g.rect.y1) / 2;
        if (Math.hypot(p.x - cx, p.y - cy) < 3.2) score -= 0.5;
      }
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
    if (shadeAt(p.x, p.y) < 0.4 || !elephantCanStand(p.x, p.y, radiusOf(e), c.mask)) continue;
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
// Вода, пыль, сено на спину, игра
// ---------------------------------------------------------------------------

function addCoolingAndPlay(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const n = e.needs;
  const T = e.profile.traits;
  const tired = urg(n.fatigue, 55, 95);
  if (reach(c, 'paddock')) {
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
  if (reach(c, 'stallE') && !s.elephants.some((o) => o !== e && o.act.kind === 'play' && o.act.target?.t === 'obj' && o.act.target.id === 'tire')) {
    const score = urg(n.boredom, 15, 75) * T.playfulness * (0.5 + 0.4 * T.activity) * (1 - 0.7 * habit(e, 'tire')) * (1 - tired) * 1.05;
    out.push(cand('play', { t: 'obj', id: 'tire', x: TIRE.x, y: TIRE.y }, score * distMul(dist(e, TIRE)), 4 + 10 * T.playfulness, 'play:tire', 'качает покрышку'));
  }
  // Сено и солома на спину: от жары, от скуки, просто так
  const pile = s.world.food
    .filter((f) => (f.kind === 'hay' || f.kind === 'straw') && f.amount > 2 && reach(c, areaAt(f.x, f.y)) && dist(f, e) < 9)
    .sort((a, b) => dist(a, e) - dist(b, e))[0];
  if (pile && !s.elephants.some((o) => o !== e && o.act.target?.t === 'food' && o.act.target.id === pile.id)) {
    const score = (0.08 + 0.35 * urg(n.boredom, 15, 70) + 0.35 * c.heatU) * (0.25 + 0.5 * T.playfulness + 0.3 * T.activity) * (1 - 0.5 * habit(e, 'toss')) * (1 - 0.35 * T.foodDrive);
    out.push(cand('toss', { t: 'food', id: pile.id }, score * distMul(dist(e, pile)), 2 + 3 * T.playfulness, 'toss', 'подбрасывает сено на спину'));
  }
  // Возня с подругой
  if (T.playfulness > 0.4 && n.fatigue < 70) {
    for (const o of s.elephants) {
      if (o === e || !canReachArea(s, e, areaOf(o)) || o.lying) continue;
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
// Исследование и шалости
// ---------------------------------------------------------------------------

// Вещь кипера лежит так близко к ограде выгула, что слон дотянется хоботом
export function grabbableFromArea(x: number, y: number, areas: AreaId[]): boolean {
  if (areas.includes('paddock') && y > 20 && y < 21.1 && ((x > 2.5 && x < 9.5) || (x > 30.5 && x < 45.5))) return true;
  return false;
}

// Ближайшая к слону точка лежащего шланга, до которой можно дотянуться из её отсеков
export function hoseReachPoint(s: State, e: Elephant, areas: AreaId[]): Vec | null {
  const h = s.world.hose;
  if (h.state === 'reel') return null;
  const pts = [...h.path, h.end];
  let best: Vec | null = null;
  let bestD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / 0.6));
    for (let k = 0; k <= n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
      const inside = areas.includes(areaAt(p.x, p.y) as AreaId);
      if (!inside && !grabbableFromArea(p.x, p.y, areas)) continue;
      const d = dist(e, p);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

function addExplore(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const n = e.needs;
  const T = e.profile.traits;
  const drive = T.curiosity * (0.3 + 0.7 * urg(n.boredom, 10, 70));
  // Вещи кипера: рядом с ней или забытые у самой ограды
  for (const it of s.world.items) {
    const a = areaAt(it.x, it.y);
    const inside = reach(c, a);
    const reachable = !inside && grabbableFromArea(it.x, it.y, c.areas);
    if (!inside && !reachable) continue;
    const d = dist(e, it);
    if (d > 25) continue;
    const pull = drive * 1.15 + 0.35 * T.mischief * urg(n.boredom, 10, 70);
    out.push(cand('explore', { t: 'item', id: it.id }, pull * distMul(d), 3 + 6 * T.curiosity, `explore:item:${it.id}`, reachable ? 'тянется к вещи за оградой' : 'изучает забытую вещь'));
  }
  // Шланг в зоне хобота — почти верная добыча для шкодливой
  const hp = hoseReachPoint(s, e, c.areas);
  if (hp) {
    const d = dist(e, hp);
    const score = (0.25 + 0.6 * urg(n.boredom, 10, 65)) * (0.2 + 0.45 * T.curiosity + 0.95 * T.mischief + 0.3 * T.playfulness) * (1 - 0.45 * habit(e, 'hose')) * distMul(d) * 1.3;
    out.push(cand('manipulate', { t: 'obj', id: 'hose', x: hp.x, y: hp.y }, score, 3 + 6 * T.mischief, 'manip:hose', 'тянет шланг хоботом'));
  }
  // Пустой таз: покатать, перевернуть, а шкодливая — и раскрошить
  for (const tub of s.world.tubs) {
    if (tub.where !== 'floor' || tub.broken || tubKg(tub) > 0.3) continue;
    if (!reach(c, areaAt(tub.x, tub.y))) continue;
    if (s.elephants.some((o) => o !== e && o.act.target?.t === 'tub' && o.act.target.id === tub.id)) continue;
    const score = (0.12 + 0.5 * urg(n.boredom, 10, 70)) * (0.12 + 0.9 * T.mischief + 0.35 * T.playfulness) * (1 - 0.5 * habit(e, 'tub'));
    out.push(cand('manipulate', { t: 'tub', id: tub.id }, score * distMul(dist(e, tub)), 2 + 5 * T.mischief, `manip:tub:${tub.id}`, 'катает пустой таз'));
  }
  if (drive < 0.05) return;
  // Кипер работает рядом — любопытные и привыкшие к нему подходят посмотреть и обнюхать
  const k = keeperMeet(s, e);
  if (k && reach(c, k.area)) {
    const L = e.learned;
    const near = dist(e, s.keeper) < 12;
    const busy = s.keeper.task || s.keeper.held ? 1 : 0.55;
    const social = 0.35 + 0.65 * L.trust * (0.4 + L.familiarity) * (0.5 + T.sociability);
    if (near && L.trust > 0.35) out.push(cand('explore', { t: 'point', x: k.spot.x, y: k.spot.y, face: k.face }, drive * 0.8 * social * busy * distMul(dist(e, k.spot)), 1.5 + 3 * T.curiosity, 'explore:keeper', 'подходит к киперу — обнюхать'));
  }
  // Природа: деревья, камни, бревно — почесаться, обнюхать
  if (reach(c, 'paddock')) {
    const spots: { id: ObjectId | null; x: number; y: number }[] = [
      ...TREES.map((t) => ({ id: t.id as ObjectId, x: t.x, y: t.y })),
      ...BOULDERS.map((b) => ({ id: null, x: b.x, y: b.y })),
      { id: 'log', x: (LOG.x0 + LOG.x1) / 2, y: (LOG.y0 + LOG.y1) / 2 },
    ];
    const p = spots[Math.floor(random(s) * spots.length)];
    out.push(cand('explore', { t: 'obj', id: p.id ?? 'log', x: p.x, y: p.y }, drive * 0.55 * (1 - 0.6 * habit(e, 'explore')) * distMul(dist(e, p)), 2 + 6 * T.curiosity, `explore:obj`, p.id?.startsWith('tree') ? 'чешется о дерево' : 'обследует вольер'));
  }
}

// ---------------------------------------------------------------------------
// Общество, переходы между отсеками, кипер
// ---------------------------------------------------------------------------

function addSocial(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const n = e.needs;
  const T = e.profile.traits;
  if (n.social > 15) {
    for (const o of s.elephants) {
      if (o === e) continue;
      const b = bond(s, e.id, o.id);
      if (b < 0.05) continue;
      const d = dist(e, o);
      if (d < 3.5) continue;
      if (canReachArea(s, e, areaOf(o))) {
        const score = urg(n.social, 15, 75) * (0.25 + 0.9 * T.sociability) * (0.4 + b) * distMul(d);
        out.push(cand('socialize', { t: 'el', id: o.id }, score, 3 + 7 * T.sociability, `socialize:${o.id}`, `идёт к ${nameCase(o.profile.name, 'dat')}`));
      } else if (AREA_ZONE[areaOf(o)] === 'barn' && c.zone === 'barn') {
        // Подруга за закрытыми разделительными воротами: подойти к створке и тянуться хоботом
        const x = c.area === 'stallW' ? 18.4 : 21.6;
        const y = Math.max(21.6, Math.min(31.2, o.y));
        const score = urg(n.social, 20, 80) * (0.2 + 0.8 * T.sociability) * (0.4 + b) * 0.8 * distMul(dist(e, { x, y }));
        out.push(cand('socialize', { t: 'el', id: o.id }, score, 3 + 6 * T.sociability, `socialize:${o.id}`, `тянется хоботом к ${nameCase(o.profile.name, 'dat')} через ворота`));
      }
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
      if (reach(c, 'paddock')) {
        const p = randomPoint(c, 'paddock');
        if (p) out.push(cand('wander', { t: 'point', x: p.x, y: p.y, face: null }, want * 1.05, 0, 'go:paddock', 'выходит на выгул'));
      } else {
        const g = gateTarget(c, 'paddock');
        if (g) out.push(cand('signal', g, want * (0.25 + 0.8 * will), 0, 'signal:out', 'просится наружу', 'out'));
      }
    }
  } else {
    const lonely = T.sociability * clamp(friendsIn(s, e, 'barn') - friendsIn(s, e, 'paddock') * 0.6);
    const hay = s.world.feeders.barnRackW.hay + s.world.feeders.barnRackE.hay;
    const hayInside = hay > 10 ? 1 : 0.45;
    const cold = c.temp < 13 ? 0.3 : 0;
    const settled = s.t - e.mem.zoneSince < 35 && pull < 0.5 ? 0.3 : 1;
    const want = Math.min(0.85, pull * (0.45 + 0.4 * urg(n.fatigue, 15, 70)) * (0.6 + 0.4 * hayInside) + 0.4 * lonely + cold) * settled;
    if (want > 0.05) {
      if (c.zones.includes('barn')) {
        const p = randomPoint(c, 'barn');
        if (p) out.push(cand('wander', { t: 'point', x: p.x, y: p.y, face: null }, want * 1.05, 0, 'go:barn', 'идёт в слоновник'));
      } else {
        const g = gateTarget(c, 'stallW');
        if (g) out.push(cand('signal', g, want * (0.25 + 0.8 * will), 0, 'signal:in', 'хочет в слоновник', 'in'));
      }
    }
  }
}

function addKeeper(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const n = e.needs;
  const T = e.profile.traits;
  const L = e.learned;
  const k = keeperMeet(s, e);
  if (!k || !reach(c, k.area)) {
    // Нужда без выхода: пустая кормушка или поилка — позвать кипера
    addNeedSignals(c, out);
    return;
  }
  const d = dist(e, k.spot);
  if (d > 26) return;
  // Кипер несёт еду — прожорливые идут следом
  const held = s.keeper.held;
  if (held && ['ration', 'hay', 'browse', 'bamboo', 'porridge', 'tub'].includes(held.kind)) {
    const mine = (held.kind === 'porridge' || held.kind === 'tub') && held.owner === e.id;
    const score = (0.3 + 0.7 * urg(n.hunger, 10, 70)) * (mine ? 1.2 : T.foodDrive) * (0.45 + 0.55 * L.trust) * 0.95;
    out.push(cand('seekKeeper', { t: 'point', x: k.spot.x, y: k.spot.y, face: k.face }, score * distMul(d), 6, 'seekKeeper', mine ? 'ждёт свою порцию' : 'идёт за тобой — у тебя еда'));
  }
  // Просит внимания: общительные и доверчивые; «торгующиеся» выпрашивают лакомство
  const social = Math.max(urg(n.social, 10, 70), urg(n.boredom, 25, 85));
  const beg = e.profile.habits.signal === 'beg' ? 0.35 * T.foodDrive * (s.keeper.pouch > 0 ? 1 : 0.5) : 0;
  const att = (social * (0.2 + 0.8 * T.sociability) * L.trust * (0.35 + 0.65 * L.expectation) * (1 - 0.5 * T.nervousness) + beg) * 0.95;
  out.push(cand('signal', { t: 'point', x: k.spot.x, y: k.spot.y, face: k.face }, att * distMul(d), 0, 'signal:attention', beg > 0.1 ? 'выпрашивает лакомство' : 'просит внимания', 'attention'));
  addNeedSignals(c, out);
}

function addNeedSignals(c: Ctx, out: Candidate[]): void {
  const { s, e } = c;
  const n = e.needs;
  const w = s.world;
  const will = signalWillingness(e);
  const T = e.profile.traits;
  // Голодна, а еды в доступных отсеках нет (одна солома — не еда)
  if (n.hunger > 58) {
    const anyHay = FEEDER_IDS.some((f) => reach(c, STATIONS[f].area) && w.feeders[f].hay >= 1);
    const anyTub = w.tubs.some((t) => t.where === 'floor' && !t.broken && tubKg(t) > 0.3 && reach(c, areaAt(t.x, t.y)));
    const anyItems = w.food.some((f) => f.kind !== 'remains' && f.kind !== 'straw' && reach(c, areaAt(f.x, f.y)));
    const anyDrum = reach(c, 'paddock') && w.drum > 0.2;
    if (!anyHay && !anyTub && !anyItems && !anyDrum) {
      const station = c.area === 'paddock' ? 'paddockFeeder' : c.area === 'stallW' ? 'barnRackW' : 'barnRackE';
      const slot = Math.max(0, freeSlot(s, e, station));
      out.push(cand('signal', { t: 'slot', station, slot }, urg(n.hunger, 55, 95) * (0.3 + 0.9 * will) * 1.1, 0, 'signal:food', 'требует еды', 'food'));
    }
  }
  if (n.thirst > 55) {
    const own = troughOfArea(c.area);
    const any = TROUGH_IDS.some((t) => reach(c, STATIONS[t].area) && troughDrinkable(s, t, T.sensitivity, n.thirst)) || (reach(c, 'paddock') && w.pool.dirt < 0.7);
    if (!any || !troughDrinkable(s, own, T.sensitivity, n.thirst)) {
      const slot = Math.max(0, freeSlot(s, e, own));
      out.push(cand('signal', { t: 'slot', station: own, slot }, urg(n.thirst, 50, 95) * (0.3 + 0.9 * will) * (any ? 0.5 : 1.2), 0, 'signal:water', w.troughs[own].debris > 0.4 ? 'просит свежей воды' : 'просит воды', 'water'));
    }
  }
}

// ---------------------------------------------------------------------------
// Бродить, стоять, нервно ходить взад-вперёд
// ---------------------------------------------------------------------------

export function randomPoint(c: Ctx, zone: ZoneId | null = null): Vec | null {
  const { s, e } = c;
  const areas = c.areas.filter((a) => !zone || AREA_ZONE[a] === zone);
  if (!areas.length) return null;
  const T = e.profile.traits;
  let best: Vec | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 9; i++) {
    const area = areas[Math.floor(random(s) * areas.length)];
    const cells = openCells(area, radiusOf(e) + 0.1);
    const p = cells[Math.floor(random(s) * cells.length)];
    if (!p) continue;
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
  const zone: ZoneId | null = c.zones.length > 1 ? (c.daylight > 0.5 ? 'paddock' : 'barn') : null;
  const p = randomPoint(c, zone) ?? randomPoint(c);
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
  const { e } = c;
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
      if (!elephantCanStand(px, py, r, c.mask)) ok = false;
    }
    if (ok) return { x, y };
  }
  return null;
}

// Шланг за оградой выгула: встать вплотную к ограде напротив и тянуться хоботом (слоны к северу от ограды)
export function hoseApproach(p: Vec): Vec {
  for (const line of [
    { y: 20, x0: 2.3, x1: 9.7 },
    { y: 20, x0: 30.3, x1: 45.7 },
  ]) {
    const c = closestOnSegment(p.x, p.y, line.x0, line.y, line.x1, line.y);
    if (c.d < 1.3 && p.y >= line.y) return { x: c.x, y: line.y - 1.95 };
  }
  return p;
}

// ---------------------------------------------------------------------------

export function candidates(s: State, e: Elephant): Candidate[] {
  const zone = zoneOf(e);
  const temp = temperature(s.seed, s.t);
  const c: Ctx = {
    s,
    e,
    zone,
    area: areaOf(e),
    areas: reachableAreas(s, e),
    zones: reachableZones(s, e),
    temp,
    daylight: 1 - darkness(s.t),
    heatU: urg(e.needs.heat, 15, 70),
    r: radiusOf(e),
    mask: gateMask(s),
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
      for (const x of filtered) if (x.kind === 'wander' && x.target?.t === 'point' && AREA_ZONE[areaAt(x.target.x, x.target.y) ?? 'paddock'] === other) x.score *= 1.4;
    }
  }
  return filtered.sort((a, b) => b.score - a.score);
}
