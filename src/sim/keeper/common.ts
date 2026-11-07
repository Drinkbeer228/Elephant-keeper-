// Общее для действий кипера: контекст, построение вариантов, названия вещей.

import { KEEPER } from '../../data/balance';
import { STATIONS, areaAt, type AreaId, type StationId } from '../../data/facility';
import { keeperContact, type KeeperContact } from '../behavior/perceive';
import { dist } from '../geometry';
import type { ActionOption, ActionRef, Barrow, Held, Keeper, State, ThingKind, World } from '../types';

export interface KCtx {
  s: State;
  k: Keeper;
  w: World;
  h: Held | null;
  area: AreaId | null; // кипер среди слонов: в зале или на выгуле
  contact: KeeperContact | null; // кипер снаружи у ограды выгула
  barrow: Barrow;
  pushing: boolean;
  barrowNear: boolean; // тачка стоит рядом
}

export function makeCtx(s: State): KCtx {
  const k = s.keeper;
  const b = s.world.barrow;
  const area = areaAt(k.x, k.y);
  return {
    s,
    k,
    w: s.world,
    h: k.held,
    area,
    contact: area ? null : keeperContact(s),
    barrow: b,
    pushing: b.pushed,
    barrowNear: !b.pushed && dist(k, b) <= KEEPER.barrowReach,
  };
}

export function near(s: State, id: StationId, reach: number = KEEPER.reach): boolean {
  return dist(s.keeper, STATIONS[id].keeper) <= reach;
}

export function opt(ref: ActionRef, label: string, priority: number, extra: Partial<ActionOption> = {}): ActionOption {
  return {
    id: `${ref.verb}:${ref.target}`,
    ref,
    label,
    enabled: true,
    reason: '',
    priority,
    elephantId: null,
    timed: false,
    group: '',
    dist: 0,
    ...extra,
  };
}

export function off(ref: ActionRef, label: string, reason: string, priority: number, extra: Partial<ActionOption> = {}): ActionOption {
  return opt(ref, label, priority, { ...extra, enabled: false, reason });
}

// Названия вещей: именительный (в руках) и винительный (взять/положить)
export const THING_NOM: Record<ThingKind, string> = {
  shovel: 'лопата',
  rake: 'грабли',
  broom: 'метла',
  mop: 'швабра',
  brush: 'щётка',
  hose: 'шланг',
  hay: 'тюк сена',
  straw: 'тюк соломы',
  browse: 'охапка веток',
  bamboo: 'связка бамбука',
  sawdust: 'мешок опилок',
  tank: 'ведро для мочи',
  washKit: 'ведро для мытья слонов',
  chem: 'средство для поилок',
  ration: 'ведро с овощами',
  porridge: 'ведро каши',
  tub: 'таз',
  pile: 'куча сора',
  shard: 'осколки таза',
};

export const THING_ACC: Record<ThingKind, string> = {
  shovel: 'лопату',
  rake: 'грабли',
  broom: 'метлу',
  mop: 'швабру',
  brush: 'щётку',
  hose: 'шланг',
  hay: 'тюк сена',
  straw: 'тюк соломы',
  browse: 'охапку веток',
  bamboo: 'связку бамбука',
  sawdust: 'мешок опилок',
  tank: 'ведро',
  washKit: 'ведро для мытья',
  chem: 'средство для поилок',
  ration: 'ведро с овощами',
  porridge: 'ведро каши',
  tub: 'таз',
  pile: 'кучу сора',
  shard: 'осколки',
};

// Тяжёлое и объёмное: тюки, мешки, полный таз
export function heavy(h: Held | null, s?: State): boolean {
  if (!h) return false;
  if (h.kind === 'hay' || h.kind === 'straw' || h.kind === 'sawdust' || h.kind === 'bamboo') return true;
  if (h.kind === 'ration' && h.load > 0) return true;
  if (h.kind === 'tub' && s) {
    const t = s.world.tubs.find((x) => x.id === h.aux);
    if (t && Object.values(t.veg).reduce((a, b) => a + b, 0) > 10) return true;
  }
  return false;
}

// Что можно положить в тачку
export function stowable(h: Held): boolean {
  return h.kind !== 'hose' && h.kind !== 'pile' && h.kind !== 'shard';
}

// Корм не кладут к навозу
export function foodThing(h: Held): boolean {
  return h.kind === 'hay' || h.kind === 'straw' || h.kind === 'browse' || h.kind === 'bamboo' || h.kind === 'ration' || h.kind === 'porridge' || h.kind === 'tub';
}

export function ownerName(s: State, id: string | null): string {
  return s.elephants.find((e) => e.id === id)?.profile.name ?? '';
}
