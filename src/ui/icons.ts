import type { Item, Prep } from '../sim';

// Иконки интерфейса: те же пиксельные спрайты, что в мире, плюс пиксельные значки.
// Ссылки на спрайты подставляет игра (src/game/textures) через setSpriteSources —
// так UI-слой не зависит от игрового рендера и остаётся переносимым.

type SpriteSources = {
  itemUrl: (item: Item) => string;
  portraitUrl: (id: string) => string;
  vegUrl: (piece: Prep['pieces'][number]) => string;
  barrowUrl: () => string;
};

const NO_SOURCE = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
let sources: SpriteSources | null = null;

export function setSpriteSources(s: SpriteSources): void {
  sources = s;
}

// Кэш data URL: toDataURL на каждый кадр рисовал canvas и кодировал base64 —
// интерфейс подвисал. Генерируем ссылку один раз на вариант спрайта.
const memo = new Map<string, string>();
function cached(key: string, make: () => string): string {
  let v = memo.get(key);
  if (!v) {
    v = make();
    memo.set(key, v);
  }
  return v;
}

export function itemIcon(item: Item): string {
  if (!sources) return NO_SOURCE;
  const key = `${item.kind}:${item.liters ?? 0}:${item.dirty ? 1 : 0}:${item.food ?? ''}:${item.nested?.length ?? 0}:${item.load ?? 0}:${item.fill ?? 0}:${item.charges ? 1 : 0}:${item.veg ?? ''}`;
  return cached(`i:${key}`, () => sources!.itemUrl(item));
}

export function portraitIcon(id: string): string {
  if (!sources) return NO_SOURCE;
  return cached(`p:${id}`, () => sources!.portraitUrl(id));
}

export function vegIcon(piece: Prep['pieces'][number]): string {
  if (!sources) return NO_SOURCE;
  // Рисунок зависит от того, какие пятна уже срезаны
  const key = `${piece.kind}:${piece.spots.map((s) => (s.cut ? 1 : 0)).join('')}`;
  return cached(`v:${key}`, () => sources!.vegUrl(piece));
}

export function barrowIcon(): string {
  if (!sources) return NO_SOURCE;
  return cached('b', () => sources!.barrowUrl());
}

// Значки на сетке 8×8: каждая клетка — один «пиксель»
function px(rows: string[]): string {
  const rects = rows
    .flatMap((r, y) => [...r].map((c, x) => (c === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '')))
    .join('');
  return `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" fill="currentColor" shape-rendering="crispEdges">${rects}</svg>`;
}

export const ICON = {
  hand: px(['..#.#...', '.##.##..', '.##.##.#', '.######.', '#######.', '.######.', '..####..', '..####..']),
  eye: px(['........', '..####..', '.#....#.', '#..##..#', '#..##..#', '.#....#.', '..####..', '........']),
  pause: px(['........', '.##..##.', '.##..##.', '.##..##.', '.##..##.', '.##..##.', '.##..##.', '........']),
  sun: px(['...#....', '.#...#..', '..###...', '#.###.#.', '..###...', '.#...#..', '...#....', '........']),
  moon: px(['..###...', '.##.....', '##......', '##......', '##......', '.##...#.', '..####..', '........']),
  drop: px(['...#....', '...#....', '..###...', '.#####..', '.##.##..', '.#####..', '..###...', '........']),
  hay: px(['........', '########', '#.#..#.#', '########', '#.#..#.#', '########', '........', '........']),
  bowl: px(['........', '........', '########', '#......#', '.#....#.', '..####..', '........', '........']),
  check: px(['........', '.......#', '......##', '#....##.', '##..##..', '.####...', '..##....', '........']),
  cross: px(['........', '.#....#.', '..#..#..', '...##...', '...##...', '..#..#..', '.#....#.', '........']),
  star: px(['...#....', '...#....', '#######.', '.#####..', '..###...', '.##.##..', '.#...#..', '........']),
  info: px(['..###...', '........', '.####...', '..###...', '..###...', '..###...', '.#####..', '........']),
  good: px(['........', '.......#', '......##', '#....##.', '##..##..', '.####...', '..##....', '........']),
  bad: px(['...##...', '..####..', '..####..', '.##..##.', '.######.', '##.##.##', '########', '........']),
  hint: px(['..###...', '.#####..', '.#####..', '.#####..', '..###...', '..###...', '...#....', '..###...']),
  // Запасы (этап 2)
  sack: px(['..####..', '..#..#..', '.######.', '.######.', '#.#..#.#', '.######.', '.######.', '..####..']),
  carrot: px(['.....##.', '....##..', '...####.', '..####..', '.####...', '####....', '###.....', '#.......']),
  apple: px(['....#...', '...##...', '..#..#..', '.######.', '.######.', '.######.', '..####..', '........']),
  bale: px(['########', '#.#..#.#', '########', '#.#..#.#', '########', '#.#..#.#', '########', '........']),
  straw: px(['.#.#.#..', '#.#.#.#.', '.#.#.#..', '#.#.#.#.', '.#.#.#..', '#.#.#.#.', '........', '........']),
  saw: px(['..#..#..', '.######.', '.######.', '.######.', '.######.', '..####..', '........', '........']),
};
