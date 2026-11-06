import { TIME } from '../data/balance';
import { clamp, mulberry } from './rng';

export function minuteOfDay(t: number): number {
  return ((t % TIME.day) + TIME.day) % TIME.day;
}

// Номер смены: смена идёт с 08:00 до 08:00
export function shiftDay(t: number): number {
  return Math.floor((t - TIME.start) / TIME.day) + 1;
}

export function clockText(t: number): string {
  const m = Math.floor(minuteOfDay(t));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function isNight(t: number): boolean {
  const m = minuteOfDay(t);
  return m >= TIME.nightFrom || m < TIME.nightTo;
}

export function pace(t: number): number {
  return isNight(t) ? TIME.paceNight : TIME.paceDay;
}

// Темнота для отрисовки: сумерки 19:30–21:30, рассвет 05:00–06:30
export function darkness(t: number): number {
  const m = minuteOfDay(t);
  if (m >= 19.5 * 60 && m < 21.5 * 60) return (m - 19.5 * 60) / 120;
  if (m >= 21.5 * 60 || m < 5 * 60) return 1;
  if (m >= 5 * 60 && m < 6.5 * 60) return 1 - (m - 5 * 60) / 90;
  return 0;
}

// Тяга ко сну: ночью высокая, днём — небольшой «послеобеденный» подъём
export function sleepPressure(t: number): number {
  const h = minuteOfDay(t) / 60;
  if (h >= 23 || h < 4.5) return 1;
  if (h >= 21 && h < 23) return (h - 21) / 2;
  if (h >= 4.5 && h < 6) return 1 - (h - 4.5) / 1.5;
  if (h >= 13 && h < 15.5) return 0.18;
  return 0.05;
}

// Желание быть внутри: вечером и ночью слонов тянет в слоновник
export function indoorPull(t: number): number {
  const h = minuteOfDay(t) / 60;
  if (h >= 19 || h < 5) return clamp((h >= 19 ? h - 18.5 : 6) / 2, 0, 1);
  if (h >= 5 && h < 7) return 0.5;
  return 0;
}

// Погода дня: средняя температура и размах детерминированно зависят от seed и номера дня
export function weatherOf(seed: number, day: number): { mean: number; amp: number } {
  const next = mulberry((seed * 31 + day * 7919) >>> 0);
  return { mean: 17 + next() * 7, amp: 5 + next() * 3.5 };
}

export function temperature(seed: number, t: number): number {
  const day = Math.floor(t / TIME.day);
  const { mean, amp } = weatherOf(seed, day);
  const h = minuteOfDay(t) / 60;
  return mean + amp * Math.cos((2 * Math.PI * (h - 15)) / 24);
}

export function indoorTemperature(seed: number, t: number): number {
  const out = temperature(seed, t);
  const day = Math.floor(t / TIME.day);
  const { mean } = weatherOf(seed, day);
  return mean + 0.45 * (out - mean);
}
