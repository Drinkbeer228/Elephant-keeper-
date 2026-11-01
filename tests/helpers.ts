import { createShift, tick, availableAction, type State } from '../src/sim';
import { route } from '../src/dev/bot';
import { advance } from '../src/sim';
import { profileOf } from '../src/sim/elephants';
import { basinsOnRack } from '../src/sim/items';
import { MAP, type StationId } from '../src/data/map';
import type { Elephant } from '../src/sim/types';

// Смена без ночной грязи
export function cleanShift(seed = 1): State {
  const s = createShift(seed, { mess: false });
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
  if (id === 'rack' || id === 'basinRack') at(s, st.x + st.w / 2 + 0.6, st.y);
  else if (id === 'vegRack') at(s, st.x - st.w / 2 - 0.5, st.y);
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

// Довести кипера (и тачку, если он её везёт) до точки по маршруту бота: кадры по 1/30 с, не дольше минуты
export function driveTo(s: State, goal: { x: number; y: number }): void {
  for (let i = 0; i < 30 * 60; i++) {
    const p = s.player;
    if (Math.hypot(goal.x - p.x, goal.y - p.y) < 0.3) return;
    const w = route(p, goal)[0];
    tick(s, 1 / 30, [{ type: 'move', dx: w.x - p.x, dy: w.y - p.y }]);
  }
}

// Каша к 13:00 готова: слонихи отведены в угол, кипер у кормовой
export function kashaReady(seed = 1): State {
  const s = cleanShift(seed);
  s.elephants.forEach((e) => hold(e, 6, 3));
  advance(s, 280);
  stand(s, 'kitchen');
  act(s);
  advance(s, 21);
  return s;
}

// Взять со стеллажа таз с едой и поставить на место слонихи
export function serve(s: State, elephantId: string): void {
  const b = basinsOnRack(s).find((x) => x.food)!;
  at(s, b.x + 0.5, b.y);
  act(s);
  const e = s.elephants.find((x) => x.id === elephantId)!;
  const slot = profileOf(e).slot;
  at(s, slot.x, slot.y + 0.9);
  act(s);
}
