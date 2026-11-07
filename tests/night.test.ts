import { describe, expect, it } from 'vitest';
import { createState, minuteOfDay, step, type State } from '../src/sim';
import { boutMinutes, drowsyMinutes, wakeBladder } from '../src/sim/behavior/night';

// Ночь без кипера: он в дежурке. Вода и сено есть всегда, днём ворота на выгул открыты
function keepUp(s: State): void {
  for (const id of ['barnRackW', 'barnRackE', 'paddockFeeder'] as const) s.world.feeders[id].hay = Math.max(s.world.feeders[id].hay, 50);
  for (const id of ['barnWaterW', 'barnWaterE', 'paddockWater'] as const) s.world.troughs[id].level = 90;
  const m = minuteOfDay(s.t);
  const day = m >= 8.5 * 60 && m < 19 * 60;
  const inGate = s.elephants.some((e) => Math.abs(e.x - 15.5) < 3.2 && Math.abs(e.y - 20) < 2.2);
  if (day !== s.world.gates.outer && !inGate) s.world.gates.outer = day;
}

interface Wake {
  slept: number;
  plan: string;
  first: string;
  peed: boolean;
}

// Все пробуждения за две ночи: сколько спала, что выбрала, что сделала первым, сходила ли в туалет за 45 минут
function nights(seed: number): { wakes: Wake[]; drowsy: number; otherWakes: number } {
  const s = createState({ seed, herdSize: 3 });
  const open: (Wake & { t: number })[] = [];
  const wakes: Wake[] = [];
  let drowsy = 0;
  let otherWakes = 0;
  while (s.t < 480 + 1440 * 2) {
    keepUp(s);
    const before = s.elephants.map((e) => e.act.kind);
    const lying = s.elephants.map((e) => e.lying);
    step(s);
    s.pendingReport = null;
    s.elephants.forEach((e, i) => {
      const k = e.act.kind;
      // Проснулась — значит, лежала и спала (а не передумала по дороге к подстилке)
      if (before[i] === 'sleep' && lying[i] && k !== 'sleep') {
        if (k === 'drowsy') {
          drowsy++;
          open[i] = { t: s.t, slept: e.mem.woke.slept, plan: e.mem.woke.plan, first: '', peed: false };
        } else otherWakes++;
      }
      const w = open[i];
      if (!w) return;
      // Первое настоящее занятие после сонливости (короткое «подумать» не в счёт)
      if (!w.first && k !== 'drowsy' && k !== 'idle') w.first = k;
      if (k === 'urinate' && before[i] !== 'urinate') w.peed = true;
      if (s.t - w.t >= 45) {
        wakes.push(w);
        delete open[i];
      }
    });
  }
  return { wakes, drowsy, otherWakes };
}

describe('ночь', () => {
  it('у каждой свой ритм: сколько спит за раз, при каком пузыре просыпается, сколько стоит сонная', () => {
    const s = createState({ seed: 5, herdSize: 4 });
    const bouts = s.elephants.map(boutMinutes);
    const wakeAt = s.elephants.map(wakeBladder);
    const groggy = s.elephants.map(drowsyMinutes);
    for (const b of bouts) expect(b).toBeGreaterThan(80), expect(b).toBeLessThan(175);
    for (const w of wakeAt) expect(w).toBeGreaterThan(65), expect(w).toBeLessThan(100);
    for (const g of groggy) expect(g).toBeGreaterThan(0.8), expect(g).toBeLessThan(11);
    // Не одна схема на всех: у разных слоних — разные числа
    expect(new Set(bouts).size).toBeGreaterThan(2);
    expect(Math.max(...groggy) - Math.min(...groggy)).toBeGreaterThan(0.3);
    // Постоянно: та же слониха — тот же ритм
    expect(boutMinutes(s.elephants[0])).toBe(bouts[0]);
  });

  it('проснувшись, стоит сонная; дальше — по-разному, но после двух часов сна чаще всего идёт в туалет', () => {
    const all: Wake[] = [];
    let drowsy = 0;
    let other = 0;
    for (const seed of [1, 2, 3, 4]) {
      const r = nights(seed);
      all.push(...r.wakes);
      drowsy += r.drowsy;
      other += r.otherWakes;
    }
    // Просыпается не рывком: сначала стоит, уставившись в одну точку
    expect(drowsy / (drowsy + other)).toBeGreaterThan(0.9);
    // Что потом — не сценарий: разные планы и разные первые занятия
    expect(new Set(all.map((w) => w.plan)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(all.map((w) => w.first).filter(Boolean)).size).toBeGreaterThanOrEqual(3);
    // После долгого сна (полтора-два часа и больше) — почти всегда скоро туалет
    const long = all.filter((w) => w.slept >= 90);
    expect(long.length).toBeGreaterThanOrEqual(8);
    expect(long.filter((w) => w.peed).length / long.length).toBeGreaterThan(0.6);
  }, 120000);
});
