import Phaser from 'phaser';
import { MAP } from '../data/map';
import { ELEPHANTS } from '../data/elephants';
import { BALANCE } from '../data/balance';
import { dayPart, sawdustAbsorbed, type Item, type State } from '../sim';

// Мир рисуется заглушками: фигуры и подписи. Ассеты потом заменят только этот файл.

export const TILE = 48;

const COLORS = {
  ground: 0x2e2a26,
  groundLine: 0x38332e,
  straw: 0xcaa54c,
  wet: 0x7a6a3a,
  wetTint: 0x3f6b8c,
  bareWet: 0x45505a,
  sawdust: 0xe0c896,
  sawdustDone: 0xa88f63,
  bare: 0x6e675d,
  fenceOn: 0xf2c94c,
  fenceOff: 0x777777,
  station: 0x4a423a,
  stationEdge: 0x6b6156,
  player: 0x4caf7a,
  dung: 0x5a3b1e,
  water: 0x4aa3df,
  hay: 0xd8b75a,
};

const ITEM_COLORS: Record<Item['kind'], number> = {
  bucket: 0x9fb4c4,
  scoop: 0xb0703a,
  fork: 0xc8c8c8,
  broom: 0xa8743c,
  sawdust: 0xe0c896,
  bag: 0x1b1b1b,
  basin: 0x2b2b2b,
  hay: 0xd8b75a,
  straw: 0xe8cf7a,
};

export class WorldScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private night!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private labelUsed = 0;
  private getState: () => State;
  private onFrame: (dt: number) => void;
  private follow = false;

  constructor(getState: () => State, onFrame: (dt: number) => void) {
    super('world');
    this.getState = getState;
    this.onFrame = onFrame;
  }

  create(): void {
    this.g = this.add.graphics();
    this.night = this.add.graphics().setDepth(5);
    for (const s of Object.values(MAP.stations)) {
      if (s.label === 'Задвижка') continue;
      this.add
        .text((s.x) * TILE, (s.y - s.h / 2) * TILE - 4, s.label, { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#d8cfc2' })
        .setOrigin(0.5, 1)
        .setDepth(4);
    }
    this.cameras.main.setBounds(0, 0, MAP.w * TILE, MAP.h * TILE);
    this.cameras.main.setBackgroundColor('#1c1916');
    this.scale.on('resize', () => this.fitCamera());
    this.fitCamera();
  }

  private fitCamera(): void {
    const cam = this.cameras.main;
    const { width, height } = this.scale.gameSize;
    cam.setSize(width, height);
    const fit = Math.min(width / (MAP.w * TILE), height / (MAP.h * TILE));
    if (fit * TILE >= 30) {
      this.follow = false;
      cam.setZoom(fit);
      cam.centerOn((MAP.w * TILE) / 2, (MAP.h * TILE) / 2);
    } else {
      // Узкий экран: крупнее и камера за кипером
      this.follow = true;
      cam.setZoom(Math.max(width / (9 * TILE), height / (14 * TILE)));
    }
  }

  update(_time: number, deltaMs: number): void {
    this.onFrame(Math.min(deltaMs / 1000, 0.1));
    const s = this.getState();
    this.labelUsed = 0;
    this.draw(s);
    for (let i = this.labelUsed; i < this.labels.length; i++) this.labels[i].setVisible(false);
    if (this.follow) this.cameras.main.centerOn(s.player.x * TILE, s.player.y * TILE);
  }

  private label(text: string, x: number, y: number, color = '#ffffff', size = 12, bg?: string): void {
    let t = this.labels[this.labelUsed];
    if (!t) {
      t = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif' }).setOrigin(0.5, 1).setDepth(6);
      this.labels.push(t);
    }
    this.labelUsed++;
    t.setText(text)
      .setPosition(x * TILE, y * TILE)
      .setColor(color)
      .setFontSize(size)
      .setBackgroundColor(bg ?? '')
      .setPadding(bg ? 3 : 0, bg ? 1 : 0)
      .setVisible(true);
  }

  private draw(s: State): void {
    const g = this.g;
    g.clear();
    g.fillStyle(COLORS.ground).fillRect(0, 0, MAP.w * TILE, MAP.h * TILE);
    g.lineStyle(1, COLORS.groundLine);
    for (let x = 0; x <= MAP.w; x++) g.lineBetween(x * TILE, 0, x * TILE, MAP.h * TILE);
    for (let y = 0; y <= MAP.h; y++) g.lineBetween(0, y * TILE, MAP.w * TILE, y * TILE);

    this.drawBedding(s);
    this.drawStations(s);
    this.drawFence(s);
    for (const d of s.dung) {
      g.fillStyle(COLORS.dung).fillCircle(d.x * TILE, d.y * TILE, 9).fillCircle(d.x * TILE + 7, d.y * TILE - 4, 7);
    }
    for (const item of s.items) this.drawItem(item, item.x, item.y);
    for (const e of s.elephants) this.drawElephant(s, e);
    this.drawPlayer(s);
    this.drawNight(s);
  }

  private drawBedding(s: State): void {
    const g = this.g;
    const b = MAP.bedding;
    s.cells.forEach((row, cy) =>
      row.forEach((c, cx) => {
        const x = (b.x + cx) * TILE;
        const y = (b.y + cy) * TILE;
        const color =
          c.kind === 'straw'
            ? COLORS.straw
            : c.kind === 'wet'
              ? COLORS.wet
              : c.kind === 'bareWet'
                ? COLORS.bareWet
                : c.kind === 'sawdust'
                  ? sawdustAbsorbed(s, c)
                    ? COLORS.sawdustDone
                    : COLORS.sawdust
                  : COLORS.bare;
        g.fillStyle(color).fillRect(x, y, TILE, TILE);
        if (c.kind === 'wet' || c.kind === 'bareWet') g.fillStyle(COLORS.wetTint, 0.35).fillRect(x, y, TILE, TILE);
        if (c.kind === 'straw') {
          g.lineStyle(1, 0xb08f3a, 0.6);
          g.lineBetween(x + 8, y + 12, x + 22, y + 18).lineBetween(x + 26, y + 30, x + 40, y + 26).lineBetween(x + 12, y + 36, x + 20, y + 42);
        }
        g.lineStyle(1, 0x000000, 0.12).strokeRect(x, y, TILE, TILE);
      }),
    );
    // Поилка и кормушка
    const t = MAP.trough;
    g.fillStyle(0x555b61).fillRect((t.x - 0.8) * TILE, (t.y - 0.4) * TILE, 1.6 * TILE, 0.8 * TILE);
    g.fillStyle(COLORS.water).fillRect((t.x - 0.75) * TILE, (t.y - 0.35) * TILE, 1.5 * TILE * (s.trough / 100), 0.7 * TILE);
    const f = MAP.feeder;
    g.fillStyle(0x5a4a33).fillRect((f.x - 0.9) * TILE, (f.y - 0.4) * TILE, 1.8 * TILE, 0.8 * TILE);
    g.fillStyle(COLORS.hay).fillRect((f.x - 0.85) * TILE, (f.y - 0.35) * TILE, 1.7 * TILE * (s.feederHay / 100), 0.7 * TILE);
    this.label(`вода ${Math.round(s.trough)}%`, t.x, t.y - 0.45, '#cfe7f7', 11);
    this.label(`сено ${Math.round(s.feederHay)}%`, f.x, f.y - 0.45, '#f3e2b0', 11);
    // Слоты для тазов
    for (const p of ELEPHANTS) {
      g.lineStyle(2, 0xffffff, 0.35).strokeCircle(p.slot.x * TILE, p.slot.y * TILE, 15);
      this.label(p.name, p.slot.x, p.slot.y + 0.55, '#ffffffaa', 10);
    }
  }

  private drawFence(s: State): void {
    const g = this.g;
    const color = s.fenceOn ? COLORS.fenceOn : COLORS.fenceOff;
    const y = MAP.fenceY * TILE;
    const x = MAP.fenceX * TILE;
    g.lineStyle(4, 0x8a8178);
    g.lineBetween(MAP.bedding.x * TILE, y, MAP.gate.x0 * TILE, y);
    g.lineBetween(MAP.gate.x1 * TILE, y, x, y);
    g.lineBetween(x, MAP.bedding.y * TILE, x, y);
    g.lineStyle(2, color, s.fenceOn ? 0.9 : 0.5);
    g.lineBetween(MAP.bedding.x * TILE, y - 6, MAP.gate.x0 * TILE, y - 6);
    g.lineBetween(MAP.gate.x1 * TILE, y - 6, x - 6, y - 6);
    g.lineBetween(x - 6, MAP.bedding.y * TILE, x - 6, y - 6);
    // Стены слоновника
    g.lineStyle(6, 0x15120f);
    g.lineBetween(MAP.bedding.x * TILE, MAP.bedding.y * TILE, x, MAP.bedding.y * TILE);
    g.lineBetween(MAP.bedding.x * TILE, MAP.bedding.y * TILE, MAP.bedding.x * TILE, y);
    // Задвижка
    g.lineStyle(3, s.gateOpen ? 0xe5534b : 0x8a8178);
    if (s.gateOpen) g.lineBetween(MAP.gate.x0 * TILE, y, MAP.gate.x0 * TILE + 10, y + 40);
    else g.lineBetween(MAP.gate.x0 * TILE, y, MAP.gate.x1 * TILE, y);
    if (s.gateOpen) this.label('задвижка открыта', 7, MAP.fenceY + 1.2, '#ffb4ae', 11);
  }

  private drawStations(s: State): void {
    const g = this.g;
    for (const [id, st] of Object.entries(MAP.stations)) {
      if (id === 'gate') continue;
      let fill = COLORS.station;
      if (id === 'fencePanel') fill = s.fenceOn ? 0x3f7d4f : 0x8c3b36;
      if (id === 'valve') fill = s.valveOpen ? 0x2f7fb8 : COLORS.station;
      if (id === 'dump') fill = 0x3c5a3a;
      g.fillStyle(fill).fillRect((st.x - st.w / 2) * TILE, (st.y - st.h / 2) * TILE, st.w * TILE, st.h * TILE);
      g.lineStyle(2, COLORS.stationEdge).strokeRect((st.x - st.w / 2) * TILE, (st.y - st.h / 2) * TILE, st.w * TILE, st.h * TILE);
    }
    const k = s.kitchen;
    const ks = MAP.stations.kitchen;
    const status = k.kasha.status === 'cooking' ? 'каша парится' : k.kasha.status === 'ready' ? `каша ×${k.kasha.portions}` : '';
    const veg = k.veg.portions ? `овощи ×${k.veg.portions}` : k.veg.stage > 0 && k.veg.stage < 5 ? `ужин ${k.veg.stage}/5` : '';
    this.label([status, veg, `тазы ${k.cleanBasins}`].filter(Boolean).join(' · '), ks.x, ks.y + 0.3, '#f5e6c8', 11);
    if (s.valveOpen) this.label('вода идёт', MAP.stations.valve.x, MAP.stations.valve.y + 0.8, '#9fd3f7', 11);
  }

  private drawItem(item: Item, x: number, y: number, scale = 1): void {
    const g = this.g;
    const px = x * TILE;
    const py = y * TILE;
    const c = ITEM_COLORS[item.kind];
    switch (item.kind) {
      case 'bucket': {
        g.fillStyle(c).fillCircle(px, py, 13 * scale);
        const fill = (item.liters ?? 0) / BALANCE.elephant.bucketCapacity;
        if (fill > 0) g.fillStyle(0xe8d44d).fillCircle(px, py, 11 * scale * Math.sqrt(fill));
        g.lineStyle(2, item.dirty ? 0x7a5c2e : 0xdfe8ee).strokeCircle(px, py, 13 * scale);
        break;
      }
      case 'basin':
        g.fillStyle(c).fillCircle(px, py, 14 * scale);
        if (item.food) g.fillStyle(item.food === 'kasha' ? 0xcaa877 : 0xd2693a).fillCircle(px, py, 10 * scale);
        break;
      case 'bag':
        g.fillStyle(c).fillRect(px - 12 * scale, py - 14 * scale, 24 * scale, 28 * scale);
        g.fillStyle(0x6b4a2a).fillRect(px - 10 * scale, py + 12 * scale - 24 * scale * ((item.fill ?? 0) / 6), 20 * scale, 24 * scale * ((item.fill ?? 0) / 6));
        break;
      case 'hay':
      case 'straw':
      case 'sawdust':
        g.fillStyle(c).fillRect(px - 12 * scale, py - 9 * scale, 24 * scale, 18 * scale);
        break;
      default:
        g.lineStyle(4 * scale, c).lineBetween(px - 12 * scale, py + 12 * scale, px + 12 * scale, py - 12 * scale);
        g.fillStyle(c).fillCircle(px + 12 * scale, py - 12 * scale, 5 * scale);
    }
  }

  private drawElephant(s: State, e: State['elephants'][number]): void {
    const g = this.g;
    const p = ELEPHANTS.find((x) => x.id === e.id)!;
    const px = e.x * TILE;
    const py = e.y * TILE;
    const lying = e.state === 'sleep';
    const dir = e.tx < e.x - 0.05 ? -1 : 1;
    g.fillStyle(0x000000, 0.25).fillEllipse(px, py + 18, 80, 26);
    if (lying) {
      g.fillStyle(p.color).fillEllipse(px, py + 6, 84, 44);
      g.fillStyle(p.color).fillCircle(px + dir * 40, py, 20);
    } else {
      const bob = e.state === 'walk' || e.state === 'sway' ? Math.sin(s.t * 6 + px) * 3 : 0;
      g.fillStyle(p.color).fillEllipse(px + (e.state === 'sway' ? bob * 2 : 0), py, 76, 52);
      g.fillStyle(p.color).fillCircle(px + dir * 36, py - 14 + bob, 22);
      g.fillStyle(0xd6a29f).fillEllipse(px + dir * 26, py - 16 + bob, 12, 22);
      g.lineStyle(7, p.color).lineBetween(px + dir * 50, py - 8 + bob, px + dir * 54, py + 18);
    }
    let status = '';
    let color = '#ffffff';
    let bg: string | undefined;
    if (e.signalStarted !== undefined) {
      status = p.signalText ? `! ${p.signalText}` : '! писает';
      color = '#1a1a1a';
      bg = '#ffd23f';
    } else if (lying) status = 'z z z';
    else if (e.state === 'sway') {
      status = '~ качается ~';
      color = '#ffb4ae';
    } else if (e.state === 'eatBasin' || e.state === 'eatHay') status = 'ест';
    else if (e.state === 'drink') status = 'пьёт';
    else if (s.t <= e.praiseUntil) {
      status = 'в бак! угости';
      color = '#7ee2a8';
    }
    this.label(p.name, e.x, e.y - 0.75, '#ffffff', 13);
    if (status) this.label(status, e.x, e.y - 1.1, color, 12, bg);
  }

  private drawPlayer(s: State): void {
    const g = this.g;
    const p = s.player;
    const px = p.x * TILE;
    const py = p.y * TILE;
    g.fillStyle(0x000000, 0.3).fillEllipse(px, py + 12, 28, 10);
    g.fillStyle(COLORS.player).fillCircle(px, py, 13);
    g.fillStyle(0xf1d2b0).fillCircle(px + p.facing.x * 5, py - 4 + p.facing.y * 5, 7);
    if (p.held) this.drawItem(p.held, p.x + 0.35, p.y - 0.5, 0.7);
  }

  private drawNight(s: State): void {
    const n = this.night;
    n.clear();
    const part = dayPart(s.t);
    const alpha = part === 'night' ? 0.45 : part === 'morning' ? 0.2 : s.t > 660 ? ((s.t - 660) / 60) * 0.45 : 0;
    if (alpha > 0) n.fillStyle(0x0b1030, alpha).fillRect(0, 0, MAP.w * TILE, MAP.h * TILE);
  }
}
