import { C, T } from './palette';
import { Sprite, ellipse, grid, line, rect, union } from './pixel';

// Станции и обстановка в пиксель-арте. Картинка стоит на нижней строке кадра.

function rack(): Sprite {
  const s = new Sprite(72, 22);
  s.shape(rect(2, 2, 5, 21), T.wood);
  s.shape(rect(66, 2, 69, 21), T.wood);
  s.shape(rect(34, 2, 37, 21), T.wood);
  s.shape(rect(1, 4, 70, 8), T.wood);
  s.shape(rect(1, 14, 70, 17), T.wood);
  // Крючки
  for (const x of [14, 26, 46, 58]) {
    s.set(x, 9, C.grey);
    s.set(x, 10, C.grey);
    s.set(x + 1, 11, C.grey);
  }
  // Шляпки гвоздей
  for (const x of [3, 35, 67]) {
    s.set(x + 1, 6, C.k);
    s.set(x + 1, 15, C.k);
  }
  return s;
}

function sawdustBin(): Sprite {
  const s = new Sprite(16, 18);
  s.shape(rect(1, 7, 14, 17), T.wood);
  for (let x = 2; x <= 13; x++) s.set(x, 12, C.redDark);
  s.shape(ellipse(7.5, 7, 6.8, 4), T.cream);
  for (const [x, y] of [[4, 6], [7, 4], [10, 6], [6, 8], [11, 8]]) s.set(x, y, '#e4b878');
  return s;
}

function bagsPile(): Sprite {
  const s = new Sprite(16, 14);
  s.shape(rect(1, 9, 14, 13), T.black);
  s.shape(rect(2, 5, 13, 9), T.black);
  s.shape(rect(3, 1, 12, 5), T.black);
  return s;
}

function wash(): Sprite {
  const s = new Sprite(36, 28);
  s.shape(rect(4, 14, 6, 27), T.steel);
  s.shape(rect(29, 14, 31, 27), T.steel);
  s.shape(union(rect(1, 10, 34, 15), rect(3, 15, 32, 16)), T.metal);
  s.fill(rect(4, 11, 31, 13), '#3c4c5c');
  s.fill(rect(6, 11, 14, 11), C.blueLight);
  // Кран
  s.shape(union(rect(25, 2, 27, 10), rect(25, 2, 31, 4), rect(29, 2, 31, 6)), T.steel);
  s.shape(ellipse(26, 7, 2.2, 2.2), T.red);
  // Шланг
  s.shape(line([[10, 17], [5, 21], [10, 25], [17, 24], [16, 20]], 1.2), T.green);
  return s;
}

function kitchen(cooking: boolean): Sprite {
  const s = new Sprite(44, 34);
  // Стол
  s.shape(rect(3, 20, 5, 33), T.wood);
  s.shape(rect(38, 20, 40, 33), T.wood);
  s.shape(rect(0, 15, 43, 20), T.wood);
  // Кастрюля с кашей
  s.shape(union(rect(5, 5, 18, 15), ellipse(11.5, 15, 7, 1.5)), T.metal);
  s.shape(ellipse(11.5, 5, 7, 2), T.metal);
  s.fill(ellipse(11.5, 5.2, 5.4, 1), cooking ? C.goldLight : C.greyDark);
  s.set(3, 7, C.k);
  s.set(20, 7, C.k);
  if (cooking) {
    for (const [x, y] of [[8, 1], [12, 0], [15, 2], [10, 2]]) s.set(x, y, C.white);
  }
  // Ящик с овощами
  s.shape(rect(23, 9, 38, 15), T.wood);
  for (const [x, y, c] of [
    [25, 8, '#f87858'],
    [26, 8, '#f87858'],
    [27, 7, C.greenLight],
    [29, 8, '#a80020'],
    [30, 8, '#a80020'],
    [30, 7, '#a80020'],
    [33, 8, '#e4c47c'],
    [34, 8, '#e4c47c'],
    [36, 8, C.gold],
    [36, 7, C.greenLight],
  ] as [number, number, string][])
    s.set(x, y, c);
  return s;
}

function hayStack(): Sprite {
  const s = new Sprite(30, 30);
  const bale = (x: number, y: number) => {
    s.shape(rect(x, y, x + 13, y + 7), T.straw);
    for (let yy = y + 1; yy < y + 7; yy++) {
      s.set(x + 4, yy, C.redDark);
      s.set(x + 9, yy, C.redDark);
    }
    s.set(x + 2, y + 3, C.goldDark);
    s.set(x + 7, y + 5, C.goldDark);
    s.set(x + 11, y + 2, C.goldDark);
  };
  bale(0, 22);
  bale(15, 22);
  bale(7, 14);
  bale(0, 6);
  bale(15, 14);
  return s;
}

function strawPile(): Sprite {
  const s = new Sprite(30, 20);
  s.shape(union(ellipse(15, 16, 14.5, 9), ellipse(11, 12, 8, 7)), T.straw);
  for (const [x, y] of [[6, 14], [10, 10], [14, 13], [19, 12], [22, 15], [12, 16], [17, 17], [8, 17]]) {
    s.set(x, y, C.goldDark);
    s.set(x + 1, y - 1, C.goldDark);
  }
  return s;
}

function dump(): Sprite {
  const s = new Sprite(28, 20);
  s.shape(union(rect(2, 6, 25, 19)), T.green);
  s.shape(rect(0, 3, 27, 6), T.green);
  for (let x = 6; x <= 21; x += 5) for (let y = 9; y <= 17; y++) s.set(x, y, C.greenDark);
  s.shape(rect(11, 0, 16, 3), T.steel);
  return s;
}

function valve(open: boolean): Sprite {
  const s = new Sprite(12, 22);
  s.shape(rect(4, 0, 7, 21), T.steel);
  s.shape(union(ellipse(5.5, 10, 5, 5)), T.red);
  s.fill(ellipse(5.5, 10, 2.6, 2.6), C.redDark);
  s.fill(rect(5, 6, 6, 14), C.red);
  s.fill(rect(2, 9, 9, 10), C.red);
  s.set(5, 10, C.k);
  if (open) for (let y = 18; y < 22; y++) s.set(5, y, C.blueLight);
  return s;
}

function panel(on: boolean): Sprite {
  const s = new Sprite(12, 20);
  s.shape(rect(5, 8, 7, 19), T.steel);
  s.shape(rect(0, 0, 11, 9), T.metal);
  const bolt = grid(['..ky', '.ky.', 'kyyk', '.yk.', 'yk..'], { k: C.k, y: C.gold });
  s.draw(bolt, 3, 2);
  s.fill(ellipse(9, 2, 1.2, 1.2), on ? C.greenLight : C.red);
  return s;
}

function trough(): Sprite {
  const s = new Sprite(30, 14);
  s.shape(union(rect(0, 3, 29, 12), rect(1, 12, 28, 13)), T.metal);
  s.fill(rect(2, 4, 27, 9), '#2c3c4c');
  return s;
}

function feeder(level: 0 | 1 | 2): Sprite {
  const s = new Sprite(30, 20);
  if (level > 0) {
    s.shape(level === 2 ? ellipse(15, 8, 13, 7) : ellipse(15, 11, 12, 3.5), T.straw);
    if (level === 2) for (const [x, y] of [[8, 6], [13, 4], [19, 6], [22, 9], [11, 9]]) s.set(x, y, C.goldDark);
  }
  for (const x of [3, 9, 15, 21, 27]) s.shape(rect(x - 1, 1, x, 12), T.wood);
  s.shape(rect(0, 0, 29, 2), T.wood);
  s.shape(rect(0, 11, 29, 19), T.wood);
  return s;
}

function mat(): Sprite {
  const s = new Sprite(18, 10);
  s.shape(ellipse(9, 5, 8.6, 4.4), { L: '#4c4440', M: '#383230', D: '#282220' });
  return s;
}

function sacks(): Sprite {
  const s = new Sprite(32, 16);
  const sack = (x: number) => {
    s.shape(union(ellipse(x + 5, 10, 5, 5.5), rect(x + 3, 2, x + 7, 6)), T.cream);
    s.fill(rect(x + 3, 4, x + 7, 4), C.orange);
  };
  sack(0);
  sack(10);
  sack(20);
  return s;
}

function barrow(): Sprite {
  const s = new Sprite(26, 16);
  s.shape(line([[18, 6], [25, 3]], 0.8), T.wood);
  s.shape(union(rect(2, 3, 18, 9), rect(4, 9, 16, 11)), T.green);
  s.shape(ellipse(10, 3, 7, 2.2), T.straw);
  s.shape(ellipse(7, 13, 2.8, 2.8), T.black);
  s.set(7, 13, C.grey);
  s.fill(rect(15, 11, 15, 15), C.k);
  return s;
}

function ladder(): Sprite {
  const s = new Sprite(12, 30);
  s.shape(rect(1, 0, 2, 29), T.wood);
  s.shape(rect(9, 0, 10, 29), T.wood);
  for (let y = 3; y < 29; y += 5) s.shape(rect(2, y, 9, y + 1), T.wood);
  return s;
}

function bale(): Sprite {
  const s = new Sprite(16, 10);
  s.shape(rect(0, 1, 15, 9), T.straw);
  for (let y = 2; y < 9; y++) {
    s.set(4, y, C.redDark);
    s.set(11, y, C.redDark);
  }
  s.set(7, 4, C.goldDark);
  return s;
}

function cloud(): Sprite {
  const s = new Sprite(32, 14);
  s.shape(union(ellipse(8, 9, 6, 4.5), ellipse(15, 6, 7, 5.5), ellipse(23, 8, 6.5, 5), rect(4, 9, 28, 12)), T.cloud);
  return s;
}

function bush(): Sprite {
  const s = new Sprite(28, 12);
  s.shape(union(ellipse(7, 8, 6.5, 5), ellipse(14, 6, 7, 6), ellipse(21, 8, 6.5, 5), rect(2, 8, 26, 11)), T.green);
  for (const [x, y] of [[10, 4], [16, 3], [21, 5]]) s.set(x, y, C.greenLight);
  return s;
}

function lantern(): Sprite {
  const s = new Sprite(10, 30);
  s.shape(rect(4, 8, 5, 29), T.steel);
  s.shape(rect(1, 1, 8, 8), T.black);
  s.fill(rect(2, 3, 7, 6), C.goldLight);
  s.fill(rect(3, 4, 4, 5), C.white);
  s.shape(rect(3, 0, 6, 1), T.black);
  return s;
}

function bulb(color: string): Sprite {
  return grid(['.k.', 'kck', 'kck', '.k.'], { k: C.k, c: color });
}

export function stationSprites(): Record<string, Sprite> {
  return {
    'st-rack': rack(),
    'st-sawdust': sawdustBin(),
    'st-bags': bagsPile(),
    'st-wash': wash(),
    'st-kitchen': kitchen(false),
    'st-kitchen-cooking': kitchen(true),
    'st-hay': hayStack(),
    'st-straw': strawPile(),
    'st-dump': dump(),
    'st-valve': valve(false),
    'st-valve-open': valve(true),
    'st-panel-on': panel(true),
    'st-panel-off': panel(false),
    'st-trough': trough(),
    'st-feeder-0': feeder(0),
    'st-feeder-1': feeder(1),
    'st-feeder-2': feeder(2),
    'st-mat': mat(),
    'deco-sacks': sacks(),
    'deco-barrow': barrow(),
    'deco-ladder': ladder(),
    'deco-bale': bale(),
    'deco-cloud': cloud(),
    'deco-bush': bush(),
    'deco-lantern': lantern(),
    'deco-bulb-r': bulb(C.red),
    'deco-bulb-y': bulb(C.gold),
    'deco-bulb-b': bulb(C.blueLight),
    'deco-bulb-g': bulb(C.greenLight),
  };
}
