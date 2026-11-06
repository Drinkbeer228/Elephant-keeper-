import { describe, expect, it } from 'vitest';
import { runMinutes, step } from '../src/sim';
import { STATIONS } from '../src/data/facility';
import { act, at, atStation, game } from './helpers';
import type { State } from '../src/sim';

// Одна слониха в слоновнике, ворота закрыты, пузырь почти полон
function toiletScene(seed: number, expressiveness: number, expectation: number): State {
  const s = game(seed, 1, [{ expressiveness, persistence: 0.6 }]);
  const e = s.elephants[0];
  e.learned.expectation = expectation;
  e.learned.trust = 0.6;
  e.needs.bladder = 76;
  e.needs.hunger = 10;
  e.needs.thirst = 5;
  e.needs.boredom = 10;
  e.needs.fatigue = 10;
  s.t = 10 * 60; // 10:00 — день
  s.dayStart = 8 * 60;
  return s;
}

function runUntil(s: State, minutes: number, cond: () => boolean): boolean {
  const end = s.t + minutes;
  while (s.t < end) {
    step(s);
    if (cond()) return true;
  }
  return false;
}

describe('сигналы и научение', () => {
  it('разговорчивая слониха просится в туалет, а открытые ворота — ответ', () => {
    const s = toiletScene(1, 0.9, 0.7);
    const e = s.elephants[0];
    expect(runUntil(s, 40, () => e.signal?.kind === 'toilet')).toBe(true);
    const before = e.learned.expectation;
    atStation(s, 'gateControl');
    expect(act(s, 'gate:gate')).toBe(true);
    step(s);
    expect(e.signal).toBeNull();
    expect(e.learned.expectation).toBeGreaterThan(before);
    expect(e.day.answered).toBe(1);
    runMinutes(s, 40);
    expect(e.day.urineOutside).toBeGreaterThanOrEqual(1);
    expect(e.day.urineBedding).toBe(0);
  });

  it('если на сигнал не ответить — ожидание падает, а моча оказывается на подстилке', () => {
    const s = toiletScene(2, 0.9, 0.7);
    const e = s.elephants[0];
    expect(runUntil(s, 40, () => e.signal?.kind === 'toilet')).toBe(true);
    const before = e.learned.expectation;
    runMinutes(s, 90);
    expect(e.day.ignored).toBeGreaterThanOrEqual(1);
    expect(e.learned.expectation).toBeLessThan(before);
    expect(e.day.urineBedding + e.day.urineDrain).toBeGreaterThanOrEqual(1);
  });

  it('молчаливая и разуверившаяся почти не зовёт, но физиология та же', () => {
    let loud = 0;
    let quiet = 0;
    let quietUrine = 0;
    for (const seed of [3, 4, 5, 6]) {
      const a = toiletScene(seed, 0.9, 0.8);
      runMinutes(a, 300);
      loud += a.elephants[0].day.signals;
      const b = toiletScene(seed, 0.05, 0.03);
      runMinutes(b, 300);
      quiet += b.elephants[0].day.signals;
      const d = b.elephants[0].day;
      quietUrine += d.urineBedding + d.urineDrain + d.urineOutside;
    }
    expect(loud).toBeGreaterThan(quiet);
    expect(quietUrine).toBeGreaterThanOrEqual(4);
  });

  it('повторное игнорирование учит не звать: сигналов становится меньше', () => {
    const s = game(7, 1, [{ expressiveness: 0.75, persistence: 0.4 }]);
    const e = s.elephants[0];
    e.learned.expectation = 0.8;
    s.world.hay.barnRack = 100;
    s.world.water.barnWater.level = 100;
    runMinutes(s, 720);
    const first = e.day.signals;
    const exp1 = e.learned.expectation;
    e.day.signals = 0;
    runMinutes(s, 720);
    expect(e.learned.expectation).toBeLessThan(exp1);
    expect(e.day.signals).toBeLessThanOrEqual(first);
  });

  it('позвать к стоку: слониха подходит к тренировочной стенке и справляется над решёткой', () => {
    const s = toiletScene(8, 0.9, 0.7);
    const e = s.elephants[0];
    e.learned.cooperation = 0.8;
    expect(runUntil(s, 40, () => e.signal?.kind === 'toilet')).toBe(true);
    atStation(s, 'trainingWall');
    expect(act(s, `call:${e.id}`)).toBe(true);
    expect(e.act.kind).toBe('follow');
    expect(runUntil(s, 30, () => e.day.urineDrain > 0)).toBe(true);
    expect(e.day.answered).toBe(1);
  });

  it('пришла на зов и получила угощение — покладистость растёт; без похвалы — падает', () => {
    const run = (reward: boolean) => {
      const s = game(9, 1, [{ cooperation: 0.9 }]);
      const e = s.elephants[0];
      e.learned.cooperation = 0.9;
      e.learned.trust = 0.8;
      e.needs.hunger = 5;
      e.needs.bladder = 0;
      at(s, 19.5, 31);
      for (let i = 0; i < 10 && e.act.kind !== 'follow'; i++) act(s, `call:${e.id}`);
      expect(e.act.kind).toBe('follow');
      const c0 = e.learned.cooperation;
      runUntil(s, 20, () => e.mem.call !== null && e.mem.call.arrivedAt >= 0);
      if (reward) act(s, `treat:${e.id}`);
      runMinutes(s, 10);
      return e.learned.cooperation - c0;
    };
    expect(run(true)).toBeGreaterThan(0);
    expect(run(false)).toBeLessThan(0);
  });

  it('просит воды у пустой поилки — налитая вода снимает сигнал', () => {
    const s = game(10, 1, [{ expressiveness: 0.9 }]);
    const e = s.elephants[0];
    e.learned.expectation = 0.8;
    e.needs.thirst = 80;
    e.needs.hunger = 5;
    e.needs.bladder = 0;
    s.world.water.barnWater.level = 0;
    expect(runUntil(s, 60, () => e.signal?.kind === 'water')).toBe(true);
    s.world.water.barnWater.level = 60;
    step(s);
    expect(e.signal).toBeNull();
    expect(e.day.answered).toBe(1);
    expect(STATIONS.barnWater.slots).toHaveLength(2);
  });
});
