// ============================================================================
// Ядро FSM слонов: реестр узлов, диспетчер переходов, учёт переходов (fsm-метаданные).
// Инкремент 2: движок оборачивает существующее поведение 1-в-1 — тайминги и
// последовательность вызовов RNG не меняются. Golden-тест (tests/fsm.test.ts)
// сверяет путь состояний до/после перехода на движок.
// ============================================================================

import type { Elephant, ElephantState } from '../types';
import type { AiCtx, AiStateDef, Intent } from './types';

/** Гистерезис прерываний: новый кандидат должен быть строго лучше текущего на эту величину. */
export const INTERRUPT_HYSTERESIS = 10;

/** Минимальная привязка для interrupt='finish', если сам узел её не задал (минут). */
export const DEFAULT_MIN_COMMIT = 3;

/**
 * Реестр узлов. Имена 14 состояний совпадают с ELEPHANT_STATES в save.ts —
 * любое новое имя обязано попасть и туда, иначе load выдаст 'corrupt-state'.
 */
export interface AiRegistry {
  defs: Record<ElephantState, AiStateDef>;
}

/** Вызовы поведения делегируются в rules.ts (там живут ссылки на симуляцию). */
export interface AiBehavior {
  enter(state: unknown, e: Elephant, intent: Intent): void;
  tick(state: unknown, e: Elephant, def: AiStateDef): Intent | null;
}

export function ensureFsm(e: Elephant): NonNullable<Elephant['fsm']> {
  if (!e.fsm) e.fsm = { since: 0, last: '', transitions: 0 };
  return e.fsm;
}

function currentPriority(defs: Record<ElephantState, AiStateDef>, e: Elephant): number {
  const fsm = ensureFsm(e);
  if (fsm.currentPriority !== undefined) return fsm.currentPriority;
  return defs[e.state]?.priority ?? 0;
}

/** Можно ли прервать текущее состояние ради кандиданта priority. */
export function canInterrupt(defs: Record<ElephantState, AiStateDef>, e: Elephant, t: number, priority: number): boolean {
  const def = defs[e.state];
  if (!def) return true;
  if (def.interrupt === 'none') return false;
  if (priority <= currentPriority(defs, e) + INTERRUPT_HYSTERESIS) return false;
  if (def.interrupt === 'finish') {
    const fsm = ensureFsm(e);
    if (fsm.committedUntil !== undefined && t < fsm.committedUntil) return false;
  }
  return true;
}

/**
 * Применить намерение: exit старого узла → смена состояния → цели/next → enter нового узла.
 * now — игровое время для учёта fsm.since/committedUntil.
 */
export function applyIntent(
  registry: AiRegistry,
  behavior: AiBehavior,
  state: unknown,
  e: Elephant,
  intent: Intent,
  now: number,
): void {
  const defs = registry.defs;
  const from = e.state;
  const fromDef = defs[from];
  if (fromDef?.exit) fromDef.exit(ctxFor(e));

  const target = intent.target;
  const fsm = ensureFsm(e);
  fsm.last = from;
  fsm.transitions += 1;
  fsm.since = now;
  fsm.currentPriority = intent.priority ?? defs[target]?.priority ?? 0;
  const targetDef = defs[target];
  fsm.committedUntil =
    targetDef?.interrupt === 'finish' ? now + (intent.minCommit ?? DEFAULT_MIN_COMMIT) : undefined;

  e.state = target;
  if (target === 'walk') {
    // Цели walk задаёт rules (там же, где раньше был walkTo); engine только помечает занятие
    e.next = intent.next ?? 'idle';
  } else {
    e.next = 'idle';
  }
  if (intent.timer !== undefined) e.timer = intent.timer;

  behavior.enter(state, e, intent);
  const toDef = defs[target];
  if (toDef?.enter) toDef.enter(ctxFor(e));
}

/**
 * Тик состояния через движок: поведение узла (delegate в rules), затем
 * явные transitions, затем fallback по истечении timer. Возвращает применённый
 * переход или null (остались в состоянии).
 */
export function stepState(
  registry: AiRegistry,
  behavior: AiBehavior,
  state: unknown,
  e: Elephant,
  now: number,
): Intent | null {
  const def = registry.defs[e.state];
  if (!def) return null;
  let intent = def.tick ? behavior.tick(state, e, def) : null;
  if (!intent && def.transitions) {
    for (const tr of def.transitions) {
      if (tr.when(ctxFor(e))) {
        intent = typeof tr.to === 'function' ? tr.to() : tr.to;
        break;
      }
    }
  }
  if (!intent && def.fallback && e.timer <= 0) intent = def.fallback();
  if (intent) applyIntent(registry, behavior, state, e, intent, now);
  return intent;
}

function ctxFor(e: Elephant): AiCtx {
  return { elephantId: e.id };
}
