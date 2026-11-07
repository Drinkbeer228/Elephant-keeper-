import { describe, expect, it } from 'vitest';
import { runMinutes, step } from '../src/sim';
import { DRAIN, STATIONS, TANK_HOME, TOILET_STANCE } from '../src/data/facility';
import { bucketSpots, keeperCatching } from '../src/sim/behavior/urine';
import { act, at, atStation, game, walk } from './helpers';
import type { Elephant, State } from '../src/sim';

// Встать перед ней на расстоянии (в зале, к югу — к бетону) и повернуться к ней; она смотрит на кипера
function faceHer(s: State, e: Elephant, metres: number): void {
  const ang = Math.PI / 2 - 0.5;
  at(s, e.x + Math.cos(ang) * metres, e.y + Math.sin(ang) * metres);
  e.heading = ang;
  s.keeper.facing = ang + Math.PI;
}

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

// Занятие читаем через функцию: сужение типов TypeScript не знает, что act() его меняет
function kindOf(e: Elephant): string {
  return e.act.kind;
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
    // Ворота открывают руками, стоя у створки
    at(s, 13.2, 20.9);
    expect(act(s, 'gate:outer')).toBe(true);
    step(s);
    expect(e.signal).toBeNull();
    expect(e.learned.expectation).toBeGreaterThan(before);
    expect(e.day.answered).toBe(1);
    runMinutes(s, 40);
    expect(e.day.urineOutside).toBeGreaterThanOrEqual(1);
    expect(e.day.urineBedding).toBe(0);
  });

  it('если на сигнал не ответить — ожидание падает, а моча оказывается где пришлось, не в баке', () => {
    const s = toiletScene(2, 0.9, 0.7);
    const e = s.elephants[0];
    expect(runUntil(s, 40, () => e.signal?.kind === 'toilet')).toBe(true);
    const before = e.learned.expectation;
    runMinutes(s, 90);
    expect(e.day.ignored).toBeGreaterThanOrEqual(1);
    expect(e.learned.expectation).toBeLessThan(before);
    expect(e.day.urineBedding + e.day.urineDrain + e.day.urineOutside).toBeGreaterThanOrEqual(1);
    expect(e.day.urineTank).toBe(0);
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
    // До утренней смены дня: в 8:00 выученное чуть тянется к врождённому — это забывание, не научение
    runMinutes(s, 700);
    expect(e.learned.expectation).toBeLessThan(exp1);
    expect(e.day.signals).toBeLessThanOrEqual(first);
  });

  it('туалет с ведром: подойти, заговорить, ведро — к задним ногам, «давай» — струя в ведро прямо на соломе, время идёт как в жизни; похвалить — учится; вылить в сток', () => {
    const s = toiletScene(8, 0.9, 0.7);
    const e = s.elephants[0];
    e.learned.cooperation = 0.8;
    e.learned.trust = 0.75;
    e.learned.cues.stay = 0.9;
    e.needs.bladder = 82;
    expect(runUntil(s, 40, () => e.signal?.kind === 'toilet')).toBe(true);
    // Ведро — в инвентарной у двери в зал
    at(s, TANK_HOME.x, TANK_HOME.y);
    expect(act(s, 'pickUp:')).toBe(true);
    expect(s.keeper.held?.kind).toBe('tank');
    // Она стоит там, где стоит: никуда вести не надо — подойти, окликнуть, заговорить
    faceHer(s, e, 3.2);
    act(s, `voice:${e.id}:name`);
    expect(act(s, `voice:${e.id}:talk`)).toBe(true);
    act(s, `voice:${e.id}:stay`);
    const p = bucketSpots(e)[0];
    at(s, p.x, p.y);
    step(s);
    expect(keeperCatching(s, e)).toBe(true);
    expect(act(s, `voice:${e.id}:toilet`)).toBe(true);
    expect(e.act.kind).toBe('urinate');
    // Пока она мочится рядом, время идёт как в жизни: секунда — секунда
    const t0 = s.t;
    const sim0 = s.simSec;
    step(s);
    expect((s.t - t0) / (s.simSec - sim0)).toBeCloseTo(1 / 60, 5);
    let guard = 0;
    while (e.act.kind === 'urinate' && guard++ < 200000) step(s);
    expect(e.day.urineTank).toBe(1);
    expect(e.day.urineBedding).toBe(0);
    const caught = s.keeper.held!.load;
    expect(caught).toBeGreaterThan(4);
    expect(e.day.caughtLitres).toBeCloseTo(caught, 1);
    // Полное ведро тяжелее пустого: идёшь медленнее
    const x0 = s.keeper.x;
    walk(s, 1, 0, 0.5);
    const heavyStep = Math.abs(s.keeper.x - x0);
    const learned = e.learned.toilet;
    faceHer(s, e, 2.4);
    expect(act(s, `treat:${e.id}`) || act(s, `voice:${e.id}:praise`)).toBe(true);
    expect(e.learned.toilet).toBeGreaterThan(learned);
    // Вылить в сток посреди зала
    at(s, DRAIN.x + DRAIN.r + 0.5, DRAIN.y);
    expect(act(s, 'pourDrain:drain')).toBe(true);
    expect(s.keeper.held?.load).toBe(0);
    const x1 = s.keeper.x;
    walk(s, -1, 0, 0.5);
    expect(Math.abs(s.keeper.x - x1)).toBeGreaterThan(heavyStep);
    // Помыть ведро в инвентарной и поставить на место
    atStation(s, 'washSink');
    expect(act(s, 'wash:tank')).toBe(true);
    at(s, TANK_HOME.x, TANK_HOME.y + 0.6);
    expect(act(s, 'putBack:tank')).toBe(true);
    expect(s.keeper.held).toBeNull();
  });

  it('похвала сразу после лужи на подстилке учит, что так можно; после ведра — что так надо', () => {
    const pee = (bucket: boolean) => {
      const s = toiletScene(13, 0.5, 0.5);
      const e = s.elephants[0];
      e.learned.trust = 0.8;
      e.learned.toilet = 0.5;
      e.x = 15;
      e.y = 23.5;
      e.heading = 0;
      e.act = { ...e.act, kind: 'idle', phase: 'do', dur: 1e6, doStart: s.t, forced: true, target: null, key: 'idle' };
      faceHer(s, e, 2.6);
      // Окликнуть, прежде чем зайти ей за бок: иначе вздрогнет, а то и лягнёт
      act(s, `voice:${e.id}:name`);
      e.mem.aware = s.t;
      if (bucket) {
        s.keeper.held = { kind: 'tank', load: 0, aux: 0, owner: null };
        const p = bucketSpots(e)[1];
        at(s, p.x, p.y);
      }
      e.needs.bladder = 100;
      let guard = 0;
      do step(s);
      while ((e.act.kind === 'urinate' || e.needs.bladder > 50) && guard++ < 200000);
      faceHer(s, e, 2.6);
      const before = e.learned.toilet;
      act(s, `voice:${e.id}:praise`);
      return e.learned.toilet - before;
    };
    expect(pee(false)).toBeLessThan(0);
    expect(pee(true)).toBeGreaterThan(0);
  });

  it('у стока: «давай» — встаёт над решёткой стока сама, моча уходит в сток, а не на подстилку', () => {
    const s = toiletScene(11, 0.9, 0.7);
    const e = s.elephants[0];
    e.learned.cooperation = 0.8;
    e.learned.trust = 0.75;
    e.learned.toilet = 0.6;
    e.needs.bladder = 85;
    // Стоит на бетоне в паре метров от стока
    e.x = TOILET_STANCE.x + 1.4;
    e.y = TOILET_STANCE.y + 1.2;
    e.heading = Math.PI;
    e.path = [];
    e.pathGoal = null;
    e.act = { ...e.act, kind: 'idle', phase: 'do', dur: 5, doStart: s.t, forced: false, target: null, key: 'idle' };
    faceHer(s, e, 3.0);
    act(s, `voice:${e.id}:name`);
    let ok = false;
    for (let i = 0; i < 5 && !ok; i++) {
      act(s, `voice:${e.id}:toilet`);
      ok = e.act.kind === 'follow' || e.act.kind === 'urinate';
      if (!ok) runMinutes(s, 1.7);
    }
    expect(ok).toBe(true);
    expect(runUntil(s, 20, () => e.day.urineDrain > 0)).toBe(true);
    expect(e.day.urineBedding).toBe(0);
  });

  it('пришла, когда позвали «иди сюда», и получила угощение — покладистость растёт; без похвалы — падает', () => {
    const run = (reward: boolean) => {
      const s = game(9, 1, [{ cooperation: 0.9 }]);
      const e = s.elephants[0];
      e.learned.cooperation = 0.9;
      e.learned.trust = 0.8;
      e.learned.cues.come = 0.9;
      e.needs.hunger = 5;
      e.needs.thirst = 0;
      e.needs.bladder = 0;
      e.act = { ...e.act, kind: 'idle', phase: 'do', dur: 5, doStart: s.t, forced: false, target: null, key: 'idle' };
      faceHer(s, e, 6);
      act(s, `voice:${e.id}:name`);
      for (let i = 0; i < 6 && kindOf(e) !== 'follow'; i++) {
        act(s, `voice:${e.id}:come`);
        if (kindOf(e) !== 'follow') runMinutes(s, 1.7);
      }
      expect(e.act.kind).toBe('follow');
      const c0 = e.learned.cooperation;
      const k0 = e.learned.cues.come;
      runUntil(s, 20, () => e.mem.call !== null && e.mem.call.arrivedAt >= 0);
      if (reward) act(s, `treat:${e.id}`);
      runMinutes(s, 10);
      return { coop: e.learned.cooperation - c0, cue: e.learned.cues.come - k0 };
    };
    const yes = run(true);
    const no = run(false);
    expect(yes.coop).toBeGreaterThan(0);
    expect(yes.cue).toBeGreaterThan(0);
    expect(no.coop).toBeLessThan(0);
    expect(no.cue).toBeLessThan(0);
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
    expect(STATIONS.barnWaterW.slots).toHaveLength(1);
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
