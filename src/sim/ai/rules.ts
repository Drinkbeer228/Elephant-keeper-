// ============================================================================
// Правила FSM слонов: tick-поведение узлов + характеры (Temperament).
// Инкремент 2 — перенос старого switch из elephants.ts в движок БЕЗ изменения
// таймингов и последовательности вызовов RNG. Поэтому переходы по прибытии
// (arrive) и по завершении занятия остаются «внешними»: тик-функции вызывают
// исходные функции elephants.ts напрямую, минуя applyIntent. Осознанный
// компромисс инкремента-рефакторинга: golden-тест сверяет путь состояний
// до/после побитово; ассессмент и прерывания подключаются в инкременте 4.
//
// Разрыв цикла импортов: rules НЕ импортирует states.ts (states тянет engine,
// engine через AiBehavior связан с rules). Активный реестр для диспетчера
// прерываний берётся из engine.getRegistry() — его подставляет elephants.ts
// через attachRegistry при загрузке модуля.
// ============================================================================

import type { ElephantProfile } from '../../data/elephants';
import type { Elephant, State } from '../types';
import type { AiBehavior, TickCtx } from './engine';
import { ensureFsm, getRegistry } from './engine';
import type { Intent, Temperament } from './types';

// ---------------------------------------------------------------------------
// Характеры — чистые данные. Логика читает только числа, сравнения имён
// архетипов запрещены. В инкременте 2 temperamentOf всегда возвращает
// NEUTRAL (множители = 1), чтобы рефакторинг не сдвинул ни одного броска RNG.
// Архетипы объявлены заранее и подключаются в инкременте 3 (id → архетип).
// ---------------------------------------------------------------------------

const neutralRates = { hunger: 1, thirst: 1, bladder: 1, bowel: 1, boredom: 1 };
const neutralThresholds = {
  thirstGoDrink: 60,
  hungerGoEat: 45,
  hungerGoEatNight: 70,
  boredomScratchChance: 0.25,
  boredomPlayChance: 0.18,
  boredomBatheChance: 0.3,
  wanderChance: 0.6,
};
const neutralSocial = { playerNearBoredomMul: 1, swayBias: 0, treatBoredomReliefMul: 1 };

export const TEMPERAMENTS: Record<string, Temperament> = {
  calm: {
    id: 'calm',
    name: 'Спокойный',
    rates: { ...neutralRates, boredom: 0.8 },
    thresholds: { ...neutralThresholds, wanderChance: 0.7 },
    social: { playerNearBoredomMul: 0.8, swayBias: 5, treatBoredomReliefMul: 1.2 },
  },
  capricious: {
    id: 'capricious',
    name: 'Капризный',
    rates: { ...neutralRates, boredom: 1.3 },
    thresholds: { ...neutralThresholds, hungerGoEat: 55, wanderChance: 0.45 },
    social: { playerNearBoredomMul: 1.3, swayBias: -10, treatBoredomReliefMul: 0.8 },
  },
  playful: {
    id: 'playful',
    name: 'Игривый',
    rates: { ...neutralRates, boredom: 1.2 },
    thresholds: { ...neutralThresholds, boredomPlayChance: 0.35, boredomBatheChance: 0.45 },
    social: { playerNearBoredomMul: 1.1, swayBias: -5, treatBoredomReliefMul: 1 },
  },
  dominant: {
    id: 'dominant',
    name: 'Доминантный',
    rates: { ...neutralRates, hunger: 1.1 },
    thresholds: { ...neutralThresholds, hungerGoEat: 35 },
    social: { playerNearBoredomMul: 1, swayBias: 10, treatBoredomReliefMul: 1 },
  },
  shy: {
    id: 'shy',
    name: 'Пугливый',
    rates: neutralRates,
    thresholds: { ...neutralThresholds, wanderChance: 0.5 },
    social: { playerNearBoredomMul: 1.4, swayBias: -8, treatBoredomReliefMul: 1.1 },
  },
  neutral: {
    id: 'neutral',
    name: 'Обычный',
    rates: neutralRates,
    thresholds: neutralThresholds,
    social: neutralSocial,
  },
};

/** Характер слона. Инкремент 2: всегда neutral — поведение побитово совпадает со старым. */
export function temperamentOf(_profile: ElephantProfile): Temperament {
  return TEMPERAMENTS.neutral;
}

// ---------------------------------------------------------------------------
// Мост в слой симуляции. elephants.ts регистрирует себя при загрузке — цикл
// rules ↔ elephants разорван по времени (tick вызывается уже после инициации
// обоих модулей), top-level импорт отсутствует.
// ---------------------------------------------------------------------------

export interface SimBridge {
  profileOf(e: Elephant): ElephantProfile;
  /** Возвращает true, если по прибытии сработал внешний переход (arrive сменил узел). */
  walkTick(s: State, e: Elephant, dtReal: number): boolean;
  signalTick(s: State, e: Elephant, dt: number): Intent | null; // общий для signal/walkCommand
  batheTick(s: State, e: Elephant, dt: number): Intent | null;
  scratchTick(s: State, e: Elephant, dt: number): Intent | null;
  playTick(s: State, e: Elephant, dt: number): Intent | null;
  eatHayTick(s: State, e: Elephant, dt: number): Intent | null;
  drinkTick(s: State, e: Elephant, dt: number): Intent | null;
  basinTick(s: State, e: Elephant, dt: number): Intent | null;
  sleepTick(s: State, e: Elephant, dt: number): Intent | null;
  idleTick(s: State, e: Elephant, dt: number): Intent | null; // старый default: timer→decide
  swayTick(s: State, e: Elephant, dt: number): Intent | null; // выход по скуке < 50 раньше timer
  arriveNow(s: State, e: Elephant): void; // внешний переход по e.next
}

let bridge: SimBridge | null = null;

/** Вызывается один раз при загрузке elephants.ts. */
export function registerSimBridge(b: SimBridge): void {
  bridge = b;
}

function B(): SimBridge {
  if (!bridge) throw new Error('ai/rules: SimBridge не зарегистрирован');
  return bridge;
}

type TickFn = (s: State, e: Elephant, dt: number) => Intent | null;

// Каждая tick-функция — исходный кейс старого switch из elephants.ts: та же
// арифметика таймеров, те же вызовы decide/pee/finishBasin в том же порядке.
// Возврат 'self' означает «узел сам обновил состояние/таймеры» — движок не
// применяет смену узла и завершает подшаг (см. engine.stepElephant).
const TICKS: Partial<Record<Elephant['state'], TickFn>> = {
  signal: (s, e, dt) => B().signalTick(s, e, dt),
  walkCommand: (s, e, dt) => B().signalTick(s, e, dt),
  bathe: (s, e, dt) => B().batheTick(s, e, dt),
  scratch: (s, e, dt) => B().scratchTick(s, e, dt),
  play: (s, e, dt) => B().playTick(s, e, dt),
  eatHay: (s, e, dt) => B().eatHayTick(s, e, dt),
  drink: (s, e, dt) => B().drinkTick(s, e, dt),
  eatBasin: (s, e, dt) => B().basinTick(s, e, dt),
  sleep: (s, e, dt) => B().sleepTick(s, e, dt),
  idle: (s, e, dt) => B().idleTick(s, e, dt), // старый default: timer→decide
  sway: (s, e, dt) => B().swayTick(s, e, dt), // выход по скуке < 50 раньше timer
  reach: (s, e, dt) => B().idleTick(s, e, dt), // old case 'reach': timer<=0 → decide
  peeing: (s, e, dt) => B().idleTick(s, e, dt),
};

export const elephantBehavior: AiBehavior = {
  // enter в инкременте 2 пустой: переходы делают всю работу через старые
  // функции (walkTo/arrive/pee/decide) — сохранена и последовательность RNG.
  enter(_state, _e, _intent) {},

  tick(ctx: TickCtx, e) {
    const s = ctx.state as State;
    if (e.state === 'walk') {
      // walkTick сам делает и движение, и arrive по прибытии. Если arrive
      // сменил узел — возвращаем 'self': движок учтёт переход (fsm.last/
      // transitions/since/priority/commit) и завершит подшаг, не перетикая
      // новый узел в том же подшаге — ровно как старый switch.
      return B().walkTick(s, e, ctx.dtReal) ? { target: 'self' } : null;
    }
    return TICKS[e.state]?.(s, e, ctx.dt) ?? null;
  },
};

// ---------------------------------------------------------------------------
// Диспетчер прерываний. В инкременте 2 объявлен и покрыт тестами, но к циклу
// updateOne НЕ подключён — кандидаты появятся вместе с ассессментом (инкр. 4).
// ---------------------------------------------------------------------------

export function intentPriority(intent: Intent): number {
  if (intent.priority !== undefined) return intent.priority;
  if (intent.target === 'self') return 0; // служебная цель вне реестра
  return getRegistry()?.defs[intent.target]?.priority ?? 0;
}

/**
 * Лучшее из намерений, допускаемое политикой прерываний текущего состояния.
 * Гистерезис: новичок обязан превысить текущий приоритет строго на величину
 * запаса — защита от дрожания на равных кандидатах.
 */
export function resolveTransition(candidates: Intent[], current: Elephant, t: number, hysteresis = 10): Intent | null {
  const registry = getRegistry();
  const def = registry?.defs[current.state];
  if (!def || def.interrupt === 'none') return null;
  const fsm = ensureFsm(current);
  if (def.interrupt === 'finish' && fsm.committedUntil !== undefined && t < fsm.committedUntil) return null;
  const cur = fsm.currentPriority ?? def.priority;
  let best: Intent | null = null;
  for (const c of candidates) {
    const p = intentPriority(c);
    if (p <= cur + hysteresis) continue;
    if (!best || p > intentPriority(best)) best = c;
  }
  return best;
}
