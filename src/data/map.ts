// Карта слоновника в клетках. 1 клетка ≈ 1 м.
//
//  ┌──────────── шатёр ─────────────┬────── двор ──────┐
//  │ подстилка 12×8                  │ сено, солома     │
//  │                                 │ вентиль          │
//  ├──── проход ──┬── ворота слона ──┤ мусорный бак     │
//  │ коридор: стойка, опилки, мешки  ├──────────────────┤
//  │              │  мойка (слив)    │  кормовая        │
//  └──────────────┴──────────────────┴──────────────────┘

export const MAP = {
  w: 22,
  h: 16,
  // Подстилка: здесь живут слонихи. Клетки cx 0..11, cy 0..7.
  bedding: { x: 1, y: 1, cols: 12, rows: 8 },
  // Ограждение: нижняя линия y=9 (x 1..13) и правая линия x=13 (y 1..9)
  fenceY: 9,
  fenceX: 13,
  door: { x0: 4.2, x1: 5.8 }, // проход для человека: слон не пролезет
  elephantGate: { x0: 8.8, x1: 11.6 }, // ворота для слона: открывать, чтобы вывести
  // Стены комнат: отрезки, проёмы — промежутки между ними
  rooms: {
    wash: { x0: 9.6, y0: 11.6, x1: 16, y1: 15.6, label: 'МОЙКА' },
    kitchen: { x0: 16, y0: 11.6, x1: 22, y1: 15.6, label: 'КОРМОВАЯ' },
  },
  walls: [
    { x0: 9.6, y0: 11.6, x1: 11.2, y1: 11.6 },
    { x0: 13.6, y0: 11.6, x1: 16, y1: 11.6 }, // дверь в мойку 11.2–13.6: широкая, слон пройдёт
    { x0: 9.6, y0: 11.6, x1: 9.6, y1: 15.6 },
    { x0: 16, y0: 11.6, x1: 16, y1: 15.6 },
    { x0: 16, y0: 11.6, x1: 17.4, y1: 11.6 },
    { x0: 18.8, y0: 11.6, x1: 22, y1: 11.6 }, // дверь в кормовую 17.4–18.8
  ],
  stations: {
    rack: { x: 0.75, y: 12.3, w: 0.5, h: 3.2, label: 'Стойка инвентаря' },
    sawdust: { x: 4.4, y: 15.1, w: 0.9, h: 0.9, label: 'Опилки' },
    bags: { x: 5.8, y: 15.1, w: 0.9, h: 0.9, label: 'Мешки 240 л' },
    wash: { x: 15.0, y: 12.3, w: 1.6, h: 0.8, label: 'Раковина' },
    hose: { x: 10.4, y: 12.2, w: 0.6, h: 0.6, label: 'Шланг' },
    drain: { x: 12.4, y: 14.6, w: 1.0, h: 0.6, label: 'Слив' },
    drain2: { x: 14.6, y: 14.6, w: 1.0, h: 0.6, label: 'Слив' },
    kitchen: { x: 19.2, y: 13.6, w: 2.6, h: 1.4, label: 'Кормовая' },
    hay: { x: 19.6, y: 3.2, w: 1.6, h: 1.4, label: 'Сенник: сено' },
    straw: { x: 19.6, y: 5.8, w: 1.6, h: 1.4, label: 'Сенник: солома' },
    dump: { x: 19.9, y: 8.3, w: 2.8, h: 1.3, label: 'Мусорный бак' },
    valve: { x: 14.4, y: 1.6, w: 0.6, h: 0.6, label: 'Вентиль поилки' },
    fencePanel: { x: 3.3, y: 9.15, w: 0.7, h: 0.5, label: 'Электропастух' },
    gate: { x: 10.2, y: 9, w: 2.8, h: 1.2, label: 'Ворота' },
  },
  // Внутри подстилки
  trough: { x: 11.8, y: 1.6 },
  feeder: { x: 2.2, y: 1.6 },
  playerStart: { x: 5, y: 10.8 },
  barrowStart: { x: 2.8, y: 14.9 }, // место тачки — у стойки
  // Где висит инвентарь на стойке
  rackSpots: {
    scoop: { x: 1.25, y: 11.2 },
    fork: { x: 1.25, y: 12.2 },
    broom: { x: 1.25, y: 13.2 },
    bucket: { x: 1.4, y: 14.3 },
    spareBucket: { x: 1.4, y: 15.1 },
  },
} as const;

export type StationId = keyof typeof MAP.stations;

export function inBedding(x: number, y: number): boolean {
  const b = MAP.bedding;
  return x >= b.x && x < b.x + b.cols && y >= b.y && y < b.y + b.rows;
}

// Полоса снаружи ограждения, до которой дотягивается хобот
export function inReachZone(x: number, y: number): boolean {
  const bottom = y >= MAP.fenceY && y < MAP.fenceY + 1.3 && x >= MAP.bedding.x && x < MAP.fenceX + 1.3;
  const right = x >= MAP.fenceX && x < MAP.fenceX + 1.3 && y >= MAP.bedding.y && y < MAP.fenceY + 1.3;
  return bottom || right;
}

export function nearStation(id: StationId, x: number, y: number, reach: number): boolean {
  const s = MAP.stations[id];
  const dx = Math.max(Math.abs(x - s.x) - s.w / 2, 0);
  const dy = Math.max(Math.abs(y - s.y) - s.h / 2, 0);
  return Math.hypot(dx, dy) <= reach;
}

export function inRoom(id: keyof typeof MAP.rooms, x: number, y: number): boolean {
  const r = MAP.rooms[id];
  return x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
}
