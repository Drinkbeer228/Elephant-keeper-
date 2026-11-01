import { BALANCE } from '../data/balance';
import { MAP } from '../data/map';
import { hint } from './events';
import { chance, pick } from './rng';
import type { Cell, State } from './types';

export interface CellRef {
  cx: number;
  cy: number;
  cell: Cell;
}

export function cellAt(state: State, x: number, y: number): CellRef | null {
  const cx = Math.floor(x - MAP.bedding.x);
  const cy = Math.floor(y - MAP.bedding.y);
  if (cx < 0 || cy < 0 || cx >= MAP.bedding.cols || cy >= MAP.bedding.rows) return null;
  return { cx, cy, cell: state.cells[cy][cx] };
}

export function setCell(state: State, cx: number, cy: number, kind: Cell['kind']): void {
  state.cells[cy][cx] = { kind, since: state.t };
}

// Моча на подстилку: всё в радиусе становится мокрым
export function wetAround(state: State, x: number, y: number, radius = 1): void {
  forCellsAround(x, y, radius, (cx, cy) => {
    const c = state.cells[cy][cx];
    if (c.kind === 'straw') setCell(state, cx, cy, 'wet');
    else if (c.kind === 'bare' || c.kind === 'sawdust') setCell(state, cx, cy, 'bareWet');
  });
}

function forCellsAround(x: number, y: number, radius: number, fn: (cx: number, cy: number) => void): void {
  const b = MAP.bedding;
  for (let cy = 0; cy < b.rows; cy++) {
    for (let cx = 0; cx < b.cols; cx++) {
      const mx = b.x + cx + 0.5;
      const my = b.y + cy + 0.5;
      if (Math.hypot(mx - x, my - y) <= radius) fn(cx, cy);
    }
  }
}

export function sawdustAbsorbed(state: State, cell: Cell): boolean {
  return cell.kind === 'sawdust' && state.t - cell.since >= BALANCE.floor.sawdustAbsorb;
}

export function isWet(cell: Cell): boolean {
  return cell.kind === 'wet' || cell.kind === 'bareWet';
}

export function countWet(state: State): number {
  return state.cells.flat().filter(isWet).length;
}

export function dryFraction(state: State): number {
  const all = state.cells.flat();
  const dungCells = new Set(state.dung.map((d) => `${Math.floor(d.x)},${Math.floor(d.y)}`));
  let dry = 0;
  all.forEach((c, i) => {
    const cx = i % MAP.bedding.cols;
    const cy = Math.floor(i / MAP.bedding.cols);
    const key = `${cx + MAP.bedding.x},${cy + MAP.bedding.y}`;
    // Голый сухой пол тоже сухой: ногам почти не вредит, солома сверху — бонус
    if ((c.kind === 'straw' || c.kind === 'bare') && !dungCells.has(key)) dry++;
  });
  return dry / all.length;
}

// Вред ногам в минуту на этой точке
export function footHarm(state: State, x: number, y: number): number {
  const ref = cellAt(state, x, y);
  if (!ref) return 0;
  const f = BALANCE.footDebt;
  const k = ref.cell.kind;
  let harm = k === 'dung' ? f.trampled : isWet(ref.cell) ? f.wet : k === 'sawdust' ? f.sawdust : k === 'bare' ? f.bare : f.straw;
  if (state.dung.some((d) => Math.hypot(d.x - x, d.y - y) < 0.9)) harm += f.dung;
  return harm;
}

export function updateFloor(state: State): void {
  const fl = BALANCE.floor;
  // Мокрое, которое долго не трогали, расползается
  if (state.t - state.stats.lastSpread >= fl.spreadEvery) {
    state.stats.lastSpread = state.t;
    const b = MAP.bedding;
    const toWet: [number, number][] = [];
    for (let cy = 0; cy < b.rows; cy++) {
      for (let cx = 0; cx < b.cols; cx++) {
        const c = state.cells[cy][cx];
        if (c.kind !== 'wet' || state.t - c.since < fl.spreadEvery) continue;
        if (!chance(state, fl.spreadChance)) continue;
        const near = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ].filter(([x, y]) => x >= 0 && y >= 0 && x < b.cols && y < b.rows && state.cells[y][x].kind === 'straw');
        if (near.length) toWet.push(pick(state, near) as [number, number]);
      }
    }
    toWet.forEach(([cx, cy]) => setCell(state, cx, cy, 'wet'));
  }
  if (!state.stats.hintsShown.includes('broom') && state.cells.some((row) => row.some((c) => sawdustAbsorbed(state, c)))) {
    hint(state, 'broom', 'Опилки впитали мочу — вымети их метлой до пола, потом стели солому.');
  }
  if (state.t - state.stats.lastDryCheck >= fl.dryCheckEvery) {
    state.stats.lastDryCheck = state.t;
    state.stats.drySamples++;
    state.stats.drySum += dryFraction(state);
  }
}
