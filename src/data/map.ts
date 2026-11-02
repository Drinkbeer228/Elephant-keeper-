// Карта комплекса на два слоновника, в клетках. 1 клетка ≈ 1 м. Мир 64×48.
//
//      x0        4                  22              40          52   56    64
//  y=0  ┌──небо/отступ под HUD──────────────────────────────────────────────┐
//       │ ЛЕС │   ВЕРХНИЙ ЗАГОН (самки): песок │ луг, бассейн │ решётка │двор│ ДОРОГА
//  y=13 │     ├──дверь+ворота──ВЕРХНЯЯ РЕШЁТКА─────────────────────────┼────┤
//       │ ЛЕС │        ВЕРХНИЙ РАБОЧИЙ КОРИДОР (навигационные линии)    │двор│
//  y=17 │     ├─ДЕЖУРКА─┬─МОЙКА─┬─КОРМОВАЯ─┬─СЕННИК─┬─ОПИЛОЧНИК─┬────┤    │
//       │ ЛЕС │  (двери и в верхний, и в нижний коридор)          │    │
//  y=24 │     ├───────────НИЖНИЙ РАБОЧИЙ КОРИДОР──────────────────────┤    │
//  y=28 │     ├──дверь+ворота──НИЖНЯЯ РЕШЁТКА────────────────────────┼────┤
//       │ ЛЕС │   НИЖНИЙ ЗАГОН (самцы): песок │ луг, бассейн │ решётка │двор│
//  y=47 └─────┴───────────────────────────────────────────────────────┴────┘
//  Справа у дороги: мусорный бак (пухто) и зона разгрузки борта продуктового грузовика.

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Верхний загон — слонихи, нижний — самцы. У каждого своя решётка, дверь и ворота
export const PADDOCKS = [
  { x0: 4, y0: 1, x1: 52, y1: 13, side: 'south' as const },
  { x0: 4, y0: 28, x1: 52, y1: 47, side: 'north' as const },
];

export const MAP = {
  w: 64,
  h: 48,
  // Сетка пола покрывает весь мир; за загонами — бетон
  floor: { x: 0, y: 0, cols: 64, rows: 48 },
  // Подстилка-песок: у обоих загонов слева, 18×12
  bedding: { x: 4, y: 1, cols: 18, rows: 12 },
  bedding2: { x: 4, y: 28, cols: 18, rows: 12 },
  // Вольеры: верхний (самки) и нижний (самцы)
  paddock: { x0: 4, y0: 1, x1: 52, y1: 13 },
  paddock2: { x0: 4, y0: 28, x1: 52, y1: 47 },
  // Решётки: нижняя линия верхнего загона y=13, верхняя линия нижнего y=28; правые — x=52
  fenceY: 13,
  fenceX: 52,
  fenceY2: 28,
  fenceX2: 52,
  door: { x0: 6.2, x1: 7.6 }, // проход для человека (верх)
  elephantGate: { x0: 9.6, x1: 12.4 }, // ворота для слона (верх)
  door2: { x0: 6.2, x1: 7.6 },
  elephantGate2: { x0: 9.6, x1: 12.4 },
  // Лесополоса слева — граница территории, непроходима
  forest: { x1: 4 },
  // Служебный двор между загонами и дорогой; асфальтовая дорога — правый край
  yard: { x0: 52, x1: 56 },
  road: { x0: 56, x1: 64, y0: 0, y1: 48 },
  rooms: {
    duty: { x0: 4, y0: 17, x1: 13.6, y1: 24, label: 'ДЕЖУРКА' },
    wash: { x0: 13.6, y0: 17, x1: 23.2, y1: 24, label: 'МОЙКА' },
    kitchen: { x0: 23.2, y0: 17, x1: 32.8, y1: 24, label: 'КОРМОВАЯ' },
    hay: { x0: 32.8, y0: 17, x1: 42.4, y1: 24, label: 'СЕННИК' },
    sawdust: { x0: 42.4, y0: 17, x1: 52, y1: 24, label: 'ОПИЛОЧНИК' },
  },
  // Стены построек: отрезки с проёмами-дверями (у каждого помещения двери в оба коридора)
  walls: [
    // Северные стены (y=17), проёмы — двери из верхнего коридора
    { x0: 4, y0: 17, x1: 6.2, y1: 17 },
    { x0: 7.6, y0: 17, x1: 13.6, y1: 17 },
    { x0: 13.6, y0: 17, x1: 16.4, y1: 17 },
    { x0: 17.8, y0: 17, x1: 23.2, y1: 17 },
    { x0: 23.2, y0: 17, x1: 26.6, y1: 17 },
    { x0: 28.0, y0: 17, x1: 32.8, y1: 17 },
    { x0: 32.8, y0: 17, x1: 36.6, y1: 17 },
    { x0: 38.0, y0: 17, x1: 42.4, y1: 17 },
    { x0: 42.4, y0: 17, x1: 46.4, y1: 17 },
    { x0: 47.8, y0: 17, x1: 52, y1: 17 },
    // Южные стены (y=24), проёмы — двери из нижнего коридора
    { x0: 4, y0: 24, x1: 10.0, y1: 24 },
    { x0: 11.4, y0: 24, x1: 13.6, y1: 24 },
    { x0: 13.6, y0: 24, x1: 19.6, y1: 24 },
    { x0: 21.0, y0: 24, x1: 23.2, y1: 24 },
    { x0: 23.2, y0: 24, x1: 29.2, y1: 24 },
    { x0: 30.6, y0: 24, x1: 32.8, y1: 24 },
    { x0: 32.8, y0: 24, x1: 38.8, y1: 24 },
    { x0: 40.2, y0: 24, x1: 42.4, y1: 24 },
    { x0: 42.4, y0: 24, x1: 48.0, y1: 24 },
    { x0: 49.4, y0: 24, x1: 52, y1: 24 },
    // Перегородки между помещениями
    { x0: 13.6, y0: 17, x1: 13.6, y1: 24 },
    { x0: 23.2, y0: 17, x1: 23.2, y1: 24 },
    { x0: 32.8, y0: 17, x1: 32.8, y1: 24 },
    { x0: 42.4, y0: 17, x1: 42.4, y1: 24 },
    // Западная и восточная стены блока помещений
    { x0: 4, y0: 17, x1: 4, y1: 24 },
    { x0: 52, y0: 17, x1: 52, y1: 24 },
  ],
  // Перила дороги: игроку на асфальт хода нет
  barriers: [{ x0: 56, y0: 0, x1: 56, y1: 48, kind: 'railing' as const }],
  // Бассейны на лугах: эллипсы с пологим входом
  pools: [
    { x: 40.5, y: 6.5, rx: 5.5, ry: 3.2 },
    { x: 40.5, y: 38, rx: 5.5, ry: 3.2 },
  ],
  stations: {
    // Дежурка
    rack: { x: 5.0, y: 21.2, w: 0.5, h: 4.6, label: 'Стойка инвентаря' },
    bags: { x: 9.6, y: 23.1, w: 1.2, h: 0.9, label: 'Мешки 240 л' },
    locker: { x: 12.4, y: 18.3, w: 1.6, h: 0.7, label: 'Шкафчики' },
    // Мойка
    wash: { x: 17.2, y: 18.3, w: 1.6, h: 0.8, label: 'Раковина' },
    drain: { x: 15.6, y: 22.6, w: 1.0, h: 0.6, label: 'Слив' },
    drain2: { x: 19.2, y: 22.6, w: 1.0, h: 0.6, label: 'Слив' },
    // Кормовая
    basinRack: { x: 24.3, y: 21.0, w: 0.6, h: 3.2, label: 'Стеллаж тазов' },
    stove: { x: 26.2, y: 18.5, w: 2.2, h: 1.2, label: 'Котёл каши' },
    kitchen: { x: 28.8, y: 21.0, w: 2.6, h: 1.4, label: 'Стол нарезки' },
    vegRack: { x: 31.9, y: 20.6, w: 0.6, h: 1.6, label: 'Овощи и фрукты' },
    // Сенник
    hay: { x: 37.6, y: 23.0, w: 3.2, h: 0.9, label: 'Сенник: сено' },
    straw: { x: 34.8, y: 18.6, w: 1.2, h: 1.0, label: 'Сенник: солома' },
    // Опилочник
    sawdust: { x: 47.6, y: 23.0, w: 1.8, h: 1.0, label: 'Ларь опилок' },
    // Двор справа
    dump: { x: 54.0, y: 21.5, w: 2.4, h: 1.4, label: 'Мусорный бак' },
    // Борт продуктового грузовика: встаёт у дороги (зона разгрузки)
    unload: { x: 54.4, y: 10.2, w: 1.6, h: 1.0, label: 'Борт грузовика' },
    // Поилки у решёток: вентили со стороны коридора
    valve: { x: 27, y: 12.9, w: 0.6, h: 0.6, label: 'Вентиль поилки' },
    valve2: { x: 27, y: 28.3, w: 0.6, h: 0.6, label: 'Вентиль поилки' },
    lightSwitch: { x: 6.0, y: 16.75, w: 0.4, h: 0.4, label: 'Выключатель дежурного света' },
    gate: { x: 11, y: 13, w: 2.8, h: 1.2, label: 'Ворота' },
  },
  // Кормушки и поилки: верхний и нижний загоны
  trough: { x: 27, y: 12.2 },
  feeder: { x: 6.4, y: 2.4 },
  trough2: { x: 27, y: 28.9 },
  feeder2: { x: 6.4, y: 45.6 },
  playerStart: { x: 5.2, y: 15.2 },
  barrowStart: { x: 8.2, y: 19.4 }, // тачка — в дежурке, подальше от стойки и мешков
  // Рохля — свободный бетонный пятачок в восточном конце коридора, у выхода к дороге
  jackStart: { x: 49.5, y: 15.4 },
  pailSpot: { x: 11.9, y: 19.0 }, // ведро для опилок — в дежурке у шкафчиков
  basketSpot: { x: 30.6, y: 22.7 }, // корзина для овощей — у стеллажа кормовой
  shovelSpot: { x: 44.8, y: 18.7 }, // совковая лопата — в Опилочнике у стены
  // Где висит инвентарь на стойке (включая длинный сачок)
  rackSpots: {
    scoop: { x: 5.6, y: 19.5 },
    fork: { x: 5.6, y: 20.3 },
    broom: { x: 5.6, y: 21.1 },
    bucket: { x: 5.6, y: 22.0 },
    spareBucket: { x: 5.6, y: 22.8 },
    net: { x: 5.6, y: 23.4 },
  },
  // Места тазов на стеллаже в кормовой
  basinSpots: [
    { x: 24.9, y: 19.6 },
    { x: 24.9, y: 20.4 },
    { x: 24.9, y: 21.2 },
    { x: 24.9, y: 22.0 },
  ],
  // Двери помещений (проёмы в стенах) — для порогов-«встрясок» и разметки
  thresholds: [
    { x0: 6.2, y0: 17, x1: 7.6, y1: 17 },
    { x0: 16.4, y0: 17, x1: 17.8, y1: 17 },
    { x0: 26.6, y0: 17, x1: 28.0, y1: 17 },
    { x0: 36.6, y0: 17, x1: 38.0, y1: 17 },
    { x0: 46.4, y0: 17, x1: 47.8, y1: 17 },
    { x0: 10.0, y0: 24, x1: 11.4, y1: 24 },
    { x0: 19.6, y0: 24, x1: 21.0, y1: 24 },
    { x0: 29.2, y0: 24, x1: 30.6, y1: 24 },
    { x0: 38.8, y0: 24, x1: 40.2, y1: 24 },
    { x0: 48.0, y0: 24, x1: 49.4, y1: 24 },
  ],
} as const;

export type StationId = keyof typeof MAP.stations;
export type RoomId = keyof typeof MAP.rooms;

export function inBedding(x: number, y: number): boolean {
  for (const b of [MAP.bedding, MAP.bedding2]) {
    if (x >= b.x && x < b.x + b.cols && y >= b.y && y < b.y + b.rows) return true;
  }
  return false;
}

// Внутри любого из двух загонов
export function inPaddock(x: number, y: number): boolean {
  for (const p of PADDOCKS) if (x >= p.x0 && x < p.x1 && y >= p.y0 && y < p.y1) return true;
  return false;
}

// Какой загон в этой точке (для кормушек, поилок и прогулок слонов)
export function paddockAt(x: number, y: number): (typeof PADDOCKS)[number] | null {
  return PADDOCKS.find((p) => x >= p.x0 && x < p.x1 && y >= p.y0 && y < p.y1) ?? null;
}

// Твёрдый пол: коридоры, постройки, двор, дорога. По подстилке и траве у рохли колёса не едут
export function isHardFloor(x: number, y: number): boolean {
  return !inPaddock(x, y);
}

// Полоса у решётки, до которой дотягивается хобот с дорожки: снизу верхнего загона
// и сверху нижнего. Правые решётки — у двора, туда хобот не дотягивается
export function inReachZone(x: number, y: number): boolean {
  const u = MAP.paddock;
  const l = MAP.paddock2;
  const south = y >= MAP.fenceY && y < MAP.fenceY + 1.3 && x >= u.x0 && x < MAP.fenceX;
  const north = y >= MAP.fenceY2 - 1.3 && y < MAP.fenceY2 && x >= l.x0 && x < MAP.fenceX2;
  return south || north;
}

// Зона покрытия — для встрясок тачки на «стыках»: вольер, комнаты, коридоры, двор, дорога
export function floorZoneOf(x: number, y: number): string {
  if (x < MAP.forest.x1) return 'forest';
  if (x >= MAP.road.x0) return 'road';
  for (const p of PADDOCKS) if (x >= p.x0 && x < p.x1 && y >= p.y0 && y < p.y1) return `pad${p === PADDOCKS[0] ? 1 : 2}`;
  if (x >= MAP.yard.x0) return 'yard';
  for (const [id, r] of Object.entries(MAP.rooms)) {
    if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) return id;
  }
  return y < 24 ? 'corrUp' : 'corrDown';
}

// Расстояние до края станции
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
  const r = MAP.rooms[id];
  return x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
}

// Внутри бассейна (для купания) или у его кромки (для сачка)
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
  return Math.hypot(dx, dy); // <1 — в воде, ≈1 — у кромки
}
