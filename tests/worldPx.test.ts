import { describe, expect, it } from 'vitest';
import { MAP } from '../src/data/map';
import { CELL, background } from '../src/art/worldPx';
import { C } from '../src/art/palette';
import { Sprite } from '../src/art/pixel';

describe('пиксельный фон мира', () => {
  const world = background(new Sprite(1, 1));

  it('показывает непрозрачную бирюзовую воду и песчаный берег бассейна', () => {
    const pool = MAP.pools[0];
    const cx = Math.round(pool.x * CELL);
    const cy = Math.round(pool.y * CELL);
    const rx = Math.round(pool.rx * CELL);

    expect(world.get(cx, cy)).toBe('#48b8f8');
    expect(world.get(cx + rx + 8, cy)).toBe('#8c5418');
  });

  it('рисует деревья на лугах обоих вольеров', () => {
    for (const tree of [MAP.meadowTrees[0], MAP.meadowTrees.at(-1)!]) {
      expect(world.get(Math.round(tree.x * CELL), Math.round(tree.y * CELL))).toBe('#5c3000');
    }
  });

  it('отличает буфер паллет от асфальта и размечает все свободные позиции', () => {
    const receiving = MAP.stations.receiving;
    expect(world.get(Math.round(receiving.x * CELL), Math.round(receiving.y * CELL))).toBe('#5c646c');

    for (const spot of MAP.receivingSpots) {
      const x = Math.round((spot.x - MAP.palletFootprint.w / 2) * CELL) + 1;
      const y = Math.round((spot.y - MAP.palletFootprint.h / 2) * CELL);
      expect(world.get(x, y)).toBe(C.gold);
    }
  });
});
