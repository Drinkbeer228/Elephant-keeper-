import { describe, expect, it } from 'vitest';
import { runMinutes, step } from '../src/sim';
import { STATIONS, TANK_HOME } from '../src/data/facility';
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
    atStation(s, 'gatePanel');
    expect(act(s, 'gate:outer')).toBe(true);
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
    s.world.feeders.barnRackW.hay = 100;
    s.world.troughs.barnWaterW.level = 100;
    runMinutes(s, 720);
    const first = e.day.signals;
    const exp1 = e.learned.expectation;
    e.day.signals = 0;
    runMinutes(s, 720);
    expect(e.learned.expectation).toBeLessThan(exp1);
    expect(e.day.signals).toBeLessThanOrEqual(first);
  });

  it('туалет по зову: к стенке боком, бак под неё, «Давай гуляй» — моча в баке, награда учит', () => {
    const s = toiletScene(8, 0.9, 0.7);
    const e = s.elephants[0];
    e.learned.cooperation = 0.8;
    expect(runUntil(s, 40, () => e.signal?.kind === 'toilet')).toBe(true);
    // Бак стоит в проходе у стенки — взять
    at(s, TANK_HOME.x, TANK_HOME.y);
    expect(act(s, 'pickUp:')).toBe(true);
    expect(s.keeper.held?.kind).toBe('tank');
    atStation(s, 'trainingWall');
    expect(act(s, `call:${e.id}:toilet`)).toBe(true);
    expect(e.act.kind).toBe('follow');
    expect(runUntil(s, 20, () => (e.mem.call?.arrivedAt ?? -1) >= 0)).toBe(true);
    const stance = STATIONS.trainingWall.slots![1];
    expect(Math.hypot(e.x - stance.x, e.y - stance.y)).toBeLessThan(1.1);
    // Без команды она ждёт — сама не идёт, пока терпимо
    expect(e.day.urineBedding + e.day.urineDrain).toBe(0);
    expect(act(s, `tankPlace:${e.id}`)).toBe(true);
    expect(act(s, `toiletCmd:${e.id}`)).toBe(true);
    expect(runUntil(s, 10, () => e.day.urineTank > 0)).toBe(true);
    const tank = s.world.items.find((it) => it.kind === 'tank')!;
    expect(tank.load).toBeGreaterThan(0);
    const learned = e.learned.toilet;
    expect(act(s, `treat:${e.id}`)).toBe(true);
    expect(e.learned.toilet).toBeGreaterThan(learned);
    // Забрать бак, вылить в слив и помыть, поставить на место
    runMinutes(s, 3);
    expect(act(s, 'tankTake:')).toBe(true);
    expect(s.keeper.held?.kind).toBe('tank');
    atStation(s, 'washSink');
    expect(act(s, 'wash:emptyTank')).toBe(true);
    expect(s.keeper.held?.load).toBe(0);
    expect(act(s, 'wash:tank')).toBe(true);
    at(s, TANK_HOME.x, TANK_HOME.y + 0.6);
    expect(act(s, 'putBack:tank')).toBe(true);
    expect(s.keeper.held).toBeNull();
  });

  it('у стока при полном пузыре — сама, моча уходит в сток, а не на подстилку', () => {
    const s = toiletScene(11, 0.9, 0.7);
    const e = s.elephants[0];
    e.learned.cooperation = 0.8;
    atStation(s, 'trainingWall');
    for (let i = 0; i < 6 && e.act.kind !== 'follow'; i++) act(s, `call:${e.id}:toilet`);
    expect(e.act.kind).toBe('follow');
    // Терпит, пока идёт; у стенки, когда совсем приспичит, — сама, над стоком
    e.needs.bladder = 89;
    expect(runUntil(s, 30, () => e.day.urineDrain > 0)).toBe(true);
    expect(e.day.urineBedding).toBe(0);
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
    s.world.troughs.barnWaterW.level = 0;
    s.world.troughs.barnWaterE.level = 0;
    expect(runUntil(s, 60, () => e.signal?.kind === 'water')).toBe(true);
    s.world.troughs.barnWaterW.level = 60;
    s.world.troughs.barnWaterE.level = 60;
    step(s);
    expect(e.signal).toBeNull();
    expect(e.day.answered).toBe(1);
    expect(STATIONS.barnWaterW.slots).toHaveLength(2);
  });

  it('манера звать — своя: топает именно своей ногой, урчит или выпрашивает', () => {
    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 2; seed++) {
      const s = toiletScene(seed, 0.95, 0.85);
      const e = s.elephants[0];
      if (e.profile.habits.signal !== 'stomp') continue;
      checked++;
      const kinds: string[] = [];
      const end = s.t + 60;
      while (s.t < end && kinds.length < 3) for (const ev of step(s)) if (ev.elephantId === e.id && ev.kind.startsWith('stomp:')) kinds.push(ev.kind);
      expect(kinds.length).toBeGreaterThan(0);
      for (const k of kinds) expect(k).toBe(`stomp:${e.profile.habits.foot}`);
    }
    expect(checked).toBeGreaterThan(0);
  });
});
