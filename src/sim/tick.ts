import { BALANCE } from '../data/balance';
import { MAP, floorZoneOf, inPaddock, isHardFloor } from '../data/map';
import { walkable as navWalkable } from './nav';
import { updateTrucks } from './truck';
export { walkable } from './nav';
import { availableAction, inspect } from './actions';
import { dayPart, pace } from './clock';
import { updateElephants } from './elephants';
import { emit, hint } from './events';
import { updateFloor } from './floor';
import { cutSpot, updateKitchen } from './feeding';
import { finishShift } from './handover';
import { updateItems } from './items';
import { barrowOffset, spillFromBarrow, updateBalance, updateBarrowRisk, updateContainer } from './barrow';
import { updatePartner } from './partner';
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
        moved = movePlayer(state, c.dx, c.dy, dtReal, c.sprint === true);
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
      case 'prepCut':
        cutSpot(state, c.spot);
        break;
      case 'prepClose':
        if (state.prep) state.prep.open = false;
        break;
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
  updatePartner(state, dt, dtReal);
  updateItems(state, dt);
  updateBarrowRisk(state, dt);
  updateContainer(state);
  updateTrucks(state);
  updateKitchen(state, dt);
  updateFloor(state);
  const after = dayPart(state.t);
  if (before === 'day' && after === 'night') {
    hint(state, 'night', 'Ночь: время бежит быстро, но слонихи встают пописать и попить — на сигналах всё замедлится.');
  }
  if (state.t >= BALANCE.time.shiftEnd) finishShift(state);
}

// Тяжёлый груз в руках замедляет (чтобы у тачки и рохли был смысл): полный таз, тюк, мешок,
// корзина, охапка соломы, полный бак. Лёгкое — пустой таз, инструмент — нет.
// Ведро опилок — плавно: полное ведро 85% скорости, с каждой высыпанной порцией быстрее
export function playerSpeedFactor(state: State): number {
  const h = state.player.held;
  if (!h) return 1;
  if (h.kind === 'sawdust') {
    const charges = h.charges ?? 0;
    if (charges <= 0) return 1;
    return 1 - BALANCE.player.bucketSlowdown * Math.min(1, charges / BALANCE.items.sawdustCharges);
  }
  const heavy =
    h.kind === 'hay' ||
    h.kind === 'bag' ||
    h.kind === 'basket' ||
    (h.kind === 'basin' && (h.food != null || (h.nested?.length ?? 0) > 0)) ||
    (h.kind === 'bucket' && (h.liters ?? 0) >= 20) ||
    (h.kind === 'straw' && (h.charges ?? 0) > 0);
  return heavy ? BALANCE.player.loadedSpeedFactor : 1;
}

// Кипер идёт; толкаемое (тачка или рохля) катится перед ним. Рохля — только по твёрдому полу.
// Спринт (Shift): быстрее, но с гружёной тачкой дребезжит и сыплет на поворотах и стыках покрытий
function movePlayer(state: State, dx: number, dy: number, dtReal: number, sprint: boolean): { moving: boolean; turned: boolean } {
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return { moving: false, turned: false };
  const p = state.player;
  const b = state.barrow;
  const j = state.jack;
  const jackPushed = j.pushed && !b.pushed;
  const barrowPushed = b.pushed;
  const nx = dx / len;
  const ny = dy / len;
  const turned = nx * p.facing.x + ny * p.facing.y < 0.3;
  p.facing = { x: nx, y: ny };
  p.sprinting = sprint;
  const speedFactor = barrowPushed ? BALANCE.barrow.speedFactor : jackPushed ? BALANCE.jack.speedFactor : 1;
  const sprintFactor = sprint ? BALANCE.player.sprintFactor : 1;
  const step = BALANCE.player.speed * playerSpeedFactor(state) * speedFactor * sprintFactor * Math.min(len, 1) * dtReal;
  const target = barrowPushed ? b : jackPushed ? j : null;
  const w = (x: number, y: number) => navWalkable(x, y, state.gateOpen, false);
  let off = target ? { x: target.x - p.x, y: target.y - p.y } : { x: 0, y: 0 };
  if (target) {
    const want = barrowOffset(p.facing);
    if (w(p.x + want.x, p.y + want.y)) off = want;
  }
  const ok = (x: number, y: number) => {
    if (!w(x, y)) return false;
    if (!target) return true;
    const tx = x + off.x;
    const ty = y + off.y;
    if (!w(tx, ty)) return false;
    if (barrowPushed && inPaddock(x, y) !== inPaddock(tx, ty) && !crossesPaddockDoor(x, y, tx, ty, state.gateOpen)) return false;
    if (jackPushed && !isHardFloor(x + off.x, y + off.y)) return false;
    return true;
  };
  const x0 = p.x;
  const y0 = p.y;
  const zoneBefore = floorZoneOf(b.x, b.y);
  if (ok(p.x + nx * step, p.y)) p.x += nx * step;
  if (ok(p.x, p.y + ny * step)) p.y += ny * step;
  if (target) {
    target.x = p.x + off.x;
    target.y = p.y + off.y;
  }
  const moved = Math.hypot(p.x - x0, p.y - y0);
  if (barrowPushed) {
    // Встряски тачки: резкий поворот, стык покрытий (границы зон, трапы, пороги), упор в препятствие
    const blocked = len >= 0.01 && moved < step * 0.25;
    const jolt = {
      turn: turned && moved > 0.001, // резкий поворот на ходу
      zone: floorZoneOf(b.x, b.y) !== zoneBefore || onThreshold(b.x, b.y),
      bump: blocked && !b.stuck,
      sprint, // спринт с грузом — тачка дребезжит сильнее
    };
    b.stuck = blocked;
    spillFromBarrow(state, moved, jolt);
  } else if (b.stuck) b.stuck = false;
  return { moving: moved > 0.001, turned };
}

function crossesPaddockDoor(x: number, y: number, tx: number, ty: number, gateOpen: boolean): boolean {
  const crosses = (a: number, b: number, fence: number) => (a < fence) !== (b < fence);
  const aligned = (a: number, b: number, range: { x0: number; x1: number }) =>
    a > range.x0 + 0.3 && a < range.x1 - 0.3 && b > range.x0 + 0.3 && b < range.x1 - 0.3;
  const upper = crosses(y, ty, MAP.fenceY);
  const lower = crosses(y, ty, MAP.fenceY2);
  if (upper && aligned(x, tx, MAP.door)) return true;
  if (lower && aligned(x, tx, MAP.door2)) return true;
  if (gateOpen && upper && aligned(x, tx, MAP.elephantGate)) return true;
  return gateOpen && lower && aligned(x, tx, MAP.elephantGate2);
}

// Пороги дверей и сливные трапы — «неровности пола» для встряски
function onThreshold(x: number, y: number): boolean {
  for (const t of MAP.thresholds) {
    if (x >= t.x0 - 0.2 && x <= t.x1 + 0.2 && Math.abs(y - t.y0) < 0.35) return true;
  }
  for (const id of ['drain', 'drain2'] as const) {
    const d = MAP.stations[id];
    if (Math.abs(x - d.x) < d.w / 2 + 0.2 && Math.abs(y - d.y) < d.h / 2 + 0.2) return true;
  }
  return false;
}
