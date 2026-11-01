import { BALANCE } from '../data/balance';
import { MAP } from '../data/map';
import { availableAction, inspect } from './actions';
import { dayPart, pace } from './clock';
import { updateElephants } from './elephants';
import { emit, hint } from './events';
import { updateFloor } from './floor';
import { updateKitchen } from './feeding';
import { finishShift } from './handover';
import { updateItems } from './items';
import { barrowOffset, updateBalance, updateBarrowRisk, updateContainer } from './barrow';
import type { Command, ShiftEvent, State } from './types';

// Один кадр игры: dtReal — реальные секунды с прошлого кадра
export function tick(state: State, dtReal: number, commands: Command[] = []): ShiftEvent[] {
  const start = state.log.length;
  if (state.phase === 'report') return [];

  let balanceInput = 0;
  let moved = { moving: false, turned: false };
  for (const c of commands) {
    switch (c.type) {
      case 'move':
        moved = movePlayer(state, c.dx, c.dy, dtReal);
        break;
      case 'balance':
        balanceInput += c.dir;
        break;
      case 'action': {
        // У действия может быть меню (тачка): тогда выбирают пункт по номеру
        const a = availableAction(state);
        if (a?.choices) {
          if (c.choice !== undefined) a.choices[c.choice]?.run(state);
        } else a?.run(state);
        break;
      }
      case 'inspect':
        emit(state, { kind: 'info', text: inspect(state).join('\n') });
        break;
    }
  }

  updateBalance(state, dtReal, moved.moving, Math.sign(balanceInput), moved.turned);

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
  hint(state, 'start', 'Смена идёт. Тачка — у стойки инвентаря. Всё, что взял, верни на место: утром сменщик примет вольер по чек-листу.');
  const before = dayPart(state.t);
  state.t += dt;
  updateElephants(state, dt, dtReal);
  updateItems(state, dt);
  updateBarrowRisk(state, dt);
  updateContainer(state);
  updateKitchen(state, dt);
  updateFloor(state);
  const after = dayPart(state.t);
  if (before === 'day' && after === 'night') {
    hint(state, 'night', 'Ночь: время бежит быстро, но слонихи встают пописать и попить — на сигналах всё замедлится.');
  }
  if (state.t >= BALANCE.time.shiftEnd) finishShift(state);
}

function segDist(x: number, y: number, w: { x0: number; y0: number; x1: number; y1: number }): number {
  const dx = w.x1 - w.x0;
  const dy = w.y1 - w.y0;
  const t = Math.max(0, Math.min(1, ((x - w.x0) * dx + (y - w.y0) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (w.x0 + t * dx), y - (w.y0 + t * dy));
}

// Стены, решётка, стены построек, контейнер. В вольер — через проход для человека или открытые ворота
export function walkable(x: number, y: number, gateOpen = false): boolean {
  if (x < 0.4 || y < 0.4 || x > MAP.w - 0.4 || y > MAP.h - 0.4) return false;
  if (x < MAP.paddock.x0 + 0.3 && y < MAP.fenceY + 0.3) return false;
  if (y < MAP.paddock.y0 + 0.3) return false;
  const inDoor = x > MAP.door.x0 + 0.3 && x < MAP.door.x1 - 0.3;
  const inGate = gateOpen && x > MAP.elephantGate.x0 + 0.3 && x < MAP.elephantGate.x1 - 0.3;
  if (Math.abs(y - MAP.fenceY) < 0.3 && x < MAP.fenceX + 0.3 && !inDoor && !inGate) return false;
  if (Math.abs(x - MAP.fenceX) < 0.3 && y < MAP.fenceY + 0.3) return false;
  for (const w of MAP.walls) if (segDist(x, y, w) < 0.3) return false;
  // Морской контейнер — твёрдый: обходят, заезжают только в его двери (это действие, а не проход)
  const c = MAP.stations.dump;
  if (Math.abs(x - c.x) < c.w / 2 + 0.3 && Math.abs(y - c.y) < c.h / 2 + 0.3) return false;
  return true;
}

// Кипер идёт; если везёт тачку — она катится перед ним и тоже не пролезает сквозь ограждение
function movePlayer(state: State, dx: number, dy: number, dtReal: number): { moving: boolean; turned: boolean } {
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return { moving: false, turned: false };
  const p = state.player;
  const b = state.barrow;
  const nx = dx / len;
  const ny = dy / len;
  const turned = nx * p.facing.x + ny * p.facing.y < 0.3;
  p.facing = { x: nx, y: ny };
  const pushed = b.pushed;
  const step = BALANCE.player.speed * (pushed ? BALANCE.barrow.speedFactor : 1) * Math.min(len, 1) * dtReal;
  let off = { x: b.x - p.x, y: b.y - p.y };
  if (pushed) {
    const want = barrowOffset(p.facing);
    if (walkable(p.x + want.x, p.y + want.y, state.gateOpen)) off = want;
  }
  const g = state.gateOpen;
  const ok = (x: number, y: number) => walkable(x, y, g) && (!pushed || walkable(x + off.x, y + off.y, g));
  const x0 = p.x;
  const y0 = p.y;
  if (ok(p.x + nx * step, p.y)) p.x += nx * step;
  if (ok(p.x, p.y + ny * step)) p.y += ny * step;
  if (pushed) {
    b.x = p.x + off.x;
    b.y = p.y + off.y;
  }
  return { moving: Math.hypot(p.x - x0, p.y - y0) > 0.001, turned };
}
