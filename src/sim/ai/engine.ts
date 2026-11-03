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

// Активный реестр подставляется извне (attachRegistry), а не импортируется:
// states.ts тянет engine (тип AiRegistry), engine не может тянуть states.ts
// обратно, а rules.ts тоже не тянет states.ts (он тянет elephantBehavior,
// который engine использует через AiBehavior). Цикл разорван по времени.
let activeRegistry: AiRegistry | null = null;

/** Вызывается один раз при загрузке elephants.ts (после полной инициации модулей). */
export function attachRegistry(r: AiRegistry): void {
  activeRegistry = r;
}

/** Активный реестр; undefined до attachRegistry — потребители пишутся через ?. */
export function getRegistry(): AiRegistry | undefined {
  return activeRegistry ?? undefined;
}

/** Контекст тика: state — это State симуляции, dt/dtReal — шаг текущего подшага. */
export interface TickCtx {
  state: unknown;
  /** Игровые минуты текущего подшага (state.aiDt). */
  dt: number;
  /** Реальные секунды текущего подшага (state.aiDtReal) — нужны для скорости шага walk. */
  dtReal: number;
}

/** Вызовы поведения делегируются в rules.ts (там живут ссылки на симуляцию). */
export interface AiBehavior {
  enter(state: unknown, e: Elephant, intent: Intent): void;
  tick(ctx: TickCtx, e: Elephant, def: AiStateDef): Intent | null;
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
 * Возвращает true, если состояние СМЕНИЛОСЬ (или цель — 'walk': её задаёт bridge),
 * false если переход остался внутри текущего узла ('self') — тогда узел продолжает
 * тикать в этом же подшаге. Так один шаг движка воспроизводит цепочки старых switch
 * (timer→decide→walkTo, arrive→decide и т.д.) без изменения порядка вызовов RNG.
 */
export function applyIntent(
  registry: AiRegistry,
  behavior: AiBehavior,
  state: unknown,
  e: Elephant,
  intent: Intent,
  now: number,
): boolean {
  if (intent.target === 'self') return false; // узел сам обновил таймеры — остаёмся в нём
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
    // Цели walk задаёт rules/bridge (там же, где раньше был walkTo); engine только помечает занятие
    e.next = intent.next ?? 'idle';
  } else {
    e.next = 'idle';
  }
  if (intent.timer !== undefined) e.timer = intent.timer;

  behavior.enter(state, e, intent);
  const toDef = defs[target];
  if (toDef?.enter) toDef.enter(ctxFor(e));
  return true;
}

/**
 * Один подшаг слона через движок: tick узла (delegate в rules), при отсутствии
 * намерения — явные transitions, затем fallback по истечении timer. Если переход
 * сменил состояние, новый узел тут же тикает в этом же подшаге — ровно как старый
 * switch, где fall-through вёл себя как немедленный вход в новое состояние.
 * maxSteps — страховка от бесконечных self-петель (в старом коде таких нет).
 */
export function stepElephant(
  registry: AiRegistry,
  behavior: AiBehavior,
  ctx: TickCtx,
  e: Elephant,
  now: number,
  maxSteps = 8,
): void {
  for (let i = 0; i < maxSteps; i++) {
    const def = registry.defs[e.state];
    if (!def) return;
    let intent = def.tick ? behavior.tick(ctx, e, def) : null;
    if (!intent && def.transitions) {
      for (const tr of def.transitions) {
        if (tr.when(ctxFor(e))) {
          intent = typeof tr.to === 'function' ? tr.to() : tr.to;
          break;
        }
      }
    }
    if (!intent && def.fallback && e.timer <= 0) intent = def.fallback();
    if (!intent) return; // остались в состоянии до следующего подшага
    if (!applyIntent(registry, behavior, ctx.state, e, intent, now)) return; // self — узел уже всё сделал
  }
}

/** Совместимость со старым вызовом: одиночный проход без chain-повтора. */
export function stepState(
  registry: AiRegistry,
  behavior: AiBehavior,
  state: unknown,
  e: Elephant,
  now: number,
): Intent | null {
  const def = registry.defs[e.state];
  if (!def) return null;
  let intent = def.tick
    ? behavior.tick({ state, dt: (state as { aiDt?: number }).aiDt ?? 0, dtReal: (state as { aiDtReal?: number }).aiDtReal ?? 0 }, e, def)
    : null;
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
