// Палитра: тёплый песок и камень, шалфейная зелень, приглушённая терракота, тёмные контуры.

export const C = {
  ink: '#2c302e',
  inkSoft: '#4a4f4c',
  paper: '#f4f1ea',
  stone: '#e8e4da',
  stoneDark: '#d5cfc2',
  sand: '#e4d5b3',
  sandDark: '#d3c29c',
  sandLight: '#eee3c8',
  dust: '#ebdcbc',
  grass: '#b4c19a',
  grassDark: '#93a57b',
  tuft: '#6b7d57',
  sage: '#2e5a44',
  sageMid: '#5f8a6e',
  sageSoft: '#a8bfa9',
  terracotta: '#c86d51',
  terracottaDark: '#a9573e',
  terracottaSoft: '#e4b4a1',
  water: '#86ada7',
  waterLight: '#b8d2cc',
  waterDeep: '#6b948e',
  waterDirty: '#8f9a74',
  concrete: '#dcd6ca',
  concreteDark: '#c8c0b1',
  gravel: '#e3ddcf',
  wood: '#c9a77a',
  woodDark: '#9a744c',
  floorWood: '#e7d6b8',
  floorTile: '#ece8df',
  straw: '#e6c877',
  strawDark: '#c9a650',
  hay: '#c8b465',
  hayDark: '#9c8c45',
  dung: '#7a5c3c',
  dungDark: '#5a4330',
  produceRed: '#c8553d',
  produceOrange: '#e08a3c',
  produceGreen: '#7f9f4e',
  produceYellow: '#e7c55a',
  leaf: '#6f8f55',
  leafDark: '#4f6b3d',
  bark: '#8a6a4a',
  metal: '#9aa29d',
  metalDark: '#6c736f',
  shadow: 'rgba(44, 48, 46, 0.16)',
};

export function hex(c: string): number {
  return parseInt(c.slice(1, 7), 16);
}

// Осветлить/затемнить цвет #rrggbb на k ∈ [−1, 1]
export function shade(c: string, k: number): string {
  const n = parseInt(c.slice(1, 7), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (k >= 0) {
    r += (255 - r) * k;
    g += (255 - g) * k;
    b += (255 - b) * k;
  } else {
    r *= 1 + k;
    g *= 1 + k;
    b *= 1 + k;
  }
  const h = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function mix(a: string, b: string, k: number): string {
  const na = parseInt(a.slice(1, 7), 16);
  const nb = parseInt(b.slice(1, 7), 16);
  const ch = (s: number) => Math.round((((na >> s) & 255) * (1 - k) + ((nb >> s) & 255) * k)).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}
