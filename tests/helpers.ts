import { createState, runMinutes, step, availableActions, NO_INPUT, type State, type Traits, type StepInput } from '../src/sim';
import { KITTEN_PLACES, STATIONS, type StationId } from '../src/data/facility';
import type { Elephant } from '../src/sim/types';

export function game(seed = 1, herd = 3, overrides?: Partial<Traits>[], mess = false): State {
  const s = createState({ seed, herdSize: herd, overrides, mess });
  s.journal = [];
  quietKitten(s);
  return s;
}

// Котёнок спит на сене в сеннике и не мешает тестам, где речь не о нём
export function quietKitten(s: State): void {
  const k = s.kitten;
  const hay = KITTEN_PLACES.find((p) => p.id === 'hay')!;
  k.x = hay.x;
  k.y = hay.y;
  k.path = [];
  k.hop = false;
  k.up = null;
  k.pending = null;
  k.perch = { x: hay.x, y: hay.y, down: { ...hay.from }, tree: false };
  k.act = { kind: 'nap', start: s.t, until: 1e9, target: null, arrived: true, look: null, spot: hay.text };
  k.fear = 0;
}

export function el(s: State, i: number): Elephant {
  return s.elephants[i];
}

export function at(s: State, x: number, y: number): void {
  s.keeper.x = x;
  s.keeper.y = y;
}

export function atStation(s: State, id: StationId): void {
  const p = STATIONS[id].keeper;
  at(s, p.x, p.y);
}

export function actions(s: State): string[] {
  return availableActions(s).map((a) => a.id);
}

// Выполнить действие (по точному id или префиксу) и дождаться окончания работы
export function act(s: State, idOrPrefix: string): boolean {
  const list = availableActions(s);
  const a = list.find((x) => x.id === idOrPrefix) ?? list.find((x) => x.id.startsWith(idOrPrefix));
  if (!a || !a.enabled) return false;
  step(s, { ...NO_INPUT, actions: [a.id] });
  let guard = 0;
  while (s.keeper.task && guard++ < 2000) step(s);
  return true;
}

export function walk(s: State, dx: number, dy: number, seconds: number, run = false): void {
  const input: StepInput = { move: { x: dx, y: dy }, run, actions: [], cancel: false };
  const n = Math.round(seconds * 30);
  for (let i = 0; i < n; i++) step(s, input);
}

// Заморозить слона в точке (тесты, где мешает его собственная жизнь)
export function park(e: Elephant, x: number, y: number): void {
  e.x = x;
  e.y = y;
  e.act = { ...e.act, kind: 'idle', phase: 'do', dur: 1e6, doStart: 0, forced: true, target: null, key: 'idle' };
  e.path = [];
}

export { runMinutes, step };
