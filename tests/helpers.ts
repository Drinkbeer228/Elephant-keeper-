import { createShift, tick, availableAction, type State } from '../src/sim';
import type { Elephant } from '../src/sim/types';

// Смена без косяков и ночной грязи, уже принятая
export function cleanShift(seed = 1): State {
  const s = createShift(seed, { defects: [], mess: false });
  tick(s, 0, [{ type: 'acceptShift' }]);
  s.log = [];
  return s;
}

export function el(s: State, id: string): Elephant {
  return s.elephants.find((e) => e.id === id)!;
}

export function at(s: State, x: number, y: number): void {
  s.player.x = x;
  s.player.y = y;
}

export function act(s: State): string | undefined {
  const a = availableAction(s);
  tick(s, 0, [{ type: 'action' }]);
  return a?.label;
}

// Заморозить слониху на месте, чтобы она не уходила
export function hold(e: Elephant, x: number, y: number): void {
  e.x = e.tx = x;
  e.y = e.ty = y;
  e.state = 'idle';
  e.timer = 1e9;
}

export function texts(s: State): string {
  return s.log.map((l) => l.text).join('\n');
}
