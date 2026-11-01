// Лист спрайтов для разработки: npm run dev → /dev-sheet.html?s=6
import { ELEPHANT_FRAMES, LOOKS, elephantFrame, elephantPortrait } from '../art/elephantPx';
import { itemSprites } from '../art/itemsPx';
import { keeperFrame } from '../art/keeperPx';
import { stationSprites } from '../art/stationsPx';
import { background, floorTiles } from '../art/worldPx';
import type { Sprite } from '../art/pixel';

const root = document.getElementById('root')!;
const params = new URLSearchParams(location.search);
const SCALE = Number(params.get('s')) || 4;
const only = params.get('only');

function show(row: HTMLElement, name: string, s: Sprite | HTMLCanvasElement, scale = SCALE): void {
  const c = s instanceof HTMLCanvasElement ? s : s.toCanvas();
  c.style.width = `${c.width * scale}px`;
  c.style.height = `${c.height * scale}px`;
  const f = document.createElement('figure');
  f.append(c, Object.assign(document.createElement('figcaption'), { textContent: name }));
  row.append(f);
}

function section(title: string, items: [string, Sprite][], scale = SCALE): void {
  if (only && only !== title) return;
  const h = document.createElement('h3');
  h.textContent = title;
  h.style.margin = '12px';
  const row = document.createElement('div');
  row.className = 'row';
  items.forEach(([n, s]) => show(row, n, s, scale));
  root.append(h, row);
}

const st = stationSprites();
section('bg', [['background', background(st['deco-cloud'])]], Number(params.get('bgs')) || 2);
for (const [id, look] of Object.entries(LOOKS)) {
  section(id, [...ELEPHANT_FRAMES.map((f) => [f, elephantFrame(look, f)] as [string, Sprite]), ['portrait', elephantPortrait(look)]]);
}
section('keeper', [0, 1, 2].map((f) => [`keeper${f}`, keeperFrame(f as 0 | 1 | 2)]));
section('items', Object.entries(itemSprites()));
section('floor', Object.entries(floorTiles()));
section('stations', Object.entries(st));

export {};
