import { describe, it } from 'vitest';
import { createShift } from '../src/sim/state';
import { pace } from '../src/sim/clock';
import * as old from './_old/elephantsOld';

// Эталон: СТАРАЯ логика (switch в updateOne), полная симуляция всех слонов,
// seed 1, 600 игровых минут шагом maxStep=0.5 — тот же контур, что stepSim/tick.
describe('regen golden', () => {
  it('full-sim old-logic trace', () => {
    const s = createShift(1);
    const trace: string[] = [];
    let last = '';
    for (let m = 0; m < 600; m += 0.5) {
      const dt = 0.5;
      const dtReal = dt * pace(s);
      s.t += dt;
      s.aiDt = dt;
      s.aiDtReal = dtReal;
      old.updateElephants(s, dt, dtReal);
      const sig = s.elephants.map((e) => e.state).join('|');
      if (sig !== last) {
        trace.push(`${Math.floor(m)}:${sig}`);
        last = sig;
      }
    }
    console.log('===TRACE===');
    console.log(trace.map((t) => `    '${t}',`).join('\n'));
    console.log('===END===');
    console.log('rngEnd:', s.rng);
    console.log('statesAtEnd:', JSON.stringify(s.elephants.map((e) => e.state)));
  });
});
