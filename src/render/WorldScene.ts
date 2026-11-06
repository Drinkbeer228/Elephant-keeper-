// Главная сцена: строит мир из текстур и векторной графики и каждый кадр показывает состояние симуляции.

import Phaser from 'phaser';
import { SIGNS, SIGN_SCALE } from './ground';
import { labelScale, setLabelZoom } from './labels';
import { H, W } from '../data/facility';
import type { SimEvent, State } from '../sim';
import { ElephantView } from './ElephantView';
import { Fx } from './Fx';
import { buildGround } from './ground';
import { KeeperView } from './KeeperView';
import { loadElephantArt, loadStaticArt, PPM } from './textures';
import { WorldView } from './WorldView';

const P = PPM;

export interface SceneHooks {
  getState: () => State;
  frame: (dt: number) => SimEvent[];
  onSelect: (elephantId: string | null) => void;
  selected: () => string | null;
  showNames: () => boolean;
  marker: () => { x: number; y: number } | null;
  dpr: number;
}

export class WorldScene extends Phaser.Scene {
  private elephants = new Map<string, ElephantView>();
  private keeper!: KeeperView;
  private world!: WorldView;
  private fx!: Fx;
  private zoomLevel = 1; // относительно базового
  private targetZoom = 1;
  private overview = false;
  private ready = false;
  private herdKey = '';
  private pinch: { d: number; z: number } | null = null;
  private markerG!: Phaser.GameObjects.Graphics;

  constructor(private hooks: SceneHooks) {
    super('world');
  }

  create(): void {
    const s = this.hooks.getState();
    loadStaticArt(this);
    buildGround(this);
    this.world = new WorldView(this);
    this.keeper = new KeeperView(this, s);
    this.fx = new Fx(this);
    this.markerG = this.add.graphics().setDepth(72);
    this.rebuildHerd(s);
    const cam = this.cameras.main;
    cam.setBackgroundColor('#e8e4da');
    cam.setBounds(-3 * P, -3 * P, (W + 6) * P, (H + 6) * P);
    cam.startFollow(this.keeper.root, true, 0.12, 0.12);
    this.applyZoom(true);
    this.scale.on('resize', () => this.applyZoom(true));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.setZoom(this.targetZoom * (dy > 0 ? 0.88 : 1.14));
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p));
    this.input.on('pointermove', () => this.onPinch());
    this.input.on('pointerup', () => (this.pinch = null));
    this.input.addPointer(1);
    this.ready = true;
  }

  // Базовый масштаб: на экране около 30 м по ширине (на телефоне — 18 м)
  private baseZoom(): number {
    const cssW = this.scale.width / this.hooks.dpr;
    const cssH = this.scale.height / this.hooks.dpr;
    const metersW = cssW < 700 ? 17 : 30;
    const metersH = cssW < 700 ? 24 : 19;
    return Math.min(cssW / (metersW * P), cssH / (metersH * P)) * this.hooks.dpr;
  }

  private fitZoom(): number {
    return Math.min(this.scale.width / ((W + 2) * P), this.scale.height / ((H + 2) * P));
  }

  private applyZoom(now = false): void {
    const z = this.overview ? this.fitZoom() : this.baseZoom() * this.targetZoom;
    if (now) {
      this.zoomLevel = z;
      this.cameras.main.setZoom(z);
    }
  }

  setZoom(rel: number): void {
    this.overview = false;
    this.targetZoom = Math.max(0.55, Math.min(2.2, rel));
  }

  zoomBy(k: number): void {
    this.setZoom(this.targetZoom * k);
  }

  toggleOverview(): boolean {
    this.overview = !this.overview;
    const cam = this.cameras.main;
    if (this.overview) {
      cam.stopFollow();
      cam.pan((W / 2) * P, (H / 2) * P, 500, 'Sine.easeInOut');
    } else {
      cam.startFollow(this.keeper.root, true, 0.12, 0.12);
    }
    return this.overview;
  }

  focus(xM: number, yM: number): void {
    const cam = this.cameras.main;
    this.overview = false;
    cam.stopFollow();
    cam.pan(xM * P, yM * P, 450, 'Sine.easeInOut', true, (_c, k) => {
      if (k >= 1) this.time.delayedCall(1600, () => !this.overview && cam.startFollow(this.keeper.root, true, 0.12, 0.12));
    });
  }

  recenter(): void {
    this.overview = false;
    this.cameras.main.startFollow(this.keeper.root, true, 0.12, 0.12);
  }

  private onPointer(p: Phaser.Input.Pointer): void {
    if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
      const d = Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y);
      this.pinch = { d, z: this.targetZoom };
      return;
    }
    const wx = p.worldX / P;
    const wy = p.worldY / P;
    const s = this.hooks.getState();
    let best: string | null = null;
    let bestD = 2.6;
    for (const e of s.elephants) {
      const d = Math.hypot(e.x - wx, e.y - wy);
      if (d < bestD) {
        bestD = d;
        best = e.id;
      }
    }
    if (best) this.hooks.onSelect(best);
  }

  private onPinch(): void {
    if (!this.pinch || !this.input.pointer1.isDown || !this.input.pointer2.isDown) return;
    const d = Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y);
    this.setZoom(this.pinch.z * (d / Math.max(1, this.pinch.d)));
  }

  // Стадо сменилось (новая игра или загрузка) — пересоздать виды слонов
  rebuildHerd(s: State): void {
    const key = s.elephants.map((e) => `${e.id}:${e.profile.look.seed}`).join(',');
    if (key === this.herdKey) return;
    this.herdKey = key;
    for (const v of this.elephants.values()) v.destroy();
    this.elephants.clear();
    for (const e of s.elephants) {
      loadElephantArt(this, e.profile);
      this.elephants.set(e.id, new ElephantView(this, e));
    }
  }

  private lastNow = 0;

  update(time: number): void {
    if (!this.ready) return;
    // Реальное время между кадрами: Phaser сглаживает delta, а симуляции нужен честный счёт
    const now = performance.now();
    const dt = this.lastNow ? Math.min(0.25, (now - this.lastNow) / 1000) : 1 / 60;
    this.lastNow = now;
    const events = this.hooks.frame(dt);
    const s = this.hooks.getState();
    this.rebuildHerd(s);
    for (const ev of events) {
      this.fx.handle(ev);
      if (ev.kind.startsWith('stomp:') && ev.elephantId) this.elephants.get(ev.elephantId)?.stomp(ev.kind.slice(6));
      if (ev.kind === 'shake') this.world.shakeTree(ev.x, ev.y);
    }
    const t = time / 1000;
    const sel = this.hooks.selected();
    const names = this.hooks.showNames();
    for (const e of s.elephants) {
      const v = this.elephants.get(e.id);
      if (!v) continue;
      v.selected = sel === e.id;
      v.update(e, s, t, dt, names);
    }
    this.keeper.update(s, dt);
    const cam = this.cameras.main;
    this.world.update(s, t, dt);
    this.fx.update(dt);
    // Кольцо на цели главного действия: видно, что сделает E
    const mk = this.hooks.marker();
    this.markerG.clear();
    if (mk) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      this.markerG.lineStyle(0.07 * P, 0x2e5a44, 0.55 + 0.35 * pulse);
      this.markerG.strokeCircle(mk.x * P, mk.y * P, (0.42 + 0.08 * pulse) * P);
    }
    // Плавный зум
    const want = this.overview ? this.fitZoom() : this.baseZoom() * this.targetZoom;
    this.zoomLevel += (want - this.zoomLevel) * Math.min(1, dt * 7);
    cam.setZoom(this.zoomLevel);
    // Подписи — читаемого размера при любом зуме
    setLabelZoom(this.zoomLevel / this.baseZoom());
    const ls = SIGN_SCALE * labelScale();
    for (const sign of SIGNS) if (sign.scaleX !== ls) sign.setScale(ls);
  }
}
