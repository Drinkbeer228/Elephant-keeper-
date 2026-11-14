// Связь с Research Station (research-station: docs/station/CONTRACT.md).
// Встраивание: станция открывает игру в iframe с `?embedded=1`; игра отвечает `ready`, присылает заголовок,
// по `pause` открывает меню (как при уходе со вкладки), а кнопка «На станцию» просит станцию закрыть «планшет».
// Сводка: ключ `ers_progress_v1:keeper`, схема `ers.progress/1` — только id задания, статус, время.

const MODULE = 'keeper';
const STATION_ORIGIN = 'https://drinkbeer228.github.io';
export const SUMMARY_KEY = 'ers_progress_v1:keeper';

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
    window.parent.postMessage({ ers: 1, module: MODULE, type, ...extra }, STATION_ORIGIN);
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

export interface SummaryItem { kind: 'scenario'; status: 'started' | 'done'; at: string }
export interface Summary { schema: 'ers.progress/1'; module: 'keeper'; updatedAt: string; items: Record<string, SummaryItem> }

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function readSummary(s: Store | null = storage()): Summary {
  const empty: Summary = { schema: 'ers.progress/1', module: 'keeper', updatedAt: new Date(0).toISOString(), items: {} };
  try {
    const x = JSON.parse(s?.getItem(SUMMARY_KEY) ?? 'null');
    if (x && x.schema === 'ers.progress/1' && x.module === 'keeper' && x.items && typeof x.items === 'object') return x as Summary;
  } catch {
    // Повреждённая сводка: начинаем заново.
  }
  return empty;
}

/** Отмечает задание. `done` не откатывается в `started`. */
export function markScenario(id: string, status: 'started' | 'done', s: Store | null = storage(), now = new Date().toISOString()): Summary {
  const sum = readSummary(s);
  const old = sum.items[id];
  if (!(old?.status === 'done' && status === 'started')) {
    sum.items[id] = { kind: 'scenario', status, at: now };
    sum.updatedAt = now;
    try {
      s?.setItem(SUMMARY_KEY, JSON.stringify(sum));
    } catch {
      // Нет места: станция просто не увидит отметку.
    }
  }
  return sum;
}
