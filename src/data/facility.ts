// Канонический план слоновника. 1 единица = 1 метр, ось y направлена вниз.
//
//   y=2  ┌──────────────────────── ВЫГУЛ (песок, трава) ───────────────────────┐
//        │ пылевая яма     дерево            бревно    бассейн           дерево │
//   y=20 ├─поилка─┬──────ворота──── СЛОНОВНИК ────────┬─кормушка──дверь───────┤
//        │ западный│  подстилка (песок+солома)          │ восточный двор:        │
//        │ двор:   │                                    │ шланг, контейнер       │
//        │ пульт   │  бетонная полоса у решётки         │ для навоза             │
//   y=30 │ ворот   └─сенник─кормушка─стенка+сток──────┘                         │
//        ├───────────────────── СЛУЖЕБНЫЙ КОРИДОР ───────────────────────────────┤
//   y=33 ├─ДЕЖУРКА─┬─КУХНЯ─────┬─ИНВЕНТАРНАЯ─┬─СЕННИК──────────────────────────┤
//   y=40 └─────────┴───────────┴─────────────┴─────────────────────────────────┘
//
// Слоны живут в двух зонах — выгул и слоновник, — соединённых воротами.
// Кипер работает в защищённом контакте: входит в зону, только когда в ней (и во всём,
// что с ней соединено открытыми воротами) нет слонов.

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface Ellipse {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export type ZoneId = 'paddock' | 'barn';

// wall — капитальная стена; fence — ограда выгула; barrier — решётка слоновника (через неё работают руками и хоботом)
export type SolidKind = 'wall' | 'fence' | 'barrier' | 'furniture' | 'nature';

export interface Solid {
  rect: Rect;
  kind: SolidKind;
}

export const W = 48;
export const H = 42;

const WALL = 0.4;
const FENCE = 0.3;

function hline(x0: number, x1: number, y: number, th: number, gaps: [number, number][] = []): Rect[] {
  const out: Rect[] = [];
  let x = x0;
  for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (a > x) out.push({ x0: x, y0: y - th / 2, x1: a, y1: y + th / 2 });
    x = Math.max(x, b);
  }
  if (x < x1) out.push({ x0: x, y0: y - th / 2, x1, y1: y + th / 2 });
  return out;
}

function vline(x: number, y0: number, y1: number, th: number, gaps: [number, number][] = []): Rect[] {
  const out: Rect[] = [];
  let y = y0;
  for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (a > y) out.push({ x0: x - th / 2, y0: y, x1: x + th / 2, y1: a });
    y = Math.max(y, b);
  }
  if (y < y1) out.push({ x0: x - th / 2, y0: y, x1: x + th / 2, y1 });
  return out;
}

// ---------------------------------------------------------------------------
// Зоны
// ---------------------------------------------------------------------------

export const PADDOCK: Rect = { x0: 2, y0: 2, x1: 46, y1: 20 };
export const BARN: Rect = { x0: 10, y0: 20, x1: 30, y1: 30 };
export const ZONES: Record<ZoneId, Rect> = { paddock: PADDOCK, barn: BARN };

// Подстилка в слоновнике: песок с соломой; остальное — бетонная полоса у решётки и у двери
export const BEDDING: Rect = { x0: 10, y0: 20, x1: 26, y1: 27 };

// Ворота слоновник ↔ выгул в северной стене слоновника
export const GATE: Rect = { x0: 17.5, y0: 19.75, x1: 22.5, y1: 20.25 };

// Двери кипера: узкие (слон в них не проходит), открываются, только если за ними нет слонов
export interface DoorDef {
  id: 'barnDoor' | 'paddockDoor';
  rect: Rect;
  zone: ZoneId;
  label: string;
}

export const DOORS: DoorDef[] = [
  { id: 'barnDoor', rect: { x0: 29.8, y0: 26.8, x1: 30.2, y1: 28.3 }, zone: 'barn', label: 'Дверь в слоновник' },
  { id: 'paddockDoor', rect: { x0: 40.9, y0: 19.85, x1: 42.4, y1: 20.15 }, zone: 'paddock', label: 'Дверь на выгул' },
];

// ---------------------------------------------------------------------------
// Стены, ограды и решётки
// ---------------------------------------------------------------------------

const barnNorth = hline(10, 30, 20, WALL, [[17.5, 22.5]]);
const barnWest = vline(10, 20, 30, WALL);
const barnEast = vline(30, 20, 30, WALL, [[26.8, 28.3]]);
const barnSouth = hline(10, 30, 30, FENCE); // решётка: кипер работает через неё

const paddockFence = [
  ...hline(2, 46, 2, FENCE),
  ...vline(2, 2, 20, FENCE),
  ...vline(46, 2, 20, FENCE),
  ...hline(2, 10, 20, FENCE),
  ...hline(30, 46, 20, FENCE, [[40.9, 42.4]]),
];

// Служебная часть: внешний периметр и ряд помещений
const outer = [...vline(2, 20, 40, WALL), ...vline(46, 20, 40, WALL), ...hline(2, 46, 40, WALL)];
const roomsNorth = hline(2, 46, 33, WALL, [
  [6, 7.6],
  [16, 17.6],
  [28.5, 30.5],
  [38.5, 41],
]);
const partitions = [...vline(12, 33, 40, WALL), ...vline(24, 33, 40, WALL), ...vline(35, 33, 40, WALL)];

export const SOLIDS: Solid[] = [
  ...barnNorth.map((rect) => ({ rect, kind: 'wall' as const })),
  ...barnWest.map((rect) => ({ rect, kind: 'wall' as const })),
  ...barnEast.map((rect) => ({ rect, kind: 'wall' as const })),
  ...barnSouth.map((rect) => ({ rect, kind: 'barrier' as const })),
  ...paddockFence.map((rect) => ({ rect, kind: 'fence' as const })),
  ...outer.map((rect) => ({ rect, kind: 'wall' as const })),
  ...roomsNorth.map((rect) => ({ rect, kind: 'wall' as const })),
  ...partitions.map((rect) => ({ rect, kind: 'wall' as const })),
];

// Отрезки, через которые кипер и слон тянутся друг к другу (решётка слоновника и ограда выгула со стороны дворов)
export interface ContactLine {
  zone: ZoneId;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  keeperSide: 1 | -1; // с какой стороны линии (по нормали) стоит кипер: +1 — в сторону роста y
}

export const CONTACT_LINES: ContactLine[] = [
  { zone: 'barn', x0: 10.3, y0: 30, x1: 29.7, y1: 30, keeperSide: 1 },
  { zone: 'paddock', x0: 2.3, y0: 20, x1: 9.7, y1: 20, keeperSide: 1 },
  { zone: 'paddock', x0: 30.3, y0: 20, x1: 45.7, y1: 20, keeperSide: 1 },
];

// ---------------------------------------------------------------------------
// Станции: всё, с чем работает кипер и чем пользуются слоны
// ---------------------------------------------------------------------------

export type StationId =
  | 'barnRack'
  | 'barnTrough'
  | 'trainingWall'
  | 'barnWater'
  | 'paddockWater'
  | 'paddockFeeder'
  | 'poolValve'
  | 'gateControl'
  | 'hoseReel'
  | 'container'
  | 'toolRack'
  | 'barrowHome'
  | 'desk'
  | 'shelf'
  | 'prepTable'
  | 'fridge'
  | 'hayStack'
  | 'strawStack'
  | 'browsePile';

export interface Slot {
  x: number;
  y: number;
  face: number; // куда смотрит слон, радианы
}

export interface StationDef {
  id: StationId;
  label: string;
  keeper: Point; // где стоит кипер, чтобы работать со станцией
  rect?: Rect; // твёрдое основание станции
  zone?: ZoneId; // зона слонов, к которой относится станция
  slots?: Slot[]; // места для слонов
  reach?: Point; // куда тянется хобот (для отрисовки)
}

const S = Math.PI / 2; // смотрит на юг (+y)
const Wst = Math.PI;

export const STATIONS: Record<StationId, StationDef> = {
  barnRack: {
    id: 'barnRack',
    label: 'Сенник в слоновнике',
    keeper: { x: 14, y: 31.0 },
    rect: { x0: 12, y0: 29.15, x1: 16, y1: 29.85 },
    zone: 'barn',
    slots: [
      { x: 13, y: 27.3, face: S },
      { x: 15.2, y: 27.3, face: S },
    ],
    reach: { x: 14, y: 29.4 },
  },
  barnTrough: {
    id: 'barnTrough',
    label: 'Кормушка для овощей',
    keeper: { x: 19.5, y: 31.0 },
    rect: { x0: 18.5, y0: 29.2, x1: 20.5, y1: 29.85 },
    zone: 'barn',
    slots: [{ x: 19.5, y: 27.35, face: S }],
    reach: { x: 19.5, y: 29.45 },
  },
  trainingWall: {
    id: 'trainingWall',
    label: 'Тренировочная стенка и сток',
    keeper: { x: 24, y: 31.0 },
    zone: 'barn',
    slots: [{ x: 24, y: 27.6, face: S }],
    reach: { x: 24, y: 29.7 },
  },
  barnWater: {
    id: 'barnWater',
    label: 'Поилка в слоновнике',
    keeper: { x: 8.9, y: 24 },
    rect: { x0: 10.2, y0: 22.4, x1: 11.0, y1: 25.6 },
    zone: 'barn',
    slots: [
      { x: 12.9, y: 22.9, face: Wst },
      { x: 12.9, y: 25.1, face: Wst },
    ],
    reach: { x: 10.6, y: 24 },
  },
  paddockWater: {
    id: 'paddockWater',
    label: 'Поилка на выгуле',
    keeper: { x: 5.5, y: 21.1 },
    rect: { x0: 3.6, y0: 19.0, x1: 7.4, y1: 19.85 },
    zone: 'paddock',
    slots: [
      { x: 4.4, y: 17.15, face: S },
      { x: 6.6, y: 17.15, face: S },
    ],
    reach: { x: 5.5, y: 19.4 },
  },
  paddockFeeder: {
    id: 'paddockFeeder',
    label: 'Кормушка на выгуле',
    keeper: { x: 35, y: 21.1 },
    rect: { x0: 33, y0: 19.0, x1: 37, y1: 19.85 },
    zone: 'paddock',
    slots: [
      { x: 33.95, y: 17.15, face: S },
      { x: 36.1, y: 17.15, face: S },
    ],
    reach: { x: 35, y: 19.4 },
  },
  poolValve: {
    id: 'poolValve',
    label: 'Кран бассейна',
    keeper: { x: 44.5, y: 21.1 },
    rect: { x0: 44.25, y0: 20.2, x1: 44.75, y1: 20.55 },
  },
  gateControl: {
    id: 'gateControl',
    label: 'Пульт ворот',
    keeper: { x: 8.8, y: 21.3 },
    rect: { x0: 9.3, y0: 20.9, x1: 9.8, y1: 21.7 },
  },
  hoseReel: {
    id: 'hoseReel',
    label: 'Шланг',
    keeper: { x: 31.3, y: 22.6 },
    rect: { x0: 30.2, y0: 22.2, x1: 30.9, y1: 23.0 },
  },
  container: {
    id: 'container',
    label: 'Контейнер для навоза',
    keeper: { x: 42.5, y: 25.7 },
    rect: { x0: 40.8, y0: 26.4, x1: 44.2, y1: 28.6 },
  },
  toolRack: {
    id: 'toolRack',
    label: 'Стойка инвентаря',
    keeper: { x: 26.6, y: 38.5 },
    rect: { x0: 25.0, y0: 39.2, x1: 28.2, y1: 39.8 },
  },
  barrowHome: {
    id: 'barrowHome',
    label: 'Место тачки',
    keeper: { x: 32.4, y: 36.2 },
  },
  desk: {
    id: 'desk',
    label: 'Стол дежурного',
    keeper: { x: 5, y: 35.6 },
    rect: { x0: 3.6, y0: 36.4, x1: 6.4, y1: 37.4 },
  },
  shelf: {
    id: 'shelf',
    label: 'Стеллаж с овощами',
    keeper: { x: 13.9, y: 36.7 },
    rect: { x0: 12.2, y0: 34.6, x1: 13.1, y1: 38.8 },
  },
  prepTable: {
    id: 'prepTable',
    label: 'Разделочный стол',
    keeper: { x: 19, y: 35.8 },
    rect: { x0: 17.4, y0: 36.6, x1: 20.6, y1: 37.6 },
  },
  fridge: {
    id: 'fridge',
    label: 'Холодильник с лакомствами',
    keeper: { x: 23.1, y: 36.8 },
    rect: { x0: 22.4, y0: 37.6, x1: 23.8, y1: 39.8 },
  },
  hayStack: {
    id: 'hayStack',
    label: 'Сено',
    keeper: { x: 37.8, y: 36.4 },
    rect: { x0: 36, y0: 37.2, x1: 39.6, y1: 39.8 },
  },
  strawStack: {
    id: 'strawStack',
    label: 'Солома',
    keeper: { x: 42.2, y: 36.4 },
    rect: { x0: 40.4, y0: 37.2, x1: 44, y1: 39.8 },
  },
  browsePile: {
    id: 'browsePile',
    label: 'Ветки',
    keeper: { x: 43.9, y: 34.6 },
    rect: { x0: 44.4, y0: 33.4, x1: 45.8, y1: 36.6 },
  },
};

// Стойка инвентаря: места вил и граблей
export const TOOL_SLOTS = {
  fork: { x: 25.9, y: 39.0 },
  rake: { x: 27.3, y: 39.0 },
} as const;

export const BARROW_HOME = { x: 32.4, y: 37.4 };
export const HOSE_LENGTH = 15;

// Сток в слоновнике: моча здесь уходит в канализацию
export const DRAIN: Circle = { x: 24, y: 26.7, r: 1.45 };

// ---------------------------------------------------------------------------
// Природа и обогащение на выгуле и в слоновнике
// ---------------------------------------------------------------------------

export interface TreeDef {
  id: string;
  x: number;
  y: number;
  trunk: number;
  canopy: number;
}

export const TREES: TreeDef[] = [
  { id: 'treeA', x: 19, y: 6.5, trunk: 0.55, canopy: 3.3 },
  { id: 'treeB', x: 29, y: 13.5, trunk: 0.45, canopy: 2.7 },
  { id: 'treeC', x: 43.5, y: 15.8, trunk: 0.35, canopy: 2.0 },
];

export const BOULDERS: Circle[] = [
  { x: 4.1, y: 4.1, r: 0.9 },
  { x: 31.5, y: 3.7, r: 0.8 },
  { x: 24.6, y: 17.6, r: 0.65 },
];

export const LOG = { x0: 11.6, y0: 14.0, x1: 14.6, y1: 15.2, r: 0.32 };
export const DRUM: Circle = { x: 8.5, y: 15.6, r: 0.6 };
export const TIRE: Circle = { x: 27.4, y: 22.4, r: 0.45 }; // подвесная покрышка в слоновнике
export const POOL: Ellipse = { x: 37, y: 9, rx: 5.2, ry: 3.0 };
export const DUST_PIT: Ellipse = { x: 8, y: 8, rx: 3.4, ry: 2.3 };
export const BALL_START = { x: 24, y: 10.5, r: 0.55 };

// Травяные куртины на выгуле (для отрисовки и типа почвы)
export const GRASS_PATCHES: Ellipse[] = [
  { x: 14, y: 4.2, rx: 7, ry: 2.2 },
  { x: 26.5, y: 17.2, rx: 6, ry: 2.0 },
  { x: 42, y: 4.2, rx: 4.5, ry: 2.0 },
  { x: 4.3, y: 12.5, rx: 2.4, ry: 4.2 },
  { x: 22, y: 11.5, rx: 3.2, ry: 1.6 },
];

// Тень от деревьев (смещена от солнца)
export function shadeAt(x: number, y: number): number {
  let shade = 0;
  for (const t of TREES) {
    const d = Math.hypot(x - (t.x + 0.6), y - (t.y + 0.7));
    if (d < t.canopy) shade = Math.max(shade, 1 - (d / t.canopy) ** 3);
  }
  if (inRect(BARN, x, y)) shade = 1;
  return shade;
}

// ---------------------------------------------------------------------------
// Помещения (для подписей) и стартовые точки
// ---------------------------------------------------------------------------

export interface RoomDef {
  id: string;
  label: string;
  rect: Rect;
  floor: 'tile' | 'wood' | 'concrete' | 'gravel';
}

export const ROOMS: RoomDef[] = [
  { id: 'duty', label: 'Дежурка', rect: { x0: 2, y0: 33, x1: 12, y1: 40 }, floor: 'wood' },
  { id: 'kitchen', label: 'Кормокухня', rect: { x0: 12, y0: 33, x1: 24, y1: 40 }, floor: 'tile' },
  { id: 'equipment', label: 'Инвентарная', rect: { x0: 24, y0: 33, x1: 35, y1: 40 }, floor: 'concrete' },
  { id: 'store', label: 'Сенник', rect: { x0: 35, y0: 33, x1: 46, y1: 40 }, floor: 'wood' },
];

export const YARDS: RoomDef[] = [
  { id: 'westYard', label: 'Западный двор', rect: { x0: 2, y0: 20, x1: 10, y1: 30 }, floor: 'gravel' },
  { id: 'eastYard', label: 'Восточный двор', rect: { x0: 30, y0: 20, x1: 46, y1: 30 }, floor: 'gravel' },
  { id: 'corridor', label: 'Служебный коридор', rect: { x0: 2, y0: 30, x1: 46, y1: 33 }, floor: 'concrete' },
];

export const KEEPER_START: Point = { x: 8.6, y: 35.6 };

// Где слоны проводят ночь: стартовые места на подстилке
export const BARN_SPOTS: Point[] = [
  { x: 13.6, y: 22.6 },
  { x: 18.2, y: 24.6 },
  { x: 22.6, y: 22.4 },
  { x: 14.2, y: 25.6 },
  { x: 21.4, y: 26.0 },
  { x: 25.2, y: 23.6 },
];

export const CAPACITY = BARN_SPOTS.length;

// ---------------------------------------------------------------------------
// Геометрические помощники
// ---------------------------------------------------------------------------

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
}

export function inEllipse(e: Ellipse, x: number, y: number, grow = 0): boolean {
  const dx = (x - e.x) / (e.rx + grow);
  const dy = (y - e.y) / (e.ry + grow);
  return dx * dx + dy * dy <= 1;
}

export function zoneAt(x: number, y: number): ZoneId | null {
  if (x > PADDOCK.x0 && x < PADDOCK.x1 && y > PADDOCK.y0 && y < PADDOCK.y1) return 'paddock';
  if (x > BARN.x0 && x < BARN.x1 && y >= BARN.y0 && y < BARN.y1) return 'barn';
  return null;
}

// Тип поверхности в точке — для звука шагов, следов и отрисовки
export type Surface = 'sand' | 'grass' | 'dust' | 'water' | 'bedding' | 'concrete' | 'gravel' | 'floor' | 'outside';

export function surfaceAt(x: number, y: number): Surface {
  const zone = zoneAt(x, y);
  if (zone === 'paddock') {
    if (inEllipse(POOL, x, y)) return 'water';
    if (inEllipse(DUST_PIT, x, y)) return 'dust';
    if (GRASS_PATCHES.some((g) => inEllipse(g, x, y))) return 'grass';
    return 'sand';
  }
  if (zone === 'barn') return inRect(BEDDING, x, y) ? 'bedding' : 'concrete';
  if (ROOMS.some((r) => inRect(r.rect, x, y))) return 'floor';
  if (YARDS.some((r) => r.id !== 'corridor' && inRect(r.rect, x, y))) return 'gravel';
  if (inRect({ x0: 2, y0: 30, x1: 46, y1: 33 }, x, y)) return 'concrete';
  return 'outside';
}
