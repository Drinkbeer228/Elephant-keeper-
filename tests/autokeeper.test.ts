import { describe, expect, it } from 'vitest';
import { createState, step, wellbeing } from '../src/sim';
import { AutoKeeper } from '../src/dev/autokeeper';
import { areaAt } from '../src/data/facility';
import { connectedAreas } from '../src/sim/behavior/perceive';

describe('сквозная смена: бот-кипер играет командами', () => {
  for (const seed of [1, 2]) {
    it(`seed ${seed}: двое суток полного контакта без поломок — кипер работает среди слонов, слоны в порядке`, () => {
      const s = createState({ seed, herdSize: 3 });
      const bot = new AutoKeeper();
      let removed = 0;
      let lastDung = s.world.dung.length;
      let amongMinutes = 0;
      let shoves = 0;
      let kicks = 0;
      let tank = 0;
      const trust0 = s.elephants.reduce((a, e) => a + e.learned.trust, 0) / s.elephants.length;
      const porridge: number[] = [];
      const veg: number[] = [];
      while (s.t < 480 + 1440 * 2) {
        const before = s.dayStart;
        const fed = s.elephants.map((e) => s.world.checks.porridge[e.id]?.length ?? 0);
        const kg = s.elephants.map((e) => s.world.checks.vegTub[e.id] ?? 0);
        const day = s.elephants.map((e) => ({ shoves: e.day.shoves, kicks: e.day.kicks, tank: e.day.urineTank }));
        step(s, bot.decide(s));
        if (s.dayStart !== before) {
          porridge.push(...fed);
          veg.push(...kg);
          for (const d of day) {
            shoves += d.shoves;
            kicks += d.kicks;
            tank += d.tank;
          }
        }
        if (s.world.dung.length < lastDung) removed += lastDung - s.world.dung.length;
        lastDung = s.world.dung.length;
        // Кипер среди слонов: он в отсеке, где есть слоны (или в соединённом с ним воротами)
        const here = areaAt(s.keeper.x, s.keeper.y);
        if (here) {
          const linked = connectedAreas(s, here);
          if (s.elephants.some((e) => linked.includes(areaAt(e.x, e.y) ?? 'paddock'))) amongMinutes += 1 / 30;
        }
        if (s.pendingReport !== null) s.pendingReport = null;
      }
      for (const e of s.elephants) {
        shoves += e.day.shoves;
        kicks += e.day.kicks;
        tank += e.day.urineTank;
      }
      const avg = s.elephants.reduce((a, e) => a + wellbeing(e), 0) / s.elephants.length;
      const trust1 = s.elephants.reduce((a, e) => a + e.learned.trust, 0) / s.elephants.length;
      const fails = Object.values(bot.stats.failed).reduce((a, b) => a + b, 0);
      const jobs = Object.values(bot.stats.jobs).reduce((a, b) => a + b, 0);
      console.log(
        `seed ${seed}: баллы ${s.reports.map((x) => x.score).join('/')} самочувствие ${Math.round(avg)} доверие ${trust0.toFixed(2)}→${trust1.toFixed(2)} среди слонов ${Math.round(amongMinutes)} мин толчков ${shoves} ударов ${kicks} в бак ${tank} убрано куч ${removed} каша ${porridge.join(',')} овощи ${veg.map(Math.round).join(',')} голос ${JSON.stringify(bot.stats.voice)} сбои ${JSON.stringify(bot.stats.failed)}`,
      );
      expect(amongMinutes).toBeGreaterThan(120);
      expect(kicks).toBe(0);
      expect(shoves).toBeLessThanOrEqual(3);
      expect(trust1).toBeGreaterThan(trust0 - 0.02);
      expect(tank).toBeGreaterThanOrEqual(1);
      expect(s.reports).toHaveLength(2);
      for (const r of s.reports) expect(r.score).toBeGreaterThan(60);
      expect(avg).toBeGreaterThan(60);
      expect(removed).toBeGreaterThan(3);
      expect(fails / jobs).toBeLessThan(0.05);
      // Каша и овощи доходят до слонов
      expect(porridge.filter((n) => n >= 1).length).toBeGreaterThanOrEqual(porridge.length - 1);
      expect(veg.filter((x) => x > 0).length).toBeGreaterThanOrEqual(veg.length - 2);
    });
  }
});
