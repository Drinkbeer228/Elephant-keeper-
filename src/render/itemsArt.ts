// Новые вещи кипера и корм: инвентарь уборки, ведро для мочи, наборы для мытья, тазы, бамбук, яблоки.
// Тот же векторный стиль: тёмный контур, плоская заливка, мягкий блик.

import { C, draw, rnd, rrect, type Art } from './art';
import { mix, shade } from './palette';

type Ctx = CanvasRenderingContext2D;

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.001, rx), Math.max(0.001, ry), rot, 0, Math.PI * 2);
}

function fillStroke(ctx: Ctx, fill: string, line = 0.04, stroke: string = C.ink): void {
  ctx.fillStyle = fill;
  ctx.fill();
  if (line > 0) {
    ctx.lineWidth = line;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function handle(ctx: Ctx, x0: number, x1: number): void {
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 0.075;
  ctx.beginPath();
  ctx.moveTo(x0, 0);
  ctx.lineTo(x1, 0);
  ctx.stroke();
  ctx.strokeStyle = C.wood;
  ctx.lineWidth = 0.045;
  ctx.stroke();
}

export function shovelTool(): Art {
  return draw(1.6, 0.6, 0.8, 0.3, (ctx) => {
    handle(ctx, -0.7, 0.3);
    ctx.beginPath();
    ctx.moveTo(0.28, -0.2);
    ctx.lineTo(0.66, -0.17);
    ctx.quadraticCurveTo(0.76, 0, 0.66, 0.17);
    ctx.lineTo(0.28, 0.2);
    ctx.closePath();
    fillStroke(ctx, '#7f888d', 0.035);
    ctx.strokeStyle = '#b7bec2';
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.moveTo(0.34, -0.12);
    ctx.lineTo(0.62, -0.1);
    ctx.stroke();
  });
}

export function broomTool(): Art {
  return draw(1.6, 0.8, 0.8, 0.4, (ctx) => {
    handle(ctx, -0.7, 0.42);
    rrect(ctx, 0.38, -0.32, 0.12, 0.64, 0.04);
    fillStroke(ctx, C.woodDark, 0.03);
    ctx.strokeStyle = '#c9a85c';
    ctx.lineWidth = 0.035;
    for (let y = -0.28; y <= 0.29; y += 0.07) {
      ctx.beginPath();
      ctx.moveTo(0.5, y);
      ctx.lineTo(0.7, y * 1.1);
      ctx.stroke();
    }
  });
}

export function mopTool(): Art {
  return draw(1.6, 0.8, 0.8, 0.4, (ctx) => {
    handle(ctx, -0.7, 0.42);
    rrect(ctx, 0.4, -0.3, 0.08, 0.6, 0.03);
    fillStroke(ctx, C.metalDark, 0.025);
    ctx.strokeStyle = '#e8e3d6';
    ctx.lineWidth = 0.05;
    for (let y = -0.26; y <= 0.27; y += 0.065) {
      ctx.beginPath();
      ctx.moveTo(0.48, y);
      ctx.quadraticCurveTo(0.6, y + 0.03, 0.68, y - 0.01);
      ctx.stroke();
    }
  });
}

export function brushTool(): Art {
  return draw(0.8, 0.6, 0.4, 0.3, (ctx) => {
    rrect(ctx, -0.26, -0.16, 0.52, 0.32, 0.1);
    fillStroke(ctx, C.wood, 0.035);
    ctx.strokeStyle = C.woodDark;
    ctx.lineWidth = 0.02;
    for (let x = -0.18; x <= 0.19; x += 0.06) {
      ctx.beginPath();
      ctx.moveTo(x, -0.1);
      ctx.lineTo(x, 0.1);
      ctx.stroke();
    }
    rrect(ctx, -0.08, -0.22, 0.16, 0.08, 0.03);
    fillStroke(ctx, C.terracotta, 0.02);
  });
}

export function sawdustSack(): Art {
  return draw(1.0, 0.9, 0.5, 0.45, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(-0.36, -0.3);
    ctx.quadraticCurveTo(0, -0.38, 0.36, -0.3);
    ctx.quadraticCurveTo(0.44, 0, 0.36, 0.32);
    ctx.quadraticCurveTo(0, 0.4, -0.36, 0.32);
    ctx.quadraticCurveTo(-0.44, 0, -0.36, -0.3);
    ctx.closePath();
    fillStroke(ctx, '#e3d2ad', 0.04);
    const r = rnd(12);
    ctx.fillStyle = '#c7ae7d';
    for (let i = 0; i < 18; i++) {
      ellipse(ctx, (r() - 0.5) * 0.5, (r() - 0.5) * 0.45, 0.03, 0.015, r() * 3);
      ctx.fill();
    }
    ctx.strokeStyle = C.woodDark;
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(-0.3, -0.24);
    ctx.lineTo(0.3, -0.24);
    ctx.stroke();
  });
}

// Ведро для мочи (20 л): синий пластик, ручка; внутри — моча или пусто
export function tankArt(fill: 'empty' | 'full' | 'dirty'): Art {
  return draw(1.0, 1.0, 0.5, 0.5, (ctx) => {
    for (const sy of [-1, 1]) {
      rrect(ctx, -0.12, sy * 0.4 - 0.05, 0.24, 0.1, 0.04);
      fillStroke(ctx, '#3e6a86', 0.025);
    }
    ellipse(ctx, 0, 0, 0.38, 0.38);
    fillStroke(ctx, '#5b8db0', 0.045);
    ellipse(ctx, 0, 0, 0.3, 0.3);
    ctx.fillStyle = fill === 'full' ? '#d8c04e' : fill === 'dirty' ? '#8f8a5a' : '#3f6f8f';
    ctx.fill();
    if (fill === 'full') {
      ellipse(ctx, -0.08, -0.08, 0.1, 0.06, -0.5);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fill();
    }
    ellipse(ctx, -0.18, -0.2, 0.08, 0.04, -0.7);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();
  });
}

// Ведро для мытья слонов: тёплая вода, пена, щётка
export function washKitArt(): Art {
  return draw(0.9, 0.9, 0.45, 0.45, (ctx) => {
    ellipse(ctx, 0, 0, 0.32, 0.32);
    fillStroke(ctx, C.sageMid, 0.045);
    ellipse(ctx, 0, 0, 0.25, 0.25);
    ctx.fillStyle = '#9cc1c9';
    ctx.fill();
    const r = rnd(4);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 7; i++) {
      ellipse(ctx, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3, 0.05 + r() * 0.04, 0.04 + r() * 0.03);
      ctx.fill();
    }
    rrect(ctx, 0.05, -0.08, 0.34, 0.16, 0.05);
    fillStroke(ctx, C.wood, 0.025);
  });
}

// Средство для поилок: канистра с синей крышкой и ёрш
export function chemArt(): Art {
  return draw(0.9, 0.8, 0.45, 0.4, (ctx) => {
    rrect(ctx, -0.3, -0.22, 0.36, 0.44, 0.08);
    fillStroke(ctx, '#f2f2ee', 0.04);
    rrect(ctx, -0.2, -0.3, 0.14, 0.1, 0.03);
    fillStroke(ctx, '#3a72b8', 0.025);
    rrect(ctx, -0.26, -0.04, 0.28, 0.12, 0.02);
    ctx.fillStyle = '#3a72b8';
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.moveTo(0.1, 0.18);
    ctx.lineTo(0.4, -0.18);
    ctx.stroke();
    ctx.strokeStyle = '#d6c27a';
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(0.3, -0.06);
    ctx.lineTo(0.42, -0.22);
    ctx.stroke();
  });
}

export function porridgeBucket(full: boolean): Art {
  return draw(0.8, 0.8, 0.4, 0.4, (ctx) => {
    ellipse(ctx, 0, 0, 0.3, 0.3);
    fillStroke(ctx, '#d4cfc4', 0.045);
    ellipse(ctx, 0, 0, 0.23, 0.23);
    ctx.fillStyle = full ? '#c9a46a' : '#a7a196';
    ctx.fill();
    if (full) {
      const r = rnd(8);
      ctx.fillStyle = '#e4c88f';
      for (let i = 0; i < 8; i++) {
        ellipse(ctx, (r() - 0.5) * 0.26, (r() - 0.5) * 0.26, 0.03, 0.022);
        ctx.fill();
      }
    }
    ctx.strokeStyle = C.metalDark;
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    ctx.arc(0, 0, 0.34, -2.4, -0.7);
    ctx.stroke();
  });
}

// Таз: толстый пластик цвета метки слонихи
export function tubArt(color: string): Art {
  return draw(1.4, 1.4, 0.7, 0.7, (ctx) => {
    const base = mix(color, '#d9d2c4', 0.25);
    ellipse(ctx, 0, 0, 0.58, 0.58);
    fillStroke(ctx, base, 0.05);
    ellipse(ctx, 0, 0, 0.47, 0.47);
    ctx.fillStyle = shade(base, -0.22);
    ctx.fill();
    ellipse(ctx, 0, 0, 0.47, 0.47);
    ctx.lineWidth = 0.025;
    ctx.strokeStyle = shade(base, -0.4);
    ctx.stroke();
    ellipse(ctx, -0.25, -0.33, 0.14, 0.05, -0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
  });
}

export function shardArt(color: string): Art {
  return draw(0.9, 0.9, 0.45, 0.45, (ctx) => {
    const r = rnd(color.length * 7);
    for (let i = 0; i < 4; i++) {
      const x = (r() - 0.5) * 0.5;
      const y = (r() - 0.5) * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.12 + r() * 0.1, y + (r() - 0.5) * 0.12);
      ctx.lineTo(x + r() * 0.08, y + 0.12 + r() * 0.06);
      ctx.closePath();
      fillStroke(ctx, mix(color, '#d9d2c4', 0.25), 0.025);
    }
  });
}

// Куча сметённого сена и соломы
export function pileArt(): Art {
  return draw(1.2, 1.0, 0.6, 0.5, (ctx) => {
    ellipse(ctx, 0, 0, 0.42, 0.3);
    ctx.fillStyle = mix(C.hay, C.straw, 0.5);
    ctx.fill();
    ctx.strokeStyle = C.strawDark;
    ctx.lineWidth = 0.02;
    const r = rnd(29);
    for (let i = 0; i < 26; i++) {
      const x = (r() - 0.5) * 0.8;
      const y = (r() - 0.5) * 0.55;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 0.25, y + (r() - 0.5) * 0.15);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120,96,60,0.35)';
    ellipse(ctx, 0.05, 0.05, 0.2, 0.12);
    ctx.fill();
  });
}

function canes(ctx: Ctx, leaves: number, seed: number): void {
  const r = rnd(seed);
  for (let i = 0; i < 5; i++) {
    const y = -0.2 + i * 0.1;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.moveTo(-0.6, y);
    ctx.lineTo(0.6, y + (r() - 0.5) * 0.08);
    ctx.stroke();
    ctx.strokeStyle = '#8fae58';
    ctx.lineWidth = 0.045;
    ctx.stroke();
    ctx.strokeStyle = '#5f7d38';
    ctx.lineWidth = 0.02;
    for (let x = -0.45; x < 0.55; x += 0.28) {
      ctx.beginPath();
      ctx.moveTo(x, y - 0.03);
      ctx.lineTo(x, y + 0.03);
      ctx.stroke();
    }
  }
  if (leaves <= 0) return;
  for (let i = 0; i < Math.round(22 * leaves); i++) {
    const x = -0.5 + r() * 1.0;
    const y = -0.32 + r() * 0.64;
    ellipse(ctx, x, y, 0.12, 0.03, (r() - 0.5) * 1.2);
    fillStroke(ctx, r() < 0.5 ? '#7ea24a' : '#5e8437', 0.01);
  }
}

export function bambooBundle(): Art {
  return draw(1.5, 0.9, 0.75, 0.45, (ctx) => canes(ctx, 1, 61));
}

export function bambooRemains(): Art {
  return draw(1.5, 0.9, 0.75, 0.45, (ctx) => {
    ctx.globalAlpha = 0.85;
    canes(ctx, 0.05, 63);
  });
}

// Яблоко по спелости: свежее, бродит, гниль
export function appleArt(stage: 'fresh' | 'ferment' | 'rotten'): Art {
  return draw(0.4, 0.4, 0.2, 0.2, (ctx) => {
    const col = stage === 'fresh' ? '#c8463a' : stage === 'ferment' ? '#a06438' : '#5e4a32';
    ellipse(ctx, 0, 0, 0.1, 0.095);
    fillStroke(ctx, col, 0.02);
    if (stage !== 'fresh') {
      ctx.fillStyle = stage === 'ferment' ? 'rgba(90,60,30,0.55)' : 'rgba(40,30,20,0.6)';
      ellipse(ctx, 0.03, 0.02, 0.045, 0.035);
      ctx.fill();
    }
    ellipse(ctx, -0.03, -0.035, 0.03, 0.02, -0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();
    ctx.strokeStyle = '#5a4030';
    ctx.lineWidth = 0.018;
    ctx.beginPath();
    ctx.moveTo(0, -0.09);
    ctx.lineTo(0.02, -0.14);
    ctx.stroke();
  });
}

export function strawPile(): Art {
  return draw(1.6, 1.2, 0.8, 0.6, (ctx) => {
    const r = rnd(43);
    ellipse(ctx, 0, 0, 0.6, 0.42);
    ctx.fillStyle = C.straw;
    ctx.fill();
    ctx.strokeStyle = C.strawDark;
    ctx.lineWidth = 0.02;
    for (let i = 0; i < 44; i++) {
      const x = (r() - 0.5) * 1.1;
      const y = (r() - 0.5) * 0.75;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 0.36, y + (r() - 0.5) * 0.2);
      ctx.stroke();
    }
  });
}

// Клок сена в хоботе
export function hayTuft(): Art {
  return draw(0.6, 0.5, 0.3, 0.25, (ctx) => {
    ellipse(ctx, 0, 0, 0.22, 0.14);
    ctx.fillStyle = C.hay;
    ctx.fill();
    ctx.strokeStyle = C.hayDark;
    ctx.lineWidth = 0.02;
    const r = rnd(3);
    for (let i = 0; i < 10; i++) {
      const y = (r() - 0.5) * 0.2;
      ctx.beginPath();
      ctx.moveTo(-0.24, y);
      ctx.lineTo(0.24, y + (r() - 0.5) * 0.1);
      ctx.stroke();
    }
  });
}
