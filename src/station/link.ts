// Связь с Research Station (research-station: docs/station/CONTRACT.md).
// Встраивание: станция открывает игру в iframe с `?embedded=1`; игра отвечает `ready`, присылает заголовок,
// по `pause` открывает меню (как при уходе со вкладки), а кнопка «На станцию» просит станцию закрыть «планшет».
// Сообщения подписаны каноническим id станции `keeper` (CONTRACT.md §1).
// Сводка: единый ключ `ers_progress_v1:elephantkeeper` (с дублированием в `ers_progress_v1:keeper` для обратной
// совместимости), схема `ers.progress/1` — id задания/этапа, статус, время.

/** Id модуля в протоколе postMessage: станция знает симулятор как `keeper`. */
export const PROTOCOL_MODULE = 'keeper';
const MODULE = 'elephantkeeper';
const LEGACY_MODULE = 'keeper';
const STATION_ORIGIN = 'https://drinkbeer228.github.io';
export const SUMMARY_KEY = 'ers_progress_v1:elephantkeeper';
export const LEGACY_SUMMARY_KEY = 'ers_progress_v1:keeper';

const STAGE_IDS = ['stage-1', 'stage-2', 'stage-3', 'stage-4'] as const;

export const EMBEDDED: boolean = (() => {
  try {
    return new URLSearchParams(location.search).get('embedded') === '1' && window.parent !== window;
  } catch {
    return false;
  }
})();

function post(type: string, extra: Record<string, unknown> = {}): void {
  if (!EMBEDDED) return;
  try {
    window.parent.postMessage({ ers: 1, module: PROTOCOL_MODULE, type, ...extra }, STATION_ORIGIN);
  } catch {
    // Станции нет — сообщать некому.
  }
}

export const postTitle = (title: string): void => post('title', { title: title.slice(0, 120) });
export const requestClose = (): void => post('close-request');

/** Подключает протокол. `onPause` вызывается, когда станция сворачивает планшет или вкладку. */
export function connectStation(onPause: () => void): void {
  if (!EMBEDDED) return;
  document.documentElement.classList.add('ers-embedded');
  window.addEventListener('message', (e) => {
    if (e.origin !== STATION_ORIGIN || e.source !== window.parent) return;
    const d = e.data as { ers?: unknown; type?: unknown } | null;
    if (d && d.ers === 1 && d.type === 'pause') onPause();
  });
  post('ready');
}

export interface SummaryItem {
  /** `scenario` — задание или этап; `event` — событие смены для кампуса (полный бункер). */
  kind: 'scenario' | 'event';
  status: 'started' | 'done';
  at: string;
  /** Для `waste-tank` — сколько раз бункер наполнялся с начала стажировки (research-station, CONTRACT.md §2.2). */
  score?: number;
}

export interface Summary {
  schema: 'ers.progress/1';
  module: 'elephantkeeper';
  updatedAt: string;
  items: Record<string, SummaryItem>;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function readSummary(s: Store | null = storage()): Summary {
  const empty: Summary = { schema: 'ers.progress/1', module: MODULE, updatedAt: new Date(0).toISOString(), items: {} };
  try {
    const raw = s?.getItem(SUMMARY_KEY) ?? s?.getItem(LEGACY_SUMMARY_KEY) ?? 'null';
    const x = JSON.parse(raw);
    if (
      x &&
      x.schema === 'ers.progress/1' &&
      (x.module === MODULE || x.module === LEGACY_MODULE) &&
      x.items &&
      typeof x.items === 'object'
    ) {
      return {
        schema: 'ers.progress/1',
        module: MODULE,
        updatedAt: typeof x.updatedAt === 'string' ? x.updatedAt : empty.updatedAt,
        items: { ...(x.items as Record<string, SummaryItem>) },
      };
    }
  } catch {
    // Повреждённая сводка: начинаем заново.
  }
  return empty;
}

/** Записывает обе копии сводки: каноническую и прежнюю. */
export function writeSummary(sum: Summary, s: Store | null = storage()): void {
  try {
    s?.setItem(SUMMARY_KEY, JSON.stringify(sum));
    s?.setItem(LEGACY_SUMMARY_KEY, JSON.stringify({ ...sum, module: LEGACY_MODULE }));
  } catch {
    // Нет места: станция просто не увидит отметку.
  }
}

/** Отмечает задание или этап стажировки. `done` не откатывается в `started`. */
export function markScenario(
  id: string,
  status: 'started' | 'done',
  s: Store | null = storage(),
  now = new Date().toISOString(),
): Summary {
  const sum = readSummary(s);
  const old = sum.items[id];
  if (!(old?.status === 'done' && status === 'started')) {
    sum.items[id] = { kind: 'scenario', status, at: now };
    if (
      status === 'done' &&
      STAGE_IDS.every((stageId) => sum.items[stageId]?.status === 'done') &&
      sum.items.internship?.status !== 'done'
    ) {
      sum.items.internship = { kind: 'scenario', status: 'done', at: now };
    }
    sum.updatedAt = now;
    writeSummary(sum, s);
  }
  return sum;
}
