// Слоты сохранений в localStorage. Работает и без хранилища (приватный режим) — просто ничего не пишет.

import { deserialize, LOAD_FAILURE_TEXT, serialize, type LoadResult } from './save';
import type { State } from './types';

export const SLOTS = ['auto', 'slot-1', 'slot-2', 'slot-3'] as const;
export type SlotId = (typeof SLOTS)[number];

export const SLOT_TITLES: Record<SlotId, string> = {
  auto: 'Автосохранение',
  'slot-1': 'Слот 1',
  'slot-2': 'Слот 2',
  'slot-3': 'Слот 3',
};

const PREFIX = 'elephant-keeper:v2:';
const LEGACY_PREFIX = 'keeper-sim:save:';

function store(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function saveSlot(state: State, slot: SlotId, now = Date.now()): { ok: boolean; error?: string } {
  const st = store();
  if (!st) return { ok: false, error: 'Хранилище браузера недоступно.' };
  try {
    st.setItem(PREFIX + slot, serialize(state, now));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Не удалось сохранить.' };
  }
}

export function loadSlot(slot: SlotId): LoadResult | null {
  const st = store();
  if (!st) return null;
  let raw: string | null = null;
  try {
    raw = st.getItem(PREFIX + slot);
  } catch {
    return null;
  }
  return raw ? deserialize(raw) : null;
}

export function deleteSlot(slot: SlotId): void {
  try {
    store()?.removeItem(PREFIX + slot);
  } catch {
    // хранилище недоступно — удалять нечего
  }
}

export interface SlotInfo {
  slot: SlotId;
  title: string;
  exists: boolean;
  ok: boolean;
  text: string;
  savedAt: number;
}

export function slotInfo(slot: SlotId): SlotInfo {
  const res = loadSlot(slot);
  if (!res) return { slot, title: SLOT_TITLES[slot], exists: false, ok: false, text: 'Пусто', savedAt: 0 };
  if (!res.ok) return { slot, title: SLOT_TITLES[slot], exists: true, ok: false, text: LOAD_FAILURE_TEXT[res.reason], savedAt: 0 };
  return {
    slot,
    title: SLOT_TITLES[slot],
    exists: true,
    ok: true,
    text: `День ${res.meta.day}, ${res.meta.clock} · ${res.meta.herd.join(', ')}`,
    savedAt: res.savedAt,
  };
}

// Сохранения прошлой версии игры: показываем и предлагаем удалить, но не загружаем
export function legacyKeys(): string[] {
  const st = store();
  if (!st) return [];
  const out: string[] = [];
  try {
    for (let i = 0; i < st.length; i++) {
      const key = st.key(i);
      if (key && key.startsWith(LEGACY_PREFIX)) out.push(key);
    }
  } catch {
    return [];
  }
  return out;
}

export function clearLegacy(): number {
  const keys = legacyKeys();
  for (const k of keys) {
    try {
      store()?.removeItem(k);
    } catch {
      // игнорируем
    }
  }
  return keys.length;
}
