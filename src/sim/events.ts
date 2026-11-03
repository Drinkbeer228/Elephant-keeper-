import type { ShiftEvent, State } from './types';

// Лог смены — кольцевой буфер: без ограничения за длинные сессии массив раздулся бы.
// Лимит выбран с запасом: тесты доставки сверяют по логу все грузовики одной смены
// (несколько поддонов × несколько видов груза), суточная игра укладывается в него свободно.
export const LOG_LIMIT = 2000;

export function emit(state: State, ev: ShiftEvent): void {
  state.log.push(ev);
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

// Подсказка первой смены: каждая показывается один раз
export function hint(state: State, key: string, text: string): void {
  if (state.stats.hintsShown.includes(key)) return;
  state.stats.hintsShown.push(key);
  emit(state, { kind: 'hint', text });
}
