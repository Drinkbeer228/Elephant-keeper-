// Канонический план слоновника. 1 единица = 1 метр, ось y направлена вниз.
//
//   y=2  ┌──────────────────────── ВЫГУЛ (трава, песок) ───────────────────────┐
//        │ пылевая яма   яблоня             бревно    бассейн           яблоня  │
//   y=20 ├─поилка─┬──ворота──┬──────────────┬─кормушка──дверь────────────────────┤
//        │ западный│      СЛОНОВНИК:      │ восточный двор:                    │
//        │ двор    │  один общий зал,     дверь шланг, контейнер             │
//        │        дверь подстилка  ворота   │                                    │
//        │ дорожка │ бетон: сенники, поилки, сток │ дорожка                     │
//   y=33 ├─ДЕЖУРКА─┴─КОРМОКУХНЯ─┴─ИНВЕНТАРНАЯ─┴─СЕННИК───────────────────────────┤
//   y=40 └─────────┴────────────┴─────────────┴──────────────────────────────────┘
//
// Полный контакт: кипер работает в одном пространстве со слонами. Слоновник — общий зал;
// кормокухня и инвентарная открываются прямо в него, двери из дворов тоже. Разделительные
// ворота делят зал пополам, когда это нужно (кормить по отдельности, развести поссорившихся),
// но обычно открыты; в закрытых остаётся щель — человеку пройти боком, слону нет.
// Ворота на выгул открывает и закрывает кипер руками, стоя у створки.

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

// Зона — вид места для поведения (внутри или снаружи); отсек — физическая часть вольера
export type ZoneId = 'paddock' | 'barn';
export type AreaId = 'paddock' | 'stallW' | 'stallE';
export type GateId = 'outer' | 'shift';

export const AREA_IDS: AreaId[] = ['paddock', 'stallW', 'stallE'];

// wall — капитальная стена; fence — ограда выгула; barrier — решётка; furniture — основание станции
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
// Зоны и отсеки
// ---------------------------------------------------------------------------

export const PADDOCK: Rect = { x0: 2, y0: 2, x1: 46, y1: 20 };
// Слоновник — один общий зал: слоны и кипер работают в одном пространстве. Разделительные ворота
// посередине обычно открыты; половины — только для случаев, когда кого-то нужно отделить.
export const BARN: Rect = { x0: 10, y0: 20, x1: 30, y1: 33 };
export const STALL_W: Rect = { x0: 10, y0: 20, x1: 20, y1: 33 };
export const STALL_E: Rect = { x0: 20, y0: 20, x1: 30, y1: 33 };
export const ZONES: Record<ZoneId, Rect> = { paddock: PADDOCK, barn: BARN };
export const AREAS: Record<AreaId, Rect> = { paddock: PADDOCK, stallW: STALL_W, stallE: STALL_E };
export const AREA_ZONE: Record<AreaId, ZoneId> = { paddock: 'paddock', stallW: 'barn', stallE: 'barn' };
export const AREA_LABEL: Record<AreaId, string> = { paddock: 'выгул', stallW: 'западная половина слоновника', stallE: 'восточная половина слоновника' };

// Подстилка — северная часть зала, где спят; южная — бетон: кормушки, поилки и сток у стены
export const BEDDING: Rect = { x0: 10, y0: 20, x1: 30, y1: 27.4 };
export const SERVICE_EDGE_Y = 27.4;

// Ворота: сдвижные створки, кипер открывает и закрывает их руками, стоя рядом
export interface GateDef {
  id: GateId;
  rect: Rect; // проём целиком
  parts?: Rect[]; // закрытая створка по частям — между ними щель кипера, слону не пролезть
  a: AreaId;
  b: AreaId;
  label: string;
  vertical: boolean; // створка вдоль оси y (разделительные ворота)
  approach: Record<string, { x: number; y: number; face: number }>; // где встаёт слон, чтобы пройти или ждать
}

export const GATES: GateDef[] = [
  {
    id: 'outer',
    rect: { x0: 13.5, y0: 19.75, x1: 17.5, y1: 20.25 },
    a: 'stallW',
    b: 'paddock',
    label: 'Ворота на выгул',
    vertical: false,
    approach: { stallW: { x: 15.5, y: 22.45, face: -Math.PI / 2 }, paddock: { x: 15.5, y: 17.55, face: Math.PI / 2 } },
  },
  {
    id: 'shift',
    rect: { x0: 19.85, y0: 20.2, x1: 20.15, y1: 32.8 },
    parts: [
      { x0: 19.85, y0: 20.2, x1: 20.15, y1: 28.9 },
      { x0: 19.85, y0: 29.65, x1: 20.15, y1: 32.8 },
    ],
    a: 'stallW',
    b: 'stallE',
    label: 'Разделительные ворота',
    vertical: true,
    approach: { stallW: { x: 17.6, y: 24.0, face: 0 }, stallE: { x: 22.4, y: 24.0, face: Math.PI } },
  },
];

// Щель кипера в разделительных воротах: человек проходит боком, слон — нет
export const KEEPER_GAP: Rect = { x0: 19.85, y0: 28.9, x1: 20.15, y1: 29.65 };

// Закрытые ворота как препятствие: по частям, если они есть
export function gateSolid(g: GateDef): Rect[] {
  return g.parts ?? [g.rect];
}

export const GATE_BY_ID: Record<GateId, GateDef> = { outer: GATES[0], shift: GATES[1] };

// Двери кипера: узкие — человек проходит, слон нет. Кипер ходит через них когда угодно
export type DoorId = 'hallWest' | 'barnDoor' | 'kitchenDoor' | 'equipDoor' | 'paddockDoor';

export interface DoorDef {
  id: DoorId;
  rect: Rect;
  area: AreaId; // куда ведёт дверь
  label: string;
}

export const DOORS: DoorDef[] = [
  { id: 'hallWest', rect: { x0: 9.8, y0: 26.8, x1: 10.2, y1: 28.3 }, area: 'stallW', label: 'Дверь слоновника в западный двор' },
  { id: 'barnDoor', rect: { x0: 29.8, y0: 26.8, x1: 30.2, y1: 28.3 }, area: 'stallE', label: 'Дверь слоновника в восточный двор' },
  { id: 'kitchenDoor', rect: { x0: 15.2, y0: 32.8, x1: 16.8, y1: 33.2 }, area: 'stallW', label: 'Дверь кормокухни' },
  { id: 'equipDoor', rect: { x0: 25.2, y0: 32.8, x1: 26.6, y1: 33.2 }, area: 'stallE', label: 'Дверь инвентарной' },
  { id: 'paddockDoor', rect: { x0: 40.9, y0: 19.85, x1: 42.4, y1: 20.15 }, area: 'paddock', label: 'Дверь на выгул' },
];

// ---------------------------------------------------------------------------
// Стены, ограды и решётки
// ---------------------------------------------------------------------------

const barnNorth = hline(10, 30, 20, WALL, [[13.5, 17.5]]);
// Двери зала из дворов — посередине стен, подальше от кормушек: входишь не вплотную к жующей
const barnWest = vline(10, 20, 33, WALL, [[26.8, 28.3]]);
const barnEast = vline(30, 20, 33, WALL, [[26.8, 28.3]]);

const paddockFence = [
  ...hline(2, 46, 2, FENCE),
  ...vline(2, 2, 20, FENCE),
  ...vline(46, 2, 20, FENCE),
  ...hline(2, 10, 20, FENCE),
  ...hline(30, 46, 20, FENCE, [[40.9, 42.4]]),
];

// Служебная часть: внешний периметр и ряд помещений
const outer = [...vline(2, 20, 40, WALL), ...vline(46, 20, 40, WALL), ...hline(2, 46, 40, WALL)];
// Северная стена помещений — южная стена слоновника: кормокухня и инвентарная выходят прямо в зал
const roomsNorth = hline(2, 46, 33, WALL, [
  [6, 7.6],
  [15.2, 16.8],
  [25.2, 26.6],
  [31.0, 32.5],
  [38.5, 41],
]);
const partitions = [...vline(12, 33, 40, WALL), ...vline(24, 33, 40, WALL), ...vline(35, 33, 40, WALL)];

export const SOLIDS: Solid[] = [
  ...barnNorth.map((rect) => ({ rect, kind: 'wall' as const })),
  ...barnWest.map((rect) => ({ rect, kind: 'wall' as const })),
  ...barnEast.map((rect) => ({ rect, kind: 'wall' as const })),
  ...paddockFence.map((rect) => ({ rect, kind: 'fence' as const })),
  ...outer.map((rect) => ({ rect, kind: 'wall' as const })),
  ...roomsNorth.map((rect) => ({ rect, kind: 'wall' as const })),
  ...partitions.map((rect) => ({ rect, kind: 'wall' as const })),
];

// Ограда выгула со стороны дворов: через неё можно угостить или бросить ветки, не заходя на выгул
export interface ContactLine {
  area: AreaId;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  keeperSide: 1 | -1; // с какой стороны линии (по нормали) стоит кипер: +1 — в сторону роста y
}

export const CONTACT_LINES: ContactLine[] = [
  { area: 'paddock', x0: 2.3, y0: 20, x1: 9.7, y1: 20, keeperSide: 1 },
  { area: 'paddock', x0: 30.3, y0: 20, x1: 45.7, y1: 20, keeperSide: 1 },
];

// ---------------------------------------------------------------------------
// Станции: всё, с чем работает кипер и чем пользуются слоны
// ---------------------------------------------------------------------------

export type FeederId = 'barnRackW' | 'barnRackE' | 'paddockFeeder';
export type TroughId = 'barnWaterW' | 'barnWaterE' | 'paddockWater';
export const FEEDER_IDS: FeederId[] = ['barnRackW', 'barnRackE', 'paddockFeeder'];
export const TROUGH_IDS: TroughId[] = ['barnWaterW', 'barnWaterE', 'paddockWater'];

export type StationId =
  | FeederId
  | TroughId
  | 'poolValve'
  | 'hoseReel'
  | 'container'
  | 'toolRack'
  | 'barrowHome'
  | 'desk'
  | 'vegShelf'
  | 'prepTable'
  | 'fridge'
  | 'tubRack'
  | 'porridgeStation'
  | 'kitchenSink'
  | 'washSink'
  | 'cabinet'
  | 'hayStack'
  | 'strawStack'
  | 'browsePile'
  | 'bambooPile'
  | 'sawdustPile';

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
  area?: AreaId; // отсек слонов, к которому относится станция
  slots?: Slot[]; // места для слонов
  reach?: Point; // куда тянется хобот (для отрисовки)
  valve?: Point; // кран (для поилок)
}

const S = Math.PI / 2; // смотрит на юг (+y)

export const STATIONS: Record<StationId, StationDef> = {
  // Сенники и поилки — у южной стены зала, на бетоне; кипер подходит к ним сбоку, среди слонов
  barnRackW: {
    id: 'barnRackW',
    label: 'Сенник (западная часть)',
    keeper: { x: 14.8, y: 31.9 },
    rect: { x0: 10.35, y0: 32.15, x1: 14.45, y1: 32.85 },
    area: 'stallW',
    slots: [
      { x: 11.35, y: 30.3, face: S },
      { x: 13.45, y: 30.3, face: S },
    ],
    reach: { x: 12.4, y: 32.3 },
  },
  barnRackE: {
    id: 'barnRackE',
    label: 'Сенник (восточная часть)',
    keeper: { x: 24.8, y: 31.9 },
    rect: { x0: 20.35, y0: 32.15, x1: 24.45, y1: 32.85 },
    area: 'stallE',
    slots: [
      { x: 21.35, y: 30.3, face: S },
      { x: 23.45, y: 30.3, face: S },
    ],
    reach: { x: 22.4, y: 32.3 },
  },
  paddockFeeder: {
    id: 'paddockFeeder',
    label: 'Кормушка на выгуле',
    keeper: { x: 35, y: 21.1 },
    rect: { x0: 33, y0: 19.0, x1: 37, y1: 19.85 },
    area: 'paddock',
    slots: [
      { x: 33.95, y: 17.15, face: S },
      { x: 36.1, y: 17.15, face: S },
    ],
    reach: { x: 35, y: 19.4 },
  },
  barnWaterW: {
    id: 'barnWaterW',
    label: 'Поилка (западная часть)',
    keeper: { x: 19.3, y: 31.9 },
    rect: { x0: 16.95, y0: 32.1, x1: 18.85, y1: 32.85 },
    area: 'stallW',
    slots: [{ x: 17.9, y: 30.25, face: S }],
    reach: { x: 17.9, y: 32.3 },
    valve: { x: 19.05, y: 32.6 },
  },
  barnWaterE: {
    id: 'barnWaterE',
    label: 'Поилка (восточная часть)',
    keeper: { x: 27.0, y: 31.9 },
    rect: { x0: 27.3, y0: 32.1, x1: 29.6, y1: 32.85 },
    area: 'stallE',
    slots: [{ x: 28.45, y: 30.25, face: S }],
    reach: { x: 28.45, y: 32.3 },
    valve: { x: 27.15, y: 32.6 },
  },
  paddockWater: {
    id: 'paddockWater',
    label: 'Поилка на выгуле',
    keeper: { x: 5.5, y: 21.1 },
    rect: { x0: 3.6, y0: 19.0, x1: 7.4, y1: 19.85 },
    area: 'paddock',
    slots: [
      { x: 4.4, y: 17.15, face: S },
      { x: 6.6, y: 17.15, face: S },
    ],
    reach: { x: 5.5, y: 19.4 },
    valve: { x: 5.5, y: 20.45 },
  },
  poolValve: {
    id: 'poolValve',
    label: 'Кран бассейна',
    keeper: { x: 44.5, y: 21.1 },
    rect: { x0: 44.25, y0: 20.2, x1: 44.75, y1: 20.55 },
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
    keeper: { x: 27.0, y: 38.4 },
    rect: { x0: 24.6, y0: 39.2, x1: 29.4, y1: 39.8 },
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
  vegShelf: {
    id: 'vegShelf',
    label: 'Ящики с овощами',
    keeper: { x: 13.9, y: 36.4 },
    rect: { x0: 12.2, y0: 34.6, x1: 13.1, y1: 38.4 },
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
  tubRack: {
    id: 'tubRack',
    label: 'Стеллаж с тазами',
    keeper: { x: 20.0, y: 34.6 },
    rect: { x0: 18.0, y0: 33.25, x1: 22.0, y1: 33.9 },
  },
  porridgeStation: {
    id: 'porridgeStation',
    label: 'Каши и горячая вода',
    keeper: { x: 15.1, y: 38.4 },
    rect: { x0: 13.6, y0: 39.2, x1: 16.6, y1: 39.8 },
  },
  kitchenSink: {
    id: 'kitchenSink',
    label: 'Мойка кормокухни',
    keeper: { x: 21.0, y: 38.4 },
    rect: { x0: 20.2, y0: 39.2, x1: 21.9, y1: 39.8 },
  },
  washSink: {
    id: 'washSink',
    label: 'Мойка и слив',
    keeper: { x: 31.1, y: 38.4 },
    rect: { x0: 30.2, y0: 39.2, x1: 32.0, y1: 39.8 },
  },
  cabinet: {
    id: 'cabinet',
    label: 'Шкаф с моющими средствами',
    keeper: { x: 33.3, y: 35.0 },
    rect: { x0: 34.0, y0: 33.6, x1: 34.75, y1: 36.4 },
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
    keeper: { x: 44.0, y: 34.6 },
    rect: { x0: 44.6, y0: 33.4, x1: 45.8, y1: 36.6 },
  },
  bambooPile: {
    id: 'bambooPile',
    label: 'Бамбук',
    keeper: { x: 36.8, y: 34.8 },
    rect: { x0: 35.6, y0: 33.3, x1: 38.0, y1: 33.95 },
  },
  sawdustPile: {
    id: 'sawdustPile',
    label: 'Мешки с опилками',
    keeper: { x: 42.0, y: 34.8 },
    rect: { x0: 41.2, y0: 33.3, x1: 43.0, y1: 34.0 },
  },
};

// Стойка инвентаря: места лопаты, граблей, метлы, швабры и щётки
export type ToolKind = 'shovel' | 'rake' | 'broom' | 'mop' | 'brush';
export const TOOL_KINDS: ToolKind[] = ['shovel', 'rake', 'broom', 'mop', 'brush'];
export const TOOL_SLOTS: Record<ToolKind, Point> = {
  shovel: { x: 25.1, y: 39.0 },
  rake: { x: 26.05, y: 39.0 },
  broom: { x: 27.0, y: 39.0 },
  mop: { x: 27.95, y: 39.0 },
  brush: { x: 28.85, y: 39.0 },
};

export const BARROW_HOME = { x: 32.4, y: 37.4 };
export const HOSE_REEL: Point = { x: 30.6, y: 22.6 };
export const HOSE_LENGTH = 25;
// Где стоит ведро для мочи (20 л) — в инвентарной, у двери в зал
export const TANK_HOME: Point = { x: 25.9, y: 33.8 };

// Сток на бетоне в восточной части зала: моча здесь уходит в канализацию
export const DRAIN: Circle = { x: 24.0, y: 28.6, r: 1.1 };
// Где слониха встаёт в туалет у стока: боком, задними ногами над решёткой стока
export const TOILET_STANCE = { x: 25.15, y: 28.6, face: 0 };

// ---------------------------------------------------------------------------
// Природа и обогащение на выгуле и в слоновнике
// ---------------------------------------------------------------------------

export interface TreeDef {
  id: string;
  x: number;
  y: number;
  trunk: number;
  canopy: number;
  fruit: boolean; // яблоня: слоны трясут, яблоки падают
}

export const TREES: TreeDef[] = [
  { id: 'treeA', x: 19, y: 6.5, trunk: 0.55, canopy: 3.3, fruit: true },
  { id: 'treeB', x: 29, y: 13.5, trunk: 0.45, canopy: 2.7, fruit: false },
  { id: 'treeC', x: 43.5, y: 15.8, trunk: 0.35, canopy: 2.0, fruit: true },
];

export const BOULDERS: Circle[] = [
  { x: 4.1, y: 4.1, r: 0.9 },
  { x: 31.5, y: 3.7, r: 0.8 },
  { x: 24.6, y: 17.6, r: 0.65 },
];

export const LOG = { x0: 11.6, y0: 14.0, x1: 14.6, y1: 15.2, r: 0.32 };
export const DRUM: Circle = { x: 8.5, y: 15.6, r: 0.6 };
export const TIRE: Circle = { x: 27.4, y: 22.4, r: 0.45 }; // подвесная покрышка в восточной половине зала
export const POOL: Ellipse = { x: 37, y: 9, rx: 5.2, ry: 3.0 };
export const DUST_PIT: Ellipse = { x: 8, y: 8, rx: 3.4, ry: 2.3 };
export const BALL_START = { x: 24, y: 10.5, r: 0.55 };

// Густая трава на выгуле (для отрисовки и типа почвы)
export const GRASS_PATCHES: Ellipse[] = [
  { x: 14, y: 4.2, rx: 7, ry: 2.2 },
  { x: 26.5, y: 17.2, rx: 6, ry: 2.0 },
  { x: 42, y: 4.2, rx: 4.5, ry: 2.0 },
  { x: 4.3, y: 12.5, rx: 2.4, ry: 4.2 },
  { x: 22, y: 11.5, rx: 3.2, ry: 1.6 },
];

// Вытоптанное: проплешины у кормушки, поилки, ворот, под деревьями и у бассейна
export const DRY_PATCHES: Ellipse[] = [
  { x: 35, y: 16.8, rx: 3.6, ry: 2.0 },
  { x: 5.5, y: 16.9, rx: 3.0, ry: 1.9 },
  { x: 15.5, y: 17.6, rx: 3.2, ry: 2.0 },
  { x: 19.6, y: 7.4, rx: 2.8, ry: 2.2 },
  { x: 43.8, y: 16.6, rx: 1.9, ry: 1.6 },
  { x: 29.6, y: 14.4, rx: 2.2, ry: 1.7 },
  { x: 31.2, y: 10.6, rx: 1.6, ry: 2.4 },
  { x: 24.2, y: 10.4, rx: 1.4, ry: 1.0 },
];

// Тропы, протоптанные слонами (ломаные, ширина ~1.4 м)
export const PATHS: Point[][] = [
  [
    { x: 15.5, y: 18.6 },
    { x: 22, y: 17.2 },
    { x: 28, y: 16.8 },
    { x: 34.2, y: 17.0 },
  ],
  [
    { x: 15.5, y: 18.4 },
    { x: 12.5, y: 16.6 },
    { x: 8.6, y: 17.0 },
    { x: 5.8, y: 17.2 },
  ],
  [
    { x: 15.8, y: 17.4 },
    { x: 18.2, y: 12.2 },
    { x: 19.4, y: 8.8 },
  ],
  [
    { x: 30.2, y: 16.4 },
    { x: 31.6, y: 12.4 },
    { x: 32.6, y: 10.2 },
  ],
  [
    { x: 7.2, y: 16.2 },
    { x: 7.8, y: 12.6 },
    { x: 8.0, y: 10.2 },
  ],
  [
    { x: 36.6, y: 16.6 },
    { x: 40.2, y: 16.4 },
    { x: 42.6, y: 16.0 },
  ],
];

function nearPath(x: number, y: number, w = 0.7): boolean {
  for (const path of PATHS) {
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i];
      const b = path[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const k = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
      if (Math.hypot(x - (a.x + dx * k), y - (a.y + dy * k)) < w) return true;
    }
  }
  return false;
}

// Голая земля на выгуле: проплешины, тропы, полоса вдоль ограды
export function bareGround(x: number, y: number): boolean {
  if (DRY_PATCHES.some((d) => inEllipse(d, x, y))) return true;
  if (nearPath(x, y)) return true;
  return x < PADDOCK.x0 + 1.0 || x > PADDOCK.x1 - 1.0 || y < PADDOCK.y0 + 1.0 || y > PADDOCK.y1 - 1.0;
}

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
// Помещения (для подписей и пола) и стартовые точки
// ---------------------------------------------------------------------------

export interface RoomDef {
  id: string;
  label: string;
  rect: Rect;
  floor: 'tile' | 'wood' | 'concrete' | 'gravel' | 'screed';
}

export const ROOMS: RoomDef[] = [
  { id: 'duty', label: 'Дежурка', rect: { x0: 2, y0: 33, x1: 12, y1: 40 }, floor: 'screed' },
  { id: 'kitchen', label: 'Кормокухня', rect: { x0: 12, y0: 33, x1: 24, y1: 40 }, floor: 'tile' },
  { id: 'equipment', label: 'Инвентарная', rect: { x0: 24, y0: 33, x1: 35, y1: 40 }, floor: 'concrete' },
  { id: 'store', label: 'Сенник', rect: { x0: 35, y0: 33, x1: 46, y1: 40 }, floor: 'screed' },
];

export const YARDS: RoomDef[] = [
  { id: 'westYard', label: 'Западный двор', rect: { x0: 2, y0: 20, x1: 10, y1: 30 }, floor: 'gravel' },
  { id: 'eastYard', label: 'Восточный двор', rect: { x0: 30, y0: 20, x1: 46, y1: 30 }, floor: 'gravel' },
  // Дорожка вдоль помещений во дворах (по обе стороны слоновника)
  { id: 'walkW', label: 'Дорожка', rect: { x0: 2, y0: 30, x1: 10, y1: 33 }, floor: 'concrete' },
  { id: 'walkE', label: 'Дорожка', rect: { x0: 30, y0: 30, x1: 46, y1: 33 }, floor: 'concrete' },
];

export const KEEPER_START: Point = { x: 8.6, y: 35.6 };

// Где слоны проводят ночь: стартовые места на подстилке, по очереди в разных половинах зала
export const BARN_SPOTS: Point[] = [
  { x: 12.6, y: 22.5 },
  { x: 24.4, y: 22.4 },
  { x: 16.8, y: 25.3 },
  { x: 26.6, y: 25.4 },
  { x: 12.4, y: 25.6 },
  { x: 22.6, y: 25.8 },
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

export function areaAt(x: number, y: number): AreaId | null {
  const z = zoneAt(x, y);
  if (z === 'paddock') return 'paddock';
  if (z === 'barn') return x < 20 ? 'stallW' : 'stallE';
  return null;
}

// Тип поверхности в точке — для звука шагов, следов, уборки и отрисовки
export type Surface = 'sand' | 'grass' | 'dust' | 'water' | 'bedding' | 'concrete' | 'gravel' | 'floor' | 'outside';

export function surfaceAt(x: number, y: number): Surface {
  const zone = zoneAt(x, y);
  if (zone === 'paddock') {
    if (inEllipse(POOL, x, y)) return 'water';
    if (inEllipse(DUST_PIT, x, y)) return 'dust';
    if (bareGround(x, y)) return 'sand';
    return 'grass';
  }
  if (zone === 'barn') return inRect(BEDDING, x, y) ? 'bedding' : 'concrete';
  if (ROOMS.some((r) => inRect(r.rect, x, y))) return 'floor';
  if (YARDS.some((r) => r.floor === 'gravel' && inRect(r.rect, x, y))) return 'gravel';
  if (YARDS.some((r) => r.floor === 'concrete' && inRect(r.rect, x, y))) return 'concrete';
  return 'outside';
}

// Твёрдый пол, который метут и моют шваброй: бетон зала, дорожки, помещения, дворы
export function hardFloor(x: number, y: number): boolean {
  const s = surfaceAt(x, y);
  return s === 'concrete' || s === 'floor' || s === 'gravel';
}

// ---------------------------------------------------------------------------
// Места котёнка: где уютно спать и куда забраться повыше — слону туда не дотянуться.
// Высокие места (стол, шкаф, сено, дерево): x, y — где сидит наверху, from — откуда запрыгивает.
// ---------------------------------------------------------------------------

export interface KittenPlace {
  id: string;
  x: number;
  y: number;
  from: { x: number; y: number };
  high: boolean;
  tree?: boolean;
  nap: number; // насколько уютно спать 0..1
  sun?: boolean; // днём на солнце
  text: string; // где: «на тюках сена»
}

export const KITTEN_PLACES: KittenPlace[] = [
  { id: 'hay', x: 37.8, y: 38.5, from: { x: 37.8, y: 36.5 }, high: true, nap: 1, text: 'на тюках сена в сеннике' },
  { id: 'straw', x: 42.2, y: 38.5, from: { x: 42.2, y: 36.5 }, high: true, nap: 0.9, text: 'на соломе в сеннике' },
  { id: 'desk', x: 4.6, y: 36.9, from: { x: 4.6, y: 35.6 }, high: true, nap: 0.8, text: 'на столе в дежурке' },
  { id: 'cabinet', x: 34.4, y: 34.6, from: { x: 33.3, y: 34.6 }, high: true, nap: 0.35, text: 'на шкафу в инвентарной' },
  { id: 'tubRack', x: 21.5, y: 33.6, from: { x: 21.5, y: 34.6 }, high: true, nap: 0.3, text: 'на стеллаже с тазами' },
  { id: 'browse', x: 45.2, y: 35, from: { x: 44, y: 35 }, high: true, nap: 0.45, text: 'на куче веток' },
  { id: 'yardE', x: 45, y: 22.4, from: { x: 45, y: 22.4 }, high: false, nap: 0.6, sun: true, text: 'на солнышке во дворе' },
  { id: 'yardW', x: 3.2, y: 22.6, from: { x: 3.2, y: 22.6 }, high: false, nap: 0.55, sun: true, text: 'на солнышке в западном дворе' },
  { id: 'dutyCorner', x: 2.8, y: 39.2, from: { x: 2.8, y: 39.2 }, high: false, nap: 0.5, text: 'в углу дежурки' },
  { id: 'cornerW', x: 10.8, y: 20.8, from: { x: 10.8, y: 20.8 }, high: false, nap: 0.45, text: 'в углу зала на подстилке' },
  { id: 'cornerE', x: 29.2, y: 20.8, from: { x: 29.2, y: 20.8 }, high: false, nap: 0.45, text: 'в углу зала на подстилке' },
  { id: 'treeA', x: 19, y: 6.5, from: { x: 19, y: 7.5 }, high: true, tree: true, nap: 0.4, text: 'на дереве' },
  { id: 'treeB', x: 29, y: 13.5, from: { x: 29, y: 14.4 }, high: true, tree: true, nap: 0.35, text: 'на дереве' },
  { id: 'treeC', x: 43.5, y: 15.8, from: { x: 43.5, y: 16.6 }, high: true, tree: true, nap: 0.35, text: 'на дереве' },
];

// Где котёнок живёт с утра первого дня: спит на столе в дежурке
export const KITTEN_HOME = 'desk';
