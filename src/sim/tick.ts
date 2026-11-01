import { BALANCE } from '../data/balance';
import { MAP } from '../data/map';
import { availableAction, inspect } from './actions';
import { dayPart, pace } from './clock';
import { updateElephants } from './elephants';
import { emit, hint } from './events';
import { updateFloor } from './floor';
import { updateKitchen } from './feeding';
import { acceptShift, finishShift } from './handover';
import { updateItems } from './items';
import type { Command, ShiftEvent, State } from './types';

// Один кадр игры: dtReal — реальные секунды с прошлого кадра
export function tick(state: State, dtReal: number, commands: Command[] = []): ShiftEvent[] {
  const start = state.log.length;
  if (state.phase === 'report') return [];

  for (const c of commands) {
    switch (c.type) {
      case 'move':
        movePlayer(state, c.dx, c.dy, dtReal);
        break;
      case 'action': {
        const a = availableAction(state);
        a?.run(state);
        break;
      }
      case 'inspect':
        emit(state, { kind: 'info', text: inspect(state).join('\n') });
        break;
      case 'toggleCheck': {
        const entry = state.checklist.find((e) => e.id === c.id);
        if (entry && state.phase === 'acceptance') entry.mark = c.value;
        break;
      }
      case 'acceptShift':
        acceptShift(state);
        break;
    }
  }

  if (state.phase === 'shift') {
    let gameDt = dtReal / pace(state);
    while (gameDt > 0 && state.phase === 'shift') {
      const step = Math.min(gameDt, BALANCE.time.maxStep);
      stepSim(state, step, step * pace(state));
      gameDt -= step;
    }
  }
  return state.log.slice(start);
}

// Продвинуть смену на столько игровых минут (для тестов и «перемотки»)
export function advance(state: State, minutes: number): void {
  let left = minutes;
  while (left > 0 && state.phase === 'shift') {
    const step = Math.min(left, BALANCE.time.maxStep);
    stepSim(state, step, step * pace(state));
    left -= step;
  }
}

function stepSim(state: State, dt: number, dtReal: number): void {
  const before = dayPart(state.t);
  state.t += dt;
  updateElephants(state, dt, dtReal);
  updateItems(state, dt);
  updateKitchen(state, dt);
  updateFloor(state);
  const after = dayPart(state.t);
  if (before === 'day' && after === 'night') {
    hint(state, 'night', 'Ночь: время бежит быстро, но слонихи встают пописать и попить — на сигналах всё замедлится.');
  }
  if (state.t >= BALANCE.time.shiftEnd) finishShift(state);
}

// Стены и ограждение: через ограждение — только в проходе
export function walkable(x: number, y: number): boolean {
  if (x < 0.4 || y < 0.4 || x > MAP.w - 0.4 || y > MAP.h - 0.4) return false;
  if (x < MAP.bedding.x + 0.3 && y < MAP.fenceY + 0.3) return false;
  if (y < MAP.bedding.y + 0.3 && x < MAP.fenceX + 0.3) return false;
  const inGate = x > MAP.gate.x0 + 0.3 && x < MAP.gate.x1 - 0.3;
  if (Math.abs(y - MAP.fenceY) < 0.3 && x < MAP.fenceX + 0.3 && !inGate) return false;
  if (Math.abs(x - MAP.fenceX) < 0.3 && y < MAP.fenceY + 0.3) return false;
  return true;
}

function movePlayer(state: State, dx: number, dy: number, dtReal: number): void {
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return;
  const p = state.player;
  const nx = dx / len;
  const ny = dy / len;
  p.facing = { x: nx, y: ny };
  const step = BALANCE.player.speed * Math.min(len, 1) * dtReal;
  if (walkable(p.x + nx * step, p.y)) p.x += nx * step;
  if (walkable(p.x, p.y + ny * step)) p.y += ny * step;
}
