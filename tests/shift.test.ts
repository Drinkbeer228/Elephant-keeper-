import { describe, expect, it } from 'vitest';
import { advance, createShift, type State } from '../src/sim';
import { finishShift } from '../src/sim/handover';
import { BALANCE } from '../src/data/balance';
import { MAP, inPaddock } from '../src/data/map';
import { addItem, newItem } from '../src/sim/state';
import { cleanShift, el, hold } from './helpers';

describe('смена и сдача', () => {
  it('смена идёт сразу: время, слонихи, закрытые ворота', () => {
    const s = createShift(1);
    expect(s.phase).toBe('shift');
    expect(s.gateOpen).toBe(false);
    expect(s.trough).toBeGreaterThanOrEqual(30);
    expect(s.feederHay).toBeGreaterThanOrEqual(20);
    const before = s.elephants.map((e) => [e.x, e.y]);
    advance(s, 30);
    expect(s.t).toBeGreaterThanOrEqual(30);
    expect(s.elephants.some((e, i) => e.x !== before[i][0] || e.y !== before[i][1])).toBe(true);
  });

  it('чистая смена сдаётся со всеми ✓', () => {
    const r = finishShift(cleanShift());
    expect(r.checklist).toHaveLength(10);
    expect(r.checklist.every((c) => c.ok)).toBe(true);
  });

  it.each([
    ['gate', (s: State): unknown => (s.gateOpen = true)],
    ['paddockClear', (s: State): unknown => addItem(s, 'bucket', 5, 5)],
    ['standing', (s: State): unknown => (s.elephants[0].footDebt += BALANCE.footDebt.limpThreshold)],
    ['water', (s: State): unknown => (s.trough = 10)],
    ['hay', (s: State): unknown => (s.feederHay = 5)],
    ['inventory', (s: State): unknown => (s.items.find((i) => i.kind === 'fork')!.x += 3)],
    ['barrow', (s: State): unknown => (s.barrow.x += 3)],
    ['basins', (s: State): unknown => Object.assign(s.items.find((i) => i.kind === 'basin')!, { x: 12.6, y: 10.6 })],
    [
      'dryBedding',
      (s: State): unknown => [MAP.bedding.x, MAP.bedding.x + 1, MAP.bedding.x + 2, MAP.bedding.x + 3].forEach((cx) => (s.cells[MAP.bedding.y][cx] = { kind: 'wet', since: 0 })),
    ],
    ['dungCleared', (s: State): unknown => s.dung.push({ id: 999, x: 5.5, y: 5.5, at: 0 })],
  ] as const)('пункт %s ловит своё нарушение и только его', (id, spoil) => {
    const s = cleanShift();
    spoil(s);
    const r = finishShift(s);
    expect(r.checklist.filter((c) => !c.ok).map((c) => c.id)).toEqual([id]);
  });

  it('чек-лист весит 30 баллов: один ✗ стоит 3', () => {
    const a = cleanShift();
    const b = structuredClone(a);
    b.gateOpen = true;
    expect(finishShift(a).score - finishShift(b).score).toBe(3);
  });

  it('смена целиком без кипера: доходит до табеля, слонихи не выходят из вольера', () => {
    const s = cleanShift(42);
    advance(s, BALANCE.time.shiftEnd);
    for (const e of s.elephants) expect(inPaddock(e.x, e.y)).toBe(true);
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

describe('табель', () => {
  it('смена без единого кормления — не больше одной звезды, даже если чисто', () => {
    const s = cleanShift(9);
    s.t = 1439;
    advance(s, 2);
    expect(s.report!.stars).toBe(1);
  });
});
