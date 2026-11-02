import { describe, expect, it } from 'vitest';
import { tick } from '../src/sim';
import { inPaddock } from '../src/data/map';
import { newItem } from '../src/sim/state';
import { finishShift } from '../src/sim/handover';
import { act, at, cleanShift, hold } from './helpers';

// Везти тачку в направлении N секунд
function drive(s: ReturnType<typeof cleanShift>, seconds: number, dx = 1, dy = 0): void {
  for (let i = 0; i < seconds * 30; i++) tick(s, 1 / 30, [{ type: 'move', dx, dy }]);
}

function loaded(load: Partial<ReturnType<typeof cleanShift>['barrow']>, x = 9, y = 15.4) {
  const s = cleanShift();
  s.elephants.forEach((e) => hold(e, 18, 3));
  Object.assign(s.barrow, { x: x + 0.9, y, pushed: true, ...load });
  at(s, x, y);
  s.player.facing = { x: 1, y: 0 };
  return s;
}

describe('сор с тачки', () => {
  it('«с горкой» сыплется только на развороте на ходу, по прямой не теряет ничего', () => {
    const s = loaded({ straw: 8 });
    drive(s, 1.2); // ровная езда по дорожке
    expect(s.litter).toHaveLength(0);
    expect(s.barrow.straw).toBe(8);
    drive(s, 1.1, -1, 0); // разворот на 180°
    expect(s.litter).toHaveLength(1);
    expect(s.barrow.straw).toBe(7);
    expect(s.litter.every((l) => !inPaddock(l.x, l.y))).toBe(true);
    expect(s.litter.some((l) => l.kind === 'straw')).toBe(true);
    drive(s, 1.1, 1, 0); // разворот обратно: 7/8 — всё ещё «с горкой»
    expect(s.barrow.straw).toBe(6);
    drive(s, 1.1, -1, 0); // 6/8 = 75% — ниже «горки», рассыпание прекратилось
    expect(s.barrow.straw).toBe(6);
    expect(s.litter).toHaveLength(2);
  });

  it('тачка ниже «горки» едет с поворотами вообще без потерь', () => {
    const s = loaded({ straw: 6 });
    drive(s, 1);
    drive(s, 1, 0, -1);
    drive(s, 1, -1, 0);
    drive(s, 1, 0, 1);
    expect(s.litter).toHaveLength(0);
    expect(s.barrow.straw).toBe(6);
  });

  it('разворот и упор в стену — две встряски, дальше при удержании тишина', () => {
    const s = loaded({ sawdust: 8 });
    drive(s, 1.2); // разогнаться: путь больше пары тайлов
    drive(s, 3, -1, 0); // разворот на ходу и упор в левую стену
    expect(s.litter).toHaveLength(2);
    expect(s.barrow.sawdust).toBe(6);
    drive(s, 1, -1, 0); // держим упор: повторных кучек нет
    expect(s.litter).toHaveLength(2);
  });

  it('выезд из вольера через проход — встряска на пороге', () => {
    const s = loaded({ sawdust: 8 }, 7, 8);
    drive(s, 2, 0, 1); // через дверь в коридор
    expect(s.litter).toHaveLength(1);
    expect(s.barrow.sawdust).toBe(7);
  });

  it('в вольере рассыпанное не считается: подстилка и трава', () => {
    const s = loaded({ sawdust: 8 }, 9, 6);
    drive(s, 1);
    drive(s, 1, 0, -1);
    expect(s.litter).toHaveLength(0);
  });

  it('пустая тачка сор не оставляет', () => {
    const s = loaded({});
    drive(s, 2);
    drive(s, 1, 0, -1);
    expect(s.litter).toHaveLength(0);
  });

  it('спринт с полной тачкой вызывает встряску и рассыпает опилки', () => {
    const s = loaded({ sawdust: 8 });
    for (let i = 0; i < 90; i++) tick(s, 1 / 30, [{ type: 'move', dx: 1, dy: 0, sprint: true }]);
    expect(s.litter.length).toBeGreaterThan(0);
    expect(s.barrow.sawdust).toBeLessThan(8);
  });

  it('испорченная подстилка не рассыпается даже при встряске', () => {
    const s = loaded({ sawdust: 8, waste: 1, spoiled: true });
    drive(s, 2, 0, -1);
    drive(s, 2, 1, 0);
    expect(s.litter).toHaveLength(0);
    expect(s.barrow.sawdust).toBe(8);
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
