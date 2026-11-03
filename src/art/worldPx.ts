import { MAP } from '../data/map';
import { C } from './palette';
import { Sprite, ellipse, rng } from './pixel';

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
  // Луг: трава с травинками; лужа мочи — тёмная сырая трава; затоптанный навоз на траве
  for (let v = 0; v < 4; v++) {
    const g = noise(new Sprite(CELL, CELL), 90 + v, C.green, [[C.greenDark, 10]]);
    const rg = rng(95 + v);
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rg() * 14);
      const y = 1 + Math.floor(rg() * 14);
      g.set(x, y, C.greenLight);
      g.set(x + 1, y - 1, C.greenLight);
      g.set(x + 2, y, C.greenLight);
    }
    out[`floor-grass-${v}`] = g;
  }
  const puddle = noise(new Sprite(CELL, CELL), 101, C.green, [[C.greenDark, 10]]);
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const d = Math.hypot(x - 7.5, (y - 8) * 1.3);
      if (d < 5 || (d < 6.5 && (x + y) % 2 === 0)) puddle.set(x, y, C.greenDark);
    }
  for (const [x, y] of [[5, 7], [6, 7], [9, 9]]) puddle.set(x, y, C.goldLight);
  out['floor-puddle'] = puddle;
  const dungGrass = noise(new Sprite(CELL, CELL), 102, C.green, [[C.greenDark, 8]]);
  const rdg = rng(103);
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const d = Math.hypot(x - 8 + Math.sin(y * 0.9) * 1.5, (y - 8) * 0.9);
      if (d < 4.5 || (d < 6.5 && (x + y) % 2 === 0)) dungGrass.set(x, y, rdg() < 0.25 ? '#5c3000' : '#8c5418');
    }
  out['floor-dung-grass'] = dungGrass;
  const bare = noise(new Sprite(CELL, CELL), 71, C.grey, [[C.greyMid, 16], [C.white, 4]]);
  for (const [x, y] of [[3, 9], [4, 9], [5, 10], [6, 10], [7, 11]]) bare.set(x, y, C.greyDark);
  out['floor-bare'] = bare;
  return out;
}

const W = MAP.w * CELL;
const H = MAP.h * CELL;
const px = (v: number) => Math.round(v * CELL);
const FENCE_Y1 = px(MAP.fenceY);
const FENCE_Y2 = px(MAP.fenceY2);
const ROOM_Y0 = px(MAP.rooms.duty.y0);
const ROOM_Y1 = px(MAP.rooms.duty.y1);
const YARD_X = px(MAP.yard.x0);
const ROAD_X = px(MAP.road.x0);
const FOREST_X = px(MAP.forest.x1);
const TENT_X = px(MAP.bedding.x + MAP.bedding.cols);
const TENT2_Y0 = px(MAP.bedding2.y);
const TENT2_Y1 = px(MAP.bedding2.y + MAP.bedding2.rows);

// Асфальт: тёмно-серый с крошкой
function asphalt(s: Sprite, r: () => number, inside: (x: number, y: number) => boolean): void {
  s.fill(inside, '#3c3c40');
  for (let i = 0; i < 1600; i++) {
    const x = Math.floor(r() * W);
    const y = Math.floor(r() * H);
    if (inside(x, y)) s.set(x, y, r() < 0.6 ? C.greyDark : C.greyMid);
  }
}

// Бетон коридоров и служебного двора
function concrete(s: Sprite, r: () => number, inside: (x: number, y: number) => boolean): void {
  s.fill(inside, '#9c9ca0');
  for (let i = 0; i < 900; i++) {
    const x = Math.floor(r() * W);
    const y = Math.floor(r() * H);
    if (inside(x, y)) s.set(x, y, r() < 0.5 ? '#8c8c90' : '#b0b0b4');
  }
}

// Дерево на лугу: крона двумя тонами и ствол. Проходу не мешает — под ним трава
function tree(s: Sprite, x: number, y: number, seed: number): void {
  const r = rng(seed);
  const h = 10 + Math.floor(r() * 6);
  for (let i = 0; i < h; i++) s.set(x, y - i, '#5c3000');
  const top = y - h;
  s.fill(ellipse(x, top - 5, 7, 5.5), C.greenDark);
  s.fill(ellipse(x - 2, top - 7, 5, 4), C.green);
  s.fill(ellipse(x + 3, top - 3, 4, 3), C.green);
  for (let i = 0; i < 10; i++) s.set(x - 6 + r() * 12, top - 10 + r() * 6, C.greenLight);
}

// Куст: низкая тёмно-зелёная кочка
function bush(s: Sprite, x: number, y: number, seed: number): void {
  const r = rng(seed);
  s.fill(ellipse(x, y - 2, 4, 2.6), C.greenDark);
  s.fill(ellipse(x - 1, y - 3, 2.6, 1.8), C.green);
  for (let i = 0; i < 5; i++) s.set(x - 3 + r() * 6, y - 4 + r() * 2, r() < 0.5 ? C.red : C.gold);
}

function rock(s: Sprite, x: number, y: number, seed: number): void {
  const r = rng(seed);
  s.fill(ellipse(x, y - 1, 4, 2.4), C.greyDark);
  s.fill(ellipse(x - 1, y - 2, 2.8, 1.5), C.greyMid);
  s.set(x + Math.floor(r() * 3) - 1, y - 2, C.grey);
}

// Навигационная линия на полу коридора: цветная пунктирная, «как в аэропорту»
function navLine(s: Sprite, x0: number, y0: number, x1: number, y1: number, color: string): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 0; i <= n; i++) {
    if (i % 8 >= 5) continue; // пунктир
    const x = Math.round(x0 + (dx * i) / (n || 1));
    const y = Math.round(y0 + (dy * i) / (n || 1));
    for (let k = -1; k <= 1; k++) s.set(x, y + k, color);
  }
}

// Неподвижный фон: небо, лесополоса, два загона с песком и лугами, бассейны, коридоры
// с навигационными линиями, пять помещений, двор с баком и дорога справа
export function background(cloud: Sprite): Sprite {
  const s = new Sprite(W, H);
  const r = rng(99);

  // Загоны: песок под подстилкой (её закроют клетки) и трава лугов
  const sand = (x: number, y: number) =>
    (y >= CELL && y < FENCE_Y1 && x < TENT_X && x >= FOREST_X) || (y >= TENT2_Y0 && y < TENT2_Y1 && x < TENT_X && x >= FOREST_X);
  s.fill(sand, '#f8d878');
  const grass = (x: number, y: number) =>
    (y >= CELL && y < FENCE_Y1 && x >= TENT_X && x < YARD_X) || (y >= TENT2_Y0 && y < TENT2_Y1 && x >= TENT_X && x < YARD_X);
  s.fill(grass, C.green);
  for (let i = 0; i < 900; i++) {
    const x = TENT_X + Math.floor(r() * (YARD_X - TENT_X));
    const y = CELL + 2 + Math.floor(r() * (H - CELL - 4));
    if (!grass(x, y)) continue;
    s.set(x, y, C.greenLight);
    s.set(x + 1, y - 1, C.greenLight);
    s.set(x + 2, y, C.greenLight);
  }
  for (let i = 0; i < 420; i++) {
    const x = TENT_X + r() * (YARD_X - TENT_X);
    const y = CELL + r() * (H - CELL);
    if (grass(x, y)) s.set(x, y, C.greenDark);
  }
  // Тропинки, натоптанные слонами вдоль решёток
  s.fill((x, y) => grass(x, y) && Math.abs(y - (FENCE_Y1 - 10)) < 8 && (x + y) % 3 === 0, '#c88c4c');
  s.fill((x, y) => grass(x, y) && Math.abs(y - (FENCE_Y2 + 10)) < 8 && (x + y) % 3 === 0, '#c88c4c');

  // Бассейны на лугах: сплошная голубая вода и заметный песчано-каменный бортик
  for (const p of MAP.pools) {
    const cx = px(p.x);
    const cy = px(p.y);
    const rx = px(p.rx);
    const ry = px(p.ry);
    s.fill(ellipse(cx, cy, rx + 10, ry + 9), '#8c5418');
    s.fill(ellipse(cx, cy, rx + 7, ry + 6), '#e8c878');
    s.fill(ellipse(cx, cy, rx + 3, ry + 2), '#c88c4c');
    s.fill(ellipse(cx, cy, rx, ry), '#2890d8');
    s.fill(ellipse(cx, cy, rx - 3, ry - 3), '#48b8f8');
    s.fill(ellipse(cx - rx / 4, cy - ry / 4, rx / 3, ry / 4), '#a4e8ff');
    for (let k = 0; k < 26; k++) {
      const angle = (k / 26) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(angle) * (rx + 5));
      const y = Math.round(cy + Math.sin(angle) * (ry + 4));
      s.set(x, y, k % 2 ? '#f8e0a0' : '#9c9ca0');
    }
  }

  // Коридоры и двор: бетон
  concrete(s, r, (x, y) => x >= FOREST_X && x < ROAD_X && ((y >= FENCE_Y1 && y < ROOM_Y0) || (y >= ROOM_Y1 && y < FENCE_Y2)));
  concrete(s, r, (x) => x >= YARD_X && x < ROAD_X);

  // Навигационные линии коридоров «как в аэропорту»:
  // жёлтая → Дежурка, синяя → Мойка, зелёная → Кормовая, оранжевая → Сенник и Опилочник
  const midUp = Math.round((FENCE_Y1 + ROOM_Y0) / 2);
  const midDown = Math.round((ROOM_Y1 + FENCE_Y2) / 2);
  navLine(s, FOREST_X + 8, midUp, ROAD_X - 8, midUp, C.gold);
  navLine(s, FOREST_X + 8, midDown, ROAD_X - 8, midDown, C.gold);
  const doors: [number, string][] = [
    [px(6.9), '#f8b800'],
    [px(17.1), C.blueLight],
    [px(27.3), C.greenLight],
    [px(37.3), C.orange],
    [px(47.1), C.orange],
  ];
  for (const [x, color] of doors) {
    navLine(s, x, midUp, x, ROOM_Y0, color);
    navLine(s, x, ROOM_Y1, x, midDown, color);
  }
  // Ветка к рохле и выезду к дороге
  navLine(s, px(49.5), midUp, px(49.5), FENCE_Y1 + 8, C.white);
  navLine(s, px(54.4), FENCE_Y1 + 8, px(54.4), midUp, C.white);

  // Постройки: дежурка — резиновая плитка, мойка — кафель, кормовая — линолеум,
  // сенник — дощатый пол, опилочник — бетонные плиты
  const room = (k: keyof typeof MAP.rooms) => {
    const m = MAP.rooms[k];
    return (x: number, y: number) => x >= px(m.x0) && x < px(m.x1) && y >= px(m.y0) && y < px(m.y1);
  };
  const duty = room('duty');
  s.fill(duty, '#6c6c74');
  s.fill((x, y) => duty(x, y) && (x % 12 === 0 || y % 12 === 0), '#4c4c54');
  s.fill((x, y) => duty(x, y) && x % 12 === 1 && y % 12 === 1, '#8c8c94');
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
  const hayRoom = room('hay');
  s.fill(hayRoom, C.orange);
  s.fill((x, y) => hayRoom(x, y) && y % 8 === 7, C.redDark);
  s.fill((x, y) => hayRoom(x, y) && (x + Math.floor(y / 8) * 4) % 13 === 0, C.k);
  const sawdustRoom = room('sawdust');
  s.fill(sawdustRoom, '#a4a4a8');
  s.fill((x, y) => sawdustRoom(x, y) && (x % 16 === 0 || y % 16 === 0), C.greyMid);

  // Асфальт двора и дороги; разметка дороги — вертикальная осевая
  asphalt(s, r, (x, y) => x >= ROAD_X || (x >= YARD_X && y >= FENCE_Y1 && y < FENCE_Y2));
  for (let y = 4; y < H; y += 16) for (let k = 0; k < 8; k++) s.set(Math.round((ROAD_X + W) / 2) - 2, y + k, C.white);
  for (let y = 4; y < H; y += 16) for (let k = 0; k < 8; k++) s.set(Math.round((ROAD_X + W) / 2) - 1, y + k, C.white);
  // Жёлтая рамка места мусорного бака и зона разгрузки у борта
  const mark = (cx: number, cy: number, w: number, h: number) => {
    const [cx0, cy0, cx1, cy1] = [px(cx - w / 2) - 3, px(cy - h / 2) - 3, px(cx + w / 2) + 2, px(cy + h / 2) + 2];
    for (let x = cx0; x <= cx1; x++) if (x % 4 < 2) {
      s.set(x, cy0, C.gold);
      s.set(x, cy1, C.gold);
    }
    for (let y = cy0; y <= cy1; y++) if (y % 4 < 2) {
      s.set(cx0, y, C.gold);
      s.set(cx1, y, C.gold);
    }
  };
  mark(MAP.stations.dump.x, MAP.stations.dump.y, MAP.stations.dump.w, MAP.stations.dump.h);
  mark(MAP.stations.unload.x, MAP.stations.unload.y, MAP.stations.unload.w, MAP.stations.unload.h);
  mark(MAP.stations.receiving.x, MAP.stations.receiving.y, MAP.stations.receiving.w, MAP.stations.receiving.h);

  // Лесополоса слева — граница территории: тёмная зелень и кроны
  s.fill((x) => x < FOREST_X, '#004000');
  for (let i = 0; i < 260; i++) {
    const x = r() * FOREST_X;
    const y = r() * H;
    s.set(x, y, C.greenDark);
  }
  for (let y = 14; y < H; y += 56) tree(s, 4 + Math.floor(r() * 3), y, Math.floor(y));
  for (let y = 34; y < H; y += 64) tree(s, Math.floor(r() * 3), y, Math.floor(y * 7));

  // Деревья и кусты на лугах — не в бассейне и не у решёток
  const meadow = (x: number, y: number) => grass(x, y);
  const clearOfPools = (x: number, y: number) =>
    MAP.pools.every((p) => Math.hypot((x - p.x) / (p.rx + 3), (y - p.y) / (p.ry + 3)) > 1);
  const spots: [number, number][] = [];
  const rs = rng(7);
  for (let i = 0; i < 60; i++) {
    const x = 24 + rs() * 26;
    const y = (rs() < 0.5 ? 2.5 + rs() * 9 : 29.5 + rs() * 15.5);
    if (!meadow(x, y) || !clearOfPools(x, y)) continue;
    if (Math.abs(y - MAP.fenceY) < 2 || Math.abs(y - MAP.fenceY2) < 2) continue;
    spots.push([x, y]);
  }
  spots.forEach(([x, y], i) => {
    if (i % 3 === 0) tree(s, px(x), px(y), 30 + i);
    else if (i % 3 === 1) bush(s, px(x), px(y), 60 + i);
    else if (i % 5 === 4) rock(s, px(x), px(y), 90 + i);
    else {
      s.set(px(x), px(y) - 1, C.gold);
      s.set(px(x) + 1, px(y), i % 2 ? C.red : C.white);
    }
  });
  MAP.meadowTrees.forEach((point, i) => tree(s, px(point.x), px(point.y), 301 + i));
  for (const [x, y, seed] of [
    [28, 7.5, 401], [32, 8.8, 402], [49, 6, 403], [28, 34, 404], [33, 43, 405], [49, 35, 406],
  ] as const) {
    if (seed % 2) rock(s, px(x), px(y), seed);
    else bush(s, px(x), px(y), seed);
  }

  // Перила дороги — серая труба на столбиках вдоль двора
  for (let y = 0; y < H; y++) {
    s.set(ROAD_X - 3, y, C.k);
    s.set(ROAD_X - 2, y, C.grey);
    s.set(ROAD_X - 1, y, C.k);
  }
  for (let y = 10; y < H; y += 40) for (let yy = y - 4; yy <= y + 4; yy++) s.set(ROAD_X - 2, yy, C.greyDark);

  // Верхняя решётка над верхним загоном и нижняя кромка мира у нижнего
  for (let x = FOREST_X; x < YARD_X; x++) {
    s.set(x, CELL - 6, C.k);
    s.set(x, CELL - 1, C.k);
    if (x % 3 === 0) for (let y = CELL - 6; y < CELL; y++) s.set(x, y, C.greyDark);
  }
  for (let x = FOREST_X; x < YARD_X; x++) {
    s.set(x, H - 6, C.k);
    s.set(x, H - 1, C.k);
    if (x % 3 === 0) for (let y = H - 6; y < H; y++) s.set(x, y, C.greyDark);
  }

  // Плафоны на стенах у дверей помещений: аккуратные, проходу не мешают
  for (const t of MAP.thresholds) {
    const x = Math.round(((t.x0 + t.x1) / 2) * CELL);
    const up = t.y0 === ROOM_Y0 / CELL;
    const y = up ? px(t.y0) - 5 : px(t.y0) + 3;
    s.set(x, y, C.k);
    s.set(x, y + 1, C.gold);
    s.set(x - 1, y + 1, C.k);
    s.set(x + 1, y + 1, C.k);
  }

  // Небо и облака сверху
  s.fill((_x, y) => y < CELL, C.sky);
  for (const cx of [80, 300, 560, 820]) s.draw(cloud, cx, -6);
  // Кромка шатра над песком верхнего загона: красно-белые фестоны
  for (let x = FOREST_X; x < TENT_X; x++) {
    const stripe = Math.floor(x / 8) % 2 === 0;
    const col = stripe ? C.red : C.white;
    const shade = stripe ? C.redDark : C.grey;
    const lx = x % 8;
    const bottom = 12 + Math.round(Math.sin((lx / 8) * Math.PI) * 3);
    for (let y = 7; y <= bottom; y++) s.set(x, y, y >= bottom - 1 ? shade : col);
    s.set(x, bottom + 1, C.k);
    s.set(x, 6, C.k);
  }
  for (let x = FOREST_X; x < TENT_X; x++) s.set(x, 5, C.orange);
  return s;
}

// Фонари на столбах — только вдоль автомобильной дороги справа
export const LAMPS: { x: number; y: number }[] = [3.5, 11, 18.5, 26, 33.5, 41, 44.5].map((y) => ({ x: MAP.road.x0 - 0.6, y }));

// Плафоны коридоров: точки света (без столбов — свет на полу коридора)
const CEILING: { x: number; y: number }[] = [
  { x: 8.8, y: 15.2 },
  { x: 20.2, y: 15.2 },
  { x: 29.6, y: 15.2 },
  { x: 39.4, y: 15.2 },
  { x: 47.2, y: 15.2 },
  { x: 10.7, y: 26 },
  { x: 20.3, y: 26 },
  { x: 29.9, y: 26 },
  { x: 39.5, y: 26 },
  { x: 48.7, y: 26 },
];

// Сколько света в точке ночью, 0…1: постройки освещены целиком, у фонарей — пятно на асфальте,
// в коридорах — свет от плафонов, дежурный свет — ровный тусклый по обоим вольерам
function lightAt(x: number, y: number, duty: boolean): number {
  let light = 0;
  const checker = (x + y) % 2 === 0;
  for (const r of Object.values(MAP.rooms)) {
    if (x >= px(r.x0) && x < px(r.x1) && y >= px(r.y0) && y < px(r.y1)) light = r === MAP.rooms.hay || r === MAP.rooms.sawdust ? 0.6 : 0.85;
  }
  const lampGlowAt = (l: { x: number; y: number }, scale = 1): number => {
    const d = Math.hypot(x - l.x * CELL, (y - (l.y + 0.7) * CELL) * 1.4) / scale;
    return d < 16 ? 0.95 : d < 38 ? 0.72 : d < 56 ? 0.46 : d < 72 ? 0.2 : 0;
  };
  for (const l of LAMPS) light = Math.max(light, lampGlowAt(l, 2.4));
  for (const l of CEILING) light = Math.max(light, lampGlowAt(l, 1.2));
  if (duty) {
    for (const p of [MAP.paddock, MAP.paddock2]) {
      const inside = x >= px(p.x0) && x < px(p.x1) && y >= px(p.y0) && y < px(p.y1);
      const edge = x < px(p.x0) + 2 || x >= px(p.x1) - 2 || y < px(p.y0) + 2 || y >= px(p.y1) - 2;
      if (inside) light = Math.max(light, edge && checker ? 0.3 : 0.55);
    }
  }
  return light;
}

// Ночь: тёмно-синий почти сплошь; где светло — прозрачнее. На краях пятен — шахматка, как в старых играх
export function nightOverlay(duty: boolean): HTMLCanvasElement {
  return paint('#000018', (x, y) => 0.95 * (1 - lightAt(x, y, duty)));
}

// Тёплый отсвет ламп поверх ночи
export function lampGlow(duty: boolean): HTMLCanvasElement {
  return paint(C.goldLight, (x, y) => 0.2 * lightAt(x, y, duty));
}

function paint(color: string, alpha: (x: number, y: number) => number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const n = parseInt(color.slice(1), 16);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      img.data[i] = (n >> 16) & 255;
      img.data[i + 1] = (n >> 8) & 255;
      img.data[i + 2] = n & 255;
      img.data[i + 3] = Math.round(alpha(x, y) * 255);
    }
  g.putImageData(img, 0, 0);
  return c;
}
