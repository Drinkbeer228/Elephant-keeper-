import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { Bot } from '../src/dev/bot';
import { advance, tick } from '../src/sim';
import { STOCK_LABELS } from '../src/sim/stock';
import { cleanShift, hold } from './helpers';

describe('полный цикл поставки ботом', () => {
  it.each([1, 4, 6, 21])('сначала освобождает грузовик в буфер, затем распределяет груз (seed %i)', (seed) => {
    const s = cleanShift(seed);
    s.elephants.forEach((elephant) => hold(elephant, 6, 3));
    advance(s, BALANCE.supply.arriveAt + 0.5);
    s.elephants.forEach((elephant) => {
      hold(elephant, 6, 3);
      elephant.bladder = 0;
      elephant.signalStarted = undefined;
    });
    const bot = new Bot(s);
    let palletsAtRelease = 0;

    for (let frame = 0; frame < 30 * 60 * 20; frame++) {
      tick(s, 1 / 30, bot.frame());
      if (s.supply.left && palletsAtRelease === 0) palletsAtRelease = s.supply.ground.length;
      if (s.supply.left && !s.supply.bays.length && !s.supply.ground.length && !s.jack.cargo) break;
      s.t = BALANCE.supply.arriveAt + 0.5;
      s.partner.timer = 1e9;
      s.elephants.forEach((elephant) => {
        elephant.bladder = 0;
        elephant.bowel = 0;
        elephant.signalStarted = undefined;
        elephant.timer = 1e9;
      });
    }

    expect(s.supply.left).toBe(true);
    expect(s.supply.missed, JSON.stringify({
      t: s.t,
      bays: s.supply.bays.length,
      ground: s.supply.ground.length,
      jack: s.jack,
      player: s.player,
      bot: bot.stats,
      recent: s.log.slice(-12).map((event) => event.text),
    })).toBe(false);
    expect(palletsAtRelease).toBe(4);
    expect(s.supply.bays).toHaveLength(0);
    expect(s.supply.ground, JSON.stringify({
      t: s.t,
      ground: s.supply.ground,
      jack: s.jack,
      player: s.player,
      bot: bot.stats,
      recent: s.log.slice(-12).map((event) => event.text),
    })).toHaveLength(0);
    expect(s.jack.cargo).toBeNull();
    expect(bot.stats.jobs.supply).toBeGreaterThan(0);

    for (const kind of Object.keys(BALANCE.stockStart) as (keyof typeof BALANCE.stockStart)[]) {
      const expected = BALANCE.supplyPallets.flat().filter((unit) => unit.kind === kind).length;
      const deliveries = s.log.filter((event) =>
        event.text?.startsWith(`Груз на складе: ${STOCK_LABELS[kind].toLowerCase()}`),
      );
      expect(deliveries).toHaveLength(expected);
    }
  }, 15000);
});
