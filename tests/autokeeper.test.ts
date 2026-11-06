import { describe, expect, it } from 'vitest';
import { createState, step, wellbeing } from '../src/sim';
import { AutoKeeper } from '../src/dev/autokeeper';
import { areaAt } from '../src/data/facility';
import { connectedAreas } from '../src/sim/behavior/perceive';

describe('сквозная смена: бот-кипер играет командами', () => {
  for (const seed of [1, 2]) {
    it(`seed ${seed}: двое суток без поломок, защищённый контакт не нарушен, слоны в порядке`, () => {
      const s = createState({ seed, herdSize: 3 });
      const bot = new AutoKeeper();
      let removed = 0;
      let lastDung = s.world.dung.length;
      let unsafe = 0;
      let insideMinutes = 0;
      const porridge: number[] = [];
      const veg: number[] = [];
      while (s.t < 480 + 1440 * 2) {
        const before = s.dayStart;
        const fed = s.elephants.map((e) => s.world.checks.porridge[e.id]?.length ?? 0);
        const kg = s.elephants.map((e) => s.world.checks.vegTub[e.id] ?? 0);
        step(s, bot.decide(s));
        if (s.dayStart !== before) {
          porridge.push(...fed);
          veg.push(...kg);
        }
        if (s.world.dung.length < lastDung) removed += lastDung - s.world.dung.length;
        lastDung = s.world.dung.length;
        // Кипер внутри отсека — ни одного слона в этом отсеке и во всём, что с ним соединено воротами
        const here = areaAt(s.keeper.x, s.keeper.y);
        if (here) {
          insideMinutes += 1 / 30;
          const linked = connectedAreas(s, here);
          if (s.elephants.some((e) => linked.includes(areaAt(e.x, e.y) ?? 'paddock'))) unsafe++;
        }
        if (s.pendingReport !== null) s.pendingReport = null;
      }
      const avg = s.elephants.reduce((a, e) => a + wellbeing(e), 0) / s.elephants.length;
      const fails = Object.values(bot.stats.failed).reduce((a, b) => a + b, 0);
      const jobs = Object.values(bot.stats.jobs).reduce((a, b) => a + b, 0);
      console.log(
        `seed ${seed}: баллы ${s.reports.map((x) => x.score).join('/')} самочувствие ${Math.round(avg)} убрано куч ${removed} в отсеках ${Math.round(insideMinutes)} мин каша ${porridge.join(',')} овощи ${veg.map(Math.round).join(',')} сбои ${JSON.stringify(bot.stats.failed)}`,
      );
      expect(unsafe).toBe(0);
      expect(insideMinutes).toBeGreaterThan(20);
      expect(s.reports).toHaveLength(2);
      for (const r of s.reports) expect(r.score).toBeGreaterThan(60);
      expect(avg).toBeGreaterThan(60);
      expect(removed).toBeGreaterThan(3);
      expect(fails / jobs).toBeLessThan(0.05);
      // Каша и овощи доходят до слонов
      expect(porridge.filter((n) => n >= 1).length).toBeGreaterThanOrEqual(porridge.length - 1);
      expect(veg.filter((kg) => kg > 0).length).toBeGreaterThanOrEqual(veg.length - 2);
    });
  }
});
