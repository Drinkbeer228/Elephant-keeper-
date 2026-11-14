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
import { KittenView } from './KittenView';
import { loadElephantArt, loadStaticArt, PPM } from './textures';
import { WorldView } from './WorldView';

const P = PPM;

// Что подсветить как цель подсказки: слониху — кольцом вокруг неё, станцию или ворота — рамкой,
// вещь или место работы — кружком
export interface FocusMark {
  x: number;
  y: number;
  rect: { x0: number; y0: number; x1: number; y1: number } | null;
  elephantId: string | null;
  enabled: boolean; // главное действие сейчас доступно
}

export interface SceneHooks {
  getState: () => State;
  frame: (dt: number) => SimEvent[];
  onSelect: (elephantId: string | null) => void;
  onKitten: () => void;
  onTap: (x: number, y: number, elephantId: string | null) => void; // клик или касание в мире, метры
  selected: () => string | null;
  showNames: () => boolean;
  marker: () => FocusMark | null;
  insets: () => { top: number; bottom: number }; // сколько экрана сверху и снизу занято интерфейсом, CSS-пиксели
  dpr: number;
}

export class WorldScene extends Phaser.Scene {
  private elephants = new Map<string, ElephantView>();
  private keeper!: KeeperView;
  private kitten!: KittenView;
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
    this.kitten = new KittenView(this, s);
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
    // Котёнок маленький: попасть по нему — значит спросить, чем он занят
    if (Math.hypot(s.kitten.x - wx, s.kitten.y - wy) < 0.6) {
      this.hooks.onKitten();
      this.hooks.onTap(wx, wy, null);
      return;
    }
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
    // Тот же клик выбирает объект целью подсказки
    this.hooks.onTap(wx, wy, best);
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
    // Сначала отпустить всё, что рисуется текстурами старого стада, потом заменить текстуры
    this.world.dropHerdImages();
    this.keeper.dropHerdImages();
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
    const mk = this.hooks.marker();
    // Линия подсветки не тоньше 2.6 пикселя экрана при любом масштабе — её видно и на телефоне
    const line = Math.max(0.07 * P, (2.6 * this.hooks.dpr) / Math.max(0.01, this.zoomLevel));
    for (const e of s.elephants) {
      const v = this.elephants.get(e.id);
      if (!v) continue;
      v.selected = sel === e.id;
      v.focus = mk && mk.elephantId === e.id ? (mk.enabled ? 1 : 0.5) : 0;
      v.focusLine = line;
      v.update(e, s, t, dt, names);
    }
    this.keeper.update(s, dt);
    this.kitten.update(s, t, dt);
    const cam = this.cameras.main;
    this.world.update(s, t, dt);
    this.fx.update(dt);
    // Подсветка цели подсказки: видно, к чему относится главное действие. Слониху подсвечивает
    // её собственный вид (кольцо вокруг корпуса), здесь — станции, ворота, вещи и место работы.
    // Светлая подложка под зелёной линией — чтобы читалось на любом полу
    const g = this.markerG;
    g.clear();
    if (mk && !mk.elephantId) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      const k = mk.enabled ? 1 : 0.5;
      const stroke = (width: number, color: number, alpha: number) => {
        g.lineStyle(width, color, alpha);
        const r = mk.rect;
        if (r) {
          const pad = 0.12 + 0.05 * pulse;
          g.strokeRoundedRect((r.x0 - pad) * P, (r.y0 - pad) * P, (r.x1 - r.x0 + pad * 2) * P, (r.y1 - r.y0 + pad * 2) * P, 0.16 * P);
        } else g.strokeCircle(mk.x * P, mk.y * P, (0.46 + 0.07 * pulse) * P);
      };
      stroke(line * 2.2, 0xf4f1ea, 0.8 * k);
      stroke(line, 0x2e5a44, (0.7 + 0.3 * pulse) * k);
    }
    // Плавный зум
    const want = this.overview ? this.fitZoom() : this.baseZoom() * this.targetZoom;
    this.zoomLevel += (want - this.zoomLevel) * Math.min(1, dt * 7);
    cam.setZoom(this.zoomLevel);
    // Кипер — в середине свободной от интерфейса части экрана, а не всего экрана; у края карты
    // камера может уйти за него ровно настолько, сколько закрыто интерфейсом
    const ins = this.hooks.insets();
    const perCss = this.hooks.dpr / Math.max(0.01, this.zoomLevel); // пикселей мира в одном CSS-пикселе
    cam.setFollowOffset(0, -((ins.bottom - ins.top) / 2) * perCss);
    cam.setBounds(-3 * P, -3 * P - ins.top * perCss, (W + 6) * P, (H + 6) * P + (ins.top + ins.bottom) * perCss);
    // Подписи — читаемого размера при любом зуме
    setLabelZoom(this.zoomLevel / this.baseZoom());
    const ls = SIGN_SCALE * labelScale();
    for (const sign of SIGNS) if (sign.scaleX !== ls) sign.setScale(ls);
  }
}
