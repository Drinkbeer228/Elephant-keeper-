import Phaser from 'phaser';
import { PX } from '../art/pixel';
import type { ElephantProfile } from '../data/elephants';
import type { Elephant, State } from '../sim';

const TILE = 48;
const FONT = '"Press Start 2P", monospace';

// Слониха: пиксельные кадры — стоит, шагает, топает, ест, спит
export class ElephantView {
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private name: Phaser.GameObjects.Text;
  facing = 1;
  private phase = 0;
  private last = { x: 0, y: 0 };
  private stompFrame = '';
  private seed = Math.random() * 10;

  constructor(
    scene: Phaser.Scene,
    readonly profile: ElephantProfile,
    private onStomp: (x: number, y: number) => void,
  ) {
    this.shadow = scene.add.image(0, 0, 'shadow-el').setScale(PX).setAlpha(0.3).setOrigin(0.5, 0.5);
    this.sprite = scene.add.image(0, 0, `el-${profile.id}-idle0`).setScale(PX).setOrigin(0.5, 1);
    this.name = scene.add
      .text(0, 0, profile.name.toUpperCase(), { fontFamily: FONT, fontSize: '8px', color: '#fcfcfc', backgroundColor: '#000000', padding: { x: 3, y: 2 } })
      .setOrigin(0.5, 1);
  }

  update(e: Elephant, _s: State, time: number): void {
    const px = Math.round(e.x * TILE);
    const py = Math.round(e.y * TILE + 16);
    const moved = Math.hypot(px - this.last.x, py - this.last.y);
    this.last = { x: px, y: py };
    if (e.state === 'walk' && Math.abs(e.tx - e.x) > 0.05) this.facing = e.tx > e.x ? 1 : -1;
    else if (e.state === 'eatHay' || e.state === 'drink' || e.state === 'eatBasin') {
      const target = e.state === 'eatHay' ? 2.2 : e.state === 'drink' ? 11.8 : this.profile.slot.x;
      if (Math.abs(target - e.x) > 0.3) this.facing = target > e.x ? 1 : -1;
    }

    const id = this.profile.id;
    const t = time + this.seed;
    const signaling = e.signalStarted !== undefined;
    let frame = 'idle0';
    let dx = 0;
    if (e.state === 'sleep') frame = 'lying';
    else if (e.state === 'walk' && moved > 0.05) {
      this.phase += moved / 9;
      frame = `walk${Math.floor(this.phase) % 4}`;
    } else if (signaling) {
      const front = this.profile.signal === 'frontStomp';
      const up = Math.floor(t * (front ? 4 : 3)) % 2 === 0;
      frame = up ? (front ? 'stomp' : 'stompBack') : front ? 'idle0' : 'idle1';
      if (this.stompFrame && this.stompFrame !== frame && !up) this.onStomp(px + this.facing * (front ? 7 : -13) * PX, py);
      this.stompFrame = frame;
    } else if (e.state === 'eatHay' || e.state === 'eatBasin' || e.state === 'drink') {
      frame = Math.floor(t * 2.5) % 2 === 0 ? 'eat' : 'idle0';
    } else if (e.state === 'sway') {
      frame = Math.floor(t * 3) % 2 === 0 ? 'idle0' : 'idle1';
      dx = (Math.floor(t * 3) % 2 === 0 ? 1 : -1) * PX;
    } else {
      frame = Math.floor(t * 0.9) % 3 === 0 ? 'idle1' : 'idle0';
    }

    this.sprite.setTexture(`el-${id}-${frame}`).setFlipX(this.facing < 0).setPosition(px + dx, py).setDepth(py);
    this.shadow.setTexture(e.state === 'sleep' ? 'shadow-lying' : 'shadow-el').setPosition(px, py - 2).setDepth(py - 1);

    // Над слонихой — только имя. Что она хочет, игрок читает по поведению: топот, стойка у решётки
    const top = py - (e.state === 'sleep' ? 16 : 31) * PX * (id === 'audrey' ? 0.88 : 1);
    this.name.setPosition(px, top).setDepth(20000);
  }
}
