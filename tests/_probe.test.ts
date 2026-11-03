import { describe, it } from 'vitest';
import { createShift } from '../src/sim/state';
import { pace } from '../src/sim/clock';
import * as old from './_old/elephantsOld';

describe('probe', () => {
  it('OLD trace elephant2 only, others frozen idle', () => {
    const s = createShift(1);
    for (const e of s.elephants) { e.timer = 1e9; }
    const kira = s.elephants[2];
    kira.timer = 5; // как в dummy? нет — у всех timer из createShift; заморозим остальных, у kira оставим его собственный
    const trace: string[] = [];
    let last = '';
    for (let t = 0; t < 60; t += 0.5) {
      const dt = 0.5;
      const dtReal = dt * pace(s);
      s.t += dt;
      s.aiDt = dt; s.aiDtReal = dtReal;
      old.updateOne(s, kira, dt, dtReal);
      const sig = `${Math.floor(t)}:${s.elephants.map((e) => e.state).join('|')}`;
      if (sig !== last) { trace.push(sig); last = sig; }
    }
    console.log(trace.join('\n'));
  });
});
