import Phaser from 'phaser';
import type { Held, State } from '../sim';
import { D } from './ground';
import { C, hex } from './palette';
import { ART_SCALE, originOf, PPM } from './textures';

const P = PPM;

function heldKey(h: Held): string {
  if (h.kind === 'tank') return h.load > 0 ? 'item-tank-full' : h.aux ? 'item-tank-dirty' : 'item-tank';
  if (h.kind === 'porridge') return h.load > 0 ? 'item-porridge' : 'item-porridge-empty';
  if (h.kind === 'tub') return `tub-${h.owner}`;
  return `item-${h.kind}`;
}

const LONG = new Set(['shovel', 'rake', 'broom', 'mop']);
const BULKY = new Set(['hay', 'straw', 'sawdust', 'bamboo', 'browse']);

// Кипер: вид сверху — плечи в форме, кепка, руки с вещью; шаги и рабочий таймер
export class KeeperView {
  readonly root: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Image;
  private feet: Phaser.GameObjects.Graphics;
  private held: Phaser.GameObjects.Image;
  private progress: Phaser.GameObjects.Graphics;
  private facing = 0;
  private phase = 0;
  private lastX = 0;
  private lastY = 0;

  constructor(private scene: Phaser.Scene, s: State) {
    const img = (key: string) => {
      const o = originOf(key);
      return scene.add.image(0, 0, key).setOrigin(o.ox, o.oy).setScale(ART_SCALE);
    };
    this.shadow = img('shadow-keeper').setDepth(D.shadow).setScale(ART_SCALE * 1.3);
    this.feet = scene.add.graphics();
    this.held = img('item-shovel').setVisible(false);
    const body = img('keeper-body');
    const head = img('keeper-head');
    this.root = scene.add.container(s.keeper.x * P, s.keeper.y * P, [this.feet, this.held, body, head]).setScale(1.3);
    this.progress = scene.add.graphics().setDepth(D.marker);
    this.facing = s.keeper.facing;
    this.lastX = s.keeper.x;
    this.lastY = s.keeper.y;
  }

  get x(): number {
    return this.root.x;
  }

  get y(): number {
    return this.root.y;
  }

  update(s: State, dt: number): void {
    const k = s.keeper;
    const moved = Math.hypot(k.x - this.lastX, k.y - this.lastY);
    this.lastX = k.x;
    this.lastY = k.y;
    this.phase += moved * 7;
    let d = k.facing - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * Math.min(1, dt * 14);
    this.root.setPosition(k.x * P, k.y * P).setRotation(this.facing).setDepth(D.actor + k.y / 100 + 0.001);
    this.shadow.setPosition((k.x + 0.12) * P, (k.y + 0.16) * P);

    // Шаги
    const g = this.feet;
    g.clear();
    const stride = moved > 0.0005 ? Math.sin(this.phase) * 0.12 : 0;
    g.fillStyle(hex('#3c3a36'), 1);
    g.fillEllipse(stride * P, 0.11 * P, 0.2 * P, 0.11 * P);
    g.fillEllipse(-stride * P, -0.11 * P, 0.2 * P, 0.11 * P);

    // Вещь в руках
    const h = k.held;
    if (h) {
      const key = heldKey(h);
      if (this.scene.textures.exists(key)) {
        const o = originOf(key);
        this.held.setTexture(key).setOrigin(o.ox, o.oy).setVisible(true);
        const x = LONG.has(h.kind) ? 0.55 : h.kind === 'hose' ? 0.32 : h.kind === 'tub' ? 0.55 : 0.42;
        const scale = BULKY.has(h.kind) ? 0.85 : h.kind === 'tub' ? 0.7 : 1;
        this.held.setPosition(x * P, 0).setScale(ART_SCALE * scale);
      } else this.held.setVisible(false);
    } else this.held.setVisible(false);

    // Работа идёт: кольцо прогресса над головой
    this.progress.clear();
    if (k.task) {
      const f = Math.min(1, k.task.elapsed / k.task.dur);
      const cx = k.x * P;
      const cy = (k.y - 0.85) * P;
      this.progress.fillStyle(hex(C.paper), 0.95);
      this.progress.fillCircle(cx, cy, 0.24 * P);
      this.progress.lineStyle(0.07 * P, hex(C.sage), 1);
      this.progress.beginPath();
      this.progress.arc(cx, cy, 0.17 * P, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      this.progress.strokePath();
      this.progress.lineStyle(0.03 * P, hex(C.ink), 1);
      this.progress.strokeCircle(cx, cy, 0.24 * P);
    }
  }
}
