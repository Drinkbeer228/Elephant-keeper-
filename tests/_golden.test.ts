import { describe, it } from 'vitest';
import { createShift } from '../src/sim/state';
import { advance } from '../src/sim/tick';

describe('dbg engine', () => {
  it('first 40 steps elephant0 via advance', () => {
    const s = createShift(1);
    const out: string[] = [];
    for (let i = 0; i < 40; i++) {
      advance(s, 0.5);
      const e = s.elephants[0];
      out.push(`t=${s.t.toFixed(1)} state=${e.state} timer=${e.timer.toFixed(2)} fsmT=${e.fsm?.transitions}`);
    }
    console.log(out.join('\n'));
  });
});
