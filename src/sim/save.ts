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
 * Снимок состояния в JSON-строку. mapId и размеры сетки пишутся в header.
 * Формат — честный JSON.stringify(State): пары с undefined JSON отбрасывает сам,
 * на загрузке отсутствующие поля остаются undefined — round-trip точен без нормализаций.
 * Infinity/NaN уходят в sidecar nonFinite по путям (в JSON это null).
 */
export function serializeSave(state: State, mapId: string, floor: { cols: number; rows: number }, savedAt = Date.now()): string {
  const nonFinite: Record<string, number> = {};
  const stateCopy = canonicalizeForJson(state as unknown as Record<string, unknown>, 'state', nonFinite) as State;
  // Infinity/NaN не проходят JSON.stringify (превращаются в null на месте значения),
  // поэтому sidecar кодируем строками; при загрузке reviveNumbers вернёт числа.
  const encodedNonFinite: Record<string, string> = {};
  for (const [path, value] of Object.entries(nonFinite)) encodedNonFinite[path] = String(value);
  const file: SaveFile = {
    schemaVersion: SCHEMA_VERSION,
    mapId,
    floor: { cols: floor.cols, rows: floor.rows },
    savedAt,
    ...(Object.keys(nonFinite).length > 0 ? { nonFinite: encodedNonFinite as unknown as Record<string, number> } : {}),
    state: stateCopy,
  };
  return JSON.stringify(file);
}

// Копия для записи: undefined сохраняется явно как null, Infinity -> null
// с записью пути в sidecar. На загрузке null-заполнители undefined-полей остаются
// null — это эквивалентная живому семантика, и повторный save даёт ту же строку
// (null -> canonicalize -> null), поэтому посимвольные сверки round-trip стабильны.
function canonicalizeForJson(value: unknown, path: string, nonFinite: Record<string, number>): unknown {
  if (value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      nonFinite[path] = value;
      return null;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, i) => canonicalizeForJson(item, `${path}.${i}`, nonFinite));
  }
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    // Порядок ключей приводим к каноническому (лексикографически): живой State после
    // setPath-восстановления может иметь «освежённые» ключи в конце объекта, а JSON.parse
    // сохраняет порядок записи. Сортировка делает формат независимым от порядка вставки,
    // и повторный save всегда побайтово совпадает с первым.
    for (const key of Object.keys(src).sort()) {
      out[key] = canonicalizeForJson(src[key], `${path}.${key}`, nonFinite);
    }
    return out;
  }
  return value;
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

  // Восстанавливаем то, что формат не переносит (до структурной проверки:
  // musthNextAt в валидаторе обязан быть числом, а Infinity в JSON лежит как null):
  // Infinity из sidecar по путям, null-заполнители undefined-полей остаются null —
  // они эквивалентны живой семантике и одинаково сериализуются повторным save.
  const doc = raw as Record<string, unknown>;
  const state = doc.state as State;
  const nonFinite = isRecord(doc.nonFinite) ? (doc.nonFinite as Record<string, number>) : undefined;
  reviveNumbers(nonFinite, state);

  if (!isValidSaveFile(raw)) return { ok: false, reason: 'corrupt-state', detail: structuralError(raw) };

  // Валидатор требует savedAt > 0; миграции/ручные сейвы могут принести заглушку —
  // нормализуем на выходе, чтобы header соответствовал фактическому моменту загрузки.
  const file = doc as unknown as SaveFile;
  if (!isNum(file.savedAt) || file.savedAt <= 0) file.savedAt = Date.now();
  return { ok: true, state, file };
}

// Возврат чисел вне JSON из sidecar-карты по путям 'state.a.b' (Infinity).
// Сегмент 'state' отбрасывается; пути вроде 'state.tires.female.cooldown' спускаются
// через массивы по совпадению element.id === сегмент ('female').
// Значения в sidecar лежат строками ('Infinity', '-Infinity', 'NaN' или обычное число),
// т.к. JSON.stringify не переносит не-конечные числа как числа.
function reviveNumbers(map: Record<string, number> | undefined, state: State): void {
  if (!map) return;
  for (const [path, raw] of Object.entries(map)) {
    const value = typeof raw === 'number' ? raw : parseNonFinite(String(raw));
    if (value === undefined) continue;
    const parts = path.split('.');
    if (parts[0] === 'state') parts.shift();
    setPath(state as unknown as Record<string, unknown>, parts, value);
  }

  // held игрока в State — ссылка на элемент items[] (drop() сравнивает по идентичности).
  // JSON превращает ссылку в копию: ищем предмет по id и подменяем ссылку. Копия held
  // содержит ровно те же перечислимые поля, что и живой предмет (undefined-ключи с
  // обеих сторон отброшены форматом одинаково), поэтому deepEqual не ломается.
  const held = state.player.held;
  if (!held) return;
  const found = state.items.find((i) => i.id === held.id);
  if (found) {
    state.player.held = found;
  } else {
    // Фоллбэк: предмета нет в items[] (в живом состоянии так быть не может — held
    // исключён из массива только во время переноски, а при drop возвращается).
    // Оставляем копию как есть — повторный save даёт ту же строку.
  }
}

/** Строка из sidecar -> число вне JSON; undefined, если распознать нельзя. */
function parseNonFinite(s: string): number | undefined {
  if (s === 'Infinity') return Number.POSITIVE_INFINITY;
  if (s === '-Infinity') return Number.NEGATIVE_INFINITY;
  if (s === 'NaN') return Number.NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
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
// Поля-таймеры, где живое значение может быть Infinity («никогда») — после revive
// sidecar такие числа возвращаются в state, валидатор обязан их пропускать.
function isTime(v: unknown): v is number {
  return typeof v === 'number';
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
  if (!isTime(s.musthNextAt)) return fail('state: musthNextAt не число');
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
