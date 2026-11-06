// Нарезка овощей крупным планом, от первого лица: ящик с овощами, разделочная доска, нож и таз.
// Левая рука берёт овощ из ящика и бросает его в таз, правая с ножом обрезает хвостик.
// Касание левой или правой половины экрана, клавиши A/← и D/→, Esc — отложить нарезку.
// Что получилось, решает симуляция (действия prepPick / prepTrim / prepExit); здесь только
// картинка и анимации по её событиям.

import { nameCase, nextVeg, shiftDay, tubById, type SimEvent, type State } from '../sim';
import { VEG_KINDS, VEG_LABEL, vegPlan, type VegKind } from '../data/rations';

export type PrepSide = 'L' | 'R';

export interface PrepHandlers {
  act: (side: PrepSide) => void;
  exit: () => void;
}

type Shape = 'oval' | 'carrot' | 'round' | 'long' | 'pumpkin' | 'pepper' | 'cabbage' | 'drop';

interface VegArt {
  body: string;
  dark: string;
  cut: string;
  tail: string;
  leaf: string;
  shape: Shape;
  w: number;
  h: number;
}

const ART: Record<VegKind, VegArt> = {
  potato: { body: '#c69a62', dark: '#8a6237', cut: '#f2e2b0', tail: '#b9c98a', leaf: '#7fa45a', shape: 'oval', w: 1.15, h: 0.82 },
  carrot: { body: '#ec8b3b', dark: '#b2591d', cut: '#f7b56d', tail: '#5d9a3b', leaf: '#4a8a32', shape: 'carrot', w: 1.55, h: 0.48 },
  beet: { body: '#7e2343', dark: '#4c1128', cut: '#c03866', tail: '#b5334f', leaf: '#4f8a3a', shape: 'round', w: 0.92, h: 0.92 },
  pumpkin: { body: '#e69b3d', dark: '#a8621d', cut: '#f6c66f', tail: '#6d6f3a', leaf: '#5f8a3a', shape: 'pumpkin', w: 1.3, h: 1.08 },
  zucchini: { body: '#5d8d3d', dark: '#345e22', cut: '#e5ecb9', tail: '#83a050', leaf: '#5f8a3a', shape: 'long', w: 1.7, h: 0.52 },
  cabbage: { body: '#abcc8a', dark: '#6c9752', cut: '#eef4d6', tail: '#e3ecc6', leaf: '#8fbf6c', shape: 'cabbage', w: 1.1, h: 1.06 },
  pepper: { body: '#d33d2c', dark: '#8d2016', cut: '#f28b6c', tail: '#4e8a3a', leaf: '#4e8a3a', shape: 'pepper', w: 1.0, h: 0.92 },
  eggplant: { body: '#4d2d61', dark: '#2a1638', cut: '#efe6c8', tail: '#557d3b', leaf: '#557d3b', shape: 'drop', w: 1.45, h: 0.72 },
  apple: { body: '#c9442f', dark: '#85251a', cut: '#f6e7b9', tail: '#6b4a26', leaf: '#5f9a3a', shape: 'round', w: 0.84, h: 0.84 },
};

const INK = '#2c302e';
const GLOVE = '#4a77aa';
const GLOVE_DARK = '#2f5583';

function parse(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgb(r: number, g: number, b: number): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

function mix(a: string, b: string, t: number): string {
  const x = parse(a);
  const y = parse(b);
  return rgb(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

function shade(c: string, k: number): string {
  return k >= 0 ? mix(c, '#ffffff', k) : mix(c, '#000000', -k);
}

// Скруглённый прямоугольник без ctx.roundRect (его нет в Safari до 16)
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Небольшой детерминированный разброс для раскладки овощей в ящике и в тазу
function jitter(i: number, k: number): number {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// ---------------------------------------------------------------------------
// Рисование овощей: хвостик всегда справа — со стороны ножа
// ---------------------------------------------------------------------------

function bodyPath(ctx: CanvasRenderingContext2D, shape: Shape, rx: number, ry: number): void {
  ctx.beginPath();
  switch (shape) {
    case 'carrot':
      ctx.moveTo(-rx, 0);
      ctx.quadraticCurveTo(-rx * 0.3, -ry * 0.92, rx * 0.74, -ry);
      ctx.quadraticCurveTo(rx * 1.03, -ry * 0.62, rx, 0);
      ctx.quadraticCurveTo(rx * 1.03, ry * 0.62, rx * 0.74, ry);
      ctx.quadraticCurveTo(-rx * 0.3, ry * 0.92, -rx, 0);
      break;
    case 'pepper':
      ctx.moveTo(rx * 0.8, -ry * 0.75);
      ctx.bezierCurveTo(rx * 0.2, -ry * 1.06, -rx * 0.9, -ry * 0.92, -rx, -ry * 0.3);
      ctx.bezierCurveTo(-rx * 1.08, 0, -rx * 1.05, ry * 0.25, -rx, ry * 0.36);
      ctx.bezierCurveTo(-rx * 0.9, ry * 0.95, rx * 0.2, ry * 1.06, rx * 0.8, ry * 0.75);
      ctx.bezierCurveTo(rx * 1.05, ry * 0.5, rx * 1.05, -ry * 0.5, rx * 0.8, -ry * 0.75);
      break;
    case 'drop':
      ctx.moveTo(rx, 0);
      ctx.bezierCurveTo(rx * 0.9, -ry * 0.62, -rx * 0.2, -ry * 1.1, -rx * 0.74, -ry * 0.86);
      ctx.bezierCurveTo(-rx * 1.1, -ry * 0.6, -rx * 1.1, ry * 0.6, -rx * 0.74, ry * 0.86);
      ctx.bezierCurveTo(-rx * 0.2, ry * 1.1, rx * 0.9, ry * 0.62, rx, 0);
      break;
    default:
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  }
  ctx.closePath();
}

function details(ctx: CanvasRenderingContext2D, kind: VegKind, rx: number, ry: number, lw: number): void {
  const a = ART[kind];
  ctx.lineWidth = lw * 0.7;
  ctx.strokeStyle = shade(a.dark, -0.1);
  ctx.fillStyle = a.dark;
  switch (kind) {
    case 'potato':
      for (const [x, y] of [
        [-0.45, -0.3],
        [0.1, 0.35],
        [0.45, -0.2],
        [-0.15, 0.05],
      ])
        ctx.fillRect(rx * x - lw * 0.6, ry * y - lw * 0.5, lw * 1.2, lw);
      break;
    case 'carrot':
      for (const x of [-0.45, -0.1, 0.25, 0.55]) {
        ctx.beginPath();
        ctx.moveTo(rx * x, -ry * (0.3 + x * 0.3));
        ctx.lineTo(rx * x + lw, -ry * (0.05 + x * 0.1));
        ctx.stroke();
      }
      break;
    case 'beet':
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(-rx * 0.95, ry * 0.1);
      ctx.quadraticCurveTo(-rx * 1.25, ry * 0.15, -rx * 1.45, ry * 0.42);
      ctx.stroke();
      break;
    case 'pumpkin':
      for (const k of [0.55, 0.22]) {
        ctx.beginPath();
        ctx.ellipse(0, 0, rx * k, ry * 0.98, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case 'zucchini':
      ctx.fillStyle = shade(a.body, 0.35);
      for (let i = 0; i < 7; i++) ctx.fillRect(rx * (jitter(i, 3) * 1.4 - 0.75), ry * (jitter(i, 5) - 0.5), lw * 1.4, lw * 0.7);
      break;
    case 'cabbage':
      for (const k of [0.75, 0.45]) {
        ctx.beginPath();
        ctx.arc(rx * 0.95, 0, rx * k * 1.25, Math.PI * 0.62, Math.PI * 1.38);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(rx * 0.9, 0);
      ctx.lineTo(-rx * 0.7, 0);
      ctx.stroke();
      break;
    case 'apple':
      ctx.fillStyle = 'rgba(232, 200, 90, 0.35)';
      ctx.beginPath();
      ctx.ellipse(-rx * 0.3, ry * 0.25, rx * 0.4, ry * 0.32, 0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
      break;
  }
  // Блик
  ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
  ctx.beginPath();
  ctx.ellipse(-rx * 0.32, -ry * 0.45, rx * 0.22, ry * 0.12, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

// Хвостик: от точки (rx·0.92, 0) вправо
function drawTail(ctx: CanvasRenderingContext2D, kind: VegKind, rx: number, ry: number, lw: number): void {
  const a = ART[kind];
  const x0 = rx * 0.92;
  const s = Math.max(ry, rx * 0.5);
  ctx.lineCap = 'round';
  const stalk = (len: number, bend: number, width: number, color: string) => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = width + lw * 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.quadraticCurveTo(x0 + len * 0.6, bend * 0.4, x0 + len, bend);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  const leaf = (x: number, y: number, rot: number, len: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(len * 0.5, 0, len * 0.55, len * 0.24, 0, 0, Math.PI * 2);
    ctx.fillStyle = a.leaf;
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  };
  switch (kind) {
    case 'potato':
      stalk(s * 0.45, -s * 0.25, lw * 1.6, a.tail);
      leaf(x0 + s * 0.42, -s * 0.24, -0.6, s * 0.3);
      break;
    case 'carrot':
      for (const b of [-0.75, -0.25, 0.25, 0.75]) stalk(s * 1.9, b * s * 1.1, lw * 1.5, a.tail);
      for (const b of [-0.75, 0.75]) leaf(x0 + s * 1.7, b * s * 1.05, b * 0.5, s * 0.8);
      leaf(x0 + s * 1.85, 0, 0, s * 0.85);
      break;
    case 'beet':
      for (const b of [-0.55, 0, 0.55]) stalk(s * 1.15, b * s, lw * 1.8, a.tail);
      for (const b of [-0.55, 0, 0.55]) leaf(x0 + s * 1.1, b * s, b * 0.6, s * 0.9);
      break;
    case 'pumpkin':
    case 'zucchini':
      stalk(s * 0.5, -s * 0.06, s * 0.2, a.tail);
      break;
    case 'pepper':
      stalk(s * 0.55, -s * 0.22, s * 0.16, a.tail);
      break;
    case 'cabbage':
      ctx.beginPath();
      ctx.arc(x0, 0, s * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = a.tail;
      ctx.fill();
      ctx.lineWidth = lw;
      ctx.strokeStyle = INK;
      ctx.stroke();
      leaf(x0 + s * 0.05, -s * 0.18, -0.9, s * 0.7);
      break;
    case 'eggplant':
      stalk(s * 0.6, 0, s * 0.18, a.tail);
      for (const b of [-0.8, -0.3, 0.3, 0.8]) leaf(x0 - s * 0.05, 0, b * 1.2 + Math.PI, s * 0.55);
      break;
    case 'apple':
      stalk(s * 0.45, -s * 0.2, lw * 2.2, a.tail);
      leaf(x0 + s * 0.3, -s * 0.18, -0.5, s * 0.5);
      break;
  }
}

function drawVeg(ctx: CanvasRenderingContext2D, kind: VegKind, x: number, y: number, r: number, rot: number, trimmed: boolean, simple = false): void {
  const a = ART[kind];
  const rx = r * a.w;
  const ry = r * a.h;
  const lw = Math.max(1, r * 0.05);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (!simple) {
    ctx.fillStyle = 'rgba(44, 48, 46, 0.18)';
    ctx.beginPath();
    ctx.ellipse(rx * 0.08, ry * 0.35, rx * 0.95, ry * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!trimmed && !simple) drawTail(ctx, kind, rx, ry, lw);
  bodyPath(ctx, a.shape, rx, ry);
  if (simple) ctx.fillStyle = a.body;
  else {
    const g = ctx.createRadialGradient(-rx * 0.35, -ry * 0.4, ry * 0.1, 0, 0, Math.max(rx, ry) * 1.1);
    g.addColorStop(0, shade(a.body, 0.22));
    g.addColorStop(0.62, a.body);
    g.addColorStop(1, a.dark);
    ctx.fillStyle = g;
  }
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (!simple) details(ctx, kind, rx, ry, lw);
  if (trimmed && !simple) {
    ctx.beginPath();
    ctx.ellipse(rx * 0.9, 0, Math.max(2, rx * 0.08), ry * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = a.cut;
    ctx.fill();
    ctx.lineWidth = lw * 0.8;
    ctx.stroke();
  }
  ctx.restore();
}

// Перчатка, вид сверху: пальцы направлены по +x
function glove(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, curl: number, thumbUp: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.lineWidth = Math.max(1.2, s * 0.06);
  ctx.strokeStyle = INK;
  // Рукав
  ctx.fillStyle = '#e9e4d8';
  ctx.beginPath();
  rrect(ctx, -s * 1.6, -s * 0.42, s * 1.15, s * 0.84, s * 0.12);
  ctx.fill();
  ctx.stroke();
  const fingerLen = s * (0.62 - curl * 0.28);
  ctx.fillStyle = GLOVE;
  for (const fy of [-0.32, -0.11, 0.11, 0.32]) {
    ctx.beginPath();
    rrect(ctx, s * 0.28, s * fy - s * 0.1, fingerLen + s * 0.1 * (1 - Math.abs(fy) * 1.5), s * 0.2, s * 0.1);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  rrect(ctx, -s * 0.55, -s * 0.44, s * 0.95, s * 0.88, s * 0.3);
  ctx.fill();
  ctx.stroke();
  // Большой палец
  const ty = thumbUp ? -1 : 1;
  ctx.beginPath();
  ctx.save();
  ctx.translate(-s * 0.05, ty * s * 0.36);
  ctx.rotate(ty * (0.75 - curl * 0.5));
  rrect(ctx, 0, -s * 0.1, s * 0.52, s * 0.21, s * 0.1);
  ctx.restore();
  ctx.fill();
  ctx.stroke();
  // Манжета
  ctx.fillStyle = GLOVE_DARK;
  ctx.beginPath();
  rrect(ctx, -s * 0.62, -s * 0.4, s * 0.18, s * 0.8, s * 0.06);
  ctx.fill();
  ctx.restore();
}

function knife(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, rot: number): void {
  // (x, y) — точка лезвия, которой режем; кончик слева
  const bh = len * 0.19;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.translate(len * 0.35, 0);
  ctx.lineWidth = Math.max(1.2, len * 0.018);
  ctx.strokeStyle = INK;
  // Лезвие
  const g = ctx.createLinearGradient(0, -bh, 0, 0);
  g.addColorStop(0, '#9aa3a8');
  g.addColorStop(0.55, '#dfe5e8');
  g.addColorStop(1, '#f7fafb');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -bh);
  ctx.lineTo(-len * 0.82, -bh * 0.82);
  ctx.quadraticCurveTo(-len * 1.02, -bh * 0.5, -len, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Рукоять
  ctx.fillStyle = '#2f2b28';
  ctx.beginPath();
  rrect(ctx, 0, -bh * 0.9, len * 0.5, bh * 0.78, bh * 0.3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#c9c4b8';
  for (const k of [0.14, 0.3]) {
    ctx.beginPath();
    ctx.arc(len * k, -bh * 0.51, bh * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Кулак на рукояти
  const cx = x + Math.cos(rot) * len * 0.6 - Math.sin(rot) * -bh * 0.5;
  const cy = y + Math.sin(rot) * len * 0.6 + Math.cos(rot) * -bh * 0.5;
  glove(ctx, cx + len * 0.08, cy, len * 0.26, rot + Math.PI, 1, false);
}

// ---------------------------------------------------------------------------
// Раскладка экрана
// ---------------------------------------------------------------------------

interface Layout {
  W: number;
  H: number;
  board: { x: number; y: number; w: number; h: number }; // центр
  crate: { x: number; y: number; w: number; h: number }; // левый верх
  tub: { x: number; y: number; r: number }; // центр
  veg: { x: number; y: number; r: number };
}

// top и bottom — где кончается шапка и начинаются подсказки рук (меряются по DOM)
function layout(W: number, H: number, top: number, bottom: number): Layout {
  const ah = Math.max(240, H - top - bottom);
  const portrait = W < H * 0.9;
  let board;
  let crate;
  let tub;
  if (portrait) {
    const bw = Math.min(W * 0.6, ah * 0.52);
    board = { x: W * 0.6, y: top + ah * 0.47, w: bw, h: bw * 0.64 };
    const cw = Math.min(W * 0.42, ah * 0.3);
    crate = { x: W * 0.04, y: top + ah * 0.02, w: cw, h: cw * 0.64 };
    const tr = Math.min(W * 0.2, ah * 0.15);
    tub = { x: W * 0.06 + tr, y: top + ah - tr * 1.06, r: tr };
  } else {
    const bw = Math.min(W * 0.4, ah * 0.85);
    board = { x: W * 0.54, y: top + ah * 0.5, w: bw, h: bw * 0.62 };
    const cw = Math.min(W * 0.23, ah * 0.48);
    crate = { x: W * 0.05, y: top + ah * 0.03, w: cw, h: cw * 0.66 };
    const tr = Math.min(W * 0.1, ah * 0.22);
    tub = { x: W * 0.05 + cw * 0.5, y: top + ah - tr * 1.05, r: tr };
  }
  const r = board.h * 0.22;
  return { W, H, board, crate, tub, veg: { x: board.x - board.w * 0.08, y: board.y, r } };
}

// ---------------------------------------------------------------------------
// Экран нарезки
// ---------------------------------------------------------------------------

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  max: number;
  size: number;
  color: string;
  veg: VegKind | null; // хвостик этого овоща; иначе капля
}

interface Flyer {
  veg: VegKind;
  t: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Floater {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
  big: boolean;
}

interface Snapshot {
  owner: string;
  color: string;
  veg: Record<VegKind, number>;
  plan: Partial<Record<VegKind, number>>;
  planKg: number;
  next: VegKind | null;
  stock: number;
  hand: VegKind | null;
  trimmed: boolean;
  combo: number;
}

export class PrepView {
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private refs: Record<string, HTMLElement> = {};
  private open = false;
  private closing = 0;
  private headKey = '';
  private snap: Snapshot | null = null;
  private pickT = 1;
  private chopT = 1;
  private chopSpawned = true;
  private chopKind: VegKind | null = null;
  private flickT = 1;
  private missT = 1;
  private doneT = 0;
  private particles: Particle[] = [];
  private flyers: Flyer[] = [];
  private floaters: Floater[] = [];
  private inFlight: Partial<Record<VegKind, number>> = {};
  private size = { w: 0, h: 0, dpr: 1 };
  private edges = { top: 80, bottom: 76 };

  constructor(parent: HTMLElement, private h: PrepHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'prep';
    this.root.hidden = true;
    this.root.innerHTML = `
      <canvas></canvas>
      <header class="prep-head">
        <div class="prep-title"><b>Нарезка овощей</b><span data-p="who"></span></div>
        <div class="prep-chips" data-p="chips"></div>
        <button class="btn small" data-p="exit">Отложить <kbd>Esc</kbd></button>
      </header>
      <div class="prep-sides">
        <div class="side" data-p="L"><kbd class="k">A</kbd><kbd class="k">←</kbd><span class="t">Левая рука</span><b data-p="Lt"></b></div>
        <div class="side" data-p="R"><b data-p="Rt"></b><span class="t">Нож</span><kbd class="k">→</kbd><kbd class="k">D</kbd></div>
      </div>
      <p class="prep-note">Левая половина — взять овощ и бросить в таз, правая — обрезать хвостик. Пока режешь, время идёт медленнее.</p>`;
    const modal = parent.querySelector('.modal-wrap');
    parent.insertBefore(this.root, modal);
    this.canvas = this.root.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.root.querySelectorAll<HTMLElement>('[data-p]').forEach((n) => (this.refs[n.dataset.p!] = n));
    this.refs.exit.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.exit();
    });
    this.root.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.prep-head')) return;
      if (!this.open || this.closing > 0) return;
      e.preventDefault();
      this.h.act(e.clientX < window.innerWidth / 2 ? 'L' : 'R');
    });
  }

  get visible(): boolean {
    return this.open;
  }

  private snapshot(s: State): Snapshot | null {
    const p = s.keeper.prep;
    if (!p) return null;
    const tub = tubById(s, p.tubId);
    if (!tub) return null;
    const plan = vegPlan(s.seed, shiftDay(s.t));
    const owner = s.elephants.find((e) => e.id === tub.owner);
    const next = p.hand ?? nextVeg(s, p.tubId);
    return {
      owner: owner ? nameCase(owner.profile.name, 'gen') : '',
      color: owner?.profile.color ?? '#8f9aa3',
      veg: { ...tub.veg },
      plan,
      planKg: Object.values(plan).reduce((a, b) => a + (b ?? 0), 0),
      next,
      stock: next ? Math.floor(s.world.stock.veg[next]) : 0,
      hand: p.hand,
      trimmed: p.trimmed,
      combo: p.combo,
    };
  }

  // Каждый кадр: события симуляции → анимации, затем рисунок
  update(s: State, events: SimEvent[], dt: number): void {
    const snap = this.snapshot(s);
    if (snap) {
      if (!this.open) this.show();
      this.snap = snap;
      this.closing = 0;
      this.root.classList.remove('out');
    } else if (this.open) {
      // Нарезка закончилась на этом шаге: последний овощ ещё летит в таз
      if (this.snap) for (const ev of events) if (ev.kind === 'vegToss' && ev.tag && ev.tag in this.snap.veg) this.snap.veg[ev.tag as VegKind]++;
      if (this.closing <= 0) this.closing = 0.75;
    }
    if (!this.open) return;
    for (const ev of events) this.onEvent(ev);
    if (this.closing > 0) {
      this.closing -= dt;
      this.root.classList.toggle('out', this.closing < 0.3);
      if (this.closing <= 0) {
        this.hide();
        return;
      }
    }
    this.tick(Math.min(dt, 0.05));
    this.renderHead();
    this.draw();
  }

  private show(): void {
    this.open = true;
    this.root.hidden = false;
    this.root.classList.remove('out');
    this.particles = [];
    this.flyers = [];
    this.floaters = [];
    this.inFlight = {};
    this.pickT = this.chopT = this.flickT = this.missT = 1;
    this.doneT = 0;
    this.headKey = '';
  }

  private hide(): void {
    this.open = false;
    this.closing = 0;
    this.root.hidden = true;
    this.root.classList.remove('out');
  }

  private onEvent(ev: SimEvent): void {
    const L = this.lay();
    switch (ev.kind) {
      case 'vegPick':
        this.pickT = 0;
        break;
      case 'chop':
        if (!ev.tag) break;
        this.chopT = 0;
        this.chopSpawned = false;
        this.chopKind = ev.tag as VegKind;
        break;
      case 'vegToss': {
        const v = ev.tag as VegKind;
        if (!v || !ART[v]) break;
        const i = Object.values(this.snap?.veg ?? {}).reduce((a, b) => a + b, 0);
        const ang = i * 2.39996;
        const rr = Math.sqrt(jitter(i, 9)) * L.tub.r * 0.55;
        this.flyers.push({ veg: v, t: 0, x0: L.veg.x, y0: L.veg.y, x1: L.tub.x + Math.cos(ang) * rr, y1: L.tub.y + Math.sin(ang) * rr });
        this.inFlight[v] = (this.inFlight[v] ?? 0) + 1;
        this.flickT = 0;
        // Снимок уже после шага: серия в нём учитывает этот бросок
        const combo = this.snap?.combo ?? 0;
        if (combo > 0 && combo % 10 === 0) this.floaters.push({ text: `Серия ×${combo}!`, x: L.board.x, y: L.board.y - L.board.h * 0.75, t: 0, color: '#2e5a44', big: true });
        break;
      }
      case 'prepMiss': {
        this.missT = 0;
        const text = ev.tag === 'needTrim' ? 'Сначала обрежь хвостик' : ev.tag === 'trimmed' ? 'Уже обрезано — бросай в таз' : 'Сначала возьми овощ';
        this.floaters.push({ text, x: L.board.x, y: L.board.y + L.board.h * 0.62, t: 0, color: '#b0472f', big: false });
        break;
      }
      case 'prepDone':
        this.doneT = 0.001;
        if (this.closing > 0) this.closing = Math.max(this.closing, 1.1);
        break;
    }
  }

  private lay(): Layout {
    return layout(this.size.w || window.innerWidth, this.size.h || window.innerHeight, this.edges.top, this.edges.bottom);
  }

  private tick(dt: number): void {
    const L = this.lay();
    this.pickT = Math.min(1, this.pickT + dt / 0.24);
    this.chopT = Math.min(1, this.chopT + dt / 0.2);
    this.flickT = Math.min(1, this.flickT + dt / 0.3);
    this.missT = Math.min(1, this.missT + dt / 0.32);
    if (this.doneT > 0) this.doneT += dt;
    const g = L.board.h * 6;
    if (!this.chopSpawned && this.chopT >= 0.35 && this.chopKind) {
      this.chopSpawned = true;
      const a = ART[this.chopKind];
      const tx = L.veg.x + L.veg.r * a.w * 0.92;
      this.particles.push({ x: tx, y: L.veg.y, vx: L.board.h * (1.6 + Math.random()), vy: -L.board.h * 2.4, rot: 0, vr: 6 + Math.random() * 6, life: 0, max: 0.9, size: L.veg.r, color: a.tail, veg: this.chopKind });
      for (let i = 0; i < 9; i++)
        this.particles.push({
          x: tx,
          y: L.veg.y + (Math.random() - 0.5) * L.veg.r,
          vx: L.board.h * (Math.random() * 2.4 - 0.4),
          vy: -L.board.h * (0.6 + Math.random() * 1.8),
          rot: 0,
          vr: 0,
          life: 0,
          max: 0.45 + Math.random() * 0.3,
          size: L.veg.r * (0.05 + Math.random() * 0.06),
          color: i % 3 === 0 ? '#ffffff' : a.cut,
          veg: null,
        });
    }
    for (const p of this.particles) {
      p.life += dt;
      p.vy += g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const f of this.flyers) {
      f.t += dt / 0.42;
      if (f.t >= 1) {
        this.inFlight[f.veg] = Math.max(0, (this.inFlight[f.veg] ?? 0) - 1);
        this.floaters.push({ text: '+1 кг', x: L.tub.x + L.tub.r * 1.25, y: L.tub.y - L.tub.r * 0.2, t: 0, color: '#2e5a44', big: false });
        for (let i = 0; i < 6; i++)
          this.particles.push({ x: f.x1, y: f.y1, vx: (Math.random() - 0.5) * L.tub.r * 4, vy: -L.tub.r * (1.5 + Math.random() * 2), rot: 0, vr: 0, life: 0, max: 0.35, size: L.tub.r * 0.05, color: ART[f.veg].cut, veg: null });
      }
    }
    this.flyers = this.flyers.filter((f) => f.t < 1);
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < (f.big ? 1.3 : 0.9));
  }

  private renderHead(): void {
    const sn = this.snap;
    if (!sn) return;
    const want: 'L' | 'R' = sn.hand && !sn.trimmed ? 'R' : 'L';
    const total = Object.values(sn.veg).reduce((a, b) => a + b, 0);
    const key = `${sn.owner}:${VEG_KINDS.map((v) => sn.veg[v]).join(',')}:${sn.hand}:${sn.trimmed}:${sn.next}:${sn.combo >= 3 ? sn.combo : 0}`;
    if (key === this.headKey) return;
    this.headKey = key;
    this.refs.who.textContent = `таз ${sn.owner}`;
    const chips = (Object.entries(sn.plan) as [VegKind, number][])
      .map(([v, kg]) => {
        const done = sn.veg[v] >= kg;
        return `<span class="chip ${done ? 'done' : v === sn.next ? 'now' : ''}" style="--c:${ART[v].body}"><i></i>${VEG_LABEL[v]} <b>${sn.veg[v]}</b>/${kg}</span>`;
      })
      .join('');
    this.refs.chips.innerHTML = `${chips}<span class="chip total"><b>${total}</b>/${sn.planKg} кг</span>${sn.combo >= 3 ? `<span class="chip combo">серия ${sn.combo}</span>` : ''}`;
    const lt = sn.hand ? (sn.trimmed ? 'Бросить в таз' : 'Держит овощ') : sn.next ? `Взять: ${VEG_LABEL[sn.next].toLowerCase()}` : 'Закончить';
    const rt = sn.hand && !sn.trimmed ? 'Обрезать хвостик' : '—';
    this.refs.Lt.textContent = lt;
    this.refs.Rt.textContent = rt;
    this.refs.L.classList.toggle('want', want === 'L');
    this.refs.R.classList.toggle('want', want === 'R');
  }

  // Сколько места занимают шапка и подсказки рук: стол рисуется между ними
  private measure(): void {
    const head = this.root.querySelector('.prep-head')?.getBoundingClientRect();
    const sides = this.root.querySelector('.prep-sides')?.getBoundingClientRect();
    if (head && head.height > 0) this.edges.top = head.bottom + 14;
    if (sides && sides.height > 0) this.edges.bottom = Math.max(40, window.innerHeight - sides.top + 22);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === this.size.w && h === this.size.h && dpr === this.size.dpr) return;
    this.size = { w, h, dpr };
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  private draw(): void {
    this.resize();
    const sn = this.snap;
    if (!sn) return;
    const ctx = this.ctx;
    const { w: W, h: H, dpr } = this.size;
    this.measure();
    const L = layout(W, H, this.edges.top, this.edges.bottom);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawTable(ctx, W, H, L);
    this.drawCrate(ctx, L, sn);
    this.drawTub(ctx, L, sn);
    const shake = this.missT < 1 ? Math.sin(this.missT * 40) * (1 - this.missT) * L.board.h * 0.04 : 0;
    this.drawBoard(ctx, L, shake);

    // Овощ на доске (во время «взять» — летит из ящика в руке)
    const lr = L.veg.r * 0.95;
    const rest = { x: L.board.x - L.board.w * 0.12, y: L.board.y + L.board.h * 0.72 };
    const crateC = { x: L.crate.x + L.crate.w * 0.5, y: L.crate.y + L.crate.h * 0.5 };
    let hand = { x: rest.x, y: rest.y, rot: -0.35, curl: 0 };
    const holdX = L.veg.x - L.veg.r * (sn.hand ? ART[sn.hand].w : 1) * 0.55 - lr * 0.95;
    if (sn.hand) {
      const a = ART[sn.hand];
      let vx = L.veg.x + shake;
      let vy = L.veg.y;
      let held = { x: holdX + shake, y: L.veg.y + L.veg.r * a.h * 0.15, rot: 0, curl: 0.55 };
      if (this.pickT < 1) {
        const t = this.pickT;
        if (t < 0.45) {
          const k = ease(t / 0.45);
          held = { x: lerp(rest.x, crateC.x, k), y: lerp(rest.y, crateC.y, k), rot: -0.35 * (1 - k) - 0.6 * k, curl: k * 0.4 };
          vx = NaN;
        } else {
          const k = ease((t - 0.45) / 0.55);
          held = { x: lerp(crateC.x, holdX, k), y: lerp(crateC.y, held.y, k), rot: -0.6 * (1 - k), curl: 0.55 };
          vx = held.x + lr * 0.95 + L.veg.r * a.w * 0.55;
          vy = held.y - L.veg.r * a.h * 0.15;
        }
      }
      if (!Number.isNaN(vx)) drawVeg(ctx, sn.hand, vx, vy, L.veg.r, 0, sn.trimmed && this.chopT >= 0.35);
      hand = held;
    } else if (this.flickT < 1) {
      const k = Math.sin(this.flickT * Math.PI);
      hand = { x: lerp(holdX, L.tub.x + L.tub.r * 0.6, k * 0.5), y: lerp(L.veg.y, L.tub.y, k * 0.4), rot: 0.6 * k, curl: 0.1 };
    }

    // Подсказка, куда бросать
    if (sn.hand && sn.trimmed && this.chopT >= 1) {
      ctx.save();
      ctx.setLineDash([L.board.h * 0.05, L.board.h * 0.05]);
      ctx.lineWidth = Math.max(2, L.board.h * 0.018);
      ctx.strokeStyle = 'rgba(46, 90, 68, 0.55)';
      ctx.beginPath();
      ctx.moveTo(L.veg.x, L.veg.y - L.veg.r);
      ctx.quadraticCurveTo((L.veg.x + L.tub.x) / 2, Math.min(L.veg.y, L.tub.y) - L.board.h * 0.7, L.tub.x, L.tub.y - L.tub.r * 0.4);
      ctx.stroke();
      ctx.restore();
    }

    glove(ctx, hand.x, hand.y, lr, hand.rot, hand.curl, false);

    // Летящие в таз
    for (const f of this.flyers) {
      const t = clamp01(f.t);
      const x = lerp(f.x0, f.x1, t);
      const arc = Math.min(f.y0, f.y1) - L.board.h * 0.9;
      const y = (1 - t) * (1 - t) * f.y0 + 2 * (1 - t) * t * arc + t * t * f.y1;
      drawVeg(ctx, f.veg, x, y, L.veg.r * lerp(1, 0.42, t), -t * Math.PI * 3, true);
    }

    // Нож: поднят над хвостиком, при нарезке опускается
    const a = sn.hand ? ART[sn.hand] : ART.potato;
    const tailX = L.veg.x + L.veg.r * a.w * 0.92 + shake;
    const kxWant = sn.hand ? L.veg.x + L.veg.r * (sn.hand ? ART[sn.hand].w : 1) * 0.92 : L.board.x + L.board.w * 0.38;
    const len = Math.max(L.board.h * 0.5, Math.min(L.board.h * 0.85, (W - 12 - kxWant) / 0.9));
    let ky = L.veg.y - L.board.h * 0.5;
    let kr = -0.22;
    if (this.chopT < 1) {
      const t = this.chopT;
      const down = t < 0.35 ? ease(t / 0.35) : t < 0.5 ? 1 : 1 - ease((t - 0.5) / 0.5);
      ky = lerp(ky, L.veg.y + L.veg.r * a.h * 0.25, down);
      kr = lerp(kr, 0.02, down);
    }
    const kx = sn.hand ? tailX : L.board.x + L.board.w * 0.38;
    knife(ctx, kx, ky, len, kr);
    if (this.chopT >= 0.3 && this.chopT < 0.62) {
      const k = 1 - (this.chopT - 0.3) / 0.32;
      ctx.save();
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * k})`;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
      ctx.shadowBlur = 14;
      ctx.lineWidth = Math.max(2, L.board.h * 0.03 * k);
      ctx.beginPath();
      ctx.moveTo(tailX - L.veg.r * 0.25, L.veg.y - L.veg.r * 1.5);
      ctx.quadraticCurveTo(tailX + L.veg.r * 0.12, L.veg.y, tailX - L.veg.r * 0.1, L.veg.y + L.veg.r * 1.4);
      ctx.stroke();
      ctx.restore();
    }

    // Отрезанные хвостики и брызги
    for (const p of this.particles) {
      const fade = clamp01((p.max - p.life) / 0.25);
      ctx.globalAlpha = fade;
      if (p.veg) {
        const va = ART[p.veg];
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.translate(-p.size * va.w * 0.92, 0);
        drawTail(ctx, p.veg, p.size * va.w, p.size * va.h, Math.max(1, p.size * 0.05));
        ctx.beginPath();
        ctx.ellipse(p.size * va.w * 0.92, 0, Math.max(2, p.size * 0.1), p.size * va.h * 0.55, 0, 0, Math.PI * 2);
        ctx.fillStyle = va.body;
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Подсказка, какая рука сейчас
    const want = sn.hand && !sn.trimmed ? 'R' : 'L';
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = `rgba(46, 90, 68, ${0.25 + pulse * 0.4})`;
    ctx.beginPath();
    if (want === 'R' && sn.hand) ctx.arc(tailX, L.veg.y, L.veg.r * 0.75 + pulse * 4, 0, Math.PI * 2);
    else if (!sn.hand && sn.next) rrect(ctx, L.crate.x - 6 - pulse * 3, L.crate.y - 6 - pulse * 3, L.crate.w + 12 + pulse * 6, L.crate.h + 12 + pulse * 6, 12);
    else if (sn.hand && sn.trimmed) ctx.arc(L.tub.x, L.tub.y, L.tub.r * 1.08 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Всплывающие подписи
    for (const f of this.floaters) {
      const life = f.big ? 1.3 : 0.9;
      const k = f.t / life;
      ctx.globalAlpha = clamp01((1 - k) * 2.2);
      this.label(ctx, f.text, f.x, f.y - k * L.board.h * 0.3, f.big ? 26 : 16, f.color, true);
      ctx.globalAlpha = 1;
    }

    if (this.doneT > 0) {
      ctx.fillStyle = `rgba(244, 241, 234, ${Math.min(0.55, this.doneT * 2)})`;
      ctx.fillRect(0, 0, W, H);
      this.label(ctx, `Таз ${sn.owner} собран`, W / 2, H / 2, 28, '#2e5a44', true);
    }
  }

  private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string, pill: boolean): void {
    ctx.font = `700 ${px}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const half = (ctx.measureText(text).width + px * 1.1) / 2;
    x = Math.max(half + 6, Math.min(this.size.w - half - 6, x));
    if (pill) {
      const w = half * 2;
      ctx.fillStyle = 'rgba(244, 241, 234, 0.94)';
      ctx.beginPath();
      rrect(ctx, x - w / 2, y - px * 0.85, w, px * 1.7, px * 0.85);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(44, 48, 46, 0.25)';
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + px * 0.04);
  }

  private drawTable(ctx: CanvasRenderingContext2D, W: number, H: number, L: Layout): void {
    // Стена с плиткой и стальной стол кормокухни
    const wallH = Math.max(40, L.crate.y - 8);
    ctx.fillStyle = '#e9ebe7';
    ctx.fillRect(0, 0, W, wallH);
    ctx.strokeStyle = '#c9ccc7';
    ctx.lineWidth = 1;
    const tile = 34;
    for (let y = tile; y < wallH; y += tile) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (let x = 0, row = 0; x < W; x += tile, row++) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, wallH);
      ctx.stroke();
    }
    const g = ctx.createLinearGradient(0, wallH, 0, H);
    g.addColorStop(0, '#cfd3d6');
    g.addColorStop(1, '#b7bcc0');
    ctx.fillStyle = g;
    ctx.fillRect(0, wallH, W, H - wallH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    for (let y = wallH + 6; y < H; y += 5) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y + 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#8e959b';
    ctx.fillRect(0, wallH, W, 6);
    ctx.fillStyle = 'rgba(44, 48, 46, 0.35)';
    ctx.fillRect(0, wallH + 6, W, 2);
  }

  private drawCrate(ctx: CanvasRenderingContext2D, L: Layout, sn: Snapshot): void {
    const c = L.crate;
    ctx.save();
    ctx.fillStyle = 'rgba(44, 48, 46, 0.2)';
    ctx.beginPath();
    rrect(ctx, c.x + 8, c.y + 10, c.w, c.h, 8);
    ctx.fill();
    ctx.fillStyle = '#c99b5c';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    rrect(ctx, c.x, c.y, c.w, c.h, 8);
    ctx.fill();
    ctx.stroke();
    const pad = c.w * 0.07;
    ctx.fillStyle = '#7a5530';
    ctx.fillRect(c.x + pad, c.y + pad, c.w - pad * 2, c.h - pad * 2);
    ctx.strokeStyle = 'rgba(44, 48, 46, 0.5)';
    ctx.lineWidth = 1.2;
    for (let i = 1; i < 3; i++) {
      const y = c.y + (c.h * i) / 3;
      ctx.beginPath();
      ctx.moveTo(c.x + 2, y);
      ctx.lineTo(c.x + pad, y);
      ctx.moveTo(c.x + c.w - pad, y);
      ctx.lineTo(c.x + c.w - 2, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.rect(c.x + pad, c.y + pad, c.w - pad * 2, c.h - pad * 2);
    ctx.clip();
    const kind = sn.next;
    if (kind && sn.stock > 0) {
      const n = Math.min(14, Math.max(2, Math.ceil(sn.stock / 3)));
      const r = c.h * 0.17;
      for (let i = 0; i < n; i++) {
        const x = c.x + pad + r + jitter(i, VEG_KINDS.indexOf(kind)) * (c.w - pad * 2 - r * 2);
        const y = c.y + pad + r * 0.8 + jitter(i, 17) * (c.h - pad * 2 - r * 1.6);
        drawVeg(ctx, kind, x, y, r, (jitter(i, 4) - 0.5) * 2.4, false);
      }
    }
    ctx.restore();
    const text = kind ? (sn.stock > 0 ? `${VEG_LABEL[kind]} · на складе ${sn.stock} кг` : `${VEG_LABEL[kind]} закончились`) : 'Ящик пуст';
    this.label(ctx, text, c.x + c.w / 2, c.y + c.h + 18, 13, INK, true);
  }

  private drawTub(ctx: CanvasRenderingContext2D, L: Layout, sn: Snapshot): void {
    const t = L.tub;
    const base = mix(sn.color, '#d9d2c4', 0.25);
    ctx.save();
    ctx.fillStyle = 'rgba(44, 48, 46, 0.22)';
    ctx.beginPath();
    ctx.ellipse(t.x + t.r * 0.1, t.y + t.r * 0.14, t.r, t.r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = base;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = shade(base, -0.24);
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.clip();
    // Содержимое: без тех, что ещё летят
    const pieces: VegKind[] = [];
    for (const v of VEG_KINDS) {
      const n = Math.max(0, sn.veg[v] - (this.inFlight[v] ?? 0));
      for (let i = 0; i < n; i++) pieces.push(v);
    }
    const shown = Math.min(pieces.length, 64);
    const step = pieces.length / Math.max(1, shown);
    for (let i = 0; i < shown; i++) {
      const v = pieces[Math.floor(i * step)];
      const ang = i * 2.39996;
      const rr = Math.sqrt((i + 0.5) / 64) * t.r * 0.72;
      drawVeg(ctx, v, t.x + Math.cos(ang) * rr, t.y + Math.sin(ang) * rr, t.r * 0.15, ang, true, true);
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.ellipse(t.x - t.r * 0.45, t.y - t.r * 0.62, t.r * 0.22, t.r * 0.07, -0.6, 0, Math.PI * 2);
    ctx.fill();
    const kg = Object.values(sn.veg).reduce((a, b) => a + b, 0);
    // Подпись над тазом: снизу экрана — подсказки рук
    this.label(ctx, `Таз ${sn.owner}: ${kg}/${sn.planKg} кг`, t.x, t.y - t.r - 16, 13, INK, true);
  }

  private drawBoard(ctx: CanvasRenderingContext2D, L: Layout, shake: number): void {
    const b = L.board;
    const x = b.x - b.w / 2 + shake;
    const y = b.y - b.h / 2;
    ctx.fillStyle = 'rgba(44, 48, 46, 0.22)';
    ctx.beginPath();
    rrect(ctx, x + 10, y + 12, b.w, b.h, b.h * 0.12);
    ctx.fill();
    const g = ctx.createLinearGradient(x, y, x, y + b.h);
    g.addColorStop(0, '#e2bf85');
    g.addColorStop(1, '#c69c5f');
    ctx.fillStyle = g;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    rrect(ctx, x, y, b.w, b.h, b.h * 0.12);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(122, 85, 48, 0.28)';
    ctx.lineWidth = 1.2;
    for (let i = 1; i < 7; i++) {
      const yy = y + (b.h * i) / 7;
      ctx.beginPath();
      ctx.moveTo(x + b.w * 0.04, yy);
      ctx.bezierCurveTo(x + b.w * 0.35, yy + 3 * Math.sin(i), x + b.w * 0.65, yy - 3 * Math.cos(i), x + b.w * 0.96, yy);
      ctx.stroke();
    }
    ctx.fillStyle = '#9b7444';
    ctx.beginPath();
    ctx.arc(x + b.w - b.h * 0.12, y + b.h * 0.14, b.h * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
}
