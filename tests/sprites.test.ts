import { describe, expect, it } from 'vitest';
import { itemSprites } from '../src/art/itemsPx';
import { itemTexture } from '../src/game/textures';
import { ITEM_NAMES } from '../src/sim/items';
import type { Item } from '../src/sim';

describe('спрайты вещей', () => {
  it('у каждой вещи в каждом состоянии есть картинка', () => {
    const sprites = itemSprites();
    const variants: Partial<Item>[] = [
      {},
      { liters: 10 },
      { dirty: true },
      { load: 3 },
      { charges: 0 },
      { charges: 3 },
      { fill: 4 },
      { food: 'kasha' },
      { food: 'veg' },
      { veg: 'raw' },
      { veg: 'soaking' },
      { veg: 'washed' },
      { veg: 'peeled' },
    ];
    for (const kind of Object.keys(ITEM_NAMES) as Item['kind'][]) {
      for (const v of variants) {
        const key = itemTexture({ id: 1, kind, x: 0, y: 0, droppedAt: 0, ...v });
        expect(sprites[key], `${kind} ${JSON.stringify(v)} → ${key}`).toBeDefined();
      }
    }
  });
});
