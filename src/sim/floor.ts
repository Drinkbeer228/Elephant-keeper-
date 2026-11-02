import { BALANCE } from '../data/balance';
import { MAP, inPaddock } from '../data/map';
import { hint } from './events';
import { chance, pick } from './rng';
import type { Cell, State } from './types';

export interface CellRef {
  cx: number;
  cy: number;
  cell: Cell;
}

export function cellAt(state: State, x: number, y: number): CellRef | null {
  if (!inPaddock(x, y)) return null;
  const f = MAP.floor;
  const cx = Math.floor(x - f.x);
  const cy = Math.floor(y - f.y);
  if (cx < 0 || cy < 0 || cx >= f.cols || cy >= f.rows) return null;
  return { cx, cy, cell: state.cells[cy][cx] };
}

// Что под клеткой: солома-песок в загонах, трава на лугах, бетон вне вольеров
export function groundOf(cx: number, cy: number): 'straw' | 'grass' | 'bare' {
  const x = MAP.floor.x + cx;
  const y = MAP.floor.y + cy;
  for (const b of [MAP.bedding, MAP.bedding2]) {
    if (x >= b.x && x < b.x + b.cols && y >= b.y && y < b.y + b.rows) return 'straw';
  }
  if (inPaddock(x, y)) return 'grass';
  return 'bare';
}

// Голый пол после уборки: под подстилкой — бетон, на лугу — трава
export function cleared(cx: number, cy: number): 'bare' | 'grass' {
  return groundOf(cx, cy) === 'grass' ? 'grass' : 'bare';
}

function strawCells(state: State): { cell: Cell; cx: number; cy: number }[] {
  const out: { cell: Cell; cx: number; cy: number }[] = [];
  state.cells.forEach((row, cy) =>
    row.forEach((c, cx) => {
      if (groundOf(cx, cy) === 'straw') out.push({ cell: c, cx, cy });
    }),
  );
  return out;
}

export function setCell(state: State, cx: number, cy: number, kind: Cell['kind']): void {
  state.cells[cy][cx] = { kind, since: state.t };
}

// Моча: подстилка в радиусе мокнет, на лугу — лужа, которая впитается сама.
// Клетки вне загонов не трогаем: хобот туда не достаёт
export function wetAround(state: State, x: number, y: number, radius = 1): void {
  forCellsAround(x, y, radius, (cx, cy) => {
    if (!inPaddock(cx + MAP.floor.x + 0.5, cy + MAP.floor.y + 0.5)) return;
    const c = state.cells[cy][cx];
    if (c.kind === 'straw') setCell(state, cx, cy, 'wet');
    else if (c.kind === 'bare' || c.kind === 'sawdust') setCell(state, cx, cy, 'bareWet');
    else if (c.kind === 'grass') setCell(state, cx, cy, 'puddle');
  });
}

function forCellsAround(x: number, y: number, radius: number, fn: (cx: number, cy: number) => void): void {
  const b = MAP.floor;
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

// Мокрая подстилка; лужи на лугу не в счёт — они впитаются сами
export function countWet(state: State): number {
  return strawCells(state).filter((r) => isWet(r.cell)).length;
}

// Сухость подстилки (солома в обоих загонах)
export function dryFraction(state: State): number {
  const dungCells = new Set(state.dung.map((d) => `${Math.floor(d.x)},${Math.floor(d.y)}`));
  let dry = 0;
  let all = 0;
  for (const { cell, cx, cy } of strawCells(state)) {
    all++;
    const key = `${cx + MAP.floor.x},${cy + MAP.floor.y}`;
    // Голый сухой пол тоже сухой: ногам почти не вредит, солома сверху — бонус
    if ((cell.kind === 'straw' || cell.kind === 'bare') && !dungCells.has(key)) dry++;
  }
  return all ? dry / all : 1;
}

// Вред ногам в минуту на этой точке (вне загонов — 0)
export function footHarm(state: State, x: number, y: number): number {
  const ref = cellAt(state, x, y);
  if (!ref) return 0;
  const f = BALANCE.footDebt;
  const k = ref.cell.kind;
  let harm = k === 'dung' ? f.trampled : isWet(ref.cell) ? f.wet : k === 'puddle' ? f.puddle : k === 'sawdust' ? f.sawdust : k === 'bare' ? f.bare : f.straw;
  if (state.dung.some((d) => Math.hypot(d.x - x, d.y - y) < 0.9)) harm += f.dung;
  return harm;
}

export function updateFloor(state: State): void {
  const fl = BALANCE.floor;
  // Мокрое, которое долго не трогали, расползается по своей песочнице
  // Лужи на лугу впитываются
  state.cells.forEach((row, cy) =>
    row.forEach((c, cx) => {
      if (c.kind === 'puddle' && state.t - c.since >= fl.puddleDry) setCell(state, cx, cy, groundOf(cx, cy) === 'grass' ? 'grass' : 'bare');
    }),
  );
  if (state.t - state.stats.lastSpread >= fl.spreadEvery) {
    state.stats.lastSpread = state.t;
    const toWet: [number, number][] = [];
    state.cells.forEach((row, cy) =>
      row.forEach((c, cx) => {
        if (c.kind !== 'wet' || state.t - c.since < fl.spreadEvery) return;
        if (!chance(state, fl.spreadChance)) return;
        const near = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ].filter(([x, y]) => x >= 0 && y >= 0 && x < MAP.floor.cols && y < MAP.floor.rows && state.cells[y][x].kind === 'straw');
        if (near.length) toWet.push(pick(state, near) as [number, number]);
      }),
    );
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
