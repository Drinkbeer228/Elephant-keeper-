import { describe, expect, it } from 'vitest';
import { advance, createShift, tick, walkable } from '../src/sim';
import { MAP } from '../src/data/map';
import { newItem } from '../src/sim/state';
import { cleanShift, el, hold } from './helpers';

describe('приём и сдача смены', () => {
  it('найденный косяк сменщика засчитан, пропущенный — нет, лишний ✗ — придирка', () => {
    const s = createShift(7, { defects: ['fence', 'water'], mess: false });
    expect(s.fenceOn).toBe(false);
    expect(s.trough).toBe(0);
    tick(s, 0, [
      { type: 'toggleCheck', id: 'fence', value: false },
      { type: 'toggleCheck', id: 'water', value: true },
      { type: 'toggleCheck', id: 'hay', value: false },
      { type: 'acceptShift' },
    ]);
    expect(s.phase).toBe('shift');
    advance(s, 1440);
    expect(s.phase).toBe('report');
    const r = s.report!;
    expect(r.acceptance.found).toBe(1);
    expect(r.acceptance.defects).toBe(2);
    expect(r.acceptance.missed).toEqual(['Вода в доступе']);
    expect(r.acceptance.nitpicks).toEqual(['Сено в доступе']);
    // Электропастух так и не включили — сменщик это отметит
    expect(r.remarks).toContain('✗ Электропастух работает');
  });

  it('пока смена не принята, время стоит', () => {
    const s = createShift(3);
    tick(s, 30);
    expect(s.t).toBe(0);
  });

  it('смена целиком без кипера: доходит до табеля, слонихи не выходят из подстилки', () => {
    const s = cleanShift(42);
    for (let i = 0; i < 1440 * 2 && s.phase === 'shift'; i++) {
      advance(s, 0.5);
      for (const e of s.elephants) {
        expect(e.x).toBeGreaterThanOrEqual(MAP.bedding.x);
        expect(e.x).toBeLessThanOrEqual(MAP.bedding.x + MAP.bedding.cols);
        expect(e.y).toBeGreaterThanOrEqual(MAP.bedding.y);
        expect(e.y).toBeLessThanOrEqual(MAP.bedding.y + MAP.bedding.rows);
      }
    }
    expect(s.phase).toBe('report');
    const r = s.report!;
    expect(r.stars).toBe(1);
    expect(r.pees.reduce((a, p) => a + p.missed, 0)).toBeGreaterThan(10);
    expect(r.meals.every((m) => m.statuses.every((x) => x.status === 'missed'))).toBe(true);
  });

  it('та же смена по тому же seed повторяется', () => {
    const a = cleanShift(5);
    const b = cleanShift(5);
    advance(a, 600);
    advance(b, 600);
    expect(a.elephants.map((e) => [e.x, e.y, e.bladder])).toEqual(b.elephants.map((e) => [e.x, e.y, e.bladder]));
  });
});

describe('вещи у ограждения', () => {
  it('скучающая недоверчивая слониха ломает забытую вещь, доверяющая — нет', () => {
    const run = (trust: number) => {
      const s = cleanShift(11);
      s.elephants.forEach((e) => hold(e, 3, 3));
      const m = el(s, 'margo');
      hold(m, 6, 8.2);
      s.elephants.forEach((e) => (e.trust = trust));
      m.boredom = 100;
      s.items.push({ ...newItem(s, 'fork'), x: 5, y: 9.6 });
      advance(s, 600);
      return s.stats.broken;
    };
    expect(run(0)).toContain('вилы');
    expect(run(100)).toEqual([]);
  });
});

describe('кипер', () => {
  it('через ограждение не пройти, через проход — можно', () => {
    expect(walkable(4, 9)).toBe(false);
    expect(walkable(7, 9)).toBe(true);
    expect(walkable(13, 5)).toBe(false);
    expect(walkable(7, 4)).toBe(true);
  });
});
