import type { State } from './types';

// mulberry32: состояние хранится в State, поэтому смену можно повторить по seed
export function random(state: State): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomRange(state: State, min: number, max: number): number {
  return min + random(state) * (max - min);
}

export function randomInt(state: State, min: number, maxInclusive: number): number {
  return Math.floor(randomRange(state, min, maxInclusive + 1));
}

export function chance(state: State, p: number): boolean {
  return random(state) < p;
}

export function pick<T>(state: State, list: readonly T[]): T {
  return list[Math.floor(random(state) * list.length)];
}
