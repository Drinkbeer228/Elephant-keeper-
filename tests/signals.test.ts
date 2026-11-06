import { describe, expect, it } from 'vitest';
import { availableActions, runMinutes, step, NO_INPUT } from '../src/sim';
import { STATIONS, TANK_HOME, TOILET_STANCE, hardFloor } from '../src/data/facility';
import { rearPos } from '../src/sim/behavior/perceive';
import { act, at, atStation, game } from './helpers';
import type { Elephant, State } from '../src/sim';

// Дойти до точки шагом (как игрок с клавиатуры)
function goTo(s: State, x: number, y: number, maxSec = 30): void {
  for (let i = 0; i < maxSec * 30; i++) {
    const dx = x - s.keeper.x;
    const dy = y - s.keeper.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.25) return;
    step(s, { ...NO_INPUT, move: { x: dx / d, y: dy / d } });
  }
}

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

function actionsFor(s: State, id: string) {
  return availableActions(s).find((a) => a.id === id);
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

  it('туалет с баком: подойти, заговорить, «пошли» — на бетон рядом с кипером, «стоять», бак под неё, «давай» — моча в баке, награда учит', () => {
    const s = toiletScene(8, 0.9, 0.7);
    const e = s.elephants[0];
    e.learned.cooperation = 0.8;
    e.learned.trust = 0.75;
    for (const c of ['follow', 'stay'] as const) e.learned.cues[c] = 0.9;
    expect(runUntil(s, 40, () => e.signal?.kind === 'toilet')).toBe(true);
    // Бак — в инвентарной у двери в зал
    at(s, TANK_HOME.x, TANK_HOME.y);
    expect(act(s, 'pickUp:')).toBe(true);
    expect(s.keeper.held?.kind).toBe('tank');
    // Подойти так, чтобы видела, окликнуть и заговорить — тогда подпустит
    faceHer(s, e, 3.2);
    act(s, `voice:${e.id}:name`); // окликнуть, если ещё не смотрит на тебя
    expect(act(s, `voice:${e.id}:talk`)).toBe(true);
    for (let i = 0; i < 4 && kindOf(e) !== 'walkWith'; i++) {
      act(s, `voice:${e.id}:follow`);
      if (kindOf(e) !== 'walkWith') runMinutes(s, 1.7);
    }
    expect(e.act.kind).toBe('walkWith');
    // Довести рядом с собой до бетона у южной стены
    goTo(s, 15.6, 31.6);
    runMinutes(s, 1);
    expect(hardFloor(rearPos(e).x, rearPos(e).y)).toBe(true);
    expect(act(s, `voice:${e.id}:stay`)).toBe(true);
    expect(e.act.kind).toBe('stay');
    // К её боку, ближе к задним ногам
    const c = Math.cos(e.heading);
    const sn = Math.sin(e.heading);
    const g = 0.95 * e.profile.look.size * e.profile.look.girth + 0.5;
    at(s, e.x - c * 0.4 - sn * g, e.y - sn * 0.4 + c * g);
    expect(act(s, `tankPlace:${e.id}`)).toBe(true);
    expect(act(s, `voice:${e.id}:toilet`)).toBe(true);
    expect(runUntil(s, 10, () => e.day.urineTank > 0)).toBe(true);
    expect(e.day.urineBedding).toBe(0);
    const tank = s.world.items.find((it) => it.kind === 'tank')!;
    expect(tank.load).toBeGreaterThan(0);
    const learned = e.learned.toilet;
    expect(act(s, `treat:${e.id}`)).toBe(true);
    expect(e.learned.toilet).toBeGreaterThan(learned);
    // Забрать бак, вылить в слив и помыть, поставить на место
    runMinutes(s, 3);
    at(s, tank.x + 0.8, tank.y);
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

  it('на соломе бак не подставить — сначала отвести на бетон', () => {
    const s = toiletScene(12, 0.9, 0.7);
    const e = s.elephants[0];
    e.x = 15;
    e.y = 23.5;
    e.heading = 0;
    e.act = { ...e.act, kind: 'idle', phase: 'do', dur: 1e6, doStart: s.t, forced: true, target: null, key: 'idle' };
    s.keeper.held = { kind: 'tank', load: 0, aux: 0, owner: null };
    at(s, 15, 23.5 + 0.95 * e.profile.look.size * e.profile.look.girth + 0.5);
    act(s, `voice:${e.id}:name`);
    const o = actionsFor(s, `tankPlace:${e.id}`);
    expect(o?.enabled).toBe(false);
    expect(o?.reason).toMatch(/соломе/);
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
