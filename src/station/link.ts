// Связь с Research Station (research-station: docs/station/CONTRACT.md).
// Встраивание: станция открывает игру в iframe с `?embedded=1`; игра отвечает `ready`, присылает заголовок,
// по `pause` открывает меню (как при уходе со вкладки), а кнопка «На станцию» просит станцию закрыть «планшет».
// Сообщения подписаны каноническим id станции `keeper` (CONTRACT.md §1).
// Сводка: единый ключ `ers_progress_v1:elephantkeeper` (с дублированием в `ers_progress_v1:keeper` для обратной
// совместимости), схема `ers.progress/1` — id задания/этапа, статус, время и метки пропущенного ухода `flags`.

import { FEEDER_IDS, TROUGH_IDS, areaAt } from '../data/facility';
import type { State } from '../sim/types';

/** Id модуля в протоколе postMessage: станция знает симулятор как `keeper`. */
export const PROTOCOL_MODULE = 'keeper';
const MODULE = 'elephantkeeper';
const LEGACY_MODULE = 'keeper';
const STATION_ORIGIN = 'https://drinkbeer228.github.io';
export const SUMMARY_KEY = 'ers_progress_v1:elephantkeeper';
export const LEGACY_SUMMARY_KEY = 'ers_progress_v1:keeper';

const STAGE_IDS = ['stage-1', 'stage-2', 'stage-3', 'stage-4'] as const;

export type ShiftFlag = 'not-fed' | 'no-water' | 'not-cleaned';

export interface ShiftCareItem {
  key: ShiftFlag;
  label: string;
  ok: boolean;
  detail: string;
}

export interface ShiftCare {
  fed: boolean;
  watered: boolean;
  cleaned: boolean;
  flags: ShiftFlag[];
  items: ShiftCareItem[];
}

export const EMBEDDED: boolean = (() => {
  try {
    return new URLSearchParams(location.search).get('embedded') === '1' && window.parent !== window;
  } catch {
    return false;
  }
})();

export function targetOrigin(): string {
  try {
    if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null') {
      return window.location.origin;
    }
  } catch {
    // В среде без window.location используем канонический origin станции.
  }
  return STATION_ORIGIN;
}

function post(type: string, extra: Record<string, unknown> = {}): void {
  if (!EMBEDDED) return;
  try {
    window.parent.postMessage({ ers: 1, module: PROTOCOL_MODULE, type, ...extra }, targetOrigin());
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
    const origin = targetOrigin();
    if ((e.origin !== origin && e.origin !== STATION_ORIGIN) || e.source !== window.parent) return;
    const d = e.data as { ers?: unknown; type?: unknown } | null;
    if (d && d.ers === 1 && d.type === 'pause') onPause();
  });
  post('ready');
}

/**
 * Оценивает выполнение трёх обязательных задач ухода за смену по всем слонам в Манеже:
 * 1. Кормление (`not-fed`): выдано ли сено/каша/овощи в кормушки, нет ли пустых кормушек и голодных слонов.
 * 2. Водопой (`no-water`): наполнены ли поилки чистой водой, нет ли пустых или загрязнённых поилок.
 * 3. Уборка навоза (`not-cleaned`): убраны ли кучи навоза из денников в тачку или уличный бункер.
 */
export function evaluateShiftCare(s: State): ShiftCare {
  const w = s.world;

  // 1. Кормление: проверяем кормушки в денниках и на выгуле, выдачу каши/овощей и сытость слонов
  const barnFeedersOk =
    w.feeders.barnRackW.hay + w.feeders.barnRackW.straw >= 1 &&
    w.feeders.barnRackE.hay + w.feeders.barnRackE.straw >= 1;
  const allFeedersOk = FEEDER_IDS.every((id) => w.feeders[id].hay + w.feeders[id].straw >= 1);
  const bothBarnRacksToppedUp =
    w.feeders.barnRackW.hay + w.feeders.barnRackW.straw > 10 &&
    w.feeders.barnRackE.hay + w.feeders.barnRackE.straw > 8;
  const allElephantsGivenRation =
    s.elephants.length > 0 &&
    s.elephants.every(
      (e) =>
        (w.checks.porridge[e.id]?.length ?? 0) > 0 ||
        (w.checks.vegTub[e.id] ?? 0) > 0 ||
        w.tubs.some((t) => t.owner === e.id && t.where === 'floor' && Object.values(t.veg).some((v) => (v ?? 0) > 0)),
    );
  const anyHungry = s.elephants.some((e) => e.needs.hunger >= 70);
  const fed = barnFeedersOk && !anyHungry && (allFeedersOk || bothBarnRacksToppedUp || allElephantsGivenRation);

  // 2. Водопой: все поилки должны быть с чистой водой (не пустые, без открытого слива и без химии)
  const emptyOrDirtyTroughs = TROUGH_IDS.filter((id) => {
    const t = w.troughs[id];
    return t.level < 15 || t.drain || t.stage !== 'ok' || t.chem > 0.05 || t.debris > 0.55;
  });
  const anyThirsty = s.elephants.some((e) => e.needs.thirst >= 75);
  const watered = emptyOrDirtyTroughs.length === 0 && !anyThirsty;

  // 3. Уборка навоза: в денниках (stallW, stallE / zone 'barn') не должно остаться куч навоза
  const barnDung = w.dung.filter((d) => {
    if (d.zone) return d.zone === 'barn';
    const a = areaAt(d.x, d.y);
    return a === 'stallW' || a === 'stallE' || d.y >= 20;
  });
  const heldShovelDung = s.keeper.held?.kind === 'shovel' && s.keeper.held.load > 0;
  const cleaned = barnDung.length === 0 && !heldShovelDung;

  const flags: ShiftFlag[] = [];
  if (!fed) flags.push('not-fed');
  if (!watered) flags.push('no-water');
  if (!cleaned) flags.push('not-cleaned');

  const items: ShiftCareItem[] = [
    {
      key: 'not-fed',
      label: 'Кормление',
      ok: fed,
      detail: fed
        ? 'кормушки полны, стадо накормлено'
        : anyHungry
          ? 'пропуск — в стаде остались голодные слоны'
          : 'пропуск — остались пустые кормушки, рацион не выдан',
    },
    {
      key: 'no-water',
      label: 'Водопой',
      ok: watered,
      detail: watered
        ? 'поилки наполнены чистой водой'
        : 'пропуск — осталась пустая или невымытая поилка',
    },
    {
      key: 'not-cleaned',
      label: 'Уборка денников',
      ok: cleaned,
      detail: cleaned
        ? 'навоз из денников убран в тачку и бункер'
        : barnDung.length > 0
          ? `пропуск — в денниках остался неубранный навоз (${barnDung.length} куч.)`
          : 'пропуск — навоз не сброшен с лопаты в тачку',
    },
  ];

  return { fed, watered, cleaned, flags, items };
}

/** Возвращает массив меток пропущенного ухода (`flags`) на момент проверки. */
export function computeShiftFlags(s: State): ShiftFlag[] {
  return evaluateShiftCare(s).flags;
}

export interface SummaryItem {
  /** `scenario` — задание или этап; `event` — событие смены для кампуса (полный бункер). */
  kind: 'scenario' | 'event';
  status: 'started' | 'done';
  at: string;
  /** Для `waste-tank` — сколько раз бункер наполнялся с начала стажировки (research-station, CONTRACT.md §2.2). */
  score?: number;
  /** Метки пропущенного ухода при завершении смены: `"not-fed"`, `"no-water"`, `"not-cleaned"`. */
  flags?: ShiftFlag[];
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

/**
 * Отмечает задание или этап стажировки. `done` не откатывается в `started`.
 * При `status === 'done'` записывает массив меток нарушений `flags` (если они есть);
 * при «чистой смене» (`flags` пуст или не передан) поле `flags` не добавляется, снимая прежний выговор.
 */
export function markScenario(
  id: string,
  status: 'started' | 'done',
  s: Store | null = storage(),
  now = new Date().toISOString(),
  flags?: readonly ShiftFlag[],
): Summary {
  const sum = readSummary(s);
  const old = sum.items[id];
  if (!(old?.status === 'done' && status === 'started')) {
    const activeFlags = status === 'done' && flags && flags.length > 0 ? [...flags] : undefined;
    sum.items[id] = activeFlags
      ? { kind: 'scenario', status, at: now, flags: activeFlags }
      : { kind: 'scenario', status, at: now };
    if (status === 'done' && STAGE_IDS.every((stageId) => sum.items[stageId]?.status === 'done')) {
      sum.items.internship = activeFlags
        ? { kind: 'scenario', status: 'done', at: now, flags: activeFlags }
        : { kind: 'scenario', status: 'done', at: now };
    }
    sum.updatedAt = now;
    writeSummary(sum, s);
  }
  return sum;
}
