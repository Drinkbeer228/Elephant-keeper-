// Сохранение: честный JSON состояния с заголовком формата и версии.
// В состоянии нет undefined, Infinity и ссылок — сохранение и загрузка дают побитово то же состояние,
// а значит, и продолжение смены после загрузки идёт так же, как шло бы без неё.
// Профили слонов лежат в сейве целиком: загрузка никогда не генерирует характер заново.
// Сейвы прошлых версий переводятся миграциями по шагам (v2 → v3 → v4): недостающие черты и
// привычки досчитываются один раз из того же seed — так же, как их получило бы новое стадо, — и
// дальше хранятся в сейве. v4 — полный контакт: общий зал без прохода кипера, голос вместо свистка.

import { KEEPER } from '../data/balance';
import { BARROW_HOME, HOSE_LENGTH, HOSE_REEL, H, KEEPER_START, STATIONS, TANK_HOME, TREES, W, areaAt } from '../data/facility';
import { keeperIndex } from './geometry';
import { DIET_IDS, PORRIDGE_SACK_KG, emptyVeg } from '../data/rations';
import { initialLearned, assignDiets, extraProfile, makeHabits } from './herd';
import { elephantCanStand, nearestStandable } from './nav';
import { SAVE_VERSION, cleanBody, emptyChecks, emptyDayStats, freshTrough, rackSpot, vegStockFor } from './state';
import { clockText, shiftDay } from './time';
import { ACTIVITY_KINDS, TRAIT_KEYS, type ActivityKind, type ElephantProfile, type State } from './types';

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

export type LoadResult = { ok: true; state: State; meta: SaveMeta; savedAt: number; migrated: boolean } | { ok: false; reason: LoadFailure; detail: string };

export const LOAD_FAILURE_TEXT: Record<LoadFailure, string> = {
  malformed: 'Файл повреждён или это не сохранение.',
  legacy: 'Это сохранение старой пиксельной версии игры — с новой оно несовместимо.',
  newer: 'Сохранение сделано в более новой версии игры.',
  old: 'Слишком старый формат сохранения.',
  corrupt: 'Сохранение повреждено: данные смены не прошли проверку.',
};

// Миграции: migrations[v] переводит документ версии v в v+1
type Doc = Record<string, unknown>;
type Migration = (doc: Doc) => Doc;

/* eslint-disable @typescript-eslint/no-explicit-any */
function migrate2to3(doc: Doc): Doc {
  const st = doc.state as any;
  if (!st || typeof st !== 'object' || !st.world) return doc;
  const w = st.world;
  const cellsN = W * H;
  // Ворота: одни на выгул; между стойлами — открыты (как было: слоновник был одним помещением)
  w.gates = { outer: !!w.gateOpen, shift: true };
  delete w.gateOpen;
  const hay = w.hay ?? {};
  w.feeders = {
    barnRackW: { hay: Math.round((hay.barnRack ?? 0) * 0.5 * 1000) / 1000, straw: 0 },
    barnRackE: { hay: Math.round((hay.barnRack ?? 0) * 0.5 * 1000) / 1000, straw: 0 },
    paddockFeeder: { hay: hay.paddockFeeder ?? 0, straw: 0 },
  };
  delete w.hay;
  const water = w.water ?? {};
  const tr = (x: any) => ({ ...freshTrough(typeof x?.level === 'number' ? x.level : 50, 0.2), valve: !!x?.valve });
  w.troughs = { barnWaterW: tr(water.barnWater), barnWaterE: tr(water.barnWater), paddockWater: tr(water.paddockWater) };
  delete w.water;
  delete w.trough;
  w.cells = w.cells ?? {};
  for (const key of ['litter', 'sawdust']) if (!Array.isArray(w.cells[key])) w.cells[key] = new Array(cellsN).fill(0);
  const mapKind = (k: string) => (k === 'fork' ? 'shovel' : k);
  w.items = (Array.isArray(w.items) ? w.items : []).map((it: any) => ({ id: it.id, kind: mapKind(it.kind), x: it.x, y: it.y, load: it.kind === 'ration' ? it.portions ?? 0 : 0, aux: 0, owner: null }));
  const nextId = () => (st.nextId = (st.nextId ?? 1) + 1) - 1;
  w.items.push({ id: nextId(), kind: 'tank', x: TANK_HOME.x, y: TANK_HOME.y, load: 0, aux: 0, owner: null });
  const t = w.tools ?? {};
  w.tools = { shovel: t.fork ?? true, rake: t.rake ?? true, broom: true, mop: true, brush: true };
  w.barrow = { ...(w.barrow ?? {}), cargo: [] };
  w.hose = { state: 'reel', path: [{ x: HOSE_REEL.x, y: HOSE_REEL.y }], end: { x: HOSE_REEL.x, y: HOSE_REEL.y }, length: HOSE_LENGTH, damage: 0, chewed: 0 };
  w.food = (Array.isArray(w.food) ? w.food : []).map((f: any) => ({ ...f, rot: 0 }));
  const stock = w.stock ?? {};
  const porridge: Record<string, number> = {};
  for (const d of DIET_IDS) porridge[d] = PORRIDGE_SACK_KG;
  const herdN = Array.isArray(st.elephants) ? st.elephants.length : 3;
  w.stock = { hay: stock.hay ?? 10, straw: stock.straw ?? 6, browse: stock.browse ?? 3, bamboo: 2, sawdust: 3, veg: vegStockFor(st.seed ?? 1, shiftDay(st.t ?? 480), herdN), porridge };
  w.supplies = { chem: 2, shampoo: 3, tape: 3 };
  w.checks = emptyChecks();
  w.trees = Object.fromEntries(TREES.filter((x) => x.fruit).map((x, i) => [x.id, 9 - i * 2]));
  // Кипер
  const k = st.keeper ?? {};
  const h = k.held;
  if (h && typeof h === 'object') {
    const kind = mapKind(h.kind);
    k.held = kind === 'hose' ? null : { kind, load: kind === 'ration' ? h.portions ?? 0 : 0, aux: 0, owner: null };
  } else k.held = null;
  k.prep = null;
  k.carried = 0;
  st.keeper = k;
  // Слоны: черты и привычки досчитываем из того же seed, как у нового стада
  const els: any[] = Array.isArray(st.elephants) ? st.elephants : [];
  const extras = els.map((e, i) => ({ extra: extraProfile(st.seed ?? 1, i, { age: e.profile?.age ?? 20, traits: e.profile?.traits ?? {} }) }));
  const diets = assignDiets(els.map((e) => ({ age: e.profile?.age ?? 20, look: e.profile?.look ?? { size: 1 } })));
  const habits = makeHabits(extras, diets);
  els.forEach((e, i) => {
    const p = e.profile as ElephantProfile;
    if (p?.traits && typeof p.traits.mischief !== 'number') p.traits.mischief = extras[i].extra.mischief;
    if (p && !p.habits) p.habits = habits[i];
    if (e.learned && typeof e.learned.toilet !== 'number') e.learned.toilet = initialLearned(p).toilet;
    e.body = cleanBody();
    e.tipsy = 0;
    e.trunk = { kind: null, amount: 0 };
    if (e.mem) {
      e.mem.lastSignalFx = -100;
      if (e.mem.call) e.mem.call.why = 'call';
    }
    e.day = { ...emptyDayStats(), ...(e.day ?? {}) };
    // Старые цели занятий могут ссылаться на снятые станции — начинаем с «стоит»
    e.act = { kind: 'idle', target: null, phase: 'do', start: st.t, doStart: st.t, dur: 0, score: 0.1, forced: false, signal: null, note: 'стоит', key: 'idle', aux: null, flag: 0 };
    e.path = [];
    e.pathGoal = null;
    e.lying = false;
    e.signal = null;
    // Новые ворота между стойлами и станции у бетонной полосы: сдвинуть, если стоит в них
    const r = 0.95 * (p?.look?.size ?? 1);
    const mask = (w.gates.outer ? 1 : 0) | 2;
    if (!elephantCanStand(e.x, e.y, r, mask)) {
      const q = nearestStandable({ x: e.x, y: e.y }, r + 0.05, mask);
      if (q && areaAt(q.x, q.y)) {
        e.x = q.x;
        e.y = q.y;
      }
    }
  });
  w.tubs = els.map((e, i) => ({ id: nextId(), owner: e.id, ...rackSpot(i), heading: 0, where: 'rack', veg: emptyVeg(), emptySince: -1, damage: 0, broken: false, dirty: false }));
  return { ...doc, version: 3 };
}

// v3 → v4: полный контакт. Проход кипера и решётка вдоль него убраны, станции переехали к южной
// стене общего зала, свисток заменён голосом, у слоних появились «свой ли ты» и знание просьб.
function migrate3to4(doc: Doc): Doc {
  const st = doc.state as any;
  if (!st || typeof st !== 'object' || !st.world) return doc;
  const w = st.world;
  const mask = (w.gates?.outer ? 1 : 0) | (w.gates?.shift ? 2 : 0);
  const idle = () => ({ kind: 'idle', target: null, phase: 'do', start: st.t, doStart: st.t, dur: 0, score: 0.1, forced: false, signal: null, note: 'стоит', key: 'idle', aux: null, flag: 0 });
  const els: any[] = Array.isArray(st.elephants) ? st.elephants : [];
  for (const e of els) {
    const p = e.profile as ElephantProfile;
    if (p?.habits) delete (p.habits as any).whistle;
    if (e.learned && p?.traits && p.look) {
      const base = initialLearned(p);
      if (typeof e.learned.familiarity !== 'number') e.learned.familiarity = base.familiarity;
      if (!e.learned.cues || typeof e.learned.cues !== 'object') e.learned.cues = base.cues;
    }
    if (e.mem) {
      e.mem.aware = -100;
      e.mem.tension = 0;
      e.mem.accepted = -100;
      e.mem.lastWarn = -100;
      e.mem.nag = { cue: '', t: -100, n: 0 };
      if (e.mem.call) e.mem.call.why = e.mem.call.why === 'call' ? 'come' : e.mem.call.why;
    }
    e.day = { ...emptyDayStats(), ...(e.day ?? {}) };
    // Станции у южной стены и новые стены: сдвинуть слониху, если она теперь стоит в них
    const r = 0.95 * (p?.look?.size ?? 1);
    let reset = false;
    if (!elephantCanStand(e.x, e.y, r, mask)) {
      const q = nearestStandable({ x: e.x, y: e.y }, r + 0.05, mask);
      if (q && areaAt(q.x, q.y)) {
        e.x = q.x;
        e.y = q.y;
      }
      reset = true;
    }
    // Занятия, привязанные к киперу или к переехавшим местам, начинаем заново
    const a = e.act ?? {};
    const tg = a.target;
    if (['follow', 'seekKeeper', 'signal'].includes(a.kind)) reset = true;
    if (tg?.t === 'slot' && (!(tg.station in STATIONS) || String(tg.station).startsWith('barn'))) reset = true;
    if (tg?.t === 'point' && !elephantCanStand(tg.x, tg.y, r, mask)) reset = true;
    if (reset) {
      e.act = idle();
      e.path = [];
      e.pathGoal = null;
      e.lying = false;
      e.signal = null;
    }
  }
  // Бак стоял в проходе (там теперь поилка) или под старой тренировочной стенкой — домой;
  // вещи, оказавшиеся внутри новых станций, — рядом с ними
  w.items = (Array.isArray(w.items) ? w.items : []).map((it: any) => {
    if (it?.kind === 'tank') return { ...it, x: TANK_HOME.x, y: TANK_HOME.y };
    if (it && typeof it.x === 'number' && typeof it.y === 'number' && keeperIndex.hits(it.x, it.y, 0.05)) return { ...it, ...(freeSpotNear(it.x, it.y, 0.15) ?? TANK_HOME) };
    return it;
  });
  // Шланг мог лежать через старые двери — смотан на катушку
  w.hose = { ...(w.hose ?? {}), state: 'reel', path: [{ x: HOSE_REEL.x, y: HOSE_REEL.y }], end: { x: HOSE_REEL.x, y: HOSE_REEL.y } };
  if (w.barrow && typeof w.barrow.x === 'number' && keeperIndex.hits(w.barrow.x, w.barrow.y, 0.4)) {
    w.barrow = { ...w.barrow, x: BARROW_HOME.x, y: BARROW_HOME.y, heading: 0, pushed: false };
  }
  const k = st.keeper ?? {};
  k.stun = 0;
  if (typeof k.x === 'number' && typeof k.y === 'number' && keeperIndex.hits(k.x, k.y, KEEPER.radius)) {
    const spot = freeSpotNear(k.x, k.y, KEEPER.radius) ?? KEEPER_START;
    k.x = spot.x;
    k.y = spot.y;
  }
  if (w.barrow?.pushed) w.barrow.pushed = false;
  st.keeper = k;
  return { ...doc, version: 4 };
}

function freeSpotNear(x: number, y: number, r: number): { x: number; y: number } | null {
  for (let d = 0.25; d <= 4; d += 0.25) {
    for (let i = 0; i < 16; i++) {
      const px = x + Math.cos((i * Math.PI) / 8) * d;
      const py = y + Math.sin((i * Math.PI) / 8) * d;
      if (px > 0.5 && py > 0.5 && px < W - 0.5 && py < H - 0.5 && !keeperIndex.hits(px, py, r + 0.02)) return { x: Math.round(px * 100) / 100, y: Math.round(py * 100) / 100 };
    }
  }
  return null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const MIGRATIONS: Record<number, Migration> = { 2: migrate2to3, 3: migrate3to4 };

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
    if (!isObj(p) || typeof p.name !== 'string' || !isObj(p.traits) || !isObj(p.look) || !isObj(p.habits)) return `слон ${e.id} без профиля`;
    for (const k of TRAIT_KEYS) {
      const v = (p.traits as Record<string, unknown>)[k];
      if (!num(v) || v < 0 || v > 1) return `слон ${e.id}: черта ${k}`;
    }
    const L = e.learned;
    if (!isObj(L) || !num(L.trust) || !num(L.cooperation) || !num(L.expectation) || !num(L.toilet) || !num(L.familiarity) || !isObj(L.cues)) return `слон ${e.id}: выученное`;
    if (!isObj(e.needs)) return `слон ${e.id}: потребности`;
    for (const k of NEED_KEYS) if (!num((e.needs as Record<string, unknown>)[k])) return `слон ${e.id}: потребность ${k}`;
    if (!isObj(e.act) || !ACTIVITY_KINDS.includes(e.act.kind as ActivityKind)) return `слон ${e.id}: занятие`;
    if (!isObj(e.mem) || !isObj(e.day) || !isObj(e.body) || !isObj(e.trunk)) return `слон ${e.id}: память`;
    if (!num(e.mem.tension) || !num(e.mem.aware) || !isObj(e.mem.nag)) return `слон ${e.id}: память о кипере`;
  }
  const k = s.keeper;
  if (!isObj(k) || !num(k.x) || !num(k.y) || !num(k.pouch) || !num(k.stun)) return 'нет кипера';
  const w = s.world;
  if (!isObj(w)) return 'нет мира';
  if (!isObj(w.cells)) return 'нет пола';
  for (const key of ['wet', 'soil', 'bedding', 'litter', 'sawdust']) {
    const arr = (w.cells as Record<string, unknown>)[key];
    if (!Array.isArray(arr) || arr.length !== W * H || !arr.every(num)) return `пол: ${key}`;
  }
  if (!Array.isArray(w.dung) || !Array.isArray(w.food) || !Array.isArray(w.items) || !Array.isArray(w.tubs)) return 'нет предметов';
  if (!isObj(w.gates) || !isObj(w.feeders) || !isObj(w.troughs) || !isObj(w.stock) || !isObj(w.barrow) || !isObj(w.hose) || !isObj(w.checks)) return 'нет станций';
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
  const migrated = version < SAVE_VERSION;
  while (version < SAVE_VERSION) {
    const m = MIGRATIONS[version];
    if (!m) return { ok: false, reason: 'old', detail: `нет миграции v${version}` };
    try {
      current = m(current);
    } catch (err) {
      return { ok: false, reason: 'corrupt', detail: `миграция v${version}: ${err instanceof Error ? err.message : err}` };
    }
    version++;
  }
  const err = validateState(current.state);
  if (err) return { ok: false, reason: 'corrupt', detail: err };
  const state = current.state as State;
  state.version = SAVE_VERSION;
  const meta = isObj(current.meta) ? (current.meta as unknown as SaveMeta) : { day: shiftDay(state.t), clock: clockText(state.t), herd: state.elephants.map((e) => e.profile.name) };
  return { ok: true, state, meta, savedAt: num(current.savedAt) ? current.savedAt : 0, migrated };
}
