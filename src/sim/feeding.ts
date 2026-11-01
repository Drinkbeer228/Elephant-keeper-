import { BALANCE } from '../data/balance';
import { MAP } from '../data/map';
import { clockText } from './clock';
import { emit, hint } from './events';
import { wetAround } from './floor';
import type { MealId, State } from './types';

const F = BALANCE.food;
const S = BALANCE.schedule;

export const MEAL_LABELS: Record<MealId, string> = {
  kasha1: 'Каша 13:00',
  kasha2: 'Каша 17:00',
  dinner: 'Овощи 19:00',
};

export const VEG_STAGES = ['Замочить овощи', 'Взбить грязь щёткой', 'Промыть в корзинах', 'Откалибровать и нарезать', 'Собрать ужин по тазам'];

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
  state.kitchen.kasha = { status: 'cooking', readyAt: state.t + F.kashaCook, portions: 0, meal };
  emit(state, { kind: 'info', text: `Каша запаривается, будет готова к ${clockText(state.t + F.kashaCook)}.` });
  return true;
}

export function vegStageAvailable(state: State): boolean {
  const v = state.kitchen.veg;
  return v.stage < VEG_STAGES.length && state.t >= F.vegStartFrom && state.t >= v.nextAt && !allServed(state, 'dinner');
}

export function doVegStage(state: State): boolean {
  if (!vegStageAvailable(state)) return false;
  const v = state.kitchen.veg;
  const name = VEG_STAGES[v.stage];
  if (v.stage < F.vegWaits.length) {
    v.nextAt = state.t + F.vegWaits[v.stage];
    v.stage++;
    emit(state, { kind: 'info', text: `${name}: готово. Следующий этап с ${clockText(v.nextAt)}.` });
  } else {
    v.stage++;
    v.portions = 3;
    emit(state, { kind: 'good', text: 'Овощной ужин собран: три порции ждут тазов.' });
  }
  return true;
}

export function updateKitchen(state: State, dt: number): void {
  const k = state.kitchen.kasha;
  if (k.status === 'cooking' && state.t >= k.readyAt) {
    k.status = 'ready';
    k.portions = 3;
    emit(state, { kind: 'good', text: 'Каша готова: разнеси три таза по слотам.' });
  }
  if (state.t >= S.kasha1 - 60) hint(state, 'kasha1', 'Скоро 13:00: каша запаривается 20 минут. Иди на кормовую.');
  if (state.t >= F.vegStartFrom) hint(state, 'veg', 'С 14:00 можно начинать овощной ужин: пять этапов на кормовой, к 19:00.');

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
