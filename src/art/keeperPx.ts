import { C } from './palette';
import { Sprite, grid } from './pixel';

// Кипер сбоку, лицом вправо. Кадр 16×24, ноги на нижней строке.
// Кепка, рабочая куртка со светоотражающей полосой, тёмные штаны, сапоги.

export const KEEPER_W = 16;
export const KEEPER_H = 24;
export const KEEPER_HAND = { x: 13, y: 12 }; // где держит предмет

const PAL: Record<string, string> = {
  k: C.k,
  c: C.red,
  C: C.redDark,
  w: C.white,
  h: C.brown,
  s: '#fcbc94',
  S: '#e4946c',
  g: C.green,
  G: C.greenLight,
  d: C.greenDark,
  y: C.gold,
  e: C.k,
};

// Верх: кепка, лицо, куртка (строки 0–15)
const TOP = [
  '.....kkkkk......',
  '....kcccwck.....',
  '...kcccccccck...',
  '...kCCCCCCCCkkk.',
  '...khhsssssskk..',
  '...khssssessk...',
  '...khssssssssk..',
  '....kssssSSkk...',
  '.....kssssk.....',
  '....kggggggk....',
  '...kgGGgggggkk..',
  '...kgGgggggSssk.',
  '...kyyyyyyyykk..',
  '...kgGgggggk....',
  '...kgGgggggk....',
  '....kddddddk....',
];

function legs(frame: 0 | 1 | 2): Sprite {
  const s = new Sprite(KEEPER_W, KEEPER_H);
  const pant = '#3c3c78';
  const pantL = '#5c5ca8';
  // Нога: штанина 3 пикселя, сапог 4
  const leg = (x: number, lift: number, dark: boolean) => {
    for (let y = 16; y <= 20 - lift; y++) {
      s.set(x - 1, y, C.k);
      s.set(x, y, dark ? pant : pantL);
      s.set(x + 1, y, pant);
      s.set(x + 2, y, pant);
      s.set(x + 3, y, C.k);
    }
    const by = 21 - lift;
    for (let dx = -1; dx <= 4; dx++) s.set(x + dx, by, C.k);
    s.set(x, by + 1, C.k);
    for (let dx = 0; dx <= 3; dx++) s.set(x + dx, by + 1, dx === 0 ? C.k : C.brown);
    s.set(x + 4, by + 1, C.k);
    for (let dx = -1; dx <= 4; dx++) s.set(x + dx, by + 2, C.k);
  };
  if (frame === 0) {
    leg(5, 0, true);
    leg(8, 0, false);
  } else if (frame === 1) {
    leg(3, 0, true);
    leg(10, 1, false);
  } else {
    leg(9, 0, true);
    leg(4, 1, false);
  }
  return s;
}

export function keeperFrame(frame: 0 | 1 | 2): Sprite {
  const s = new Sprite(KEEPER_W, KEEPER_H);
  s.draw(legs(frame));
  s.draw(grid(TOP, PAL), 0, frame === 0 ? 0 : 0);
  return s;
}
