import type { State } from './types';

// Запасы-счётчики (этап 2): расход и приход. Отказ берёт на себя вызывающий код —
// у каждого места свои слова («зерно кончилось», «овощи кончились»).
export type StockKind = keyof State['stock'];

export const STOCK_LABELS: Record<StockKind, string> = {
  grain: 'Зерно',
  veg: 'Овощи',
  fruit: 'Фрукты',
  hay: 'Сено',
  straw: 'Солома',
  sawdust: 'Опилки',
};

// Достать из запаса; false — не хватает (ничего не списываем)
export function takeStock(state: State, kind: StockKind, qty = 1): boolean {
  if (state.stock[kind] < qty) return false;
  state.stock[kind] -= qty;
  return true;
}

// Списать сколько есть; вернёт списанное количество (для частичного набора опилок и соломы)
export function takeStockUpTo(state: State, kind: StockKind, qty: number): number {
  const taken = Math.min(qty, state.stock[kind]);
  state.stock[kind] -= taken;
  return taken;
}

// Пополнить запас: сдача груза на склад (этап 2, задача 5)
export function giveStock(state: State, kind: StockKind, qty: number): void {
  state.stock[kind] += qty;
}
