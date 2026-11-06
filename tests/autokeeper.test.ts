import { describe, expect, it } from 'vitest';
import { createState, step, wellbeing } from '../src/sim';
import { AutoKeeper } from '../src/dev/autokeeper';

describe('сквозная смена: бот-кипер играет командами', () => {
  for (const seed of [1, 2]) {
    it(`seed ${seed}: двое суток без поломок, слоны в порядке`, () => {
      const s = createState({ seed, herdSize: 3 });
      const bot = new AutoKeeper();
      let removed = 0;
      let lastDung = s.world.dung.length;
      while (s.t < 480 + 1440 * 2) {
        step(s, bot.decide(s));
        if (s.world.dung.length < lastDung) removed += lastDung - s.world.dung.length;
        lastDung = s.world.dung.length;
        if (s.pendingReport !== null) s.pendingReport = null;
      }
      const r = s.reports[1];
      const avg = s.elephants.reduce((a, e) => a + wellbeing(e), 0) / s.elephants.length;
      console.log(`seed ${seed}: баллы ${s.reports.map((x) => x.score).join('/')} самочувствие ${Math.round(avg)} убрано куч ${removed} задачи ${JSON.stringify(bot.stats.jobs)} сбои ${JSON.stringify(bot.stats.failed)}`);
      expect(s.reports).toHaveLength(2);
      expect(r.score).toBeGreaterThan(55);
      expect(avg).toBeGreaterThan(50);
      expect(removed).toBeGreaterThan(3);
      const fails = Object.values(bot.stats.failed).reduce((a, b) => a + b, 0);
      const jobs = Object.values(bot.stats.jobs).reduce((a, b) => a + b, 0);
      expect(fails / jobs).toBeLessThan(0.25);
    });
  }
});
