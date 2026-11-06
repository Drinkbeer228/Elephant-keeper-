// Векторные иллюстрации, нарисованные Canvas 2D в текстуры высокой плотности.
// Всё рисуется в метрах; TEX — пикселей на метр в текстуре.

import type { Look } from '../sim';
import { C, mix, shade } from './palette';

export const TEX = 96;

export interface Art {
  canvas: HTMLCanvasElement;
  ox: number; // точка привязки, доля ширины
  oy: number; // доля высоты
}

type Ctx = CanvasRenderingContext2D;

// Холст размером w×h метров; (ax, ay) — где в метрах лежит точка привязки
export function draw(w: number, h: number, ax: number, ay: number, fn: (ctx: Ctx) => void): Art {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.ceil(w * TEX));
  canvas.height = Math.max(2, Math.ceil(h * TEX));
  const ctx = canvas.getContext('2d')!;
  ctx.scale(TEX, TEX);
  ctx.translate(ax, ay);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  fn(ctx);
  return { canvas, ox: ax / w, oy: ay / h };
}

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fillStroke(ctx: Ctx, fill: string, line = 0.045, stroke: string = C.ink): void {
  ctx.fillStyle = fill;
  ctx.fill();
  if (line > 0) {
    ctx.lineWidth = line;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.001, rx), Math.max(0.001, ry), rot, 0, Math.PI * 2);
}

// Детерминированный генератор для мелких деталей рисунка
export function rnd(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Слон (вид сверху, смотрит вдоль +x). Корпус, голова и уши — отдельные текстуры,
// хобот, хвост и ноги рисуются каждый кадр.
// ---------------------------------------------------------------------------

export const ELEPHANT_INK = '#3b3633';

export function bodyGeom(look: Look): { a: number; b: number; cx: number; headX: number; headR: number; tailX: number } {
  const s = look.size;
  return {
    a: 1.42 * look.length * s,
    b: 0.84 * look.girth * s,
    cx: -0.2 * s,
    headX: 1.18 * look.length * s,
    headR: 0.58 * look.head * s,
    tailX: -1.58 * look.length * s,
  };
}

function bodyPath(ctx: Ctx, a: number, b: number, cx: number): void {
  // Корпус: широкая грудная клетка, округлый круп, сужение к шее
  ctx.beginPath();
  ctx.moveTo(cx - a, 0);
  ctx.bezierCurveTo(cx - a, -b * 0.92, cx - a * 0.35, -b * 1.02, cx + a * 0.25, -b * 0.96);
  ctx.bezierCurveTo(cx + a * 0.78, -b * 0.88, cx + a * 1.02, -b * 0.55, cx + a * 1.02, 0);
  ctx.bezierCurveTo(cx + a * 1.02, b * 0.55, cx + a * 0.78, b * 0.88, cx + a * 0.25, b * 0.96);
  ctx.bezierCurveTo(cx - a * 0.35, b * 1.02, cx - a, b * 0.92, cx - a, 0);
  ctx.closePath();
}

export function elephantBody(look: Look): Art {
  const g = bodyGeom(look);
  const w = (g.a + 0.4) * 2 + 0.6;
  const h = (g.b + 0.3) * 2;
  return draw(w, h, w / 2 + 0.3, h / 2, (ctx) => {
    const skin = look.skin;
    const r = rnd(look.seed);
    bodyPath(ctx, g.a, g.b, g.cx);
    ctx.fillStyle = shade(skin, -0.16);
    ctx.fill();
    // Мягкая тень снизу-справа: основной тон смещён к свету
    ctx.save();
    bodyPath(ctx, g.a, g.b, g.cx);
    ctx.clip();
    ctx.translate(-0.05, -0.09);
    bodyPath(ctx, g.a * 0.99, g.b * 0.97, g.cx);
    ctx.fillStyle = skin;
    ctx.fill();
    // Хребет и маклоки светлее
    ellipse(ctx, g.cx - 0.1, -0.04, g.a * 0.82, g.b * 0.26);
    ctx.fillStyle = shade(skin, 0.12);
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 0.3;
    for (const sy of [-1, 1]) {
      ellipse(ctx, g.cx - g.a * 0.68, sy * g.b * 0.42, g.b * 0.34, g.b * 0.3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Морщины поперёк спины
    ctx.strokeStyle = shade(skin, -0.3);
    ctx.lineWidth = 0.022;
    ctx.globalAlpha = 0.35 + 0.35 * look.wrinkles;
    const xs = [-0.95, -0.78, -0.6, 0.35, 0.52, 0.7];
    for (const k of xs) {
      const x = g.cx + k * g.a + (r() - 0.5) * 0.06;
      ctx.beginPath();
      ctx.moveTo(x, -g.b * 0.72);
      ctx.quadraticCurveTo(x + 0.08, 0, x, g.b * 0.72);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    bodyPath(ctx, g.a, g.b, g.cx);
    ctx.lineWidth = 0.055;
    ctx.strokeStyle = ELEPHANT_INK;
    ctx.stroke();
  });
}

// Лежащий слон: корпус на боку, ноги вытянуты в сторону +y
export function elephantLying(look: Look): Art {
  const g = bodyGeom(look);
  const a = g.a * 1.02;
  const b = g.b * 1.22;
  const w = (a + 0.5) * 2 + 0.6;
  const h = (b + 1.2) * 2;
  return draw(w, h, w / 2 + 0.3, h / 2, (ctx) => {
    const skin = look.skin;
    // Ноги — под корпусом, торчат на сторону живота
    const legs = [g.cx - a * 0.62, g.cx - a * 0.34, g.cx + a * 0.4, g.cx + a * 0.66];
    legs.forEach((x, i) => {
      const len = 0.95 * look.size;
      ctx.save();
      ctx.translate(x, b * 0.55);
      ctx.rotate((i < 2 ? 0.12 : -0.12) + (i % 2 ? 0.08 : -0.06));
      rrect(ctx, -0.17 * look.size, 0, 0.34 * look.size, len, 0.16 * look.size);
      fillStroke(ctx, shade(skin, -0.08), 0.045, ELEPHANT_INK);
      ellipse(ctx, 0, len - 0.04, 0.15 * look.size, 0.08 * look.size);
      ctx.fillStyle = mix(skin, '#e9dcc6', 0.55);
      ctx.fill();
      ctx.restore();
    });
    const path = () => {
      ctx.beginPath();
      ctx.ellipse(g.cx, 0.05, a, b, 0, 0, Math.PI * 2);
    };
    path();
    ctx.fillStyle = shade(skin, -0.12);
    ctx.fill();
    ctx.save();
    path();
    ctx.clip();
    ellipse(ctx, g.cx - 0.05, -0.18, a * 0.97, b * 0.86);
    ctx.fillStyle = skin;
    ctx.fill();
    // Хребет на верхнем боку
    ellipse(ctx, g.cx, -b * 0.62, a * 0.8, b * 0.2);
    ctx.fillStyle = shade(skin, 0.13);
    ctx.globalAlpha = 0.6;
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = shade(skin, -0.3);
    ctx.lineWidth = 0.022;
    for (const k of [-0.7, -0.45, 0.3, 0.55]) {
      const x = g.cx + k * a;
      ctx.beginPath();
      ctx.moveTo(x, -b * 0.8);
      ctx.quadraticCurveTo(x + 0.1, -b * 0.1, x - 0.02, b * 0.55);
      ctx.stroke();
    }
    ctx.restore();
    path();
    ctx.lineWidth = 0.055;
    ctx.strokeStyle = ELEPHANT_INK;
    ctx.stroke();
  });
}

export function elephantHead(look: Look): Art {
  const g = bodyGeom(look);
  const R = g.headR;
  const w = R * 2.6;
  const h = R * 2.6;
  return draw(w, h, w / 2, h / 2, (ctx) => {
    const skin = look.skin;
    // Голова: широкий лоб с двумя буграми — характерно для азиатского слона
    ellipse(ctx, 0.05, 0, R * 1.08, R * 0.92);
    ctx.fillStyle = shade(skin, -0.12);
    ctx.fill();
    ctx.save();
    ellipse(ctx, 0.05, 0, R * 1.08, R * 0.92);
    ctx.clip();
    ellipse(ctx, 0.02, -0.05, R * 1.07, R * 0.87);
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.fillStyle = shade(skin, 0.14);
    ctx.globalAlpha = 0.75;
    for (const sy of [-1, 1]) {
      ellipse(ctx, R * 0.18, sy * R * 0.36, R * 0.42, R * 0.34);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Ложбинка между буграми
    ctx.strokeStyle = shade(skin, -0.25);
    ctx.lineWidth = 0.022;
    ctx.beginPath();
    ctx.moveTo(-R * 0.2, 0);
    ctx.quadraticCurveTo(R * 0.25, 0.01, R * 0.6, 0);
    ctx.stroke();
    // Депигментация у основания хобота
    if (look.freckles > 0.2) {
      const r = rnd(look.seed + 7);
      ctx.fillStyle = '#d7a99a';
      const n = Math.round(look.freckles * 14);
      for (let i = 0; i < n; i++) {
        ellipse(ctx, R * (0.55 + r() * 0.35), (r() - 0.5) * R * 0.9, 0.025 + r() * 0.03, 0.02 + r() * 0.025);
        ctx.fill();
      }
    }
    ctx.restore();
    ellipse(ctx, 0.05, 0, R * 1.08, R * 0.92);
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = ELEPHANT_INK;
    ctx.stroke();
    // Глаза — по бокам головы
    ctx.fillStyle = '#2a2523';
    for (const sy of [-1, 1]) {
      ellipse(ctx, R * 0.42, sy * R * 0.8, 0.05, 0.032);
      ctx.fill();
    }
  });
}

// Ухо: точка привязки — место крепления у затылка; ухо уходит назад (−x) и в сторону (+y для правого)
export function elephantEar(look: Look, side: 1 | -1): Art {
  const s = look.size * look.ear;
  const w = 1.6 * s;
  const h = 1.0 * s;
  return draw(w, h, w - 0.3 * s, side > 0 ? 0.18 * s : h - 0.18 * s, (ctx) => {
    ctx.scale(1, side);
    const lobe = look.earShape;
    // Ухо азиатского слона сверху: плоский лоскут вдоль щеки и шеи, мочка вниз-назад
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(0.12 * s, -0.02 * s);
      ctx.bezierCurveTo(0.16 * s, 0.3 * s, 0.0 * s, 0.62 * s, -0.32 * s, 0.7 * s);
      ctx.bezierCurveTo(-0.7 * s, 0.8 * s, -(1.05 + 0.12 * lobe) * s, (0.62 + 0.1 * lobe) * s, -(1.12 + 0.1 * lobe) * s, 0.34 * s);
      ctx.bezierCurveTo(-1.16 * s, 0.12 * s, -0.8 * s, -0.04 * s, -0.4 * s, -0.04 * s);
      ctx.closePath();
    };
    const skin = look.skin;
    path();
    ctx.fillStyle = shade(skin, -0.05);
    ctx.fill();
    ctx.save();
    path();
    ctx.clip();
    // Внутренняя складка и депигментация по краю
    ellipse(ctx, -0.55 * s, 0.32 * s, 0.42 * s, 0.2 * s, 0.15);
    ctx.fillStyle = shade(skin, -0.16);
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (look.freckles > 0.05) {
      const r = rnd(look.seed + (side > 0 ? 11 : 23));
      ctx.fillStyle = '#d9ab9c';
      const n = Math.round(look.freckles * 26);
      for (let i = 0; i < n; i++) {
        const t = r();
        const x = 0.05 * s - t * 1.1 * s;
        const y = 0.12 * s + Math.sin(t * Math.PI) * 0.55 * s + (r() - 0.5) * 0.1 * s;
        ellipse(ctx, x, y, 0.03 + r() * 0.035, 0.025 + r() * 0.03);
        ctx.fill();
      }
    }
    ctx.restore();
    path();
    ctx.lineWidth = 0.045;
    ctx.strokeStyle = ELEPHANT_INK;
    ctx.stroke();
    // Надрыв на ухе — примета конкретной слонихи
    if (look.notch >= 0 && look.notchSide === side) {
      const t = look.notch;
      const x = -0.25 * s - t * 0.75 * s;
      const y = 0.45 * s + Math.sin(t * Math.PI) * 0.3 * s;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(x - 0.08 * s, y + 0.2 * s);
      ctx.lineTo(x, y);
      ctx.lineTo(x + 0.08 * s, y + 0.2 * s);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = ELEPHANT_INK;
      ctx.lineWidth = 0.035;
      ctx.beginPath();
      ctx.moveTo(x - 0.07 * s, y + 0.16 * s);
      ctx.lineTo(x, y);
      ctx.lineTo(x + 0.07 * s, y + 0.16 * s);
      ctx.stroke();
    }
    ctx.lineWidth = 0.022;
    ctx.strokeStyle = shade(skin, -0.32);
    ctx.beginPath();
    ctx.moveTo(0.02 * s, 0.1 * s);
    ctx.quadraticCurveTo(-0.3 * s, 0.45 * s, -0.8 * s, 0.5 * s);
    ctx.stroke();
  });
}

export function softShadow(w: number, h: number, alpha = 0.22): Art {
  return draw(w + 0.6, h + 0.6, (w + 0.6) / 2, (h + 0.6) / 2, (ctx) => {
    const r = Math.max(w, h) / 2;
    ctx.save();
    ctx.scale(w / (2 * r), h / (2 * r));
    const g = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r * 1.12);
    g.addColorStop(0, `rgba(44,48,46,${alpha})`);
    g.addColorStop(0.7, `rgba(44,48,46,${alpha * 0.7})`);
    g.addColorStop(1, 'rgba(44,48,46,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ---------------------------------------------------------------------------
// Кипер: вид сверху, смотрит вдоль +x
// ---------------------------------------------------------------------------

export function keeperBody(): Art {
  return draw(1.0, 1.0, 0.5, 0.5, (ctx) => {
    // Руки вперёд
    ctx.strokeStyle = C.ink;
    for (const sy of [-1, 1]) {
      ctx.lineWidth = 0.13;
      ctx.strokeStyle = C.ink;
      ctx.beginPath();
      ctx.moveTo(0.0, sy * 0.2);
      ctx.lineTo(0.26, sy * 0.15);
      ctx.stroke();
      ctx.lineWidth = 0.09;
      ctx.strokeStyle = C.sageMid;
      ctx.beginPath();
      ctx.moveTo(0.0, sy * 0.2);
      ctx.lineTo(0.26, sy * 0.15);
      ctx.stroke();
      ellipse(ctx, 0.3, sy * 0.14, 0.055, 0.05);
      fillStroke(ctx, '#d9b394', 0.025);
    }
    // Плечи и спина: форма смотрителя
    rrect(ctx, -0.17, -0.29, 0.34, 0.58, 0.16);
    fillStroke(ctx, C.sageMid, 0.04);
    rrect(ctx, -0.17, -0.29, 0.14, 0.58, 0.1);
    ctx.fillStyle = shade(C.sageMid, -0.18);
    ctx.fill();
    // Ремень сумки с лакомствами
    ctx.strokeStyle = C.woodDark;
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(-0.12, -0.25);
    ctx.lineTo(0.1, 0.24);
    ctx.stroke();
  });
}

export function keeperHead(): Art {
  return draw(0.6, 0.6, 0.3, 0.3, (ctx) => {
    ellipse(ctx, 0, 0, 0.15, 0.14);
    fillStroke(ctx, '#5a4636', 0.035);
    // Кепка с козырьком
    ctx.beginPath();
    ctx.ellipse(0.02, 0, 0.13, 0.13, 0, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
    fillStroke(ctx, C.terracotta, 0.03);
    ctx.beginPath();
    ctx.ellipse(0.13, 0, 0.09, 0.12, 0, -Math.PI / 2, Math.PI / 2);
    fillStroke(ctx, C.terracottaDark, 0.03);
  });
}

// ---------------------------------------------------------------------------
// Предметы
// ---------------------------------------------------------------------------

function bale(color: string, dark: string, twine: string): Art {
  return draw(1.1, 0.8, 0.55, 0.4, (ctx) => {
    rrect(ctx, -0.45, -0.28, 0.9, 0.56, 0.07);
    fillStroke(ctx, color, 0.04);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 0.02;
    const r = rnd(color.length * 97);
    for (let i = 0; i < 16; i++) {
      const y = -0.22 + r() * 0.44;
      const x = -0.4 + r() * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.12 + r() * 0.12, y + (r() - 0.5) * 0.06);
      ctx.stroke();
    }
    ctx.strokeStyle = twine;
    ctx.lineWidth = 0.035;
    for (const x of [-0.2, 0.2]) {
      ctx.beginPath();
      ctx.moveTo(x, -0.28);
      ctx.lineTo(x, 0.28);
      ctx.stroke();
    }
  });
}

export function hayBale(): Art {
  return bale(C.hay, C.hayDark, '#8a5a3a');
}

export function strawBale(): Art {
  return bale(C.straw, C.strawDark, '#a8683e');
}

export function rationBucket(): Art {
  return draw(0.8, 0.8, 0.4, 0.4, (ctx) => {
    ellipse(ctx, 0, 0, 0.3, 0.3);
    fillStroke(ctx, C.terracotta, 0.045);
    ellipse(ctx, 0, 0, 0.23, 0.23);
    ctx.fillStyle = shade(C.terracotta, -0.25);
    ctx.fill();
    const r = rnd(5);
    const cols = [C.produceOrange, C.produceRed, C.produceGreen, C.produceYellow];
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 0.15;
      ellipse(ctx, Math.cos(a) * d, Math.sin(a) * d, 0.06, 0.045, r() * 3);
      fillStroke(ctx, cols[i % 4], 0.018);
    }
  });
}

export function browseBundle(): Art {
  return draw(1.4, 0.9, 0.7, 0.45, (ctx) => drawBranches(ctx, 1, 31));
}

function drawBranches(ctx: Ctx, leaves: number, seed: number): void {
  const r = rnd(seed);
  ctx.strokeStyle = C.bark;
  ctx.lineWidth = 0.05;
  for (let i = 0; i < 5; i++) {
    const y = -0.2 + i * 0.1;
    ctx.beginPath();
    ctx.moveTo(-0.55, y + (r() - 0.5) * 0.1);
    ctx.quadraticCurveTo(0, y + (r() - 0.5) * 0.25, 0.55, y + (r() - 0.5) * 0.15);
    ctx.stroke();
  }
  if (leaves <= 0) return;
  for (let i = 0; i < Math.round(26 * leaves); i++) {
    const x = -0.45 + r() * 0.95;
    const y = -0.3 + r() * 0.6;
    ellipse(ctx, x, y, 0.08, 0.04, r() * Math.PI);
    fillStroke(ctx, r() < 0.5 ? C.leaf : C.leafDark, 0.012);
  }
}

export function browseRemains(): Art {
  return draw(1.3, 0.8, 0.65, 0.4, (ctx) => {
    ctx.globalAlpha = 0.9;
    drawBranches(ctx, 0.08, 77);
  });
}

export function forkTool(): Art {
  return draw(1.5, 0.5, 0.75, 0.25, (ctx) => {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.moveTo(-0.62, 0);
    ctx.lineTo(0.35, 0);
    ctx.stroke();
    ctx.strokeStyle = C.wood;
    ctx.lineWidth = 0.045;
    ctx.stroke();
    ctx.strokeStyle = C.metalDark;
    ctx.lineWidth = 0.035;
    for (const y of [-0.12, -0.04, 0.04, 0.12]) {
      ctx.beginPath();
      ctx.moveTo(0.33, y * 0.7);
      ctx.lineTo(0.66, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0.33, -0.1);
    ctx.lineTo(0.33, 0.1);
    ctx.stroke();
  });
}

export function rakeTool(): Art {
  return draw(1.5, 0.7, 0.75, 0.35, (ctx) => {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.moveTo(-0.62, 0);
    ctx.lineTo(0.52, 0);
    ctx.stroke();
    ctx.strokeStyle = C.wood;
    ctx.lineWidth = 0.045;
    ctx.stroke();
    rrect(ctx, 0.5, -0.28, 0.08, 0.56, 0.03);
    fillStroke(ctx, C.metalDark, 0.025);
    ctx.strokeStyle = C.metalDark;
    ctx.lineWidth = 0.022;
    for (let y = -0.24; y <= 0.25; y += 0.08) {
      ctx.beginPath();
      ctx.moveTo(0.58, y);
      ctx.lineTo(0.68, y);
      ctx.stroke();
    }
  });
}

export function hoseNozzle(): Art {
  return draw(0.6, 0.4, 0.2, 0.2, (ctx) => {
    rrect(ctx, -0.05, -0.06, 0.32, 0.12, 0.05);
    fillStroke(ctx, C.metal, 0.03);
    rrect(ctx, 0.25, -0.08, 0.08, 0.16, 0.03);
    fillStroke(ctx, C.terracotta, 0.025);
  });
}

export function barrowArt(): Art {
  return draw(1.9, 1.1, 0.75, 0.55, (ctx) => {
    // Колесо впереди
    rrect(ctx, 0.62, -0.08, 0.3, 0.16, 0.06);
    fillStroke(ctx, '#3d403e', 0.03);
    // Ручки
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 0.06;
    for (const y of [-0.27, 0.27]) {
      ctx.beginPath();
      ctx.moveTo(-0.72, y * 1.1);
      ctx.lineTo(0.2, y * 0.85);
      ctx.stroke();
    }
    ctx.strokeStyle = C.wood;
    ctx.lineWidth = 0.035;
    for (const y of [-0.27, 0.27]) {
      ctx.beginPath();
      ctx.moveTo(-0.72, y * 1.1);
      ctx.lineTo(0.2, y * 0.85);
      ctx.stroke();
    }
    // Кузов
    ctx.beginPath();
    ctx.moveTo(-0.48, -0.34);
    ctx.lineTo(0.42, -0.26);
    ctx.quadraticCurveTo(0.62, 0, 0.42, 0.26);
    ctx.lineTo(-0.48, 0.34);
    ctx.quadraticCurveTo(-0.56, 0, -0.48, -0.34);
    ctx.closePath();
    fillStroke(ctx, C.sageMid, 0.045);
    ctx.beginPath();
    ctx.moveTo(-0.4, -0.26);
    ctx.lineTo(0.36, -0.2);
    ctx.quadraticCurveTo(0.5, 0, 0.36, 0.2);
    ctx.lineTo(-0.4, 0.26);
    ctx.quadraticCurveTo(-0.46, 0, -0.4, -0.26);
    ctx.closePath();
    ctx.fillStyle = shade(C.sageMid, -0.28);
    ctx.fill();
  });
}

export function barrowLoad(): Art {
  return draw(1.0, 0.7, 0.5, 0.35, (ctx) => {
    const r = rnd(9);
    for (let i = 0; i < 9; i++) {
      ellipse(ctx, -0.25 + r() * 0.5, -0.12 + r() * 0.24, 0.1, 0.08);
      fillStroke(ctx, r() < 0.5 ? C.dung : C.strawDark, 0.02);
    }
  });
}

export function ballArt(): Art {
  return draw(1.3, 1.3, 0.65, 0.65, (ctx) => {
    ellipse(ctx, 0, 0, 0.55, 0.55);
    fillStroke(ctx, C.paper, 0.05);
    ctx.save();
    ellipse(ctx, 0, 0, 0.55, 0.55);
    ctx.clip();
    ctx.fillStyle = C.terracotta;
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(k * 0.32, 0, 0.16, 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ellipse(ctx, -0.18, -0.2, 0.18, 0.12, -0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
    ctx.restore();
    ellipse(ctx, 0, 0, 0.55, 0.55);
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
  });
}

export function drumArt(): Art {
  return draw(1.6, 1.6, 0.8, 0.8, (ctx) => {
    // Рама
    ctx.strokeStyle = C.woodDark;
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.moveTo(-0.7, -0.55);
    ctx.lineTo(-0.7, 0.55);
    ctx.moveTo(0.7, -0.55);
    ctx.lineTo(0.7, 0.55);
    ctx.stroke();
    rrect(ctx, -0.62, -0.5, 1.24, 1.0, 0.3);
    fillStroke(ctx, C.wood, 0.05);
    ctx.strokeStyle = C.woodDark;
    ctx.lineWidth = 0.03;
    for (const x of [-0.3, 0, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(x, -0.48);
      ctx.lineTo(x, 0.48);
      ctx.stroke();
    }
    ctx.fillStyle = C.ink;
    for (const [x, y] of [
      [-0.45, -0.2],
      [-0.15, 0.25],
      [0.15, -0.25],
      [0.45, 0.2],
    ]) {
      ellipse(ctx, x, y, 0.07, 0.07);
      ctx.fill();
    }
  });
}

export function tireArt(): Art {
  return draw(1.2, 1.2, 0.6, 0.6, (ctx) => {
    ellipse(ctx, 0, 0, 0.48, 0.48);
    fillStroke(ctx, '#3a3d3b', 0.045);
    ellipse(ctx, 0, 0, 0.24, 0.24);
    ctx.fillStyle = C.concrete;
    ctx.fill();
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.strokeStyle = '#5a5e5b';
    ctx.lineWidth = 0.025;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 0.3, Math.sin(a) * 0.3);
      ctx.lineTo(Math.cos(a) * 0.43, Math.sin(a) * 0.43);
      ctx.stroke();
    }
  });
}

export function logArt(len: number, r: number): Art {
  return draw(len + 0.6, r * 2 + 0.4, (len + 0.6) / 2, r + 0.2, (ctx) => {
    rrect(ctx, -len / 2, -r, len, r * 2, r);
    fillStroke(ctx, C.bark, 0.045);
    ctx.strokeStyle = shade(C.bark, -0.25);
    ctx.lineWidth = 0.025;
    const rr = rnd(3);
    for (let i = 0; i < 9; i++) {
      const x = -len / 2 + 0.3 + rr() * (len - 0.6);
      ctx.beginPath();
      ctx.moveTo(x, -r * 0.7);
      ctx.lineTo(x + 0.25, -r * 0.6 + rr() * r * 1.2);
      ctx.stroke();
    }
    ellipse(ctx, len / 2 - r * 0.35, 0, r * 0.35, r * 0.85);
    fillStroke(ctx, '#d6b88a', 0.03);
  });
}

export function boulderArt(r: number, seed: number): Art {
  return draw(r * 2.6, r * 2.6, r * 1.3, r * 1.3, (ctx) => {
    const rn = rnd(seed);
    const pts: [number, number][] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const d = r * (0.82 + rn() * 0.22);
      pts.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const [nx, ny] = pts[(i + 1) % pts.length];
      if (i === 0) ctx.moveTo((x + nx) / 2, (y + ny) / 2);
      ctx.quadraticCurveTo(nx, ny, (nx + pts[(i + 2) % pts.length][0]) / 2, (ny + pts[(i + 2) % pts.length][1]) / 2);
    });
    ctx.closePath();
    fillStroke(ctx, '#e7e2d6', 0.05);
    ellipse(ctx, -r * 0.22, -r * 0.25, r * 0.45, r * 0.3, -0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
  });
}

export function canopyArt(r: number, seed: number, tone: number): Art {
  return draw(r * 2.4, r * 2.4, r * 1.2, r * 1.2, (ctx) => {
    const base = tone > 0.5 ? '#5f8f72' : '#7d955f';
    ellipse(ctx, 0, 0, r, r);
    fillStroke(ctx, base, 0.06);
    const rn = rnd(seed);
    ctx.fillStyle = shade(base, 0.18);
    ellipse(ctx, -r * 0.28, -r * 0.3, r * 0.48, r * 0.46);
    ctx.fill();
    ctx.fillStyle = shade(base, -0.12);
    for (let i = 0; i < 5; i++) {
      const a = rn() * Math.PI * 2;
      ellipse(ctx, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.16, r * 0.14);
      ctx.fill();
    }
  });
}

export function dungArt(seed: number): Art {
  return draw(1.0, 1.0, 0.5, 0.5, (ctx) => {
    const r = rnd(seed);
    const n = 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 0.2;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      ellipse(ctx, x, y, 0.12, 0.1, r() * 3);
      fillStroke(ctx, i % 2 ? C.dung : shade(C.dung, -0.12), 0.025, C.dungDark);
      ellipse(ctx, x - 0.035, y - 0.03, 0.04, 0.025);
      ctx.fillStyle = 'rgba(255,240,210,0.25)';
      ctx.fill();
    }
  });
}

export function produceArt(kind: number): Art {
  return draw(0.4, 0.4, 0.2, 0.2, (ctx) => {
    if (kind === 0) {
      ctx.beginPath();
      ctx.moveTo(-0.13, -0.04);
      ctx.lineTo(0.13, 0);
      ctx.lineTo(-0.13, 0.04);
      ctx.closePath();
      fillStroke(ctx, C.produceOrange, 0.02);
    } else if (kind === 1) {
      ellipse(ctx, 0, 0, 0.08, 0.08);
      fillStroke(ctx, C.produceRed, 0.02);
    } else if (kind === 2) {
      ellipse(ctx, 0, 0, 0.1, 0.07, 0.4);
      fillStroke(ctx, C.produceYellow, 0.02);
    } else {
      ellipse(ctx, 0, 0, 0.09, 0.07);
      fillStroke(ctx, '#8a3b4e', 0.02);
    }
  });
}

export function hayPile(): Art {
  return draw(1.6, 1.2, 0.8, 0.6, (ctx) => {
    const r = rnd(41);
    ellipse(ctx, 0, 0, 0.6, 0.42);
    ctx.fillStyle = C.hay;
    ctx.fill();
    ctx.strokeStyle = C.hayDark;
    ctx.lineWidth = 0.02;
    for (let i = 0; i < 40; i++) {
      const x = (r() - 0.5) * 1.1;
      const y = (r() - 0.5) * 0.75;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 0.3, y + (r() - 0.5) * 0.2);
      ctx.stroke();
    }
  });
}

export function remainsMush(): Art {
  return draw(0.9, 0.7, 0.45, 0.35, (ctx) => {
    const r = rnd(13);
    for (let i = 0; i < 6; i++) {
      ellipse(ctx, (r() - 0.5) * 0.5, (r() - 0.5) * 0.35, 0.09, 0.06, r() * 3);
      ctx.fillStyle = mix(C.produceOrange, C.dung, 0.6);
      ctx.fill();
    }
  });
}

// Пузырь сигнала над слоном: значок нужды
export function bubbleArt(icon: string, tint: string): Art {
  return draw(1.2, 1.3, 0.6, 1.15, (ctx) => {
    rrect(ctx, -0.42, -1.08, 0.84, 0.76, 0.24);
    ctx.fillStyle = C.paper;
    ctx.fill();
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.1, -0.33);
    ctx.lineTo(0, -0.18);
    ctx.lineTo(0.1, -0.33);
    ctx.fillStyle = C.paper;
    ctx.fill();
    ctx.stroke();
    ctx.translate(0, -0.7);
    drawIcon(ctx, icon, tint);
  });
}

export function drawIcon(ctx: Ctx, icon: string, tint: string): void {
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = C.ink;
  ctx.fillStyle = tint;
  switch (icon) {
    case 'drop':
      ctx.beginPath();
      ctx.moveTo(0, -0.24);
      ctx.bezierCurveTo(0.18, 0.0, 0.18, 0.2, 0, 0.2);
      ctx.bezierCurveTo(-0.18, 0.2, -0.18, 0.0, 0, -0.24);
      ctx.fill();
      ctx.stroke();
      break;
    case 'door':
      rrect(ctx, -0.17, -0.22, 0.34, 0.44, 0.04);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.06, -0.02);
      ctx.lineTo(0.06, 0.06);
      ctx.stroke();
      break;
    case 'house':
      ctx.beginPath();
      ctx.moveTo(-0.22, -0.02);
      ctx.lineTo(0, -0.22);
      ctx.lineTo(0.22, -0.02);
      ctx.lineTo(0.16, -0.02);
      ctx.lineTo(0.16, 0.2);
      ctx.lineTo(-0.16, 0.2);
      ctx.lineTo(-0.16, -0.02);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case 'hay':
      rrect(ctx, -0.22, -0.13, 0.44, 0.26, 0.05);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.08, -0.13);
      ctx.lineTo(-0.08, 0.13);
      ctx.moveTo(0.08, -0.13);
      ctx.lineTo(0.08, 0.13);
      ctx.stroke();
      break;
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(0, 0.2);
      ctx.bezierCurveTo(-0.3, 0.0, -0.18, -0.26, 0, -0.1);
      ctx.bezierCurveTo(0.18, -0.26, 0.3, 0.0, 0, 0.2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'dots':
      ctx.fillStyle = C.ink;
      for (const x of [-0.14, 0, 0.14]) {
        ellipse(ctx, x, 0, 0.04, 0.04);
        ctx.fill();
      }
      break;
    case 'z':
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.moveTo(-0.13, -0.13);
      ctx.lineTo(0.13, -0.13);
      ctx.lineTo(-0.13, 0.13);
      ctx.lineTo(0.13, 0.13);
      ctx.stroke();
      break;
    case 'alert':
      ctx.fillStyle = C.terracotta;
      ctx.beginPath();
      ctx.moveTo(0, -0.22);
      ctx.lineTo(0.22, 0.18);
      ctx.lineTo(-0.22, 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = C.paper;
      ctx.beginPath();
      ctx.moveTo(0, -0.08);
      ctx.lineTo(0, 0.05);
      ctx.stroke();
      break;
  }
}

// Текст на текстуре: шрифт задаётся в настоящих пикселях без масштабирования холста.
// Дробные размеры шрифта вроде 0.3px под transform Safari округляет — надписи обрезались.
function pixelFont(weight: number, meters: number): { font: string; px: number } {
  const px = Math.round(meters * TEX);
  return { font: `${weight} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, px };
}

function measure(font: string, text: string, spacing: number): number {
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  let w = 0;
  for (const ch of text) w += probe.measureText(ch).width + spacing;
  return Math.max(0, w - spacing);
}

// Строка по центру точки (cx, cy) в пикселях холста, по реальным границам глифов
function centeredText(ctx: Ctx, text: string, font: string, cx: number, cy: number, spacing: number, color: string): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(text);
  const asc = m.actualBoundingBoxAscent || parseFloat(font.split(' ')[1]) * 0.72;
  const desc = m.actualBoundingBoxDescent || 0;
  let x = cx - measure(font, text, spacing) / 2;
  const y = cy + (asc - desc) / 2;
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + spacing;
  }
  ctx.restore();
}

// Подпись-плашка с именем
export function namePill(name: string, color: string): Art {
  const { font } = pixelFont(600, 0.28);
  const tw = measure(font, name, 0) / TEX;
  const w = tw + 0.66;
  const h = 0.5;
  const cw = w + 0.12;
  const ch = h + 0.12;
  return draw(cw, ch, cw / 2, ch / 2, (ctx) => {
    rrect(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fillStyle = 'rgba(244,241,234,0.95)';
    ctx.fill();
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ellipse(ctx, -w / 2 + 0.2, 0, 0.075, 0.075);
    ctx.fillStyle = color;
    ctx.fill();
    centeredText(ctx, name, font, (cw / 2 + 0.17) * TEX, (ch / 2) * TEX, 0, C.ink);
  });
}

// Табличка помещения — тёмная, как вывески в референсе, но своя
export function roomSign(text: string): Art {
  const { font, px } = pixelFont(700, 0.32);
  const label = text.toUpperCase();
  const spacing = px * 0.12;
  const tw = measure(font, label, spacing) / TEX;
  const w = tw + 0.8;
  const h = 0.62;
  const cw = w + 0.12;
  const ch = h + 0.12;
  return draw(cw, ch, cw / 2, ch / 2, (ctx) => {
    rrect(ctx, -w / 2, -h / 2, w, h, 0.12);
    ctx.fillStyle = C.ink;
    ctx.fill();
    centeredText(ctx, label, font, (cw / 2) * TEX, (ch / 2) * TEX, spacing, C.paper);
  });
}

export { C };
