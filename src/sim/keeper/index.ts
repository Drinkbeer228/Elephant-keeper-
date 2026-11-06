// Кипер: контекстные действия и работа, которая занимает время.
// Действия — данные (глагол + цель), поэтому их можно сохранить, повторить в тесте и проверить заново.
// Список действий собирается из всего, что рядом: слоны, станции, вещи, тачка, пол.

import { TASK } from '../../data/balance';
import { DRUM, GATE_BY_ID, HOSE_REEL, STATIONS, TANK_HOME, TOOL_KINDS, TOOL_SLOTS, areaAt, type GateId, type StationId, type ToolKind, type TroughId } from '../../data/facility';
import { headPos, keeperContact, rearPos } from '../behavior/perceive';
import { log } from '../events';
import { dist } from '../geometry';
import type { ActionOption, ActionRef, State, Vec } from '../types';
import { cellCenter, tubById } from '../world';
import { applyGate, gateOptions } from './access';
import { applyCare, careOptions } from './care';
import { applyCleaning, cleaningOptions } from './cleaning';
import { makeCtx } from './common';
import { applyFeeding, feedingOptions, prepOptions } from './feeding';
import { applyHose, hoseOptions } from './hose';
import { applyThing, thingOptions } from './things';
import { applyTrough, troughOptions } from './troughs';
import { applyVoice, voiceOptions } from './voice';

export { areaEmpty, keeperArea, keeperNav, nearGate } from './access';
export { heavy } from './common';
export { nextVeg } from './feeding';
export { hoseLengthTo, hoseUsable, replaceHoseIfBroken } from './hose';
export { moveKeeper } from './move';
export { heldLabel } from './things';

export function availableActions(s: State): ActionOption[] {
  const k = s.keeper;
  if (k.task) return [];
  if (k.prep) return prepOptions(s);
  const c = makeCtx(s);
  const out: ActionOption[] = [];
  careOptions(c, out);
  voiceOptions(c, out);
  gateOptions(c, out);
  troughOptions(c, out);
  feedingOptions(c, out);
  hoseOptions(c, out);
  cleaningOptions(c, out);
  thingOptions(c, out);
  for (const o of out) {
    const p = actionTarget(s, o);
    o.dist = p ? Math.round(dist(k, p) * 10) / 10 : 0;
    o.timed = o.timed || taskTime(o.ref) > 0;
  }
  // Сначала доступное, потом по важности; при равной важности — ближнее
  return out.sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.priority - a.priority || a.dist - b.dist);
}

const TASK_TIME: Partial<Record<ActionRef['verb'], number>> = {
  shovel: TASK.shovel,
  dumpShovel: TASK.dumpShovel,
  sweep: TASK.sweep,
  mop: TASK.mop,
  wring: TASK.wring,
  rake: TASK.rake,
  sawdust: TASK.sawdust,
  spreadStraw: TASK.straw,
  hoseFloor: TASK.hoseFloor,
  loadFeeder: TASK.loadFeeder,
  scatter: TASK.scatter,
  tossBrowse: TASK.browse,
  fillDrum: TASK.drum,
  scratch: TASK.scratch,
  pet: TASK.pet,
  hand: TASK.hand,
  groom: TASK.groom,
  soap: TASK.soap,
  scrub: TASK.scrub,
  rinse: TASK.rinse,
  shower: TASK.shower,
  hoseWash: TASK.hoseWash,
  handFeed: TASK.handFeed,
  feedPorridge: TASK.feedPorridge,
  tankPlace: TASK.tank,
  tankTake: TASK.tank,
  dumpBarrow: TASK.dump,
  refillPouch: TASK.pouch,
  stow: TASK.stow,
  unstow: TASK.stow,
  wash: TASK.wash,
  chemTrough: TASK.chemTrough,
  scrubTrough: TASK.scrubTrough,
  rinseTrough: TASK.rinseTrough,
  mixPorridge: TASK.mixPorridge,
  placeTub: TASK.tub,
  collectTub: TASK.tub,
  repairHose: TASK.repairHose,
  reelHose: TASK.reelHose,
};

function taskTime(ref: ActionRef): number {
  if (ref.verb === 'voice') return ref.target.endsWith(':talk') ? TASK.talk : 0;
  if (ref.verb === 'take' && ref.target === 'ration') return 2.0;
  if (ref.verb === 'wash' && ref.target === 'emptyTank') return TASK.emptyTank;
  return TASK_TIME[ref.verb] ?? 0;
}

// Нажатие действия: проверить, что оно всё ещё доступно, и запустить (сразу или как работу)
export function performAction(s: State, id: string): boolean {
  if (s.keeper.stun > 0) return false;
  const options = availableActions(s);
  const o = options.find((x) => x.id === id);
  if (!o) return false;
  if (!o.enabled) {
    log(s, 'info', o.reason, { key: `reason:${o.reason}`, cooldown: 0.5, kind: 'refuse' });
    return false;
  }
  const dur = taskTime(o.ref);
  if (dur) {
    s.keeper.task = { action: o.ref, label: o.label, elapsed: 0, dur };
    return true;
  }
  applyAction(s, o.ref);
  return true;
}

export function stepKeeperTask(s: State, dtSec: number): void {
  const task = s.keeper.task;
  if (!task) return;
  task.elapsed += dtSec;
  if (task.elapsed >= task.dur) {
    s.keeper.task = null;
    applyAction(s, task.action);
  }
}

// Эффект действия: здесь всё, что меняет мир
export function applyAction(s: State, ref: ActionRef): void {
  if (applyVoice(s, ref)) return;
  if (applyGate(s, ref)) return;
  if (applyTrough(s, ref)) return;
  if (applyHose(s, ref)) return;
  if (applyCleaning(s, ref)) return;
  if (applyCare(s, ref)) return;
  if (applyFeeding(s, ref)) return;
  applyThing(s, ref);
}

function mid(id: StationId): Vec {
  const r = STATIONS[id].rect;
  return r ? { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 } : STATIONS[id].keeper;
}

const STOCK_STATION: Record<string, StationId> = {
  hay: 'hayStack',
  straw: 'strawStack',
  browse: 'browsePile',
  bamboo: 'bambooPile',
  sawdust: 'sawdustPile',
  chem: 'cabinet',
  washKit: 'cabinet',
  ration: 'vegShelf',
};

// Где в мире находится цель действия — для подсказки-кольца на карте и порядка в списке
export function actionTarget(s: State, o: ActionOption): Vec | null {
  const t = o.ref.target;
  const k = s.keeper;
  const e = s.elephants.find((x) => x.id === t.split(':')[0]);
  const front = (d = 0.7) => ({ x: k.x + Math.cos(k.facing) * d, y: k.y + Math.sin(k.facing) * d });
  switch (o.ref.verb) {
    case 'treat':
    case 'pet':
    case 'scratch':
    case 'hand':
    case 'groom':
    case 'soap':
    case 'scrub':
    case 'rinse':
    case 'shower':
    case 'hoseWash':
    case 'handFeed':
    case 'feedPorridge':
      return e ? (e.lying ? { x: e.x, y: e.y } : headPos(e, 1.6)) : null;
    case 'voice':
      return e ? { x: e.x, y: e.y } : null;
    case 'tankPlace':
      return e ? rearPos(e) : null;
    case 'tankTake': {
      const it = s.world.items.find((x) => String(x.id) === t);
      return it ? { x: it.x, y: it.y } : TANK_HOME;
    }
    case 'gate': {
      const g = GATE_BY_ID[t as GateId];
      return g ? { x: (g.rect.x0 + g.rect.x1) / 2, y: (g.rect.y0 + g.rect.y1) / 2 } : null;
    }
    case 'valve':
      if (t === 'pool') return { x: 44.5, y: 20.4 };
      return STATIONS[t as TroughId]?.valve ?? null;
    case 'drainTrough':
    case 'chemTrough':
    case 'scrubTrough':
    case 'rinseTrough':
      return t in STATIONS ? mid(t as StationId) : null;
    case 'loadFeeder':
      return mid(t.split(':')[0] as StationId);
    case 'take':
    case 'putBack':
      if ((TOOL_KINDS as string[]).includes(t)) return { x: TOOL_SLOTS[t as ToolKind].x, y: TOOL_SLOTS[t as ToolKind].y - 0.4 };
      if (t === 'tank') return TANK_HOME;
      return STOCK_STATION[t] ? mid(STOCK_STATION[t]) : null;
    case 'takeHose':
    case 'reelHose':
    case 'repairHose':
      return HOSE_REEL;
    case 'grabHose':
      return s.world.hose.end;
    case 'pickUp': {
      const it = s.world.items.find((x) => String(x.id) === t);
      return it ? { x: it.x, y: it.y } : null;
    }
    case 'drop':
      return front(0.55);
    case 'stow':
    case 'unstow':
    case 'pushBarrow':
    case 'parkBarrow':
      return { x: s.world.barrow.x, y: s.world.barrow.y };
    case 'dumpBarrow':
      return mid('container');
    case 'dumpShovel':
      return t === 'container' ? mid('container') : { x: s.world.barrow.x, y: s.world.barrow.y };
    case 'shovel': {
      const [kind, id] = t.split(':');
      if (kind === 'cell') return cellCenter(Number(id));
      const list: { id: number; x: number; y: number }[] = kind === 'dung' ? s.world.dung : kind === 'food' ? s.world.food : s.world.items;
      const it = list.find((x) => String(x.id) === id);
      return it ? { x: it.x, y: it.y } : null;
    }
    case 'sweep':
    case 'mop':
    case 'rake':
    case 'hoseFloor':
      return front(0.8);
    case 'sawdust':
    case 'spreadStraw':
      return { x: k.x, y: k.y };
    case 'wring':
    case 'wash':
      return dist(k, STATIONS.washSink.keeper) < dist(k, STATIONS.kitchenSink.keeper) ? mid('washSink') : mid('kitchenSink');
    case 'placeTub': {
      if (areaAt(k.x, k.y)) return front(0.8);
      const c = keeperContact(s);
      return c ? { x: c.line.x, y: c.line.y - 1.1 } : null;
    }
    case 'collectTub': {
      const tub = tubById(s, Number(t));
      return tub ? { x: tub.x, y: tub.y } : null;
    }
    case 'takeTub':
    case 'rackTub': {
      const tub = tubById(s, Number(t));
      return tub?.where === 'prep' ? mid('prepTable') : mid('tubRack');
    }
    case 'prepVeg':
      return mid('prepTable');
    case 'mixPorridge':
      return mid('porridgeStation');
    case 'takePorridge': {
      const it = s.world.items.find((x) => String(x.id) === t);
      return it ? { x: it.x, y: it.y } : mid('porridgeStation');
    }
    case 'refillPouch':
      return mid('fridge');
    case 'journal':
      return mid('desk');
    case 'scatter':
      return areaAt(k.x, k.y) ? { x: k.x, y: k.y } : (keeperContact(s)?.spot ?? null);
    case 'tossBrowse':
      return areaAt(k.x, k.y) ? front(0.9) : (keeperContact(s)?.spot ?? null);
    case 'fillDrum':
      return DRUM;
    default:
      return null;
  }
}
