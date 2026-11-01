import { describe, expect, it } from 'vitest';
import { tick } from '../src/sim';
import { inPaddock } from '../src/data/map';
import { newItem } from '../src/sim/state';
import { finishShift } from '../src/sim/handover';
import { act, at, cleanShift, hold } from './helpers';

// Везти тачку вправо N секунд
function drive(s: ReturnType<typeof cleanShift>, seconds: number): void {
  for (let i = 0; i < seconds * 30; i++) tick(s, 1 / 30, [{ type: 'move', dx: 1, dy: 0 }]);
}

function loaded(load: Partial<ReturnType<typeof cleanShift>['barrow']>, x = 1.5, y = 10.4) {
  const s = cleanShift();
  s.elephants.forEach((e) => hold(e, 18, 3));
  Object.assign(s.barrow, { x: x + 0.9, y, pushed: true, ...load });
  at(s, x, y);
  s.player.facing = { x: 1, y: 0 };
  return s;
}

describe('сор с тачки', () => {
  it('тачка с соломой по дорожке оставляет сор', () => {
    const s = loaded({ straw: 8 });
    drive(s, 3);
    expect(s.litter.length).toBeGreaterThan(0);
    expect(s.litter.every((l) => !inPaddock(l.x, l.y))).toBe(true);
    expect(s.litter.some((l) => l.kind === 'straw')).toBe(true);
  });

  it('пустая тачка сор не оставляет', () => {
    const s = loaded({});
    drive(s, 3);
    expect(s.litter).toHaveLength(0);
  });

  it('в вольере рассыпанное не считается: подстилка и трава', () => {
    const s = loaded({ sawdust: 8 }, 3, 5);
    drive(s, 3);
    expect(s.litter).toHaveLength(0);
  });

  it('метла подметает сор рядом', () => {
    const s = cleanShift();
    s.litter.push({ id: 1, x: 7, y: 10.5, kind: 'straw' }, { id: 2, x: 7.6, y: 10.6, kind: 'sawdust' }, { id: 3, x: 12, y: 10.5, kind: 'hay' });
    s.player.held = newItem(s, 'broom');
    at(s, 7.2, 10.5);
    expect(act(s)).toBe('Подмести сор (2)');
    expect(s.litter.map((l) => l.id)).toEqual([3]);
  });

  it('много сора к сдаче — замечание', () => {
    const s = cleanShift();
    for (let i = 0; i < 6; i++) s.litter.push({ id: i, x: 5 + i, y: 10.5, kind: 'straw' });
    expect(finishShift(s).remarks).toContain('Сор на дорожке');
  });
});
