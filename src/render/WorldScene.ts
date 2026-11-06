// Главная сцена: строит мир из текстур и векторной графики и каждый кадр показывает состояние симуляции.

import Phaser from 'phaser';
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

  constructor(private hooks: SceneHooks) {
    super('world');
  }

  create(): void {
    const s = this.hooks.getState();
    loadStaticArt(this);
    buildGround(this);
    this.world = new WorldView(this, s);
    this.keeper = new KeeperView(this, s);
    this.fx = new Fx(this);
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
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPinch(p));
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

  private onPinch(p: Phaser.Input.Pointer): void {
    void p;
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

  update(time: number, delta: number): void {
    if (!this.ready) return;
    const dt = Math.min(0.1, delta / 1000);
    const events = this.hooks.frame(dt);
    const s = this.hooks.getState();
    this.rebuildHerd(s);
    for (const ev of events) this.fx.handle(ev);
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
    this.world.update(s, t, dt, cam);
    this.fx.update(dt);
    // Плавный зум
    const want = this.overview ? this.fitZoom() : this.baseZoom() * this.targetZoom;
    this.zoomLevel += (want - this.zoomLevel) * Math.min(1, dt * 7);
    cam.setZoom(this.zoomLevel);
  }
}
