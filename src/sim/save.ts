// Сохранение: честный JSON состояния с заголовком формата и версии.
// В состоянии нет undefined, Infinity и ссылок — сохранение и загрузка дают побитово то же состояние,
// а значит, и продолжение смены после загрузки идёт так же, как шло бы без неё.
// Профили слонов лежат в сейве целиком: загрузка никогда не генерирует характер заново.

import { H, W } from '../data/facility';
import { SAVE_VERSION } from './state';
import { clockText, shiftDay } from './time';
import { TRAIT_KEYS, type ActivityKind, type State } from './types';

export const SAVE_FORMAT = 'elephant-keeper';

export interface SaveMeta {
  day: number;
  clock: string;
  herd: string[];
}

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  savedAt: number;
  meta: SaveMeta;
  state: State;
}

export type LoadFailure = 'malformed' | 'legacy' | 'newer' | 'old' | 'corrupt';

export type LoadResult = { ok: true; state: State; meta: SaveMeta; savedAt: number } | { ok: false; reason: LoadFailure; detail: string };

export const LOAD_FAILURE_TEXT: Record<LoadFailure, string> = {
  malformed: 'Файл повреждён или это не сохранение.',
  legacy: 'Это сохранение старой пиксельной версии игры — с новой оно несовместимо.',
  newer: 'Сохранение сделано в более новой версии игры.',
  old: 'Слишком старый формат сохранения.',
  corrupt: 'Сохранение повреждено: данные смены не прошли проверку.',
};

// Миграции: migrations[v] переводит документ версии v в v+1
type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Record<number, Migration> = {};

export function serialize(state: State, savedAt = Date.now()): string {
  const file: SaveFile = {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt,
    meta: { day: shiftDay(state.t), clock: clockText(state.t), herd: state.elephants.map((e) => e.profile.name) },
    state,
  };
  return JSON.stringify(file);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const ACTIVITIES: ActivityKind[] = [
  'idle',
  'wander',
  'explore',
  'eat',
  'drink',
  'urinate',
  'defecate',
  'sleep',
  'rest',
  'play',
  'bathe',
  'dust',
  'socialize',
  'signal',
  'seekKeeper',
  'follow',
  'pace',
  'avoid',
];

const NEED_KEYS = ['hunger', 'thirst', 'bladder', 'bowel', 'fatigue', 'boredom', 'social', 'heat', 'stress'];

// Структурная проверка: всё, без чего симуляция упадёт или поведёт себя странно
export function validateState(s: unknown): string | null {
  if (!isObj(s)) return 'состояние не объект';
  for (const k of ['seed', 'rng', 't', 'simSec', 'nextId', 'dayStart']) if (!num(s[k])) return `нет числа ${k}`;
  if (!Array.isArray(s.elephants) || s.elephants.length === 0) return 'нет слонов';
  const ids = new Set<string>();
  for (const e of s.elephants as unknown[]) {
    if (!isObj(e) || typeof e.id !== 'string') return 'битый слон';
    if (ids.has(e.id)) return `повтор слона ${e.id}`;
    ids.add(e.id);
    if (!num(e.x) || !num(e.y) || !num(e.heading)) return `слон ${e.id} без координат`;
    const p = e.profile;
    if (!isObj(p) || typeof p.name !== 'string' || !isObj(p.traits) || !isObj(p.look)) return `слон ${e.id} без профиля`;
    for (const k of TRAIT_KEYS) {
      const v = (p.traits as Record<string, unknown>)[k];
      if (!num(v) || v < 0 || v > 1) return `слон ${e.id}: черта ${k}`;
    }
    if (!isObj(e.learned) || !num(e.learned.trust) || !num(e.learned.cooperation) || !num(e.learned.expectation)) return `слон ${e.id}: выученное`;
    if (!isObj(e.needs)) return `слон ${e.id}: потребности`;
    for (const k of NEED_KEYS) if (!num((e.needs as Record<string, unknown>)[k])) return `слон ${e.id}: потребность ${k}`;
    if (!isObj(e.act) || !ACTIVITIES.includes(e.act.kind as ActivityKind)) return `слон ${e.id}: занятие`;
    if (!isObj(e.mem) || !isObj(e.day)) return `слон ${e.id}: память`;
  }
  const k = s.keeper;
  if (!isObj(k) || !num(k.x) || !num(k.y) || !num(k.pouch)) return 'нет кипера';
  const w = s.world;
  if (!isObj(w)) return 'нет мира';
  if (!isObj(w.cells)) return 'нет пола';
  for (const key of ['wet', 'soil', 'bedding']) {
    const arr = (w.cells as Record<string, unknown>)[key];
    if (!Array.isArray(arr) || arr.length !== W * H || !arr.every(num)) return `пол: ${key}`;
  }
  if (!Array.isArray(w.dung) || !Array.isArray(w.food) || !Array.isArray(w.items)) return 'нет предметов';
  if (!isObj(w.water) || !isObj(w.hay) || !isObj(w.stock) || !isObj(w.barrow)) return 'нет станций';
  if (!Array.isArray(s.journal) || !Array.isArray(s.alerts) || !Array.isArray(s.reports)) return 'нет журнала';
  if (!isObj(s.bonds)) return 'нет отношений';
  return null;
}

export function deserialize(json: string): LoadResult {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch (err) {
    return { ok: false, reason: 'malformed', detail: err instanceof Error ? err.message : 'не JSON' };
  }
  if (!isObj(doc)) return { ok: false, reason: 'malformed', detail: 'корень не объект' };
  // Сейвы прошлой (пиксельной) версии: schemaVersion 1 и mapId
  if ('schemaVersion' in doc || 'mapId' in doc) return { ok: false, reason: 'legacy', detail: 'формат keeper-sim v1' };
  if (doc.format !== SAVE_FORMAT || !num(doc.version)) return { ok: false, reason: 'malformed', detail: 'нет заголовка формата' };
  let version = doc.version;
  if (version > SAVE_VERSION) return { ok: false, reason: 'newer', detail: `v${version} > v${SAVE_VERSION}` };
  let current: Record<string, unknown> = doc;
  while (version < SAVE_VERSION) {
    const m = MIGRATIONS[version];
    if (!m) return { ok: false, reason: 'old', detail: `нет миграции v${version}` };
    current = m(current);
    version++;
  }
  const err = validateState(current.state);
  if (err) return { ok: false, reason: 'corrupt', detail: err };
  const state = current.state as State;
  state.version = SAVE_VERSION;
  const meta = isObj(current.meta) ? (current.meta as unknown as SaveMeta) : { day: shiftDay(state.t), clock: clockText(state.t), herd: state.elephants.map((e) => e.profile.name) };
  return { ok: true, state, meta, savedAt: num(current.savedAt) ? current.savedAt : 0 };
}
