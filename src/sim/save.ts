import type { CellKind, ElephantState, Item, PartnerMode, Phase, State } from './types';

// ============================================================================
// Save/Load — ядро сериализации смены (спека docs/specs/2026-11-04-save-load.md).
// Модуль работает только с данными: ничего не знает про localStorage и карту.
// Слой приложения передаёт контекст ({ mapId, cols, rows }) и сам решает,
// где хранить строку сейва.
// ============================================================================

export const SCHEMA_VERSION = 1;

// Идентификаторы карт (значение для header сейва; берётся из data/map в слое приложения)
export const MAP_IDS = { modern: 'modern', legacy: 'legacy' } as const;

export type SaveRejectReason =
  | 'malformed' // не JSON / не объект / нет обязательных полей верхнего уровня
  | 'newer-version' // schemaVersion больше текущего — сейв из будущей сборки
  | 'old-version' // schemaVersion меньше, миграции нет
  | 'wrong-map' // сейв снят на другой карте
  | 'size-mismatch' // размер сетки не совпал с текущей картой
  | 'corrupt-state'; // тело state не проходит структурную проверку

export interface SaveFile {
  schemaVersion: number;
  mapId: string;
  floor: { cols: number; rows: number };
  savedAt: number; // unix ms
  nonFinite?: Record<string, number>; // числа вне JSON (Infinity) по путям вида 'state.musthNextAt'
  state: State;
}

export interface LoadContext {
  mapId: string;
  cols: number;
  rows: number;
}

export type LoadResult = { ok: true; state: State; file: SaveFile } | { ok: false; reason: SaveRejectReason; detail?: string };

// ----------------------------------------------------------------------------
// Миграции схемы. При bump SCHEMA_VERSION сюда добавляется запись v -> v+1:
// migrations[2] поднимает файл версии 2 до 3. Нет цепочки — сейв отвергается
// как 'old-version', а не чинится молча.
// ----------------------------------------------------------------------------
type Migration = (file: Record<string, unknown>) => Record<string, unknown>;
const migrations: Record<number, Migration> = {};

/** Поднять файл от его версии до SCHEMA_VERSION; null — цепочек миграций нет. */
export function applyMigrations(raw: Record<string, unknown>): Record<string, unknown> | null {
  let version = raw.schemaVersion as number;
  let doc = raw;
  while (version < SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (!migrate) return null;
    doc = migrate(doc);
    version += 1;
  }
  if (version !== SCHEMA_VERSION) return null;
  return doc;
}

// ----------------------------------------------------------------------------
// Запись
// ----------------------------------------------------------------------------

/**
 * Числа вне JSON (Infinity → null) и id предмета в руках.
 * Пишутся в sidecar-карту nonFinite: при загрузке значения возвращаются по путям,
 * а held перебиндится на элемент items[] по этому id (копия held после stringify
 * не содержит undefined-полей вроде nested — deepEqual без sidecar не сошёлся бы).
 */
export function nonFiniteNumbers(state: State): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Number.isFinite(state.musthNextAt)) out['state.musthNextAt'] = state.musthNextAt;
  for (const tire of state.tires) {
    if (!Number.isFinite(tire.cooldown)) out[`state.tires.${tire.id}.cooldown`] = tire.cooldown;
  }
  if (state.player.held) out['state.player.held.id'] = state.player.held.id;
  return out;
}

/** Снимок состояния в JSON-строку. mapId и размеры сетки пишутся в header. */
export function serializeSave(state: State, mapId: string, floor: { cols: number; rows: number }, savedAt = Date.now()): string {
  const file: SaveFile = {
    schemaVersion: SCHEMA_VERSION,
    mapId,
    floor: { cols: floor.cols, rows: floor.rows },
    savedAt,
    nonFinite: nonFiniteNumbers(state),
    state,
  };
  return JSON.stringify(file);
}

/**
 * Проверить состояние на сериализуемость ДО записи (в UI вызывается перед save):
 * циклы или битые значения должны дать отказ, а не исключение из JSON.stringify.
 */
export function isStateSerializable(state: State): boolean {
  try {
    JSON.stringify({ ok: true, state });
    return true;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------
// Чтение
// ----------------------------------------------------------------------------

/** Только разбор строки: валидность содержимого проверяет loadStateFromSave. */
export function parseSave(json: string): { ok: true; raw: Record<string, unknown> } | { ok: false; reason: SaveRejectReason; detail?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, reason: 'malformed', detail: e instanceof Error ? e.message : 'не JSON' };
  }
  if (!isRecord(parsed)) return { ok: false, reason: 'malformed', detail: 'корень не объект' };
  return { ok: true, raw: parsed };
}

/** Полный путь загрузки: парсинг → версия → карта → валидация → восстановление runtime-деталей. */
export function loadStateFromSave(json: string, ctx: LoadContext): LoadResult {
  const parsed = parseSave(json);
  if (!parsed.ok) return parsed;
  const { raw } = parsed;

  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isFinite(version) || version <= 0) {
    return { ok: false, reason: 'malformed', detail: 'нет корректного schemaVersion' };
  }
  if (version > SCHEMA_VERSION) return { ok: false, reason: 'newer-version', detail: `сейв v${version}, сборка поддерживает v${SCHEMA_VERSION}` };
  if (version < SCHEMA_VERSION) {
    const migrated = applyMigrations(raw);
    if (!migrated) return { ok: false, reason: 'old-version', detail: `миграции v${version}→v${SCHEMA_VERSION} нет` };
    return finishLoad(migrated, ctx);
  }
  return finishLoad(raw, ctx);
}

function finishLoad(raw: Record<string, unknown>, ctx: LoadContext): LoadResult {
  const mapId = raw.mapId;
  if (typeof mapId !== 'string' || mapId.length === 0) return { ok: false, reason: 'malformed', detail: 'нет mapId' };
  if (mapId !== ctx.mapId) return { ok: false, reason: 'wrong-map', detail: `сейв с карты «${mapId}», загружена «${ctx.mapId}»` };

  const floor = raw.floor;
  if (!isRecord(floor) || typeof floor.cols !== 'number' || typeof floor.rows !== 'number') {
    return { ok: false, reason: 'malformed', detail: 'нет header размера сетки' };
  }
  if (floor.cols !== ctx.cols || floor.rows !== ctx.rows) {
    return { ok: false, reason: 'size-mismatch', detail: `сейв ${floor.cols}×${floor.rows}, карта ${ctx.cols}×${ctx.rows}` };
  }

  if (!isValidSaveFile(raw)) return { ok: false, reason: 'corrupt-state', detail: structuralError(raw) };

  // Структурно файл наш. Восстанавливаем то, что JSON не переносит:
  const doc = raw as Record<string, unknown>;
  const state = doc.state as State;
  reviveNonFinite(doc, state);
  stripUndefined(state); // в оригинале поля могут лежать со значением undefined — JSON их теряет
  return { ok: true, state, file: doc as unknown as SaveFile };
}

// JSON выбрасывает пары с undefined. Чтобы round-trip давал deepEqual с живым состоянием,
// приводим те же ключи к undefined (ключ остаётся, значение отсутствует — семантика та же).
function stripUndefined(value: unknown, seen = new Set<unknown>()): void {
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) stripUndefined(item, seen);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    if (item === null && !(key in NON_NULLABLE)) {
      // null мог прийти из sidecar-восстановления (Infinity) — не трогать
    }
    if (item === undefined) delete record[key]; // на всякий случай: парсер такое не создаёт
    else stripUndefined(item, seen);
  }
}
const NON_NULLABLE: Record<string, true> = { nonFinite: true };

// Возврат значений из sidecar-карты nonFinite по путям 'a.b' (Infinity) и перебиндинг held.
// Пути вида 'state.tires.female.cooldown' спускаются через массивы по совпадению поля id.
function reviveNonFinite(doc: Record<string, unknown>, state: State): void {
  const map = doc.nonFinite;
  if (!isRecord(map)) return;
  for (const [path, value] of Object.entries(map)) {
    if (typeof value !== 'number') continue;
    if (path === 'state.player.held.id') continue; // обрабатывается ниже
    setPath(doc, path.split('.'), value);
  }

  // held игрока в State — ссылка на элемент items[] (drop() сравнивает по идентичности).
  // JSON превращает ссылку в копию: id берём из sidecar (копия held теряет undefined-поля вроде
  // nested/liters), найденный предмет дополняем значениями копии и кладём в руки по ссылке.
  const held = state.player.held;
  if (!held) return;
  const heldIdValue = map['state.player.held.id'];
  const id = typeof heldIdValue === 'number' ? heldIdValue : held.id;
  const found = state.items.find((i) => i.id === id);
  if (found) {
    // Object.assign копирует только перечислимые ключи самой копии — «мёртвые» поля найденного
    // предмета (например, liter у поставленной на место вазы) нужно сначала сбросить
    for (const key of Object.keys(found)) delete (found as unknown as Record<string, unknown>)[key];
    Object.assign(found, held);
    state.player.held = found;
  } else {
    state.player.held = null;
  }
}

/** Спуск по пути: объекты — по имени поля, массивы — по совпадению element.id === сегмент. */
function setPath(doc: Record<string, unknown>, parts: string[], value: number): void {
  let holder: unknown = doc;
  for (let i = 0; i < parts.length - 1 && holder != null; i++) {
    holder = descend(holder, parts[i]);
  }
  const last = parts[parts.length - 1];
  if (isRecord(holder)) (holder as Record<string, unknown>)[last] = value;
}

function descend(container: unknown, segment: string): unknown {
  if (Array.isArray(container)) return container.find((el) => isRecord(el) && String(el.id) === segment);
  if (isRecord(container)) return (container as Record<string, unknown>)[segment];
  return undefined;
}

// ----------------------------------------------------------------------------
// Структурная проверка (§3 спеки). Проверяем минимум, без которого игра падает;
// за полноту схемы отвечают schemaVersion + миграции.
// ----------------------------------------------------------------------------

const CELL_KINDS: readonly string[] = ['straw', 'wet', 'bareWet', 'sawdust', 'bare', 'dung', 'grass', 'puddle'];
const ELEPHANT_STATES: readonly string[] = [
  'idle', 'walk', 'eatHay', 'eatBasin', 'drink', 'signal', 'peeing', 'walkCommand', 'sleep', 'sway', 'reach', 'bathe', 'scratch', 'play',
];
const PARTNER_MODES: readonly string[] = [
  '', 'idle', 'toilet', 'basinPick', 'basinCarry', 'basinCollect', 'basinWash', 'basinReturn', 'supplyPick', 'supplyCarry', 'dumpBucket',
  'mealPrep', 'mealCook', 'dung', 'fork', 'sawdust', 'broom', 'straw', 'hayTake', 'hayCarry', 'valve', 'dumpWaste', 'recovering', 'flee',
];
const PHASES: readonly string[] = ['shift', 'report'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

let lastStructuralError = '';
function fail(msg: string): false {
  lastStructuralError = msg;
  return false;
}
/** Сообщение о последней причине отказа isValidSaveFile (для detail в LoadResult). */
export function structuralError(_raw?: unknown): string {
  return lastStructuralError;
}

export function isValidSaveFile(v: unknown): v is SaveFile {
  if (!isRecord(v)) return fail('корень не объект');
  if (!isNum(v.schemaVersion) || !isStr(v.mapId) || !isNum(v.savedAt)) return fail('битый header');
  if (!isRecord(v.floor)) return fail('нет floor');
  if (!isRecord(v.state)) return fail('нет state');
  const s = v.state;
  if (!isNum(s.seed) || !isNum(s.rng) || !isNum(s.t) || !isNum(s.nextItemId)) return fail('state: битые счётчики');
  if (!PHASES.includes(String(s.phase))) return fail('state: неизвестная фаза');
  if (!Array.isArray(s.cells) || s.cells.length === 0) return fail('state: нет сетки');
  for (const row of s.cells as unknown[]) {
    if (!Array.isArray(row)) return fail('state: строка сетки не массив');
    for (const cell of row as unknown[]) {
      if (!isRecord(cell) || !CELL_KINDS.includes(String(cell.kind)) || !isNum(cell.since)) return fail('state: битая клетка');
    }
  }
  if (!Array.isArray(s.elephants) || s.elephants.length === 0) return fail('state: нет слонов');
  for (const e of s.elephants as unknown[]) {
    if (!isRecord(e) || !isStr(e.id) || !isNum(e.x) || !isNum(e.y) || !ELEPHANT_STATES.includes(String(e.state)) || !isRecord(e.tally)) {
      return fail(`state: битый слон ${isRecord(e) ? String(e.id) : '?'}`);
    }
  }
  if (!isRecord(s.player)) return fail('state: нет игрока');
  const p = s.player as Record<string, unknown>;
  if (!isNum(p.x) || !isNum(p.y)) return fail('state: игрок без координат');
  if (p.held !== null && !(isRecord(p.held) && isNum(p.held.id) && isStr(p.held.kind) && isNum(p.held.x) && isNum(p.held.y))) {
    return fail('state: битый предмет в руках');
  }
  if (!isRecord(s.partner) || !PARTNER_MODES.includes(String((s.partner as Record<string, unknown>).mode))) return fail('state: неизвестный режим напарника');
  if (!Array.isArray(s.items)) return fail('state: нет предметов');
  for (const it of s.items as unknown[]) {
    if (!isRecord(it) || !isNum(it.id) || !isStr(it.kind) || !isNum(it.x) || !isNum(it.y)) return fail('state: битый предмет');
  }
  if (!Array.isArray(s.log)) return fail('state: нет журнала');
  for (const ev of s.log as unknown[]) {
    if (!isRecord(ev) || !isStr(ev.kind) || !isStr(ev.text)) return fail('state: битая запись журнала');
  }
  return true;
}

// Type-only реэкспорт удобен потребителям UI (hud/main), чтобы не тянуть types напрямую
export type { Item, PartnerMode, Phase, CellKind, ElephantState };
