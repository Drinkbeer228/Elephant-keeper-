import { COMPLEXES, MAP, complexAt, inBarn, inPaddock, type ComplexId, type Segment } from '../data/map';

export type Point = { x: number; y: number };

export interface NavigationOptions {
  gates?: Partial<Record<ComplexId, boolean>>;
  deliveryOpen?: boolean;
  animal?: ComplexId;
}

type RouteOptions = NavigationOptions | boolean;

const EMPTY: NavigationOptions = { gates: {}, deliveryOpen: false };

function optionsOf(value: RouteOptions = EMPTY): NavigationOptions {
  if (typeof value !== 'boolean') return value;
  return { gates: { female: value, male: value }, deliveryOpen: value };
}

function optionsKey(options: NavigationOptions): string {
  return `${options.gates?.female ? 1 : 0}${options.gates?.male ? 1 : 0}${options.deliveryOpen ? 1 : 0}:${options.animal ?? ''}`;
}

function segmentDistance(x: number, y: number, w: Segment): number {
  const dx = w.x1 - w.x0;
  const dy = w.y1 - w.y0;
  const t = Math.max(0, Math.min(1, ((x - w.x0) * dx + (y - w.y0) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (w.x0 + t * dx), y - (w.y0 + t * dy));
}

const wallBuckets = new Map<number, Segment[]>();

function bucketKey(x: number, y: number): number {
  return y * MAP.w + x;
}

for (const wall of [...MAP.walls, ...MAP.barriers]) {
  const x0 = Math.max(0, Math.floor(Math.min(wall.x0, wall.x1) - 0.4));
  const x1 = Math.min(MAP.w - 1, Math.floor(Math.max(wall.x0, wall.x1) + 0.4));
  const y0 = Math.max(0, Math.floor(Math.min(wall.y0, wall.y1) - 0.4));
  const y1 = Math.min(MAP.h - 1, Math.floor(Math.max(wall.y0, wall.y1) + 0.4));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const key = bucketKey(x, y);
      const bucket = wallBuckets.get(key) ?? [];
      bucket.push(wall);
      wallBuckets.set(key, bucket);
    }
  }
}

function onGate(
  x: number,
  y: number,
  gate: { orientation: 'horizontal' | 'vertical'; coord: number; opening: { start: number; end: number } },
): boolean {
  if (gate.orientation === 'horizontal') {
    return Math.abs(y - gate.coord) < 0.4 && x > gate.opening.start - 0.3 && x < gate.opening.end + 0.3;
  }
  return Math.abs(x - gate.coord) < 0.4 && y > gate.opening.start - 0.3 && y < gate.opening.end + 0.3;
}

export function walkable(x: number, y: number, rawOptions: RouteOptions = EMPTY): boolean {
  const options = optionsOf(rawOptions);
  if (x < 0.4 || y < 0.4 || x > MAP.w - 0.4 || y > MAP.h - 0.4) return false;
  if (x < MAP.forest.x1 + 0.3) return false;

  const truckYard = MAP.areas.truckYard;
  if (x >= truckYard.x0 && x < truckYard.x1 && y >= truckYard.y0 && y < truckYard.y1 && !options.deliveryOpen) return false;
  if (complexAt(x, y) !== null && options.animal && complexAt(x, y) !== options.animal) return false;

  for (const gate of MAP.gates) {
    if (!options.gates?.[gate.id] && onGate(x, y, gate)) return false;
  }
  if (!options.deliveryOpen && onGate(x, y, MAP.deliveryGate)) return false;

  if (options.animal) {
    for (const passage of MAP.staffPassages) {
      if (passage.group !== options.animal) continue;
      if (onGate(x, y, passage)) return false;
    }
  }

  const nearbyWalls = wallBuckets.get(bucketKey(Math.floor(x), Math.floor(y))) ?? [];
  for (const wall of nearbyWalls) if (segmentDistance(x, y, wall) < 0.3) return false;

  const dump = MAP.stations.dump;
  if (Math.abs(x - dump.x) < dump.w / 2 + 0.3 && Math.abs(y - dump.y) < dump.h / 2 + 0.3) return false;
  if (!options.animal) {
    for (const pool of MAP.pools) {
      const dx = (x - pool.x) / pool.rx;
      const dy = (y - pool.y) / pool.ry;
      if (dx * dx + dy * dy < 1) return false;
    }
  }
  return true;
}

const GRID = 0.5;
const GRID_W = Math.round(MAP.w / GRID);
const GRID_H = Math.round(MAP.h / GRID);
const grids = new Map<string, Uint8Array>();
const routes = new Map<string, Point[]>();

function gridFor(options: NavigationOptions): Uint8Array {
  const key = optionsKey(options);
  let grid = grids.get(key);
  if (!grid) {
    grid = new Uint8Array(GRID_W * GRID_H);
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        grid[y * GRID_W + x] = walkable((x + 0.5) * GRID, (y + 0.5) * GRID, options) ? 1 : 0;
      }
    }
    grids.set(key, grid);
  }
  return grid;
}

function clearPath(a: Point, b: Point, options: NavigationOptions): boolean {
  const steps = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 0.2);
  for (let i = 1; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    if (!walkable(x, y, options)) return false;
  }
  return true;
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

function nearestWalkableNode(p: Point, grid: Uint8Array): number | null {
  const center = node(p);
  if (grid[center]) return center;
  const cx = center % GRID_W;
  const cy = Math.floor(center / GRID_W);
  for (let radius = 1; radius <= 4; radius++) {
    let best: number | null = null;
    let bestDistance = Infinity;
    for (let y = Math.max(0, cy - radius); y <= Math.min(GRID_H - 1, cy + radius); y++) {
      for (let x = Math.max(0, cx - radius); x <= Math.min(GRID_W - 1, cx + radius); x++) {
        const candidate = y * GRID_W + x;
        if (!grid[candidate]) continue;
        const distance = Math.hypot((x + 0.5) * GRID - p.x, (y + 0.5) * GRID - p.y);
        if (distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
    }
    if (best !== null) return best;
  }
  return null;
}

function aStar(from: Point, to: Point, options: NavigationOptions): Point[] {
  const grid = gridFor(options);
  const start = nearestWalkableNode(from, grid);
  const goal = nearestWalkableNode(to, grid);
  if (start === null || goal === null) return [];
  const costs = new Map<number, number>([[start, 0]]);
  const previous = new Map<number, number>();
  const frontier: FrontierEntry[] = [[0, start]];
  const visited = new Set<number>();
  const heuristic = (n: number) =>
    Math.hypot((n % GRID_W) - (goal % GRID_W), Math.floor(n / GRID_W) - Math.floor(goal / GRID_W));

  while (frontier.length) {
    const [, current] = popFrontier(frontier)!;
    if (visited.has(current)) continue;
    visited.add(current);
    if (current === goal) break;
    const x = current % GRID_W;
    const y = Math.floor(current / GRID_W);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const next = ny * GRID_W + nx;
        if (!grid[next]) continue;
        if (dx && dy && (!grid[y * GRID_W + nx] || !grid[ny * GRID_W + x])) continue;
        const cost = (costs.get(current) ?? 0) + (dx && dy ? 1.414 : 1);
        if (cost < (costs.get(next) ?? Infinity)) {
          costs.set(next, cost);
          previous.set(next, current);
          pushFrontier(frontier, [cost + heuristic(next), next]);
        }
      }
    }
  }

  if (start !== goal && !previous.has(goal)) return [];
  const path: Point[] = [to];
  let current = goal;
  while (previous.has(current)) {
    current = previous.get(current)!;
    if (current !== start) path.unshift({ x: ((current % GRID_W) + 0.5) * GRID, y: (Math.floor(current / GRID_W) + 0.5) * GRID });
  }
  return path;
}

export function route(from: Point, to: Point, rawOptions: RouteOptions = EMPTY): Point[] {
  const options = optionsOf(rawOptions);
  if (clearPath(from, to, options)) return [to];
  const key = `${node(from)}-${node(to)}-${optionsKey(options)}`;
  let path = routes.get(key);
  if (!path) {
    const found = aStar(from, to, options);
    if (!found.length) return [];
    path = found.slice(0, -1);
    if (routes.size > 2000) routes.clear();
    routes.set(key, path);
  }
  const points = [...path, to];
  while (points.length > 1 && clearPath(from, points[1], options)) points.shift();
  return points;
}

export function routeForAnimal(from: Point, to: Point, group: ComplexId, gates: Record<ComplexId, boolean>): Point[] {
  return route(from, to, { animal: group, gates });
}

export function complexBounds(group: ComplexId): typeof COMPLEXES[ComplexId]['bounds'] {
  return COMPLEXES[group].bounds;
}

export function isOutdoorWalkable(x: number, y: number, group: ComplexId, gates: Record<ComplexId, boolean>): boolean {
  if (complexAt(x, y) !== group) return false;
  if (!inPaddock(x, y) && !inBarn(x, y)) return false;
  return walkable(x, y, { animal: group, gates });
}
