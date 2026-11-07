// Один фиксированный шаг симуляции. Всё детерминировано: одинаковое состояние и
// одинаковый ввод дают одинаковый результат — в том числе после сохранения и загрузки.

import { TIME } from '../data/balance';
import { updateAlerts } from './alerts';
import { updateElephants } from './behavior/engine';
import { urinatingNearKeeper } from './behavior/urine';
import { drainEvents } from './events';
import { updateKitten } from './kitten';
import { moveKeeper, performAction, stepKeeperTask } from './keeper';
import { rollDay } from './report';
import { pace } from './time';
import type { SimEvent, State, StepInput } from './types';
import { updateWorld } from './world';

export const NO_INPUT: StepInput = { move: { x: 0, y: 0 }, run: false, actions: [], cancel: false };

export function step(s: State, input: StepInput = NO_INPUT): SimEvent[] {
  const dtSec = TIME.step;
  if (input.cancel && s.keeper.task) s.keeper.task = null;
  for (const id of input.actions) performAction(s, id);
  moveKeeper(s, input, dtSec);
  stepKeeperTask(s, dtSec);

  const before = s.t;
  // Слониха мочится рядом с кипером — время идёт как в жизни: подойти с ведром и поймать струю
  const dt = dtSec * (urinatingNearKeeper(s) ? TIME.paceCatch : pace(s.t));
  s.t += dt;
  s.simSec += dtSec;
  updateWorld(s, dt, dtSec);
  updateElephants(s, dt, dtSec);
  updateKitten(s, dt, dtSec);
  if (Math.floor(before * 2) !== Math.floor(s.t * 2)) updateAlerts(s);
  if (s.t >= s.dayStart + TIME.day) rollDay(s);
  return drainEvents();
}

// Прогнать столько игровых минут без ввода (для тестов и пропуска времени)
export function runMinutes(s: State, minutes: number, input: StepInput = NO_INPUT): SimEvent[] {
  const end = s.t + minutes;
  const events: SimEvent[] = [];
  let guard = 0;
  while (s.t < end && guard++ < 5_000_000) {
    const ev = step(s, input);
    if (ev.length) events.push(...ev);
    if (events.length > 20000) events.splice(0, events.length - 20000);
  }
  return events;
}
