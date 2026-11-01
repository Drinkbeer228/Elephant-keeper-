import { createShift, tick, availableAction, type State } from '../src/sim';
import { MAP, type StationId } from '../src/data/map';
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

// Нажать «Действие». Если там меню — выбрать пункт по началу его названия
export function act(s: State, pick?: string): string | undefined {
  const a = availableAction(s);
  if (a?.choices && pick !== undefined) {
    const i = a.choices.findIndex((c) => c.label.startsWith(pick));
    tick(s, 0, [{ type: 'action', choice: i }]);
    return a.choices[i]?.label;
  }
  tick(s, 0, [{ type: 'action' }]);
  return a?.label;
}

// Встать рядом со станцией: обычно сверху; у стойки — справа, у раковины — снизу (сверху стена)
export function stand(s: State, id: StationId): void {
  const st = MAP.stations[id];
  if (id === 'rack') at(s, st.x + st.w / 2 + 0.6, st.y);
  else if (id === 'wash') at(s, st.x, st.y + st.h / 2 + 0.5);
  else at(s, st.x, st.y - st.h / 2 - 0.5);
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
