import { BALANCE } from '../data/balance';
import { inBedding, inReachZone, nearStation } from '../data/map';
import { emit } from './events';
import { chance, randomRange } from './rng';
import { addItem } from './state';
import type { State, Tool } from './types';

const B = BALANCE.barrow;
const K = BALANCE.container;

export const TOOL_NAMES: Record<Tool, string> = { scoop: 'совка', fork: 'вил', broom: 'метлы' };

function d(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Тачка стоит рядом и помогает с уборкой
export function barrowNear(state: State, reach: number = B.reach): boolean {
  const b = state.barrow;
  const p = state.player;
  // Через ограждение тачкой не пользуются: кипер и тачка по одну сторону
  return !b.pushed && d(b, p) <= reach && inBedding(b.x, b.y) === inBedding(p.x, p.y);
}

export function barrowRoom(state: State): number {
  return B.wasteCapacity - state.barrow.waste;
}

// Тачка едет перед кипером
export function barrowOffset(facing: { x: number; y: number }): { x: number; y: number } {
  const len = Math.hypot(facing.x, facing.y) || 1;
  return { x: (facing.x / len) * 0.95, y: (facing.y / len) * 0.75 };
}

// Балансировка тюков: чем больше тюков и быстрее едешь, тем сильнее раскачивает
export function updateBalance(state: State, dtReal: number, moving: boolean, input: number, turned: boolean): void {
  const b = state.barrow;
  if (!b.pushed || b.bales <= B.stableBales) {
    b.balance = 0;
    return;
  }
  const load = b.bales - B.stableBales;
  if (moving) {
    const noise = (randomRange(state, -1, 1) * B.noise + b.balance * B.drift) * load;
    b.balance += noise * dtReal;
    if (turned) b.balance += (b.balance >= 0 ? 1 : -1) * B.turnKick * load;
  } else {
    b.balance *= Math.max(0, 1 - dtReal * 2);
  }
  b.balance -= input * B.control * dtReal;
  if (Math.abs(b.balance) >= 1) {
    const side = b.balance > 0 ? 1 : -1;
    b.bales--;
    b.balance = 0;
    addItem(state, 'hay', b.x + side * 0.7, b.y + 0.3);
    emit(state, { kind: 'bad', text: b.bales ? 'Тюк свалился с тачки!' : 'Тюк свалился с тачки — пусто.' });
  }
}

// Скучающая слониха может опрокинуть тачку, оставленную рядом
export function updateBarrowRisk(state: State, dt: number): void {
  const b = state.barrow;
  if (b.pushed || (!inBedding(b.x, b.y) && !inReachZone(b.x, b.y))) return;
  if (state.t - b.parkedAt < BALANCE.items.breakGrace) return;
  if (!b.tools.length && !b.waste && !b.bales && !b.sawdust && !b.straw) return;
  const near = state.elephants.filter((e) => e.state !== 'sleep' && d(e, b) <= BALANCE.items.reachDistance).sort((x, y) => d(x, b) - d(y, b))[0];
  if (!near) return;
  const p = B.tipChance * (1 - near.trust / 100) * (0.5 + near.boredom / 200) * (state.fenceOn ? 1 : 2);
  if (!chance(state, p * dt)) return;
  // Опрокинула: мусор вывалился кучами, инструмент разлетелся
  const piles = Math.min(4, Math.ceil(b.waste / 3));
  for (let i = 0; i < piles; i++) {
    state.dung.push({ id: state.nextItemId++, x: b.x + randomRange(state, -1, 1), y: b.y + randomRange(state, -0.6, 0.6), at: state.t });
  }
  b.tools.forEach((tool, i) => addItem(state, tool, b.x - 0.8 + i * 0.8, b.y + 0.6));
  for (let i = 0; i < b.bales; i++) addItem(state, 'hay', b.x + 0.9, b.y - 0.4 + i * 0.4);
  b.tools = [];
  b.waste = 0;
  b.bales = 0;
  b.sawdust = 0;
  b.straw = 0;
  emit(state, { kind: 'bad', text: 'Слониха опрокинула тачку — всё вывалилось!', why: 'barrowTipped' });
}

// ——— мусорный бак ———

export function containerShare(state: State): number {
  return state.container.fill / K.capacity;
}

export type DumpWay = 'driveIn' | 'ramp' | 'needDoor' | 'needRamp' | 'full';

export function dumpWay(state: State): DumpWay {
  const c = state.container;
  if (c.fill >= K.capacity) return 'full';
  if (!c.doorClosed) return containerShare(state) < K.doorAt ? 'driveIn' : 'needDoor';
  return c.ramp ? 'ramp' : 'needRamp';
}

export function nearContainer(state: State): boolean {
  const { player: p, barrow: b } = state;
  const r = BALANCE.player.stationReach;
  return nearStation('dump', p.x, p.y, r) || (b.pushed && nearStation('dump', b.x, b.y, r));
}

export function addToContainer(state: State, units: number): number {
  const c = state.container;
  const put = Math.min(units, K.capacity - c.fill);
  c.fill += put;
  if (c.fill >= K.capacity) emit(state, { kind: 'info', text: 'Мусорный бак полон. Пора вызывать мусоровоз.' });
  else if (!c.doorClosed && containerShare(state) >= K.doorAt) emit(state, { kind: 'info', text: 'Бак заполнен наполовину — дальше с тачкой не заехать.' });
  return put;
}

export function callTruck(state: State): void {
  state.container.truckAt = state.t + K.truckDelay;
  emit(state, { kind: 'info', text: `Мусоровоз вызван, будет через час.` });
}

export function updateContainer(state: State): void {
  const c = state.container;
  if (c.truckAt !== null && state.t >= c.truckAt) {
    c.truckAt = null;
    c.truckLeftAt = state.t;
    c.fill = 0;
    c.doorClosed = false;
    c.ramp = false;
    emit(state, { kind: 'good', text: 'Мусоровоз забрал полный бак и поставил пустой.' });
  }
}

