// Изменчивая часть мира: подстилка, сор, опилки, мокрое; корм, вода и тазы; навоз, вещи, тачка,
// шланг на полу, ворота и двери, яблоки на деревьях, свет.

import Phaser from 'phaser';
import { DOORS, DRUM, FEEDER_IDS, GATES, H, HOSE_REEL, POOL, STATIONS, TIRE, TOOL_KINDS, TOOL_SLOTS, TREES, TROUGH_IDS, W, BALL_START } from '../data/facility';
import { VEG_KINDS, type VegKind } from '../data/rations';
import { cellCenter, darkness, doorUnlocked, fruitStage, isBeddingCell, tubKg, type State, type Tub } from '../sim';
import { rnd } from './art';
import { bakeScale, D } from './ground';
import { C, hex, mix } from './palette';
import { placeImage, PPM, ART_SCALE } from './textures';

const P = PPM;

const VEG_COLOR: Record<VegKind, string> = {
  potato: '#c8a36a',
  carrot: '#e0812f',
  beet: '#8a2f4a',
  pumpkin: '#e39a3a',
  zucchini: '#7f9f4e',
  cabbage: '#a6c27a',
  pepper: '#cf4a36',
  eggplant: '#5b3a6b',
  apple: '#c8463a',
};

export class WorldView {
  private floor: Phaser.GameObjects.Graphics;
  private floorRT: Phaser.GameObjects.RenderTexture;
  private floorK: number;
  private floorVersion = -1;
  private levels: Phaser.GameObjects.Graphics;
  private water: Phaser.GameObjects.Graphics;
  private gates: Phaser.GameObjects.Graphics;
  private hose: Phaser.GameObjects.Graphics;
  private tubFill: Phaser.GameObjects.Graphics;
  private apples: Phaser.GameObjects.Graphics;
  private gateK: Record<string, number> = { outer: 0, shift: 1 };
  private dung = new Map<number, Phaser.GameObjects.Image>();
  private food = new Map<number, Phaser.GameObjects.Image>();
  private items = new Map<number, Phaser.GameObjects.Image>();
  private tubs = new Map<number, Phaser.GameObjects.Image>();
  private stacks: Record<'hay' | 'straw' | 'browse' | 'bamboo' | 'sawdust', Phaser.GameObjects.Image[]> = { hay: [], straw: [], browse: [], bamboo: [], sawdust: [] };
  private tools: Record<string, Phaser.GameObjects.Image> = {};
  private ball: Phaser.GameObjects.Image;
  private ballShadow: Phaser.GameObjects.Image;
  private ballRot = 0;
  private barrow: Phaser.GameObjects.Image;
  private barrowLoad: Phaser.GameObjects.Image;
  private barrowShadow: Phaser.GameObjects.Image;
  private barrowCargo: Phaser.GameObjects.Image[] = [];
  private valves: Record<string, Phaser.GameObjects.Image> = {};
  private canopies: { id: string; img: Phaser.GameObjects.Image; x: number; y: number; r: number; shake: number }[] = [];
  private tire: Phaser.GameObjects.Image;
  private night: Phaser.GameObjects.Rectangle;
  private lights: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene) {
    // Пол рисуется векторно, но запекается в текстуру — только когда он меняется
    this.floor = scene.make.graphics({}, false);
    this.floorK = bakeScale(scene);
    this.floorRT = scene.add.renderTexture(0, 0, W * P * this.floorK, H * P * this.floorK).setOrigin(0).setScale(1 / this.floorK).setDepth(D.floor);
    this.water = scene.add.graphics().setDepth(D.floor + 1);
    this.levels = scene.add.graphics().setDepth(D.stationDyn);
    this.tubFill = scene.add.graphics().setDepth(D.waste + 0.6);
    this.apples = scene.add.graphics().setDepth(D.canopy + 0.5);
    this.gates = scene.add.graphics().setDepth(D.wall + 1);
    this.hose = scene.add.graphics().setDepth(D.waste + 0.4);

    const mid = (id: keyof typeof STATIONS) => {
      const r = STATIONS[id].rect!;
      return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
    };
    for (const id of ['barnRackW', 'barnRackE'] as const) {
      placeImage(scene, 'st-rack-barn', mid(id).x, mid(id).y, D.station);
      placeImage(scene, 'st-rack-barn-slats', mid(id).x, mid(id).y, D.stationDyn + 0.5);
    }
    placeImage(scene, 'st-rack-paddock', mid('paddockFeeder').x, mid('paddockFeeder').y, D.station);
    placeImage(scene, 'st-rack-paddock-slats', mid('paddockFeeder').x, mid('paddockFeeder').y, D.stationDyn + 0.5);
    placeImage(scene, 'st-trough-barnW', mid('barnWaterW').x, mid('barnWaterW').y, D.station);
    placeImage(scene, 'st-trough-barnE', mid('barnWaterE').x, mid('barnWaterE').y, D.station);
    placeImage(scene, 'st-trough-paddock', mid('paddockWater').x, mid('paddockWater').y, D.station);
    for (const id of TROUGH_IDS) {
      const v = STATIONS[id].valve!;
      this.valves[id] = placeImage(scene, 'st-valve-closed', v.x, v.y, D.station + 0.1);
    }
    this.valves.pool = placeImage(scene, 'st-valve-closed', 44.5, 20.4, D.station + 0.1);

    // Склад: тюки, ветки, бамбук, опилки — столько, сколько есть
    const r = rnd(5);
    for (let i = 0; i < 20; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      this.stacks.hay.push(placeImage(scene, 'item-hay', 36.6 + col * 0.82, 39.3 - row * 0.5 - (r() - 0.5) * 0.05, D.station + row * 0.01).setRotation((r() - 0.5) * 0.08));
      this.stacks.straw.push(placeImage(scene, 'item-straw', 41.0 + col * 0.82, 39.3 - row * 0.5, D.station + row * 0.01).setRotation((r() - 0.5) * 0.08));
    }
    for (let i = 0; i < 8; i++) this.stacks.browse.push(placeImage(scene, 'item-browse', 45.2, 33.9 + i * 0.36, D.station + i * 0.01).setRotation(Math.PI / 2 + (r() - 0.5) * 0.3).setScale(ART_SCALE * 0.8));
    for (let i = 0; i < 6; i++) this.stacks.bamboo.push(placeImage(scene, 'item-bamboo', 36.2 + (i % 3) * 0.7, 33.7 + Math.floor(i / 3) * 0.25, D.station + 0.1 + i * 0.01).setScale(ART_SCALE * 0.7));
    for (let i = 0; i < 6; i++) this.stacks.sawdust.push(placeImage(scene, 'item-sawdust', 41.5 + (i % 3) * 0.6, 33.7 + Math.floor(i / 3) * 0.3, D.station + 0.1 + i * 0.01).setScale(ART_SCALE * 0.75));

    for (const t of TOOL_KINDS) this.tools[t] = placeImage(scene, `item-${t}`, TOOL_SLOTS[t].x, TOOL_SLOTS[t].y - 0.6, D.station + 0.2).setRotation(Math.PI / 2);
    this.ballShadow = placeImage(scene, 'shadow-ball', BALL_START.x, BALL_START.y, D.shadow);
    this.ball = placeImage(scene, 'ball', BALL_START.x, BALL_START.y, D.actor - 0.2);
    placeImage(scene, 'drum', DRUM.x, DRUM.y, D.station);
    this.tire = placeImage(scene, 'tire', TIRE.x, TIRE.y, D.actor + 0.5);
    this.barrowShadow = placeImage(scene, 'shadow-barrow', 0, 0, D.shadow);
    this.barrow = placeImage(scene, 'barrow', 0, 0, D.actor);
    this.barrowLoad = placeImage(scene, 'barrow-load', 0, 0, D.actor + 0.001);
    for (let i = 0; i < 3; i++) this.barrowCargo.push(placeImage(scene, 'item-hay', 0, 0, D.actor + 0.002).setVisible(false));
    for (const t of TREES) {
      placeImage(scene, `canopy-shadow-${t.id}`, t.x + 0.7, t.y + 0.9, D.canopy - 1);
      this.canopies.push({ id: t.id, img: placeImage(scene, `canopy-${t.id}`, t.x, t.y, D.canopy), x: t.x, y: t.y, r: t.canopy, shake: 0 });
    }
    this.night = scene.add.rectangle(-20 * P, -20 * P, (W + 40) * P, (H + 40) * P, hex('#1d2a36'), 0).setOrigin(0).setDepth(D.night);
    for (const l of [
      { x: 3, y: 20.9, r: 2.2 },
      { x: 15.5, y: 32.5, r: 2.2 },
      { x: 33.5, y: 31.6, r: 2.2 },
      { x: 45.2, y: 24, r: 2.2 },
      { x: 15, y: 24.5, r: 3.2 },
      { x: 25, y: 24.5, r: 3.2 },
    ]) {
      this.lights.push(placeImage(scene, 'glow', l.x, l.y, D.light).setBlendMode(Phaser.BlendModes.ADD).setScale(ART_SCALE * l.r).setAlpha(0));
    }
  }

  // Слон трясёт дерево — крона качается
  shakeTree(x: number, y: number): void {
    const c = this.canopies.find((q) => Math.hypot(q.x - x, q.y - y) < 1);
    if (c) c.shake = 1;
  }

  update(s: State, time: number, dt: number): void {
    const w = s.world;
    if (w.cellsVersion !== this.floorVersion) {
      this.floorVersion = w.cellsVersion;
      this.drawFloor(s);
    }
    this.drawLevels(s, time);
    this.drawPool(s, time);
    this.drawGates(s, dt);
    this.drawHose(s);
    this.syncDung(s);
    this.syncFood(s);
    this.syncItems(s);
    this.syncTubs(s);
    for (const k of ['hay', 'straw', 'browse', 'bamboo', 'sawdust'] as const) {
      const n = w.stock[k];
      this.stacks[k].forEach((im, i) => im.setVisible(i < n));
    }
    for (const t of TOOL_KINDS) this.tools[t].setVisible(w.tools[t]);
    for (const id of TROUGH_IDS) this.valves[id].setTexture(w.troughs[id].valve ? 'st-valve-open' : 'st-valve-closed');
    this.valves.pool.setTexture(w.pool.valve ? 'st-valve-open' : 'st-valve-closed');

    // Мяч катится и крутится
    const b = w.ball;
    this.ballRot += Math.hypot(b.vx, b.vy) * dt * 1.5 * Math.sign(b.vx || 1);
    this.ball.setPosition(b.x * P, b.y * P).setRotation(this.ballRot).setDepth(D.actor + b.y / 100 - 0.002);
    this.ballShadow.setPosition((b.x + 0.15) * P, (b.y + 0.22) * P);
    // Покрышка качается, когда с ней играют
    const playing = s.elephants.some((e) => e.act.kind === 'play' && e.act.phase === 'do' && e.act.target?.t === 'obj' && e.act.target.id === 'tire');
    this.tire.setRotation(playing ? Math.sin(time * 4) * 0.4 : Math.sin(time * 0.5) * 0.05).setScale(ART_SCALE * (playing ? 1 + Math.sin(time * 4) * 0.05 : 1));

    const br = w.barrow;
    this.barrow.setPosition(br.x * P, br.y * P).setRotation(br.heading).setDepth(D.actor + br.y / 100);
    this.barrowShadow.setPosition((br.x + 0.15) * P, (br.y + 0.2) * P).setRotation(br.heading);
    this.barrowLoad
      .setVisible(br.load > 0)
      .setPosition((br.x - Math.cos(br.heading) * 0.05) * P, (br.y - Math.sin(br.heading) * 0.05) * P)
      .setRotation(br.heading)
      .setScale(ART_SCALE * (0.5 + 0.5 * Math.min(1, br.load / 12)))
      .setDepth(D.actor + br.y / 100 + 0.0005);
    this.barrowCargo.forEach((im, i) => {
      const c = br.cargo[i];
      if (!c) {
        im.setVisible(false);
        return;
      }
      const key = c.kind === 'tub' ? `tub-${c.owner}` : c.kind === 'tank' ? (c.load > 0 ? 'item-tank-full' : 'item-tank') : c.kind === 'porridge' ? 'item-porridge' : `item-${c.kind}`;
      const off = (i - (br.cargo.length - 1) / 2) * 0.32;
      const cx = br.x - Math.cos(br.heading) * 0.1 + Math.cos(br.heading + Math.PI / 2) * off;
      const cy = br.y - Math.sin(br.heading) * 0.1 + Math.sin(br.heading + Math.PI / 2) * off;
      if (this.scene.textures.exists(key) && im.texture.key !== key) im.setTexture(key);
      im.setVisible(true)
        .setPosition(cx * P, cy * P)
        .setRotation(br.heading)
        .setScale(ART_SCALE * (c.kind === 'tub' ? 0.6 : 0.62))
        .setDepth(D.actor + br.y / 100 + 0.001 + i * 0.0001);
    });

    // Кроны прозрачнеют, когда под ними кто-то есть; трясут — качаются
    for (const c of this.canopies) {
      const under = Math.hypot(s.keeper.x - c.x, s.keeper.y - c.y) < c.r + 0.3 || s.elephants.some((e) => Math.hypot(e.x - c.x, e.y - c.y) < c.r + 0.8);
      const target = under ? 0.42 : 1;
      c.img.setAlpha(c.img.alpha + (target - c.img.alpha) * Math.min(1, dt * 4));
      c.shake = Math.max(0, c.shake - dt * 0.8);
      c.img.setPosition((c.x + Math.sin(time * 22) * 0.12 * c.shake) * P, (c.y + Math.cos(time * 19) * 0.08 * c.shake) * P);
    }

    // Сумерки и ночь, фонари
    const dark = darkness(s.t);
    this.night.setFillStyle(hex('#1d2a36'), dark * 0.5);
    for (const l of this.lights) l.setAlpha(dark * 0.55);
  }

  // Подстилка: солома прядками; моча — тёмные пятна; грязь — бурые разводы; сор — соломинки на бетоне; опилки — светлая стружка
  private drawFloor(s: State): void {
    const g = this.floor;
    g.clear();
    const c = s.world.cells;
    for (let i = 0; i < W * H; i++) {
      const p = cellCenter(i);
      const bed = isBeddingCell(i);
      if (bed) {
        const k = c.bedding[i];
        if (k > 0.02) {
          g.fillStyle(hex(mix(C.barnSand, C.strawBed, Math.min(1, k * 1.1))), 1);
          g.fillRect((p.x - 0.5) * P, (p.y - 0.5) * P, P, P);
          const r = rnd(i * 13 + 1);
          g.lineStyle(0.03 * P, hex(C.strawBedDark), 0.5 + 0.35 * k);
          const n = Math.round(6 * k);
          for (let j = 0; j < n; j++) {
            const x = p.x - 0.45 + r() * 0.9;
            const y = p.y - 0.45 + r() * 0.9;
            const a = r() * Math.PI;
            g.lineBetween(x * P, y * P, (x + Math.cos(a) * 0.32) * P, (y + Math.sin(a) * 0.32) * P);
          }
        }
      }
      const litter = c.litter[i];
      if (litter > 0.04 && !bed) {
        const r = rnd(i * 17 + 9);
        const n = Math.min(9, Math.round(litter * 12));
        for (let j = 0; j < n; j++) {
          const x = p.x - 0.45 + r() * 0.9;
          const y = p.y - 0.45 + r() * 0.9;
          const a = r() * Math.PI;
          g.lineStyle(0.03 * P, hex(r() < 0.5 ? C.hay : C.strawDark), 0.9);
          g.lineBetween(x * P, y * P, (x + Math.cos(a) * 0.3) * P, (y + Math.sin(a) * 0.3) * P);
        }
      }
      const saw = c.sawdust[i];
      if (saw > 0.04) {
        const r = rnd(i * 23 + 5);
        g.fillStyle(hex('#efe0bd'), 0.55 * saw + 0.2);
        g.fillEllipse(p.x * P, p.y * P, 0.95 * P, 0.85 * P, 18);
        g.fillStyle(hex('#c9ad78'), 0.8);
        for (let j = 0; j < 7; j++) g.fillEllipse((p.x - 0.4 + r() * 0.8) * P, (p.y - 0.4 + r() * 0.8) * P, 0.08 * P, 0.04 * P, 8);
      }
      const wet = c.wet[i];
      if (wet > 0.04) {
        const r = rnd(i * 7 + 3);
        const color = bed ? '#8e6d33' : p.y < 20 ? '#7d7a52' : '#7a8088';
        g.fillStyle(hex(color), Math.min(0.55, wet * (saw > 0.1 ? 0.25 : 0.5)));
        g.fillEllipse((p.x + (r() - 0.5) * 0.3) * P, (p.y + (r() - 0.5) * 0.3) * P, (0.9 + r() * 0.5) * P, (0.75 + r() * 0.4) * P, 20);
      }
      const soil = c.soil[i];
      if (soil > 0.04) {
        const r = rnd(i * 11 + 5);
        g.fillStyle(hex(C.dung), Math.min(0.6, soil * 0.6));
        for (let j = 0; j < 3; j++) g.fillEllipse((p.x - 0.35 + r() * 0.7) * P, (p.y - 0.35 + r() * 0.7) * P, (0.35 + r() * 0.3) * P, (0.25 + r() * 0.2) * P, 14);
      }
    }
    g.setScale(this.floorK);
    this.floorRT.clear();
    this.floorRT.draw(g, 0, 0);
  }

  private drawLevels(s: State, time: number): void {
    const g = this.levels;
    g.clear();
    const w = s.world;
    // Сено и солома в яслях: сено — плотное, солома — светлыми прядями сверху
    for (const id of FEEDER_IDS) {
      const r = STATIONS[id].rect!;
      const f = w.feeders[id];
      const inset = 0.14;
      const rr = rnd(id.length * 31);
      const kh = Math.min(1, f.hay / 100);
      if (kh > 0.01) {
        const width = (r.x1 - r.x0 - inset * 2) * (0.3 + 0.7 * kh);
        const x0 = (r.x0 + r.x1) / 2 - width / 2;
        g.fillStyle(hex(C.hay), 1);
        g.fillRoundedRect(x0 * P, (r.y0 + inset) * P, width * P, (r.y1 - r.y0 - inset * 2) * P, 0.1 * P);
        g.lineStyle(0.025 * P, hex(C.hayDark), 0.9);
        for (let i = 0; i < 14 * kh + 3; i++) {
          const x = x0 + rr() * width;
          const y = r.y0 + inset + rr() * (r.y1 - r.y0 - inset * 2);
          g.lineBetween(x * P, y * P, (x + 0.25) * P, (y + (rr() - 0.5) * 0.1) * P);
        }
      }
      const ks = Math.min(1, f.straw / 60);
      if (ks > 0.01) {
        g.lineStyle(0.03 * P, hex(C.straw), 1);
        for (let i = 0; i < 20 * ks + 2; i++) {
          const x = r.x0 + inset + rr() * (r.x1 - r.x0 - inset * 2);
          const y = r.y0 + inset + rr() * (r.y1 - r.y0 - inset * 2);
          g.lineBetween(x * P, y * P, (x + 0.3) * P, (y + (rr() - 0.5) * 0.14) * P);
        }
      }
    }
    // Поилки: уровень, сор, пена средства, отмытое дно, слив
    for (const id of TROUGH_IDS) {
      const r = STATIONS[id].rect!;
      const t = w.troughs[id];
      const inset = 0.13;
      const x = r.x0 + inset;
      const y = r.y0 + inset;
      const ww = r.x1 - r.x0 - inset * 2;
      const hh = r.y1 - r.y0 - inset * 2;
      const lvl = t.level / 100;
      if (lvl > 0.02) {
        const dirty = Math.min(1, t.debris);
        g.fillStyle(hex(mix(mix(C.waterHi, C.waterBlue, lvl), '#9a9a6a', dirty * 0.6)), 0.95);
        g.fillRoundedRect(x * P, y * P, ww * P, hh * P, 0.06 * P);
        g.lineStyle(0.02 * P, 0xffffff, 0.5);
        g.lineBetween((x + 0.1) * P, (y + 0.08) * P, (x + ww * 0.5) * P, (y + 0.08) * P);
        if (t.debris > 0.15) {
          const rr = rnd(id.length * 13);
          g.lineStyle(0.02 * P, hex(C.hayDark), 0.9);
          for (let i = 0; i < Math.round(t.debris * 14); i++) {
            const px = x + rr() * ww;
            const py = y + rr() * hh;
            g.lineBetween(px * P, py * P, (px + 0.16) * P, (py + (rr() - 0.5) * 0.08) * P);
          }
        }
        if (t.valve) {
          g.fillStyle(0xffffff, 0.6);
          const k = (time * 2) % 1;
          g.fillCircle((x + ww * k) * P, (y + hh * (1 - k)) * P, 0.06 * P);
        }
      }
      if (t.stage === 'chem' || t.chem > 0.05) {
        const rr = rnd(id.length * 17);
        g.fillStyle(0xffffff, 0.85);
        for (let i = 0; i < 10; i++) g.fillCircle((x + rr() * ww) * P, (y + rr() * hh) * P, (0.05 + rr() * 0.05) * P);
      }
      if (t.stage === 'scrubbed' || t.stage === 'rinsed') {
        g.lineStyle(0.03 * P, 0xffffff, 0.8);
        g.lineBetween((x + 0.1) * P, (y + hh * 0.3) * P, (x + ww * 0.6) * P, (y + hh * 0.3) * P);
      }
      if (t.drain) {
        const k = (time * 1.6) % 1;
        g.lineStyle(0.04 * P, hex(C.waterLight), 1 - k);
        g.strokeCircle((x + ww - 0.15) * P, (y + hh / 2) * P, (0.06 + k * 0.18) * P);
      }
    }
    // Кормовой барабан: огонёк, если в нём есть корм
    if (w.drum > 0.05) {
      g.fillStyle(hex(C.produceOrange), 1);
      g.fillCircle((DRUM.x + 0.45) * P, (DRUM.y - 0.4) * P, (0.06 + 0.04 * Math.min(1, w.drum / 4)) * P);
    }
    // Контейнер: уровень навоза
    const cr = STATIONS.container.rect!;
    const fill = Math.min(1, w.container / 80);
    if (fill > 0.01) {
      g.fillStyle(hex(C.dung), 1);
      g.fillRoundedRect((cr.x0 + 0.2) * P, (cr.y0 + 0.2 + (1 - fill) * (cr.y1 - cr.y0 - 0.4)) * P, (cr.x1 - cr.x0 - 0.4) * P, fill * (cr.y1 - cr.y0 - 0.4) * P, 0.06 * P);
    }
    // Двери кипера: металлическая рама, огонёк — можно войти (зелёный) или нет (терракотовый)
    for (const d of DOORS) {
      const ok = doorUnlocked(s, d);
      const horizontal = d.rect.x1 - d.rect.x0 > d.rect.y1 - d.rect.y0;
      g.fillStyle(hex(C.railDark), 1);
      if (horizontal) {
        g.fillRect((d.rect.x0 - 0.08) * P, (d.rect.y0 - 0.05) * P, 0.12 * P, (d.rect.y1 - d.rect.y0 + 0.1) * P);
        g.fillRect((d.rect.x1 - 0.04) * P, (d.rect.y0 - 0.05) * P, 0.12 * P, (d.rect.y1 - d.rect.y0 + 0.1) * P);
      } else {
        g.fillRect((d.rect.x0 - 0.05) * P, (d.rect.y0 - 0.08) * P, (d.rect.x1 - d.rect.x0 + 0.1) * P, 0.12 * P);
        g.fillRect((d.rect.x0 - 0.05) * P, (d.rect.y1 - 0.04) * P, (d.rect.x1 - d.rect.x0 + 0.1) * P, 0.12 * P);
      }
      g.fillStyle(hex(ok ? C.sageMid : C.terracotta), 1);
      g.fillCircle(d.light.x * P, d.light.y * P, 0.11 * P);
      g.lineStyle(0.025 * P, hex(C.ink), 1);
      g.strokeCircle(d.light.x * P, d.light.y * P, 0.11 * P);
      if (!ok) {
        g.lineStyle(0.08 * P, hex(C.railDark), 1);
        const cx = (d.rect.x0 + d.rect.x1) / 2;
        const cy = (d.rect.y0 + d.rect.y1) / 2;
        if (horizontal) g.lineBetween(d.rect.x0 * P, cy * P, d.rect.x1 * P, cy * P);
        else g.lineBetween(cx * P, d.rect.y0 * P, cx * P, d.rect.y1 * P);
      }
    }
    // Яблоки на деревьях — поверх кроны
    const ap = this.apples;
    ap.clear();
    for (const t of TREES) {
      const n = w.trees[t.id] ?? 0;
      if (!t.fruit || n <= 0) continue;
      const c = this.canopies.find((q) => q.id === t.id);
      const alpha = c ? c.img.alpha : 1;
      const ox = c ? c.img.x / P - t.x : 0;
      const oy = c ? c.img.y / P - t.y : 0;
      const rr = rnd(t.id.length * 101);
      for (let i = 0; i < n; i++) {
        const a = rr() * Math.PI * 2;
        const d = rr() * t.canopy * 0.75;
        ap.fillStyle(hex('#c8463a'), alpha);
        ap.fillCircle((t.x + ox + Math.cos(a) * d) * P, (t.y + oy + Math.sin(a) * d) * P, 0.1 * P);
        ap.lineStyle(0.02 * P, hex(C.ink), alpha * 0.8);
        ap.strokeCircle((t.x + ox + Math.cos(a) * d) * P, (t.y + oy + Math.sin(a) * d) * P, 0.1 * P);
      }
    }
  }

  private drawPool(s: State, time: number): void {
    const g = this.water;
    g.clear();
    const dirt = s.world.pool.dirt;
    const col = mix(C.water, C.waterDirty, Math.min(1, dirt * 1.3));
    g.fillStyle(hex(col), 1);
    g.fillEllipse(POOL.x * P, POOL.y * P, POOL.rx * 2 * P, POOL.ry * 2 * P, 64);
    g.fillStyle(hex(mix(C.waterLight, col, 0.4)), 0.6);
    g.fillEllipse((POOL.x - 0.4) * P, (POOL.y - 0.35) * P, (POOL.rx * 2 - 1.8) * P, (POOL.ry * 2 - 1.4) * P, 48);
    g.fillStyle(hex(col), 1);
    g.fillEllipse((POOL.x + 0.2) * P, (POOL.y + 0.2) * P, (POOL.rx * 2 - 2.6) * P, (POOL.ry * 2 - 2.0) * P, 48);
    g.lineStyle(0.07 * P, hex(C.ink), 1);
    g.strokeEllipse(POOL.x * P, POOL.y * P, POOL.rx * 2 * P, POOL.ry * 2 * P, 64);
    g.lineStyle(0.05 * P, 0xffffff, 0.55);
    for (let i = 0; i < 6; i++) {
      const ph = (time * 0.18 + i * 0.17) % 1;
      const x = POOL.x - POOL.rx * 0.6 + ph * POOL.rx * 1.2;
      const y = POOL.y - POOL.ry * 0.5 + (((i * 37) % 10) / 10) * POOL.ry;
      g.lineBetween(x * P, y * P, (x + 0.5) * P, y * P);
    }
    if (s.world.pool.valve) {
      const k = (time * 1.5) % 1;
      g.lineStyle(0.05 * P, hex(C.waterLight), 1 - k);
      g.strokeCircle((POOL.x + POOL.rx - 0.6) * P, (POOL.y + POOL.ry - 0.6) * P, (0.2 + k * 0.6) * P);
    }
  }

  // Сдвижные ворота: стальная створка уезжает в стену (между стойлами — вдоль решётки)
  private drawGates(s: State, dt: number): void {
    const g = this.gates;
    g.clear();
    for (const gate of GATES) {
      const target = s.world.gates[gate.id] ? 1 : 0;
      const k0 = this.gateK[gate.id] ?? target;
      const k = k0 + Math.sign(target - k0) * Math.min(Math.abs(target - k0), dt * 0.9);
      this.gateK[gate.id] = k;
      const r = gate.rect;
      if (!gate.vertical) {
        const shift = k * (r.x1 - r.x0 - 0.3);
        const x0 = r.x0 - shift;
        const x1 = r.x1 - shift;
        g.fillStyle(hex(C.railDark), 1);
        g.fillRect(x0 * P, (r.y0 + 0.05) * P, (x1 - x0) * P, (r.y1 - r.y0 - 0.1) * P);
        g.lineStyle(0.04 * P, hex(C.ink), 1);
        g.strokeRect(x0 * P, (r.y0 + 0.05) * P, (x1 - x0) * P, (r.y1 - r.y0 - 0.1) * P);
        g.fillStyle(hex(C.railLight), 1);
        for (let x = x0 + 0.25; x < x1; x += 0.5) g.fillRect((x - 0.05) * P, (r.y0 + 0.1) * P, 0.1 * P, (r.y1 - r.y0 - 0.2) * P);
        g.fillStyle(hex(s.world.gates[gate.id] ? C.sageMid : C.terracotta), 0.9);
        g.fillRect(r.x0 * P, (r.y1 + 0.12) * P, (r.x1 - r.x0) * P, 0.08 * P);
      } else {
        // Створка уезжает вдоль решётки на юг, за неподвижную секцию
        const shift = k * (r.y1 - r.y0 - 0.3);
        const y0 = r.y0 + shift;
        const y1 = r.y1 + shift;
        g.fillStyle(hex(C.railDark), 1);
        g.fillRect((r.x0 + 0.02) * P, y0 * P, (r.x1 - r.x0 - 0.04) * P, (y1 - y0) * P);
        g.lineStyle(0.04 * P, hex(C.ink), 1);
        g.strokeRect((r.x0 + 0.02) * P, y0 * P, (r.x1 - r.x0 - 0.04) * P, (y1 - y0) * P);
        g.fillStyle(hex(C.railLight), 1);
        for (let y = y0 + 0.25; y < y1; y += 0.5) g.fillRect((r.x0 + 0.06) * P, (y - 0.05) * P, (r.x1 - r.x0 - 0.12) * P, 0.1 * P);
        g.fillStyle(hex(s.world.gates[gate.id] ? C.sageMid : C.terracotta), 0.9);
        g.fillRect((r.x1 + 0.12) * P, r.y0 * P, 0.08 * P, (r.y1 - r.y0) * P);
      }
    }
  }

  // Шланг лежит по пути кипера: от катушки через перегибы до конца
  private drawHose(s: State): void {
    const g = this.hose;
    g.clear();
    const h = s.world.hose;
    if (h.state === 'reel') return;
    const end = h.state === 'held' ? { x: s.keeper.x + Math.cos(s.keeper.facing) * 0.3, y: s.keeper.y + Math.sin(s.keeper.facing) * 0.3 } : h.end;
    const pts = [HOSE_REEL, ...h.path.slice(1), end];
    const draw = (width: number, color: number) => {
      g.lineStyle(width * P, color, 1);
      g.beginPath();
      g.moveTo(pts[0].x * P, pts[0].y * P);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x * P, pts[i].y * P);
      g.strokePath();
    };
    draw(0.12, hex(C.ink));
    draw(0.075, hex(h.damage > 0.3 ? mix(C.sageMid, '#a08a52', 0.5) : C.sageMid));
    if (h.state === 'floor') {
      g.fillStyle(hex(C.metal), 1);
      g.fillCircle(end.x * P, end.y * P, 0.1 * P);
      g.lineStyle(0.03 * P, hex(C.ink), 1);
      g.strokeCircle(end.x * P, end.y * P, 0.1 * P);
    }
    if (h.damage > 0.3) {
      const mid = pts[Math.max(1, pts.length - 2)];
      g.fillStyle(hex(C.waterLight), 0.8);
      g.fillCircle(mid.x * P, mid.y * P, 0.12 * P);
    }
  }

  private syncDung(s: State): void {
    const seen = new Set<number>();
    for (const d of s.world.dung) {
      seen.add(d.id);
      if (!this.dung.has(d.id)) this.dung.set(d.id, placeImage(this.scene, `dung-${d.id % 4}`, d.x, d.y, D.waste).setRotation((d.id * 1.7) % 6.28));
    }
    for (const [id, im] of this.dung) {
      if (!seen.has(id)) {
        im.destroy();
        this.dung.delete(id);
      }
    }
  }

  private foodKey(f: State['world']['food'][number]): string {
    switch (f.kind) {
      case 'produce':
        return `produce-${f.id % 4}`;
      case 'browse':
        return 'food-browse';
      case 'bamboo':
        return 'food-bamboo';
      case 'hay':
        return 'food-hay';
      case 'straw':
        return 'food-straw';
      case 'fruit': {
        const st = fruitStage(f.rot);
        return st === 'rotten' ? 'apple-rotten' : st === 'ferment' ? 'apple-ferment' : 'apple-fresh';
      }
      default:
        return f.amount > 0.5 && f.id % 2 ? 'food-remains' : 'food-mush';
    }
  }

  private syncFood(s: State): void {
    const seen = new Set<number>();
    for (const f of s.world.food) {
      seen.add(f.id);
      let im = this.food.get(f.id);
      const key = this.foodKey(f);
      if (!im || im.texture.key !== key) {
        im?.destroy();
        im = placeImage(this.scene, key, f.x, f.y, D.waste + 0.1).setRotation((f.id * 2.3) % 6.28);
        this.food.set(f.id, im);
      }
      im.setPosition(f.x * P, f.y * P);
      if (f.kind === 'hay' || f.kind === 'straw') im.setScale(ART_SCALE * (0.4 + 0.6 * Math.min(1, f.amount / 35)));
      if (f.kind === 'browse' || f.kind === 'bamboo') im.setAlpha(0.6 + 0.4 * Math.min(1, f.amount));
    }
    for (const [id, im] of this.food) {
      if (!seen.has(id)) {
        im.destroy();
        this.food.delete(id);
      }
    }
  }

  private itemKey(it: State['world']['items'][number]): string {
    if (it.kind === 'tank') return it.load > 0 ? 'item-tank-full' : it.aux ? 'item-tank-dirty' : 'item-tank';
    if (it.kind === 'porridge') return it.load > 0 ? 'item-porridge' : 'item-porridge-empty';
    if (it.kind === 'shard') return `shard-${it.owner}`;
    return `item-${it.kind}`;
  }

  private syncItems(s: State): void {
    const seen = new Set<number>();
    for (const it of s.world.items) {
      seen.add(it.id);
      let im = this.items.get(it.id);
      const key = this.itemKey(it);
      if (!this.scene.textures.exists(key)) continue;
      if (!im || im.texture.key !== key) {
        im?.destroy();
        im = placeImage(this.scene, key, it.x, it.y, D.waste + 0.2).setRotation(it.kind === 'pile' || it.kind === 'tank' || it.kind === 'porridge' ? 0 : (it.id * 0.9) % 6.28);
        this.items.set(it.id, im);
      }
      im.setPosition(it.x * P, it.y * P);
      if (it.kind === 'pile') im.setScale(ART_SCALE * (0.5 + 0.5 * Math.min(1.4, it.load)));
    }
    for (const [id, im] of this.items) {
      if (!seen.has(id)) {
        im.destroy();
        this.items.delete(id);
      }
    }
  }

  // Новое стадо (новая игра, загрузка другой смены): текстуры тазов и осколков рисуются по слонам
  // и пересоздаются под теми же ключами. Картинки, которые на них ссылаются, нужно отпустить
  // до замены — иначе WebGL рисует удалённую текстуру и сцена падает.
  dropHerdImages(): void {
    for (const im of this.tubs.values()) im.destroy();
    this.tubs.clear();
    for (const [id, im] of this.items) {
      if (!im.texture.key.startsWith('shard-')) continue;
      im.destroy();
      this.items.delete(id);
    }
    for (const im of this.barrowCargo) if (im.texture.key.startsWith('tub-')) im.setTexture('__DEFAULT').setVisible(false);
  }

  private syncTubs(s: State): void {
    const g = this.tubFill;
    g.clear();
    const seen = new Set<number>();
    for (const t of s.world.tubs) {
      if (t.where === 'held' || t.where === 'barrow' || t.broken) continue;
      seen.add(t.id);
      let im = this.tubs.get(t.id);
      if (!im) {
        im = placeImage(this.scene, `tub-${t.owner}`, t.x, t.y, D.waste + 0.5);
        this.tubs.set(t.id, im);
      }
      const onRack = t.where === 'rack';
      im.setPosition(t.x * P, t.y * P)
        .setRotation(t.heading)
        .setScale(ART_SCALE * (onRack ? 0.55 : 1))
        .setDepth(onRack ? D.station + 0.3 : D.waste + 0.5)
        .setAlpha(t.dirty && tubKg(t) < 0.3 ? 0.9 : 1);
      this.drawTubContents(g, t, onRack ? 0.55 : 1);
    }
    for (const [id, im] of this.tubs) {
      if (!seen.has(id)) {
        im.destroy();
        this.tubs.delete(id);
      }
    }
  }

  private drawTubContents(g: Phaser.GameObjects.Graphics, t: Tub, scale: number): void {
    const kg = tubKg(t);
    if (kg < 0.3 && !t.dirty) return;
    if (kg < 0.3) {
      g.fillStyle(hex('#8a7a5a'), 0.35);
      g.fillCircle(t.x * P, t.y * P, 0.3 * scale * P);
      return;
    }
    const rr = rnd(t.id * 7 + Math.floor(kg));
    const n = Math.min(40, Math.round(kg / 2));
    let total = 0;
    for (const v of VEG_KINDS) total += t.veg[v];
    for (let i = 0; i < n; i++) {
      // Цвет — по доле вида в тазу
      let pick = rr() * total;
      let kind: VegKind = 'potato';
      for (const v of VEG_KINDS) {
        pick -= t.veg[v];
        if (pick <= 0) {
          kind = v;
          break;
        }
      }
      const a = rr() * Math.PI * 2;
      const d = Math.sqrt(rr()) * 0.4 * scale;
      g.fillStyle(hex(VEG_COLOR[kind]), 1);
      g.fillCircle((t.x + Math.cos(a) * d) * P, (t.y + Math.sin(a) * d) * P, 0.07 * scale * P);
    }
  }
}
