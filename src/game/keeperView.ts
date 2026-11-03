import Phaser from 'phaser';
import { KEEPER_HAND, KEEPER_W } from '../art/keeperPx';
import { PX } from '../art/pixel';
import type { State } from '../sim';
import { itemTexture } from './textures';

const TILE = 48;

// Кипер: два кадра шага, предмет в руке, над головой стрелка, когда рядом есть дело
export class KeeperView {
  // Спрайт открыт для следящей камеры (startFollow)
  sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private held: Phaser.GameObjects.Image;
  private arrow: Phaser.GameObjects.Image;
  private stars: Phaser.GameObjects.Text;
  private phase = 0;
  private facing = 1;
  private last = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene) {
    this.shadow = scene.add.image(0, 0, 'shadow-keeper').setScale(PX).setAlpha(0.3);
    this.sprite = scene.add.image(0, 0, 'keeper-0').setScale(PX).setOrigin(0.5, 1);
    this.held = scene.add.image(0, 0, 'item-bucket').setScale(2).setOrigin(0.5, 0.75).setVisible(false);
    this.arrow = scene.add.image(0, 0, 'fx-arrow').setScale(PX).setOrigin(0.5, 1).setVisible(false);
    this.stars = scene.add.text(0, 0, '💫', { fontSize: '22px' }).setOrigin(0.5, 1).setDepth(20004).setVisible(false);
  }

  update(s: State, time: number, actionReady: boolean): void {
    const p = s.player;
    const px = Math.round(p.x * TILE);
    const py = Math.round(p.y * TILE + 12);
    const moved = Math.hypot(px - this.last.x, py - this.last.y);
    this.last = { x: px, y: py };
    if (Math.abs(p.facing.x) > 0.2) this.facing = p.facing.x > 0 ? 1 : -1;
    if (moved > 0.3) this.phase += moved / 14;
    const frame = moved > 0.3 ? 1 + (Math.floor(this.phase) % 2) : 0;
    this.sprite
      .setTexture(`keeper-${frame}`)
      .setFlipX(this.facing < 0)
      .setPosition(px, py)
      .setRotation(p.knockdownTimer > 0 ? Math.PI / 2 : 0)
      .setDepth(py + 1);
    this.shadow.setPosition(px, py - 2).setDepth(py);
    this.stars.setVisible(p.knockdownTimer > 0).setPosition(px, py - 12);

    if (p.held) {
      const hx = (KEEPER_HAND.x - KEEPER_W / 2) * PX * this.facing;
      this.held
        .setTexture(itemTexture(p.held))
        .setVisible(true)
        .setFlipX(this.facing < 0)
        .setPosition(px + hx, py - (24 - KEEPER_HAND.y) * PX + 6)
        .setDepth(py + 2);
    } else this.held.setVisible(false);

    this.arrow
      .setVisible(actionReady)
      .setPosition(px, py - 26 * PX - (Math.floor(time * 4) % 2) * PX)
      .setDepth(20003);
  }
}
