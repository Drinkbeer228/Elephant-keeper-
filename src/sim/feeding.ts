import { BALANCE } from '../data/balance';
import { MAP, nearStation } from '../data/map';
import { clockText } from './clock';
import { emit, hint } from './events';
import { wetAround } from './floor';
import { randomInt, randomRange } from './rng';
import { takeStock } from './stock';
import type { MealId, State, VegKind, VegSpot } from './types';

const F = BALANCE.food;
const S = BALANCE.schedule;

export const MEAL_LABELS: Record<MealId, string> = {
  kasha1: 'Каша 13:00',
  kasha2: 'Каша 17:00',
  dinner: 'Овощи 19:00',
};


export function mealTime(meal: MealId): number {
  return meal === 'kasha1' ? S.kasha1 : meal === 'kasha2' ? S.kasha2 : S.dinner;
}

function allServed(state: State, meal: MealId): boolean {
  return Object.values(state.meals[meal]).every((v) => v !== null);
}

// Какую кашу сейчас можно запаривать
export function kashaDue(state: State): MealId | null {
  for (const meal of ['kasha1', 'kasha2'] as const) {
    const at = mealTime(meal);
    if (allServed(state, meal)) continue;
    if (state.t >= at - F.kashaEarly && state.t <= at + F.kashaLateLimit) return meal;
  }
  return null;
}

export function startKasha(state: State): boolean {
  const meal = kashaDue(state);
  if (!meal || state.kitchen.kasha.status !== 'idle') return false;
  // Зерно расходуется на каждое запаривание; кончилось — прими поставку
  if (!takeStock(state, 'grain', BALANCE.consumption.kashaGrain)) {
    emit(state, { kind: 'info', text: `Зерна не хватает: нужно ${BALANCE.consumption.kashaGrain} мешка на кашу. Жди поставку.` });
    return false;
  }
  state.kitchen.kasha = { status: 'cooking', readyAt: state.t + F.kashaCook, portions: 0, meal };
  emit(state, { kind: 'info', text: `Каша запаривается, будет готова к ${clockText(state.t + F.kashaCook)}.` });
  return true;
}

const ELEPHANT_ORDER = ['pretty', 'margo', 'audrey', 'radja', 'baron', 'caesar'];

export function prepareMealBasins(state: State, food: 'kasha' | 'veg'): number {
  const portions = food === 'kasha' ? state.kitchen.kasha.portions : state.kitchen.veg.portions;
  const clean = state.items.filter(
    (item) =>
      item.kind === 'basin' &&
      !item.food &&
      !item.dirty &&
      MAP.basinSpots.some((spot) => Math.hypot(item.x - spot.x, item.y - spot.y) <= 0.3),
  );
  const count = Math.min(portions, clean.length, ELEPHANT_ORDER.length);
  const meal = food === 'kasha' ? state.kitchen.kasha.meal : 'dinner';
  clean.slice(0, count).forEach((basin, i) => Object.assign(basin, { food, meal, owner: ELEPHANT_ORDER[i] }));
  if (food === 'kasha') {
    state.kitchen.kasha.portions -= count;
    if (state.kitchen.kasha.portions === 0) state.kitchen.kasha = { status: 'idle', readyAt: 0, portions: 0, meal: null };
  } else state.kitchen.veg.portions -= count;
  return count;
}

export function allServedDinner(state: State): boolean {
  return allServed(state, 'dinner');
}

// Овощи для ужина: на доске три овоща — морковь, картофель, свёкла, у каждого 2–4 дефекта
export function startPrep(state: State): void {
  if (state.prep) {
    state.prep.open = true;
    return;
  }
  const kinds: VegKind[] = ['carrot', 'potato', 'beet'];
  state.prep = { pieces: kinds.map((k) => ({ kind: k, spots: vegSpots(state, k) })), index: 0, open: true };
}

function vegSpots(state: State, kind: VegKind): VegSpot[] {
  const spots: VegSpot[] = [];
  const at = (k: VegSpot['kind'], x: number, y: number) => spots.push({ kind: k, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, cut: false });
  // Случайная точка на теле овоща, не ближе 0.15 к уже отмеченным
  const free = (x0: number, x1: number, y0: number, y1: number): [number, number] => {
    let p: [number, number] = [x0, y0];
    for (let i = 0; i < 8; i++) {
      p = [randomRange(state, x0, x1), randomRange(state, y0, y1)];
      if (spots.every((s) => Math.hypot(s.x - p[0], s.y - p[1]) >= 0.15)) break;
    }
    return p;
  };
  if (kind === 'carrot') {
    at('top', 0.08, 0.5);
    at('tail', 0.94, 0.55);
    for (let i = randomInt(state, 0, 2); i > 0; i--) at('rot', ...free(0.3, 0.75, 0.4, 0.6));
  } else if (kind === 'beet') {
    at('top', 0.5, 0.1);
    at('tail', 0.5, 0.93);
    for (let i = randomInt(state, 0, 2); i > 0; i--) at('rot', ...free(0.32, 0.68, 0.38, 0.72));
  } else {
    for (let i = randomInt(state, 2, 3); i > 0; i--) at('eye', ...free(0.22, 0.78, 0.3, 0.7));
    for (let i = randomInt(state, 0, 1); i > 0; i--) at('rot', ...free(0.25, 0.75, 0.3, 0.7));
  }
  return spots;
}

const VEG_NAMES: Record<VegKind, string> = { carrot: 'Морковь', potato: 'Картофель', beet: 'Свёкла' };

// Срезать дефект на текущем овоще; последний срез — овощи почищены
export function cutSpot(state: State, spot: number): void {
  const prep = state.prep;
  if (!prep || !nearStation('kitchen', state.player.x, state.player.y, BALANCE.player.stationReach + 0.3)) return;
  const piece = prep.pieces[prep.index];
  const s = piece.spots[spot];
  if (!s || s.cut) return;
  s.cut = true;
  if (piece.spots.some((x) => !x.cut)) return;
  emit(state, { kind: 'good', text: `${VEG_NAMES[piece.kind]} почищена.` });
  prep.index++;
  if (prep.index < prep.pieces.length) return;
  state.prep = null;
  const basket = state.items.find((i) => i.kind === 'basket' && i.veg === 'washed');
  if (basket) basket.veg = 'peeled';
  emit(state, { kind: 'good', text: 'Овощи почищены — нарезай ужин.' });
}

export function updateKitchen(state: State, dt: number): void {
  const k = state.kitchen.kasha;
  if (k.status === 'cooking' && state.t >= k.readyAt) {
    k.status = 'ready';
    k.portions = 6;
    emit(state, { kind: 'good', text: 'Каша готова: разложи по тазам на стеллаже и разнеси по одному.' });
  }
  if (state.t >= S.kasha1 - 60) hint(state, 'kasha1', 'Скоро 13:00: каша запаривается 20 минут. Иди на кормовую.');
  if (state.t >= F.vegStartFrom) {
    hint(state, 'veg', 'С 14:00 — овощной ужин к 19:00: корзину к овощному стеллажу, на мойке замочить и промыть, у стола почистить и нарезать.');
  }

  if (state.valveOpen) {
    state.trough += F.troughFill * dt;
    if (state.trough >= 100) {
      state.trough = 100;
      if (state.t - state.lastOverflow >= F.troughOverflowEvery) {
        state.lastOverflow = state.t;
        wetAround(state, MAP.trough.x, MAP.trough.y + 0.8, 1.3);
        emit(state, { kind: 'bad', text: 'Поилка переливается — вода уходит в подстилку!', why: 'troughOverflow' });
      }
    }
  }
  if (state.valve2Open) state.trough2 = Math.min(100, state.trough2 + F.troughFill * dt);
}

export type MealStatus = 'ok' | 'late' | 'missed';

export function mealStatus(state: State, meal: MealId, elephantId: string): MealStatus {
  const servedAt = state.meals[meal][elephantId];
  const at = mealTime(meal);
  const limit = meal === 'dinner' ? F.dinnerLateLimit : F.kashaLateLimit;
  if (servedAt === null) return 'missed';
  if (servedAt <= at + F.lateOk) return 'ok';
  if (servedAt <= at + limit) return 'late';
  return 'missed';
}
