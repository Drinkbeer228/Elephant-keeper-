import { describe, expect, it } from 'vitest';
import { advance, availableAction, tick } from '../src/sim';
import { MAP } from '../src/data/map';
import { BALANCE } from '../src/data/balance';
import { act, at, cleanShift, hold, stand } from './helpers';
import type { State } from '../src/sim';

const basket = (s: State) => s.player.held?.kind === 'basket' ? s.player.held : s.items.find((i) => i.kind === 'basket')!;

// Смена в 14:05, слонихи в углу, кипер у корзины
function afternoon(): State {
  const s = cleanShift();
  s.elephants.forEach((e) => hold(e, 3, 3));
  advance(s, BALANCE.food.vegStartFrom + 5);
  at(s, MAP.basketSpot.x - 0.4, MAP.basketSpot.y + 0.3);
  return s;
}

// Вымытые овощи — на столе, чистка открыта
function washedOnTable(): State {
  const s = afternoon();
  act(s);
  stand(s, 'vegRack');
  act(s);
  stand(s, 'wash');
  act(s);
  advance(s, BALANCE.food.vegSoak + 1);
  act(s);
  stand(s, 'kitchen');
  act(s);
  return s;
}

function cutAll(s: State): void {
  while (s.prep) {
    const i = s.prep.pieces[s.prep.index].spots.findIndex((p) => !p.cut);
    tick(s, 0, [{ type: 'prepCut', spot: i }]);
  }
}

describe('ужин: корзина и чистка овощей', () => {
  it('полный путь: корзина → стеллаж → замочить → промыть → чистка → нарезать → тазы', () => {
    const s = afternoon();
    expect(act(s)).toBe('Взять: корзина для овощей');
    stand(s, 'vegRack');
    expect(act(s)).toBe('Набрать овощей: морковь, картофель, свёкла');
    expect(basket(s).veg).toBe('raw');
    stand(s, 'wash');
    expect(act(s)).toBe(`Замочить овощи (${BALANCE.food.vegSoak} мин)`);
    expect(s.player.held).toBeNull();
    expect(availableAction(s)?.label).toMatch(/^Овощи отмокают до/);
    advance(s, BALANCE.food.vegSoak + 1);
    expect(act(s)).toBe('Промыть овощи щёткой');
    expect(basket(s).veg).toBe('washed');
    stand(s, 'kitchen');
    expect(act(s)).toBe('Чистить овощи');
    expect(s.prep?.open).toBe(true);
    expect(s.prep?.pieces.map((p) => p.kind)).toEqual(['carrot', 'potato', 'beet']);
    cutAll(s);
    expect(basket(s).veg).toBe('peeled');
    expect(act(s)).toBe('Нарезать ужин');
    expect(s.kitchen.veg.portions).toBe(3);
    expect(act(s)).toBe('Разложить ужин по тазам (3)');
  });

  it('раньше 14:00 овощи для ужина не берут', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 3, 3));
    s.player.held = basket(s);
    s.items = s.items.filter((i) => i !== s.player.held);
    stand(s, 'vegRack');
    expect(availableAction(s)?.label).toBe('Овощи для ужина берут с 14:00');
  });

  it('у каждого овоща 2–4 дефекта; срез отмечается, окно закрывается и открывается с прогрессом', () => {
    const s = washedOnTable();
    for (const p of s.prep!.pieces) expect(p.spots.length).toBeGreaterThanOrEqual(2), expect(p.spots.length).toBeLessThanOrEqual(4);
    tick(s, 0, [{ type: 'prepCut', spot: 0 }]);
    expect(s.prep!.pieces[0].spots[0].cut).toBe(true);
    tick(s, 0, [{ type: 'prepClose' }]);
    expect(s.prep!.open).toBe(false);
    expect(act(s)).toBe('Продолжить чистку (1/3)');
    expect(s.prep!.open).toBe(true);
    expect(s.prep!.pieces[0].spots[0].cut).toBe(true);
  });

  it('резать можно только у стола', () => {
    const s = washedOnTable();
    at(s, 7, 10.5);
    tick(s, 0, [{ type: 'prepCut', spot: 0 }]);
    expect(s.prep!.pieces[0].spots[0].cut).toBe(false);
  });

  it('дефекты овощей одинаковые при одинаковом seed', () => {
    expect(washedOnTable().prep!.pieces).toEqual(washedOnTable().prep!.pieces);
  });
});
