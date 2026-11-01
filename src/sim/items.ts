import { BALANCE } from '../data/balance';
import { MAP, inPaddock, inReachZone } from '../data/map';
import { emit } from './events';
import { chance } from './rng';
import { addItem } from './state';
import type { Item, State } from './types';

const I = BALANCE.items;

export const ITEM_NAMES: Record<Item['kind'], string> = {
  bucket: 'бак 65 л',
  scoop: 'совок со скребком',
  fork: 'вилы',
  broom: 'метла',
  sawdust: 'ведро опилок',
  bag: 'мешок 240 л',
  basin: 'таз',
  hay: 'тюк сена',
  straw: 'охапка соломы',
};

function d(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Вещи, до которых слониха может дотянуться
export function reachableItems(state: State): Item[] {
  return state.items.filter((i) => i.kind !== 'basin' && (inPaddock(i.x, i.y) || inReachZone(i.x, i.y)));
}

function inUse(state: State, item: Item): boolean {
  // Бак, под которым сейчас кто-то писает, не трогают
  return (
    item.kind === 'bucket' &&
    state.elephants.some((e) => e.signalStarted !== undefined && d(e, item) <= BALANCE.elephant.bucketRadius)
  );
}

export function updateItems(state: State, dt: number): void {
  for (const item of [...state.items]) {
    if (item.kind === 'basin') {
      updateBasin(state, item, dt);
      continue;
    }
    if (!inPaddock(item.x, item.y) && !inReachZone(item.x, item.y)) continue;
    if (state.t - item.droppedAt < I.breakGrace || inUse(state, item)) continue;
    const near = state.elephants
      .filter((e) => e.state !== 'sleep' && d(e, item) <= I.reachDistance)
      .sort((a, b) => d(a, item) - d(b, item))[0];
    if (!near) continue;
    const focus = near.state === 'reach' && near.targetItem === item.id ? 5 : 1;
    const p = I.breakBase * (1 - near.trust / 100) * (0.5 + near.boredom / 200) * focus;
    if (chance(state, p * dt)) breakItem(state, item);
  }
}

export function breakItem(state: State, item: Item): void {
  state.items = state.items.filter((i) => i !== item);
  state.stats.broken.push(ITEM_NAMES[item.kind]);
  emit(state, { kind: 'bad', text: `Слониха дотянулась и сломала: ${ITEM_NAMES[item.kind]}.`, why: 'itemBroken' });
  if (item.kind === 'bucket' && state.spareBucket) {
    state.spareBucket = false;
    addItem(state, 'bucket', MAP.rackSpots.spareBucket.x, MAP.rackSpots.spareBucket.y, { liters: 0, dirty: false });
    emit(state, { kind: 'info', text: 'На стойке есть запасной бак. Последний.' });
  }
}

function updateBasin(state: State, basin: Item, dt: number): void {
  if (basin.food || basin.eatenAt === undefined) return;
  if (!inPaddock(basin.x, basin.y) && !inReachZone(basin.x, basin.y)) return;
  if (state.t - basin.eatenAt < BALANCE.food.basinCrushAfter) return;
  if (!chance(state, BALANCE.food.basinCrushChance * dt)) return;
  state.items = state.items.filter((i) => i !== basin);
  state.stats.basinsLost++;
  emit(state, { kind: 'bad', text: 'Таз раздавлен: его не забрали после еды.', why: 'basinCrushed' });
}

// Тазы на стеллаже в кормовой: стоят на своих местах
export function basinsOnRack(state: State): Item[] {
  return state.items.filter((i) => i.kind === 'basin' && MAP.basinSpots.some((p) => d(i, p) <= 0.3));
}

export function freeBasinSpot(state: State): { x: number; y: number } | null {
  return MAP.basinSpots.find((p) => !state.items.some((i) => i.kind === 'basin' && d(i, p) <= 0.3)) ?? null;
}

export function openBagNear(state: State, x: number, y: number): Item | undefined {
  return state.items
    .filter((i) => i.kind === 'bag' && (i.fill ?? 0) < I.bagCapacity && d(i, { x, y }) <= I.bagReach)
    .sort((a, b) => d(a, { x, y }) - d(b, { x, y }))[0];
}
