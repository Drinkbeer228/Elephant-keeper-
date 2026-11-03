import { describe, expect, it } from 'vitest';
import { createShift } from '../src/sim/state';
import * as elephants from '../src/sim/elephants';

describe('dbg2', () => {
  it('arrive default then decide', () => {
    const s = createShift(1);
    const e = s.elephants[2];
    e.state = 'walk'; e.next = 'idle' as never; e.tx = e.x + 0.01; e.ty = e.y;
    (elephants as any).arrive(s, e, elephants.profileOf(e));
    console.log('LOG after arrive(idle-next):', e.state, 'timer', e.timer.toFixed(3));
    (elephants as any).decide(s, e);
    console.log('LOG after decide:', e.state, 'timer', e.timer.toFixed(3), 'next', e.next, 'tx', e.tx.toFixed(2), 'x', e.x.toFixed(2));
    expect(true).toBe(true);
  });
});
