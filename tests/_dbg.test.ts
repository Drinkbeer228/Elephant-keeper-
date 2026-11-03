import { it } from 'vitest';
import { createShift } from '../src/sim/state';
import { advance } from '../src/sim/tick';

it('dbg', () => {
  const s = createShift(1);
  let last = '';
  for (let t = 0; t < 20; t += 0.5) {
    advance(s, 0.5);
    const sig = s.elephants.map((e) => e.state).join('|');
    if (sig !== last) { console.log(`${t.toFixed(1)}:${sig}`); last = sig; }
  }
  console.log('rng', s.rng);
});
