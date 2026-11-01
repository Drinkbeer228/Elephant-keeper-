import Phaser from 'phaser';
import { PX } from '../art/pixel';
import { LAMPS } from '../art/worldPx';
import { BALANCE } from '../data/balance';
import { ELEPHANTS } from '../data/elephants';
import { MAP } from '../data/map';
import { darkness, groundOf, sawdustAbsorbed, stinkSources, type Cell, type State } from '../sim';
import { ElephantView } from './elephantView';
import { KeeperView } from './keeperView';
import { BarrowView } from './barrowView';
import { itemTexture, loadTextures } from './textures';

// Мир в пиксель-арте: шатёр, подстилка по клеткам, станции, ограждение, слонихи, кипер, свет и эффекты.

export const TILE = 48;

export interface FrameResult {
  actionReady: boolean;
}

const FONT = '"Press Start 2P", monospace';

// Текстура клетки пола: v — вариант, чтобы солома и трава не повторялись узором
function cellTexture(s: State, c: Cell, cx: number, v: number): string {
  switch (c.kind) {
    case 'straw':
      return `floor-straw-${v}`;
    case 'grass':
      return `floor-grass-${v}`;
    case 'wet':
      return `floor-wet-${v % 2}`;
    case 'sawdust':
      return sawdustAbsorbed(s, c) ? 'floor-sawdustDone' : 'floor-sawdust';
    case 'dung':
      return groundOf(cx) === 'grass' ? 'floor-dung-grass' : 'floor-dung';
    default:
      return `floor-${c.kind}`;
  }
}

export class WorldScene extends Phaser.Scene {
  private ready = false;
  private follow = false;
  private cells: Phaser.GameObjects.Image[][] = [];
  private cellKeys: string[][] = [];
  private items = new Map<number, Phaser.GameObjects.Image>();
  private dung = new Map<number, Phaser.GameObjects.Image>();
  private litter = new Map<number, Phaser.GameObjects.Image>();
  private elephants: ElephantView[] = [];
  private keeper!: KeeperView;
  private night!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Image;
  private bulbs: Phaser.GameObjects.Image[] = [];
  private fence!: Phaser.GameObjects.Graphics;
  private fenceRight: Phaser.GameObjects.Graphics[] = [];
  private fenceKey = '';
  private water!: Phaser.GameObjects.Graphics;
  private feeder!: Phaser.GameObjects.Image;
  private kitchen!: Phaser.GameObjects.Image;
  private kitchenText!: Phaser.GameObjects.Text;
  private valve!: Phaser.GameObjects.Image;
  private barrow!: BarrowView;
  private box!: Phaser.GameObjects.Image;
  private ramp!: Phaser.GameObjects.Image;
  private boxText!: Phaser.GameObjects.Text;
  private truck!: Phaser.GameObjects.Image;
  private stink!: Phaser.GameObjects.Graphics;
  private lightSwitch!: Phaser.GameObjects.Image;
  private lightKey = '';
  private stinkAt: { x: number; y: number }[] = [];
  private stinkCheck = 0;
  private fx: Record<string, Phaser.GameObjects.Particles.ParticleEmitter> = {};
  private prev = { tallies: '', trust: [] as number[], dung: new Set<number>() };

  constructor(
    private getState: () => State,
    private onFrame: (dt: number) => FrameResult,
  ) {
    super('world');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#000000');
    this.scale.on('resize', () => this.fitCamera());
    this.fitCamera();
    void document.fonts.load('8px "Press Start 2P"').finally(() => {
      loadTextures(this);
      this.build();
      this.ready = true;
    });
  }

  private fitCamera(): void {
    const cam = this.cameras.main;
    const { width, height } = this.scale.gameSize;
    cam.setSize(width, height);
    const fit = Math.min(width / (MAP.w * TILE), height / (MAP.h * TILE));
    const cover = Math.max(width / (MAP.w * TILE), height / (MAP.h * TILE));
    if (fit * TILE >= 32 && cover / fit < 1.15) {
      // Экран почти как карта: заполняем без полос, камера чуть доезжает за кипером
      this.follow = cover / fit > 1.02;
      cam.setBounds(0, 0, MAP.w * TILE, MAP.h * TILE);
      cam.setZoom(cover);
      if (!this.follow) cam.centerOn((MAP.w * TILE) / 2, (MAP.h * TILE) / 2);
    } else if (fit * TILE >= 32) {
      // Карта целиком по центру; границы камеры сняты, иначе она прижмётся к краю
      this.follow = false;
      cam.removeBounds();
      cam.setZoom(fit);
      cam.centerOn((MAP.w * TILE) / 2, (MAP.h * TILE) / 2);
    } else {
      this.follow = true;
      cam.setBounds(0, 0, MAP.w * TILE, MAP.h * TILE);
      cam.setZoom(Math.max(width / (9.5 * TILE), height / (13 * TILE)));
    }
  }

  // Картинка стоит нижним краем на точке
  private img(x: number, y: number, key: string, depth: number, originY = 1): Phaser.GameObjects.Image {
    return this.add.image(Math.round(x), Math.round(y), key).setScale(PX).setOrigin(0.5, originY).setDepth(depth);
  }

  private tag(text: string, x: number, y: number): Phaser.GameObjects.Text {
    return this.add
      .text(Math.round(x), Math.round(y), text, { fontFamily: FONT, fontSize: '8px', color: '#fcfcfc', backgroundColor: '#000000', padding: { x: 3, y: 2 } })
      .setOrigin(0.5, 1)
      .setDepth(19000);
  }

  private build(): void {
    const s = this.getState();
    this.add.image(0, 0, 'bg').setOrigin(0).setScale(PX).setDepth(-1000);

    // Пол вольера: подстилка и луг
    const f = MAP.floor;
    for (let cy = 0; cy < f.rows; cy++) {
      this.cells.push([]);
      this.cellKeys.push([]);
      for (let cx = 0; cx < f.cols; cx++) {
        const im = this.add.image((f.x + cx) * TILE, (f.y + cy) * TILE, 'floor-straw-0').setOrigin(0).setScale(PX).setDepth(-900);
        this.cells[cy].push(im);
        this.cellKeys[cy].push('');
      }
    }
    // Тень от шатра на подстилку: шахматка, как в старых играх
    const b = MAP.bedding;
    const shade = this.add.graphics().setDepth(-880);
    shade.fillStyle(0x000000, 0.28);
    for (let x = b.x * TILE; x < (b.x + b.cols) * TILE; x += PX * 2) {
      shade.fillRect(x, b.y * TILE, PX * 2, PX);
      shade.fillRect(x + PX, b.y * TILE + PX, PX, PX);
    }

    // Гирлянда по кромке шатра
    const colors = ['r', 'y', 'b', 'g'];
    const tentRight = (MAP.bedding.x + MAP.bedding.cols) * TILE;
    for (let i = 0, x = 12; x < tentRight; x += 30, i++) {
      this.bulbs.push(this.img(x, 0.36 * TILE + (i % 2) * PX, `deco-bulb-${colors[i % 4]}`, -800, 0));
    }
    // Фонари на столбах — только снаружи решётки; в постройках свет потолочный, без столбов
    for (const l of LAMPS) this.img(l.x * TILE, (l.y + 0.35) * TILE, 'deco-lantern', (l.y + 0.35) * TILE);
    // Выключатель дежурного света — на стене дежурки у двери
    const sw = MAP.stations.lightSwitch;
    this.lightSwitch = this.img(sw.x * TILE, (sw.y + sw.h / 2) * TILE, 'st-switch-off', (sw.y + sw.h / 2) * TILE);
    this.tag('СВЕТ', sw.x * TILE + 18, (sw.y - 0.3) * TILE);

    // Места тазов: бетонная площадка у решётки и табличка с именем на прутьях
    for (const p of ELEPHANTS) {
      this.img(p.slot.x * TILE, p.slot.y * TILE + 8, 'st-pad', -850, 0.5);
      this.tag(p.name.toUpperCase(), p.slot.x * TILE, MAP.fenceY * TILE - 9 * PX).setDepth(MAP.fenceY * TILE + 3).setColor('#000000').setBackgroundColor('#fcfcfc');
    }

    // Станции
    const st = MAP.stations;
    const at = (k: keyof typeof st) => ({ x: st[k].x * TILE, y: (st[k].y + st[k].h / 2) * TILE });
    const label: Partial<Record<keyof typeof st, string>> = {
      sawdust: 'ОПИЛКИ',
      bags: 'МЕШКИ',
      vegRack: 'ОВОЩИ',
      hay: 'СЕНО',
      straw: 'СОЛОМА',
    };
    for (const k of ['sawdust', 'bags', 'wash', 'hay', 'straw', 'vegRack'] as const) {
      const p = at(k);
      const im = this.img(p.x, p.y, `st-${k}`, p.y - 30);
      if (label[k]) this.tag(label[k], p.x, p.y - im.displayHeight - 2);
    }
    // Стойка вдоль левой стены, инвентарь висит на ней по своим местам
    const rk = at('rack');
    const rack = this.img(rk.x - 2 * PX, rk.y, 'st-rack', -860);
    this.tag('ИНВЕНТАРЬ', rk.x + 40, rk.y - rack.displayHeight - 2);
    // Стеллаж тазов в кормовой; сами тазы — предметы на своих местах
    const br = at('basinRack');
    this.img(br.x - 2 * PX, br.y, 'st-basin-rack', -860);
    // Вывески построек — на фасаде над дверью
    const rooms = MAP.rooms;
    for (const [r, x] of [
      [rooms.duty, 3.3],
      [rooms.wash, 7.1],
      [rooms.kitchen, 11.8],
      [rooms.shed, 16.8],
    ] as const)
      this.tag(r.label, x * TILE, r.y0 * TILE - 6).setDepth(-700);
    const k = at('kitchen');
    this.kitchen = this.img(k.x, k.y, 'st-kitchen', k.y);
    this.kitchenText = this.tag('', k.x, k.y - this.kitchen.displayHeight - 2).setColor('#f8b800');
    this.img(14.2 * TILE, 15.3 * TILE, 'st-grain', 15.3 * TILE);
    this.tag('ЗЕРНО', 14.2 * TILE, 14.4 * TILE);
    // Навес — простой: передняя балка крыши на двух столбах
    const sh = rooms.shed;
    for (const x of [sh.x0 + 0.15, sh.x1 - 0.15]) this.img(x * TILE, (sh.y0 + 0.2) * TILE, 'st-shed-post', (sh.y0 + 0.2) * TILE);
    const beam = this.add.graphics().setDepth(sh.y0 * TILE + 2);
    const by = sh.y0 * TILE - 13 * PX;
    beam.fillStyle(0x000000).fillRect(sh.x0 * TILE, by - PX, (sh.x1 - sh.x0) * TILE, 5 * PX);
    beam.fillStyle(0xc84c0c).fillRect(sh.x0 * TILE, by, (sh.x1 - sh.x0) * TILE, 3 * PX);
    beam.fillStyle(0xfc9838).fillRect(sh.x0 * TILE, by, (sh.x1 - sh.x0) * TILE, PX);
    // Морской контейнер на асфальте, рядом трап; мусоровоз подъезжает по проезду
    const d = at('dump');
    this.box = this.img(d.x, d.y + 4, 'st-container-open', d.y);
    this.ramp = this.img(d.x - 26 * PX, d.y + 4, 'st-ramp', d.y + 1).setVisible(false);
    this.boxText = this.tag('', d.x, d.y + 4 - this.box.displayHeight - 2);
    const truckY = (MAP.h - 0.4) * TILE;
    this.truck = this.img(MAP.w * TILE + 200, truckY, 'truck', truckY);
    // Решётки слива в мойке
    for (const k of ['drain', 'drain2'] as const) this.img(st[k].x * TILE, st[k].y * TILE, 'st-drain', -870, 0.5);
    const v = at('valve');
    this.valve = this.img(v.x, v.y + 6, 'st-valve', v.y);
    this.tag('ВЕНТИЛЬ', v.x + 30, v.y - 40);

    // Поилка и кормушка внутри
    const tr = MAP.trough;
    this.img(tr.x * TILE, (tr.y + 0.5) * TILE, 'st-trough', (tr.y + 0.5) * TILE);
    this.water = this.add.graphics().setDepth((tr.y + 0.5) * TILE + 1);
    const fd = MAP.feeder;
    this.feeder = this.img(fd.x * TILE, (fd.y + 0.6) * TILE, 'st-feeder-2', (fd.y + 0.6) * TILE);

    // Ограждение
    this.fence = this.add.graphics().setDepth(MAP.fenceY * TILE + 2);
    for (let row = 0; row < MAP.fenceY; row++) this.fenceRight.push(this.add.graphics().setDepth((row + 1) * TILE + 2));

    // Живые
    this.elephants = ELEPHANTS.map((p) => new ElephantView(this, p, (x, y) => this.fx.dust.explode(6, x, y)));
    this.keeper = new KeeperView(this);
    this.barrow = new BarrowView(this);

    this.stink = this.add.graphics().setDepth(24000);

    // Свет
    this.glow = this.add.image(0, 0, 'glow').setOrigin(0).setScale(PX).setDepth(30000).setBlendMode(Phaser.BlendModes.ADD);
    this.night = this.add.image(0, 0, 'night').setOrigin(0).setScale(PX).setDepth(30001);

    // Эффекты: квадратные «пиксели», как частицы в старых играх
    const emitter = (key: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) => {
      this.fx[key] = this.add.particles(0, 0, `fx-${key}`, { emitting: false, scale: PX, ...cfg }).setDepth(25000);
    };
    emitter('pee', { speed: { min: 50, max: 120 }, angle: { min: 200, max: 340 }, gravityY: 360, lifespan: 600 });
    emitter('water', { speed: { min: 30, max: 90 }, angle: { min: 200, max: 340 }, gravityY: 300, lifespan: 500 });
    emitter('dust', { speed: { min: 30, max: 70 }, angle: { min: 190, max: 350 }, gravityY: 80, lifespan: 450, alpha: { start: 1, end: 0 } });
    emitter('heart', { speed: { min: 20, max: 40 }, angle: { min: 250, max: 290 }, lifespan: 1200, alpha: { start: 1, end: 0 } });
    emitter('z', { speed: { min: 10, max: 22 }, angle: { min: 260, max: 300 }, lifespan: 1800, alpha: { start: 1, end: 0 }, scale: 2 });
    emitter('steam', { speed: { min: 8, max: 20 }, angle: { min: 250, max: 290 }, lifespan: 1200, alpha: { start: 0.8, end: 0 } });
    emitter('star', { speed: { min: 40, max: 90 }, angle: { min: 200, max: 340 }, gravityY: 120, lifespan: 700, alpha: { start: 1, end: 0 } });

    this.prev.dung = new Set(s.dung.map((x) => x.id));
    this.prev.trust = s.elephants.map((e) => e.trust);
    this.prev.tallies = JSON.stringify(s.elephants.map((e) => e.tally));
  }

  update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.1);
    const frame = this.onFrame(dt);
    if (!this.ready) return;
    const s = this.getState();
    const t = time / 1000;
    this.drawCells(s);
    this.drawItems(s);
    this.drawDung(s);
    this.drawLitter(s);
    this.drawFence(s);
    this.drawStations(s);
    s.elephants.forEach((e, i) => this.elephants[i].update(e, s, t));
    this.keeper.update(s, t, frame.actionReady);
    this.barrow.update(s);
    this.drawContainer(s, dt);
    this.effects(s);
    this.drawStink(s, t, dt);
    this.drawLight(s, t);
    if (this.follow) {
      const cam = this.cameras.main;
      const tx = s.player.x * TILE - cam.width / 2;
      const ty = s.player.y * TILE - cam.height / 2;
      cam.scrollX += (tx - cam.scrollX) * Math.min(1, dt * 6);
      cam.scrollY += (ty - cam.scrollY) * Math.min(1, dt * 6);
    }
  }

  private drawCells(s: State): void {
    s.cells.forEach((row, cy) =>
      row.forEach((c, cx) => {
        const key = cellTexture(s, c, cx, (cx * 7 + cy * 13) % 4);
        if (this.cellKeys[cy][cx] !== key) {
          this.cellKeys[cy][cx] = key;
          this.cells[cy][cx].setTexture(key);
        }
      }),
    );
  }

  private drawItems(s: State): void {
    const seen = new Set<number>();
    for (const item of s.items) {
      seen.add(item.id);
      let im = this.items.get(item.id);
      if (!im) {
        im = this.add.image(0, 0, itemTexture(item)).setScale(PX).setOrigin(0.5, 0.9);
        this.items.set(item.id, im);
      }
      const y = Math.round(item.y * TILE + 10);
      im.setTexture(itemTexture(item)).setPosition(Math.round(item.x * TILE), y).setDepth(y - 1);
    }
    for (const [id, im] of this.items) {
      if (!seen.has(id)) {
        im.destroy();
        this.items.delete(id);
      }
    }
  }

  private drawDung(s: State): void {
    const seen = new Set<number>();
    for (const d of s.dung) {
      seen.add(d.id);
      if (!this.dung.has(d.id)) {
        const y = d.y * TILE + 8;
        this.dung.set(d.id, this.img(d.x * TILE, y, 'dung', y - 2, 0.8));
      }
    }
    for (const [id, im] of this.dung) {
      if (!seen.has(id)) {
        im.destroy();
        this.dung.delete(id);
      }
    }
  }

  // Сор с тачки — мелкие соломинки и опилки на полу, пока не подметут
  private drawLitter(s: State): void {
    const seen = new Set<number>();
    for (const l of s.litter) {
      seen.add(l.id);
      if (!this.litter.has(l.id)) {
        this.litter.set(l.id, this.img(l.x * TILE, l.y * TILE, `litter-${l.kind}`, -800, 0.5));
        this.fx.dust.explode(3, l.x * TILE, l.y * TILE);
      }
    }
    for (const [id, im] of this.litter) {
      if (!seen.has(id)) {
        im.destroy();
        this.litter.delete(id);
      }
    }
  }

  // Капитальная решётка: тёмные железные прутья между перекладинами, проход с перекладиной сверху, ворота — две створки
  private drawFence(s: State): void {
    const key = `${s.gateOpen}`;
    if (key === this.fenceKey) return;
    this.fenceKey = key;
    const P = PX;
    const IRON = 0x2c2c30;
    const SHINE = 0x7c7c7c;
    const bars = (g: Phaser.GameObjects.Graphics, x0: number, x1: number, y: number, h: number) => {
      g.fillStyle(0x000000).fillRect(x0, y - h - P, x1 - x0, 3 * P);
      g.fillStyle(SHINE).fillRect(x0, y - h, x1 - x0, P);
      g.fillStyle(0x000000).fillRect(x0, y - 3 * P, x1 - x0, 3 * P);
      g.fillStyle(SHINE).fillRect(x0, y - 2 * P, x1 - x0, P);
      for (let x = x0 + P; x < x1 - P; x += 3 * P) {
        g.fillStyle(IRON).fillRect(x, y - h, P, h);
        g.fillStyle(SHINE).fillRect(x, y - h + 2 * P, P, P);
      }
    };
    const post = (g: Phaser.GameObjects.Graphics, x: number, y: number, h: number) => {
      g.fillStyle(0x000000).fillRect(x - 2 * P, y - h - 2 * P, 4 * P, h + 2 * P);
      g.fillStyle(0x545454).fillRect(x - P, y - h - P, 2 * P, h + P);
      g.fillStyle(0xbcbcbc).fillRect(x - P, y - h - P, P, h + P);
    };
    const y = MAP.fenceY * TILE;
    const H = 16 * P;
    const g = this.fence;
    g.clear();
    const door = MAP.door;
    const gate = MAP.elephantGate;
    for (const [x0, x1] of [
      [MAP.paddock.x0, door.x0],
      [door.x1, gate.x0],
      [gate.x1, MAP.fenceX],
    ]) {
      bars(g, x0 * TILE, x1 * TILE, y, H);
      for (let x = x0 + 1.75; x < x1 - 0.5; x += 1.75) post(g, Math.round(x * TILE), y, H);
    }
    for (const x of [MAP.paddock.x0, door.x0, door.x1, gate.x0, gate.x1, MAP.fenceX]) post(g, Math.round(x * TILE), y, H + 2 * P);
    // Проход для человека: перекладина над головой — слон не пролезет
    g.fillStyle(0x000000).fillRect(door.x0 * TILE, y - H - 9 * P, (door.x1 - door.x0) * TILE, 3 * P);
    g.fillStyle(SHINE).fillRect(door.x0 * TILE, y - H - 8 * P, (door.x1 - door.x0) * TILE, P);
    // Ворота для слона: закрыты — две створки в линию с красной задвижкой; открыты — распахнуты внутрь, с флажком
    const gx0 = gate.x0 * TILE + 2 * P;
    const gx1 = gate.x1 * TILE - 2 * P;
    if (s.gateOpen) {
      for (const gx of [gx0, gx1 - 3 * P]) {
        g.fillStyle(0x000000).fillRect(gx, y - 30 * P, 3 * P, 30 * P);
        g.fillStyle(SHINE).fillRect(gx + P, y - 29 * P, P, 28 * P);
      }
      g.fillStyle(0xd82800).fillRect(gx0 + 3 * P, y - 30 * P, 5 * P, 4 * P);
    } else {
      const half = (gx1 - gx0) / 2;
      bars(g, gx0, gx0 + half - P, y, H);
      bars(g, gx0 + half + P, gx1, y, H);
      g.fillStyle(0xd82800).fillRect(gx0 + half - 2 * P, y - 10 * P, 4 * P, 3 * P);
    }
    // Правая линия у края карты — по сегменту на ряд, чтобы слонихи правильно заходили за неё
    const x = MAP.fenceX * TILE;
    this.fenceRight.forEach((rg, row) => {
      rg.clear();
      if (row === 0) return;
      const y1 = (row + 1) * TILE;
      rg.fillStyle(0x000000).fillRect(x - 2 * P, y1 - TILE, 4 * P, TILE);
      rg.fillStyle(IRON).fillRect(x - P, y1 - TILE, 2 * P, TILE);
      for (let yy = y1 - TILE; yy < y1; yy += 3 * P) rg.fillStyle(SHINE).fillRect(x - P, yy, P, P);
      if (row % 2 === 0) post(rg, x, y1, H);
    });
  }

  private drawStations(s: State): void {
    const cooking = s.kitchen.kasha.status === 'cooking';
    this.kitchen.setTexture(cooking ? 'st-kitchen-cooking' : 'st-kitchen');
    if (cooking && Math.random() < 0.08) this.fx.steam.explode(1, MAP.stations.kitchen.x * TILE - 22, (MAP.stations.kitchen.y - 1.2) * TILE);
    const k = s.kitchen;
    const parts = [
      k.kasha.status === 'cooking' ? 'КАША ПАРИТСЯ' : k.kasha.status === 'ready' ? `КАША x${k.kasha.portions}` : '',
      k.veg.portions ? `УЖИН x${k.veg.portions}` : '',
    ].filter(Boolean);
    this.kitchenText.setText(parts.join(' ')).setVisible(parts.length > 0);

    this.valve.setTexture(s.valveOpen ? 'st-valve-open' : 'st-valve');
    if (s.valveOpen && Math.random() < 0.3) this.fx.water.explode(2, MAP.trough.x * TILE + 20, (MAP.trough.y + 0.1) * TILE);
    this.feeder.setTexture(`st-feeder-${s.feederHay < 5 ? 0 : s.feederHay < 50 ? 1 : 2}`);

    // Вода в поилке: синяя полоса с бликом, по уровню
    const tr = MAP.trough;
    const w = this.water;
    w.clear();
    if (s.trough > 2) {
      const left = tr.x * TILE - 13 * PX;
      const top = (tr.y + 0.5) * TILE - 10 * PX;
      const h = Math.max(1, Math.round((s.trough / 100) * 5)) * PX;
      w.fillStyle(0x0078f8).fillRect(left, top + 5 * PX - h, 26 * PX, h + PX);
      w.fillStyle(0x3cbcfc).fillRect(left, top + 5 * PX - h, 26 * PX, PX);
      w.fillStyle(0xfcfcfc).fillRect(left + 4 * PX, top + 5 * PX - h, 3 * PX, PX);
    }
  }

  private drawContainer(s: State, dt: number): void {
    const c = s.container;
    const share = Math.round((c.fill / BALANCE.container.capacity) * 100);
    this.box.setTexture(c.doorClosed ? 'st-container-closed' : 'st-container-open');
    this.ramp.setVisible(c.ramp);
    this.boxText.setText(`БАК ${share}%`).setColor(share >= 100 ? '#d82800' : share >= 50 ? '#f8b800' : '#fcfcfc');
    // Мусоровоз: подъезжает справа к баку, когда вызван, и уезжает после замены
    const stopX = (MAP.stations.dump.x - 0.3) * TILE;
    const offX = MAP.w * TILE + 140;
    const arriving = c.truckAt !== null && s.t >= c.truckAt - 8;
    const leaving = c.truckLeftAt !== null && s.t - c.truckLeftAt < 8;
    const target = arriving ? stopX : leaving ? offX : offX;
    const speed = 260 * dt;
    if (leaving && this.truck.x < stopX - 5) this.truck.x = stopX;
    this.truck.x += Math.max(-speed, Math.min(speed, target - this.truck.x));
    this.truck.setVisible(this.truck.x < MAP.w * TILE + 120);
  }

  private effects(s: State): void {
    // Новая куча — пыль, мимо или в бак — брызги, лакомство — сердечки, сон — «z»
    const ids = new Set(s.dung.map((d) => d.id));
    for (const d of s.dung) if (!this.prev.dung.has(d.id)) this.fx.dust.explode(6, d.x * TILE, d.y * TILE);
    this.prev.dung = ids;
    const tallies = JSON.stringify(s.elephants.map((e) => e.tally));
    if (tallies !== this.prev.tallies) {
      const before = JSON.parse(this.prev.tallies || '[]') as State['elephants'][number]['tally'][];
      s.elephants.forEach((e, i) => {
        const was = before[i];
        if (!was) return;
        const back = e.x * TILE - this.elephants[i].facing * 30;
        if (e.tally.inBucket > was.inBucket) {
          this.fx.pee.explode(20, back, e.y * TILE);
          this.fx.star.explode(8, e.x * TILE, e.y * TILE - 40);
        }
        if (e.tally.missed > was.missed) this.fx.pee.explode(30, back, e.y * TILE);
      });
      this.prev.tallies = tallies;
    }
    s.elephants.forEach((e, i) => {
      if (e.trust > (this.prev.trust[i] ?? e.trust)) this.fx.heart.explode(4, e.x * TILE, e.y * TILE - 90);
      this.prev.trust[i] = e.trust;
      if (e.state === 'sleep' && Math.random() < 0.012) this.fx.z.explode(1, e.x * TILE + 30, e.y * TILE - 20);
    });
  }

  // Над вонючим — зелёные волнистые струйки и мухи, кружащие пиксельными точками
  private drawStink(s: State, t: number, dt: number): void {
    this.stinkCheck -= dt;
    if (this.stinkCheck <= 0) {
      this.stinkCheck = 0.5;
      this.stinkAt = stinkSources(s).slice(0, 24);
    }
    const g = this.stink;
    g.clear();
    const P = PX;
    this.stinkAt.forEach((src, i) => {
      const x = src.x * TILE;
      const y = src.y * TILE;
      for (let k = 0; k < 2; k++) {
        const phase = (t * 0.8 + i * 0.37 + k * 0.5) % 1;
        const bx = x + (k ? 8 : -8);
        for (let j = 0; j < 3; j++) {
          const yy = y - 10 - phase * 30 - j * 2 * P;
          const xx = bx + Math.round(Math.sin(phase * 6 + j) * 1.5) * P;
          g.fillStyle(0x80d010, 1 - phase).fillRect(Math.round(xx), Math.round(yy), P, P);
        }
      }
      for (let f = 0; f < 2; f++) {
        const a = t * (3 + f) + i * 1.7 + f * Math.PI;
        const fx = x + Math.cos(a) * 14;
        const fy = y - 22 + Math.sin(a * 1.3) * 7;
        g.fillStyle(0x000000).fillRect(Math.round(fx), Math.round(fy), 2 * P, P);
        const up = Math.floor(t * 12 + f) % 2 === 0;
        g.fillStyle(0xfcfcfc, 0.9).fillRect(Math.round(fx) + (up ? 0 : P), Math.round(fy) - P, P, P);
      }
    });
  }

  private drawLight(s: State, t: number): void {
    const dark = darkness(s.t);
    // Ночь своя для дежурного света: вольер освещён ровно и тускло
    const key = s.dutyLight ? 'duty' : 'off';
    if (this.lightKey !== key) {
      this.lightKey = key;
      this.night.setTexture(s.dutyLight ? 'night-duty' : 'night');
      this.glow.setTexture(s.dutyLight ? 'glow-duty' : 'glow');
      this.lightSwitch.setTexture(s.dutyLight ? 'st-switch-on' : 'st-switch-off');
    }
    this.night.setAlpha(dark);
    this.glow.setAlpha(dark);
    // Гирлянда мигает по очереди, когда темно
    this.bulbs.forEach((b, i) => b.setAlpha(dark > 0.2 && Math.floor(t * 2 + i) % 3 === 0 ? 0.5 : 1));
  }

}
