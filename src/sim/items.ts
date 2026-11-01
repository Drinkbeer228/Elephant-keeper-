import { BALANCE } from '../data/balance';
import { MAP, inBedding, inReachZone } from '../data/map';
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
  return state.items.filter((i) => i.kind !== 'basin' && (inBedding(i.x, i.y) || inReachZone(i.x, i.y)));
}

function inUse(state: State, item: Item): boolean {
  // Бак, под которым сейчас кто-то писает, не трогают
  return (
    item.kind === 'bucket' &&
    state.elephants.some((e) => e.signalStarted !== undefined && d(e, item) <= BALANCE.elephant.bucketRadius)
  );
}

export function updateItems(state: State, dt: number): void {
  const reachFactor = state.fenceOn ? 1 : I.fenceOffReachFactor;
  for (const item of [...state.items]) {
    if (item.kind === 'basin') {
      updateBasin(state, item, dt);
      continue;
    }
    if (!inBedding(item.x, item.y) && !inReachZone(item.x, item.y)) continue;
    if (state.t - item.droppedAt < I.breakGrace || inUse(state, item)) continue;
    const near = state.elephants
      .filter((e) => e.state !== 'sleep' && d(e, item) <= I.reachDistance * (inBedding(item.x, item.y) ? 1 : reachFactor))
      .sort((a, b) => d(a, item) - d(b, item))[0];
    if (!near) continue;
    const focus = near.state === 'reach' && near.targetItem === item.id ? 5 : 1;
    const p = I.breakBase * (1 - near.trust / 100) * (0.5 + near.boredom / 200) * focus * (state.fenceOn ? 1 : 2);
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
  if (!inBedding(basin.x, basin.y) && !inReachZone(basin.x, basin.y)) return;
  if (state.t - basin.eatenAt < BALANCE.food.basinCrushAfter) return;
  if (!chance(state, BALANCE.food.basinCrushChance * dt)) return;
  state.items = state.items.filter((i) => i !== basin);
  state.stats.basinsLost++;
  emit(state, { kind: 'bad', text: 'Таз раздавлен: его не забрали после еды.', why: 'basinCrushed' });
}

export function openBagNear(state: State, x: number, y: number): Item | undefined {
  return state.items
    .filter((i) => i.kind === 'bag' && (i.fill ?? 0) < I.bagCapacity && d(i, { x, y }) <= 3)
    .sort((a, b) => d(a, { x, y }) - d(b, { x, y }))[0];
}
