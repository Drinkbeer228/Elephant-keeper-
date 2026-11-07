import { describe, expect, it } from 'vitest';
import { minuteOfDay, runMinutes, step, type State, type Traits } from '../src/sim';
import { game } from './helpers';

// Хороший уход без кипера-человека: корм и вода есть всегда, днём ворота открыты
function cared(s: State, minutes: number, onStep?: () => void): void {
  const end = s.t + minutes;
  while (s.t < end) {
    const m = minuteOfDay(s.t);
    for (const id of ['barnRackW', 'barnRackE', 'paddockFeeder'] as const) s.world.feeders[id].hay = Math.max(s.world.feeders[id].hay, 50);
    for (const id of ['barnWaterW', 'barnWaterE', 'paddockWater'] as const) s.world.troughs[id].level = 90;
    const day = m >= 8.5 * 60 && m < 19 * 60;
    if (day !== s.world.gates.outer && !s.elephants.some((e) => Math.abs(e.x - 15.5) < 3.2 && Math.abs(e.y - 20) < 2.2)) s.world.gates.outer = day;
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

  it('общительная ищет общества: больше здоровается и стоит рядом с подругами, чем самостоятельная', () => {
    const social = [0, 0];
    for (const seed of [7, 8]) {
      const s = game(seed, 3, [{ sociability: 0.95 }, { sociability: 0.05 }, { sociability: 0.6 }]);
      cared(s, 720);
      for (const i of [0, 1]) social[i] += s.elephants[i].day.minutes.socialize ?? 0;
    }
    expect(social[0]).toBeGreaterThan(social[1] * 2);
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

  it('уверенная отнимает таз у робкой: хозяйке достаётся меньше', () => {
    let taken = 0;
    for (const seed of [14, 15, 16]) {
      const s = pair(seed, { confidence: 0.95, foodDrive: 0.9, nervousness: 0.1 }, { confidence: 0.05, nervousness: 0.8, foodDrive: 0.9, persistence: 0.1 });
      const [boss, shy] = s.elephants;
      for (const id of ['barnRackW', 'barnRackE', 'paddockFeeder'] as const) s.world.feeders[id].hay = 0;
      for (const t of s.world.tubs) t.where = 'rack';
      const tub = s.world.tubs.find((t) => t.owner === shy.id)!;
      tub.where = 'floor';
      tub.x = 15;
      tub.y = 26.2;
      tub.veg.carrot = 30;
      shy.x = 15;
      shy.y = 24.4;
      shy.heading = Math.PI / 2;
      shy.needs.hunger = 70;
      shy.mem.nextThink = s.t;
      boss.x = 22;
      boss.y = 23;
      boss.needs.hunger = 90;
      boss.mem.nextThink = s.t;
      runMinutes(s, 45);
      taken += boss.day.stolen + shy.day.robbed + boss.day.conflicts;
    }
    expect(taken).toBeGreaterThan(0);
  });

  it('скука ведёт к игре и исследованию, если есть чем заняться', () => {
    const s = game(17, 1, [{ playfulness: 0.9, curiosity: 0.9 }]);
    const e = s.elephants[0];
    e.needs.boredom = 85;
    e.needs.hunger = 5;
    e.needs.thirst = 5;
    s.world.gates.outer = true;
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
