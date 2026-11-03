// ============================================================================
// ИИ слонов: типы FSM и характеров (спека docs/specs/2026-11-04-elephant-fsm.md).
// Чистые данные и контракты — без импорта модулей симуляции, чтобы ядро движка
// не зависело от графа файлов (engine → rules → elephants — иначе цикл замыкается).
// ============================================================================

import type { ElephantState } from '../types';

/** Класс срочности намерения. Сравнение — по priority; класс — для правил прерывания. */
export type IntentClass = 'physiological' | 'danger' | 'care' | 'routine' | 'neutral';

/** Как текущее состояние относится к прерыванию более срочным намерением. */
export type InterruptMode =
  | 'now' // уступаем немедленно
  | 'finish' // доживём минимум до committedUntil, потом отпускаем
  | 'none'; // не прерывается из диспетчера вообще (внешние команды — исключение)

export interface AiCtx {
  elephantId: string;
}

/** Намерение перейти в состояние. target === 'walk' означает «идти к цели, потом next». */
export interface Intent {
  target: ElephantState;
  /** Куда идти, если target — 'walk'. */
  destination?: { x: number; y: number };
  /** Чем заняться по прибытии (e.next). */
  next?: ElephantState;
  /** Таймер узла в игровых минутах (для прямых переходов без ходьбы). */
  timer?: number;
  /** Минимальная привязка при interrupt='finish' (минут). */
  minCommit?: number;
  /** Приоритет перехода; по умолчанию — приоритет целевого узла. */
  priority?: number;
  /** Причина выбора — для aiVerbose-логов и дебага. */
  reason?: string;
}

/** Узел реестра: поведение + правила выхода. Данные, а не код веток. */
export interface AiStateDef {
  /** Класс срочности (для документации и правил прерывания). */
  cls: IntentClass;
  /** Приоритет узла; 0 — не является кандидатом на автопереход (ждёт события или decide). */
  priority: number;
  /** Политика прерываний для текущего пребывания в этом узле. */
  interrupt: InterruptMode;
  enter?(ctx: AiCtx): void;
  tick?(ctx: AiCtx): Intent | null;
  exit?(ctx: AiCtx): void;
  /** Явные переходы: проверяются после tick, по порядку записи. */
  transitions?: { when: (ctx: AiCtx) => boolean; to: Intent | (() => Intent) }[];
  /** Что делать, когда timer истёк и tick не вернул намерение. */
  fallback?: () => Intent;
}

/** Множители накопления потребностей (1 = базовый баланс). */
export interface TemperRates {
  hunger: number;
  thirst: number;
  bladder: number;
  bowel: number;
  boredom: number;
}

/** Пороги принятия решений (абсолютные значения шкал 0..100). */
export interface TemperThresholds {
  thirstGoDrink: number;
  hungerGoEat: number;
  hungerGoEatNight: number;
  boredomScratchChance: number;
  boredomPlayChance: number;
  boredomBatheChance: number;
  wanderChance: number;
}

/** Социальные параметры характера. */
export interface TemperSocial {
  playerNearBoredomMul: number; // во сколько раз усиливается скука от близости кипера
  swayBias: number; // смещение порога раскачивания (минус — раньше начинает)
  treatBoredomReliefMul: number; // эффективность лакомства из кармана (>1 — легче отпускает)
}

/**
 * Характер слона — чистые данные. Логика читает только числа,
 * сравнения имён архетипов в коде запрещены.
 */
export interface Temperament {
  id: string;
  name: string;
  rates: TemperRates;
  thresholds: TemperThresholds;
  social: TemperSocial;
}
