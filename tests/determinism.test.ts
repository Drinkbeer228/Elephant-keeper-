import { describe, expect, it } from 'vitest';
import { createState, serialize, step, type StepInput } from '../src/sim';

function script(i: number): StepInput {
  const phase = Math.floor(i / 90) % 4;
  const dirs = [
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
  ];
  return { move: dirs[phase], run: i % 200 < 50, actions: [], cancel: false };
}

describe('детерминизм', () => {
  it('тот же seed и тот же ввод — побитово то же состояние', () => {
    const a = createState({ seed: 77, herdSize: 4 });
    const b = createState({ seed: 77, herdSize: 4 });
    for (let i = 0; i < 6000; i++) {
      step(a, script(i));
      step(b, script(i));
    }
    expect(serialize(a, 1)).toBe(serialize(b, 1));
  });

  it('другой seed — другое стадо и другое поведение', () => {
    const a = createState({ seed: 77, herdSize: 3 });
    const b = createState({ seed: 78, herdSize: 3 });
    expect(a.elephants.map((e) => e.profile.traits)).not.toEqual(b.elephants.map((e) => e.profile.traits));
  });
});
