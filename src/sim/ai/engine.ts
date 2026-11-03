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
 * Цель 'self' — служебная: узел сам выполнил работу (старый кейс switch уже изменил
 * e.state/e.timer напрямую или остался в себе). Здесь ведётся только учёт fsm-метаданных:
 * если узел сменился — last/transitions/since/priority/commit пересчитываются, если
 * остался — since не двигается. Ничего из этого не читается симуляцией в инкременте 2,
 * поэтому golden-прогон побитово совпадает со старым switch.
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
  const fsm = ensureFsm(e);

  if (intent.target === 'self') {
    // Делегат уже всё сделал ДО вызова applyIntent (from устарел): сверяем
    // фактическое состояние с pendingFrom, который stepElephant выставил до тика.
    const prev = fsm.pendingFrom ?? from;
    fsm.pendingFrom = undefined;
    if (e.state !== prev) {
      fsm.last = prev;
      fsm.transitions += 1;
      fsm.since = now;
      fsm.currentPriority = defs[e.state]?.priority ?? 0;
      const d = defs[e.state];
      fsm.committedUntil = d?.interrupt === 'finish' ? now + (intent.minCommit ?? DEFAULT_MIN_COMMIT) : undefined;
    }
    return;
  }

  const fromDef = defs[from];
  if (fromDef?.exit) fromDef.exit(ctxFor(e));

  const target = intent.target;
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
}

/** Глубина цепочки переходов внутри одного подшага: сменил состояние → сразу
 * делается первый шаг в новом (старая семантика switch). Дальше — нельзя:
 * жёсткий лимит исключает и расхождение с эталоном, и бесконечные циклы. */
const MAX_TRANSITION_DEPTH = 2;

/**
 * Один подшаг слона через движок: tick узла (delegate в rules), при отсутствии
 * намерения — явные transitions, затем fallback по истечении timer.
 *
 * Контракт переходов — bounded chain (глубина ≤ MAX_TRANSITION_DEPTH): если тик
 * или переход сменил состояние, новый узел тут же получает свой первый шаг в этом
 * же подшаге — ровно как старый switch, где timer→decide→walkTo происходил одним
 * махом. Цепочка короче лимита не отличается от одиночного прохода, длиннее —
 * невозможна: после второго перехода подшаг завершается. Проверка tests/fsm.test.ts.
 * transitions/fallback остаются доступными для декларативных узлов будущих
 * инкрементов (ассессмент, прерывания) — сейчас реестр их не объявляет.
 */
export function stepElephant(
  registry: AiRegistry,
  behavior: AiBehavior,
  ctx: TickCtx,
  e: Elephant,
  now: number,
): void {
  for (let depth = 0; depth < MAX_TRANSITION_DEPTH; depth++) {
    const def = registry.defs[e.state];
    if (!def) return;
    const fsm = ensureFsm(e);
    const prevState = e.state;
    fsm.pendingFrom = prevState; // чтобы ветка 'self' увидела, менял ли делегат состояние
    const intent = def.tick ? behavior.tick(ctx, e, def) : null;
    if (intent) {
      applyIntent(registry, behavior, ctx.state, e, intent, now);
      // Служебный 'self' без смены состояния — подшаг закончен (как старый break).
      // Если узел не объявлен в реестре (внешний переход), chain не продолжается.
      if (e.state === prevState || !registry.defs[e.state]) return;
      continue; // bounded chain: новый узел делает первый шаг в этом же подшаге
    }
    // Ранний выход: если тик (или arrive внутри него) уже сменил состояние,
    // дальнейшие transitions/fallback этого тика применять нельзя — ровно как
    // в старом switch, где смена состояния прекращала выполнение ветки кейса.
    // Но сам переход даёт новому узлу первый шаг — в пределах глубины цепочки.
    if (e.state !== prevState) {
      fsm.pendingFrom = undefined;
      if (!registry.defs[e.state]) return;
      continue;
    }
    fsm.pendingFrom = undefined;
    if (def.transitions) {
      for (const tr of def.transitions) {
        if (tr.when(ctxFor(e))) {
          applyIntent(registry, behavior, ctx.state, e, typeof tr.to === 'function' ? tr.to() : tr.to, now);
          if (e.state === prevState || !registry.defs[e.state]) return;
          continue;
        }
      }
    }
    if (def.fallback && e.timer <= 0) {
      applyIntent(registry, behavior, ctx.state, e, def.fallback(), now);
      if (e.state === prevState || !registry.defs[e.state]) return;
      continue;
    }
    return; // состояние не изменилось — цепочка завершена
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
