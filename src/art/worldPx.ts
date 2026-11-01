import { MAP } from '../data/map';
import { C } from './palette';
import { Sprite, rng } from './pixel';

// Пол, фон и ночной свет. Всё в пикселях рисунка: клетка = 16×16.

export const CELL = 16;

function noise(s: Sprite, seed: number, base: string, specks: [string, number][]): Sprite {
  const r = rng(seed);
  s.fill(() => true, base);
  for (const [c, n] of specks) for (let i = 0; i < n; i++) s.set(r() * s.w, r() * s.h, c);
  return s;
}

function strokes(s: Sprite, seed: number, colors: string[], n: number, mask?: (x: number, y: number) => boolean): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * s.w);
    const y = Math.floor(r() * s.h);
    const c = colors[Math.floor(r() * colors.length)];
    const dir = r() < 0.5 ? 1 : -1;
    for (let k = 0; k < 3; k++) {
      const px = (x + k * dir + s.w) % s.w;
      const py = (y + (k >> 1) + s.h) % s.h;
      if (!mask || mask(px, py)) s.set(px, py, c);
    }
  }
}

export function floorTiles(): Record<string, Sprite> {
  const out: Record<string, Sprite> = {};
  for (let v = 0; v < 4; v++) {
    const s = noise(new Sprite(CELL, CELL), 10 + v, '#f8d878', [[C.goldLight, 10]]);
    strokes(s, 20 + v, [C.gold, C.gold, C.goldDark], 16);
    out[`floor-straw-${v}`] = s;
  }
  for (let v = 0; v < 2; v++) {
    const s = noise(new Sprite(CELL, CELL), 10 + v, '#f8d878', [[C.goldLight, 8]]);
    strokes(s, 20 + v, [C.gold, C.goldDark], 14);
    // Мокрое пятно: в середине темно, к краям шахматкой переходит в солому
    const r = rng(40 + v);
    for (let y = 0; y < CELL; y++)
      for (let x = 0; x < CELL; x++) {
        const d = Math.hypot(x - 7.5, (y - 7.5) * 1.15);
        const checker = (x + y) % 2 === 0;
        if (d < 5.2 || (d < 7 && checker)) s.set(x, y, r() < 0.2 ? '#7c5c00' : C.goldDark);
      }
    for (const [x, y] of [[5, 6], [6, 6], [9, 9], [10, 8], [7, 10]]) s.set(x, y, C.blueLight);
    s.set(6, 5, C.white);
    out[`floor-wet-${v}`] = s;
  }
  const bareWet = noise(new Sprite(CELL, CELL), 51, C.greyMid, [[C.greyDark, 14], [C.grey, 6]]);
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const d = Math.hypot(x - 7.5, (y - 7.5) * 1.2);
      if (d < 5 || (d < 6.5 && (x + y) % 2 === 0)) bareWet.set(x, y, C.blueDark);
    }
  for (const [x, y] of [[5, 6], [6, 5], [9, 9]]) bareWet.set(x, y, C.blueLight);
  out['floor-bareWet'] = bareWet;
  out['floor-sawdust'] = noise(new Sprite(CELL, CELL), 61, C.goldLight, [['#e4b878', 30], [C.gold, 8], [C.white, 6]]);
  out['floor-sawdustDone'] = noise(new Sprite(CELL, CELL), 62, '#c49a5c', [[C.goldDark, 30], ['#8c5418', 12], [C.goldLight, 4]]);
  // Затоптанный навоз: бурые разводы по соломе и следы подошв
  const dung = noise(new Sprite(CELL, CELL), 81, '#f8d878', [[C.goldLight, 8]]);
  strokes(dung, 83, [C.gold, C.goldDark], 14);
  const rd = rng(82);
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const d = Math.hypot(x - 8 + Math.sin(y * 0.9) * 1.5, (y - 8) * 0.9);
      if (d < 4.5 || (d < 6.5 && (x + y) % 2 === 0)) dung.set(x, y, rd() < 0.25 ? '#5c3000' : '#8c5418');
    }
  for (const [x, y] of [[2, 2], [3, 2], [2, 3], [12, 12], [13, 12], [13, 13], [11, 3], [12, 4]]) dung.set(x, y, '#5c3000');
  for (const [x, y] of [[6, 7], [9, 9]]) dung.set(x, y, '#c88c4c');
  out['floor-dung'] = dung;
  const bare = noise(new Sprite(CELL, CELL), 71, C.grey, [[C.greyMid, 16], [C.white, 4]]);
  for (const [x, y] of [[3, 9], [4, 9], [5, 10], [6, 10], [7, 11]]) bare.set(x, y, C.greyDark);
  out['floor-bare'] = bare;
  return out;
}

const W = MAP.w * CELL;
const H = MAP.h * CELL;
const px = (v: number) => Math.round(v * CELL);
const FENCE_Y = px(MAP.fenceY);
const TENT_X = px(MAP.bedding.x + MAP.bedding.cols);
const ROOM_Y0 = px(MAP.rooms.duty.y0);
const ROAD_Y = px(MAP.road.y0);
const PAD_X = px(MAP.asphalt.x0);
const PAD_Y = px(MAP.asphalt.y0);

// Кирпич в духе NES: оранжевый, чёрные швы вразбежку, светлая кромка сверху
function brick(s: Sprite, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const row = Math.floor((y - y0) / 3);
      const seam = (y - y0) % 3 === 2 || (x + (row % 2) * 4) % 8 === 0;
      s.set(x, y, y === y0 ? C.orangeLight : seam ? C.k : C.orange);
    }
  for (let x = x0; x <= x1; x++) s.set(x, y1 + 1, C.k);
}

// Дощатый настил: оранжевые доски с чёрными швами и гвоздями
function boards(s: Sprite, r: () => number, inside: (x: number, y: number) => boolean, y0: number, y1: number): void {
  for (let y = y0; y < y1; y += 8) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      s.set(x, y, C.orangeLight);
      for (let k = 1; k < 7; k++) if (inside(x, y + k)) s.set(x, y + k, C.orange);
      if (inside(x, y + 7)) s.set(x, y + 7, C.redDark);
    }
    let x = Math.floor(r() * 30);
    while (x < W) {
      if (inside(x, y)) {
        for (let k = 0; k < 8; k++) if (inside(x, y + k)) s.set(x, y + k, C.k);
        s.set(x + 2, y + 3, C.redDark);
      }
      x += 26 + Math.floor(r() * 30);
    }
  }
}

// Асфальт: тёмно-серый с крошкой
function asphalt(s: Sprite, r: () => number, inside: (x: number, y: number) => boolean): void {
  s.fill(inside, '#3c3c40');
  for (let i = 0; i < 900; i++) {
    const x = Math.floor(r() * W);
    const y = Math.floor(r() * H);
    if (inside(x, y)) s.set(x, y, r() < 0.6 ? C.greyDark : C.greyMid);
  }
}

// Неподвижный фон: небо, шатёр над подстилкой, трава выгула, дорожка, постройки, навес, асфальт и проезд
export function background(cloud: Sprite): Sprite {
  const s = new Sprite(W, H);
  const r = rng(99);

  // Вольер: под подстилкой — солома (её закроют клетки), справа трава до решётки и за ней
  s.fill((x, y) => y >= CELL && y < FENCE_Y && x < TENT_X, '#f8d878');
  const grass = (x: number, y: number) => y >= CELL && y < FENCE_Y && x >= TENT_X;
  s.fill(grass, C.green);
  for (let i = 0; i < 520; i++) {
    const x = TENT_X + Math.floor(r() * (W - TENT_X));
    const y = CELL + 2 + Math.floor(r() * (FENCE_Y - CELL - 4));
    s.set(x, y, C.greenLight);
    s.set(x + 1, y - 1, C.greenLight);
    s.set(x + 2, y, C.greenLight);
  }
  for (let i = 0; i < 260; i++) s.set(TENT_X + r() * (W - TENT_X), CELL + r() * (FENCE_Y - CELL), C.greenDark);
  // Тропинки, натоптанные слонихами вдоль решётки
  s.fill((x, y) => grass(x, y) && y >= FENCE_Y - 10 && (x + y) % 3 === 0, '#c88c4c');

  // Дорожка вдоль решётки — доски; справа от неё начинается асфальт
  boards(s, r, (x, y) => y >= FENCE_Y && y < ROOM_Y0 && x < PAD_X, FENCE_Y, ROOM_Y0);

  // Постройки: дежурка — доски, мойка — плитка, кормовая — линолеум, навес — бетонные плиты
  const room = (k: keyof typeof MAP.rooms) => {
    const m = MAP.rooms[k];
    return (x: number, y: number) => x >= px(m.x0) && x < px(m.x1) && y >= px(m.y0) && y < px(m.y1);
  };
  boards(s, r, room('duty'), ROOM_Y0, ROAD_Y);
  const wash = room('wash');
  s.fill(wash, C.white);
  s.fill((x, y) => wash(x, y) && (x % 8 === 0 || y % 8 === 0), C.grey);
  s.fill((x, y) => wash(x, y) && x % 8 === 7 && y % 8 === 7, C.skyLight);
  for (const id of ['drain', 'drain2'] as const) {
    const d = MAP.stations[id];
    s.fill((x, y) => wash(x, y) && Math.hypot((x - d.x * CELL) / 14, (y - d.y * CELL) / 8) < 1 && (x + y) % 2 === 0, C.skyLight);
  }
  const kitchen = room('kitchen');
  s.fill(kitchen, C.grey);
  s.fill((x, y) => kitchen(x, y) && (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0, C.greyMid);
  const shed = room('shed');
  s.fill(shed, '#a4a4a8');
  s.fill((x, y) => shed(x, y) && (x % 16 === 0 || y % 16 === 0), C.greyMid);
  // Тень от крыши навеса: шахматка под передним краем
  s.fill((x, y) => shed(x, y) && y < ROOM_Y0 + 10 && (x + y) % 2 === 0, '#6c6c70');

  // Асфальт: площадка с контейнером и хозяйственный проезд вдоль задних стен
  asphalt(s, r, (x, y) => (x >= PAD_X && y >= PAD_Y) || y >= ROAD_Y);
  // Разметка: прерывистая осевая на проезде и жёлтая рамка места контейнера
  const midY = Math.round((ROAD_Y + H) / 2);
  for (let x = 4; x < W; x += 16) for (let k = 0; k < 8; k++) s.set(x + k, midY, C.white);
  const c = MAP.stations.dump;
  const [cx0, cy0, cx1, cy1] = [px(c.x - c.w / 2) - 3, px(c.y - c.h / 2) - 3, px(c.x + c.w / 2) + 2, px(c.y + c.h / 2) + 2];
  for (let x = cx0; x <= cx1; x++) if (x % 4 < 2) {
    s.set(x, cy0, C.gold);
    s.set(x, cy1, C.gold);
  }
  for (let y = cy0; y <= cy1; y++) if (y % 4 < 2) {
    s.set(cx0, y, C.gold);
    s.set(cx1, y, C.gold);
  }

  // Стены построек — кирпич; левая кромка дежурки — тоже
  brick(s, 0, ROOM_Y0 - 3, 2, ROAD_Y);
  for (const w of MAP.walls) {
    if (w.y0 === w.y1) brick(s, px(w.x0) - 2, px(w.y0) - 3, px(w.x1) + 1, px(w.y0) + 1);
    else brick(s, px(w.x0) - 2, px(w.y0) - 3, px(w.x0) + 2, px(w.y1));
  }

  // Левая стенка шатра: полосы
  const wall = (x: number, y: number) => x < CELL && y >= CELL && y < FENCE_Y;
  s.fill(wall, C.white);
  s.fill((x, y) => wall(x, y) && Math.floor(x / 4) % 2 === 0, C.red);
  s.fill((x, y) => x === CELL - 1 && y >= CELL && y < FENCE_Y, C.k);
  s.fill((x, y) => x >= CELL - 4 && x < CELL - 1 && y >= CELL && y < FENCE_Y && (x + y) % 2 === 0, C.redDark);

  // Небо и облака сверху
  s.fill((_x, y) => y < CELL, C.sky);
  for (const cx of [20, 120, 230, 300]) s.draw(cloud, cx, -6);
  // Кромка шатра над подстилкой: красно-белые фестоны
  for (let x = 0; x < TENT_X; x++) {
    const stripe = Math.floor(x / 8) % 2 === 0;
    const col = stripe ? C.red : C.white;
    const shade = stripe ? C.redDark : C.grey;
    const lx = x % 8;
    const bottom = 12 + Math.round(Math.sin((lx / 8) * Math.PI) * 3);
    for (let y = 7; y <= bottom; y++) s.set(x, y, y >= bottom - 1 ? shade : col);
    s.set(x, bottom + 1, C.k);
    s.set(x, 6, C.k);
  }
  for (let x = 0; x < TENT_X; x++) s.set(x, 5, C.orange);
  // Над выгулом — верхняя решётка: прутья на фоне неба
  for (let x = TENT_X; x < W; x++) {
    s.set(x, CELL - 6, C.k);
    s.set(x, CELL - 1, C.k);
    if (x % 3 === 0) for (let y = CELL - 6; y < CELL; y++) s.set(x, y, C.greyDark);
  }
  return s;
}

// Свет: фонари на столбах — только снаружи решётки, на её линии; в постройках — потолочные лампы без столбов
export const LAMPS: { x: number; y: number; post: boolean }[] = [
  { x: 4, y: 0.9, post: false },
  { x: 9.5, y: 0.9, post: false },
  ...[1.2, 4.6, 9.6, 13.4, 16.9, 20.4].map((x) => ({ x, y: 9.3, post: true })),
  { x: 2.2, y: 13.4, post: false },
  { x: 7.1, y: 13.4, post: false },
  { x: 12.4, y: 13.4, post: false },
  { x: 16.8, y: 13.4, post: false },
];

// Ночь: тёмно-синий с ступенчатыми кругами света, на краях — шахматка, как в старых играх
export function nightOverlay(): HTMLCanvasElement {
  return rings('#000028', [0, 0.45, 0.8, 0.9]);
}

export function lampGlow(): HTMLCanvasElement {
  return rings(C.goldLight, [0.18, 0.08, 0, 0]);
}

function rings(color: string, levels: number[]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const n = parseInt(color.slice(1), 16);
  const R = [22, 34, 48];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let d = Infinity;
      for (const l of LAMPS) d = Math.min(d, Math.hypot(x - l.x * CELL, (y - l.y * CELL) * 1.2));
      const checker = (x + y) % 2 === 0;
      let a: number;
      if (d < R[0]) a = levels[0];
      else if (d < R[1]) a = checker ? levels[0] : levels[1];
      else if (d < R[2]) a = checker ? levels[1] : levels[2];
      else a = levels[3];
      const i = (y * W + x) * 4;
      img.data[i] = (n >> 16) & 255;
      img.data[i + 1] = (n >> 8) & 255;
      img.data[i + 2] = n & 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  g.putImageData(img, 0, 0);
  return c;
}
