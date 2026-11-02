import { MAP, PADDOCKS } from '../data/map';

// Стены, решётки обоих загонов, лесополоса, перила дороги, мусорный бак.
// В загоны — через проходы для человека или открытые ворота.
// Задняя дверь кормовой больше не нужна: разгрузка у дороги справа
export function walkable(x: number, y: number, gateOpen = false, doorOpen = false): boolean {
  if (x < 0.4 || y < 0.4 || x > MAP.w - 0.4 || y > MAP.h - 0.4) return false;
  // Лесополоса — граница территории
  if (x < MAP.forest.x1 + 0.3) return false;
  for (const p of PADDOCKS) {
    if (p.side === 'south') {
      if (y < p.y0 + 0.3) return false; // верхняя кромка мира с небом
      const inDoor = x > MAP.door.x0 + 0.3 && x < MAP.door.x1 - 0.3;
      const inGate = gateOpen && x > MAP.elephantGate.x0 + 0.3 && x < MAP.elephantGate.x1 - 0.3;
      if (Math.abs(y - MAP.fenceY) < 0.3 && x > p.x0 - 0.3 && x < p.x1 + 0.3 && !inDoor && !inGate) return false;
      // Правая решётка: вдоль всего загона, между загонами — открытый проход во двор
      if (Math.abs(x - MAP.fenceX) < 0.3 && y > p.y0 - 0.3 && y < MAP.fenceY + 0.3) return false;
    } else {
      const inDoor = x > MAP.door2.x0 + 0.3 && x < MAP.door2.x1 - 0.3;
      const inGate = gateOpen && x > MAP.elephantGate2.x0 + 0.3 && x < MAP.elephantGate2.x1 - 0.3;
      if (Math.abs(y - MAP.fenceY2) < 0.3 && x > p.x0 - 0.3 && x < p.x1 + 0.3 && !inDoor && !inGate) return false;
      if (Math.abs(x - MAP.fenceX2) < 0.3 && y > MAP.fenceY2 - 0.3 && y < p.y1 + 0.3) return false;
    }
  }
  for (const w of MAP.walls) if (segD(x, y, w) < 0.3) return false;
  void doorOpen; // двери поставки больше не в стенах: разгрузка у дороги
  for (const w of MAP.barriers) if (segD(x, y, w) < 0.3) return false;
  // Мусорный бак — твёрдый: обходят, заезжают только в его двери (это действие, а не проход)
  const c = MAP.stations.dump;
  if (Math.abs(x - c.x) < c.w / 2 + 0.3 && Math.abs(y - c.y) < c.h / 2 + 0.3) return false;
  // В воду бассейнов кипер не заходит — сачок достаёт с кромки (слонам можно, они плавают)
  for (let i = 0; i < MAP.pools.length; i++) {
    const p = MAP.pools[i];
    const dx = (x - p.x) / p.rx;
    const dy = (y - p.y) / p.ry;
    if (dx * dx + dy * dy < 1) return false;
  }
  return true;
}

export type Point = { x: number; y: number };

function clearPath(a: Point, b: Point, doorOpen: boolean): boolean {
  const grid = clearGridFor(doorOpen);
  const steps = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 0.1);
  for (let i = 1; i <= steps; i++) {
    const x = Math.floor((a.x + ((b.x - a.x) * i) / steps) / CLEAR_GRID);
    const y = Math.floor((a.y + ((b.y - a.y) * i) / steps) / CLEAR_GRID);
    if (x < 0 || y < 0 || x >= CLEAR_GRID_W || y >= CLEAR_GRID_H || !grid[y * CLEAR_GRID_W + x]) return false;
  }
  return true;
}

const GRID = 0.5;
const GRID_W = Math.round(MAP.w / GRID);
const GRID_H = Math.round(MAP.h / GRID);
const grids = new Map<boolean, boolean[]>();
const routes = new Map<string, Point[]>();
const CLEAR_GRID = 0.1;
const CLEAR_GRID_W = Math.ceil(MAP.w / CLEAR_GRID);
const CLEAR_GRID_H = Math.ceil(MAP.h / CLEAR_GRID);
const clearGrids = new Map<boolean, Uint8Array>();

function gridFor(doorOpen: boolean): boolean[] {
  let grid = grids.get(doorOpen);
  if (!grid) {
    grid = [];
    for (let y = 0; y < GRID_H; y++)
      for (let x = 0; x < GRID_W; x++) grid.push(walkable((x + 0.5) * GRID, (y + 0.5) * GRID, false, doorOpen));
    grids.set(doorOpen, grid);
  }
  return grid;
}

function clearGridFor(doorOpen: boolean): Uint8Array {
  let grid = clearGrids.get(doorOpen);
  if (!grid) {
    grid = new Uint8Array(CLEAR_GRID_W * CLEAR_GRID_H);
    for (let y = 0; y < CLEAR_GRID_H; y++)
      for (let x = 0; x < CLEAR_GRID_W; x++)
        grid[y * CLEAR_GRID_W + x] = walkable((x + 0.5) * CLEAR_GRID, (y + 0.5) * CLEAR_GRID, false, doorOpen) ? 1 : 0;
    clearGrids.set(doorOpen, grid);
  }
  return grid;
}

type FrontierEntry = [score: number, node: number];

function pushFrontier(frontier: FrontierEntry[], entry: FrontierEntry): void {
  let i = frontier.length;
  frontier.push(entry);
  while (i > 0) {
    const parent = Math.floor((i - 1) / 2);
    if (frontier[parent][0] <= entry[0]) break;
    frontier[i] = frontier[parent];
    i = parent;
  }
  frontier[i] = entry;
}

function popFrontier(frontier: FrontierEntry[]): FrontierEntry | undefined {
  const first = frontier[0];
  const last = frontier.pop();
  if (!first || !last || !frontier.length) return first;
  let i = 0;
  while (true) {
    const left = i * 2 + 1;
    if (left >= frontier.length) break;
    const right = left + 1;
    const child = right < frontier.length && frontier[right][0] < frontier[left][0] ? right : left;
    if (frontier[child][0] >= last[0]) break;
    frontier[i] = frontier[child];
    i = child;
  }
  frontier[i] = last;
  return first;
}

function node(p: Point): number {
  const x = Math.max(0, Math.min(GRID_W - 1, Math.floor(p.x / GRID)));
  const y = Math.max(0, Math.min(GRID_H - 1, Math.floor(p.y / GRID)));
  return y * GRID_W + x;
}

function aStar(from: Point, to: Point, doorOpen: boolean): Point[] {
  const grid = gridFor(doorOpen);
  const start = node(from);
  const goal = node(to);
  const costs = new Map<number, number>([[start, 0]]);
  const previous = new Map<number, number>();
  const frontier: FrontierEntry[] = [[0, start]];
  const visited = new Set<number>();
  const heuristic = (n: number) => Math.hypot((n % GRID_W) - (goal % GRID_W), Math.floor(n / GRID_W) - Math.floor(goal / GRID_W));

  while (frontier.length) {
    const [, current] = popFrontier(frontier)!;
    if (visited.has(current)) continue;
    visited.add(current);
    if (current === goal) break;
    const x = current % GRID_W;
    const y = Math.floor(current / GRID_W);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const next = ny * GRID_W + nx;
        if (!grid[next] && next !== goal) continue;
        if (dx && dy && (!grid[y * GRID_W + nx] || !grid[ny * GRID_W + x])) continue;
        const cost = (costs.get(current) ?? 0) + (dx && dy ? 1.414 : 1);
        if (cost < (costs.get(next) ?? Infinity)) {
          costs.set(next, cost);
          previous.set(next, current);
          pushFrontier(frontier, [cost + heuristic(next), next]);
        }
      }
  }

  const path: Point[] = [to];
  let current = goal;
  while (previous.has(current)) {
    current = previous.get(current)!;
    if (current !== start) path.unshift({ x: ((current % GRID_W) + 0.5) * GRID, y: (Math.floor(current / GRID_W) + 0.5) * GRID });
  }
  return path;
}

export function route(from: Point, to: Point, doorOpen = false): Point[] {
  if (clearPath(from, to, doorOpen)) return [to];
  const key = `${node(from)}-${node(to)}-${doorOpen ? 'd' : 'c'}`;
  let path = routes.get(key);
  if (!path) {
    path = aStar(from, to, doorOpen).slice(0, -1);
    if (routes.size > 2000) routes.clear();
    routes.set(key, path);
  }
  const points = [...path, to];
  while (points.length > 1 && clearPath(from, points[1], doorOpen)) points.shift();
  return points;
}

function segD(x: number, y: number, w: { x0: number; y0: number; x1: number; y1: number }): number {
  const dx = w.x1 - w.x0;
  const dy = w.y1 - w.y0;
  const t = Math.max(0, Math.min(1, ((x - w.x0) * dx + (y - w.y0) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (w.x0 + t * dx), y - (w.y0 + t * dy));
}
