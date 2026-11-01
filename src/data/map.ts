// Карта слоновника в клетках. 1 клетка ≈ 1 м.

export const MAP = {
  w: 22,
  h: 16,
  // Подстилка: здесь живут слонихи. Клетки cx 0..11, cy 0..7.
  bedding: { x: 1, y: 1, cols: 12, rows: 8 },
  // Ограждение: нижняя линия y=9 (x 1..13) и правая линия x=13 (y 1..9)
  fenceY: 9,
  fenceX: 13,
  gate: { x0: 6, x1: 8 }, // проход в нижней линии
  stations: {
    rack: { x: 3.5, y: 11.6, w: 4.4, h: 0.9, label: 'Стойка инвентаря' },
    sawdust: { x: 6.6, y: 11.6, w: 0.9, h: 0.9, label: 'Опилки' },
    bags: { x: 1.6, y: 12.9, w: 0.9, h: 0.9, label: 'Мешки 240 л' },
    wash: { x: 9.8, y: 13.3, w: 2.2, h: 1.0, label: 'Мойка' },
    kitchen: { x: 16.5, y: 12.2, w: 2.6, h: 1.4, label: 'Кормовая' },
    hay: { x: 19.6, y: 3.5, w: 1.6, h: 1.4, label: 'Сенник: сено' },
    straw: { x: 19.6, y: 6.2, w: 1.6, h: 1.4, label: 'Сенник: солома' },
    dump: { x: 20.6, y: 14.6, w: 1.4, h: 1.0, label: 'Помойка' },
    valve: { x: 14.4, y: 1.6, w: 0.6, h: 0.6, label: 'Вентиль поилки' },
    fencePanel: { x: 14.6, y: 9.8, w: 0.6, h: 0.6, label: 'Электропастух' },
    gate: { x: 7, y: 9, w: 2, h: 0.3, label: 'Задвижка' },
  },
  // Внутри подстилки
  trough: { x: 11.8, y: 1.6 },
  feeder: { x: 2.2, y: 1.6 },
  playerStart: { x: 7, y: 11 },
  // Где лежит инвентарь на стойке
  rackSpots: {
    bucket: { x: 1.8, y: 11.6 },
    scoop: { x: 2.9, y: 11.6 },
    fork: { x: 4.0, y: 11.6 },
    broom: { x: 5.1, y: 11.6 },
    spareBucket: { x: 6.0, y: 11.0 },
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
