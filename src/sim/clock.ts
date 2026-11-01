import { BALANCE } from '../data/balance';
import type { State } from './types';

export type DayPart = 'day' | 'night' | 'morning';

export function dayPart(t: number): DayPart {
  if (t < BALANCE.time.dayEnd) return 'day';
  if (t < BALANCE.time.nightEnd) return 'night';
  return 'morning';
}

// Ночью время замедляется, если что-то требует внимания
export function needsAttention(state: State): boolean {
  return (
    state.elephants.some((e) => e.signalStarted !== undefined || e.state === 'sway') ||
    (state.valveOpen && state.trough >= 100)
  );
}

export function pace(state: State): number {
  const part = dayPart(state.t);
  if (part === 'day') return BALANCE.time.paceDay;
  if (part === 'morning') return BALANCE.time.paceMorning;
  return needsAttention(state) ? BALANCE.time.paceDay : BALANCE.time.paceNight;
}

export function clockText(t: number): string {
  const total = Math.floor(480 + t) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isNight(state: State): boolean {
  return dayPart(state.t) === 'night';
}
