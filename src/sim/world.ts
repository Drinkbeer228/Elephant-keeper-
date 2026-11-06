// Физическое состояние вольеров: подстилка, моча, навоз, сор, опилки, корм, вода, яблоки, тазы, мяч.

import { FLOOR, FOOD, KEEPER, WATER } from '../data/balance';
import {
  BALL_START,
  BEDDING,
  DRAIN,
  H,
  POOL,
  STATIONS,
  TREES,
  TROUGH_IDS,
  W,
  areaAt,
  hardFloor,
  inEllipse,
  inRect,
  zoneAt,
  type AreaId,
  type TroughId,
  type ZoneId,
} from '../data/facility';
import { vegTotal } from '../data/rations';
import { fx, log } from './events';
import { inPool } from './geometry';
import { elephantCanStand } from './nav';
import { clamp, range } from './rng';
import { temperature } from './time';
import type { FoodItem, FoodItemKind, LooseItem, State, Tub } from './types';

export function cellOf(x: number, y: number): number {
  const cx = Math.max(0, Math.min(W - 1, Math.floor(x)));
  const cy = Math.max(0, Math.min(H - 1, Math.floor(y)));
  return cy * W + cx;
}

export function cellCenter(i: number): { x: number; y: number } {
  return { x: (i % W) + 0.5, y: Math.floor(i / W) + 0.5 };
}

export function isBeddingCell(i: number): boolean {
  const c = cellCenter(i);
  return inRect(BEDDING, c.x, c.y);
}

export function isHardCell(i: number): boolean {
  const c = cellCenter(i);
  return hardFloor(c.x, c.y);
}

export function forCells(x: number, y: number, r: number, fn: (i: number, cx: number, cy: number) => void): void {
  for (let cy = Math.max(0, Math.floor(y - r)); cy <= Math.min(H - 1, Math.floor(y + r)); cy++) {
    for (let cx = Math.max(0, Math.floor(x - r)); cx <= Math.min(W - 1, Math.floor(x + r)); cx++) {
      const dx = cx + 0.5 - x;
      const dy = cy + 0.5 - y;
      if (dx * dx + dy * dy <= r * r) fn(cy * W + cx, cx + 0.5, cy + 0.5);
    }
  }
}

export function touchCells(s: State): void {
  s.world.cellsVersion++;
}

// ---------------------------------------------------------------------------
// Моча, навоз, сор
// ---------------------------------------------------------------------------

export type UrineSpot = 'tank' | 'drain' | 'outside' | 'bedding' | 'concrete' | 'pool';

// Бак под слонихой: стоит на полу в радиусе метра от струи
export function tankUnder(s: State, x: number, y: number): LooseItem | null {
  let best: LooseItem | null = null;
  // Бак широкий (65 л), струя — не точка: стоящей боком у стенки он под ней
  let bestD = 1.35;
  for (const it of s.world.items) {
    if (it.kind !== 'tank') continue;
    const d = Math.hypot(it.x - x, it.y - y);
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}

export function urinateAt(s: State, x: number, y: number): UrineSpot {
  const zone = zoneAt(x, y);
  const tank = tankUnder(s, x, y);
  if (tank && tank.load + FLOOR.urineLiters <= KEEPER.tankLiters) {
    tank.load += FLOOR.urineLiters;
    fx('tank', tank.x, tank.y);
    return 'tank';
  }
  if (inPool(x, y)) {
    s.world.pool.dirt = clamp(s.world.pool.dirt + 0.02);
    return 'pool';
  }
  if (zone === 'barn' && Math.hypot(x - DRAIN.x, y - DRAIN.y) <= DRAIN.r) {
    fx('drain', x, y);
    return 'drain';
  }
  const c = s.world.cells;
  let onBedding = false;
  forCells(x, y, FLOOR.urineRadius, (i, cx, cy) => {
    const z = zoneAt(cx, cy);
    if (!z) return;
    const k = 1 - Math.hypot(cx - x, cy - y) / (FLOOR.urineRadius + 0.6);
    let add = FLOOR.urineWet * k;
    // Опилки впитывают часть сразу
    if (c.sawdust[i] > 0.1) add *= 1 - FLOOR.sawdustAbsorb * c.sawdust[i];
    c.wet[i] = clamp(c.wet[i] + add);
    if (isBeddingCell(i) && c.bedding[i] > 0.05) onBedding = true;
  });
  touchCells(s);
  if (tank) log(s, 'warn', 'Бак полон — моча пошла мимо. Полный бак выливают в слив, потом подставляют снова.', { key: 'tankFull', cooldown: 30 });
  if (zone === 'paddock') return 'outside';
  return onBedding ? 'bedding' : 'concrete';
}

export function dropDung(s: State, x: number, y: number): 'pool' | 'ground' {
  if (inPool(x, y)) {
    s.world.pool.dirt = clamp(s.world.pool.dirt + WATER.poolDirtDung);
    return 'pool';
  }
  const zone = zoneAt(x, y) ?? 'paddock';
  s.world.dung.push({ id: s.nextId++, x, y, t: s.t, zone });
  return 'ground';
}

// Рассыпанное сено и солома: на твёрдом полу — сор, который метут; на подстилке — просто ещё подстилка
export function addLitter(s: State, x: number, y: number, amount: number, r = 0.9): void {
  const c = s.world.cells;
  let any = false;
  forCells(x, y, r, (i, cx, cy) => {
    if (!zoneAt(cx, cy) && !hardFloor(cx, cy)) return;
    const k = amount * (1 - 0.5 * (Math.hypot(cx - x, cy - y) / (r + 0.01)));
    if (isBeddingCell(i)) c.bedding[i] = clamp(c.bedding[i] + k * 0.4);
    else c.litter[i] = clamp(c.litter[i] + k);
    any = true;
  });
  if (any) touchCells(s);
}

// Слон наступил на залежавшийся навоз: куча растаптывается в грязь вокруг
export function trample(s: State, x: number, y: number, r: number): boolean {
  const w = s.world;
  const idx = w.dung.findIndex((d) => s.t - d.t > FLOOR.trampleAfter && Math.hypot(d.x - x, d.y - y) < r);
  if (idx < 0) return false;
  const d = w.dung[idx];
  w.dung.splice(idx, 1);
  forCells(d.x, d.y, 1.1, (i, cx, cy) => {
    if (!zoneAt(cx, cy)) return;
    w.cells.soil[i] = clamp(w.cells.soil[i] + FLOOR.trampleSoil * (1 - Math.hypot(cx - d.x, cy - d.y) / 1.8));
  });
  touchCells(s);
  return true;
}

// ---------------------------------------------------------------------------
// Корм на полу
// ---------------------------------------------------------------------------

export function addFood(s: State, kind: FoodItemKind, x: number, y: number, amount: number, zone: ZoneId, rot = 0): FoodItem {
  const item: FoodItem = { id: s.nextId++, kind, x, y, amount, t: s.t, zone, rot };
  s.world.food.push(item);
  return item;
}

// Разбросать куски по отсеку вокруг точки, только там, где слон пройдёт
export function scatterPieces(s: State, x: number, y: number, area: AreaId, pieces: number, kind: FoodItemKind, amount: number): number {
  let placed = 0;
  for (let i = 0; i < pieces * 5 && placed < pieces; i++) {
    const px = x + range(s, -4.5, 4.5);
    const py = y + range(s, -5.5, 5.5);
    if (areaAt(px, py) !== area) continue;
    if (!elephantCanStand(px, py, 0.4, 0)) continue;
    if (inEllipse(POOL, px, py, 0.4)) continue;
    addFood(s, kind, px, py, amount, area === 'paddock' ? 'paddock' : 'barn');
    placed++;
  }
  return placed;
}

// Стадия яблока: свежее → спелое → бродит → гниль
export type FruitStage = 'fresh' | 'ripe' | 'ferment' | 'rotten';

export function fruitStage(rot: number): FruitStage {
  if (rot < 0.3) return 'fresh';
  if (rot < FOOD.fruitFerment) return 'ripe';
  if (rot < FOOD.fruitRotten) return 'ferment';
  return 'rotten';
}

// Яблоки с дерева: падают под крону
export function dropFruit(s: State, treeId: string, n: number): number {
  const tree = TREES.find((t) => t.id === treeId);
  if (!tree) return 0;
  const have = s.world.trees[treeId] ?? 0;
  const count = Math.min(have, n);
  let placed = 0;
  for (let i = 0; i < count * 4 && placed < count; i++) {
    const a = range(s, 0, Math.PI * 2);
    const d = range(s, 0.8, tree.canopy * 0.95);
    const x = tree.x + Math.cos(a) * d;
    const y = tree.y + Math.sin(a) * d;
    if (zoneAt(x, y) !== 'paddock' || !elephantCanStand(x, y, 0.2, 0)) continue;
    addFood(s, 'fruit', x, y, FOOD.fruitHunger, 'paddock', range(s, 0.12, 0.28));
    placed++;
  }
  s.world.trees[treeId] = have - placed;
  if (placed) fx('fruitFall', tree.x, tree.y);
  return placed;
}

// ---------------------------------------------------------------------------
// Лёжка и чистота
// ---------------------------------------------------------------------------

// Насколько удобно лежать в точке: сухая свежая подстилка — 1, песок на выгуле — около 0.7, бетон — 0.25
export function lyingComfort(s: State, x: number, y: number): number {
  const zone = zoneAt(x, y);
  if (!zone) return 0;
  if (inPool(x, y, 0.8)) return 0;
  const c = s.world.cells;
  let sum = 0;
  let n = 0;
  forCells(x, y, 1.4, (i) => {
    const base = isBeddingCell(i) ? 0.55 + 0.45 * c.bedding[i] : zone === 'paddock' ? 0.68 : 0.25;
    // Опилки смягчают вред мокрого — но не делают его сухим
    const wet = c.wet[i] * (1 - 0.6 * c.sawdust[i]);
    sum += base * (1 - 0.85 * wet) * (1 - 0.7 * c.soil[i]);
    n++;
  });
  let comfort = n ? sum / n : 0;
  if (s.world.dung.some((d) => Math.hypot(d.x - x, d.y - y) < 1.6)) comfort *= 0.45;
  return comfort;
}

// Грязно ли под лежащим слоном: мокро, грязь, навоз рядом
export function lyingDirt(s: State, x: number, y: number): { wet: number; dung: number } {
  const c = s.world.cells;
  let wet = 0;
  let soil = 0;
  let n = 0;
  forCells(x, y, 1.3, (i) => {
    wet += c.wet[i] * (1 - 0.6 * c.sawdust[i]);
    soil += c.soil[i];
    n++;
  });
  const dung = s.world.dung.some((d) => Math.hypot(d.x - x, d.y - y) < 1.8) ? 1 : 0;
  return { wet: n ? (wet + soil) / n : 0, dung };
}

// Грязь зоны 0..1 (для отчёта, тревог и стресса чувствительных слонов)
export function zoneDirt(s: State, zone: ZoneId): number {
  const c = s.world.cells;
  let dirt = 0;
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    const p = cellCenter(i);
    if (zoneAt(p.x, p.y) !== zone) continue;
    n++;
    const bedPenalty = zone === 'barn' && isBeddingCell(i) ? (1 - c.bedding[i]) * 0.35 : 0;
    const litter = !isBeddingCell(i) ? c.litter[i] * (zone === 'barn' ? 0.35 : 0.15) : 0;
    dirt += Math.min(1, c.wet[i] * (zone === 'paddock' ? 0.3 : 1) + c.soil[i] + bedPenalty + litter);
  }
  const dung = s.world.dung.filter((d) => d.zone === zone).length;
  const remains = s.world.food.filter((f) => f.zone === zone && (f.kind === 'remains' || (f.kind === 'fruit' && f.rot >= FOOD.fruitRotten))).length;
  const shards = s.world.items.filter((it) => it.kind === 'shard' && zoneAt(it.x, it.y) === zone).length;
  const area = Math.max(1, n);
  return clamp(dirt / area + dung * (zone === 'barn' ? 0.035 : 0.015) + remains * 0.01 + shards * 0.02);
}

export function cleanliness(s: State, zone: ZoneId): number {
  return 1 - zoneDirt(s, zone);
}

// Сор и опилки, которые ещё надо убрать (для сдачи смены)
export function floorLeftovers(s: State): { litter: number; sawdust: number; wetHard: number } {
  const c = s.world.cells;
  let litter = 0;
  let sawdust = 0;
  let wetHard = 0;
  for (let i = 0; i < W * H; i++) {
    // На песке выгула сено — дело граблей и чистоты выгула, здесь — только твёрдый пол
    if (c.litter[i] > 0.15 && isHardCell(i)) litter++;
    if (c.sawdust[i] > 0.15) sawdust++;
    if (c.wet[i] > 0.3 && isHardCell(i)) wetHard++;
  }
  return { litter, sawdust, wetHard };
}

// ---------------------------------------------------------------------------
// Поилки
// ---------------------------------------------------------------------------

export function troughOfArea(area: AreaId): TroughId {
  return area === 'paddock' ? 'paddockWater' : area === 'stallW' ? 'barnWaterW' : 'barnWaterE';
}

// Можно ли пить: вода есть, нет моющего средства, сора терпимо (для этой слонихи)
export function troughDrinkable(s: State, id: TroughId, sensitivity: number, thirst: number): boolean {
  const t = s.world.troughs[id];
  if (t.level < 3 || t.chem > 0.05) return false;
  const limit = WATER.debrisRefuse + (1 - sensitivity) * 0.3 + (thirst > 75 ? 0.3 : 0);
  return t.debris < limit;
}

function troughCenter(id: TroughId): { x: number; y: number } {
  const r = STATIONS[id].rect!;
  return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
}

function updateTroughs(s: State, dt: number): void {
  const w = s.world;
  for (const id of TROUGH_IDS) {
    const t = w.troughs[id];
    if (t.drain) {
      t.level = Math.max(0, t.level - WATER.drain * dt);
      if (t.valve) t.level = Math.max(0, t.level - WATER.fill * dt * 0.2); // промывка проточной водой
      if (t.level <= 0 && t.stage === 'ok') t.stage = 'drained';
    }
    if (t.valve) {
      if (!t.drain) t.level = Math.min(WATER.max, t.level + WATER.fill * dt);
      // Налили чистую после полного цикла мытья — вода сменена
      if (!t.drain && t.stage === 'rinsed' && t.level > 30) {
        t.stage = 'ok';
        t.debris = 0;
        t.changed = s.t;
        w.checks.troughChanged[id] = true;
        log(s, 'good', `${STATIONS[id].label}: вымыта, вода сменена.`, { silent: true });
      } else if (!t.drain && t.stage !== 'ok' && t.level > 30) {
        // Налили, не закончив мытьё: остаток средства или сора остаётся в воде
        if (t.stage === 'chem' || t.stage === 'scrubbed') {
          t.chem = Math.max(t.chem, 0.6);
          log(s, 'bad', `${STATIONS[id].label}: средство не смыли — пить из неё нельзя. Слей и ополосни.`, { key: `chemLeft:${id}`, cooldown: 30 });
        } else t.debris *= 0.5; // просто сменили воду: свежее, но стенки не отмыты
        t.stage = 'ok';
      }
      if (t.level >= WATER.max && !t.drain) {
        t.overflow += dt;
        if (t.overflow >= WATER.overflowEvery) {
          t.overflow = 0;
          const p = troughCenter(id);
          const y = id === 'paddockWater' ? p.y - 1.0 : p.y - 1.1;
          forCells(p.x, y, 1.4, (i, cx, cy) => {
            if (zoneAt(cx, cy)) w.cells.wet[i] = clamp(w.cells.wet[i] + 0.3);
          });
          touchCells(s);
          log(s, 'warn', `${STATIONS[id].label}: вода переливается через край — закрой кран.`, { key: `overflow:${id}`, cooldown: 30, x: p.x, y: p.y });
        }
      } else t.overflow = 0;
    } else t.overflow = 0;
    if (t.level > 5) t.debris = clamp(t.debris + WATER.debrisSettle * dt);
  }
}

// ---------------------------------------------------------------------------
// Тазы
// ---------------------------------------------------------------------------

export function tubById(s: State, id: number): Tub | undefined {
  return s.world.tubs.find((t) => t.id === id);
}

export function tubKg(t: Tub): number {
  return vegTotal(t.veg);
}

// ---------------------------------------------------------------------------
// Ежеминутные процессы мира
// ---------------------------------------------------------------------------

export function updateWorld(s: State, dt: number, dtSec: number): void {
  const w = s.world;
  updateTroughs(s, dt);
  // Бассейн: открытый кран понемногу освежает воду
  if (w.pool.valve) w.pool.dirt = Math.max(0, w.pool.dirt - WATER.poolRefresh * dt);

  // Сушка: песок на выгуле и бетон сохнут сами, мокрая солома — почти нет, опилки подсушивают
  const c = w.cells;
  let changed = false;
  if (dt > 0) {
    for (let i = 0; i < c.wet.length; i++) {
      if (c.wet[i] <= 0) continue;
      const p = cellCenter(i);
      const zone = zoneAt(p.x, p.y);
      let rate: number = FLOOR.concreteDry;
      if (zone === 'paddock') rate = FLOOR.sandDry;
      else if (zone === 'barn' && isBeddingCell(i)) rate = FLOOR.beddingDry + FLOOR.sawdustDry * c.sawdust[i];
      if (Math.hypot(p.x - DRAIN.x, p.y - DRAIN.y) < 2.2) rate = FLOOR.drainDry;
      const before = c.wet[i];
      c.wet[i] = Math.max(0, c.wet[i] - rate * dt);
      if (Math.abs(before - c.wet[i]) > 0 && (c.wet[i] === 0 || Math.floor(before * 20) !== Math.floor(c.wet[i] * 20))) changed = true;
    }
  }
  if (changed) touchCells(s);

  // Остатки корма портятся, яблоки зреют, бродят и гниют
  const temp = temperature(s.seed, s.t);
  const rotK = FOOD.fruitRot * Math.max(0.3, 0.6 + 0.04 * (temp - 10));
  for (const f of w.food) {
    if (f.kind === 'fruit') {
      const before = f.rot;
      f.rot = Math.min(1.2, f.rot + rotK * dt);
      if (before < FOOD.fruitFerment && f.rot >= FOOD.fruitFerment) {
        log(s, 'info', 'Под яблоней забродили паданцы — пахнет сидром.', { key: 'ferment', cooldown: 240, x: f.x, y: f.y, silent: true });
      }
    } else if ((f.kind === 'produce' || f.kind === 'hay' || f.kind === 'straw') && s.t - f.t > FOOD.spoilAfter) {
      f.kind = 'remains';
      f.amount = 1;
    }
  }
  // Пустые тазы на полу: отмечаем, с какого времени
  for (const t of w.tubs) {
    if (t.where !== 'floor') continue;
    if (tubKg(t) <= 0.05) {
      if (t.emptySince < 0) t.emptySince = s.t;
      t.dirty = true;
    } else t.emptySince = -1;
  }
  updateBall(s, dtSec);
}

// Мяч катится, трётся о песок и отскакивает от препятствий
export function updateBall(s: State, dtSec: number): void {
  const b = s.world.ball;
  const speed = Math.hypot(b.vx, b.vy);
  if (speed < 0.02) {
    b.vx = 0;
    b.vy = 0;
    return;
  }
  const nx = b.x + b.vx * dtSec;
  const ny = b.y + b.vy * dtSec;
  const r = BALL_START.r;
  const inside = (x: number, y: number) => zoneAt(x, y) === 'paddock' && elephantCanStand(x, y, r, 0);
  if (inside(nx, ny)) {
    b.x = nx;
    b.y = ny;
  } else if (inside(nx, b.y)) {
    b.x = nx;
    b.vy = -b.vy * 0.6;
  } else if (inside(b.x, ny)) {
    b.y = ny;
    b.vx = -b.vx * 0.6;
  } else {
    b.vx = -b.vx * 0.5;
    b.vy = -b.vy * 0.5;
  }
  const water = inPool(b.x, b.y);
  const friction = water ? 2.2 : 0.9;
  const k = Math.max(0, 1 - friction * dtSec);
  b.vx *= k;
  b.vy *= k;
}

export function kickBall(s: State, dirX: number, dirY: number, power: number): void {
  const b = s.world.ball;
  b.vx += dirX * power;
  b.vy += dirY * power;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > 4.5) {
    b.vx *= 4.5 / sp;
    b.vy *= 4.5 / sp;
  }
  fx('ball', b.x, b.y);
}
