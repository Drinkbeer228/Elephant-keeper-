import type Phaser from 'phaser';

// Пиксель-арт без картинок: формы задаются кодом (эллипсы, прямоугольники, линии),
// а генератор сам ставит чёрный контур и светотень в 3 тона, как в играх NES.
// Один «пиксель» рисунка = PX пикселей мира.

export const PX = 3;

export interface Tone {
  k?: string; // контур
  L: string; // свет
  M: string; // основной
  D: string; // тень
}

export type Mask = (x: number, y: number) => boolean;

export const ellipse =
  (cx: number, cy: number, rx: number, ry: number): Mask =>
  (x, y) =>
    ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;

export const rect =
  (x0: number, y0: number, x1: number, y1: number): Mask =>
  (x, y) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1;

export const union =
  (...m: Mask[]): Mask =>
  (x, y) =>
    m.some((f) => f(x, y));

export const minus =
  (a: Mask, b: Mask): Mask =>
  (x, y) =>
    a(x, y) && !b(x, y);

export const shift =
  (m: Mask, dx: number, dy: number): Mask =>
  (x, y) =>
    m(x - dx, y - dy);

// Толстая ломаная: всё, что ближе r к отрезкам
export function line(points: [number, number][], r: number): Mask {
  return (x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) <= r) return true;
    }
    return false;
  };
}

export class Sprite {
  px: (string | null)[];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Array(w * h).fill(null);
  }
  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x];
  }
  set(x: number, y: number, c: string | null): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }
  // Наложить другой спрайт со сдвигом
  draw(src: Sprite, dx = 0, dy = 0): this {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = src.get(x, y);
        if (c) this.set(x + dx, y + dy, c);
      }
    return this;
  }
  // Залить маску одним цветом (без контура)
  fill(m: Mask, c: string): this {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (m(x, y)) this.set(x, y, c);
    return this;
  }
  // Объёмная форма: контур + свет сверху + тень снизу
  shape(m: Mask, tone: Tone, outline = true): this {
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && m(x, y);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!inside(x, y)) continue;
        const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        if (edge && outline) {
          this.set(x, y, tone.k ?? '#000000');
          continue;
        }
        let up = 0;
        while (inside(x, y - up - 1)) up++;
        let down = 0;
        while (inside(x, y + down + 1)) down++;
        const leftEdge = !inside(x - 2, y);
        const ratio = up / (up + down + 1);
        const c = up <= (outline ? 1 : 0) || (leftEdge && ratio < 0.5) ? tone.L : ratio > 0.66 || down <= (outline ? 1 : 0) ? tone.D : tone.M;
        this.set(x, y, c);
      }
    }
    return this;
  }
  flipX(): Sprite {
    const s = new Sprite(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) s.set(this.w - 1 - x, y, this.get(x, y));
    return s;
  }
  toCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(this.w, this.h);
    this.px.forEach((col, i) => {
      if (!col) return;
      const n = parseInt(col.slice(1), 16);
      img.data[i * 4] = (n >> 16) & 255;
      img.data[i * 4 + 1] = (n >> 8) & 255;
      img.data[i * 4 + 2] = n & 255;
      img.data[i * 4 + 3] = 255;
    });
    g.putImageData(img, 0, 0);
    return c;
  }
}

// Спрайт из текстовой сетки: символ → цвет, «.» — прозрачно
export function grid(rows: string[], pal: Record<string, string>): Sprite {
  const s = new Sprite(Math.max(...rows.map((r) => r.length)), rows.length);
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== '.' && ch !== ' ' && s.set(x, y, pal[ch] ?? null)));
  return s;
}

export function register(scene: Phaser.Scene, key: string, sprite: Sprite | HTMLCanvasElement): void {
  const canvas = sprite instanceof Sprite ? sprite.toCanvas() : sprite;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
}

// Детерминированный шум для текстур
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
