import { describe, expect, it } from 'vitest';
import { advance, availableAction, playerSpeedFactor } from '../src/sim';
import { newItem } from '../src/sim/state';
import { takeStock, takeStockUpTo, giveStock } from '../src/sim/stock';
import { treat } from '../src/sim/elephants';
import { BALANCE } from '../src/data/balance';
import { MAP } from '../src/data/map';
import { act, at, cleanShift, hold, stand } from './helpers';

describe('запасы', () => {
  it('запаривание каши списывает зерно; нехватка — отказ с событием', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    advance(s, 250); // 12:10 — окно первой каши открыто
    stand(s, 'stove');
    expect(act(s)).toBe('Запарить кашу (20 мин)');
    expect(s.stock.grain).toBe(BALANCE.stockStart.grain - BALANCE.consumption.kashaGrain);

    const s2 = cleanShift();
    s2.stock.grain = 1;
    s2.elephants.forEach((e) => hold(e, 6, 3));
    advance(s2, 250);
    stand(s2, 'stove');
    expect(act(s2)).toBe('Зерна не хватает на кашу — прими поставку');
    expect(s2.stock.grain).toBe(1);
    expect(s2.kitchen.kasha.status).toBe('idle');
  });

  it('лакомство тратит фрукт; без фруктов действия «Угостить» нет', () => {
    const s = cleanShift();
    const e = s.elephants[0];
    hold(e, 5, 8);
    at(s, 5, 8.5);

    s.stock.fruit = 0;
    e.praiseUntil = s.t + 10;
    expect(treat(s, e)).toBe(false);
    expect(availableAction(s)).toBeNull();

    s.stock.fruit = 2;
    expect(availableAction(s)?.label).toMatch(/^Угостить /);
    expect(treat(s, e)).toBe(true);
    expect(s.stock.fruit).toBe(1);
    expect(e.praiseUntil).toBe(-1);
  });

  it('овощи для ужина списываются из запаса при наборе; нехватка — отказ', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    s.stock.veg = 2;
    s.player.held = newItem(s, 'basket');
    advance(s, 361); // 14:01
    stand(s, 'vegRack');
    expect(act(s)).toBe('Овощи кончились — прими поставку');

    s.stock.veg = 3;
    expect(act(s)).toBe('Набрать овощей: морковь, картофель, свёкла');
    expect(s.stock.veg).toBe(0);
    expect(s.player.held?.veg).toBe('raw');
  });

  it('тюк сена у навеса списывает сено; кончилось — отказ', () => {
    const s = cleanShift();
    stand(s, 'hay');
    expect(act(s)).toBe('Взять тюк сена');
    expect(s.stock.hay).toBe(BALANCE.stockStart.hay - 1);
    expect(s.player.held?.kind).toBe('hay');

    s.player.held = null;
    s.stock.hay = 0;
    expect(act(s)).toBe('Сено кончилось — прими поставку');
  });

  it('охапка соломы списывает солому; пустой запас — отказ', () => {
    const s = cleanShift();
    stand(s, 'straw');
    expect(act(s)).toBe('Взять охапку соломы');
    expect(s.stock.straw).toBe(BALANCE.stockStart.straw - 1);
    expect(s.player.held?.charges).toBe(BALANCE.items.strawCharges);

    s.player.held = null;
    s.stock.straw = 0;
    expect(act(s)).toBe('Солома кончилась — прими поставку');
  });

  it('лопата набирает опилки в ведро частично, если в запасе мало; ноль — отказ', () => {
    const s = cleanShift();
    s.stock.sawdust = 2;
    const pail = s.items.find((i) => i.kind === 'sawdust')!;
    pail.x = MAP.stations.sawdust.x;
    pail.y = MAP.stations.sawdust.y - 1;
    s.player.held = newItem(s, 'shovel');
    stand(s, 'sawdust');
    expect(act(s)).toBe('Насыпать опилок в ведро');
    expect(pail.charges).toBe(2);
    expect(s.stock.sawdust).toBe(0);

    expect(act(s)).toBe('Опилки кончились — прими поставку');
    expect(pail.charges).toBe(2);
  });

  it('лопатой насыпают опилки в тачку из запаса; пусто — отказ', () => {
    const s = cleanShift();
    s.stock.sawdust = 3;
    s.barrow.x = MAP.stations.sawdust.x;
    s.barrow.y = MAP.stations.sawdust.y;
    s.player.held = newItem(s, 'shovel');
    stand(s, 'sawdust');
    expect(act(s)).toBe('Насыпать опилок в тачку');
    expect(s.barrow.sawdust).toBe(3);
    expect(s.stock.sawdust).toBe(0);
    expect(act(s)).toBe('Опилки кончились — прими поставку');
  });

  it('запрещает грузить опилки в тачку без совковой лопаты', () => {
    const s = cleanShift();
    s.barrow.x = MAP.stations.sawdust.x;
    s.barrow.y = MAP.stations.sawdust.y;
    s.barrow.pushed = true;
    stand(s, 'sawdust');
    expect(availableAction(s)?.label).toBe('Поставить тачку');
  });

  it('takeStock не уходит в минус, giveStock пополняет', () => {
    const s = cleanShift();
    s.stock.grain = 1;
    expect(takeStock(s, 'grain', 2)).toBe(false);
    expect(s.stock.grain).toBe(1);
    expect(takeStock(s, 'grain')).toBe(true);
    expect(s.stock.grain).toBe(0);
    giveStock(s, 'grain', 5);
    expect(s.stock.grain).toBe(5);
    expect(takeStockUpTo(s, 'grain', 99)).toBe(5);
    expect(s.stock.grain).toBe(0);
  });

  it('тяжёлый груз в руках замедляет, лёгкий — нет', () => {
    const s = cleanShift();
    expect(playerSpeedFactor(s)).toBe(1);

    s.player.held = newItem(s, 'basin', { food: 'kasha', meal: 'kasha1' });
    expect(playerSpeedFactor(s)).toBe(BALANCE.player.loadedSpeedFactor);

    s.player.held = newItem(s, 'basin', { food: null, dirty: false });
    expect(playerSpeedFactor(s)).toBe(1);

    s.player.held = newItem(s, 'hay');
    expect(playerSpeedFactor(s)).toBe(BALANCE.player.loadedSpeedFactor);

    s.player.held = newItem(s, 'broom');
    expect(playerSpeedFactor(s)).toBe(1);

    s.player.held = newItem(s, 'sawdust', { charges: BALANCE.items.sawdustCharges });
    expect(playerSpeedFactor(s)).toBe(1 - BALANCE.player.bucketSlowdown);
    s.player.held.charges = BALANCE.items.sawdustCharges / 2;
    expect(playerSpeedFactor(s)).toBe(1 - BALANCE.player.bucketSlowdown / 2);
  });
});
