// Неподвижная часть карты: грунты, стены, ограды, мебель и надписи.

import Phaser from 'phaser';
import {
  BARN,
  BEDDING,
  BOULDERS,
  DRAIN,
  DUST_PIT,
  GRASS_PATCHES,
  H,
  LOG,
  PADDOCK,
  POOL,
  ROOMS,
  SOLIDS,
  STATIONS,
  TREES,
  W,
  YARDS,
  inEllipse,
  inRect,
  type Rect,
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

  // Выгул: песок, травяные куртины, пылевая яма, бассейн с пологим берегом
  rect(g, PADDOCK, C.sand, 1, 0.6);
  for (const p of GRASS_PATCHES) {
    ell(g, p.x, p.y, p.rx + 0.35, p.ry + 0.3, shade(C.grass, 0.25), 0.7);
    ell(g, p.x, p.y, p.rx, p.ry, C.grass);
  }
  ell(g, DUST_PIT.x, DUST_PIT.y, DUST_PIT.rx + 0.3, DUST_PIT.ry + 0.25, C.sandDark, 0.7);
  ell(g, DUST_PIT.x, DUST_PIT.y, DUST_PIT.rx, DUST_PIT.ry, C.dust);
  ell(g, POOL.x, POOL.y, POOL.rx + 0.9, POOL.ry + 0.75, '#d8c79d');
  ell(g, POOL.x, POOL.y, POOL.rx + 0.35, POOL.ry + 0.3, shade(C.sandDark, -0.05));

  // Песчинки и камешки на выгуле, пучки травы на куртинах
  for (let i = 0; i < 420; i++) {
    const x = PADDOCK.x0 + 0.4 + r() * (PADDOCK.x1 - PADDOCK.x0 - 0.8);
    const y = PADDOCK.y0 + 0.4 + r() * (PADDOCK.y1 - PADDOCK.y0 - 0.8);
    if (inEllipse(POOL, x, y, 0.8)) continue;
    const grassy = GRASS_PATCHES.some((p) => inEllipse(p, x, y));
    if (grassy) {
      g.lineStyle(0.05 * P, hex(C.tuft), 0.85);
      for (const dx of [-0.07, 0, 0.07]) g.lineBetween((x + dx) * P, y * P, (x + dx * 1.8) * P, (y - 0.16 - Math.abs(dx)) * P);
    } else if (r() < 0.55) {
      g.fillStyle(hex(r() < 0.5 ? C.sandDark : shade(C.sandDark, -0.12)), 0.8);
      g.fillCircle(x * P, y * P, (0.035 + r() * 0.05) * P);
    }
  }
  // Пучки травы и за оградой
  for (let i = 0; i < 90; i++) {
    const x = r() * W;
    const y = r() < 0.5 ? r() * 1.8 : H - r() * 1.8;
    g.lineStyle(0.05 * P, hex(C.tuft), 0.7);
    for (const dx of [-0.07, 0, 0.07]) g.lineBetween((x + dx) * P, y * P, (x + dx * 1.8) * P, (y - 0.16 - Math.abs(dx)) * P);
  }

  // Слоновник: бетон и основа подстилки
  rect(g, BARN, C.concrete);
  rect(g, BEDDING, '#d8c59c');
  g.lineStyle(0.03 * P, hex(C.concreteDark), 1);
  for (let x = BEDDING.x1 + 2; x < BARN.x1; x += 2) g.lineBetween(x * P, BARN.y0 * P, x * P, BARN.y1 * P);
  g.lineBetween(BARN.x0 * P, (BEDDING.y1 + 1.5) * P, BARN.x1 * P, (BEDDING.y1 + 1.5) * P);
  ell(g, DRAIN.x, DRAIN.y, DRAIN.r, DRAIN.r * 0.75, C.concreteDark, 0.6);

  // Дворы, коридор и помещения
  for (const y of YARDS) {
    rect(g, y.rect, y.floor === 'gravel' ? C.gravel : C.concrete);
    if (y.floor === 'gravel') {
      for (let i = 0; i < ((y.rect.x1 - y.rect.x0) * (y.rect.y1 - y.rect.y0)) / 2.2; i++) {
        g.fillStyle(hex(shade(C.gravel, -0.12 - r() * 0.08)), 0.9);
        g.fillCircle((y.rect.x0 + r() * (y.rect.x1 - y.rect.x0)) * P, (y.rect.y0 + r() * (y.rect.y1 - y.rect.y0)) * P, (0.04 + r() * 0.05) * P);
      }
    } else {
      g.lineStyle(0.03 * P, hex(C.concreteDark), 1);
      for (let x = y.rect.x0 + 3; x < y.rect.x1; x += 3) g.lineBetween(x * P, y.rect.y0 * P, x * P, y.rect.y1 * P);
    }
  }
  for (const room of ROOMS) {
    const fill = room.floor === 'wood' ? C.floorWood : room.floor === 'tile' ? C.floorTile : C.concrete;
    rect(g, room.rect, fill);
    g.lineStyle(0.025 * P, hex(shade(fill, -0.1)), 1);
    if (room.floor === 'wood') {
      for (let y = room.rect.y0 + 0.5; y < room.rect.y1; y += 0.5) g.lineBetween(room.rect.x0 * P, y * P, room.rect.x1 * P, y * P);
    } else if (room.floor === 'tile') {
      for (let x = room.rect.x0 + 1; x < room.rect.x1; x += 1) g.lineBetween(x * P, room.rect.y0 * P, x * P, room.rect.y1 * P);
      for (let y = room.rect.y0 + 1; y < room.rect.y1; y += 1) g.lineBetween(room.rect.x0 * P, y * P, room.rect.x1 * P, y * P);
    } else {
      for (let x = room.rect.x0 + 2.5; x < room.rect.x1; x += 2.5) g.lineBetween(x * P, room.rect.y0 * P, x * P, room.rect.y1 * P);
    }
  }

  // Тени от стен и оград (свет сверху-слева)
  const sh = scene.make.graphics({}, false);
  sh.fillStyle(hex(C.ink), 0.1);
  for (const s of SOLIDS) {
    if (s.kind !== 'wall') continue;
    const o = 0.22;
    sh.fillRect((s.rect.x0 + o) * P, (s.rect.y0 + o) * P, (s.rect.x1 - s.rect.x0) * P, (s.rect.y1 - s.rect.y0) * P);
  }

  // Стены: светлое тело и тёмный контур; ограды — деревянные жерди; решётка — сталь
  const wg = scene.make.graphics({}, false);
  for (const s of SOLIDS) {
    const rr = s.rect;
    const x = rr.x0 * P;
    const y = rr.y0 * P;
    const w = (rr.x1 - rr.x0) * P;
    const h = (rr.y1 - rr.y0) * P;
    if (s.kind === 'wall') {
      wg.fillStyle(hex(C.paper), 1);
      wg.fillRect(x, y, w, h);
      wg.lineStyle(0.05 * P, hex(C.ink), 1);
      wg.strokeRect(x, y, w, h);
    } else if (s.kind === 'fence') {
      wg.fillStyle(hex(C.wood), 1);
      wg.fillRect(x, y, w, h);
      wg.lineStyle(0.04 * P, hex(C.woodDark), 1);
      wg.strokeRect(x, y, w, h);
      const horizontal = w > h;
      const len = horizontal ? rr.x1 - rr.x0 : rr.y1 - rr.y0;
      wg.fillStyle(hex(C.woodDark), 1);
      for (let k = 0; k <= len; k += 2) {
        const px = horizontal ? rr.x0 + k : (rr.x0 + rr.x1) / 2;
        const py = horizontal ? (rr.y0 + rr.y1) / 2 : rr.y0 + k;
        wg.fillRect((px - 0.17) * P, (py - 0.17) * P, 0.34 * P, 0.34 * P);
      }
    } else if (s.kind === 'barrier') {
      wg.fillStyle(hex(C.metal), 1);
      wg.fillRect(x, y + h * 0.25, w, h * 0.5);
      wg.fillStyle(hex(C.metalDark), 1);
      for (let k = rr.x0; k <= rr.x1; k += 0.45) wg.fillCircle(k * P, (y + h / 2), 0.09 * P);
      wg.lineStyle(0.03 * P, hex(C.ink), 1);
      wg.lineBetween(x, y + h * 0.25, x + w, y + h * 0.25);
      wg.lineBetween(x, y + h * 0.75, x + w, y + h * 0.75);
    }
  }

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
  const st = STATIONS;
  const mid = (id: keyof typeof STATIONS) => {
    const rr = st[id].rect!;
    return { x: (rr.x0 + rr.x1) / 2, y: (rr.y0 + rr.y1) / 2 };
  };
  placeImage(scene, 'st-drain', DRAIN.x, DRAIN.y, D.floor + 0.5);
  const desk = mid('desk');
  placeImage(scene, 'st-desk', desk.x, desk.y, D.station);
  placeImage(scene, 'st-lockers', 2.75, 37.6, D.station);
  const shelf = mid('shelf');
  placeImage(scene, 'st-shelf', shelf.x, shelf.y, D.station);
  const prep = mid('prepTable');
  placeImage(scene, 'st-prep', prep.x, prep.y, D.station);
  const fridge = mid('fridge');
  placeImage(scene, 'st-fridge', fridge.x, fridge.y, D.station);
  const board = mid('toolRack');
  placeImage(scene, 'st-toolboard', board.x, board.y, D.station);
  placeImage(scene, 'st-panel', mid('gateControl').x, mid('gateControl').y, D.station);
  placeImage(scene, 'st-reel', mid('hoseReel').x, mid('hoseReel').y, D.station);
  placeImage(scene, 'st-container', mid('container').x, mid('container').y, D.station);
  placeImage(scene, 'st-bench', 44, 31.5, D.station);
  for (const p of [
    { x: 3, y: 20.9 },
    { x: 15.5, y: 31.6 },
    { x: 33.5, y: 31.6 },
    { x: 45.2, y: 24 },
  ]) {
    placeImage(scene, 'st-lamp', p.x, p.y, D.station);
  }

  // Таблички
  const signs: [string, number, number][] = [
    ['Выгул', 24, 2.0],
    ['Слоновник', 27.6, 29.05],
    ...ROOMS.map((rm) => [rm.label, (rm.rect.x0 + rm.rect.x1) / 2, rm.rect.y1 - 0.75] as [string, number, number]),
    ['Хоздвор', 6, 30.0],
    ['Двор', 38, 30.0],
  ];
  signs.forEach(([text, x, y], i) => {
    addArt(scene, `sign-${i}`, roomSign(text));
    placeImage(scene, `sign-${i}`, x, y, D.decor + 0.5).setScale(0.28);
  });
}

export function isOutdoor(x: number, y: number): boolean {
  return !inRect(BARN, x, y) && !ROOMS.some((r) => inRect(r.rect, x, y));
}
