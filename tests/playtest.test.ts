import { describe, expect, it } from 'vitest';
import { createShift } from '../src/sim';
import { playShift } from './bot';

// Опытный кипер (бот) проходит смену. Если он не справляется — смена слишком тяжёлая,
// если скучает больше половины времени — слишком лёгкая.
describe('плейтест ботом', () => {
  const seeds = [1, 2, 3, 4, 5, 6];
  const results = seeds.map((seed) => {
    const s = createShift(seed);
    const bot = playShift(s);
    return { seed, s, bot, r: s.report! };
  });

  it('печатает итоги', () => {
    for (const { seed, r, bot, s } of results) {
      const pees = r.pees.map((p) => `${p.name} ${p.inBucket}/${p.inBucket + p.missed}`).join(', ');
      const meals = r.meals.map((m) => m.statuses.map((x) => x.status[0]).join('')).join(' ');
      console.log(
        `seed ${seed}: ★${r.stars} ${r.score} | бак ${pees} | пол ${Math.round(r.dryAvg * 100)}% | еда ${meals} | ноги ${r.footDebt.map((f) => f.debt).join('/')} | потери ${r.losses.join(',') || '—'} | замечания ${r.remarks.join('; ') || '—'} | занят ${Math.round((bot.stats.busyTicks / bot.stats.ticks) * 100)}% | ${Math.round(bot.stats.ticks / 30 / 60)} мин`,
      );
      const share = Object.entries(bot.stats.jobTicks).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / bot.stats.ticks) * 100)}%`).join(', ');
      console.log('   время:', share);
      console.log('   дела', JSON.stringify(bot.stats.jobs), 'сорвано', JSON.stringify(bot.stats.aborted), 'лог-бед', s.log.filter((l) => l.kind === 'bad').length);
    }
    expect(results.every((x) => x.s.phase === 'report')).toBe(true);
    // Страховка баланса: опытный кипер в среднем справляется
    const avg = results.reduce((a, x) => a + x.r.score, 0) / results.length;
    console.log('средний балл', Math.round(avg));
    expect(avg).toBeGreaterThanOrEqual(45);
  });
});
