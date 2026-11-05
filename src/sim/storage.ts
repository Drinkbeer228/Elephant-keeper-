// ============================================================================
// Хранилище сохранений (Save/Load инкременты 2 и 3 по docs/specs/2026-11-04-save-load.md).
// Изолированная обёртка над localStorage + метаданные слотов для UI и заставки.
// Не тянет Phaser или DOM-элементы; работает и в браузере, и в Node-тестах (с моком).
// ============================================================================

import { clockText, dayPart } from './clock';
import {
  loadStateFromSave,
  serializeSave,
  type LoadContext,
  type LoadResult,
  type SaveRejectReason,
} from './save';
import type { State } from './types';

export const AUTOSAVE_SLOT = 'autosave';
export const MANUAL_SLOTS = ['slot-1', 'slot-2', 'slot-3'] as const;
export type SaveSlotId = typeof AUTOSAVE_SLOT | (typeof MANUAL_SLOTS)[number];

const STORAGE_PREFIX = 'keeper-sim:save:';

export function storageKeyForSlot(slot: SaveSlotId, mapId?: string): string {
  return mapId ? `${STORAGE_PREFIX}${mapId}:${slot}` : `${STORAGE_PREFIX}${slot}`;
}

export const SAVE_REASON_LABELS: Record<SaveRejectReason, string> = {
  malformed: 'Файл сохранения повреждён или не является JSON.',
  'wrong-map': 'Сохранение сделано на другой карте комплекса.',
  'size-mismatch': 'Размер сетки пола в сохранении не совпадает с текущей картой.',
  'old-version': 'Устаревшая версия формата сохранения (нет миграции).',
  'newer-version': 'Сохранение создано в более новой версии игры.',
  'corrupt-state': 'Структура состояния внутри сохранения нарушена.',
};

export interface SaveSlotMeta {
  slot: SaveSlotId;
  title: string;
  exists: boolean;
  compatible: boolean;
  savedAt?: number;
  clock?: string;
  dayPartLabel?: string;
  phase?: 'shift' | 'report';
  mapId?: string;
  seed?: number;
  minutesElapsed?: number;
  reason?: SaveRejectReason;
  reasonText?: string;
}

const SLOT_TITLES: Record<SaveSlotId, string> = {
  autosave: 'Автосохранение',
  'slot-1': 'Слот 1',
  'slot-2': 'Слот 2',
  'slot-3': 'Слот 3',
};

const DAY_PART_NAMES: Record<ReturnType<typeof dayPart>, string> = {
  day: 'День',
  night: 'Ночь',
  morning: 'Утро',
};

function getStorage(): Storage | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // В приватном окне или песочнице без доступа к localStorage
  }
  return null;
}

export function saveToSlot(
  state: State,
  ctx: LoadContext,
  slot: SaveSlotId = AUTOSAVE_SLOT,
  now: number = Date.now(),
): { ok: true; savedAt: number; bytes: number; json: string } | { ok: false; error: string } {
  try {
    const json = serializeSave(state, ctx.mapId, { cols: ctx.cols, rows: ctx.rows }, now);
    const store = getStorage();
    if (!store) return { ok: false, error: 'Хранилище браузера недоступно.' };
    store.setItem(storageKeyForSlot(slot, ctx.mapId), json);
    return { ok: true, savedAt: now, bytes: json.length, json };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Не удалось записать сохранение.',
    };
  }
}

export function loadFromSlot(ctx: LoadContext, slot: SaveSlotId = AUTOSAVE_SLOT): LoadResult | null {
  const store = getStorage();
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(storageKeyForSlot(slot, ctx.mapId));
  } catch {
    return null;
  }
  if (!raw) return null;
  return loadStateFromSave(raw, ctx);
}

export function deleteSlot(ctx: LoadContext, slot: SaveSlotId): boolean {
  const store = getStorage();
  if (!store) return false;
  try {
    store.removeItem(storageKeyForSlot(slot, ctx.mapId));
    return true;
  } catch {
    return false;
  }
}

export function peekSlotMeta(ctx: LoadContext, slot: SaveSlotId = AUTOSAVE_SLOT): SaveSlotMeta {
  const title = SLOT_TITLES[slot];
  const store = getStorage();
  if (!store) return { slot, title, exists: false, compatible: false };
  let raw: string | null = null;
  try {
    raw = store.getItem(storageKeyForSlot(slot, ctx.mapId));
  } catch {
    return { slot, title, exists: false, compatible: false };
  }
  if (!raw) return { slot, title, exists: false, compatible: false };

  const res = loadStateFromSave(raw, ctx);
  if (res.ok) {
    const t = res.state.t;
    return {
      slot,
      title,
      exists: true,
      compatible: true,
      savedAt: res.file.savedAt,
      clock: clockText(t),
      dayPartLabel: DAY_PART_NAMES[dayPart(t)],
      phase: res.state.phase,
      mapId: res.file.mapId,
      seed: res.state.seed,
      minutesElapsed: Math.floor(t),
    };
  }
  return {
    slot,
    title,
    exists: true,
    compatible: false,
    reason: res.reason,
    reasonText: SAVE_REASON_LABELS[res.reason],
  };
}

export function listAllSlotMetas(ctx: LoadContext): SaveSlotMeta[] {
  return [
    peekSlotMeta(ctx, AUTOSAVE_SLOT),
    ...MANUAL_SLOTS.map((s) => peekSlotMeta(ctx, s)),
  ];
}

export function exportSaveJson(state: State, ctx: LoadContext, now: number = Date.now()): string {
  return serializeSave(state, ctx.mapId, { cols: ctx.cols, rows: ctx.rows }, now);
}

export function importSaveJson(raw: string, ctx: LoadContext): LoadResult {
  return loadStateFromSave(raw, ctx);
}

