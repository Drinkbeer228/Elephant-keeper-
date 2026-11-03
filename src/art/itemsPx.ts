import { C, T } from './palette';
import { Sprite, ellipse, grid, rect, union } from './pixel';

// Предметы 16×16 и эффекты. Предмет стоит на нижней части кадра.

function bucket(content: 'empty' | 'full' | 'dirty'): Sprite {
  const s = new Sprite(16, 16);
  s.shape(union(rect(3, 5, 12, 13), rect(4, 13, 11, 14)), T.blue);
  s.shape(ellipse(7.5, 5, 5.8, 2.2), T.blue);
  s.fill(ellipse(7.5, 5.2, 4.2, 1.1), content === 'full' ? C.gold : '#002878');
  if (content === 'full') s.set(6, 5, C.goldLight);
  // Ручки и обручи
  s.set(2, 7, C.k);
  s.set(13, 7, C.k);
  for (let x = 4; x <= 11; x++) s.set(x, 9, C.blueDark);
  if (content !== 'empty') for (const [x, y] of [[5, 10], [5, 11], [9, 8], [10, 11], [10, 12]]) s.set(x, y, C.goldDark);
  return s;
}

// Стопка пустых тазов, вложенных друг в друга: видно каждый обод
function basinStack(n: number): Sprite {
  const s = new Sprite(16, 16 + (n - 1) * 2);
  for (let i = n - 1; i >= 0; i--) s.draw(basin('empty'), 0, i * 2);
  return s;
}

function basin(food: 'empty' | 'kasha' | 'veg' | 'dirty'): Sprite {
  const s = new Sprite(16, 16);
  s.shape(ellipse(8, 11.5, 7.5, 3.6), T.black);
  s.shape(ellipse(8, 9, 7.5, 2.6), { L: '#7c7c84', M: '#4c4c54', D: '#2c2c30' });
  if (food === 'dirty') {
    // Остатки каши и грязь по стенкам
    for (const [x, y, c] of [
      [5, 9, '#8c5418'],
      [6, 9, '#c49a5c'],
      [9, 8, '#8c5418'],
      [10, 9, '#c49a5c'],
      [3, 11, '#5c3000'],
      [12, 12, '#5c3000'],
    ] as [number, number, string][])
      s.set(x, y, c);
  } else if (food === 'kasha') {
    s.fill(ellipse(8, 9, 5.6, 1.5), C.goldLight);
    for (const [x, y] of [[5, 9], [8, 8], [10, 9], [7, 10]]) s.set(x, y, '#c49a5c');
  } else if (food === 'veg') {
    s.fill(ellipse(8, 9, 5.6, 1.5), '#5c3000');
    for (const [x, y, c] of [
      [4, 9, '#f87858'],
      [5, 9, '#f87858'],
      [6, 8, '#f87858'],
      [8, 9, '#a80020'],
      [9, 9, '#a80020'],
      [9, 8, '#a80020'],
      [11, 9, '#e4c47c'],
      [12, 9, '#e4c47c'],
      [7, 8, C.greenLight],
      [11, 8, C.greenLight],
    ] as [number, number, string][])
      s.set(x, y, c);
  } else {
    // Чистый: тёмное дно и блик
    s.fill(ellipse(8, 9, 5.6, 1.5), '#2c2c30');
    s.set(5, 9, C.white);
    s.set(6, 9, C.grey);
  }
  return s;
}

// Корзина для овощей: плетёная; с грязными овощами — в земле, с чистыми — яркие
function basket(content: 'empty' | 'raw' | 'clean'): Sprite {
  const s = new Sprite(16, 16);
  if (content !== 'empty') {
    const dirt = content === 'raw';
    for (const [x, y, c] of [
      [4, 6, dirt ? '#8c5418' : '#fc7c18'],
      [5, 5, dirt ? '#8c5418' : '#fc7c18'],
      [7, 6, dirt ? '#5c3000' : '#c88c4c'],
      [8, 5, dirt ? '#5c3000' : '#e4c47c'],
      [10, 6, dirt ? '#5c0030' : '#a80060'],
      [11, 5, dirt ? '#5c0030' : '#d8487c'],
      [6, 4, C.green],
      [11, 4, C.greenLight],
    ] as [number, number, string][])
      s.set(x, y, c);
  }
  s.shape(union(rect(2, 7, 13, 13), rect(3, 13, 12, 14)), T.wood);
  for (let x = 3; x <= 12; x += 2) for (let y = 8; y <= 13; y += 2) s.set(x, y, C.redDark);
  return s;
}

function bag(full: boolean): Sprite {
  const s = new Sprite(16, 16);
  if (full) {
    s.shape(union(ellipse(8, 10, 6, 5.5), rect(6, 3, 9, 5)), T.black);
    s.set(6, 2, C.k);
    s.set(9, 2, C.k);
    s.set(5, 8, '#8c8c94');
    s.set(5, 9, '#8c8c94');
  } else {
    s.shape(union(rect(3, 6, 12, 14), ellipse(7.5, 14, 5, 1.5)), T.black);
    s.fill(ellipse(7.5, 6, 4.4, 1.2), '#000000');
    s.set(4, 9, '#8c8c94');
    s.set(4, 10, '#8c8c94');
  }
  return s;
}

function hay(): Sprite {
  const s = new Sprite(16, 16);
  s.shape(rect(1, 5, 14, 14), T.straw);
  for (let y = 6; y <= 13; y++) {
    s.set(4, y, C.redDark);
    s.set(11, y, C.redDark);
  }
  for (const [x, y] of [[2, 8], [7, 7], [8, 11], [13, 9], [6, 12], [9, 8]]) s.set(x, y, C.goldDark);
  return s;
}

function straw(): Sprite {
  const s = new Sprite(16, 16);
  s.shape(ellipse(8, 11, 7, 4), T.straw);
  for (const [x, y] of [[3, 10], [5, 9], [7, 12], [9, 10], [11, 11], [12, 9], [6, 11]]) s.set(x, y, C.goldDark);
  s.set(2, 7, C.gold);
  s.set(13, 8, C.gold);
  return s;
}

function tire(): Sprite {
  const s = new Sprite(20, 16);
  s.fill(ellipse(10, 8, 7.5, 7.5), '#080808');
  s.fill(ellipse(10, 8, 5.2, 5.2), '#3c3c40');
  s.fill(ellipse(10, 8, 3.2, 3.2), '#080808');
  for (const [x, y] of [[4, 4], [10, 2], [16, 4], [4, 12], [10, 14], [16, 12]]) {
    s.set(x, y, '#7c7c84');
    s.set(x + 1, y, '#2c2c30');
  }
  s.set(5, 4, '#bcbcbc');
  s.set(14, 5, '#bcbcbc');
  return s;
}

// Ведро для опилок: красное; полное — горка опилок, пустое — тёмное дно
function sawdust(full = true): Sprite {
  const s = new Sprite(16, 16);
  s.shape(union(rect(3, 7, 12, 14)), T.red);
  if (full) {
    s.shape(ellipse(7.5, 6.5, 5.5, 3), T.cream);
    for (const [x, y] of [[5, 6], [8, 5], [10, 6]]) s.set(x, y, '#e4b878');
  } else {
    s.shape(ellipse(7.5, 7.5, 5, 1.6), T.red);
    s.fill(ellipse(7.5, 7.5, 3.6, 0.8), '#2c1810');
  }
  for (let x = 4; x <= 11; x++) s.set(x, 10, C.redDark);
  return s;
}

const TOOL_PAL = { k: C.k, w: C.orangeLight, W: C.orange, m: C.white, M: C.grey, D: C.greyMid, y: C.gold, Y: C.goldDark };

// Совок со скребком по образцу: оцинкованный ковш — высокая задняя стенка, скос к открытому переднему краю,
// сверху тёмная железная скоба-ручка на заклёпках. Полный — навоз горкой виден над бортом
const SCOOP_PAL = { k: C.k, m: C.white, M: C.grey, D: C.greyMid, h: '#3c3c40', b: '#8c5418', B: '#5c3000' };

function scoop(full = false): Sprite {
  return grid(
    [
      '......kkkkkkkk..',
      '......khhhhhhk..',
      '......khkkkkhk..',
      full ? '......khkbbkhk..' : '......khk..khk..',
      full ? '......khkbBkhk..' : '......khk..khk..',
      '.....kkhkkkkhkk.',
      full ? '...bkmmhmmmmhmk.' : '....kmmhmmmmhmk.',
      full ? '.bbkmMMhMMMMhMk.' : '...kmMMhMMMMhMk.',
      full ? '.BkmMMMkMMMMkMk.' : '..kmMMMkMMMMkMk.',
      '.kmMMMMMMMMMMMk.',
      'kmMMMMMMMMMMMDk.',
      'kMMMMMMMMMMMMDk.',
      'kMMMMMMMMMMMDDk.',
      'kDDDDDDDDDDDDDk.',
      'kkkkkkkkkkkkkkk.',
      '................',
    ],
    SCOOP_PAL,
  );
}

function fork(): Sprite {
  return grid(
    [
      '..........k.k.k.',
      '..........M.M.M.',
      '..........M.M.M.',
      '..........MkMkM.',
      '..........kMMMk.',
      '...........kWk..',
      '..........kwk...',
      '.........kwk....',
      '........kwk.....',
      '.......kwk......',
      '......kwk.......',
      '.....kwk........',
      '....kwk.........',
      '...kwk..........',
      '...kk...........',
      '................',
    ],
    TOOL_PAL,
  );
}

function broom(): Sprite {
  return grid(
    [
      '..........kkkk..',
      '.........kyyyyk.',
      '........kyyYyYk.',
      '........kyYyYyk.',
      '.......kyyYyYk..',
      '.......kkkkkk...',
      '......kwk.......',
      '.....kwk........',
      '....kwk.........',
      '...kwk..........',
      '..kwk...........',
      '..kk............',
      '................',
      '................',
      '................',
      '................',
    ],
    TOOL_PAL,
  );
}

// Совковая лопата: деревянный черенок и стальной совок — набирает опилки из ларя
function shovel(): Sprite {
  return grid(
    [
      '.........kkk....',
      '.........kwk....',
      '........kwk.....',
      '........kwk.....',
      '.......kwk......',
      '.......kwk......',
      '......kwk.......',
      '.....kMMk.......',
      '....kMMMMk......',
      '....kMMMMk......',
      '...kMMMMMk......',
      '...kMMMMMk......',
      '..kMMMMMMk......',
      '..kMMMMMDk......',
      '..kkkkkkkk......',
      '................',
    ],
    TOOL_PAL,
  );
}

// Длинный сачок: обруч на черенке, сетка провисает
function net(): Sprite {
  return grid(
    [
      '....kkkk........',
      '...kyyyyk.......',
      '..kk....kk......',
      '..k......k......',
      '..k......k......',
      '..k......k......',
      '...k....k.......',
      '...k....k.......',
      '....kkkk........',
      '.....kwk........',
      '.....kwk........',
      '....kwk.........',
      '....kwk.........',
      '...kwk..........',
      '...kk...........',
      '................',
    ],
    { k: C.k, w: C.orangeLight, y: C.grey },
  );
}

function dung(): Sprite {
  const s = new Sprite(12, 10);
  s.shape(ellipse(3.5, 6.5, 3.5, 3), T.dung);
  s.shape(ellipse(8.5, 6.8, 3.5, 3), T.dung);
  s.shape(ellipse(6, 3.6, 3, 2.8), T.dung);
  s.set(5, 2, '#e4b878');
  return s;
}

function bubble(): Sprite {
  return grid(
    [
      '.kkkkkkkkk.',
      'kyyyyyyyyyk',
      'kyyyykyyyyk',
      'kyyyykyyyyk',
      'kyyyykyyyyk',
      'kyyyykyyyyk',
      'kyyyyyyyyyk',
      'kyyyykyyyyk',
      'kyyyyyyyyyk',
      '.kkkyyykkk.',
      '....kyk....',
      '.....k.....',
    ],
    { k: C.k, y: C.gold },
  );
}

function heart(): Sprite {
  return grid(['.kk.kk.', 'krrkrrk', 'krwrrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'], { k: C.k, r: C.red, w: C.white });
}

function zzz(): Sprite {
  return grid(['kkkkkk', 'kwwwwk', 'kkkwk.', '.kwkk.', 'kwwwwk', 'kkkkkk'], { k: C.k, w: C.white });
}

function dot(c: string, n = 2): Sprite {
  return new Sprite(n, n).fill(() => true, c);
}

export function itemSprites(): Record<string, Sprite> {
  return {
    'item-bucket': bucket('empty'),
    'item-bucket-full': bucket('full'),
    'item-bucket-dirty': bucket('dirty'),
    'item-basin': basin('empty'),
    'item-basin-kasha': basin('kasha'),
    'item-basin-veg': basin('veg'),
    'item-basin-dirty': basin('dirty'),
    'item-basin-stack-2': basinStack(2),
    'item-basin-stack-3': basinStack(3),
    'item-basin-stack-4': basinStack(4),
    'item-bag': bag(false),
    'item-bag-full': bag(true),
    'item-hay': hay(),
    tire: tire(),
    'item-straw': straw(),
    'item-basket': basket('empty'),
    'item-basket-raw': basket('raw'),
    'item-basket-clean': basket('clean'),
    'item-sawdust': sawdust(),
    'item-sawdust-empty': sawdust(false),
    'item-scoop': scoop(),
    'item-scoop-full': scoop(true),
    'item-fork': fork(),
    'item-broom': broom(),
    'item-shovel': shovel(),
    'item-net': net(),
    dung: dung(),
    'fx-bubble': bubble(),
    'fx-heart': heart(),
    'fx-z': zzz(),
    'fx-pee': dot(C.gold),
    'fx-water': dot(C.blueLight),
    'fx-dust': dot(C.goldLight),
    'fx-steam': dot(C.white, 3),
    'fx-arrow': grid(['kkkkkkk', 'kyyyyyk', 'kyyyyyk', '.kyyyk.', '..kyk..', '...k...'], { k: C.k, y: C.gold }),
    'shadow-el': new Sprite(34, 5).fill(ellipse(17, 2.5, 17, 2.5), C.k),
    'shadow-lying': new Sprite(44, 6).fill(ellipse(22, 3, 22, 3), C.k),
    'shadow-keeper': new Sprite(12, 4).fill(ellipse(6, 2, 6, 2), C.k),
    'fx-star': grid(['..k..', '.kyk.', 'kyyyk', '.kyk.', '..k..'], { k: C.k, y: C.goldLight }),
  };
}
