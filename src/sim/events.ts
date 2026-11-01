import type { ShiftEvent, State } from './types';

export function emit(state: State, ev: ShiftEvent): void {
  state.log.push(ev);
}

// Подсказка первой смены: каждая показывается один раз
export function hint(state: State, key: string, text: string): void {
  if (state.stats.hintsShown.includes(key)) return;
  state.stats.hintsShown.push(key);
  emit(state, { kind: 'hint', text });
}
