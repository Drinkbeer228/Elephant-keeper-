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

function brick(s: Sprite, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const row = Math.floor((y - y0) / 3);
      const seam = (y - y0) % 3 === 2 || (x + (row % 2) * 4) % 8 === 0;
      s.set(x, y, y === y0 ? C.orangeLight : seam ? C.k : C.orange);
    }
  for (let x = x0; x <= x1; x++) s.set(x, y1 + 1, C.k);
}

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

// Неподвижный фон всех зон по текущей геометрии карты.
export function background(cloud: Sprite): Sprite {
  const s = new Sprite(W, H);
  const r = rng(99);
  s.fill(() => true, '#548c4c');
  for (const [id, complex] of Object.entries(MAP.complexes)) {
    const active = complex.active;
    const rotation = complex.rotation;
    s.fill((x, y) => x >= px(active.x0) && x < px(active.x1) && y >= px(active.y0) && y < px(active.y1), id === 'female' ? '#e8d088' : C.green);
    s.fill((x, y) => x >= px(rotation.x0) && x < px(rotation.x1) && y >= px(rotation.y0) && y < px(rotation.y1), '#78a858');
    s.fill(
      (x, y) => x >= px(complex.barn.x0) && x < px(complex.barn.x1) && y >= px(complex.barn.y0) && y < px(complex.barn.y1),
      '#9c9ca0',
    );
    const bedding = id === 'female' ? MAP.bedding : MAP.bedding2;
    s.fill(
      (x, y) =>
        x >= px(bedding.x) && x < px(bedding.x + bedding.cols) && y >= px(bedding.y) && y < px(bedding.y + bedding.rows),
      '#f8d878',
    );
    for (let i = 0; i < 120; i++) {
      const x = px(active.x0 + r() * (active.x1 - active.x0));
      const y = px(active.y0 + r() * (active.y1 - active.y0));
      s.set(x, y, r() < 0.6 ? C.greenLight : C.greenDark);
    }
  }

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

  const concreteZones = [
    MAP.areas.centralPath,
    MAP.areas.eastPath,
    MAP.areas.adminConnector,
    MAP.areas.lowerRoomsPath,
    MAP.areas.westRoomsPath,
    MAP.areas.westStorageApproach,
    MAP.areas.hayApproach,
    MAP.areas.hayUnload,
    MAP.areas.equipmentYard,
    MAP.areas.garageApproach,
    { x0: 78, y0: 73, x1: 93, y1: 76 },
    { x0: 90, y0: 76, x1: 93, y1: 81 },
  ];
  concrete(s, r, (x, y) => concreteZones.some((zone) => x >= px(zone.x0) && x < px(zone.x1) && y >= px(zone.y0) && y < px(zone.y1)));
  asphalt(s, r, (x, y) => MAP.roads.some((road) => x >= px(road.x0) && x < px(road.x1) && y >= px(road.y0) && y < px(road.y1)));
  asphalt(s, r, (x, y) => {
    const zone = MAP.areas.truckYard;
    return x >= px(zone.x0) && x < px(zone.x1) && y >= px(zone.y0) && y < px(zone.y1);
  });
  asphalt(s, r, (x, y) => Object.values(MAP.rooms).some((room) => x >= px(room.x0) && x < px(room.x1) && y >= px(room.y0) && y < px(room.y1)));

  for (const room of Object.values(MAP.rooms)) {
    const x0 = px(room.x0);
    const x1 = px(room.x1);
    const y0 = px(room.y0);
    const y1 = px(room.y1);
    const color = room === MAP.rooms.wash ? C.white : room === MAP.rooms.admin ? '#9c9ca0' : C.grey;
    s.fill((x, y) => x >= x0 && x < x1 && y >= y0 && y < y1 && (x % 8 === 0 || y % 8 === 0), C.greyMid);
    s.fill((x, y) => x >= x0 && x < x1 && y >= y0 && y < y1 && (x + y) % 23 === 0, color);
  }
  navLine(s, px(16), px(53), px(75), px(53), C.gold);
  navLine(s, px(75), px(53), px(75), px(74), C.white);
  navLine(s, px(31), px(63), px(54), px(63), C.blueLight);
  navLine(s, px(17), px(73), px(31), px(73), C.orange);

  const receive = MAP.stations.receiving;
  const bx0 = px(receive.x - receive.w / 2);
  const by0 = px(receive.y - receive.h / 2);
  const bx1 = px(receive.x + receive.w / 2);
  const by1 = px(receive.y + receive.h / 2);
  s.fill((x, y) => x >= bx0 && x < bx1 && y >= by0 && y < by1, '#5c646c');
  s.fill((x, y) => x >= bx0 && x < bx1 && y >= by0 && y < by1 && (x + y) % 13 < 2, '#747c84');
  for (const spot of MAP.receivingSpots) {
    const sx0 = px(spot.x - MAP.palletFootprint.w / 2);
    const sy0 = px(spot.y - MAP.palletFootprint.h / 2);
    const sx1 = px(spot.x + MAP.palletFootprint.w / 2);
    const sy1 = px(spot.y + MAP.palletFootprint.h / 2);
    for (let x = sx0; x <= sx1; x++) if ((x - sx0) % 8 < 3) {
      s.set(x, sy0, C.gold);
      s.set(x, sy1, C.gold);
    }
    for (let y = sy0; y <= sy1; y++) if ((y - sy0) % 8 < 3) {
      s.set(sx0, y, C.gold);
      s.set(sx1, y, C.gold);
    }
  }
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

  for (let i = 0; i < 260; i++) s.set(r() * px(MAP.forest.x1), r() * H, C.greenDark);
  for (const w of MAP.walls) {
    const inRoom = Object.values(MAP.rooms).some((room) => {
      const x0 = Math.min(w.x0, w.x1);
      const x1 = Math.max(w.x0, w.x1);
      const y0 = Math.min(w.y0, w.y1);
      const y1 = Math.max(w.y0, w.y1);
      return x0 >= room.x0 && x1 <= room.x1 && y0 >= room.y0 && y1 <= room.y1;
    });
    if (!inRoom) continue;
    if (w.y0 === w.y1) brick(s, px(w.x0) - 2, px(w.y0) - 3, px(w.x1) + 1, px(w.y0) + 1);
    else brick(s, px(w.x0) - 2, px(w.y0) - 3, px(w.x0) + 2, px(w.y1));
  MAP.meadowTrees.forEach((point, i) => tree(s, px(point.x), px(point.y), 301 + i));
  }
  for (const t of MAP.thresholds) {
    const x = Math.round(((t.x0 + t.x1) / 2) * CELL);
    const up = t.y0 < MAP.rooms.wash.y0;
    const y = up ? px(t.y0) - 5 : px(t.y0) + 3;
    s.set(x, y, C.k);
    s.set(x, y + 1, C.gold);
    s.set(x - 1, y + 1, C.k);
    s.set(x + 1, y + 1, C.k);
  }

  s.fill((x, y) => x < px(MAP.forest.x1) && y < CELL, C.sky);
  for (const cx of [px(16), px(48), px(80)]) s.draw(cloud, cx, -6);
  return s;
}

// Фонари вдоль замкнутого транспортного контура
export const LAMPS: { x: number; y: number }[] = [
  ...[22, 38, 54, 70, 86].map((y) => ({ x: MAP.road.x0 - 0.6, y })),
  ...[30, 52, 74].map((y) => ({ x: 14.6, y })),
];

// Плафоны коридоров: точки света (без столбов — свет на полу коридора)
const CEILING: { x: number; y: number }[] = Object.values(MAP.rooms).map((room) => ({
  x: (room.x0 + room.x1) / 2,
  y: (room.y0 + room.y1) / 2,
}));

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
