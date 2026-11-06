// Кипер: движение, контекстные действия и работа, которая занимает время.
// Действия — данные (глагол + цель), поэтому их можно сохранить, повторить в тесте и проверить заново.

import { FLOOR, FOOD, KEEPER, TASK } from '../data/balance';
import {
  BARN,
  BEDDING,
  DOORS,
  DRAIN,
  DRUM,
  GATE,
  HOSE_LENGTH,
  STATIONS,
  inRect,
  zoneAt,
  type DoorDef,
  type StationId,
  type ZoneId,
} from '../data/facility';
import { respondToCall, spook } from './behavior/act';
import { callCompliance } from './behavior/engine';
import { onScratch, onShowerEnjoyed, onTreat } from './behavior/learning';
import { ambientTemp } from './behavior/needs';
import { contactSpotNear, keeperCanTouch, keeperContact, zoneOf } from './behavior/perceive';
import { answerSignal } from './behavior/signals';
import { fx, log } from './events';
import { circleHitsRect, dist, keeperIndex } from './geometry';
import { nameCase } from './herd';
import { random } from './rng';
import type { ActionOption, ActionRef, Elephant, Held, LooseKind, State, StepInput, Verb } from './types';
import { addFood, cellCenter, cellOf, forCells, isBeddingCell, scatterPieces, touchCells, troughSpoiled } from './world';

const HOSE_REEL = { x: 30.6, y: 22.6 };

// ---------------------------------------------------------------------------
// Защищённый контакт: в зону можно войти, только если в ней и во всём, что с ней
// соединено открытыми воротами, нет слонов
// ---------------------------------------------------------------------------

export function zoneEmpty(s: State, zone: ZoneId): boolean {
  for (const e of s.elephants) {
    const z = zoneOf(e);
    if (z === zone || s.world.gateOpen) return false;
  }
  return true;
}

export function doorUnlocked(s: State, d: DoorDef): boolean {
  return zoneEmpty(s, d.zone);
}

export function keeperZone(s: State): ZoneId | null {
  return zoneAt(s.keeper.x, s.keeper.y);
}

function heavy(h: Held | null): boolean {
  return !!h && (h.kind === 'hay' || h.kind === 'straw' || (h.kind === 'ration' && h.portions > 0));
}

function blocked(s: State, x: number, y: number, r: number): boolean {
  if (keeperIndex.hits(x, y, r)) return true;
  if (!s.world.gateOpen && circleHitsRect(x, y, r, GATE)) return true;
  for (const d of DOORS) if (!doorUnlocked(s, d) && circleHitsRect(x, y, r, d.rect)) return true;
  return false;
}

function barrowBlocked(s: State, x: number, y: number): boolean {
  if (keeperIndex.hits(x, y, 0.36)) return true;
  if (!s.world.gateOpen && circleHitsRect(x, y, 0.36, GATE)) return true;
  for (const d of DOORS) if (!doorUnlocked(s, d) && circleHitsRect(x, y, 0.36, d.rect)) return true;
  return false;
}

export function moveKeeper(s: State, input: StepInput, dtSec: number): void {
  const k = s.keeper;
  const len = Math.hypot(input.move.x, input.move.y);
  k.running = input.run && len > 0.1;
  k.moving = false;
  if (len < 0.08) return;
  if (k.task) {
    log(s, 'info', `Прервано: ${k.task.label.toLowerCase()}.`, { silent: true });
    k.task = null;
  }
  const nx = input.move.x / len;
  const ny = input.move.y / len;
  const want = Math.atan2(ny, nx);
  let df = want - k.facing;
  while (df > Math.PI) df -= Math.PI * 2;
  while (df < -Math.PI) df += Math.PI * 2;
  k.facing += Math.sign(df) * Math.min(Math.abs(df), 12 * dtSec);
  const b = s.world.barrow;
  let speed = KEEPER.speed * Math.min(1, len) * (k.running ? KEEPER.runFactor : 1);
  if (heavy(k.held)) speed *= KEEPER.heavyFactor;
  if (b.pushed) speed *= KEEPER.barrowFactor * (1 - 0.15 * (b.load / KEEPER.barrowMax));
  const step = speed * dtSec;
  // Тачка едет впереди; у стены и в дверях она чуть доворачивает, чтобы пройти
  let barrowHeading = b.heading;
  const barrowFits = (x: number, y: number, h: number): number | null => {
    for (const off of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8]) {
      const hh = h + off;
      if (!barrowBlocked(s, x + Math.cos(hh) * 0.95, y + Math.sin(hh) * 0.95)) return hh;
    }
    return null;
  };
  const tryMove = (x: number, y: number): boolean => {
    if (blocked(s, x, y, KEEPER.radius)) return false;
    if (k.held?.kind === 'hose' && Math.hypot(x - HOSE_REEL.x, y - HOSE_REEL.y) > HOSE_LENGTH) return false;
    if (b.pushed) {
      const h = barrowFits(x, y, Math.atan2(y - k.y, x - k.x));
      if (h === null) return false;
      barrowHeading = h;
    }
    k.x = x;
    k.y = y;
    return true;
  };
  const moved = tryMove(k.x + nx * step, k.y + ny * step) || tryMove(k.x + nx * step, k.y) || tryMove(k.x, k.y + ny * step);
  k.moving = moved;
  if (b.pushed && moved) {
    b.heading = barrowHeading;
    b.x = k.x + Math.cos(b.heading) * 0.95;
    b.y = k.y + Math.sin(b.heading) * 0.95;
  }
  void want;
}

// ---------------------------------------------------------------------------
// Контекстные действия
// ---------------------------------------------------------------------------

const HELD_NAMES: Record<Held['kind'], string> = {
  fork: 'вилы',
  rake: 'грабли',
  hose: 'шланг',
  hay: 'тюк сена',
  straw: 'тюк соломы',
  ration: 'ведро с овощами',
  browse: 'охапку веток',
};

export function heldLabel(h: Held | null): string {
  if (!h) return 'руки свободны';
  if ((h.kind === 'fork' || h.kind === 'rake') && h.load > 0) return `${HELD_NAMES[h.kind]} (${h.load}/${KEEPER.toolLoad})`;
  if (h.kind === 'ration') return `ведро с овощами (${h.portions} порц.)`;
  return HELD_NAMES[h.kind];
}

function near(s: State, id: StationId, reach: number = KEEPER.reach): boolean {
  return dist(s.keeper, STATIONS[id].keeper) <= reach;
}

function opt(ref: ActionRef, label: string, priority: number, extra: Partial<ActionOption> = {}): ActionOption {
  return {
    id: `${ref.verb}:${ref.target}`,
    ref,
    label,
    enabled: true,
    reason: '',
    priority,
    elephantId: null,
    timed: false,
    ...extra,
  };
}

function off(ref: ActionRef, label: string, reason: string, priority: number): ActionOption {
  return opt(ref, label, priority, { enabled: false, reason });
}

const ZONE_ACC: Record<ZoneId, string> = { barn: 'слоновник', paddock: 'выгул' };

function barrowNear(s: State): boolean {
  const b = s.world.barrow;
  return !b.pushed && dist(s.keeper, b) <= KEEPER.barrowReach;
}

function wasteRoom(s: State): number {
  const h = s.keeper.held;
  if (barrowNear(s)) return KEEPER.barrowMax - s.world.barrow.load;
  if (h && (h.kind === 'fork' || h.kind === 'rake')) return KEEPER.toolLoad - h.load;
  return 0;
}

function dirtyCellNear(s: State, wantConcrete: boolean | null): number {
  const k = s.keeper;
  const c = s.world.cells;
  let best = -1;
  let bestScore = 0.12;
  forCells(k.x + Math.cos(k.facing) * 0.6, k.y + Math.sin(k.facing) * 0.6, 1.25, (i, cx, cy) => {
    if (!zoneAt(cx, cy)) return;
    const concrete = zoneAt(cx, cy) === 'barn' && !isBeddingCell(i);
    if (wantConcrete !== null && concrete !== wantConcrete) return;
    const v = c.wet[i] * (zoneAt(cx, cy) === 'paddock' ? 0.4 : 1) + c.soil[i];
    if (v > bestScore) {
      bestScore = v;
      best = i;
    }
  });
  return best;
}

export function availableActions(s: State): ActionOption[] {
  const k = s.keeper;
  const w = s.world;
  const h = k.held;
  const out: ActionOption[] = [];
  if (k.task) return out;
  const inZone = keeperZone(s);
  const contact = keeperContact(s);

  // --- Слоны рядом, через решётку ---------------------------------------
  for (const e of s.elephants) {
    if (!keeperCanTouch(s, e)) continue;
    const name = nameCase(e.profile.name, 'acc');
    const signaling = e.signal?.kind;
    const boost = signaling ? 40 : 0;
    if (k.pouch > 0) out.push(opt({ verb: 'treat', target: e.id }, `Угостить ${name}`, 60 + boost + (e.mem.call?.arrivedAt !== undefined && e.mem.call.arrivedAt >= 0 && !e.mem.call.rewarded ? 50 : 0), { elephantId: e.id }));
    else out.push(off({ verb: 'treat', target: e.id }, `Угостить ${name}`, 'Лакомства кончились — пополни в холодильнике на кухне', 20));
    if (h?.kind === 'ration') out.push(opt({ verb: 'handFeed', target: e.id }, `Покормить ${name} с руки`, 70 + (signaling === 'food' ? 50 : 0), { elephantId: e.id, timed: true }));
    if (h?.kind === 'hose') out.push(opt({ verb: 'shower', target: e.id }, `Окатить ${name} из шланга`, 55 + (e.needs.heat > 45 ? 30 : 0), { elephantId: e.id, timed: true }));
    if (!h || h.kind === 'fork' || h.kind === 'rake') out.push(opt({ verb: 'scratch', target: e.id }, `Почесать ${name} за ухом`, 45 + (signaling === 'attention' ? 70 : 0), { elephantId: e.id, timed: true }));
  }

  // --- Зов: кипер у решётки или ограды ---------------------------------
  if (contact && !inZone) {
    const atDrain = near(s, 'trainingWall', 1.5);
    // Звать имеет смысл тех, до кого не дотянуться рукой
    const list = s.elephants
      .filter((e) => (zoneOf(e) === contact.zone || w.gateOpen) && !keeperCanTouch(s, e))
      .sort((a, b) => dist(a, k) - dist(b, k))
      .slice(0, 3);
    for (const e of list) {
      const toilet = e.signal?.kind === 'toilet';
      const acc = nameCase(e.profile.name, 'acc');
      const label = atDrain && contact.zone === 'barn' ? `Позвать ${acc} к стоку` : `Позвать ${acc}`;
      if (e.lying) out.push(off({ verb: 'call', target: e.id }, label, `${e.profile.name} спит`, 8));
      else if (e.act.kind === 'follow') out.push(off({ verb: 'call', target: e.id }, label, `${e.profile.name} уже идёт к тебе`, 8));
      else out.push(opt({ verb: 'call', target: e.id }, label, 30 + (toilet && atDrain ? 120 : 0) + (e.signal ? 20 : 0), { elephantId: e.id }));
    }
  }

  // --- Станции ------------------------------------------------------------
  if (near(s, 'gateControl')) {
    if (w.gateOpen) {
      const inGate = s.elephants.some((e) => Math.abs(e.x - 20) < 3.2 && Math.abs(e.y - 20) < 1.9);
      if (inGate) out.push(off({ verb: 'gate', target: 'gate' }, 'Закрыть ворота', 'В проёме ворот слон — подожди', 90));
      else out.push(opt({ verb: 'gate', target: 'gate' }, 'Закрыть ворота', 90));
    } else {
      const barrowInside = zoneAt(w.barrow.x, w.barrow.y) !== null;
      if (barrowInside) out.push(off({ verb: 'gate', target: 'gate' }, 'Открыть ворота', 'Сначала вывези тачку из вольера', 90));
      else out.push(opt({ verb: 'gate', target: 'gate' }, 'Открыть ворота', 90 + (s.elephants.some((e) => e.signal && e.signal.kind !== 'attention' && e.signal.kind !== 'food' && e.signal.kind !== 'water') ? 60 : 0)));
    }
  }
  for (const id of ['barnWater', 'paddockWater'] as const) {
    if (!near(s, id)) continue;
    const wp = w.water[id];
    const lvl = Math.round(wp.level);
    if (wp.valve) out.push(opt({ verb: 'valve', target: id }, `Закрыть кран (поилка ${lvl}%)`, wp.level >= 95 ? 130 : 85));
    else out.push(opt({ verb: 'valve', target: id }, `Открыть кран поилки (${lvl}%)`, wp.level < 60 ? 88 : 40));
  }
  if (near(s, 'poolValve')) {
    const dirt = Math.round(w.pool.dirt * 100);
    out.push(opt({ verb: 'valve', target: 'pool' }, w.pool.valve ? `Закрыть кран бассейна (муть ${dirt}%)` : `Освежить воду в бассейне (муть ${dirt}%)`, w.pool.valve ? 60 : 35));
  }
  if (near(s, 'hoseReel')) {
    if (h?.kind === 'hose') out.push(opt({ verb: 'returnHose', target: 'hose' }, 'Смотать шланг', 50));
    else if (!h && w.tools.hose) out.push(opt({ verb: 'takeHose', target: 'hose' }, 'Взять шланг', 50));
  }
  if (near(s, 'toolRack')) {
    if (!h) {
      if (w.tools.fork) out.push(opt({ verb: 'takeTool', target: 'fork' }, 'Взять вилы для навоза', 55));
      if (w.tools.rake) out.push(opt({ verb: 'takeTool', target: 'rake' }, 'Взять грабли', 54));
    } else if (h.kind === 'fork' || h.kind === 'rake') {
      if (h.load > 0) out.push(off({ verb: 'returnTool', target: h.kind }, `Повесить ${HELD_NAMES[h.kind]}`, 'Сначала высыпи мусор в тачку или контейнер', 50));
      else out.push(opt({ verb: 'returnTool', target: h.kind }, `Повесить ${HELD_NAMES[h.kind]} на стойку`, 50));
    }
  }
  if (near(s, 'hayStack') && !h) {
    if (w.stock.hay > 0) out.push(opt({ verb: 'takeHay', target: 'hay' }, `Взять тюк сена (${w.stock.hay})`, 55));
    else out.push(off({ verb: 'takeHay', target: 'hay' }, 'Взять тюк сена', 'Сено кончилось — привоз утром', 55));
  }
  if (near(s, 'strawStack') && !h) {
    if (w.stock.straw > 0) out.push(opt({ verb: 'takeStraw', target: 'straw' }, `Взять тюк соломы (${w.stock.straw})`, 55));
    else out.push(off({ verb: 'takeStraw', target: 'straw' }, 'Взять тюк соломы', 'Солома кончилась — привоз утром', 55));
  }
  if (near(s, 'browsePile') && !h) {
    if (w.stock.browse > 0) out.push(opt({ verb: 'takeBrowse', target: 'browse' }, `Взять охапку веток (${w.stock.browse})`, 55));
    else out.push(off({ verb: 'takeBrowse', target: 'browse' }, 'Взять охапку веток', 'Ветки кончились — привоз утром', 55));
  }
  if ((near(s, 'prepTable') || near(s, 'shelf')) && !h) {
    if (w.stock.produce > 0) out.push(opt({ verb: 'prepRation', target: 'prep' }, `Нарезать овощи в ведро (ящиков: ${w.stock.produce})`, 56, { timed: true }));
    else out.push(off({ verb: 'prepRation', target: 'prep' }, 'Нарезать овощи', 'Овощи кончились — привоз утром', 56));
  }
  if (near(s, 'fridge')) {
    if (k.pouch < FOOD.pouchMax) out.push(opt({ verb: 'refillPouch', target: 'fridge' }, `Набрать лакомств в поясную сумку (${k.pouch}/${FOOD.pouchMax})`, 52, { timed: true }));
    else out.push(off({ verb: 'refillPouch', target: 'fridge' }, 'Набрать лакомств', 'Сумка полна', 20));
  }
  if (near(s, 'desk')) out.push(opt({ verb: 'journal', target: 'desk' }, 'Открыть журнал смены', 30));
  if (h?.kind === 'hay') {
    for (const id of ['barnRack', 'paddockFeeder'] as const) {
      if (!near(s, id, 1.6)) continue;
      const lvl = Math.round(w.hay[id]);
      if (lvl >= FOOD.feederMax - 5) out.push(off({ verb: 'loadHay', target: id }, `Положить сено (${lvl}%)`, 'Кормушка полна', 80));
      else out.push(opt({ verb: 'loadHay', target: id }, `Положить сено в кормушку (${lvl}%)`, 95, { timed: true }));
    }
  }
  if (near(s, 'barnTrough', 1.5)) {
    if (troughSpoiled(s)) {
      if (h?.kind === 'fork') out.push(opt({ verb: 'clearTrough', target: 'trough' }, 'Вычистить испорченные овощи', 110, { timed: true }));
      else out.push(off({ verb: 'clearTrough', target: 'trough' }, 'Вычистить кормушку', 'Нужны вилы: овощи испортились', 60));
    } else if (h?.kind === 'ration') out.push(opt({ verb: 'fillTrough', target: 'trough' }, 'Высыпать овощи в кормушку', 100, { timed: true }));
  }
  if (contact && !inZone && h?.kind === 'ration') {
    out.push(opt({ verb: 'scatter', target: contact.zone }, `Разбросать овощи по вольеру (${ZONE_ACC[contact.zone]})`, 62, { timed: true }));
  }
  if (contact && !inZone && h?.kind === 'browse') {
    out.push(opt({ verb: 'tossBrowse', target: contact.zone }, `Бросить ветки за ${contact.zone === 'barn' ? 'решётку' : 'ограду'}`, 92, { timed: true }));
  }
  if (inZone === 'paddock' && dist(k, DRUM) < 2.2 && h?.kind === 'ration') {
    out.push(opt({ verb: 'fillDrum', target: 'drum' }, `Заправить кормовой барабан (${Math.round(w.drum * 10) / 10}/${FOOD.drumMax})`, 96, { timed: true }));
  }

  // --- Тачка и контейнер ----------------------------------------------
  const b = w.barrow;
  if (b.pushed) {
    out.push(opt({ verb: 'parkBarrow', target: 'barrow' }, 'Оставить тачку', 40));
    if (near(s, 'container', 2.4) && b.load > 0) {
      if (w.container >= KEEPER.containerMax) out.push(off({ verb: 'dumpBarrow', target: 'container' }, 'Высыпать тачку', 'Контейнер полон — его вывозят утром', 100));
      else out.push(opt({ verb: 'dumpBarrow', target: 'container' }, `Высыпать тачку в контейнер (${b.load}/${KEEPER.barrowMax})`, 100, { timed: true }));
    }
  } else if (dist(k, b) < 1.7 && (!h || h.kind === 'fork' || h.kind === 'rake')) {
    out.push(opt({ verb: 'pushBarrow', target: 'barrow' }, `Взять тачку (${b.load}/${KEEPER.barrowMax})`, 36));
  }
  if (h && (h.kind === 'fork' || h.kind === 'rake') && h.load > 0) {
    if (near(s, 'container', 2.4)) {
      if (w.container >= KEEPER.containerMax) out.push(off({ verb: 'emptyTool', target: 'container' }, 'Высыпать в контейнер', 'Контейнер полон', 70));
      else out.push(opt({ verb: 'emptyTool', target: 'container' }, 'Высыпать в контейнер', 98, { timed: true }));
    } else if (barrowNear(s) && b.load < KEEPER.barrowMax) out.push(opt({ verb: 'emptyTool', target: 'barrow' }, 'Высыпать в тачку', 97, { timed: true }));
  }

  // --- Уборка внутри пустой зоны ----------------------------------------
  if (inZone && !b.pushed) {
    const reachDung = w.dung.filter((d) => dist(d, k) <= 1.35).sort((p, q) => dist(p, k) - dist(q, k))[0];
    const remains = w.food.filter((f) => f.kind === 'remains' && dist(f, k) <= 1.35).sort((p, q) => dist(p, k) - dist(q, k))[0];
    if (h?.kind === 'fork') {
      const room = wasteRoom(s);
      if (reachDung) {
        if (room > 0) out.push(opt({ verb: 'fork', target: `dung:${reachDung.id}` }, barrowNear(s) ? 'Убрать навоз в тачку' : 'Подцепить навоз вилами', 120, { timed: true }));
        else out.push(off({ verb: 'fork', target: `dung:${reachDung.id}` }, 'Убрать навоз', 'Вилы полны — подкати тачку или высыпи в контейнер', 120));
      } else if (remains) {
        if (room > 0) out.push(opt({ verb: 'fork', target: `food:${remains.id}` }, 'Убрать объедки', 110, { timed: true }));
        else out.push(off({ verb: 'fork', target: `food:${remains.id}` }, 'Убрать объедки', 'Вилы полны', 110));
      } else if (dirtyCellNear(s, null) >= 0) {
        out.push(off({ verb: 'rake', target: 'none' }, 'Вычистить подстилку', 'Мокрое и грязь убирают граблями', 20));
      }
    }
    if (h?.kind === 'rake') {
      const cell = dirtyCellNear(s, null);
      if (cell >= 0) {
        const room = wasteRoom(s);
        const wet = w.cells.wet[cell] > w.cells.soil[cell];
        const label = wet ? 'Убрать мокрую подстилку' : 'Сгрести грязь';
        if (room > 0) out.push(opt({ verb: 'rake', target: String(cell) }, barrowNear(s) ? `${label} в тачку` : label, 115, { timed: true }));
        else out.push(off({ verb: 'rake', target: String(cell) }, label, 'Грабли полны — подкати тачку или высыпи в контейнер', 115));
      } else if (reachDung) out.push(off({ verb: 'fork', target: 'none' }, 'Убрать навоз', 'Кучи убирают вилами', 20));
    }
    if (h?.kind === 'hose' && inZone === 'barn') {
      const cell = dirtyCellNear(s, true);
      if (cell >= 0) out.push(opt({ verb: 'hose', target: String(cell) }, 'Смыть с бетона в сток', 112, { timed: true }));
    }
    if (h?.kind === 'straw' && inZone === 'barn' && inRect(BEDDING, k.x, k.y)) {
      const st = strawTargets(s);
      if (st.dirty > 0 && st.bare === 0) out.push(off({ verb: 'spreadStraw', target: 'here' }, 'Расстелить солому', 'Здесь мокро или грязно — сначала грабли', 100));
      else if (st.bare > 0) out.push(opt({ verb: 'spreadStraw', target: 'here' }, `Расстелить солому (${st.bare} м²)`, 105, { timed: true }));
      else out.push(off({ verb: 'spreadStraw', target: 'here' }, 'Расстелить солому', 'Здесь подстилка и так свежая', 30));
    }
  }

  // --- Вещи на полу -------------------------------------------------------
  if (!h && !b.pushed) {
    const it = w.items.filter((x) => dist(x, k) <= 1.15).sort((p, q) => dist(p, k) - dist(q, k))[0];
    if (it) out.push(opt({ verb: 'pickUp', target: String(it.id) }, `Поднять: ${HELD_NAMES[it.kind]}`, 75));
  }
  if (h && !b.pushed) out.push(opt({ verb: 'drop', target: 'held' }, h.kind === 'hose' ? 'Отпустить шланг (смотается сам)' : `Положить ${HELD_NAMES[h.kind]}`, 5));

  return out.sort((p, q) => Number(q.enabled) - Number(p.enabled) || q.priority - p.priority);
}

function strawTargets(s: State): { bare: number; dirty: number } {
  const k = s.keeper;
  const c = s.world.cells;
  let bare = 0;
  let dirty = 0;
  forCells(k.x, k.y, FLOOR.baleRadius, (i) => {
    if (!isBeddingCell(i)) return;
    if (c.wet[i] > 0.2 || c.soil[i] > 0.2) dirty++;
    else if (c.bedding[i] < 0.7) bare++;
  });
  return { bare, dirty };
}

const TASK_TIME: Partial<Record<Verb, number>> = {
  fork: TASK.fork,
  rake: TASK.rake,
  hose: TASK.hose,
  spreadStraw: TASK.straw,
  loadHay: TASK.hay,
  prepRation: TASK.prep,
  fillTrough: TASK.ration,
  scatter: TASK.scatter,
  tossBrowse: TASK.browse,
  scratch: TASK.scratch,
  shower: TASK.shower,
  handFeed: TASK.handFeed,
  fillDrum: TASK.drum,
  dumpBarrow: TASK.dump,
  emptyTool: TASK.dump * 0.6,
  refillPouch: TASK.pouch,
  clearTrough: TASK.clearTrough,
};

// Нажатие действия: проверить, что оно всё ещё доступно, и запустить (сразу или как работу)
export function performAction(s: State, id: string): boolean {
  const options = availableActions(s);
  const o = options.find((x) => x.id === id);
  if (!o) return false;
  if (!o.enabled) {
    log(s, 'info', o.reason, { key: `reason:${o.reason}`, cooldown: 0.5 });
    return false;
  }
  if (o.ref.verb === 'journal') return true;
  const dur = TASK_TIME[o.ref.verb];
  if (dur) {
    s.keeper.task = { action: o.ref, label: o.label, elapsed: 0, dur };
    if (o.ref.verb === 'shower') fx('hose', s.keeper.x, s.keeper.y);
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

function elephantBy(s: State, id: string): Elephant | undefined {
  return s.elephants.find((e) => e.id === id);
}

function addWaste(s: State, units: number): boolean {
  const h = s.keeper.held;
  const b = s.world.barrow;
  if (barrowNear(s) && b.load + units <= KEEPER.barrowMax) {
    b.load += units;
    return true;
  }
  if (h && (h.kind === 'fork' || h.kind === 'rake') && h.load + units <= KEEPER.toolLoad) {
    h.load += units;
    return true;
  }
  return false;
}

// Эффект действия: здесь всё, что меняет мир
export function applyAction(s: State, ref: ActionRef): void {
  const k = s.keeper;
  const w = s.world;
  const h = k.held;
  const e = elephantBy(s, ref.target);
  switch (ref.verb) {
    case 'takeTool':
      if (ref.target === 'fork' || ref.target === 'rake') {
        w.tools[ref.target] = false;
        k.held = { kind: ref.target, load: 0 };
      }
      break;
    case 'returnTool':
      if (h && (h.kind === 'fork' || h.kind === 'rake')) {
        w.tools[h.kind] = true;
        k.held = null;
      }
      break;
    case 'takeHose':
      w.tools.hose = false;
      k.held = { kind: 'hose' };
      break;
    case 'returnHose':
      w.tools.hose = true;
      k.held = null;
      break;
    case 'takeHay':
      if (w.stock.hay > 0) {
        w.stock.hay--;
        k.held = { kind: 'hay' };
      }
      break;
    case 'takeStraw':
      if (w.stock.straw > 0) {
        w.stock.straw--;
        k.held = { kind: 'straw' };
      }
      break;
    case 'takeBrowse':
      if (w.stock.browse > 0) {
        w.stock.browse--;
        k.held = { kind: 'browse' };
      }
      break;
    case 'prepRation':
      if (w.stock.produce > 0 && !k.held) {
        w.stock.produce--;
        k.held = { kind: 'ration', portions: Math.max(FOOD.rationPortions, s.elephants.length) };
        fx('chop', k.x, k.y);
      }
      break;
    case 'refillPouch':
      k.pouch = FOOD.pouchMax;
      break;
    case 'loadHay':
      if (h?.kind === 'hay' && (ref.target === 'barnRack' || ref.target === 'paddockFeeder')) {
        w.hay[ref.target] = Math.min(FOOD.feederMax, w.hay[ref.target] + FOOD.bale);
        k.held = null;
        fx('hay', STATIONS[ref.target].reach!.x, STATIONS[ref.target].reach!.y);
      }
      break;
    case 'fillTrough':
      if (h?.kind === 'ration') {
        if (w.trough.portions <= 0.05) w.trough.since = s.t;
        w.trough.portions += h.portions;
        k.held = null;
        fx('produce', STATIONS.barnTrough.reach!.x, STATIONS.barnTrough.reach!.y);
      }
      break;
    case 'clearTrough':
      if (troughSpoiled(s)) {
        w.trough.portions = 0;
        if (!addWaste(s, 1)) w.container = Math.min(KEEPER.containerMax, w.container + 1);
      }
      break;
    case 'handFeed':
      if (e && h?.kind === 'ration' && h.portions > 0 && keeperCanTouch(s, e)) {
        h.portions--;
        e.needs.hunger = Math.max(0, e.needs.hunger - FOOD.portionHunger);
        e.day.ate += FOOD.portionHunger;
        onTreat(s, e);
        if (e.signal?.kind === 'food') answerSignal(s, e, 'покормили с руки');
        if (e.signal?.kind === 'attention') answerSignal(s, e, 'покормили с руки');
        s.dailyKeeper.interactions++;
        if (h.portions <= 0) k.held = null;
        fx('munch', e.x, e.y, e.id);
      }
      break;
    case 'scatter': {
      if (h?.kind !== 'ration') break;
      const zone = ref.target as ZoneId;
      const spot = contactSpotNear(zone, k.x, k.y);
      if (!spot) break;
      const placed = scatterPieces(s, spot.spot.x, spot.spot.y - (zone === 'paddock' ? 1.5 : 0.5), zone, h.portions * FOOD.scatterPieces, 'produce', FOOD.portionHunger / FOOD.scatterPieces);
      k.held = null;
      fx('scatter', spot.line.x, spot.line.y);
      log(s, 'info', `Овощи разбросаны (${placed} кусков) — слонам есть что поискать.`, { silent: true });
      break;
    }
    case 'tossBrowse': {
      if (h?.kind !== 'browse') break;
      const zone = ref.target as ZoneId;
      const spot = contactSpotNear(zone, k.x, k.y);
      if (!spot) break;
      addFood(s, 'browse', spot.spot.x + (random(s) - 0.5) * 2, spot.spot.y - 0.6, 1, zone);
      k.held = null;
      fx('browse', spot.line.x, spot.line.y);
      break;
    }
    case 'fillDrum':
      if (h?.kind === 'ration') {
        w.drum = Math.min(FOOD.drumMax, w.drum + h.portions);
        k.held = null;
        fx('drum', DRUM.x, DRUM.y);
      }
      break;
    case 'fork': {
      const [kind, idStr] = ref.target.split(':');
      const id = Number(idStr);
      if (kind === 'dung') {
        const d = w.dung.find((x) => x.id === id);
        if (d && addWaste(s, 1)) {
          w.dung = w.dung.filter((x) => x !== d);
          fx('shovel', d.x, d.y);
        }
      } else if (kind === 'food') {
        const f = w.food.find((x) => x.id === id);
        if (f && addWaste(s, 1)) {
          w.food = w.food.filter((x) => x !== f);
          fx('shovel', f.x, f.y);
        }
      }
      break;
    }
    case 'rake': {
      const cell = Number(ref.target);
      if (!Number.isFinite(cell) || cell < 0) break;
      const c = w.cells;
      const p = cellCenter(cell);
      let removed = 0;
      forCells(p.x, p.y, FLOOR.rakeRadius, (i, cx, cy) => {
        if (!zoneAt(cx, cy)) return;
        const dirty = c.wet[i] * (zoneAt(cx, cy) === 'paddock' ? 0.4 : 1) + c.soil[i];
        if (dirty < 0.1) return;
        removed += dirty;
        c.soil[i] = 0;
        if (zoneAt(cx, cy) === 'barn') {
          c.wet[i] = 0;
          if (isBeddingCell(i)) c.bedding[i] = 0; // мокрую солому выносят — под ней голый песок
        } else c.wet[i] = Math.max(0, c.wet[i] - 0.6);
      });
      if (removed > 0 && addWaste(s, 1)) {
        touchCells(s);
        fx('rake', p.x, p.y);
      }
      break;
    }
    case 'hose': {
      const cell = Number(ref.target);
      const p = cellCenter(cell);
      forCells(p.x, p.y, FLOOR.hoseRadius, (i, cx, cy) => {
        if (zoneAt(cx, cy) !== 'barn' || isBeddingCell(i)) return;
        w.cells.soil[i] = 0;
        w.cells.wet[i] = Math.hypot(cx - DRAIN.x, cy - DRAIN.y) < 3 ? 0 : 0.15;
      });
      touchCells(s);
      fx('spray', p.x, p.y);
      break;
    }
    case 'spreadStraw': {
      if (h?.kind !== 'straw') break;
      const c = w.cells;
      forCells(k.x, k.y, FLOOR.baleRadius, (i) => {
        if (!isBeddingCell(i) || c.wet[i] > 0.2 || c.soil[i] > 0.2) return;
        c.bedding[i] = 1;
      });
      touchCells(s);
      k.held = null;
      fx('straw', k.x, k.y);
      break;
    }
    case 'emptyTool':
      if (h && (h.kind === 'fork' || h.kind === 'rake') && h.load > 0) {
        if (ref.target === 'container') {
          w.container = Math.min(KEEPER.containerMax, w.container + h.load);
          h.load = 0;
        } else if (barrowNear(s)) {
          const put = Math.min(h.load, KEEPER.barrowMax - w.barrow.load);
          w.barrow.load += put;
          h.load -= put;
        }
        fx('dump', k.x, k.y);
      }
      break;
    case 'pushBarrow':
      w.barrow.pushed = true;
      w.barrow.heading = Math.atan2(w.barrow.y - k.y, w.barrow.x - k.x);
      k.facing = w.barrow.heading;
      w.barrow.x = k.x + Math.cos(w.barrow.heading) * 0.95;
      w.barrow.y = k.y + Math.sin(w.barrow.heading) * 0.95;
      break;
    case 'parkBarrow':
      w.barrow.pushed = false;
      break;
    case 'dumpBarrow': {
      const put = Math.min(w.barrow.load, KEEPER.containerMax - w.container);
      w.container += put;
      w.barrow.load -= put;
      fx('dump', w.barrow.x, w.barrow.y);
      break;
    }
    case 'valve':
      if (ref.target === 'pool') w.pool.valve = !w.pool.valve;
      else if (ref.target === 'barnWater' || ref.target === 'paddockWater') {
        const wp = w.water[ref.target];
        wp.valve = !wp.valve;
        wp.overflow = 0;
      }
      fx('valve', k.x, k.y);
      break;
    case 'gate':
      w.gateOpen = !w.gateOpen;
      fx('gate', 20, 20);
      log(s, 'info', w.gateOpen ? 'Ворота между слоновником и выгулом открыты.' : 'Ворота закрыты.', { silent: true, kind: 'gate', x: 20, y: 20 });
      break;
    case 'treat':
      if (e && k.pouch > 0 && keeperCanTouch(s, e)) {
        k.pouch--;
        e.needs.hunger = Math.max(0, e.needs.hunger - 2);
        e.needs.boredom = Math.max(0, e.needs.boredom - 4);
        e.needs.stress = Math.max(0, e.needs.stress - 3);
        e.day.treats++;
        s.dailyKeeper.treats++;
        s.dailyKeeper.interactions++;
        const reward = onTreat(s, e);
        if (e.signal?.kind === 'attention') answerSignal(s, e, 'угостили');
        fx('treat', e.x, e.y, e.id);
        if (reward) log(s, 'good', `${e.profile.name} получила награду за то, что пришла на зов.`, { elephantId: e.id, silent: true });
      }
      break;
    case 'scratch':
      if (e && keeperCanTouch(s, e)) {
        const T = e.profile.traits;
        s.dailyKeeper.interactions++;
        if (e.learned.trust > 0.22 + 0.4 * T.nervousness) {
          onScratch(e);
          e.needs.social = Math.max(0, e.needs.social - 12);
          e.needs.boredom = Math.max(0, e.needs.boredom - 6);
          e.needs.stress = Math.max(0, e.needs.stress - 6);
          if (e.signal?.kind === 'attention') answerSignal(s, e, 'почесали за ухом');
          fx('heart', e.x, e.y, e.id);
        } else {
          e.needs.stress = Math.min(100, e.needs.stress + 3);
          log(s, 'info', `${e.profile.name} отстранилась — пока не доверяет настолько.`, { key: `shy:${e.id}`, cooldown: 20, elephantId: e.id });
        }
      }
      break;
    case 'shower':
      if (e && h?.kind === 'hose') {
        const T = e.profile.traits;
        const temp = ambientTemp(s, e);
        const joy = 0.6 * T.playfulness + 0.8 * (e.needs.heat / 100) + 0.3 * e.learned.trust - 0.5 * T.nervousness - (temp < 17 ? 0.4 : 0);
        s.dailyKeeper.interactions++;
        if (joy > 0.28) {
          e.wet = 1;
          e.needs.heat = Math.max(0, e.needs.heat - 30);
          e.needs.boredom = Math.max(0, e.needs.boredom - 8);
          onShowerEnjoyed(e);
          if (e.signal?.kind === 'attention') answerSignal(s, e, 'окатили из шланга');
          fx('spray', e.x, e.y, e.id);
          log(s, 'good', `${e.profile.name} подставляет бока под струю — довольна.`, { elephantId: e.id, silent: true });
        } else {
          e.needs.stress = Math.min(100, e.needs.stress + 8);
          spook(s, e, k, 'уходит от струи воды');
          log(s, 'info', `${e.profile.name} не любит душ${temp < 17 ? ' в прохладу' : ''} и отходит.`, { key: `shower:${e.id}`, cooldown: 30, elephantId: e.id });
        }
      }
      break;
    case 'call':
      if (e) callElephant(s, e);
      break;
    case 'pickUp': {
      const it = w.items.find((x) => String(x.id) === ref.target);
      if (it && !k.held) {
        w.items = w.items.filter((x) => x !== it);
        k.held = toHeld(it.kind, it.portions);
      }
      break;
    }
    case 'drop':
      if (h) {
        if (h.kind === 'hose') {
          w.tools.hose = true;
        } else {
          const kind: LooseKind = h.kind;
          const portions = h.kind === 'ration' ? h.portions : h.kind === 'fork' || h.kind === 'rake' ? h.load : 0;
          w.items.push({ id: s.nextId++, kind, x: k.x + Math.cos(k.facing) * 0.55, y: k.y + Math.sin(k.facing) * 0.55, portions });
        }
        k.held = null;
      }
      break;
    case 'journal':
      break;
  }
}

function toHeld(kind: LooseKind, portions: number): Held {
  switch (kind) {
    case 'fork':
    case 'rake':
      return { kind, load: portions };
    case 'ration':
      return { kind: 'ration', portions };
    case 'hay':
      return { kind: 'hay' };
    case 'straw':
      return { kind: 'straw' };
    case 'browse':
      return { kind: 'browse' };
  }
}

// Позвать слона к себе (или к стоку). Пойдёт или нет — решает слон
export function callElephant(s: State, e: Elephant): void {
  const k = s.keeper;
  const contact = keeperContact(s);
  if (!contact) return;
  s.dailyKeeper.calls++;
  const atDrain = contact.zone === 'barn' && near(s, 'trainingWall', 1.5);
  const p = callCompliance(e, k.pouch > 0, atDrain);
  if (random(s) < p) {
    s.dailyKeeper.callsObeyed++;
    const spot = atDrain ? STATIONS.trainingWall.slots![0] : { x: contact.spot.x, y: contact.spot.y, face: contact.face };
    if (e.signal?.kind === 'toilet' && atDrain) answerSignal(s, e, 'позвали к стоку');
    else if (e.signal?.kind === 'attention') answerSignal(s, e, 'кипер позвал');
    else if (e.signal) e.signal = null;
    respondToCall(s, e, spot, spot.face, atDrain ? 'идёт к стоку на зов' : 'идёт на зов кипера');
    fx('call', k.x, k.y, e.id);
  } else {
    e.day.refusals++;
    const why = e.lying ? 'спит' : e.act.kind === 'eat' ? 'занята едой' : e.act.kind === 'play' ? 'увлечена игрой' : e.needs.stress > 50 ? 'нервничает' : 'не хочет';
    log(s, 'info', `${e.profile.name} не пошла на зов — ${why}.`, { key: `refuse:${e.id}`, cooldown: 3, elephantId: e.id, x: e.x, y: e.y, kind: 'refuse' });
    fx('refuse', e.x, e.y, e.id);
  }
}

export function inBarnRect(x: number, y: number): boolean {
  return inRect(BARN, x, y);
}

export { cellOf };
