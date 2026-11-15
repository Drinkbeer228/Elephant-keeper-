// Уличный бункер станции: в него уходит навоз из контейнера Манежа. Каждая непустая тачка, высыпанная
// в контейнер при уборке, наполняет его на треть; третья — 100 %. Полный бункер — событие для кампуса
// Research Station: запись `waste-tank` в сводке, после выхода из Манежа к Био-лаборатории едет электрокар
// (research-station: src/campus/worldEvents.ts). Бункер опустошается сразу — новая партия копится заново.
// `score` записи — сколько раз бункер наполнялся: станция отправляет по партии на каждое новое наполнение,
// даже если их было несколько за один заход в Манеж (CONTRACT.md §2.2 станции).

import { readSummary, writeSummary } from './link';

export const BUNKER_KEY = 'ers_keeper_bunker_v1';
export const BARROWS_PER_BUNKER = 3;
export const WASTE_TANK_ITEM = 'waste-tank';

export interface Bunker {
  /** Тачек в текущей партии: 0…BARROWS_PER_BUNKER−1. */
  loads: number;
  /** Сколько раз бункер наполнялся. */
  fills: number;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function readBunker(s: Store | null = storage()): Bunker {
  try {
    const x = JSON.parse(s?.getItem(BUNKER_KEY) ?? 'null');
    const loads = Number.isInteger(x?.loads) ? Math.min(Math.max(x.loads, 0), BARROWS_PER_BUNKER - 1) : 0;
    const fills = Number.isInteger(x?.fills) && x.fills >= 0 ? x.fills : 0;
    return { loads, fills };
  } catch {
    return { loads: 0, fills: 0 };
  }
}

/** Заполненность текущей партии, проценты (0, 33, 67). */
export const bunkerPercent = (b: Bunker): number => Math.round((b.loads / BARROWS_PER_BUNKER) * 100);

/** Высыпали тачку: +1 к партии; на третьей бункер полон — отметка `waste-tank` для станции. */
export function addBarrow(s: Store | null = storage(), now = new Date().toISOString()): { bunker: Bunker; full: boolean } {
  const b = readBunker(s);
  let full = false;
  b.loads += 1;
  if (b.loads >= BARROWS_PER_BUNKER) {
    b.loads = 0;
    b.fills += 1;
    full = true;
    const sum = readSummary(s);
    sum.items[WASTE_TANK_ITEM] = { kind: 'event', status: 'done', at: now, score: b.fills };
    sum.updatedAt = now;
    writeSummary(sum, s);
  }
  try {
    s?.setItem(BUNKER_KEY, JSON.stringify(b));
  } catch {
    // Нет места: бункер просто начнёт с нуля.
  }
  return { bunker: b, full };
}
