// Оборудование слоновника: кормушки, поилки, пульт, шланг, мебель служебных помещений.

import { C, draw, rnd, rrect, type Art } from './art';
import { shade } from './palette';

type Ctx = CanvasRenderingContext2D;

function box(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, line = 0.045): void {
  rrect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (line > 0) {
    ctx.lineWidth = line;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
  }
}

// Кормушка-ясли: деревянная рама с перекладинами (сено рисуется поверх по уровню)
export function rackArt(w: number, h: number): Art {
  return draw(w + 0.2, h + 0.2, (w + 0.2) / 2, (h + 0.2) / 2, (ctx) => {
    box(ctx, -w / 2, -h / 2, w, h, 0.08, C.woodDark);
    box(ctx, -w / 2 + 0.08, -h / 2 + 0.08, w - 0.16, h - 0.16, 0.05, shade(C.woodDark, -0.35), 0);
  });
}

export function rackSlats(w: number, h: number): Art {
  return draw(w + 0.2, h + 0.2, (w + 0.2) / 2, (h + 0.2) / 2, (ctx) => {
    ctx.strokeStyle = C.wood;
    ctx.lineWidth = 0.06;
    for (let x = -w / 2 + 0.25; x < w / 2 - 0.1; x += 0.3) {
      ctx.beginPath();
      ctx.moveTo(x, -h / 2 + 0.05);
      ctx.lineTo(x, h / 2 - 0.05);
      ctx.stroke();
    }
    rrect(ctx, -w / 2, -h / 2, w, h, 0.08);
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
  });
}

// Бетонная поилка: бортик, вода рисуется поверх
export function troughArt(w: number, h: number): Art {
  return draw(w + 0.2, h + 0.2, (w + 0.2) / 2, (h + 0.2) / 2, (ctx) => {
    box(ctx, -w / 2, -h / 2, w, h, 0.14, '#cfc8ba');
    box(ctx, -w / 2 + 0.1, -h / 2 + 0.1, w - 0.2, h - 0.2, 0.08, '#a9a397', 0.025);
  });
}

export function drainArt(): Art {
  return draw(1.4, 1.0, 0.7, 0.5, (ctx) => {
    box(ctx, -0.55, -0.35, 1.1, 0.7, 0.08, '#b9b2a4', 0.035);
    ctx.strokeStyle = '#6f6a61';
    ctx.lineWidth = 0.04;
    for (let x = -0.42; x <= 0.43; x += 0.12) {
      ctx.beginPath();
      ctx.moveTo(x, -0.26);
      ctx.lineTo(x, 0.26);
      ctx.stroke();
    }
  });
}

export function panelArt(): Art {
  return draw(0.9, 1.1, 0.45, 0.55, (ctx) => {
    box(ctx, -0.25, -0.4, 0.5, 0.8, 0.07, C.paper);
    box(ctx, -0.16, -0.3, 0.32, 0.22, 0.04, C.ink, 0);
    for (const [y, col] of [
      [0.05, C.sageMid],
      [0.24, C.terracotta],
    ] as const) {
      ctx.beginPath();
      ctx.arc(0, y, 0.07, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 0.025;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
    }
  });
}

export function valveArt(open: boolean): Art {
  return draw(0.7, 0.7, 0.35, 0.35, (ctx) => {
    ctx.beginPath();
    ctx.arc(0, 0, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = open ? C.sageMid : C.terracotta;
    ctx.fill();
    ctx.lineWidth = 0.045;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    const a = open ? Math.PI / 2 : 0;
    ctx.moveTo(Math.cos(a) * -0.2, Math.sin(a) * -0.2);
    ctx.lineTo(Math.cos(a) * 0.2, Math.sin(a) * 0.2);
    ctx.stroke();
  });
}

export function reelArt(): Art {
  return draw(1.0, 1.0, 0.5, 0.5, (ctx) => {
    ctx.beginPath();
    ctx.arc(0, 0, 0.36, 0, Math.PI * 2);
    ctx.fillStyle = C.paper;
    ctx.fill();
    ctx.lineWidth = 0.045;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.strokeStyle = C.sageMid;
    ctx.lineWidth = 0.06;
    for (const r of [0.28, 0.21, 0.14]) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

export function containerArt(): Art {
  return draw(3.7, 2.5, 1.85, 1.25, (ctx) => {
    box(ctx, -1.7, -1.1, 3.4, 2.2, 0.12, '#557358', 0.05);
    box(ctx, -1.52, -0.92, 3.04, 1.84, 0.08, shade('#557358', -0.35), 0.03);
  });
}

export function toolBoardArt(): Art {
  return draw(3.4, 0.8, 1.7, 0.4, (ctx) => {
    box(ctx, -1.6, -0.25, 3.2, 0.5, 0.06, C.wood);
    ctx.fillStyle = C.ink;
    for (const x of [-1.1, 0.3]) {
      ctx.beginPath();
      ctx.arc(x, 0, 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function deskArt(): Art {
  return draw(3.0, 1.2, 1.5, 0.6, (ctx) => {
    box(ctx, -1.4, -0.5, 2.8, 1.0, 0.06, C.wood);
    // Журнал дежурства, кружка, рация
    box(ctx, -0.9, -0.3, 0.7, 0.5, 0.03, C.paper, 0.03);
    ctx.strokeStyle = C.stoneDark;
    ctx.lineWidth = 0.02;
    for (let y = -0.2; y < 0.15; y += 0.08) {
      ctx.beginPath();
      ctx.moveTo(-0.82, y);
      ctx.lineTo(-0.3, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0.35, -0.1, 0.12, 0, Math.PI * 2);
    ctx.fillStyle = C.terracotta;
    ctx.fill();
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    box(ctx, 0.75, -0.25, 0.22, 0.42, 0.04, C.ink, 0);
  });
}

export function shelfArt(): Art {
  return draw(1.1, 4.4, 0.55, 2.2, (ctx) => {
    box(ctx, -0.45, -2.1, 0.9, 4.2, 0.06, C.wood);
    const cols = [C.produceOrange, C.produceRed, C.produceGreen, C.produceYellow];
    const r = rnd(17);
    for (let i = 0; i < 5; i++) {
      const y = -1.85 + i * 0.8;
      box(ctx, -0.38, y, 0.76, 0.6, 0.05, '#d9c29c', 0.03);
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.arc(-0.22 + (k % 3) * 0.22, y + 0.17 + Math.floor(k / 3) * 0.25, 0.08, 0, Math.PI * 2);
        ctx.fillStyle = cols[Math.floor(r() * 4)];
        ctx.fill();
        ctx.lineWidth = 0.02;
        ctx.strokeStyle = C.ink;
        ctx.stroke();
      }
    }
  });
}

export function prepTableArt(): Art {
  return draw(3.4, 1.2, 1.7, 0.6, (ctx) => {
    box(ctx, -1.6, -0.5, 3.2, 1.0, 0.06, '#e6e1d6');
    box(ctx, -0.9, -0.32, 1.1, 0.62, 0.06, C.wood, 0.03);
    ctx.strokeStyle = C.metalDark;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(0.45, -0.1);
    ctx.lineTo(0.95, 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(1.25, 0, 0.22, 0, Math.PI * 2);
    ctx.fillStyle = C.terracotta;
    ctx.fill();
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
  });
}

export function fridgeArt(): Art {
  return draw(1.6, 2.4, 0.8, 1.2, (ctx) => {
    box(ctx, -0.7, -1.1, 1.4, 2.2, 0.1, '#f7f5f0');
    ctx.strokeStyle = C.stoneDark;
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(-0.6, -0.2);
    ctx.lineTo(0.6, -0.2);
    ctx.stroke();
    box(ctx, -0.25, -1.0, 0.5, 0.12, 0.04, C.sageMid, 0.02);
  });
}

export function lockersArt(): Art {
  return draw(0.9, 3.4, 0.45, 1.7, (ctx) => {
    for (let i = 0; i < 4; i++) box(ctx, -0.35, -1.6 + i * 0.8, 0.7, 0.75, 0.05, i % 2 ? '#c9d3c4' : '#b9c7b6', 0.035);
  });
}

export function lampArt(): Art {
  return draw(0.8, 0.8, 0.4, 0.4, (ctx) => {
    ctx.beginPath();
    ctx.arc(0, 0, 0.16, 0, Math.PI * 2);
    ctx.fillStyle = '#f7d388';
    ctx.fill();
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
  });
}

export function benchArt(): Art {
  return draw(2.0, 0.9, 1.0, 0.45, (ctx) => {
    box(ctx, -0.85, -0.25, 1.7, 0.5, 0.06, C.wood);
    ctx.strokeStyle = C.woodDark;
    ctx.lineWidth = 0.03;
    for (const y of [-0.08, 0.08]) {
      ctx.beginPath();
      ctx.moveTo(-0.8, y);
      ctx.lineTo(0.8, y);
      ctx.stroke();
    }
  });
}
