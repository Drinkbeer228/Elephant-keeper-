import { describe, it } from 'vitest';
import { createShift } from '../src/sim/state';
import { advance } from '../src/sim/tick';

// Новый прогон: движок FSM через штатный контур симуляции (advance → stepSim),
// seed 1, 600 игровых минут. Формат: целые минуты:id0:id1:...:state (по id слонов).
describe('regen engine', () => {
  it('full-sim engine trace', () => {
    const s = createShift(1);
    const trace: string[] = [];
    let last = '';
    for (let m = 0; m < 600; m += 0.5) {
      advance(s, 0.5);
      const sig = s.elephants.map((e) => `${e.id}:${e.state}`).join(':');
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
    console.log('ids:', JSON.stringify(s.elephants.map((e) => e.id)));
  });
});
