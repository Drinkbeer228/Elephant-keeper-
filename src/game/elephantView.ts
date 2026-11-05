import Phaser from 'phaser';
import { PX } from '../art/pixel';
import { type ElephantProfile } from '../data/elephants';
import { MAP } from '../data/map';
import { displayTemperamentOf, STATE_LABELS, type Elephant, type State } from '../sim';

const TILE = 48;
const FONT = '"Press Start 2P", monospace';
const AI_DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ai') === '1';

// Слон: пиксельные кадры — стоит, шагает, топает, ест, спит, купается.
// Мокрая шкура темнеет (wetness) и светлеет обратно, пока слон сохнет
export class ElephantView {
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private name: Phaser.GameObjects.Text;
  facing = 1;
  private phase = 0;
  private last = { x: 0, y: 0 };
  private stompFrame = '';
  private musthMark: Phaser.GameObjects.Graphics;
  private musthTag: Phaser.GameObjects.Text;
  private traitTag: Phaser.GameObjects.Text;
  private seed = Math.random() * 10;

  constructor(
    scene: Phaser.Scene,
    readonly profile: ElephantProfile,
    private onStomp: (x: number, y: number) => void,
  ) {
    this.shadow = scene.add.image(0, 0, 'shadow-el').setScale(PX).setAlpha(0.3).setOrigin(0.5, 0.5);
    this.sprite = scene.add.image(0, 0, `el-${profile.id}-idle0`).setScale(PX).setOrigin(0.5, 1);
    this.name = scene.add
      .text(0, 0, profile.name.toUpperCase(), { fontFamily: FONT, fontSize: '8px', color: '#fcfcfc', backgroundColor: '#141210', padding: { x: 4, y: 2 } })
      .setOrigin(0.5, 1);
    this.musthMark = scene.add.graphics().setDepth(20001);
    this.musthTag = scene.add
      .text(0, 0, '💢 МУСТ', { fontFamily: FONT, fontSize: '8px', color: '#ff7070', backgroundColor: '#141210', padding: { x: 3, y: 2 } })
      .setOrigin(0.5, 1)
      .setDepth(20002)
      .setVisible(false);
    this.traitTag = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '6px', color: '#fce0a8', backgroundColor: '#141210', padding: { x: 3, y: 1 } })
      .setOrigin(0.5, 1)
      .setDepth(20001)
      .setVisible(profile.paddock === 'male' || AI_DEBUG);
  }

  update(e: Elephant, _s: State, time: number): void {
    const px = Math.round(e.x * TILE);
    const py = Math.round(e.y * TILE + 16);
    const moved = Math.hypot(px - this.last.x, py - this.last.y);
    this.last = { x: px, y: py };
    if (e.state === 'walk' && Math.abs(e.tx - e.x) > 0.05) this.facing = e.tx > e.x ? 1 : -1;
    else if (e.state === 'eatHay' || e.state === 'drink' || e.state === 'eatBasin') {
      // Цели — в своём загоне: кормушка, поилка, своё место для таза
      const lower = this.profile.paddock === 'male';
      const feeder = lower ? MAP.feeder2 : MAP.feeder;
      const trough = lower ? MAP.trough2 : MAP.trough;
      const target = e.state === 'eatHay' ? feeder.x : e.state === 'drink' ? trough.x : this.profile.slot.x;
      if (Math.abs(target - e.x) > 0.3) this.facing = target > e.x ? 1 : -1;
    }

    const id = this.profile.id;
    const t = time + this.seed;
    const signaling = e.signalStarted !== undefined;
    let frame = 'idle0';
    let dx = 0;
    if (e.state === 'sleep') frame = 'lying';
    else if (e.state === 'bathe') {
      // Купание: плещется — кадр с хоботом-крюком и лёгкое покачивание
      frame = Math.floor(t * 2.5) % 2 === 0 ? 'eat' : 'idle0';
      dx = Math.round(Math.sin(t * 3) * 1.5) * PX;
    } else if (e.state === 'walk' && moved > 0.05) {
      this.phase += moved / 9;
      frame = `walk${Math.floor(this.phase) % 4}`;
    } else if (signaling) {
      const front = this.profile.signal === 'frontStomp';
      const up = Math.floor(t * (front ? 4 : 3)) % 2 === 0;
      frame = up ? (front ? 'stomp' : 'stompBack') : front ? 'idle0' : 'idle1';
      if (this.stompFrame && this.stompFrame !== frame && !up) this.onStomp(px + this.facing * (front ? 7 : -13) * PX, py);
      this.stompFrame = frame;
    } else if (e.state === 'scratch') {
      frame = Math.floor(t * 3) % 2 === 0 ? 'eat' : 'idle0';
      dx = Math.round(Math.sin(t * 5) * 1.5) * PX;
    } else if (e.state === 'eatHay' || e.state === 'eatBasin' || e.state === 'drink') {
      frame = Math.floor(t * 2.5) % 2 === 0 ? 'eat' : 'idle0';
    } else if (e.state === 'sway') {
      frame = Math.floor(t * 3) % 2 === 0 ? 'idle0' : 'idle1';
      dx = (Math.floor(t * 3) % 2 === 0 ? 1 : -1) * PX;
    } else {
      frame = Math.floor(t * 0.9) % 3 === 0 ? 'idle1' : 'idle0';
    }

    this.sprite.setTexture(`el-${id}-${frame}`).setFlipX(this.facing < 0).setPosition(px + dx, py).setDepth(py);
    // Мокрая кожа темнеет: белый тон → тёмно-графитовый по wetness
    const wet = Math.min(1, e.wetness / 100);
    if (wet > 0.02) {
      const mix = (from: number, to: number) => Math.round(from + (to - from) * wet * 0.62);
      const shade = e.musthTimer > 0 ? 0.68 : 1;
      const tint = (Math.round(mix(0xfc, 0x34) * shade) << 16) | (Math.round(mix(0xfc, 0x44) * shade) << 8) | Math.round(mix(0xfc, 0x54) * shade);
      this.sprite.setTint(tint);
    } else if (e.musthTimer > 0) this.sprite.setTint(0x999999);
    else this.sprite.clearTint();
    this.shadow.setTexture(e.state === 'sleep' ? 'shadow-lying' : 'shadow-el').setPosition(px, py - 2).setDepth(py - 1);

    const top = py - (e.state === 'sleep' ? 16 : 31) * PX * (id === 'audrey' || id === 'caesar' ? 0.88 : 1);
    this.name.setPosition(px, top).setDepth(20000);
    if (AI_DEBUG) {
      const temp = displayTemperamentOf(this.profile).name.toUpperCase();
      const stLabel = STATE_LABELS[e.state] ?? e.state;
      const tr = e.fsm?.transitions ?? 0;
      this.traitTag.setText(`${temp} • ${stLabel} (#${tr})`).setPosition(px, top - 10);
    } else if (this.profile.paddock === 'male') {
      const traits = [
        e.traits.appetite >= 1.2 ? 'ПРОЖОРЛИВЫЙ' : e.traits.appetite <= 0.9 ? 'СКРОМНЫЙ' : '',
        e.traits.messiness >= 1.2 ? 'ГРЯЗНУЛЯ' : '',
        e.traits.aggression >= 1.2 ? 'БУЙНЫЙ' : '',
      ].filter(Boolean);
      this.traitTag.setText(traits[0] ?? 'СПОКОЙНЫЙ').setPosition(px, top - 10);
    }
    this.musthTag.setVisible(e.musthTimer > 0).setPosition(px, top + 8);
    this.musthMark.clear();
    if (e.musthTimer > 0) {
      this.musthMark.fillStyle(0x302020, 1);
      this.musthMark.fillRect(px - 13 * PX, py - 31 * PX, 3 * PX, 2 * PX);
      this.musthMark.fillRect(px + 10 * PX, py - 31 * PX, 3 * PX, 2 * PX);
    }
  }
}
