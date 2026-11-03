import Phaser from 'phaser';
import { PX } from '../art/pixel';
import { LAMPS } from '../art/worldPx';
import { BALANCE } from '../data/balance';
import { ELEPHANTS } from '../data/elephants';
import { MAP, COMPLEXES, type Segment } from '../data/map';
import { darkness, groundOf, sawdustAbsorbed, stinkSources, type Cell, type State } from '../sim';
import { ElephantView } from './elephantView';
import { KeeperView } from './keeperView';
import { BarrowView } from './barrowView';
import { itemTexture, loadTextures } from './textures';

// Мир в пиксель-арте: два загона, коридоры с разметкой, помещения, дорога справа,
// бассейны, слоны, кипер, напарник Димон, свет и эффекты.

export const TILE = 48;

// Отступ сверху под DOM-HUD: камера может подняться выше мира на эту полосу неба,
// и шапка интерфейса не закрывает верхнюю стену вольера
const HUD_PAD = 1.6 * TILE;

export interface FrameResult {
  actionReady: boolean;
}

const FONT = '"Press Start 2P", monospace';

// Текстура клетки пола: v — вариант, чтобы солома и трава не повторялись узором
function cellTexture(s: State, c: Cell, cx: number, cy: number, v: number): string {
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
      return groundOf(cx, cy) === 'grass' ? 'floor-dung-grass' : 'floor-dung';
    default:
      return `floor-${c.kind}`;
  }
}

export class WorldScene extends Phaser.Scene {
  private ready = false;
  private zoomReady = false;
  private baseZoom = 2; // рабочий план
  private targetZoom = 2;
  private minZoom = 1; // ближе нельзя: иначе видны края мира
  private overview = false; // общий план всей карты
  private cells: Phaser.GameObjects.Image[][] = [];
  private cellKeys: string[][] = [];
  private items = new Map<number, Phaser.GameObjects.Image>();
  private dung = new Map<number, Phaser.GameObjects.Image>();
  private litter = new Map<number, Phaser.GameObjects.Image>();
  private poolFloats = new Map<number, Phaser.GameObjects.Image>();
  private tireImgs = new Map<string, Phaser.GameObjects.Image>();
  private elephants: ElephantView[] = [];
  private keeper!: KeeperView;
  private partner!: Phaser.GameObjects.Image;
  private partnerTag!: Phaser.GameObjects.Text;
  private partnerLast = { x: 0, y: 0 };
  private night!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Image;
  private bulbs: Phaser.GameObjects.Image[] = [];
  private fence!: Phaser.GameObjects.Graphics;
  private fenceKey = '';
  private poolG!: Phaser.GameObjects.Graphics;
  private water!: Phaser.GameObjects.Graphics;
  private water2!: Phaser.GameObjects.Graphics;
  private feeder!: Phaser.GameObjects.Image;
  private feeder2!: Phaser.GameObjects.Image;
  private stove!: Phaser.GameObjects.Image;
  private stoveText!: Phaser.GameObjects.Text;
  private valve!: Phaser.GameObjects.Image;
  private valve2!: Phaser.GameObjects.Image;
  private barrow!: BarrowView;
  private box!: Phaser.GameObjects.Image;
  private ramp!: Phaser.GameObjects.Image;
  private boxText!: Phaser.GameObjects.Text;
  private truck!: Phaser.GameObjects.Image;
  private supplyTruck!: Phaser.GameObjects.Image;
  private horn!: Phaser.GameObjects.Text;
  private supplyStatusTag!: Phaser.GameObjects.Text;
  private receivingTag!: Phaser.GameObjects.Text;
  private jackImg!: Phaser.GameObjects.Image;
  private palletImg!: Phaser.GameObjects.Image;
  private groundPalletImgs = new Map<number, Phaser.GameObjects.Image>();
  private driverImg!: Phaser.GameObjects.Image;
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
    // Зум: колесо мыши плавно, Tab / Z — рабочий план ↔ общий план всей карты
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey);
    void document.fonts.load('8px "Press Start 2P"').finally(() => {
      loadTextures(this);
      this.build();
      this.ready = true;
    });
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (this.overview) this.setOverview(false);
    this.targetZoom = Math.max(this.minZoom, Math.min(2.5, this.targetZoom + (e.deltaY < 0 ? 0.2 : -0.2)));
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Tab' || e.code === 'KeyZ') {
      e.preventDefault();
      this.setOverview(!this.overview);
    }
  };

  private setOverview(on: boolean): void {
    if (this.overview === on) return;
    this.overview = on;
    const cam = this.cameras.main;
    if (on) {
      cam.stopFollow();
      cam.removeBounds();
      // minZoom не даёт увидеть края мира: карта всегда закрывает экран целиком
      this.targetZoom = Math.max(this.minZoom, Math.min(1, Math.min(cam.width / (MAP.w * TILE), cam.height / (MAP.h * TILE))));
    } else {
      cam.setBounds(0, -HUD_PAD, MAP.w * TILE, MAP.h * TILE + HUD_PAD);
      this.targetZoom = this.baseZoom;
      if (this.keeper) cam.startFollow(this.keeper.sprite, false, 0.12, 0.12);
    }
  }

  // Камера следует за кипером; зум ограничен снизу размером мира,
  // сверху — запас под DOM-HUD, чтобы шапка не закрывала верхнюю стену вольера
  private fitCamera(): void {
    const cam = this.cameras.main;
    const { width, height } = this.scale.gameSize;
    cam.setSize(width, height);
    cam.setBounds(0, -HUD_PAD, MAP.w * TILE, MAP.h * TILE + HUD_PAD);
    this.minZoom = Math.max(width / (MAP.w * TILE), height / (MAP.h * TILE));
    if (!this.zoomReady && width > 1 && height > 1) {
      this.zoomReady = true;
      // Базовый план ≈ 2.0: крупно на десктопе, скромнее на узких экранах
      this.baseZoom = Math.max(this.minZoom, Math.min(2.2, Math.max(width / (14 * TILE), height / (11 * TILE))));
      this.targetZoom = this.baseZoom;
      cam.setZoom(this.targetZoom);
    } else if (this.zoomReady) {
      if (this.overview) {
        this.targetZoom = Math.max(this.minZoom, Math.min(1, width / (MAP.w * TILE), height / (MAP.h * TILE)));
        cam.setZoom(Math.max(cam.zoom, this.minZoom));
        cam.centerOn((MAP.w * TILE) / 2, (MAP.h * TILE) / 2);
      } else {
        this.baseZoom = Math.max(this.baseZoom, this.minZoom);
        this.targetZoom = Math.max(this.targetZoom, this.minZoom);
        if (cam.zoom < this.minZoom) cam.setZoom(this.minZoom);
      }
    }
    if (this.overview) cam.centerOn((MAP.w * TILE) / 2, (MAP.h * TILE) / 2);
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
    // Полоса неба над миром — запас под DOM-HUD
    this.add.rectangle((MAP.w * TILE) / 2, -HUD_PAD / 2, MAP.w * TILE, HUD_PAD, 0x5c94fc).setDepth(-1001);

    // Пол: подстилка и трава — вся сетка мира
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
    this.drawRoomWalls();
    // Тень от шатра на песок обоих загонов: шахматка, как в старых играх
    const shade = this.add.graphics().setDepth(-880);
    shade.fillStyle(0x000000, 0.28);
    for (const b of [MAP.bedding, MAP.bedding2]) {
      for (let x = b.x * TILE; x < (b.x + b.cols) * TILE; x += PX * 2) {
        shade.fillRect(x, b.y * TILE, PX * 2, PX);
        shade.fillRect(x + PX, b.y * TILE + PX, PX, PX);
      }
    }

    // Гирлянды по кромкам двух слоновников
    const colors = ['r', 'y', 'b', 'g'];
    for (const bedding of [MAP.bedding, MAP.bedding2]) {
      const tentRight = (bedding.x + bedding.cols) * TILE;
      for (let i = 0, x = bedding.x * TILE + 12; x < tentRight; x += 30, i++) {
        this.bulbs.push(this.img(x, bedding.y * TILE - 0.36 * TILE + (i % 2) * PX, `deco-bulb-${colors[i % 4]}`, -800, 0));
      }
    }
    // Фонари на столбах — только вдоль дороги справа; в постройках свет потолочный
    for (const l of LAMPS) this.img(l.x * TILE, (l.y + 0.35) * TILE, 'deco-lantern', (l.y + 0.35) * TILE);
    // Выключатель дежурного света — на стене дежурки у двери
    const sw = MAP.stations.lightSwitch;
    this.lightSwitch = this.img(sw.x * TILE, (sw.y + sw.h / 2) * TILE, 'st-switch-off', (sw.y + sw.h / 2) * TILE);
    this.tag('СВЕТ', sw.x * TILE + 18, (sw.y - 0.3) * TILE);

    // Места тазов: бетонная площадка у решётки и табличка с именем
    for (const p of ELEPHANTS) {
      const fenceY = MAP.complexes[p.paddock].bounds.y1;
      this.img(p.slot.x * TILE, p.slot.y * TILE + 8, 'st-pad', -850, 0.5);
      this.tag(p.name.toUpperCase(), p.slot.x * TILE, fenceY * TILE - 9 * PX).setDepth(fenceY * TILE + 3).setColor('#000000').setBackgroundColor('#fcfcfc');
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
    // Стойка вдоль стены дежурки, инвентарь висит по своим местам
    const rk = at('rack');
    const rack = this.img(rk.x - 2 * PX, rk.y, 'st-rack', -860);
    this.tag('ИНВЕНТАРЬ', rk.x + 40, rk.y - rack.displayHeight - 2);
    // Стеллаж тазов в кормовой; сами тазы — предметы на своих местах
    const br = at('basinRack');
    this.img(br.x - 2 * PX, br.y, 'st-basin-rack', -860);
    // Вывески построек — на фасаде над дверью из верхнего коридора
    for (const r of Object.values(MAP.rooms))
      this.tag(r.label, ((r.x0 + r.x1) / 2) * TILE, r.y0 * TILE - 6).setDepth(-700);
    // Котёл каши и стол нарезки — раздельные станции
    const sv = at('stove');
    this.stove = this.img(sv.x, sv.y, 'st-kitchen', sv.y);
    this.stoveText = this.tag('', sv.x, sv.y - this.stove.displayHeight - 2).setColor('#f8b800');
    this.img(at('kitchen').x, at('kitchen').y, 'st-table', at('kitchen').y);
    this.tag('ЗЕРНО', 25.6 * TILE, 22.9 * TILE);
    this.buildStockPools();
    // Морской контейнер во дворе, рядом трап; мусоровоз подъезжает по дороге
    const d = at('dump');
    this.box = this.img(d.x, d.y + 4, 'st-container-open', d.y);
    this.ramp = this.img(d.x - 26 * PX, d.y + 4, 'st-ramp', d.y + 1).setVisible(false);
    this.boxText = this.tag('', d.x, d.y + 4 - this.box.displayHeight - 2);
    // Мусоровоз: едет по дороге справа
    const truckY = MAP.stations.dump.y * TILE;
    this.truck = this.img(MAP.w * TILE + 200, truckY, 'truck', truckY);
    // Продуктовый грузовик (этап 3): встаёт на дороге у зоны разгрузки
    const sy = MAP.stations.unload.y * TILE;
    this.supplyTruck = this.img((MAP.road.x0 + 1.4) * TILE, sy, 'truck-supply', sy).setVisible(false);
    this.horn = this.tag('', (MAP.stations.unload.x + 2.4) * TILE, sy - 46 * PX).setVisible(false).setColor('#fcfcfc').setBackgroundColor('#d82800');
    this.supplyStatusTag = this.tag('', (MAP.stations.unload.x + 2.4) * TILE, sy - 18 * PX).setVisible(false).setColor('#fcfcfc').setBackgroundColor('#3c3c44');
    this.receivingTag = this.tag('', MAP.stations.receiving.x * TILE, (MAP.stations.receiving.y - 0.85) * TILE).setColor('#fcfcfc').setBackgroundColor('#3c3c44');
    // Рохля с поддоном: катится за кипером, стоит на своём бетонном пятачке
    const jy = MAP.jackStart.y * TILE;
    this.jackImg = this.img(MAP.jackStart.x * TILE, jy, 'jack', jy);
    this.palletImg = this.img(MAP.jackStart.x * TILE, jy - 8 * PX, 'pallet-grain', jy - 1).setVisible(false);
    // Водитель выходит к заднему борту и ждёт приёмку
    this.driverImg = this.img((MAP.stations.unload.x + 2.2) * TILE, (MAP.stations.unload.y + 0.6) * TILE, 'driver', (MAP.stations.unload.y + 0.6) * TILE).setVisible(false);
    // Решётки слива в мойке — они же «неровности пола» для встрясок
    for (const k of ['drain', 'drain2'] as const) this.img(st[k].x * TILE, st[k].y * TILE, 'st-drain', -870, 0.5);
    // Вентили поилок у обеих решёток
    const v = at('valve');
    this.valve = this.img(v.x, v.y + 6, 'st-valve', v.y);
    this.tag('ВЕНТИЛЬ', v.x + 30, v.y - 40);
    const v2 = at('valve2');
    this.valve2 = this.img(v2.x, v2.y + 6, 'st-valve', v2.y);
    this.tag('ВЕНТИЛЬ', v2.x + 30, v2.y - 40);

    // Поилки и кормушки обоих загонов
    const tr = MAP.trough;
    this.img(tr.x * TILE, (tr.y + 0.5) * TILE, 'st-trough', (tr.y + 0.5) * TILE);
    this.water = this.add.graphics().setDepth((tr.y + 0.5) * TILE + 1);
    const tr2 = MAP.trough2;
    this.img(tr2.x * TILE, (tr2.y - 0.5) * TILE, 'st-trough', (tr2.y - 0.5) * TILE);
    this.water2 = this.add.graphics().setDepth((tr2.y - 0.5) * TILE + 1);
    const fd = MAP.feeder;
    this.feeder = this.img(fd.x * TILE, (fd.y + 0.6) * TILE, 'st-feeder-2', (fd.y + 0.6) * TILE);
    const fd2 = MAP.feeder2;
    this.feeder2 = this.img(fd2.x * TILE, (fd2.y - 0.6) * TILE, 'st-feeder-2', (fd2.y - 0.6) * TILE);

    // Ограждения: горизонтальные решётки обоих загонов и правые линии
    this.fence = this.add.graphics().setDepth(2000);

    // Вода в бассейнах: мерцание и муть, плавающий мусор — картинками
    this.poolG = this.add.graphics().setDepth(12000);

    // Живые
    this.elephants = ELEPHANTS.map((p) => new ElephantView(this, p, (x, y) => this.fx.dust.explode(6, x, y)));
    this.keeper = new KeeperView(this);
    this.barrow = new BarrowView(this);
    // Димон — напарник: тот же кипер, кепка другого цвета
    this.partner = this.add.image(0, 0, 'keeper-0').setScale(PX).setOrigin(0.5, 1).setTint(0x7cb8ff);
    this.partnerTag = this.tag('ДИМОН', 0, 0).setColor('#9ad0ff').setBackgroundColor('#000000').setDepth(20000);

    // Следящая камера: лерп 0.12 и мёртвая зона, чтобы не дрожала при топтании на тайле
    const cam = this.cameras.main;
    cam.startFollow(this.keeper.sprite, false, 0.12, 0.12);
    cam.setDeadzone(Math.min(200, cam.width * 0.2), Math.min(160, cam.height * 0.2));

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

  private drawRoomWalls(): void {
    const brick = (x: number, y: number, width: number, height: number, depth: number): void => {
      const g = this.add.graphics().setDepth(depth);
      g.fillStyle(0x000000).fillRect(x, y, width, height);
      g.fillStyle(0xe87820).fillRect(x + PX, y + PX, width - 2 * PX, height - 2 * PX);
      g.fillStyle(0xffc060).fillRect(x + PX, y + PX, width - 2 * PX, PX);
      g.fillStyle(0x9c4018);
      for (let row = y + 4 * PX; row < y + height - PX; row += 9 * PX) {
        g.fillRect(x + PX, row, width - 2 * PX, PX);
      }
      g.fillStyle(0x000000);
      for (let joint = x + 8 * PX; joint < x + width - PX; joint += 24 * PX) {
        g.fillRect(joint, y + PX, PX, 3 * PX);
      }
    };

    for (const wall of MAP.walls) {
      if (wall.y0 === wall.y1) {
        brick(wall.x0 * TILE - 2 * PX, wall.y0 * TILE - 3 * PX, (wall.x1 - wall.x0) * TILE + 3 * PX, 5 * PX, wall.y0 * TILE);
        continue;
      }

      for (let y = wall.y0; y < wall.y1; y += 0.5) {
        const segmentHeight = Math.min(0.5, wall.y1 - y) * TILE;
        brick(
          wall.x0 * TILE - 2 * PX,
          y * TILE - 3 * PX,
          5 * PX,
          segmentHeight + 3 * PX,
          (y + segmentHeight / (2 * TILE)) * TILE,
        );
      }
    }
  }

  // Пул спрайтов запаса: сколько единиц в stock — столько видно (физические склады)
  private stockImgs: Record<string, Phaser.GameObjects.Image[]> = {};

  private buildStockPools(): void {
    const row = (key: string, tex: string, pts: [number, number][]) => {
      this.stockImgs[key] = pts.map(([x, y]) => this.img(x * TILE, y * TILE, tex, y * TILE));
    };
    const stack = (x: number, y: number, count: number): [number, number][] =>
      Array.from({ length: count }, (_, i) => [x + (i % 4) * 0.55, y - Math.floor(i / 4) * 0.38]);
    // Кормовая: мешки зерна у южной стены, овощи у стеллажа, фрукты рядом
    row('grain', 'unit-sack', [
      [24.7, 23.4], [25.1, 23.4], [25.5, 23.4], [25.9, 23.4],
      [24.9, 23.0], [25.3, 23.0], [25.7, 23.0], [26.1, 23.0],
      [26.3, 23.4],
    ]);
    row('veg', 'unit-crate-veg', [
      [31.1, 19.9], [31.1, 20.6], [31.1, 21.3], [31.5, 19.9], [31.5, 20.6], [31.5, 21.3],
    ]);
    row('fruit', 'unit-crate-fruit', [
      [30.0, 22.5], [30.5, 22.5], [31.0, 22.5], [30.2, 22.1], [30.7, 22.1], [31.2, 22.1],
      [29.8, 23.0], [30.3, 23.0], [30.8, 23.0], [31.3, 23.0],
    ]);
    // Сенник: тюки сена вдоль южной стены, охапки соломы у северной
    row('hay', 'deco-bale', stack(36.2, 23.3, 17));
    row('straw', 'litter-straw', stack(33.9, 19.4, 17));
    // Опилочник: горки опилок у ларя
    row('sawdust', 'litter-sawdust', [...stack(46.5, 22.6, 16), ...stack(49.0, 22.6, 8)]);
    for (const [kind, x, y] of [
      ['hay', 37.5, 21.3],
      ['straw', 34.6, 20.7],
      ['sawdust', 47.6, 20.8],
    ] as const) {
      this.stockEmptyTags[kind] = this.tag('ПУСТО', x * TILE, y * TILE).setVisible(false);
    }
  }

  private stockEmptyTags: Partial<Record<'hay' | 'straw' | 'sawdust', Phaser.GameObjects.Text>> = {};

  private drawStock(s: State): void {
    for (const k of Object.keys(this.stockImgs) as (keyof State['stock'])[]) {
      const show = Math.min(s.stock[k], this.stockImgs[k].length);
      this.stockImgs[k].forEach((im, i) => im.setVisible(i < show));
      if (k === 'hay' || k === 'straw' || k === 'sawdust') this.stockEmptyTags[k]?.setVisible(s.stock[k] <= 0);
    }
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
    this.drawPools(s, t);
    this.drawTires(s);
    this.drawFence(s);
    this.drawStations(s);
    s.elephants.forEach((e, i) => this.elephants[i].update(e, s, t));
    this.keeper.update(s, t, frame.actionReady);
    this.drawPartner(s, t);
    this.barrow.update(s);
    this.drawStock(s);
    this.drawSupply(s, t);
    this.drawContainer(s, dt);
    this.effects(s);
    this.drawStink(s, t, dt);
    this.drawLight(s, t);
    // Плавный зум к цели; на общем плане держим центр карты
    const cam = this.cameras.main;
    if (Math.abs(cam.zoom - this.targetZoom) > 0.001) cam.setZoom(cam.zoom + (this.targetZoom - cam.zoom) * Math.min(1, dt * 6));
    if (this.overview) cam.centerOn((MAP.w * TILE) / 2, (MAP.h * TILE) / 2);
  }

  private drawCells(s: State): void {
    s.cells.forEach((row, cy) =>
      row.forEach((c, cx) => {
        const key = cellTexture(s, c, cx, cy, (cx * 7 + cy * 13) % 4);
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

  // Бассейны: мерцание воды, муть от грязи и плавающий навоз
  private drawPools(s: State, t: number): void {
    const g = this.poolG;
    g.clear();
    MAP.pools.forEach((p, i) => {
      const ps = s.pools[i];
      const cx = p.x * TILE;
      const cy = p.y * TILE;
      const rx = p.rx * TILE;
      const ry = p.ry * TILE;
      // Муть: тёмный слой поверх воды
      if (ps.dirty > 5) g.fillStyle(0x2c5830, Math.min(0.55, ps.dirty / 160)).fillEllipse(cx, cy, rx * 2 - 10, ry * 2 - 10);
      // Мерцание: короткие блики, бегущие по воде
      for (let k = 0; k < 7; k++) {
        const phase = (t * 0.5 + k * 0.23) % 1;
        const x = cx - rx / 2 + phase * rx;
        const y = cy - ry / 2 + ((k * 37) % 100) / 100 * ry;
        g.fillStyle(0xb9f4ff, 0.9).fillRect(Math.round(x), Math.round(y), 10, 3);
      }
    });
    // Плавающий навоз
    const seen = new Set<number>();
    for (const f of s.pools.flatMap((p) => p.floats)) {
      seen.add(f.id);
      if (!this.poolFloats.has(f.id)) {
        const y = f.y * TILE + 8;
        this.poolFloats.set(f.id, this.img(f.x * TILE, y, 'dung', y - 1, 0.8));
      }
    }
    for (const [id, im] of this.poolFloats) {
      if (!seen.has(id)) {
        im.destroy();
        this.poolFloats.delete(id);
      }
    }
  }

  private drawTires(s: State): void {
    for (const tire of s.tires) {
      let image = this.tireImgs.get(tire.id);
      if (!image) {
        image = this.img(tire.x * TILE, tire.y * TILE, 'tire', tire.y * TILE);
        this.tireImgs.set(tire.id, image);
      }
      const progress = tire.flightDuration > 0 ? 1 - tire.flightLeft / tire.flightDuration : 0;
      const arc = tire.flightLeft > 0 ? Math.sin(progress * Math.PI) * 1.4 * TILE : 0;
      image.setPosition(tire.x * TILE, tire.y * TILE - arc).setDepth(tire.y * TILE + 2).setRotation(tire.flightLeft > 0 ? progress * Math.PI * 2 : 0);
    }
  }

  // Капитальная решётка обоих загонов: проходы с перекладиной, ворота — две створки
  private drawFence(s: State): void {
    const key = `${s.gates.female}:${s.gates.male}`;
    if (key === this.fenceKey) return;
    this.fenceKey = key;
    const P = PX;
    const SHINE = 0x7c7c7c;
    const g = this.fence;
    g.clear();
    const inComplexBounds = (wall: Segment): boolean =>
      Object.values(COMPLEXES).some(({ bounds: b }) => {
        const x0 = Math.min(wall.x0, wall.x1);
        const x1 = Math.max(wall.x0, wall.x1);
        const y0 = Math.min(wall.y0, wall.y1);
        const y1 = Math.max(wall.y0, wall.y1);
        return x0 >= b.x0 && x1 <= b.x1 && y0 >= b.y0 && y1 <= b.y1;
      });
    g.lineStyle(3 * P, 0x000000, 1);
    for (const wall of MAP.walls.filter(inComplexBounds)) {
      g.beginPath();
      g.moveTo(wall.x0 * TILE, wall.y0 * TILE);
      g.lineTo(wall.x1 * TILE, wall.y1 * TILE);
      g.strokePath();
      g.lineStyle(P, SHINE, 1);
      g.beginPath();
      g.moveTo(wall.x0 * TILE, wall.y0 * TILE - P);
      g.lineTo(wall.x1 * TILE, wall.y1 * TILE - P);
      g.strokePath();
      g.lineStyle(3 * P, 0x000000, 1);
    }
    for (const gate of MAP.gates) {
      const open = s.gates[gate.id];
      const color = open ? 0x4cfc20 : 0xd82800;
      if (gate.orientation === 'horizontal') {
        const y = gate.coord * TILE;
        const x0 = gate.opening.start * TILE;
        const x1 = gate.opening.end * TILE;
        if (open) {
          g.lineStyle(2 * P, SHINE, 1);
          g.lineBetween(x0, y, x0 - 8 * P, y + 8 * P);
          g.lineBetween(x1, y, x1 + 8 * P, y + 8 * P);
        } else {
          g.lineStyle(3 * P, color, 1);
          g.lineBetween(x0, y, x1, y);
        }
      } else {
        const x = gate.coord * TILE;
        const y0 = gate.opening.start * TILE;
        const y1 = gate.opening.end * TILE;
        if (open) {
          g.lineStyle(2 * P, SHINE, 1);
          g.lineBetween(x, y0, x - 8 * P, y0 - 8 * P);
          g.lineBetween(x, y1, x + 8 * P, y1 + 8 * P);
        } else {
          g.lineStyle(3 * P, color, 1);
          g.lineBetween(x, y0, x, y1);
        }
      }
    }
  }

  private drawStations(s: State): void {
    // Котёл каши
    const cooking = s.kitchen.kasha.status === 'cooking';
    this.stove.setTexture(cooking ? 'st-kitchen-cooking' : 'st-kitchen');
    if (cooking && Math.random() < 0.08) this.fx.steam.explode(1, MAP.stations.stove.x * TILE - 22, (MAP.stations.stove.y - 1.2) * TILE);
    const k = s.kitchen;
    const parts = [
      k.kasha.status === 'cooking' ? 'КАША ПАРИТСЯ' : k.kasha.status === 'ready' ? `КАША x${k.kasha.portions}` : '',
      k.veg.portions ? `УЖИН x${k.veg.portions}` : '',
    ].filter(Boolean);
    this.stoveText.setText(parts.join(' ')).setVisible(parts.length > 0);

    this.valve.setTexture(s.valveOpen ? 'st-valve-open' : 'st-valve');
    this.valve2.setTexture(s.valve2Open ? 'st-valve-open' : 'st-valve');
    if (s.valveOpen && Math.random() < 0.3) this.fx.water.explode(2, MAP.trough.x * TILE + 20, (MAP.trough.y + 0.1) * TILE);
    if (s.valve2Open && Math.random() < 0.3) this.fx.water.explode(2, MAP.trough2.x * TILE + 20, (MAP.trough2.y - 0.1) * TILE);
    this.feeder.setTexture(`st-feeder-${s.feederHay < 5 ? 0 : s.feederHay < 50 ? 1 : 2}`);
    this.feeder2.setTexture(`st-feeder-${s.feederHay2 < 5 ? 0 : s.feederHay2 < 50 ? 1 : 2}`);

    // Вода в поилках: синяя полоса с бликом, по уровню
    const drawWater = (g: Phaser.GameObjects.Graphics, level: number, x: number, y: number) => {
      g.clear();
      if (level > 2) {
        const left = x * TILE - 13 * PX;
        const top = y * TILE - 10 * PX;
        const h = Math.max(1, Math.round((level / 100) * 5)) * PX;
        g.fillStyle(0x0078f8).fillRect(left, top + 5 * PX - h, 26 * PX, h + PX);
        g.fillStyle(0x3cbcfc).fillRect(left, top + 5 * PX - h, 26 * PX, PX);
        g.fillStyle(0xfcfcfc).fillRect(left + 4 * PX, top + 5 * PX - h, 3 * PX, PX);
      }
    };
    drawWater(this.water, s.trough, MAP.trough.x, MAP.trough.y + 0.5);
    drawWater(this.water2, s.trough2, MAP.trough2.x, MAP.trough2.y - 0.5);
  }

  // Продуктовый грузовик, гудок, водитель у борта и рохля
  private drawSupply(s: State, t: number): void {
    const sp = s.supply;
    const open = sp.arrived && !sp.left;
    this.supplyTruck.setVisible(open);
    this.supplyStatusTag
      .setText(`РАЗГРУЗКА: ${sp.bays.length}`)
      .setVisible(open);
    this.receivingTag.setText(`БУФЕР: ${Math.max(0, MAP.receivingSpots.length - sp.ground.length)}/${MAP.receivingSpots.length} МЕСТ СВОБОДНО`);
    this.horn
      .setText('ГУДОК!')
      .setVisible(open && s.t - BALANCE.supply.arriveAt < 20 && Math.floor(t * 3) % 2 === 0);
    const d = sp.driver;
    this.driverImg.setVisible(open).setPosition(Math.round(d.x * TILE), Math.round(d.y * TILE)).setDepth(Math.round(d.y * TILE));
    const j = s.jack;
    const jy = Math.round(j.y * TILE);
    this.jackImg.setPosition(Math.round(j.x * TILE), jy).setDepth(jy);
    if (j.cargo?.length) {
      this.palletImg.setTexture(`pallet-${j.cargo[0].kind}`).setPosition(Math.round(j.x * TILE), jy - 8 * PX).setVisible(true);
    } else this.palletImg.setVisible(false);
    const groundIds = new Set<number>();
    for (const pallet of sp.ground) {
      groundIds.add(pallet.id);
      let image = this.groundPalletImgs.get(pallet.id);
      if (!image) {
        image = this.img(pallet.x * TILE, pallet.y * TILE, `pallet-${pallet.cargo[0].kind}`, pallet.y * TILE);
        this.groundPalletImgs.set(pallet.id, image);
      }
      image.setTexture(`pallet-${pallet.cargo[0].kind}`).setPosition(pallet.x * TILE, pallet.y * TILE).setDepth(pallet.y * TILE);
      if (pallet.reservedBy) image.setTint(0x84e8ff);
      else image.clearTint();
    }
    for (const [id, image] of this.groundPalletImgs) {
      if (!groundIds.has(id)) {
        image.destroy();
        this.groundPalletImgs.delete(id);
      }
    }
  }

  private drawContainer(s: State, dt: number): void {
    const c = s.container;
    const share = Math.round((c.fill / BALANCE.container.capacity) * 100);
    this.box.setTexture(c.doorClosed ? 'st-container-closed' : 'st-container-open');
    this.ramp.setVisible(c.ramp);
    this.boxText.setText(`БАК ${share}%`).setColor(share >= 100 ? '#d82800' : share >= 50 ? '#f8b800' : '#fcfcfc');
    // Мусоровоз: подъезжает по дороге справа, когда вызван, и уезжает после замены
    const stopX = (MAP.stations.dump.x + 1.9) * TILE;
    const offX = MAP.w * TILE + 140;
    const arriving = c.truckAt !== null && s.t >= c.truckAt - 8;
    const leaving = c.truckLeftAt !== null && s.t - c.truckLeftAt < 8;
    const target = arriving ? stopX : offX;
    const speed = 260 * dt;
    if (leaving && this.truck.x < stopX - 5) this.truck.x = stopX;
    this.truck.x += Math.max(-speed, Math.min(speed, target - this.truck.x));
    this.truck.setVisible(this.truck.x < MAP.w * TILE + 120);
  }

  // Димон: шагает по нижней половине комплекса, тень и табличка
  private drawPartner(s: State, t: number): void {
    const p = s.partner;
    const px = Math.round(p.x * TILE);
    const py = Math.round(p.y * TILE + 12);
    const moved = Math.hypot(px - this.partnerLast.x, py - this.partnerLast.y);
    this.partnerLast = { x: px, y: py };
    const frame = moved > 0.3 ? `keeper-${1 + (Math.floor(t * 6) % 2)}` : 'keeper-0';
    this.partner
      .setTexture(frame)
      .setFlipX(p.facing.x < 0)
      .setPosition(px, py)
      .setRotation(p.knockdownTimer > 0 ? Math.PI / 2 : 0)
      .setDepth(py + 1);
    this.partnerTag
      .setText(p.knockdownTimer > 0 ? 'ДИМОН 💫' : p.mode === 'flee' ? 'ДИМОН · МУСТ!' : 'ДИМОН')
      .setPosition(px, py - 30 * PX)
      .setDepth(20000);
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
    // Ночь своя для дежурного света: оба вольера освещены ровно и тускло
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
