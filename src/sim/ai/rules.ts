// ============================================================================
// Правила FSM слонов: tick-поведение узлов + характеры (Temperament).
// Инкремент 2 — перенос старого switch из elephants.ts в движок БЕЗ изменения
// таймингов и последовательности вызовов RNG. Поэтому переходы по прибытии
// (arrive) и по завершении занятия остаются «внешними»: тик-функции вызывают
// исходные функции elephants.ts напрямую, минуя applyIntent. Осознанный
// компромисс инкремента-рефакторинга: golden-тест сверяет путь состояний
// до/после побитово; ассессмент и прерывания подключаются в инкременте 4.
// ============================================================================

import type { ElephantProfile } from '../../data/elephants';
import type { Elephant, State } from '../types';
import type { AiBehavior } from './engine';
import { ensureFsm } from './engine';
import { ELEPHANT_AI_REGISTRY } from './states';
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
  walkTick(s: State, e: Elephant, dtReal: number): void;
  signalTick(s: State, e: Elephant, dt: number): void; // общий для signal/walkCommand
  batheTick(s: State, e: Elephant, dt: number): void;
  scratchTick(s: State, e: Elephant, dt: number): void;
  playTick(s: State, e: Elephant, dt: number): void;
  eatHayTick(s: State, e: Elephant, dt: number): void;
  drinkTick(s: State, e: Elephant, dt: number): void;
  basinTick(s: State, e: Elephant, dt: number): void;
  sleepTick(s: State, e: Elephant, dt: number): void;
  idleTick(s: State, e: Elephant, dt: number): void; // старый default: timer→decide
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

type TickFn = (s: State, e: Elephant, dt: number) => void;

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
  sway: (s, e, dt) => B().idleTick(s, e, dt),
  idle: (s, e, dt) => B().idleTick(s, e, dt),
  reach: (s, e, dt) => B().idleTick(s, e, dt),
  peeing: (s, e, dt) => B().idleTick(s, e, dt),
};

export const elephantBehavior: AiBehavior = {
  // enter в инкременте 2 пустой: переходы делают всю работу через старые
  // функции (walkTo/arrive/pee/decide) — сохранена и последовательность RNG.
  enter(_state, _e, _intent) {},

  tick(state, e) {
    const s = state as State;
    if (e.state === 'walk') {
      B().walkTick(s, e, s.aiDtReal ?? 0);
      // Прибытие — внешний переход по e.next (см. комментарий файла)
      if (Math.hypot(e.tx - e.x, e.ty - e.y) < 0.05) B().arriveNow(s, e);
      return null;
    }
    const dt = s.aiDt ?? 0;
    TICKS[e.state]?.(s, e, dt);
    return null;
  },
};

// ---------------------------------------------------------------------------
// Диспетчер прерываний. В инкременте 2 объявлен и покрыт тестами, но к циклу
// updateOne НЕ подключён — кандидаты появятся вместе с ассессментом (инкр. 4).
// ---------------------------------------------------------------------------

export function intentPriority(intent: Intent): number {
  return intent.priority ?? ELEPHANT_AI_REGISTRY.defs[intent.target]?.priority ?? 0;
}

/**
 * Лучшее из намерений, допускаемое политикой прерываний текущего состояния.
 * Гистерезис: новичок обязан превысить текущий приоритет строго на величину
 * запаса — защита от дрожания на равных кандидатах.
 */
export function resolveTransition(candidates: Intent[], current: Elephant, t: number, hysteresis = 10): Intent | null {
  const def = ELEPHANT_AI_REGISTRY.defs[current.state];
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
