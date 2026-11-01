import type { Prep } from '../sim/types';
import { C } from './palette';
import { Sprite, ellipse, line, union } from './pixel';

// Овощ крупным планом для чистки: тело и несрезанные дефекты — ботва, хвостик, гниль, глазки.
// Срезанные ботва и хвостик исчезают, на месте гнили и глазков остаётся светлый срез.

export const VEG_W = 40;
export const VEG_H = 24;

type Piece = Prep['pieces'][number];

const CARROT = { L: '#fcb468', M: '#fc7c18', D: '#c84c0c' };
const POTATO = { L: '#e4c47c', M: '#c88c4c', D: '#8c5418' };
const BEET = { L: '#d8487c', M: '#a80060', D: '#5c0030' };
const LEAF = { L: C.greenLight, M: C.green, D: C.greenDark };

export function vegSprite(piece: Piece): Sprite {
  const s = new Sprite(VEG_W, VEG_H);
  const spot = (kind: string) => piece.spots.find((p) => p.kind === kind);
  const px = (f: number) => f * VEG_W;
  const py = (f: number) => f * VEG_H;

  if (piece.kind === 'carrot') {
    if (!spot('top')?.cut) s.shape(union(line([[7, 12], [1, 6]], 1.2), line([[7, 12], [0, 12]], 1.2), line([[7, 12], [1, 18]], 1.2)), LEAF);
    s.shape(union(ellipse(13, 12, 7, 5), ellipse(23, 12.5, 9, 3.8), ellipse(31, 12.8, 4, 2.4)), CARROT);
    if (!spot('tail')?.cut) s.shape(line([[33, 13], [39, 13.5]], 0.8), CARROT);
    for (const y of [9, 15]) for (const x of [12, 18, 25]) s.set(x, y + (x % 2), '#c84c0c');
  } else if (piece.kind === 'beet') {
    if (!spot('top')?.cut) {
      s.shape(union(line([[20, 6], [14, 0]], 1.1), line([[20, 6], [26, 0]], 1.1), line([[20, 6], [20, 0]], 1)), LEAF);
      for (const [x, y] of [[17, 3], [20, 2], [23, 3]]) s.set(x, y, C.red);
    }
    s.shape(ellipse(20, 13, 10, 8.5), BEET);
    if (!spot('tail')?.cut) s.shape(line([[20, 20], [20, 23.5]], 0.8), BEET);
  } else {
    s.shape(ellipse(20, 12, 17, 10), POTATO);
  }

  // Гниль — бурое пятно, глазок — тёмная точка с ростком; срезанное — светлый срез
  for (const p of piece.spots) {
    const x = px(p.x);
    const y = py(p.y);
    if (p.kind === 'rot') {
      if (p.cut) s.fill(ellipse(x, y, 2, 1.6), C.goldLight);
      else {
        s.fill(ellipse(x, y, 2.4, 2), '#5c3000');
        s.set(x - 1, y - 1, '#2c1810');
        s.set(x + 1, y, '#8c5418');
      }
    } else if (p.kind === 'eye') {
      if (p.cut) s.fill(ellipse(x, y, 1.4, 1.2), C.goldLight);
      else {
        s.set(x, y, '#2c1810');
        s.set(x + 1, y, '#2c1810');
        s.set(x, y - 1, C.greenLight);
        s.set(x - 1, y - 2, C.greenLight);
      }
    }
  }
  return s;
}
