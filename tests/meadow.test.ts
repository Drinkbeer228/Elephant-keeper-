import { describe, expect, it } from 'vitest';
import { MAP } from '../src/data/map';
import { advance } from '../src/sim';
import { decide } from '../src/sim/elephants';
import { cleanShift, el, hold } from './helpers';

describe('луг и природное обогащение', () => {
  it('слон идёт чесаться о дерево, а чесание снижает скуку', () => {
    const state = cleanShift();
    const pretty = el(state, 'pretty');
    for (let attempt = 0; attempt < 100 && pretty.next !== 'scratch'; attempt++) {
      hold(pretty, 30, 5);
      pretty.boredom = 50;
      decide(state, pretty);
    }

    expect(pretty.state).toBe('walk');
    expect(pretty.next).toBe('scratch');
    expect(MAP.meadowTrees).toContainEqual({ x: pretty.tx, y: pretty.ty });

    hold(pretty, pretty.tx, pretty.ty);
    pretty.state = 'scratch';
    pretty.timer = 10;
    state.elephants.forEach((elephant) => {
      if (elephant !== pretty) hold(elephant, 6, 3);
    });
    const before = pretty.boredom;
    advance(state, 1);
    expect(pretty.boredom).toBeLessThan(before);
  });

  it('грязный луг и мутный бассейн не дают сбросить скуку', () => {
    const state = cleanShift();
    const pretty = el(state, 'pretty');
    hold(pretty, 30, 5);
    pretty.boredom = 80;
    state.dung.push(
      { id: 101, x: 30, y: 5, at: 0 },
      { id: 102, x: 30.2, y: 5, at: 0 },
      { id: 103, x: 30.4, y: 5, at: 0 },
      { id: 104, x: 30.6, y: 5, at: 0 },
      { id: 105, x: 30.8, y: 5, at: 0 },
    );

    decide(state, pretty);
    expect(pretty.state).toBe('sway');

    state.pools[0].dirty = 80;
    pretty.state = 'bathe';
    pretty.pool = 0;
    pretty.timer = 10;
    const before = pretty.boredom;
    advance(state, 1);
    expect(pretty.boredom).toBeGreaterThan(before);
  });
});
