// Навигация: сетка 0.5 м с полем зазора (расстояние до ближайшего препятствия).
// Слон проходит там, где зазор не меньше его радиуса, — поэтому большой слон не
// протиснется в дверь кипера, а ворота пропустят любого, когда открыты.

import { AREA_IDS, DOORS, GATES, H, W, areaAt, gateSolid, inEllipse, POOL, zoneAt, type AreaId, type Rect } from '../data/facility';
import { distToRect, elephantIndex, keeperIndex, type SpatialIndex } from './geometry';
import type { Vec } from './types';

export const CELL = 0.5;
export const GW = Math.round(W / CELL);
export const GH = Math.round(H / CELL);
const MAXC = 1.25;

function cellCenter(i: number): Vec {
  return { x: ((i % GW) + 0.5) * CELL, y: (Math.floor(i / GW) + 0.5) * CELL };
}

export function cellIndex(x: number, y: number): number {
  const cx = Math.max(0, Math.min(GW - 1, Math.floor(x / CELL)));
  const cy = Math.max(0, Math.min(GH - 1, Math.floor(y / CELL)));
  return cy * GW + cx;
}

function buildField(index: SpatialIndex, extra: Rect[], allow: (x: number, y: number) => boolean): Float32Array {
  const field = new Float32Array(GW * GH);
  for (let i = 0; i < field.length; i++) {
    const { x, y } = cellCenter(i);
    if (!allow(x, y)) {
      field[i] = 0;
      continue;
    }
    let d = index.clearance(x, y);
    for (const r of extra) d = Math.min(d, distToRect(x, y, r));
    field[i] = Math.min(MAXC, d);
  }
  return field;
}

// ---------------------------------------------------------------------------
// Поля зазора для слонов (по маске открытых ворот) и для кипера
// ---------------------------------------------------------------------------

const doorRects = DOORS.map((d) => d.rect);
const inElephantZone = (x: number, y: number) => zoneAt(x, y) !== null;

function closedGates(mask: number): Rect[] {
  return GATES.filter((g) => !((g.id === 'outer' ? 1 : 2) & mask)).map((g) => g.rect);
}

// Для кипера закрытые ворота — по частям: в щель между створками человек проходит
function closedGateParts(mask: number): Rect[] {
  return GATES.filter((g) => !((g.id === 'outer' ? 1 : 2) & mask)).flatMap((g) => gateSolid(g));
}

const elephantFields = new Map<number, Float32Array>();

function elephantField(mask: number): Float32Array {
  let f = elephantFields.get(mask);
  if (!f) {
    f = buildField(elephantIndex, [...closedGates(mask), ...doorRects], inElephantZone);
    elephantFields.set(mask, f);
  }
  return f;
}

export function elephantClearance(x: number, y: number, mask: number): number {
  if (x < 0 || y < 0 || x >= W || y >= H) return 0;
  return elephantField(mask)[cellIndex(x, y)];
}

// Точная проверка позиции слона (между узлами сетки)
export function elephantCanStand(x: number, y: number, r: number, mask: number): boolean {
  if (zoneAt(x, y) === null) return false;
  let d = elephantIndex.clearance(x, y);
  for (const g of closedGates(mask)) d = Math.min(d, distToRect(x, y, g));
  for (const door of doorRects) d = Math.min(d, distToRect(x, y, door));
  return d >= r;
}

// Кипер: ворота и отсеки, куда он может войти, — поле по ключу
const keeperFields = new Map<string, Float32Array>();

export interface KeeperNavState {
  mask: number; // открытые ворота
  access: AreaId[]; // отсеки, куда кипер может войти
}

function keeperKey(s: KeeperNavState): string {
  return `${s.mask}:${AREA_IDS.filter((a) => s.access.includes(a)).join(',')}`;
}

function keeperField(s: KeeperNavState): Float32Array {
  const key = keeperKey(s);
  let f = keeperFields.get(key);
  if (!f) {
    const extra: Rect[] = [...closedGateParts(s.mask)];
    for (const d of DOORS) if (!s.access.includes(d.area)) extra.push(d.rect);
    const allowed = (x: number, y: number) => {
      const a = areaAt(x, y);
      if (a && !s.access.includes(a)) return false;
      return !inEllipse(POOL, x, y, 0.3);
    };
    f = buildField(keeperIndex, extra, (x, y) => x > 0.5 && y > 0.5 && x < W - 0.5 && y < H - 0.5 && allowed(x, y));
    keeperFields.set(key, f);
  }
  return f;
}

// ---------------------------------------------------------------------------
// A* по сетке с порогом зазора
// ---------------------------------------------------------------------------

class Heap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, p: number): void {
    const items = this.items;
    const prio = this.prio;
    let i = items.length;
    items.push(item);
    prio.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (prio[parent] <= p) break;
      items[i] = items[parent];
      prio[i] = prio[parent];
      i = parent;
    }
    items[i] = item;
    prio[i] = p;
  }
  pop(): number {
    const items = this.items;
    const prio = this.prio;
    const top = items[0];
    const lastItem = items.pop()!;
    const lastPrio = prio.pop()!;
    if (items.length) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= items.length) break;
        const r = l + 1;
        const c = r < items.length && prio[r] < prio[l] ? r : l;
        if (prio[c] >= lastPrio) break;
        items[i] = items[c];
        prio[i] = prio[c];
        i = c;
      }
      items[i] = lastItem;
      prio[i] = lastPrio;
    }
    return top;
  }
}

const gScore = new Float32Array(GW * GH);
const cameFrom = new Int32Array(GW * GH);
const stamp = new Uint32Array(GW * GH);
let stampId = 1;

function nearestOpen(field: Float32Array, i: number, need: number): number {
  if (field[i] >= need) return i;
  const cx = i % GW;
  const cy = Math.floor(i / GW);
  for (let rad = 1; rad <= 8; rad++) {
    let best = -1;
    let bestD = Infinity;
    for (let y = cy - rad; y <= cy + rad; y++) {
      for (let x = cx - rad; x <= cx + rad; x++) {
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== rad) continue;
        const j = y * GW + x;
        if (field[j] < need) continue;
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

function lineClear(field: Float32Array, a: Vec, b: Vec, need: number): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(len / 0.25));
  for (let k = 1; k <= n; k++) {
    const x = a.x + ((b.x - a.x) * k) / n;
    const y = a.y + ((b.y - a.y) * k) / n;
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    if (field[cellIndex(x, y)] < need) return false;
  }
  return true;
}

function astar(field: Float32Array, from: Vec, to: Vec, need: number, cost?: (i: number) => number, smooth = need): Vec[] | null {
  const start = nearestOpen(field, cellIndex(from.x, from.y), need);
  const goal = nearestOpen(field, cellIndex(to.x, to.y), need);
  if (start < 0 || goal < 0) return null;
  stampId++;
  const open = new Heap();
  gScore[start] = 0;
  cameFrom[start] = -1;
  stamp[start] = stampId;
  const gx = goal % GW;
  const gy = Math.floor(goal / GW);
  const h = (i: number) => {
    const dx = Math.abs((i % GW) - gx);
    const dy = Math.abs(Math.floor(i / GW) - gy);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  open.push(start, h(start));
  const closed = new Set<number>();
  let found = false;
  let guard = 0;
  while (open.size && guard++ < 40000) {
    const cur = open.pop();
    if (cur === goal) {
      found = true;
      break;
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    const cx = cur % GW;
    const cy = Math.floor(cur / GW);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const ni = ny * GW + nx;
        if (field[ni] < need) continue;
        if (dx && dy && (field[cy * GW + nx] < need || field[ny * GW + cx] < need)) continue;
        const step = (dx && dy ? 1.4142 : 1) * (cost ? cost(ni) : 1);
        const g = gScore[cur] + step;
        if (stamp[ni] !== stampId || g < gScore[ni]) {
          stamp[ni] = stampId;
          gScore[ni] = g;
          cameFrom[ni] = cur;
          open.push(ni, g + h(ni));
        }
      }
    }
  }
  if (!found) return null;
  const cells: Vec[] = [];
  for (let i = goal; i !== -1 && i !== start; i = cameFrom[i]) cells.push(cellCenter(i));
  cells.reverse();
  // Сглаживание: от центра стартовой клетки — к самой дальней видимой. Результат зависит
  // только от клеток, поэтому кеш маршрутов детерминирован (важно для повтора после загрузки)
  const raw = [cellCenter(start), ...cells];
  if (field[cellIndex(to.x, to.y)] >= need) raw.push(to);
  const out: Vec[] = [];
  let anchor = raw[0];
  let i = 1;
  while (i < raw.length) {
    let j = raw.length - 1;
    while (j > i && !lineClear(field, anchor, raw[j], smooth)) j--;
    out.push(raw[j]);
    anchor = raw[j];
    i = j + 1;
  }
  if (!out.length) out.push(to);
  return out;
}

const pathCache = new Map<string, Vec[] | null>();

function poolCost(i: number): number {
  const c = cellCenter(i);
  return inEllipse(POOL, c.x, c.y) ? 1.8 : 1;
}

// Маршрут слона от точки к точке; null — недостижимо (например, ворота закрыты)
export function elephantRoute(from: Vec, to: Vec, radius: number, mask: number): Vec[] | null {
  const field = elephantField(mask);
  const need = Math.round(radius * 20) / 20;
  if (lineClear(field, from, to, need) && field[cellIndex(to.x, to.y)] >= need) return [to];
  const key = `${cellIndex(from.x, from.y)}:${cellIndex(to.x, to.y)}:${need}:${mask}`;
  let path = pathCache.get(key);
  if (path === undefined) {
    path = astar(field, from, to, need, poolCost);
    if (pathCache.size > 800) pathCache.clear();
    pathCache.set(key, path);
  }
  if (!path) return null;
  // Путь из кеша начинался из центра клетки: срезаем видимые точки от фактической позиции
  const pts = path.map((p) => ({ x: p.x, y: p.y }));
  while (pts.length > 1 && lineClear(field, from, pts[1], need)) pts.shift();
  return pts;
}

// Поле проверяется по центрам клеток, поэтому прямой отрезок мимо угла (косяк двери) может
// задеть его на сантиметры: сглаженный путь кипера держится от стен с запасом
const KEEPER_NEED = 0.34;
const KEEPER_SMOOTH = 0.5;

export function keeperRoute(from: Vec, to: Vec, s: KeeperNavState): Vec[] | null {
  const field = keeperField(s);
  if (lineClear(field, from, to, KEEPER_SMOOTH)) return [to];
  return astar(field, from, to, KEEPER_NEED, undefined, KEEPER_SMOOTH);
}

// Маршрут кипера в обход слонов: корпус непроходим, её личное место вокруг (soft) — дороже,
// так что кипер обходит, если есть где, а в тесноте идёт рядом. Клетки старта и цели остаются
// как были: подойти вплотную можно, когда это и есть цель.
export interface Obstacle {
  x: number;
  y: number;
  r: number;
  soft: number;
}

export function keeperRouteAround(from: Vec, to: Vec, s: KeeperNavState, bodies: Obstacle[]): Vec[] | null {
  if (!bodies.length) return keeperRoute(from, to, s);
  const base = keeperField(s);
  const need = KEEPER_NEED;
  const field = new Float32Array(base);
  const extra = new Float32Array(GW * GH);
  for (const b of bodies) {
    const R = b.r + need + b.soft;
    const x0 = Math.max(0, Math.floor((b.x - R) / CELL));
    const x1 = Math.min(GW - 1, Math.floor((b.x + R) / CELL));
    const y0 = Math.max(0, Math.floor((b.y - R) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((b.y + R) / CELL));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * GW + cx;
        const c = cellCenter(i);
        const d = Math.hypot(c.x - b.x, c.y - b.y) - b.r;
        if (d < need) field[i] = Math.min(field[i], Math.max(0, d));
        else if (b.soft > 0 && d < need + b.soft) extra[i] = Math.max(extra[i], 4 * (1 - (d - need) / b.soft));
      }
    }
  }
  for (const p of [from, to]) {
    const i = cellIndex(p.x, p.y);
    field[i] = base[i];
  }
  const clear = (a: Vec, b: Vec) => {
    if (!lineClear(field, a, b, KEEPER_SMOOTH)) return false;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / 0.25));
    for (let k = 1; k < n; k++) if (extra[cellIndex(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n)] > 0) return false;
    return true;
  };
  if (clear(from, to)) return [to];
  return astar(field, from, to, need, (i) => 1 + extra[i], KEEPER_SMOOTH);
}

export function keeperFieldAt(x: number, y: number, s: KeeperNavState): number {
  return keeperField(s)[cellIndex(x, y)];
}

// Ближайшая точка, где слон с таким радиусом может стоять
export function nearestStandable(p: Vec, radius: number, mask: number): Vec | null {
  const field = elephantField(mask);
  const i = nearestOpen(field, cellIndex(p.x, p.y), radius);
  if (i < 0) return null;
  if (field[cellIndex(p.x, p.y)] >= radius) return { x: p.x, y: p.y };
  return cellCenter(i);
}

// Случайные точки по зоне выбирают из списка открытых клеток — заранее посчитанного
const openCellsCache = new Map<string, Vec[]>();

// Свободные клетки отсека (при закрытых воротах), где слон такого размера может стоять
export function openCells(area: AreaId, radius: number): Vec[] {
  // Поле зазора ограничено ~1.2 м, поэтому порог тоже ограничиваем: иначе крупной слонихе «негде встать»
  const need = Math.min(1.15, Math.round(radius * 10) / 10);
  const key = `${area}:${need}`;
  let list = openCellsCache.get(key);
  if (!list) {
    const field = elephantField(0);
    list = [];
    for (let i = 0; i < field.length; i++) {
      if (field[i] < need) continue;
      const c = cellCenter(i);
      if (areaAt(c.x, c.y) === area) list.push(c);
    }
    openCellsCache.set(key, list);
  }
  return list;
}
