import Phaser from 'phaser';
import { PX } from '../art/pixel';
import { BALANCE } from '../data/balance';
import type { State } from '../sim';

const TILE = 48;

// Тачка: корпус, содержимое слоями и стопка тюков, которая кренится при раскачке
export class BarrowView {
  private base: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private waste: Phaser.GameObjects.Image;
  private tools: Phaser.GameObjects.Image;
  private heap: Phaser.GameObjects.Image;
  private bales: Phaser.GameObjects.Image[] = [];
  private flip = false;

  constructor(scene: Phaser.Scene) {
    this.shadow = scene.add.image(0, 0, 'shadow-keeper').setScale(PX * 1.6, PX).setAlpha(0.3);
    this.base = scene.add.image(0, 0, 'barrow-base').setScale(PX).setOrigin(0.5, 0.95);
    this.heap = scene.add.image(0, 0, 'barrow-straw').setScale(PX).setOrigin(0.5, 0.95);
    this.waste = scene.add.image(0, 0, 'barrow-waste-1').setScale(PX).setOrigin(0.5, 0.95);
    this.tools = scene.add.image(0, 0, 'barrow-tools').setScale(PX).setOrigin(0.5, 0.95);
    for (let i = 0; i < BALANCE.barrow.maxBales; i++) this.bales.push(scene.add.image(0, 0, 'deco-bale').setScale(PX).setOrigin(0.5, 1));
  }

  update(s: State): void {
    const b = s.barrow;
    const fx = s.player.facing.x;
    // Ручки — к киперу: едем вправо — ручки слева
    if (b.pushed && Math.abs(fx) > 0.2) this.flip = fx > 0;
    // Спринт с гружёной тачкой: микро-шейк — дребезжит и сыплет
    const shaking = b.pushed && s.player.sprinting === true && (b.sawdust > 0 || b.straw > 0);
    const shx = shaking ? Math.round((Math.random() - 0.5) * 3) : 0;
    const shy = shaking ? Math.round((Math.random() - 0.5) * 2) : 0;
    const x = Math.round(b.x * TILE) + shx;
    const y = Math.round(b.y * TILE + 16) + shy;
    const depth = y;
    for (const im of [this.base, this.heap, this.waste, this.tools]) im.setPosition(x, y).setFlipX(this.flip).setDepth(depth);
    this.shadow.setPosition(x, y - 2).setDepth(depth - 1);
    this.heap.setDepth(depth + 0.1);
    this.waste.setDepth(depth + 0.2);
    this.tools.setDepth(depth + 0.3);

    const heap = b.straw > 0 ? 'barrow-straw' : b.sawdust > 0 ? 'barrow-sawdust' : '';
    this.heap.setVisible(!!heap);
    if (heap) this.heap.setTexture(heap);
    const share = b.waste / BALANCE.barrow.wasteCapacity;
    this.waste.setVisible(b.waste > 0).setTexture(`barrow-waste-${share > 0.66 ? 3 : share > 0.33 ? 2 : 1}`);
    this.tools.setVisible(b.tools.length > 0);

    // Тюки стопкой; верхние сдвигаются по крену — видно, куда валится
    const trayX = x + (this.flip ? 1 : -1) * 3 * PX;
    this.bales.forEach((im, i) => {
      const lean = Math.round(b.balance * (i + 1) * 2) * PX;
      im.setVisible(i < b.bales)
        .setPosition(trayX + lean, y - 9 * PX - i * 8 * PX)
        .setDepth(depth + 0.4 + i * 0.01);
    });
  }
}
