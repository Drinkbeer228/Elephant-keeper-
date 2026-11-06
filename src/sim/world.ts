// Физическое состояние вольеров: подстилка, моча, навоз, корм, вода, бассейн, мяч.

import { FLOOR, FOOD, WATER } from '../data/balance';
import { BALL_START, BEDDING, DRAIN, DUST_PIT, H, POOL, STATIONS, W, inEllipse, inRect, zoneAt, type ZoneId } from '../data/facility';
import { fx, log } from './events';
import { inPool } from './geometry';
import { elephantCanStand } from './nav';
import { clamp, range } from './rng';
import type { FoodItem, FoodItemKind, State } from './types';

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

// Куда попала моча
export type UrineSpot = 'drain' | 'outside' | 'bedding' | 'concrete' | 'pool';

export function urinateAt(s: State, x: number, y: number): UrineSpot {
  const zone = zoneAt(x, y);
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
    c.wet[i] = clamp(c.wet[i] + FLOOR.urineWet * k);
    if (isBeddingCell(i) && c.bedding[i] > 0.05) onBedding = true;
  });
  touchCells(s);
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

export function addFood(s: State, kind: FoodItemKind, x: number, y: number, amount: number, zone: ZoneId): FoodItem {
  const item: FoodItem = { id: s.nextId++, kind, x, y, amount, t: s.t, zone };
  s.world.food.push(item);
  return item;
}

// Разбросать куски по зоне за решёткой: точки в 2–6 м от линии контакта, только там, где слон пройдёт
export function scatterPieces(s: State, x: number, y: number, zone: ZoneId, pieces: number, kind: FoodItemKind, amount: number): number {
  let placed = 0;
  for (let i = 0; i < pieces * 4 && placed < pieces; i++) {
    const px = x + range(s, -4.5, 4.5);
    const py = y + range(s, -5.5, 5.5);
    if (zoneAt(px, py) !== zone) continue;
    if (!elephantCanStand(px, py, 0.4, false)) continue;
    if (inEllipse(POOL, px, py, 0.4)) continue;
    addFood(s, kind, px, py, amount, zone);
    placed++;
  }
  return placed;
}

// Насколько удобно лежать в точке: сухая свежая подстилка — 1, песок на выгуле — около 0.7, бетон — 0.25
export function lyingComfort(s: State, x: number, y: number): number {
  const zone = zoneAt(x, y);
  if (!zone) return 0;
  if (inPool(x, y, 0.8)) return 0;
  const c = s.world.cells;
  let sum = 0;
  let n = 0;
  forCells(x, y, 1.4, (i) => {
    const base = isBeddingCell(i) ? 0.55 + 0.45 * c.bedding[i] : zone === 'paddock' ? (inEllipse(DUST_PIT, x, y) ? 0.78 : 0.68) : 0.25;
    sum += base * (1 - 0.85 * c.wet[i]) * (1 - 0.7 * c.soil[i]);
    n++;
  });
  let comfort = n ? sum / n : 0;
  if (s.world.dung.some((d) => Math.hypot(d.x - x, d.y - y) < 1.6)) comfort *= 0.45;
  return comfort;
}

// Чистота зоны 0..1 (для отчёта, тревог и стресса чувствительных слонов)
export function zoneDirt(s: State, zone: ZoneId): number {
  const c = s.world.cells;
  let dirt = 0;
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    const p = cellCenter(i);
    if (zoneAt(p.x, p.y) !== zone) continue;
    n++;
    const bedPenalty = zone === 'barn' && isBeddingCell(i) ? (1 - c.bedding[i]) * 0.35 : 0;
    dirt += Math.min(1, c.wet[i] * (zone === 'paddock' ? 0.3 : 1) + c.soil[i] + bedPenalty);
  }
  const dung = s.world.dung.filter((d) => d.zone === zone).length;
  const remains = s.world.food.filter((f) => f.zone === zone && f.kind === 'remains').length;
  const area = Math.max(1, n);
  return clamp(dirt / area + dung * (zone === 'barn' ? 0.035 : 0.015) + remains * 0.01);
}

export function cleanliness(s: State, zone: ZoneId): number {
  return 1 - zoneDirt(s, zone);
}

export function waterStation(id: 'barnWater' | 'paddockWater'): { x: number; y: number } {
  return STATIONS[id].slots![0];
}

// Ежеминутные процессы мира
export function updateWorld(s: State, dt: number, dtSec: number): void {
  const w = s.world;
  // Краны поилок: вода прибывает; переполненная поилка мочит пол рядом
  for (const id of ['barnWater', 'paddockWater'] as const) {
    const wp = w.water[id];
    if (!wp.valve) continue;
    wp.level = Math.min(WATER.max, wp.level + WATER.fill * dt);
    if (wp.level >= WATER.max) {
      wp.overflow += dt;
      if (wp.overflow >= WATER.overflowEvery) {
        wp.overflow = 0;
        const st = STATIONS[id];
        const r = st.rect!;
        const x = (r.x0 + r.x1) / 2;
        const y = id === 'barnWater' ? (r.y0 + r.y1) / 2 : r.y0 - 0.6;
        forCells(id === 'barnWater' ? x + 1.4 : x, y, 1.6, (i, cx, cy) => {
          if (zoneAt(cx, cy)) w.cells.wet[i] = clamp(w.cells.wet[i] + 0.35);
        });
        touchCells(s);
        log(s, 'warn', `${st.label}: вода переливается через край — закрой кран.`, { key: `overflow:${id}`, cooldown: 30, x, y });
      }
    } else wp.overflow = 0;
  }
  // Бассейн: открытый кран понемногу освежает воду
  if (w.pool.valve) w.pool.dirt = Math.max(0, w.pool.dirt - WATER.poolRefresh * dt);

  // Сушка: песок на выгуле и бетон сохнут сами, мокрая солома — почти нет
  const c = w.cells;
  let changed = false;
  if (dt > 0) {
    for (let i = 0; i < c.wet.length; i++) {
      if (c.wet[i] <= 0) continue;
      const p = cellCenter(i);
      const zone = zoneAt(p.x, p.y);
      let rate: number = FLOOR.concreteDry;
      if (zone === 'paddock') rate = FLOOR.sandDry;
      else if (zone === 'barn' && isBeddingCell(i)) rate = FLOOR.beddingDry;
      if (Math.hypot(p.x - DRAIN.x, p.y - DRAIN.y) < 2.2) rate = FLOOR.drainDry;
      const before = c.wet[i];
      c.wet[i] = Math.max(0, c.wet[i] - rate * dt);
      if (Math.abs(before - c.wet[i]) > 0 && (c.wet[i] === 0 || Math.floor(before * 20) !== Math.floor(c.wet[i] * 20))) changed = true;
    }
  }
  if (changed) touchCells(s);

  // Остатки корма портятся
  const trough = w.trough;
  if (trough.portions > 0 && s.t - trough.since > FOOD.spoilAfter) {
    log(s, 'warn', 'Овощи в кормушке слоновника испортились — вычисти кормушку.', { key: 'trough:spoiled', cooldown: 240 });
  }
  for (const f of w.food) {
    if ((f.kind === 'produce' || f.kind === 'hay') && s.t - f.t > FOOD.spoilAfter) {
      f.kind = 'remains';
      f.amount = 1;
    }
  }

  updateBall(s, dtSec);
}

export function troughSpoiled(s: State): boolean {
  return s.world.trough.portions > 0 && s.t - s.world.trough.since > FOOD.spoilAfter;
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
  const inside = (x: number, y: number) => zoneAt(x, y) === 'paddock' && elephantCanStand(x, y, r, false);
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
