// Портрет для карточки осмотра: голова и уши той же слонихи, что и на карте, мордой вверх.

import { bodyGeom, elephantEar, elephantHead, TEX } from '../render/art';
import type { ElephantProfile } from '../sim';

const cache = new Map<string, HTMLCanvasElement>();

function copy(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.style.width = src.style.width;
  c.style.height = src.style.height;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

export function portrait(p: ElephantProfile): HTMLCanvasElement {
  const key = `${p.id}:${p.look.seed}`;
  const hit = cache.get(key);
  if (hit) return copy(hit);
  const size = 120;
  const c = document.createElement('canvas');
  c.width = size * 2;
  c.height = size * 2;
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e8e4da';
  ctx.beginPath();
  ctx.arc(size, size, size, 0, Math.PI * 2);
  ctx.fill();
  const g = bodyGeom(p.look);
  const scale = (size * 2) / (TEX * (g.headR * 2 + 2.2 * p.look.ear * p.look.size));
  ctx.save();
  ctx.translate(size, size * 1.05);
  ctx.rotate(-Math.PI / 2);
  ctx.scale(scale, scale);
  const head = elephantHead(p.look);
  const earL = elephantEar(p.look, -1);
  const earR = elephantEar(p.look, 1);
  const R = g.headR * TEX;
  const put = (art: { canvas: HTMLCanvasElement; ox: number; oy: number }, x: number, y: number, rot: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(art.canvas, -art.ox * art.canvas.width, -art.oy * art.canvas.height);
    ctx.restore();
  };
  put(earL, -R * 0.3, -R * 0.62, 0.35);
  put(earR, -R * 0.3, R * 0.62, -0.35);
  put(head, 0, 0, 0);
  // Короткий опущенный хобот
  ctx.fillStyle = p.look.skin;
  ctx.strokeStyle = '#3b3633';
  ctx.lineWidth = 0.045 * TEX;
  ctx.beginPath();
  ctx.ellipse(R * 1.05, 0, R * 0.42, R * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  cache.set(key, c);
  return copy(c);
}
