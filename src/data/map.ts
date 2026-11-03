import { MAP as LEGACY_LAYOUT } from './map-legacy';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Segment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type ComplexId = 'female' | 'male';

type Opening = { start: number; end: number };
type SideOpenings = Partial<Record<'north' | 'south' | 'west' | 'east', Opening[]>>;

function horizontal(x0: number, x1: number, y: number, openings: Opening[] = []): Segment[] {
  const sorted = [...openings].sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let x = x0;
  for (const opening of sorted) {
    if (opening.start > x) out.push({ x0: x, y0: y, x1: opening.start, y1: y });
    x = Math.max(x, opening.end);
  }
  if (x < x1) out.push({ x0: x, y0: y, x1, y1: y });
  return out;
}

function vertical(x: number, y0: number, y1: number, openings: Opening[] = []): Segment[] {
  const sorted = [...openings].sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let y = y0;
  for (const opening of sorted) {
    if (opening.start > y) out.push({ x0: x, y0: y, x1: x, y1: opening.start });
    y = Math.max(y, opening.end);
  }
  if (y < y1) out.push({ x0: x, y0: y, x1: x, y1 });
  return out;
}

function outline(r: Rect, openings: SideOpenings = {}): Segment[] {
  return [
    ...horizontal(r.x0, r.x1, r.y0, openings.north),
    ...horizontal(r.x0, r.x1, r.y1, openings.south),
    ...vertical(r.x0, r.y0, r.y1, openings.west),
    ...vertical(r.x1, r.y0, r.y1, openings.east),
  ];
}

const FEMALE = {
  bounds: { x0: 16, y0: 20, x1: 47, y1: 48 },
  active: { x0: 16, y0: 20, x1: 47, y1: 34 },
  rotation: { x0: 16, y0: 34, x1: 33, y1: 48 },
  barn: { x0: 33, y0: 34, x1: 47, y1: 48 },
};

const MALE = {
  bounds: { x0: 62, y0: 20, x1: 93, y1: 48 },
  active: { x0: 62, y0: 20, x1: 93, y1: 34 },
  rotation: { x0: 77, y0: 34, x1: 93, y1: 48 },
  barn: { x0: 62, y0: 34, x1: 77, y1: 48 },
};

const MODERN_COMPLEXES: Record<ComplexId, typeof FEMALE> = { female: FEMALE, male: MALE };

const FEMALE_ROTATION_GATE: Opening = { start: 24, end: 28 };
const MALE_ROTATION_GATE: Opening = { start: 83, end: 87 };
const FEMALE_BARN_GATE: Opening = { start: 38, end: 42 };
const MALE_BARN_GATE: Opening = { start: 38, end: 42 };
const FEMALE_STAFF_TO_ROTATION: Opening = { start: 16, end: 20.5 };
const MALE_STAFF_TO_ROTATION: Opening = { start: 87, end: 92.5 };
const FEMALE_STAFF_TO_BARN: Opening = { start: 42, end: 47.5 };
const MALE_STAFF_TO_BARN: Opening = { start: 42, end: 47.5 };
const FEMALE_STAFF_TO_ACTIVE: Opening = { start: 42, end: 47 };
const MALE_STAFF_TO_ACTIVE: Opening = { start: 62, end: 68.5 };

const rooms = {
  duty: { x0: 31, y0: 56, x1: 40, y1: 62, label: 'ДЕЖУРКА' },
  locker: { x0: 40, y0: 56, x1: 49, y1: 62, label: 'ИНВЕНТАРНАЯ' },
  wash: { x0: 31, y0: 64, x1: 40, y1: 72, label: 'МОЙКА' },
  kitchen: { x0: 40, y0: 64, x1: 49, y1: 72, label: 'КОРМОВАЯ' },
  veg: { x0: 49, y0: 64, x1: 56, y1: 72, label: 'ОВОЩНОЙ СКЛАД' },
  hay: { x0: 16, y0: 56, x1: 28, y1: 64, label: 'СЕННИК' },
  straw: { x0: 16, y0: 74, x1: 22, y1: 81, label: 'СОЛОМА' },
  sawdust: { x0: 25, y0: 74, x1: 32, y1: 81, label: 'ОПИЛКИ' },
  vetFemale: { x0: 47, y0: 34, x1: 54, y1: 43, label: 'БОКС САМОК' },
  vetMale: { x0: 55, y0: 34, x1: 62, y1: 43, label: 'БОКС САМЦОВ' },
  vetProcedure: { x0: 48, y0: 43, x1: 62, y1: 49, label: 'ПРОЦЕДУРНАЯ' },
  vetOffice: { x0: 48, y0: 32, x1: 61, y1: 34, label: 'ВЕТКАБИНЕТ' },
  quarantine: { x0: 56, y0: 56, x1: 68, y1: 68, label: 'КАРАНТИН' },
  admin: { x0: 32, y0: 72, x1: 40, y1: 84, label: 'АДМИНИСТРАЦИЯ' },
  seniorKeeper: { x0: 40, y0: 72, x1: 48, y1: 84, label: 'СТАРШИЙ КИПЕР' },
  staff: { x0: 48, y0: 72, x1: 57, y1: 78, label: 'ПЕРСОНАЛ' },
  briefing: { x0: 48, y0: 78, x1: 57, y1: 84, label: 'ИНСТРУКТАЖ' },
  stockOffice: { x0: 57, y0: 72, x1: 66, y1: 84, label: 'УЧЁТ ЗАПАСОВ' },
  warehouse: { x0: 86, y0: 68, x1: 95, y1: 73, label: 'СКЛАД' },
  garage: { x0: 76, y0: 76, x1: 86, y1: 84, label: 'ГАРАЖ / МАСТЕРСКАЯ' },
  waste: { x0: 88, y0: 81, x1: 96, y1: 89, label: 'ОТХОДЫ' },
} as const;

const buildingWalls: Segment[] = [
  ...outline(rooms.hay, {
    north: [{ start: 20, end: 24 }],
    south: [{ start: 22, end: 26 }],
  }),
  ...outline(rooms.duty, { north: [{ start: 33, end: 36 }] }),
  ...outline(rooms.locker, { north: [{ start: 43, end: 46 }] }),
  ...outline(rooms.wash, { north: [{ start: 33, end: 36 }] }),
  ...outline(rooms.kitchen, { north: [{ start: 42, end: 47.5 }] }),
  ...outline(rooms.veg, { north: [{ start: 50, end: 53 }] }),
  ...outline(rooms.straw, { north: [{ start: 17, end: 20 }] }),
  ...outline(rooms.sawdust, { north: [{ start: 27, end: 30 }] }),
  ...outline(rooms.vetFemale, {
    west: [{ start: 38, end: 42 }],
    south: [{ start: 49, end: 53 }],
  }),
  ...outline(rooms.vetMale, {
    east: [{ start: 38, end: 42 }],
    south: [{ start: 56, end: 60 }],
  }),
  ...outline(rooms.vetProcedure, { south: [{ start: 52, end: 58 }] }),
  ...outline(rooms.vetOffice, { south: [{ start: 52, end: 57 }] }),
  ...outline(rooms.quarantine, { north: [{ start: 60, end: 64 }] }),
  ...outline(rooms.admin, {
    east: [{ start: 76, end: 80 }],
    south: [{ start: 34, end: 38 }],
  }),
  ...outline(rooms.seniorKeeper, {
    west: [{ start: 76, end: 80 }],
    east: [{ start: 73, end: 77 }],
    south: [{ start: 42, end: 46 }],
  }),
  ...outline(rooms.staff, {
    west: [{ start: 73, end: 77 }],
    east: [{ start: 73, end: 77 }],
    south: [{ start: 50, end: 54 }],
  }),
  ...outline(rooms.briefing, {
    north: [{ start: 50, end: 54 }],
    east: [{ start: 79, end: 83 }],
    south: [{ start: 50, end: 54 }],
  }),
  ...outline(rooms.stockOffice, {
    west: [{ start: 73, end: 77 }, { start: 79, end: 83 }],
    east: [{ start: 73, end: 76 }],
    south: [{ start: 59, end: 64 }],
  }),
  ...outline(rooms.warehouse, {
    west: [{ start: 68, end: 73 }],
  }),
  ...outline(rooms.garage, {
    west: [{ start: 78, end: 82 }],
    south: [{ start: 79, end: 86 }],
  }),
  ...outline(rooms.waste, {
    north: [{ start: 90, end: 93 }],
    east: [{ start: 82, end: 88 }],
  }),
];

const fenceWalls: Segment[] = [
  ...outline(FEMALE.bounds, {
    south: [{ start: 41, end: 47 }],
    east: [{ start: 38, end: 42 }],
  }),
  ...outline(MALE.bounds, {
    south: [{ start: 61, end: 67 }],
    west: [{ start: 38, end: 42 }],
  }),
  ...horizontal(16, 47, 34, [FEMALE_ROTATION_GATE, FEMALE_STAFF_TO_ROTATION, FEMALE_STAFF_TO_ACTIVE]),
  ...vertical(33, 34, 48, [FEMALE_BARN_GATE, FEMALE_STAFF_TO_BARN]),
  ...horizontal(62, 93, 34, [MALE_ROTATION_GATE, MALE_STAFF_TO_ROTATION, MALE_STAFF_TO_ACTIVE]),
  ...vertical(77, 34, 48, [MALE_BARN_GATE, MALE_STAFF_TO_BARN]),
];

const walls: Segment[] = [
  ...buildingWalls,
  ...fenceWalls,
  ...vertical(78, 52, 58),
  ...vertical(78, 64, 66),
  ...vertical(96, 52, 56),
  ...vertical(96, 62, 66),
  { x0: 54, y0: 34, x1: 54, y1: 43 },
  { x0: 55, y0: 34, x1: 55, y1: 43 },
];

const stations = {
  rack: { x: 32, y: 59, w: 0.6, h: 4.2, label: 'Стойка инвентаря' },
  bags: { x: 35, y: 60, w: 1.4, h: 1, label: 'Мешки 240 л' },
  locker: { x: 46, y: 60, w: 1.6, h: 0.8, label: 'Шкафчики' },
  wash: { x: 35, y: 68, w: 1.8, h: 0.9, label: 'Раковина' },
  drain: { x: 33, y: 70, w: 1, h: 0.6, label: 'Слив' },
  drain2: { x: 37, y: 70, w: 1, h: 0.6, label: 'Слив' },
  basinRack: { x: 41, y: 68, w: 0.8, h: 3.2, label: 'Стеллаж тазов' },
  stove: { x: 44, y: 66, w: 2.2, h: 1.2, label: 'Котёл каши' },
  kitchen: { x: 45, y: 69, w: 2.4, h: 1.4, label: 'Стол нарезки' },
  vegRack: { x: 53, y: 68, w: 0.8, h: 1.8, label: 'Овощи и фрукты' },
  hay: { x: 22, y: 60, w: 3.2, h: 1, label: 'Сенник: сено' },
  straw: { x: 19, y: 77, w: 1.4, h: 1, label: 'Хранилище соломы' },
  sawdust: { x: 28.5, y: 77, w: 2, h: 1.2, label: 'Хранилище опилок' },
  dump: { x: 92, y: 85, w: 2.4, h: 1.6, label: 'Мусорный бак' },
  unload: { x: 82, y: 60, w: 2, h: 1.2, label: 'Борт грузовика' },
  receiving: { x: 82, y: 70.5, w: 8, h: 5, label: 'Буфер паллет' },
  valve: { x: 42, y: 35.2, w: 0.7, h: 0.7, label: 'Вентиль самок' },
  valve2: { x: 67, y: 35.2, w: 0.7, h: 0.7, label: 'Вентиль самцов' },
  lightSwitch: { x: 34, y: 56.4, w: 0.4, h: 0.4, label: 'Выключатель дежурного света' },
  femaleGate: { x: 26, y: 34, w: 4, h: 1, label: 'Ворота женского комплекса' },
  maleGate: { x: 85, y: 34, w: 4, h: 1, label: 'Ворота мужского комплекса' },
} as const;

const vehicleRoads: Rect[] = [
  { x0: 8, y0: 12, x1: 105, y1: 18 },
  { x0: 8, y0: 18, x1: 14, y1: 90 },
  { x0: 96, y0: 18, x1: 105, y1: 90 },
  { x0: 8, y0: 90, x1: 105, y1: 96 },
  { x0: 26, y0: 96, x1: 32, y1: 100 },
  { x0: 75, y0: 96, x1: 81, y1: 100 },
];

const areas = {
  northReserve: { x0: 0, y0: 0, x1: 120, y1: 12 },
  eastReserve: { x0: 105, y0: 18, x1: 120, y1: 84 },
  centralPath: { x0: 15, y0: 50, x1: 78, y1: 56 },
  eastPath: { x0: 73, y0: 56, x1: 78, y1: 76 },
  adminConnector: { x0: 68, y0: 56, x1: 73, y1: 76 },
  lowerRoomsPath: { x0: 31, y0: 62, x1: 56, y1: 64 },
  westRoomsPath: { x0: 28, y0: 56, x1: 31, y1: 74 },
  westStorageApproach: { x0: 14, y0: 72, x1: 33, y1: 74 },
  hayApproach: { x0: 14, y0: 64, x1: 20, y1: 72 },
  hayUnload: { x0: 20, y0: 64, x1: 28, y1: 72 },
  truckYard: { x0: 78, y0: 52, x1: 96, y1: 66 },
  truckBay: { x0: 78, y0: 56, x1: 86, y1: 64 },
  palletBuffer: { x0: 78, y0: 68, x1: 86, y1: 73 },
  parking: { x0: 32, y0: 84, x1: 66, y1: 90 },
  parkingWalk: { x0: 48, y0: 84, x1: 54, y1: 90 },
  equipmentYard: { x0: 68, y0: 76, x1: 76, y1: 84 },
  garageApproach: { x0: 79, y0: 84, x1: 86, y1: 90 },
} as const;

const femaleBedding = { x: 16, y: 20, cols: 11, rows: 14 };
const maleBedding = { x: 82, y: 20, cols: 11, rows: 14 };

const MODERN_MAP = {
  w: 120,
  h: 100,
  floor: { x: 0, y: 0, cols: 120, rows: 100 },
  complexes: MODERN_COMPLEXES,
  paddock: FEMALE.bounds,
  paddock2: MALE.bounds,
  bedding: femaleBedding,
  bedding2: maleBedding,
  fenceY: 34,
  fenceY2: 34,
  fenceX: 47,
  fenceX2: 62,
  door: { x0: 41, x1: 47 },
  door2: { x0: 62, x1: 67 },
  elephantGate: FEMALE_ROTATION_GATE,
  elephantGate2: MALE_ROTATION_GATE,
  forest: { x1: 8 },
  yard: { x0: 14, x1: 96 },
  road: { x0: 96, x1: 105, y0: 18, y1: 90 },
  roads: vehicleRoads,
  areas,
  rooms,
  walls,
  barriers: [] as Segment[],
  gates: [
    { id: 'female' as const, orientation: 'horizontal' as const, coord: 34, opening: FEMALE_ROTATION_GATE },
    { id: 'female' as const, orientation: 'vertical' as const, coord: 33, opening: FEMALE_BARN_GATE },
    { id: 'male' as const, orientation: 'horizontal' as const, coord: 34, opening: MALE_ROTATION_GATE },
    { id: 'male' as const, orientation: 'vertical' as const, coord: 77, opening: MALE_BARN_GATE },
  ],
  staffPassages: [
    { group: 'female' as const, orientation: 'horizontal' as const, coord: 34, opening: FEMALE_STAFF_TO_ROTATION },
    { group: 'female' as const, orientation: 'vertical' as const, coord: 33, opening: FEMALE_STAFF_TO_BARN },
    { group: 'male' as const, orientation: 'horizontal' as const, coord: 34, opening: MALE_STAFF_TO_ROTATION },
    { group: 'male' as const, orientation: 'vertical' as const, coord: 77, opening: MALE_STAFF_TO_BARN },
    { group: 'female' as const, orientation: 'horizontal' as const, coord: 34, opening: FEMALE_STAFF_TO_ACTIVE },
    { group: 'male' as const, orientation: 'horizontal' as const, coord: 34, opening: MALE_STAFF_TO_ACTIVE },
  ],
  deliveryGate: { orientation: 'vertical' as const, coord: 96, opening: { start: 56, end: 62 } },
  pools: [
    { x: 39, y: 27, rx: 4, ry: 3 },
    { x: 70, y: 27, rx: 4, ry: 3 },
  ],
  meadowTrees: [
    { x: 23, y: 26 },
    { x: 30, y: 30 },
    { x: 43, y: 24 },
    { x: 66, y: 24 },
    { x: 79, y: 30 },
    { x: 89, y: 25 },
  ],
  receivingSpots: [
    { x: 79.5, y: 69.25 },
    { x: 84.5, y: 69.25 },
    { x: 79.5, y: 71.75 },
    { x: 84.5, y: 71.75 },
  ],
  palletFootprint: { w: 0.85, h: 0.7 },
  stations,
  trough: { x: 43, y: 32.5 },
  feeder: { x: 20, y: 23 },
  trough2: { x: 66, y: 32.5 },
  feeder2: { x: 89, y: 23 },
  playerStart: { x: 52, y: 53 },
  barrowStart: { x: 35, y: 60 },
  jackStart: { x: 75, y: 70 },
  partnerStart: { x: 64, y: 46 },
  pailSpot: { x: 45, y: 59 },
  basketSpot: { x: 47, y: 69 },
  shovelSpot: { x: 30, y: 78 },
  rackSpots: {
    scoop: { x: 32.5, y: 57.2 },
    fork: { x: 32.5, y: 58 },
    broom: { x: 32.5, y: 58.8 },
    bucket: { x: 32.5, y: 59.6 },
    spareBucket: { x: 32.5, y: 60.4 },
    net: { x: 32.5, y: 61 },
  },
  basinSpots: [
    { x: 42, y: 66.2 },
    { x: 42, y: 66.7 },
    { x: 42, y: 67.2 },
    { x: 42, y: 67.7 },
    { x: 42, y: 68.2 },
    { x: 42, y: 68.7 },
    { x: 42, y: 69.2 },
  ],
  thresholds: [
    { x0: 42, y0: 34, x1: 47, y1: 34 },
    { x0: 62, y0: 34, x1: 67, y1: 34 },
    { x0: 41, y0: 48, x1: 47, y1: 48 },
    { x0: 61, y0: 48, x1: 67, y1: 48 },
    { x0: 20, y0: 56, x1: 24, y1: 56 },
    { x0: 22, y0: 64, x1: 26, y1: 64 },
    { x0: 33, y0: 56, x1: 36, y1: 56 },
    { x0: 43, y0: 56, x1: 46, y1: 56 },
    { x0: 33, y0: 64, x1: 36, y1: 64 },
    { x0: 42, y0: 64, x1: 45, y1: 64 },
    { x0: 50, y0: 64, x1: 53, y1: 64 },
  ],
} as const;

const EMPTY_RECT: Rect = { x0: 64, y0: 48, x1: 64, y1: 48 };
const legacyComplexes: Record<ComplexId, typeof FEMALE> = {
  female: {
    bounds: LEGACY_LAYOUT.paddock,
    active: LEGACY_LAYOUT.paddock,
    rotation: EMPTY_RECT,
    barn: EMPTY_RECT,
  },
  male: {
    bounds: LEGACY_LAYOUT.paddock2,
    active: LEGACY_LAYOUT.paddock2,
    rotation: EMPTY_RECT,
    barn: EMPTY_RECT,
  },
};

const LEGACY_MAP = {
  ...MODERN_MAP,
  w: LEGACY_LAYOUT.w,
  h: LEGACY_LAYOUT.h,
  floor: LEGACY_LAYOUT.floor,
  complexes: legacyComplexes,
  paddock: LEGACY_LAYOUT.paddock,
  paddock2: LEGACY_LAYOUT.paddock2,
  bedding: LEGACY_LAYOUT.bedding,
  bedding2: LEGACY_LAYOUT.bedding2,
  fenceY: LEGACY_LAYOUT.fenceY,
  fenceY2: LEGACY_LAYOUT.fenceY2,
  fenceX: LEGACY_LAYOUT.fenceX,
  fenceX2: LEGACY_LAYOUT.fenceX2,
  door: LEGACY_LAYOUT.door,
  door2: LEGACY_LAYOUT.door2,
  elephantGate: LEGACY_LAYOUT.elephantGate,
  elephantGate2: LEGACY_LAYOUT.elephantGate2,
  forest: LEGACY_LAYOUT.forest,
  yard: LEGACY_LAYOUT.yard,
  road: LEGACY_LAYOUT.road,
  roads: [{ x0: 56, y0: 0, x1: 64, y1: 48 }],
  areas: {
    ...MODERN_MAP.areas,
    northReserve: EMPTY_RECT,
    eastReserve: EMPTY_RECT,
    centralPath: { x0: 4, y0: 13, x1: 52, y1: 17 },
    eastPath: { x0: 52, y0: 13, x1: 56, y1: 28 },
    adminConnector: EMPTY_RECT,
    lowerRoomsPath: { x0: 4, y0: 24, x1: 52, y1: 28 },
    westRoomsPath: EMPTY_RECT,
    westStorageApproach: EMPTY_RECT,
    hayApproach: EMPTY_RECT,
    hayUnload: EMPTY_RECT,
    truckYard: EMPTY_RECT,
    truckBay: EMPTY_RECT,
    palletBuffer: { x0: 52.5, y0: 10.5, x1: 55.7, y1: 14.3 },
    parking: EMPTY_RECT,
    parkingWalk: EMPTY_RECT,
    equipmentYard: EMPTY_RECT,
    garageApproach: EMPTY_RECT,
  },
  rooms: { ...MODERN_MAP.rooms, ...LEGACY_LAYOUT.rooms },
  walls: LEGACY_LAYOUT.walls,
  barriers: LEGACY_LAYOUT.barriers,
  gates: [
    {
      id: 'female' as const,
      orientation: 'horizontal' as const,
      coord: LEGACY_LAYOUT.fenceY,
      opening: { start: LEGACY_LAYOUT.elephantGate.x0, end: LEGACY_LAYOUT.elephantGate.x1 },
    },
    {
      id: 'male' as const,
      orientation: 'horizontal' as const,
      coord: LEGACY_LAYOUT.fenceY2,
      opening: { start: LEGACY_LAYOUT.elephantGate2.x0, end: LEGACY_LAYOUT.elephantGate2.x1 },
    },
  ],
  staffPassages: [],
  deliveryGate: { orientation: 'vertical' as const, coord: 64, opening: { start: 0, end: 0 } },
  pools: LEGACY_LAYOUT.pools,
  meadowTrees: LEGACY_LAYOUT.meadowTrees,
  receivingSpots: LEGACY_LAYOUT.receivingSpots,
  palletFootprint: LEGACY_LAYOUT.palletFootprint,
  stations: { ...MODERN_MAP.stations, ...LEGACY_LAYOUT.stations },
  trough: LEGACY_LAYOUT.trough,
  feeder: LEGACY_LAYOUT.feeder,
  trough2: LEGACY_LAYOUT.trough2,
  feeder2: LEGACY_LAYOUT.feeder2,
  playerStart: LEGACY_LAYOUT.playerStart,
  barrowStart: LEGACY_LAYOUT.barrowStart,
  jackStart: { x: 49.5, y: 15.4 },
  partnerStart: { x: 51, y: 26 },
  pailSpot: LEGACY_LAYOUT.pailSpot,
  basketSpot: LEGACY_LAYOUT.basketSpot,
  shovelSpot: LEGACY_LAYOUT.shovelSpot,
  rackSpots: LEGACY_LAYOUT.rackSpots,
  basinSpots: LEGACY_LAYOUT.basinSpots,
  thresholds: LEGACY_LAYOUT.thresholds,
} as const;

const useLegacyMap = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('map') !== 'new';
export const MAP = useLegacyMap ? LEGACY_MAP : MODERN_MAP;
// Идентификатор карты для header сейва: загрузка чужого сейва блокируется в sim/save.ts
export const MAP_ID: 'modern' | 'legacy' = useLegacyMap ? 'legacy' : 'modern';
export const COMPLEXES: Record<ComplexId, typeof FEMALE> = MAP.complexes;
export const PADDOCKS = (Object.entries(COMPLEXES) as [ComplexId, typeof FEMALE][]).map(([id, complex]) => ({
  ...complex.bounds,
  id,
}));

export type StationId = keyof typeof MAP.stations;
export type RoomId = keyof typeof MAP.rooms;

export function inBedding(x: number, y: number): boolean {
  for (const b of [MAP.bedding, MAP.bedding2]) {
    if (x >= b.x && x < b.x + b.cols && y >= b.y && y < b.y + b.rows) return true;
  }
  return false;
}

export function complexAt(x: number, y: number): ComplexId | null {
  for (const p of PADDOCKS) {
    if (x >= p.x0 && x < p.x1 && y >= p.y0 && y < p.y1) return p.id;
  }
  return null;
}

export function inComplex(id: ComplexId, x: number, y: number): boolean {
  const p = COMPLEXES[id].bounds;
  return x >= p.x0 && x < p.x1 && y >= p.y0 && y < p.y1;
}

export function inBarn(x: number, y: number): boolean {
  return inRect(COMPLEXES.female.barn, x, y) || inRect(COMPLEXES.male.barn, x, y);
}

export function paddockAt(x: number, y: number): (typeof PADDOCKS)[number] | null {
  const id = complexAt(x, y);
  return id === null ? null : PADDOCKS.find((p) => p.id === id) ?? null;
}

export function inPaddock(x: number, y: number): boolean {
  const id = complexAt(x, y);
  if (id === null) return false;
  const { active, rotation } = COMPLEXES[id];
  return inRect(active, x, y) || inRect(rotation, x, y);
}

export function isHardFloor(x: number, y: number): boolean {
  return !inPaddock(x, y) || inBarn(x, y);
}

export function inReachZone(x: number, y: number): boolean {
  if (useLegacyMap) {
    const upper = MAP.paddock;
    const lower = MAP.paddock2;
    return (
      (y >= MAP.fenceY && y < MAP.fenceY + 1.3 && x >= upper.x0 && x < MAP.fenceX) ||
      (y >= MAP.fenceY2 - 1.3 && y < MAP.fenceY2 && x >= lower.x0 && x < MAP.fenceX2)
    );
  }
  for (const id of ['female', 'male'] as const) {
    const b = COMPLEXES[id].bounds;
    if ((Math.abs(y - b.y1) < 1.3 || Math.abs(y - b.y0) < 1.3) && x >= b.x0 && x < b.x1) return true;
    if ((Math.abs(x - b.x0) < 1.3 || Math.abs(x - b.x1) < 1.3) && y >= b.y0 && y < b.y1) return true;
  }
  return false;
}

export function floorZoneOf(x: number, y: number): string {
  if (useLegacyMap) {
    if (x < MAP.forest.x1) return 'forest';
    if (x >= MAP.road.x0) return 'road';
    const paddock = paddockAt(x, y);
    if (paddock) return `pad-${paddock.id}`;
    if (x >= MAP.yard.x0) return 'yard';
    for (const [id, room] of Object.entries(MAP.rooms)) {
      if (inRect(room, x, y)) return id;
    }
    return y < 24 ? 'corrUp' : 'corrDown';
  }
  for (const [id, r] of Object.entries(MAP.rooms)) {
    if (inRect(r, x, y)) return id;
  }
  if (inPaddock(x, y)) return `paddock-${complexAt(x, y)}`;
  if (MAP.roads.some((r) => inRect(r, x, y))) return 'road';
  if (inRect(MAP.areas.eastPath, x, y)) return 'east-path';
  if (inRect(MAP.areas.centralPath, x, y)) return 'central-path';
  return 'service-floor';
}

export function stationDist(id: StationId, x: number, y: number): number {
  const s = MAP.stations[id];
  const dx = Math.max(Math.abs(x - s.x) - s.w / 2, 0);
  const dy = Math.max(Math.abs(y - s.y) - s.h / 2, 0);
  return Math.hypot(dx, dy);
}

export function nearStation(id: StationId, x: number, y: number, reach: number): boolean {
  return stationDist(id, x, y) <= reach;
}

export function inRoom(id: RoomId, x: number, y: number): boolean {
  return x > MAP.rooms[id].x0 && x < MAP.rooms[id].x1 && y > MAP.rooms[id].y0 && y < MAP.rooms[id].y1;
}

export function inPool(i: number, x: number, y: number): boolean {
  const p = MAP.pools[i];
  const dx = (x - p.x) / p.rx;
  const dy = (y - p.y) / p.ry;
  return dx * dx + dy * dy <= 1;
}

export function poolEdgeDist(i: number, x: number, y: number): number {
  const p = MAP.pools[i];
  const dx = (x - p.x) / p.rx;
  const dy = (y - p.y) / p.ry;
  return Math.hypot(dx, dy);
}

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
}
