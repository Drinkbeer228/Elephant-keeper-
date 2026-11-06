// Изменчивая часть мира: подстилка и грязь, корм и вода, навоз, мяч, тачка, ворота, свет.

import Phaser from 'phaser';
import { DOORS, DRUM, GATE, H, POOL, STATIONS, TIRE, TOOL_SLOTS, TREES, W, BALL_START } from '../data/facility';
import { cellCenter, darkness, doorUnlocked, isBeddingCell, troughSpoiled, type State } from '../sim';
import { rnd } from './art';
import { bakeScale, D } from './ground';
import { C, hex, mix } from './palette';
import { placeImage, PPM, ART_SCALE } from './textures';

const P = PPM;

export class WorldView {
  private floor: Phaser.GameObjects.Graphics;
  private floorRT: Phaser.GameObjects.RenderTexture;
  private floorK: number;
  private floorVersion = -1;
  private levels: Phaser.GameObjects.Graphics;
  private water: Phaser.GameObjects.Graphics;
  private gate: Phaser.GameObjects.Graphics;
  private gateK = 0;
  private dung = new Map<number, Phaser.GameObjects.Image>();
  private food = new Map<number, Phaser.GameObjects.Image[]>();
  private items = new Map<number, Phaser.GameObjects.Image>();
  private stacks: Record<'hay' | 'straw' | 'browse', Phaser.GameObjects.Image[]> = { hay: [], straw: [], browse: [] };
  private tools: Record<'fork' | 'rake', Phaser.GameObjects.Image>;
  private ball: Phaser.GameObjects.Image;
  private ballShadow: Phaser.GameObjects.Image;
  private ballRot = 0;
  private barrow: Phaser.GameObjects.Image;
  private barrowLoad: Phaser.GameObjects.Image;
  private barrowShadow: Phaser.GameObjects.Image;
  private valves: Record<string, Phaser.GameObjects.Image> = {};
  private canopies: { img: Phaser.GameObjects.Image; x: number; y: number; r: number }[] = [];
  private tire: Phaser.GameObjects.Image;
  private night: Phaser.GameObjects.Rectangle;
  private lights: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene) {
    // Пол вольеров рисуется векторно, но запекается в текстуру — только когда он меняется
    this.floor = scene.make.graphics({}, false);
    this.floorK = bakeScale(scene);
    this.floorRT = scene.add.renderTexture(2 * P, 2 * P, 44 * P * this.floorK, 28 * P * this.floorK).setOrigin(0).setScale(1 / this.floorK).setDepth(D.floor);
    this.water = scene.add.graphics().setDepth(D.floor + 1);
    this.levels = scene.add.graphics().setDepth(D.stationDyn);
    this.gate = scene.add.graphics().setDepth(D.wall + 1);

    // Кормушки, поилки, кормушка для овощей — рамки; уровни рисуются поверх
    const mid = (id: keyof typeof STATIONS) => {
      const r = STATIONS[id].rect!;
      return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
    };
    placeImage(scene, 'st-rack-barn', mid('barnRack').x, mid('barnRack').y, D.station);
    placeImage(scene, 'st-rack-barn-slats', mid('barnRack').x, mid('barnRack').y, D.stationDyn + 0.5);
    placeImage(scene, 'st-rack-paddock', mid('paddockFeeder').x, mid('paddockFeeder').y, D.station);
    placeImage(scene, 'st-rack-paddock-slats', mid('paddockFeeder').x, mid('paddockFeeder').y, D.stationDyn + 0.5);
    placeImage(scene, 'st-trough-barn', mid('barnWater').x, mid('barnWater').y, D.station);
    placeImage(scene, 'st-trough-paddock', mid('paddockWater').x, mid('paddockWater').y, D.station);
    placeImage(scene, 'st-produce', mid('barnTrough').x, mid('barnTrough').y, D.station);
    this.valves.barnWater = placeImage(scene, 'st-valve-closed', 9.55, 24, D.station);
    this.valves.paddockWater = placeImage(scene, 'st-valve-closed', 5.5, 20.45, D.station + 0.1);
    this.valves.pool = placeImage(scene, 'st-valve-closed', 44.5, 20.4, D.station + 0.1);

    // Склад: тюки и ветки — столько, сколько есть
    const r = rnd(5);
    for (let i = 0; i < 20; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      this.stacks.hay.push(placeImage(scene, 'item-hay', 36.6 + col * 0.82, 39.3 - row * 0.5 - (r() - 0.5) * 0.05, D.station + row * 0.01).setRotation((r() - 0.5) * 0.08));
      this.stacks.straw.push(placeImage(scene, 'item-straw', 41.0 + col * 0.82, 39.3 - row * 0.5, D.station + row * 0.01).setRotation((r() - 0.5) * 0.08));
    }
    for (let i = 0; i < 8; i++) this.stacks.browse.push(placeImage(scene, 'item-browse', 45.1, 33.9 + i * 0.36, D.station + i * 0.01).setRotation(Math.PI / 2 + (r() - 0.5) * 0.3).setScale(ART_SCALE * 0.8));

    this.tools = {
      fork: placeImage(scene, 'item-fork', TOOL_SLOTS.fork.x, TOOL_SLOTS.fork.y - 0.6, D.station + 0.2).setRotation(Math.PI / 2),
      rake: placeImage(scene, 'item-rake', TOOL_SLOTS.rake.x, TOOL_SLOTS.rake.y - 0.6, D.station + 0.2).setRotation(Math.PI / 2),
    };
    this.ballShadow = placeImage(scene, 'shadow-ball', BALL_START.x, BALL_START.y, D.shadow);
    this.ball = placeImage(scene, 'ball', BALL_START.x, BALL_START.y, D.actor - 0.2);
    placeImage(scene, 'drum', DRUM.x, DRUM.y, D.station);
    this.tire = placeImage(scene, 'tire', TIRE.x, TIRE.y, D.actor + 0.5);
    this.barrowShadow = placeImage(scene, 'shadow-barrow', 0, 0, D.shadow);
    this.barrow = placeImage(scene, 'barrow', 0, 0, D.actor);
    this.barrowLoad = placeImage(scene, 'barrow-load', 0, 0, D.actor + 0.001);
    for (const t of TREES) {
      placeImage(scene, `canopy-shadow-${t.id}`, t.x + 0.7, t.y + 0.9, D.canopy - 1);
      this.canopies.push({ img: placeImage(scene, `canopy-${t.id}`, t.x, t.y, D.canopy), x: t.x, y: t.y, r: t.canopy });
    }
    this.night = scene.add.rectangle(-20 * P, -20 * P, (W + 40) * P, (H + 40) * P, hex('#1d2a36'), 0).setOrigin(0).setDepth(D.night);
    for (const l of [
      { x: 3, y: 20.9, r: 2.2 },
      { x: 15.5, y: 31.6, r: 2.2 },
      { x: 33.5, y: 31.6, r: 2.2 },
      { x: 45.2, y: 24, r: 2.2 },
      { x: 20, y: 24.5, r: 3.4 },
    ]) {
      this.lights.push(placeImage(scene, 'glow', l.x, l.y, D.light).setBlendMode(Phaser.BlendModes.ADD).setScale(ART_SCALE * l.r).setAlpha(0));
    }
  }

  update(s: State, time: number, dt: number): void {
    const w = s.world;
    if (w.cellsVersion !== this.floorVersion) {
      this.floorVersion = w.cellsVersion;
      this.drawFloor(s);
    }
    this.drawLevels(s, time);
    this.drawPool(s, time);
    this.drawGate(s, dt);
    this.syncDung(s);
    this.syncFood(s);
    this.syncItems(s);
    for (const k of ['hay', 'straw', 'browse'] as const) {
      const n = w.stock[k];
      this.stacks[k].forEach((im, i) => im.setVisible(i < n));
    }
    this.tools.fork.setVisible(w.tools.fork);
    this.tools.rake.setVisible(w.tools.rake);
    this.valves.barnWater.setTexture(w.water.barnWater.valve ? 'st-valve-open' : 'st-valve-closed');
    this.valves.paddockWater.setTexture(w.water.paddockWater.valve ? 'st-valve-open' : 'st-valve-closed');
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

    // Кроны прозрачнеют, когда под ними кто-то есть
    for (const c of this.canopies) {
      const under =
        Math.hypot(s.keeper.x - c.x, s.keeper.y - c.y) < c.r + 0.3 || s.elephants.some((e) => Math.hypot(e.x - c.x, e.y - c.y) < c.r + 0.8);
      const target = under ? 0.42 : 1;
      c.img.setAlpha(c.img.alpha + (target - c.img.alpha) * Math.min(1, dt * 4));
    }

    // Сумерки и ночь, фонари
    const dark = darkness(s.t);
    this.night.setFillStyle(hex('#1d2a36'), dark * 0.5);
    for (const l of this.lights) l.setAlpha(dark * 0.55);
  }

  // Подстилка: солома прядками; моча — тёмные влажные пятна; грязь — бурые разводы
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
          g.fillStyle(hex(mix('#d8c59c', C.straw, k)), 1);
          g.fillRect((p.x - 0.5) * P, (p.y - 0.5) * P, P, P);
          const r = rnd(i * 13 + 1);
          g.lineStyle(0.03 * P, hex(C.strawDark), 0.55 + 0.35 * k);
          const n = Math.round(5 * k);
          for (let j = 0; j < n; j++) {
            const x = p.x - 0.45 + r() * 0.9;
            const y = p.y - 0.45 + r() * 0.9;
            const a = r() * Math.PI;
            g.lineBetween(x * P, y * P, (x + Math.cos(a) * 0.32) * P, (y + Math.sin(a) * 0.32) * P);
          }
        }
      }
      const wet = c.wet[i];
      if (wet > 0.04) {
        const r = rnd(i * 7 + 3);
        const color = bed ? '#9c7d3e' : p.y < 20 ? '#b3995f' : '#8f8a77';
        g.fillStyle(hex(color), Math.min(0.5, wet * 0.5));
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
    this.floorRT.draw(g, -2 * P * this.floorK, -2 * P * this.floorK);
  }

  private drawLevels(s: State, time: number): void {
    const g = this.levels;
    g.clear();
    const w = s.world;
    // Сено в яслях
    for (const id of ['barnRack', 'paddockFeeder'] as const) {
      const r = STATIONS[id].rect!;
      const k = Math.min(1, w.hay[id] / 100);
      if (k <= 0.01) continue;
      const rr = rnd(id.length * 31);
      const inset = 0.1;
      const width = (r.x1 - r.x0 - inset * 2) * (0.3 + 0.7 * k);
      const x0 = (r.x0 + r.x1) / 2 - width / 2;
      g.fillStyle(hex(C.hay), 1);
      g.fillRoundedRect(x0 * P, (r.y0 + inset) * P, width * P, (r.y1 - r.y0 - inset * 2) * P, 0.1 * P);
      g.lineStyle(0.025 * P, hex(C.hayDark), 0.9);
      for (let i = 0; i < 14 * k + 3; i++) {
        const x = x0 + rr() * width;
        const y = r.y0 + inset + rr() * (r.y1 - r.y0 - inset * 2);
        g.lineBetween(x * P, y * P, (x + 0.25) * P, (y + (rr() - 0.5) * 0.1) * P);
      }
    }
    // Овощи в кормушке у решётки
    const tr = STATIONS.barnTrough.rect!;
    if (w.trough.portions > 0.05) {
      const spoiled = troughSpoiled(s);
      const rr = rnd(77);
      const n = Math.min(14, Math.ceil(w.trough.portions * 4));
      const cols = spoiled ? ['#7d6a44', '#6b5a3c'] : [C.produceOrange, C.produceRed, C.produceGreen, C.produceYellow];
      for (let i = 0; i < n; i++) {
        g.fillStyle(hex(cols[i % cols.length]), 1);
        g.fillCircle((tr.x0 + 0.2 + rr() * (tr.x1 - tr.x0 - 0.4)) * P, (tr.y0 + 0.15 + rr() * (tr.y1 - tr.y0 - 0.3)) * P, 0.08 * P);
      }
    }
    // Вода в поилках
    const waterRect = (id: 'barnWater' | 'paddockWater') => {
      const r = STATIONS[id].rect!;
      const lvl = w.water[id].level / 100;
      if (lvl <= 0.02) return;
      const inset = 0.12;
      const x = r.x0 + inset;
      const y = r.y0 + inset;
      const ww = r.x1 - r.x0 - inset * 2;
      const hh = r.y1 - r.y0 - inset * 2;
      g.fillStyle(hex(mix(C.waterLight, C.water, lvl)), 0.95);
      g.fillRoundedRect(x * P, y * P, ww * P, hh * P, 0.06 * P);
      if (w.water[id].valve) {
        g.fillStyle(0xffffff, 0.6);
        const k = (time * 2) % 1;
        g.fillCircle((x + ww * k) * P, (y + hh * (1 - k)) * P, 0.06 * P);
      }
    };
    waterRect('barnWater');
    waterRect('paddockWater');
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
    // Двери кипера: огонёк — можно войти (зелёный) или нет (терракотовый)
    for (const d of DOORS) {
      const ok = doorUnlocked(s, d);
      const cx = (d.rect.x0 + d.rect.x1) / 2;
      const cy = (d.rect.y0 + d.rect.y1) / 2;
      g.fillStyle(hex(ok ? C.sageMid : C.terracotta), 1);
      const lx = d.id === 'barnDoor' ? cx + 0.45 : cx + 0.85;
      const ly = d.id === 'barnDoor' ? cy - 0.85 : cy + 0.45;
      g.fillCircle(lx * P, ly * P, 0.11 * P);
      g.lineStyle(0.025 * P, hex(C.ink), 1);
      g.strokeCircle(lx * P, ly * P, 0.11 * P);
      if (!ok) {
        g.lineStyle(0.08 * P, hex(C.metalDark), 1);
        if (d.id === 'barnDoor') g.lineBetween(cx * P, d.rect.y0 * P, cx * P, d.rect.y1 * P);
        else g.lineBetween(d.rect.x0 * P, cy * P, d.rect.x1 * P, cy * P);
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
    // Блики
    g.lineStyle(0.05 * P, 0xffffff, 0.55);
    for (let i = 0; i < 6; i++) {
      const ph = (time * 0.18 + i * 0.17) % 1;
      const x = POOL.x - POOL.rx * 0.6 + ph * POOL.rx * 1.2;
      const y = POOL.y - POOL.ry * 0.5 + ((i * 37) % 10) / 10 * POOL.ry;
      g.lineBetween(x * P, y * P, (x + 0.5) * P, y * P);
    }
    if (s.world.pool.valve) {
      const k = (time * 1.5) % 1;
      g.lineStyle(0.05 * P, hex(C.waterLight), 1 - k);
      g.strokeCircle((POOL.x + POOL.rx - 0.6) * P, (POOL.y + POOL.ry - 0.6) * P, (0.2 + k * 0.6) * P);
    }
  }

  // Сдвижные ворота: стальная створка уезжает в стену
  private drawGate(s: State, dt: number): void {
    const target = s.world.gateOpen ? 1 : 0;
    this.gateK += Math.sign(target - this.gateK) * Math.min(Math.abs(target - this.gateK), dt * 0.9);
    const g = this.gate;
    g.clear();
    const shift = this.gateK * (GATE.x1 - GATE.x0 - 0.3);
    const x0 = GATE.x0 - shift;
    const x1 = GATE.x1 - shift;
    g.fillStyle(hex(C.metalDark), 1);
    g.fillRect(x0 * P, (GATE.y0 + 0.05) * P, (x1 - x0) * P, (GATE.y1 - GATE.y0 - 0.1) * P);
    g.lineStyle(0.04 * P, hex(C.ink), 1);
    g.strokeRect(x0 * P, (GATE.y0 + 0.05) * P, (x1 - x0) * P, (GATE.y1 - GATE.y0 - 0.1) * P);
    g.fillStyle(hex(C.metal), 1);
    for (let x = x0 + 0.25; x < x1; x += 0.5) g.fillRect((x - 0.06) * P, (GATE.y0 + 0.1) * P, 0.12 * P, (GATE.y1 - GATE.y0 - 0.2) * P);
    // Полоса-указатель на полу: открыто/закрыто
    g.fillStyle(hex(s.world.gateOpen ? C.sageMid : C.terracotta), 0.9);
    g.fillRect(GATE.x0 * P, (GATE.y1 + 0.12) * P, (GATE.x1 - GATE.x0) * P, 0.08 * P);
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

  private syncFood(s: State): void {
    const seen = new Set<number>();
    for (const f of s.world.food) {
      seen.add(f.id);
      let list = this.food.get(f.id);
      const key = f.kind === 'produce' ? `produce-${f.id % 4}` : f.kind === 'browse' ? 'food-browse' : f.kind === 'hay' ? 'food-hay' : f.amount > 0.5 && f.id % 2 ? 'food-remains' : 'food-mush';
      if (!list || list[0].texture.key !== key) {
        list?.forEach((im) => im.destroy());
        list = [placeImage(this.scene, key, f.x, f.y, D.waste + 0.1).setRotation((f.id * 2.3) % 6.28)];
        this.food.set(f.id, list);
      }
      if (f.kind === 'hay') list[0].setScale(ART_SCALE * (0.5 + 0.5 * Math.min(1, f.amount / 35)));
      if (f.kind === 'browse') list[0].setAlpha(0.6 + 0.4 * f.amount);
    }
    for (const [id, list] of this.food) {
      if (!seen.has(id)) {
        list.forEach((im) => im.destroy());
        this.food.delete(id);
      }
    }
  }

  private syncItems(s: State): void {
    const seen = new Set<number>();
    for (const it of s.world.items) {
      seen.add(it.id);
      let im = this.items.get(it.id);
      if (!im) {
        im = placeImage(this.scene, `item-${it.kind}`, it.x, it.y, D.waste + 0.2).setRotation((it.id * 0.9) % 6.28);
        this.items.set(it.id, im);
      }
      im.setPosition(it.x * P, it.y * P);
    }
    for (const [id, im] of this.items) {
      if (!seen.has(id)) {
        im.destroy();
        this.items.delete(id);
      }
    }
  }
}
