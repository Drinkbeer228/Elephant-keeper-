// Статическая геометрия для столкновений: прямоугольники и круги в пространственной сетке 1×1 м.

import {
  BOULDERS,
  DRUM,
  H,
  LOG,
  POOL,
  SOLIDS,
  STATIONS,
  TIRE,
  TREES,
  W,
  type Circle,
  type Rect,
} from '../data/facility';

export interface Obstacles {
  rects: Rect[];
  circles: Circle[];
  pool: boolean; // считать ли бассейн препятствием
}

function logCircles(): Circle[] {
  const out: Circle[] = [];
  const len = Math.hypot(LOG.x1 - LOG.x0, LOG.y1 - LOG.y0);
  const n = Math.ceil(len / 0.35);
  for (let i = 0; i <= n; i++) {
    out.push({ x: LOG.x0 + ((LOG.x1 - LOG.x0) * i) / n, y: LOG.y0 + ((LOG.y1 - LOG.y0) * i) / n, r: LOG.r });
  }
  return out;
}

export const NATURE_CIRCLES: Circle[] = [
  ...TREES.map((t) => ({ x: t.x, y: t.y, r: t.trunk + 0.08 })),
  ...BOULDERS,
  ...logCircles(),
  DRUM,
  TIRE,
];

// Препятствия для кипера: стены, ограды, мебель станций, природа и вода
export const KEEPER_OBSTACLES: Obstacles = {
  rects: [...SOLIDS.map((s) => s.rect), ...Object.values(STATIONS).flatMap((s) => (s.rect ? [s.rect] : []))],
  circles: NATURE_CIRCLES,
  pool: true,
};

// Препятствия для слонов внутри их зон: кормушки и поилки со своей стороны, природа
export const ELEPHANT_OBSTACLES: Obstacles = {
  rects: [
    ...SOLIDS.map((s) => s.rect),
    ...Object.values(STATIONS).flatMap((s) => (s.rect && s.zone ? [s.rect] : [])),
  ],
  circles: NATURE_CIRCLES,
  pool: false,
};

export function circleHitsRect(x: number, y: number, r: number, rect: Rect): boolean {
  const cx = Math.max(rect.x0, Math.min(x, rect.x1));
  const cy = Math.max(rect.y0, Math.min(y, rect.y1));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

export function distToRect(x: number, y: number, rect: Rect): number {
  const dx = Math.max(rect.x0 - x, 0, x - rect.x1);
  const dy = Math.max(rect.y0 - y, 0, y - rect.y1);
  return Math.hypot(dx, dy);
}

export function inPool(x: number, y: number, grow = 0): boolean {
  const dx = (x - POOL.x) / (POOL.rx + grow);
  const dy = (y - POOL.y) / (POOL.ry + grow);
  return dx * dx + dy * dy <= 1;
}

// Пространственная сетка, чтобы не перебирать все стены на каждом шаге
export class SpatialIndex {
  private cells: { rects: Rect[]; circles: Circle[] }[];

  constructor(private obs: Obstacles) {
    this.cells = Array.from({ length: W * H }, () => ({ rects: [], circles: [] }));
    const margin = 1.2;
    for (const r of obs.rects) {
      for (let y = Math.max(0, Math.floor(r.y0 - margin)); y <= Math.min(H - 1, Math.floor(r.y1 + margin)); y++) {
        for (let x = Math.max(0, Math.floor(r.x0 - margin)); x <= Math.min(W - 1, Math.floor(r.x1 + margin)); x++) {
          this.cells[y * W + x].rects.push(r);
        }
      }
    }
    for (const c of obs.circles) {
      for (let y = Math.max(0, Math.floor(c.y - c.r - margin)); y <= Math.min(H - 1, Math.floor(c.y + c.r + margin)); y++) {
        for (let x = Math.max(0, Math.floor(c.x - c.r - margin)); x <= Math.min(W - 1, Math.floor(c.x + c.r + margin)); x++) {
          this.cells[y * W + x].circles.push(c);
        }
      }
    }
  }

  // Пересекает ли круг (x, y, r) что-нибудь статическое
  hits(x: number, y: number, r: number): boolean {
    if (x - r < 0 || y - r < 0 || x + r > W || y + r > H) return true;
    const cell = this.cells[Math.floor(y) * W + Math.floor(x)];
    if (!cell) return true;
    for (const rect of cell.rects) if (circleHitsRect(x, y, r, rect)) return true;
    for (const c of cell.circles) if (Math.hypot(x - c.x, y - c.y) < r + c.r) return true;
    if (this.obs.pool && inPool(x, y, r * 0.9)) return true;
    return false;
  }

  // Расстояние до ближайшего препятствия (в пределах ~1.2 м); для проверки зазора
  clearance(x: number, y: number): number {
    const cell = this.cells[Math.floor(y) * W + Math.floor(x)];
    if (!cell) return 0;
    let d = 1.2;
    for (const rect of cell.rects) d = Math.min(d, distToRect(x, y, rect));
    for (const c of cell.circles) d = Math.min(d, Math.hypot(x - c.x, y - c.y) - c.r);
    return Math.max(0, d);
  }
}

export const keeperIndex = new SpatialIndex(KEEPER_OBSTACLES);
export const elephantIndex = new SpatialIndex(ELEPHANT_OBSTACLES);

export function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Ближайшая точка отрезка к точке
export function closestOnSegment(px: number, py: number, x0: number, y0: number, x1: number, y1: number): { x: number; y: number; d: number } {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  const k = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
  const x = x0 + dx * k;
  const y = y0 + dy * k;
  return { x, y, d: Math.hypot(px - x, py - y) };
}
