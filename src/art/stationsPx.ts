import { C, T } from './palette';
import { Sprite, ellipse, grid, line, rect, union } from './pixel';

// Станции и обстановка в пиксель-арте. Картинка стоит на нижней строке кадра.

// Стойка вдоль левой стены: доска с крючками, вид сбоку, крючки смотрят в коридор
function rack(): Sprite {
  const s = new Sprite(12, 56);
  s.shape(rect(1, 0, 5, 55), T.wood);
  s.shape(rect(0, 0, 7, 2), T.wood);
  for (const y of [12, 28, 44]) {
    s.set(6, y, C.grey);
    s.set(7, y, C.grey);
    s.set(8, y, C.grey);
    s.set(8, y - 1, C.grey);
  }
  for (const y of [6, 20, 36, 50]) s.set(3, y, C.k);
  return s;
}

function grain(): Sprite {
  const s = new Sprite(26, 18);
  const sack = (x: number, y: number) => {
    s.shape(union(ellipse(x + 5, y + 8, 5, 5.5), rect(x + 3, y, x + 7, y + 4)), T.cream);
    s.fill(rect(x + 3, y + 2, x + 7, y + 2), C.orange);
    s.set(x + 4, y + 9, C.goldDark);
    s.set(x + 6, y + 10, C.goldDark);
  };
  sack(0, 4);
  sack(14, 4);
  sack(7, 0);
  return s;
}

// Куча опилок под навесом: светлая насыпь со стружкой
function sawdustBin(): Sprite {
  const s = new Sprite(26, 16);
  s.shape(union(ellipse(13, 12, 12.5, 6), ellipse(10, 9, 7, 5)), T.cream);
  for (const [x, y] of [[5, 11], [9, 8], [13, 12], [17, 10], [20, 13], [11, 14], [15, 7], [7, 13]]) {
    s.set(x, y, '#c49a5c');
    s.set(x + 1, y, '#e4b878');
  }
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

// Сено тюками вдоль задней стороны навеса: два ряда, зеленоватое — не спутать с соломой
function hayStack(): Sprite {
  const s = new Sprite(48, 20);
  const HAY = { L: '#d8e878', M: '#a8b840', D: '#6c7c20' };
  const bale = (x: number, y: number) => {
    s.shape(rect(x, y, x + 14, y + 8), HAY);
    for (let yy = y + 1; yy < y + 8; yy++) {
      s.set(x + 4, yy, C.redDark);
      s.set(x + 10, yy, C.redDark);
    }
    s.set(x + 2, y + 3, '#6c7c20');
    s.set(x + 7, y + 5, '#6c7c20');
  };
  for (const x of [1, 17, 33]) bale(x, 11);
  for (const x of [9, 25]) bale(x, 2);
  return s;
}

// Куча соломы: светло-золотая, рыхлая
function strawPile(): Sprite {
  const s = new Sprite(26, 16);
  s.shape(union(ellipse(13, 12, 12.5, 6), ellipse(14, 8, 7, 5)), T.straw);
  for (const [x, y] of [[6, 11], [10, 8], [14, 11], [18, 9], [20, 12], [12, 13], [16, 6], [8, 13]]) {
    s.set(x, y, C.goldDark);
    s.set(x + 1, y - 1, C.goldDark);
  }
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

// Выключатель дежурного света: коробка на стене, лампочка горит, когда включён
function lightSwitch(on: boolean): Sprite {
  const s = new Sprite(8, 10);
  s.shape(rect(0, 0, 7, 9), T.metal);
  s.fill(rect(3, 4, 4, 7), C.greyDark);
  s.set(3, on ? 4 : 7, C.k);
  s.fill(rect(2, 1, 5, 2), on ? C.gold : C.greyMid);
  return s;
}

// Сор с тачки: пучок соломы, клочок сена или горстка опилок — с контуром, чтобы читался на досках
function litter(kind: 'straw' | 'hay' | 'sawdust'): Sprite {
  const s = new Sprite(10, 7);
  const tone = kind === 'straw' ? T.straw : kind === 'hay' ? { L: '#d8e878', M: '#a8b840', D: '#6c7c20' } : T.cream;
  if (kind === 'sawdust') s.shape(union(ellipse(4, 4.2, 3.4, 2), ellipse(6.5, 4.6, 2.4, 1.6)), tone);
  else s.shape(union(line([[1.5, 4.5], [8, 2.5]], 0.8), line([[2, 2.5], [8.5, 5]], 0.8)), tone);
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

// Место таза: бетонная площадка у решётки
function pad(): Sprite {
  const s = new Sprite(20, 9);
  s.shape(rect(0, 0, 19, 8), { L: C.white, M: C.grey, D: C.greyMid });
  for (const [x, y] of [[4, 3], [11, 5], [15, 2], [7, 6]]) s.set(x, y, C.greyMid);
  return s;
}

function barrowBase(): Sprite {
  const s = new Sprite(28, 18);
  s.shape(line([[19, 9], [27, 5]], 0.9), T.wood);
  s.shape(line([[19, 12], [27, 9]], 0.9), T.wood);
  s.shape(union(rect(2, 5, 20, 11), rect(4, 11, 18, 13)), T.green);
  s.fill(rect(4, 6, 18, 7), C.greenDark);
  s.shape(ellipse(7.5, 14.5, 3, 3), T.black);
  s.set(7, 14, C.grey);
  s.fill(rect(16, 13, 16, 17), C.k);
  s.fill(rect(15, 17, 17, 17), C.k);
  return s;
}

function barrowWaste(level: 1 | 2 | 3): Sprite {
  const s = new Sprite(28, 18);
  const h = [0, 2, 3.5, 5][level];
  s.shape(ellipse(11, 6.5, 8.5, h), T.dung);
  for (const [x, y] of [[7, 5], [12, 4], [15, 6], [9, 6]]) if (y > 6.5 - h) s.set(x, y, C.goldDark);
  return s;
}

function barrowTools(): Sprite {
  const s = new Sprite(28, 18);
  s.shape(line([[5, 6], [2, 0.5]], 0.7), T.wood);
  s.shape(rect(0, 0, 3, 1), T.steel);
  s.shape(line([[10, 6], [10, 0]], 0.7), T.wood);
  for (const x of [8, 10, 12]) s.set(x, 0, C.grey);
  s.shape(line([[15, 6], [18, 1]], 0.7), T.wood);
  s.shape(rect(16, 0, 20, 2), T.straw);
  return s;
}

function barrowHeap(tone: 'sawdust' | 'straw'): Sprite {
  const s = new Sprite(28, 18);
  s.shape(ellipse(11, 6, 7, 2.6), tone === 'sawdust' ? T.cream : T.straw);
  if (tone === 'straw') for (const [x, y] of [[7, 5], [10, 4], [14, 5]]) s.set(x, y, C.goldDark);
  return s;
}

// Синий морской контейнер: рифлёные стенки, крыша светлее; двери на торце к зрителю — открыты (заезд) или закрыты
function container(open: boolean): Sprite {
  const s = new Sprite(46, 30);
  s.shape(rect(0, 0, 45, 6), T.blue);
  s.shape(rect(0, 6, 45, 29), T.blue);
  for (let x = 3; x < 44; x += 3) s.fill(rect(x, 8, x, 27), C.blueDark);
  s.fill(rect(1, 1, 44, 1), C.blueLight);
  // Двери на правой половине торца
  if (open) {
    s.fill(rect(24, 8, 43, 28), C.k);
    s.fill(rect(25, 9, 42, 28), '#14141c');
  } else {
    s.shape(rect(24, 8, 33, 28), { L: C.blueLight, M: C.blue, D: C.navy });
    s.shape(rect(34, 8, 43, 28), { L: C.blueLight, M: C.blue, D: C.navy });
    for (const x of [27, 30, 37, 40]) s.fill(rect(x, 9, x, 27), C.greyMid);
    s.fill(rect(31, 17, 32, 19), C.gold);
  }
  return s;
}

// Стеллаж тазов в кормовой: стальная рама вдоль стены, вид сбоку
// Овощной стеллаж: три ящика — морковь, картофель, свёкла; вид сбоку вдоль стены
function vegRack(): Sprite {
  const s = new Sprite(14, 30);
  s.shape(rect(0, 0, 2, 29), T.wood);
  s.shape(rect(11, 0, 13, 29), T.wood);
  const crate = (y: number, a: string, b: string) => {
    s.shape(rect(2, y, 11, y + 6), T.wood);
    for (const [x, c] of [[4, a], [6, b], [8, a], [9, b]] as [number, string][]) s.set(x, y + 1, c);
    s.set(5, y + 2, a);
    s.set(7, y + 2, b);
  };
  crate(1, '#fc9838', C.greenLight); // морковь
  crate(11, '#c88c4c', '#8c5418'); // картофель
  crate(21, '#a80060', '#5c0030'); // свёкла
  return s;
}

function basinRack(): Sprite {
  const s = new Sprite(12, 56);
  s.shape(rect(1, 0, 3, 55), T.steel);
  s.shape(rect(8, 0, 10, 55), T.steel);
  for (const y of [8, 21, 34, 47]) s.shape(rect(0, y, 11, y + 1), T.steel);
  return s;
}

// Столб навеса и край крыши
function shedPost(): Sprite {
  const s = new Sprite(6, 44);
  s.shape(rect(1, 0, 4, 43), T.wood);
  return s;
}

function ramp(): Sprite {
  const s = new Sprite(30, 30);
  s.shape(line([[1, 28], [27, 3]], 2.4), T.wood);
  for (let i = 0; i < 6; i++) s.set(4 + i * 4, 25 - i * 4, C.redDark);
  s.shape(rect(25, 3, 27, 29), T.wood);
  return s;
}

function truck(): Sprite {
  const s = new Sprite(76, 40);
  // Кузов-контейнеровоз
  s.shape(rect(2, 8, 50, 30), T.green);
  for (let x = 9; x < 50; x += 8) s.fill(rect(x, 11, x, 27), C.greenDark);
  s.shape(rect(0, 30, 74, 33), T.steel);
  // Кабина
  s.shape(union(rect(52, 10, 72, 30), rect(56, 6, 70, 10)), T.red);
  s.fill(rect(58, 12, 68, 18), C.skyLight);
  s.fill(rect(59, 13, 62, 14), C.white);
  s.fill(rect(73, 24, 74, 28), C.gold);
  // Колёса
  for (const x of [12, 36, 62]) {
    s.shape(ellipse(x, 34, 4.6, 4.6), T.black);
    s.fill(ellipse(x, 34, 1.6, 1.6), C.grey);
  }
  return s;
}

function drain(): Sprite {
  const s = new Sprite(16, 9);
  s.shape(rect(0, 0, 15, 8), T.steel);
  for (let x = 2; x <= 13; x += 3) s.fill(rect(x, 2, x + 1, 6), C.k);
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
    'st-grain': grain(),
    'st-sawdust': sawdustBin(),
    'st-bags': bagsPile(),
    'st-wash': wash(),
    'st-kitchen': kitchen(false),
    'st-kitchen-cooking': kitchen(true),
    'st-hay': hayStack(),
    'st-straw': strawPile(),
    'st-valve': valve(false),
    'st-valve-open': valve(true),
    'st-trough': trough(),
    'litter-straw': litter('straw'),
    'litter-hay': litter('hay'),
    'litter-sawdust': litter('sawdust'),
    'st-switch-on': lightSwitch(true),
    'st-switch-off': lightSwitch(false),
    'st-feeder-0': feeder(0),
    'st-feeder-1': feeder(1),
    'st-feeder-2': feeder(2),
    'st-pad': pad(),
    'barrow-base': barrowBase(),
    'barrow-waste-1': barrowWaste(1),
    'barrow-waste-2': barrowWaste(2),
    'barrow-waste-3': barrowWaste(3),
    'barrow-tools': barrowTools(),
    'barrow-sawdust': barrowHeap('sawdust'),
    'barrow-straw': barrowHeap('straw'),
    'st-container-open': container(true),
    'st-container-closed': container(false),
    'st-basin-rack': basinRack(),
    'st-vegRack': vegRack(),
    'st-shed-post': shedPost(),
    'st-ramp': ramp(),
    'st-drain': drain(),
    truck: truck(),
    'deco-bale': bale(),
    'deco-cloud': cloud(),
    'deco-lantern': lantern(),
    'deco-bulb-r': bulb(C.red),
    'deco-bulb-y': bulb(C.gold),
    'deco-bulb-b': bulb(C.blueLight),
    'deco-bulb-g': bulb(C.greenLight),
  };
}
