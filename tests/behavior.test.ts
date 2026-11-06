import { describe, expect, it } from 'vitest';
import { minuteOfDay, runMinutes, step, type State, type Traits } from '../src/sim';
import { game } from './helpers';

// Хороший уход без кипера-человека: корм и вода есть всегда, днём ворота открыты
function cared(s: State, minutes: number, onStep?: () => void): void {
  const end = s.t + minutes;
  while (s.t < end) {
    const m = minuteOfDay(s.t);
    s.world.hay.barnRack = Math.max(s.world.hay.barnRack, 50);
    s.world.hay.paddockFeeder = Math.max(s.world.hay.paddockFeeder, 50);
    s.world.water.barnWater.level = 90;
    s.world.water.paddockWater.level = 90;
    const day = m >= 8.5 * 60 && m < 19 * 60;
    if (day !== s.world.gateOpen && !s.elephants.some((e) => Math.abs(e.x - 20) < 3 && Math.abs(e.y - 20) < 2)) s.world.gateOpen = day;
    step(s);
    onStep?.();
  }
}

function pair(seed: number, a: Partial<Traits>, b: Partial<Traits>): State {
  return game(seed, 2, [a, b], false);
}

describe('поведение и характер', () => {
  it('энергичная ходит больше неторопливой', () => {
    let hi = 0;
    let lo = 0;
    for (const seed of [1, 2, 3]) {
      const s = pair(seed, { activity: 0.92 }, { activity: 0.08 });
      cared(s, 720);
      hi += s.elephants[0].day.distance;
      lo += s.elephants[1].day.distance;
    }
    expect(hi).toBeGreaterThan(lo * 1.15);
  });

  it('игривая играет больше серьёзной', () => {
    let hi = 0;
    let lo = 0;
    for (const seed of [4, 5, 6]) {
      const s = pair(seed, { playfulness: 0.95, activity: 0.6 }, { playfulness: 0.05, activity: 0.6 });
      cared(s, 900);
      hi += s.elephants[0].day.minutes.play ?? 0;
      lo += s.elephants[1].day.minutes.play ?? 0;
    }
    expect(hi).toBeGreaterThan(lo + 15);
  });

  it('общительная держится ближе к другим, чем самостоятельная', () => {
    const near = [0, 0];
    for (const seed of [7, 8]) {
      const s = game(seed, 3, [{ sociability: 0.95 }, { sociability: 0.05 }, { sociability: 0.6 }]);
      cared(s, 720, () => {
        for (const i of [0, 1]) {
          const e = s.elephants[i];
          const d = Math.min(...s.elephants.filter((o) => o !== e).map((o) => Math.hypot(o.x - e.x, o.y - e.y)));
          if (d < 6) near[i]++;
        }
      });
    }
    expect(near[0]).toBeGreaterThan(near[1]);
  });

  it('любопытная исследует больше равнодушной', () => {
    let hi = 0;
    let lo = 0;
    for (const seed of [9, 10, 11]) {
      const s = pair(seed, { curiosity: 0.95 }, { curiosity: 0.05 });
      cared(s, 900);
      hi += s.elephants[0].day.minutes.explore ?? 0;
      lo += s.elephants[1].day.minutes.explore ?? 0;
    }
    expect(hi).toBeGreaterThan(lo);
  });

  it('ночью на сухой подстилке слоны ложатся спать', () => {
    const s = game(12, 3);
    s.t = 20 * 60;
    s.dayStart = 8 * 60;
    s.elephants.forEach((e) => (e.needs.fatigue = 60));
    cared(s, 9 * 60);
    for (const e of s.elephants) expect(e.day.lyingMinutes).toBeGreaterThan(45);
  });

  it('чувствительная не ляжет в мокрое, неприхотливая — ляжет', () => {
    const s = game(13, 2, [{ sensitivity: 0.95 }, { sensitivity: 0.05 }]);
    s.t = 22 * 60;
    s.dayStart = 8 * 60;
    s.world.cells.wet = s.world.cells.wet.map(() => 0.9);
    s.elephants.forEach((e) => (e.needs.fatigue = 70));
    cared(s, 6 * 60);
    expect(s.elephants[1].day.lyingMinutes).toBeGreaterThan(s.elephants[0].day.lyingMinutes);
  });

  it('уверенная оттесняет робкую от единственной кормушки', () => {
    let conflicts = 0;
    for (const seed of [14, 15, 16]) {
      const s = pair(seed, { confidence: 0.95, foodDrive: 0.9, nervousness: 0.1 }, { confidence: 0.05, nervousness: 0.8, foodDrive: 0.9, persistence: 0.1 });
      const [boss, shy] = s.elephants;
      s.world.trough.portions = 6;
      s.world.trough.since = s.t;
      s.world.hay.barnRack = 0;
      // Робкая уже ест овощи у решётки, властная голодна и стоит поодаль
      const slot = { x: 19.5, y: 27.35 };
      shy.x = slot.x;
      shy.y = slot.y;
      shy.heading = Math.PI / 2;
      shy.act = { kind: 'eat', target: { t: 'slot', station: 'barnTrough', slot: 0 }, phase: 'do', start: s.t, doStart: s.t, dur: 60, score: 0.8, forced: false, signal: null, note: 'ест овощи', key: 'eat:barnTrough', aux: null, flag: 1 };
      shy.needs.hunger = 70;
      boss.x = 22;
      boss.y = 23;
      boss.needs.hunger = 90;
      boss.mem.nextThink = s.t;
      runMinutes(s, 40);
      conflicts += boss.day.conflicts;
    }
    expect(conflicts).toBeGreaterThan(0);
  });

  it('скука ведёт к игре и исследованию, если есть чем заняться', () => {
    const s = game(17, 1, [{ playfulness: 0.9, curiosity: 0.9 }]);
    const e = s.elephants[0];
    e.needs.boredom = 85;
    e.needs.hunger = 5;
    e.needs.thirst = 5;
    s.world.gateOpen = true;
    runMinutes(s, 180);
    const engaged = (e.day.minutes.play ?? 0) + (e.day.minutes.explore ?? 0) + (e.day.minutes.bathe ?? 0) + (e.day.minutes.dust ?? 0);
    expect(engaged).toBeGreaterThan(15);
    expect(e.needs.boredom).toBeLessThan(85);
  });

  it('слоны не мечутся: смена занятий в разумных пределах', () => {
    const s = game(18, 3);
    const starts = s.elephants.map(() => 0);
    const last = s.elephants.map((e) => e.act.start);
    cared(s, 600, () => {
      s.elephants.forEach((e, i) => {
        if (e.act.start !== last[i] && e.act.kind !== 'idle') {
          starts[i]++;
          last[i] = e.act.start;
        }
      });
    });
    for (const n of starts) expect(n / 10).toBeLessThan(14);
  });

  it('подруги приветствуют друг друга при встрече', () => {
    const s = game(19, 2, [{ sociability: 0.95 }, { sociability: 0.95 }]);
    s.bonds['e1|e2'] = 0.8;
    cared(s, 600);
    expect(s.journal.some((j) => j.text.includes('поприветствовали'))).toBe(true);
  });
});
