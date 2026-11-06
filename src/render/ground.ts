// Неподвижная часть карты: грунты, стены, ограды и решётки, мебель и надписи.
// Зоны различаются материалом: выгул — живая трава с тропами и проплешинами; стойла — тёплый
// песок под соломой и бетонная полоса у решётки; проход и коридор — светлая плитка;
// помещения — холодная стяжка; дворы — тёмный асфальт с гравием. Стены — графитовый контур,
// тёплая заливка и тень на пол; решётки — стойки и перекладины, сквозь них видно слонов.

import Phaser from 'phaser';
import {
  AISLE,
  BARN,
  BEDDING,
  BOULDERS,
  DRAIN,
  DRY_PATCHES,
  DUST_PIT,
  GRASS_PATCHES,
  H,
  LOG,
  PADDOCK,
  PATHS,
  POOL,
  ROOMS,
  SERVICE_EDGE_Y,
  SOLIDS,
  STATIONS,
  TREES,
  W,
  YARDS,
  inEllipse,
  inRect,
  type Rect,
  type StationId,
} from '../data/facility';
import { rnd, roomSign } from './art';
import { C, hex, shade } from './palette';
import { addArt, placeImage, PPM } from './textures';

export const D = {
  ground: 0,
  floor: 5,
  decor: 6,
  station: 10,
  stationDyn: 11,
  waste: 15,
  shadow: 18,
  wallShadow: 19,
  wall: 20,
  actor: 30,
  canopy: 60,
  label: 70,
  bubble: 75,
  marker: 72,
  night: 90,
  light: 91,
};

const P = PPM;

function rect(g: Phaser.GameObjects.Graphics, r: Rect, color: string, alpha = 1, radius = 0): void {
  g.fillStyle(hex(color), alpha);
  if (radius > 0) g.fillRoundedRect(r.x0 * P, r.y0 * P, (r.x1 - r.x0) * P, (r.y1 - r.y0) * P, radius * P);
  else g.fillRect(r.x0 * P, r.y0 * P, (r.x1 - r.x0) * P, (r.y1 - r.y0) * P);
}

function ell(g: Phaser.GameObjects.Graphics, x: number, y: number, rx: number, ry: number, color: string, alpha = 1): void {
  g.fillStyle(hex(color), alpha);
  g.fillEllipse(x * P, y * P, rx * 2 * P, ry * 2 * P, 48);
}

// Насколько подробнее мира запекается неподвижная графика (векторная → текстура)
export function bakeScale(scene: Phaser.Scene): number {
  const r = scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  const max = typeof r.getMaxTextureSize === 'function' ? r.getMaxTextureSize() : 2048;
  return max >= 4096 ? 2 : 1;
}

function tileJoints(g: Phaser.GameObjects.Graphics, r: Rect, step: number, color: string, alpha = 1, width = 0.025): void {
  g.lineStyle(width * P, hex(color), alpha);
  for (let x = r.x0 + step; x < r.x1 - 0.01; x += step) g.lineBetween(x * P, r.y0 * P, x * P, r.y1 * P);
  for (let y = r.y0 + step; y < r.y1 - 0.01; y += step) g.lineBetween(r.x0 * P, y * P, r.x1 * P, y * P);
}

function speckle(g: Phaser.GameObjects.Graphics, r: Rect, density: number, colors: string[], rng: () => number, size = 0.05): void {
  const n = Math.round((r.x1 - r.x0) * (r.y1 - r.y0) * density);
  for (let i = 0; i < n; i++) {
    g.fillStyle(hex(colors[Math.floor(rng() * colors.length)]), 0.85);
    g.fillCircle((r.x0 + rng() * (r.x1 - r.x0)) * P, (r.y0 + rng() * (r.y1 - r.y0)) * P, (size * (0.6 + rng() * 0.8)) * P);
  }
}

function drawPaddock(g: Phaser.GameObjects.Graphics, r: () => number): void {
  // Трава с пятнами разной густоты
  rect(g, PADDOCK, C.grassBase, 1, 0.6);
  for (let i = 0; i < 70; i++) {
    const x = PADDOCK.x0 + 1 + r() * (PADDOCK.x1 - PADDOCK.x0 - 2);
    const y = PADDOCK.y0 + 1 + r() * (PADDOCK.y1 - PADDOCK.y0 - 2);
    ell(g, x, y, 0.8 + r() * 2.4, 0.5 + r() * 1.4, r() < 0.5 ? C.grassLight : C.grassDeep, 0.35);
  }
  for (const p of GRASS_PATCHES) {
    ell(g, p.x, p.y, p.rx + 0.4, p.ry + 0.3, C.grassDeep, 0.45);
    ell(g, p.x, p.y, p.rx, p.ry, shade(C.grassDeep, -0.04), 0.55);
  }
  // Голая земля вдоль ограды
  const edge = 1.0;
  g.fillStyle(hex(C.soil), 0.75);
  g.fillRect(PADDOCK.x0 * P, PADDOCK.y0 * P, (PADDOCK.x1 - PADDOCK.x0) * P, edge * P);
  g.fillRect(PADDOCK.x0 * P, (PADDOCK.y1 - edge) * P, (PADDOCK.x1 - PADDOCK.x0) * P, edge * P);
  g.fillRect(PADDOCK.x0 * P, PADDOCK.y0 * P, edge * P, (PADDOCK.y1 - PADDOCK.y0) * P);
  g.fillRect((PADDOCK.x1 - edge) * P, PADDOCK.y0 * P, edge * P, (PADDOCK.y1 - PADDOCK.y0) * P);
  // Неровный край полосы
  for (let i = 0; i < 90; i++) {
    const side = Math.floor(r() * 4);
    const t = r();
    const x = side < 2 ? PADDOCK.x0 + t * (PADDOCK.x1 - PADDOCK.x0) : side === 2 ? PADDOCK.x0 + edge : PADDOCK.x1 - edge;
    const y = side >= 2 ? PADDOCK.y0 + t * (PADDOCK.y1 - PADDOCK.y0) : side === 0 ? PADDOCK.y0 + edge : PADDOCK.y1 - edge;
    ell(g, x, y, 0.3 + r() * 0.5, 0.25 + r() * 0.4, C.soil, 0.7);
  }
  // Проплешины и тропы
  for (const d of DRY_PATCHES) {
    ell(g, d.x, d.y, d.rx + 0.35, d.ry + 0.3, C.soil, 0.45);
    ell(g, d.x, d.y, d.rx, d.ry, C.soil, 0.85);
    for (let i = 0; i < 6; i++) ell(g, d.x + (r() - 0.5) * d.rx * 1.6, d.y + (r() - 0.5) * d.ry * 1.6, 0.3 + r() * 0.5, 0.2 + r() * 0.4, C.soilDark, 0.35);
  }
  for (const path of PATHS) {
    g.lineStyle(1.5 * P, hex(C.soil), 0.55);
    for (let i = 0; i + 1 < path.length; i++) g.lineBetween(path[i].x * P, path[i].y * P, path[i + 1].x * P, path[i + 1].y * P);
    g.lineStyle(0.9 * P, hex(C.soil), 0.8);
    for (let i = 0; i + 1 < path.length; i++) g.lineBetween(path[i].x * P, path[i].y * P, path[i + 1].x * P, path[i + 1].y * P);
    for (const p of path) ell(g, p.x, p.y, 0.55, 0.45, C.soil, 0.8);
  }
  // Пылевая яма и берег бассейна
  ell(g, DUST_PIT.x, DUST_PIT.y, DUST_PIT.rx + 0.4, DUST_PIT.ry + 0.3, C.soilDark, 0.6);
  ell(g, DUST_PIT.x, DUST_PIT.y, DUST_PIT.rx, DUST_PIT.ry, C.dust);
  ell(g, POOL.x, POOL.y, POOL.rx + 1.0, POOL.ry + 0.85, C.soil);
  ell(g, POOL.x, POOL.y, POOL.rx + 0.4, POOL.ry + 0.35, shade(C.soilDark, -0.05));
  // Пучки травы и камешки
  for (let i = 0; i < 520; i++) {
    const x = PADDOCK.x0 + 0.4 + r() * (PADDOCK.x1 - PADDOCK.x0 - 0.8);
    const y = PADDOCK.y0 + 0.4 + r() * (PADDOCK.y1 - PADDOCK.y0 - 0.8);
    if (inEllipse(POOL, x, y, 0.9) || inEllipse(DUST_PIT, x, y, 0.2)) continue;
    const bare = DRY_PATCHES.some((d) => inEllipse(d, x, y)) || x < PADDOCK.x0 + 1 || x > PADDOCK.x1 - 1 || y < PADDOCK.y0 + 1 || y > PADDOCK.y1 - 1;
    if (!bare && r() < 0.7) {
      g.lineStyle(0.045 * P, hex(r() < 0.5 ? C.tuft : shade(C.tuft, 0.15)), 0.75);
      for (const dx of [-0.07, 0, 0.07]) g.lineBetween((x + dx) * P, y * P, (x + dx * 1.8) * P, (y - 0.15 - Math.abs(dx)) * P);
    } else if (bare) {
      g.fillStyle(hex(r() < 0.5 ? C.soilDark : shade(C.soilDark, -0.12)), 0.75);
      g.fillCircle(x * P, y * P, (0.035 + r() * 0.045) * P);
    }
  }
}

function drawBarn(g: Phaser.GameObjects.Graphics, r: () => number): void {
  // Стойла: утрамбованный песок под соломой (солома рисуется слоем пола)
  rect(g, BARN, C.barnConcrete);
  rect(g, BEDDING, C.barnSand);
  speckle(g, BEDDING, 2.2, [C.barnSandDark, shade(C.barnSand, 0.1)], r, 0.045);
  // Бетонная полоса вдоль решётки: швы, сток
  const edge: Rect = { x0: BARN.x0, y0: SERVICE_EDGE_Y, x1: BARN.x1, y1: BARN.y1 };
  rect(g, edge, C.barnConcrete);
  g.fillStyle(hex(C.barnConcreteDark), 0.6);
  g.fillRect(edge.x0 * P, edge.y0 * P, (edge.x1 - edge.x0) * P, 0.08 * P);
  g.lineStyle(0.025 * P, hex(C.barnConcreteDark), 1);
  for (let x = edge.x0 + 2; x < edge.x1; x += 2) g.lineBetween(x * P, edge.y0 * P, x * P, edge.y1 * P);
  ell(g, DRAIN.x, DRAIN.y, DRAIN.r, DRAIN.r * 0.75, C.barnConcreteDark, 0.6);
}

function drawService(g: Phaser.GameObjects.Graphics, r: () => number): void {
  for (const y of YARDS) {
    if (y.id === 'corridor') continue;
    // Технический двор: асфальт и мокрый гравий
    rect(g, y.rect, C.yard);
    speckle(g, y.rect, 1.6, [C.yardDark, C.yardStone, shade(C.yard, 0.12)], r, 0.06);
    for (let i = 0; i < 10; i++) ell(g, y.rect.x0 + r() * (y.rect.x1 - y.rect.x0), y.rect.y0 + r() * (y.rect.y1 - y.rect.y0), 0.6 + r(), 0.4 + r() * 0.6, C.yardDark, 0.35);
  }
  // Коридор и проход кипера: светлая плитка с деформационными швами
  const corridor = YARDS.find((y) => y.id === 'corridor')!.rect;
  rect(g, corridor, C.corridor);
  tileJoints(g, corridor, 1, C.corridorSeam, 0.7, 0.02);
  g.lineStyle(0.05 * P, hex(C.corridorSeam), 1);
  for (let x = corridor.x0 + 6; x < corridor.x1; x += 6) g.lineBetween(x * P, corridor.y0 * P, x * P, corridor.y1 * P);
  // Проход кипера в слоновнике: жёлтая линия безопасности вдоль решётки
  g.fillStyle(hex('#d9b84a'), 0.9);
  g.fillRect(AISLE.x0 * P, (AISLE.y0 + 0.62) * P, (AISLE.x1 - AISLE.x0) * P, 0.07 * P);
  for (const room of ROOMS) {
    const fill = room.floor === 'tile' ? C.roomBlue : room.floor === 'concrete' ? C.roomNeutral : room.id === 'duty' ? C.roomNeutral : C.roomBlue;
    rect(g, room.rect, fill);
    if (room.floor === 'tile') tileJoints(g, room.rect, 0.6, C.roomSeam, 0.8, 0.02);
    else if (room.floor === 'concrete') {
      g.lineStyle(0.03 * P, hex(C.roomSeam), 1);
      for (let x = room.rect.x0 + 2.5; x < room.rect.x1; x += 2.5) g.lineBetween(x * P, room.rect.y0 * P, x * P, room.rect.y1 * P);
      for (let y = room.rect.y0 + 2.4; y < room.rect.y1; y += 2.4) g.lineBetween(room.rect.x0 * P, y * P, room.rect.x1 * P, y * P);
    } else speckle(g, room.rect, 0.8, [C.roomSeam], r, 0.035);
  }
}

// Тень на пол от стен: свет сверху-слева, тень мягко уходит вправо-вниз
function drawShadows(sh: Phaser.GameObjects.Graphics): void {
  for (const s of SOLIDS) {
    const k = s.kind === 'wall' ? 1 : s.kind === 'barrier' ? 0.45 : 0.4;
    for (const [o, a] of [
      [0.42, 0.05],
      [0.3, 0.07],
      [0.18, 0.08],
    ] as const) {
      sh.fillStyle(hex(C.ink), a * k);
      sh.fillRect((s.rect.x0 + o * 0.6) * P, (s.rect.y0 + o) * P, (s.rect.x1 - s.rect.x0) * P, (s.rect.y1 - s.rect.y0) * P);
    }
  }
}

function drawWalls(wg: Phaser.GameObjects.Graphics): void {
  for (const s of SOLIDS) {
    const rr = s.rect;
    const x = rr.x0 * P;
    const y = rr.y0 * P;
    const w = (rr.x1 - rr.x0) * P;
    const h = (rr.y1 - rr.y0) * P;
    const horizontal = w > h;
    if (s.kind === 'wall') {
      wg.fillStyle(hex(C.wallFill), 1);
      wg.fillRect(x, y, w, h);
      // Верхняя грань светлее — стена читается объёмной
      wg.fillStyle(hex(C.wallTop), 1);
      if (horizontal) wg.fillRect(x, y, w, h * 0.42);
      else wg.fillRect(x, y, w * 0.42, h);
      wg.lineStyle(0.055 * P, hex(C.wallInk), 1);
      wg.strokeRect(x, y, w, h);
    } else if (s.kind === 'fence') {
      // Ограда выгула: деревянные жерди на столбах
      wg.fillStyle(hex(C.wood), 1);
      wg.fillRect(x, y, w, h);
      wg.lineStyle(0.035 * P, hex(C.woodDark), 1);
      wg.strokeRect(x, y, w, h);
      const len = horizontal ? rr.x1 - rr.x0 : rr.y1 - rr.y0;
      for (let k = 0; k <= len + 0.01; k += 2) {
        const px = horizontal ? rr.x0 + Math.min(k, len) : (rr.x0 + rr.x1) / 2;
        const py = horizontal ? (rr.y0 + rr.y1) / 2 : rr.y0 + Math.min(k, len);
        wg.fillStyle(hex(C.woodDark), 1);
        wg.fillRect((px - 0.17) * P, (py - 0.17) * P, 0.34 * P, 0.34 * P);
        wg.lineStyle(0.03 * P, hex(C.wallInk), 1);
        wg.strokeRect((px - 0.17) * P, (py - 0.17) * P, 0.34 * P, 0.34 * P);
      }
    } else if (s.kind === 'barrier') {
      // Решётка защищённого контакта: две перекладины и частые стойки — сквозь неё видно
      const len = horizontal ? rr.x1 - rr.x0 : rr.y1 - rr.y0;
      wg.lineStyle(0.07 * P, hex(C.railDark), 1);
      if (horizontal) {
        wg.lineBetween(x, y + h * 0.22, x + w, y + h * 0.22);
        wg.lineBetween(x, y + h * 0.78, x + w, y + h * 0.78);
      } else {
        wg.lineBetween(x + w * 0.22, y, x + w * 0.22, y + h);
        wg.lineBetween(x + w * 0.78, y, x + w * 0.78, y + h);
      }
      for (let k = 0; k <= len + 0.001; k += 0.42) {
        const px = horizontal ? rr.x0 + k : (rr.x0 + rr.x1) / 2;
        const py = horizontal ? (rr.y0 + rr.y1) / 2 : rr.y0 + k;
        wg.fillStyle(hex(C.railDark), 1);
        wg.fillCircle(px * P, py * P, 0.1 * P);
        wg.fillStyle(hex(C.railLight), 1);
        wg.fillCircle((px - 0.03) * P, (py - 0.03) * P, 0.035 * P);
      }
      // Толстые столбы через 2 м
      for (let k = 0; k <= len + 0.001; k += 2) {
        const px = horizontal ? rr.x0 + Math.min(k, len) : (rr.x0 + rr.x1) / 2;
        const py = horizontal ? (rr.y0 + rr.y1) / 2 : rr.y0 + Math.min(k, len);
        wg.fillStyle(hex(C.wallInk), 1);
        wg.fillRect((px - 0.13) * P, (py - 0.13) * P, 0.26 * P, 0.26 * P);
      }
    }
  }
}

export function buildGround(scene: Phaser.Scene): void {
  const g = scene.make.graphics({}, false);
  const r = rnd(2024);

  // Вне территории: светлый камень и луговые пятна
  rect(g, { x0: -6, y0: -6, x1: W + 6, y1: H + 6 }, C.stone);
  for (let i = 0; i < 26; i++) {
    const x = r() * W;
    const y = r() < 0.5 ? r() * 2 : H - r() * 2;
    ell(g, x, y, 2 + r() * 3, 1 + r() * 1.5, C.grass, 0.55);
  }
  for (let i = 0; i < 12; i++) {
    const x = r() < 0.5 ? r() * 2 : W - r() * 2;
    ell(g, x, r() * H, 1 + r() * 1.5, 2 + r() * 3, C.grass, 0.55);
  }
  for (let i = 0; i < 90; i++) {
    const x = r() * W;
    const y = r() < 0.5 ? r() * 1.8 : H - r() * 1.8;
    g.lineStyle(0.05 * P, hex(C.tuft), 0.7);
    for (const dx of [-0.07, 0, 0.07]) g.lineBetween((x + dx) * P, y * P, (x + dx * 1.8) * P, (y - 0.16 - Math.abs(dx)) * P);
  }
  drawPaddock(g, r);
  drawBarn(g, r);
  drawService(g, r);

  const sh = scene.make.graphics({}, false);
  drawShadows(sh);
  const wg = scene.make.graphics({}, false);
  drawWalls(wg);

  // Запекаем грунт, тени и стены в одну текстуру: каждый кадр рисуется одна картинка
  const k = bakeScale(scene);
  const M = 6;
  const rt = scene.add.renderTexture(-M * P, -M * P, (W + M * 2) * P * k, (H + M * 2) * P * k).setOrigin(0).setScale(1 / k).setDepth(D.ground);
  for (const layer of [g, sh, wg]) {
    layer.setScale(k);
    rt.draw(layer, M * P * k, M * P * k);
  }

  // Природа на выгуле: камни, бревно; деревья — кроной над всеми
  BOULDERS.forEach((b, i) => {
    placeImage(scene, `boulder-${i}`, b.x + 0.18, b.y + 0.22, D.decor).setTint(0x2c302e).setAlpha(0.18);
    placeImage(scene, `boulder-${i}`, b.x, b.y, D.station);
  });
  const lx = (LOG.x0 + LOG.x1) / 2;
  const ly = (LOG.y0 + LOG.y1) / 2;
  placeImage(scene, 'log', lx, ly, D.station).setRotation(Math.atan2(LOG.y1 - LOG.y0, LOG.x1 - LOG.x0));
  const trunks = scene.add.graphics().setDepth(D.station);
  for (const t of TREES) {
    trunks.fillStyle(hex(C.bark), 1);
    trunks.fillCircle(t.x * P, t.y * P, t.trunk * P);
    trunks.lineStyle(0.05 * P, hex(C.ink), 1);
    trunks.strokeCircle(t.x * P, t.y * P, t.trunk * P);
  }
  for (const layer of [g, sh, wg]) layer.destroy();

  // Деревья и кусты вокруг территории — рамка картины
  const outer = rnd(77);
  const ring: { x: number; y: number }[] = [];
  for (let x = 1; x < W; x += 3.6 + outer() * 2.4) ring.push({ x, y: 0.2 + outer() * 0.4 }, { x: x + 1.4, y: H + 0.4 + outer() * 0.5 });
  for (let y = 4; y < H - 3; y += 3.8 + outer() * 2.4) ring.push({ x: 0.1 + outer() * 0.3, y }, { x: W - 0.1 - outer() * 0.3, y: y + 1.2 });
  for (const p of ring) {
    const key = outer() < 0.5 ? 'canopy-small-a' : 'canopy-small-b';
    placeImage(scene, 'canopy-shadow-small', p.x + 0.5, p.y + 0.6, D.canopy - 1);
    placeImage(scene, key, p.x, p.y, D.canopy).setRotation(outer() * 6);
  }

  // Мебель и оборудование
  const mid = (id: StationId) => {
    const rr = STATIONS[id].rect!;
    return { x: (rr.x0 + rr.x1) / 2, y: (rr.y0 + rr.y1) / 2 };
  };
  placeImage(scene, 'st-drain', DRAIN.x, DRAIN.y, D.floor + 0.5);
  placeImage(scene, 'st-training', 26.75, 29.55, D.station);
  placeImage(scene, 'st-desk', mid('desk').x, mid('desk').y, D.station);
  placeImage(scene, 'st-lockers', 2.75, 37.6, D.station);
  placeImage(scene, 'st-shelf', mid('vegShelf').x, mid('vegShelf').y, D.station).setScale((1 / 3) * 0.9);
  placeImage(scene, 'st-prep', mid('prepTable').x, mid('prepTable').y, D.station);
  placeImage(scene, 'st-fridge', mid('fridge').x, mid('fridge').y, D.station);
  placeImage(scene, 'st-tubrack', mid('tubRack').x, mid('tubRack').y, D.station);
  placeImage(scene, 'st-porridge', mid('porridgeStation').x, mid('porridgeStation').y, D.station);
  placeImage(scene, 'st-sink', mid('kitchenSink').x, mid('kitchenSink').y, D.station);
  placeImage(scene, 'st-sink', mid('washSink').x, mid('washSink').y, D.station);
  placeImage(scene, 'st-cabinet', mid('cabinet').x, mid('cabinet').y, D.station);
  placeImage(scene, 'st-bamboo', mid('bambooPile').x, mid('bambooPile').y, D.station);
  placeImage(scene, 'st-sawdust', mid('sawdustPile').x, mid('sawdustPile').y, D.station);
  placeImage(scene, 'st-toolboard', mid('toolRack').x, mid('toolRack').y, D.station);
  placeImage(scene, 'st-panel', mid('gatePanel').x, mid('gatePanel').y, D.station).setScale((1 / 3) * 0.8);
  placeImage(scene, 'st-reel', mid('hoseReel').x, mid('hoseReel').y, D.station);
  placeImage(scene, 'st-container', mid('container').x, mid('container').y, D.station);
  placeImage(scene, 'st-bench', 44, 31.5, D.station);
  for (const p of [
    { x: 3, y: 20.9 },
    { x: 15.5, y: 32.5 },
    { x: 33.5, y: 31.6 },
    { x: 45.2, y: 24 },
  ]) {
    placeImage(scene, 'st-lamp', p.x, p.y, D.station);
  }

  // Таблички: на свету и над проходом, чтобы ничто не перекрывало
  const signs: [string, number, number][] = [
    ['Выгул', 24, 2.75],
    ['Западное стойло', 15, 20.95],
    ['Восточное стойло', 25, 20.95],
    ['Проход кипера', 20, 32.35],
    ...ROOMS.map((rm) => [rm.label, (rm.rect.x0 + rm.rect.x1) / 2 + (rm.id === 'duty' ? 1.6 : rm.id === 'store' ? -1.4 : rm.id === 'kitchen' ? -2.2 : 0), rm.rect.y0 + 0.85] as [string, number, number]),
    ['Хоздвор', 6, 29.2],
    ['Двор', 37, 29.2],
  ];
  SIGNS.length = 0;
  signs.forEach(([text, x, y], i) => {
    addArt(scene, `sign-${i}`, roomSign(text));
    SIGNS.push(placeImage(scene, `sign-${i}`, x, y, D.wall + 2).setScale(SIGN_SCALE));
  });
}

// Таблички — сцена подстраивает их размер под зум (см. labels.ts)
export const SIGN_SCALE = 0.3;
export const SIGNS: Phaser.GameObjects.Image[] = [];

export function isOutdoor(x: number, y: number): boolean {
  return !inRect(BARN, x, y) && !ROOMS.some((r) => inRect(r.rect, x, y));
}
