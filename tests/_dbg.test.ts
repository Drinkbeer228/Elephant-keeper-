import { describe, expect, it } from 'vitest';
import { createShift } from '../src/sim/state';
import * as elephants from '../src/sim/elephants';

describe('dbg', () => {
  it('arrive default then decide', () => {
    const s = createShift(1);
    const e = s.elephants[2];
    e.state = 'walk'; e.next = 'idle' as any; e.tx = e.x + 0.01; e.ty = e.y;
    (elephants as any).arrive(s, e, elephants.profileOf(e));
    console.log('after arrive(idle-next):', e.state, 'timer', e.timer.toFixed(3));
    (elephants as any).decide(s, e);
    console.log('after decide:', e.state, 'timer', e.timer.toFixed(3), 'next', e.next, 'tx', e.tx.toFixed(2), 'ty', e.ty.toFixed(2), 'x', e.x.toFixed(2));
    expect(true).toBe(true);
  });
});
