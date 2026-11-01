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
  const bare = noise(new Sprite(CELL, CELL), 71, C.grey, [[C.greyMid, 16], [C.white, 4]]);
  for (const [x, y] of [[3, 9], [4, 9], [5, 10], [6, 10], [7, 11]]) bare.set(x, y, C.greyDark);
  out['floor-bare'] = bare;
  return out;
}

const W = MAP.w * CELL;
const H = MAP.h * CELL;
const DECK_Y = Math.round((MAP.fenceY + 0.35) * CELL);
const YARD_X = MAP.fenceX * CELL;

// Неподвижный фон: небо, шатёр, двор с травой, дощатый настил
export function background(cloud: Sprite, bush: Sprite): Sprite {
  const s = new Sprite(W, H);
  const r = rng(99);

  // Под подстилкой — солома (её всё равно закроют клетки)
  s.fill((_x, y) => y >= CELL && y < DECK_Y, '#f8d878');

  // Двор справа: трава с кустиками
  s.fill((x, y) => x >= YARD_X && y >= CELL && y < DECK_Y, C.green);
  for (let i = 0; i < 260; i++) {
    const x = YARD_X + Math.floor(r() * (W - YARD_X));
    const y = CELL + Math.floor(r() * (DECK_Y - CELL));
    s.set(x, y, C.greenLight);
    s.set(x + 1, y - 1, C.greenLight);
    s.set(x + 2, y, C.greenLight);
  }
  for (let i = 0; i < 140; i++) s.set(YARD_X + r() * (W - YARD_X), CELL + r() * (DECK_Y - CELL), C.greenDark);
  // Утоптанная земля у сенника
  s.fill((x, y) => Math.hypot((x - 312) / 34, (y - 80) / 44) < 1 && (x + y) % 2 === 0, '#c88c4c');
  s.fill((x, y) => Math.hypot((x - 312) / 30, (y - 80) / 40) < 1, '#c88c4c');
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    s.set(312 + Math.cos(a) * d * 28, 80 + Math.sin(a) * d * 38, r() < 0.5 ? '#8c5418' : C.goldLight);
  }
  s.draw(bush, 222, 128);
  s.draw(bush, 300, 126);

  // Настил: оранжевые доски с чёрными швами и гвоздями
  for (let y = DECK_Y; y < H - 6; y += 8) {
    for (let x = 0; x < W; x++) {
      s.set(x, y, C.orangeLight);
      for (let k = 1; k < 7; k++) s.set(x, y + k, C.orange);
      s.set(x, y + 7, C.redDark);
    }
    let x = Math.floor(r() * 30);
    while (x < W) {
      for (let k = 0; k < 8; k++) s.set(x, y + k, C.k);
      s.set(x + 2, y + 3, C.redDark);
      s.set(x - 3, y + 3, C.redDark);
      x += 26 + Math.floor(r() * 30);
    }
    for (let i = 0; i < 10; i++) s.set(r() * W, y + 2 + Math.floor(r() * 4), '#e4782c');
  }
  // Нижняя стенка
  s.fill((_x, y) => y >= H - 6, C.brown);
  s.fill((_x, y) => y === H - 6, C.k);

  // Левая стенка шатра: полосы
  s.fill((x, y) => x < CELL && y >= CELL && y < DECK_Y, C.white);
  s.fill((x, y) => x < CELL && y >= CELL && y < DECK_Y && Math.floor(x / 4) % 2 === 0, C.red);
  s.fill((x, y) => x === CELL - 1 && y >= CELL && y < DECK_Y, C.k);
  s.fill((x, y) => x >= CELL - 4 && x < CELL - 1 && y >= CELL && y < DECK_Y && (x + y) % 2 === 0, C.redDark);

  // Небо и облака сверху
  s.fill((_x, y) => y < CELL, C.sky);
  for (const cx of [20, 120, 230, 300]) s.draw(cloud, cx, -6);
  // Кромка шатра: красно-белые фестоны
  for (let x = 0; x < W; x++) {
    const stripe = Math.floor(x / 8) % 2 === 0;
    const col = stripe ? C.red : C.white;
    const shade = stripe ? C.redDark : C.grey;
    const lx = x % 8;
    const bottom = 12 + Math.round(Math.sin((lx / 8) * Math.PI) * 3);
    for (let y = 7; y <= bottom; y++) s.set(x, y, y >= bottom - 1 ? shade : col);
    s.set(x, bottom + 1, C.k);
    s.set(x, 6, C.k);
  }
  for (let x = 0; x < W; x++) s.set(x, 5, C.orange);
  return s;
}

export const LAMPS = [
  { x: 4, y: 0.9 },
  { x: 9.5, y: 0.9 },
  { x: 16, y: 0.9 },
  { x: 20.5, y: 0.9 },
  { x: 4.5, y: 10.4 },
  { x: 11, y: 10.4 },
  { x: 17, y: 10.4 },
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
