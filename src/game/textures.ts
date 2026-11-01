import type Phaser from 'phaser';
import { ELEPHANT_FRAMES, LOOKS, elephantFrame, elephantPortrait } from '../art/elephantPx';
import { itemSprites } from '../art/itemsPx';
import { keeperFrame } from '../art/keeperPx';
import { register, type Sprite } from '../art/pixel';
import { stationSprites } from '../art/stationsPx';
import { background, floorTiles, lampGlow, nightOverlay } from '../art/worldPx';
import type { Item } from '../sim';

// Все пиксельные спрайты собираются в коде при запуске и регистрируются как текстуры Phaser

const items = itemSprites();
const stations = stationSprites();

export function loadTextures(scene: Phaser.Scene): void {
  for (const [id, look] of Object.entries(LOOKS)) {
    for (const f of ELEPHANT_FRAMES) register(scene, `el-${id}-${f}`, elephantFrame(look, f));
  }
  ([0, 1, 2] as const).forEach((f) => register(scene, `keeper-${f}`, keeperFrame(f)));
  for (const [k, s] of Object.entries(items)) register(scene, k, s);
  for (const [k, s] of Object.entries(stations)) register(scene, k, s);
  for (const [k, s] of Object.entries(floorTiles())) register(scene, k, s);
  register(scene, 'bg', background(stations['deco-cloud'], stations['deco-bush']));
  register(scene, 'night', nightOverlay());
  register(scene, 'glow', lampGlow());
}

export function itemTexture(item: Item): string {
  switch (item.kind) {
    case 'bucket':
      return (item.liters ?? 0) > 0 ? 'item-bucket-full' : item.dirty ? 'item-bucket-dirty' : 'item-bucket';
    case 'bag':
      return (item.fill ?? 0) >= 3 ? 'item-bag-full' : 'item-bag';
    case 'basin':
      return item.food === 'kasha' ? 'item-basin-kasha' : item.food === 'veg' ? 'item-basin-veg' : 'item-basin';
    default:
      return `item-${item.kind}`;
  }
}

// Для интерфейса: картинки как data URL
function url(s: Sprite): string {
  return s.toCanvas().toDataURL();
}
const itemUrls = new Map<string, string>();
export function itemUrl(item: Item): string {
  const key = itemTexture(item);
  if (!itemUrls.has(key)) itemUrls.set(key, url(items[key]));
  return itemUrls.get(key)!;
}
let barrowIcon = '';
export function barrowUrl(): string {
  if (!barrowIcon) barrowIcon = url(stations['barrow-base']);
  return barrowIcon;
}
const portraits = new Map<string, string>();
export function portraitUrl(id: string): string {
  if (!portraits.has(id)) portraits.set(id, url(elephantPortrait(LOOKS[id])));
  return portraits.get(id)!;
}
