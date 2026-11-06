// Корм и кормокухня: сено и солома в кормушки (в руках или из тачки), овощи — разбросать,
// ветки и бамбук — рядом со слонами или через ограду выгула, кормовой барабан, тазы со стеллажа,
// нарезка овощей в таз
// (мини-игра), каша по рациону SlonVet (замешать → запарить 60 мин → покормить), мойки, журнал.

import { FOOD, KEEPER } from '../../data/balance';
import { DRUM, FEEDER_IDS, STATIONS, areaAt, type FeederId } from '../../data/facility';
import { DIETS, PORRIDGE_SOAK_MIN, VEG_KINDS, VEG_LABEL, vegPlan, type VegKind } from '../../data/rations';
import { contactSpotNear, keeperContact } from '../behavior/perceive';
import { fx, log } from '../events';
import { dist } from '../geometry';
import { nameCase } from '../herd';
import { random } from '../rng';
import { shiftDay } from '../time';
import type { ActionOption, ActionRef, State } from '../types';
import { addFood, scatterPieces, tubById, tubKg } from '../world';
import { near, off, opt, ownerName, type KCtx } from './common';

export function feedingOptions(c: KCtx, out: ActionOption[]): void {
  const { s, k, w, h } = c;
  // Кормушки: сено и солома лежат отдельно — солома сено не вытесняет
  for (const id of FEEDER_IDS) {
    if (!near(s, id, 1.6)) continue;
    const f = w.feeders[id];
    const group = STATIONS[id].label;
    const hayLvl = Math.round(f.hay);
    if (h?.kind === 'hay') {
      if (f.hay >= FOOD.feederMax - 5) out.push(off({ verb: 'loadFeeder', target: `${id}:hay` }, `Положить сено (${hayLvl}%)`, 'Сено в кормушке до верха', 80, { group }));
      else out.push(opt({ verb: 'loadFeeder', target: `${id}:hay` }, `Положить сено в кормушку (${hayLvl}%)`, 95, { group, timed: true }));
    }
    if (h?.kind === 'straw') {
      if (f.straw >= FOOD.strawMax - 5) out.push(off({ verb: 'loadFeeder', target: `${id}:straw` }, 'Положить солому в кормушку', 'Соломы и так много', 30, { group }));
      else out.push(opt({ verb: 'loadFeeder', target: `${id}:straw` }, 'Положить солому в кормушку (едят без охоты и растаскивают)', 45, { group, timed: true }));
    }
    // Из тачки, если она стоит рядом
    const b = w.barrow;
    if (!h && !b.pushed && dist(b, STATIONS[id].keeper) < 2.8) {
      if (b.cargo.some((x) => x.kind === 'hay') && f.hay < FOOD.feederMax - 5) out.push(opt({ verb: 'loadFeeder', target: `${id}:barrowHay` }, `Сено из тачки — в кормушку (${hayLvl}%)`, 94, { group, timed: true }));
      if (b.cargo.some((x) => x.kind === 'straw') && f.straw < FOOD.strawMax - 5) out.push(opt({ verb: 'loadFeeder', target: `${id}:barrowStraw` }, 'Солому из тачки — в кормушку', 40, { group, timed: true }));
    }
  }
  const contact = c.contact ?? keeperContact(s);
  // Разбросать овощи, положить ветки и бамбук: среди слонов — вокруг себя, с дорожки — через ограду
  if ((c.area || contact) && h?.kind === 'ration' && h.load > 0) {
    out.push(opt({ verb: 'scatter', target: c.area ?? contact!.area }, c.area ? 'Разбросать овощи вокруг себя' : 'Разбросать овощи по выгулу через ограду', 62, { group: 'Корм', timed: true }));
  }
  if ((c.area || contact) && (h?.kind === 'browse' || h?.kind === 'bamboo')) {
    const what = h.kind === 'bamboo' ? 'бамбук' : 'ветки';
    out.push(opt({ verb: 'tossBrowse', target: c.area ?? contact!.area }, c.area ? `Положить ${what} здесь` : `Бросить ${what} через ограду`, 92, { group: 'Корм', timed: true }));
  }
  if (c.area === 'paddock' && dist(k, DRUM) < 2.2 && h?.kind === 'ration' && h.load > 0) {
    out.push(opt({ verb: 'fillDrum', target: 'drum' }, `Заправить кормовой барабан (${Math.round(w.drum * 10) / 10}/${FOOD.drumMax})`, 96, { group: 'Барабан', timed: true }));
  }
  kitchenOptions(c, out);
}

function kitchenOptions(c: KCtx, out: ActionOption[]): void {
  const { s, k, w, h } = c;
  const busy = h || c.pushing;
  // Ведро овощей для разбрасывания и кормления с руки
  if (near(s, 'vegShelf', 1.4)) {
    const group = STATIONS.vegShelf.label;
    const kg = VEG_KINDS.reduce((a, v) => a + w.stock.veg[v], 0);
    const ref: ActionRef = { verb: 'take', target: 'ration' };
    const portions = Math.max(FOOD.rationPortions, s.elephants.length);
    if (kg < portions * 2) out.push(off(ref, 'Набрать ведро овощей', 'Овощи кончились — привоз утром', 40, { group }));
    else if (busy) out.push(off(ref, 'Набрать ведро овощей', 'Руки заняты', 40, { group }));
    else out.push(opt(ref, `Набрать ведро нарезанных овощей (${portions} порц.) — разбросать или с руки`, 50, { group, timed: true }));
  }
  // Стеллаж с тазами
  if (near(s, 'tubRack', 1.5)) {
    const group = STATIONS.tubRack.label;
    for (const tub of w.tubs) {
      if (tub.where !== 'rack') continue;
      const name = ownerName(s, tub.owner);
      const ref: ActionRef = { verb: 'takeTub', target: String(tub.id) };
      if (busy) out.push(off(ref, `Взять таз ${nameCase(name, 'gen')}`, 'Руки заняты', 30, { group }));
      else out.push(opt(ref, `Взять таз ${nameCase(name, 'gen')}`, 52, { group }));
    }
    if (h?.kind === 'tub') {
      const tub = tubById(s, h.aux);
      const ref: ActionRef = { verb: 'rackTub', target: String(h.aux) };
      if (tub && (tubKg(tub) > 0.3 || tub.dirty || tub.broken)) out.push(off(ref, 'Поставить таз на стеллаж', tub.broken ? 'Таз разбит — выброси в контейнер' : tubKg(tub) > 0.3 ? 'Таз не пустой' : 'Сначала помой таз в мойке', 30, { group }));
      else out.push(opt(ref, 'Поставить таз на стеллаж', 48, { group }));
    }
  }
  // Разделочный стол: нарезка овощей в таз
  if (near(s, 'prepTable', 1.5)) {
    const group = STATIONS.prepTable.label;
    const onTable = w.tubs.find((t) => t.where === 'prep');
    if (h?.kind === 'tub' && !onTable) {
      const tub = tubById(s, h.aux);
      if (tub && (tub.dirty || tub.broken)) out.push(off({ verb: 'prepVeg', target: String(h.aux) }, 'Нарезать овощи в таз', tub.broken ? 'Таз разбит' : 'Таз грязный — сначала помой', 40, { group }));
      else if (tub) out.push(opt({ verb: 'prepVeg', target: String(h.aux) }, `Нарезать овощи в таз ${nameCase(ownerName(s, tub.owner), 'gen')}`, 70, { group }));
    }
    if (onTable && !busy) {
      const name = ownerName(s, onTable.owner);
      out.push(opt({ verb: 'prepVeg', target: String(onTable.id) }, `Продолжить нарезку в таз ${nameCase(name, 'gen')} (${Math.round(tubKg(onTable))} кг)`, 72, { group }));
      out.push(opt({ verb: 'takeTub', target: String(onTable.id) }, `Взять таз ${nameCase(name, 'gen')} со стола`, 60, { group }));
    }
  }
  // Каши: замешать по рациону, запарить, взять готовую
  if (near(s, 'porridgeStation', 1.5)) {
    const group = STATIONS.porridgeStation.label;
    for (const e of s.elephants) {
      const diet = DIETS[e.profile.habits.diet];
      const has = w.items.find((it) => it.kind === 'porridge' && it.owner === e.id && it.load > 0 && dist(it, STATIONS.porridgeStation.keeper) < 2.5);
      if (has) {
        const soak = s.t - has.aux;
        const ref: ActionRef = { verb: 'takePorridge', target: String(has.id) };
        if (soak < PORRIDGE_SOAK_MIN) out.push(off(ref, `Каша для ${nameCase(e.profile.name, 'gen')}`, `Запаривается: ${Math.floor(soak)} из ${PORRIDGE_SOAK_MIN} мин`, 50, { group }));
        else if (busy) out.push(off(ref, `Взять кашу для ${nameCase(e.profile.name, 'gen')}`, 'Руки заняты', 50, { group }));
        else out.push(opt(ref, `Взять кашу для ${nameCase(e.profile.name, 'gen')} — запарилась`, 90, { group }));
        continue;
      }
      const ref: ActionRef = { verb: 'mixPorridge', target: e.id };
      const label = `Замешать кашу для ${nameCase(e.profile.name, 'gen')}: ${diet.porridge.product} ${String(diet.porridge.kg).replace('.', ',')} кг + горячая вода`;
      if (w.stock.porridge[diet.id] < diet.porridge.kg) out.push(off(ref, label, `${diet.porridge.product} кончилась — привоз утром`, 40, { group }));
      else if (busy) out.push(off(ref, label, 'Руки заняты', 40, { group }));
      else out.push(opt(ref, label, 58, { group, timed: true }));
    }
  }
  // Мойки
  for (const sink of ['washSink', 'kitchenSink'] as const) {
    if (!near(s, sink, 1.5) || !h) continue;
    const group = STATIONS[sink].label;
    if (h.kind === 'tank') {
      if (h.load > 0) {
        if (sink === 'washSink') out.push(opt({ verb: 'wash', target: 'emptyTank' }, `Вылить бак в слив (${Math.round(h.load)} л)`, 96, { group, timed: true }));
        else out.push(off({ verb: 'wash', target: 'emptyTank' }, 'Вылить бак', 'Мочу выливают в слив в инвентарной, не на кухне', 40, { group }));
      } else if (h.aux) out.push(opt({ verb: 'wash', target: 'tank' }, 'Помыть бак', 90, { group, timed: true }));
    }
    if (h.kind === 'tub') {
      const tub = tubById(s, h.aux);
      if (tub && !tub.broken && tubKg(tub) <= 0.3 && tub.dirty) out.push(opt({ verb: 'wash', target: 'tub' }, `Помыть таз ${nameCase(ownerName(s, tub.owner), 'gen')}`, 90, { group, timed: true }));
    }
    if (h.kind === 'porridge' && h.load <= 0) out.push(opt({ verb: 'wash', target: 'porridge' }, 'Помыть ведро из-под каши', 88, { group, timed: true }));
    if (h.kind === 'washKit' && h.load < 0.9) out.push(opt({ verb: 'wash', target: 'washKit' }, 'Налить в ведро тёплой воды', 70, { group, timed: true }));
  }
  // Холодильник с лакомствами
  if (near(s, 'fridge')) {
    if (k.pouch < FOOD.pouchMax) out.push(opt({ verb: 'refillPouch', target: 'fridge' }, `Набрать лакомств в поясную сумку (${k.pouch}/${FOOD.pouchMax})`, 52, { group: STATIONS.fridge.label, timed: true }));
    else out.push(off({ verb: 'refillPouch', target: 'fridge' }, 'Набрать лакомств', 'Сумка полна', 20, { group: STATIONS.fridge.label }));
  }
  if (near(s, 'desk', 1.5)) out.push(opt({ verb: 'journal', target: 'desk' }, 'Открыть журнал смены и рацион', 45, { group: STATIONS.desk.label }));
  // Разбитый таз — в контейнер
  if (h?.kind === 'tub' && near(s, 'container', 2.4)) {
    const tub = tubById(s, h.aux);
    if (tub?.broken) out.push(opt({ verb: 'wash', target: 'tubTrash' }, 'Выбросить разбитый таз в контейнер', 80, { group: STATIONS.container.label }));
  }
}

// Что нарезать дальше в этот таз: по плану рациона на сегодня
export function nextVeg(s: State, tubId: number): VegKind | null {
  const tub = tubById(s, tubId);
  if (!tub) return null;
  const plan = vegPlan(s.seed, shiftDay(s.t));
  for (const v of VEG_KINDS) {
    const want = plan[v] ?? 0;
    if (tub.veg[v] < want && s.world.stock.veg[v] >= 1) return v;
  }
  return null;
}

export function prepOptions(s: State): ActionOption[] {
  const p = s.keeper.prep;
  if (!p) return [];
  const tub = tubById(s, p.tubId);
  const next = nextVeg(s, p.tubId);
  const out: ActionOption[] = [];
  const group = 'Нарезка';
  out.push(opt({ verb: 'prepPick', target: 'L' }, p.hand ? (p.trimmed ? `Бросить в таз: ${VEG_LABEL[p.hand].toLowerCase()}` : 'Сначала обрежь хвостик') : next ? `Взять: ${VEG_LABEL[next].toLowerCase()}` : 'Таз собран', 200, { group }));
  out.push(opt({ verb: 'prepTrim', target: 'R' }, p.hand && !p.trimmed ? 'Обрезать хвостик' : 'Нож', 199, { group }));
  out.push(opt({ verb: 'prepExit', target: 'exit' }, tub && tubKg(tub) > 0 ? 'Отложить нарезку' : 'Выйти', 10, { group }));
  return out;
}

export function applyFeeding(s: State, ref: ActionRef): boolean {
  const k = s.keeper;
  const w = s.world;
  const h = k.held;
  switch (ref.verb) {
    case 'loadFeeder': {
      const [id, what] = ref.target.split(':') as [FeederId, string];
      const f = w.feeders[id];
      if (!f) return true;
      const fromBarrow = what === 'barrowHay' || what === 'barrowStraw';
      const kind = what === 'hay' || what === 'barrowHay' ? 'hay' : 'straw';
      if (fromBarrow) {
        const i = w.barrow.cargo.findIndex((x) => x.kind === kind);
        if (i < 0) return true;
        w.barrow.cargo.splice(i, 1);
      } else if (h?.kind !== kind) return true;
      else k.held = null;
      if (kind === 'hay') f.hay = Math.min(FOOD.feederMax, f.hay + FOOD.bale);
      else f.straw = Math.min(FOOD.strawMax, f.straw + FOOD.bale);
      fx(kind, STATIONS[id].reach!.x, STATIONS[id].reach!.y);
      return true;
    }
    case 'scatter': {
      if (h?.kind !== 'ration' || h.load <= 0) return true;
      const pieces = h.load * FOOD.scatterPieces;
      const per = FOOD.portionHunger / FOOD.scatterPieces;
      const here = areaAt(k.x, k.y);
      let placed: number;
      if (here) {
        // Среди слонов: горстями вокруг себя
        placed = scatterPieces(s, k.x, k.y, here, pieces, 'produce', per);
        fx('scatter', k.x, k.y);
      } else {
        const contact = keeperContact(s);
        if (!contact) return true;
        const spot = contactSpotNear(contact.area, k.x, k.y);
        if (!spot) return true;
        placed = scatterPieces(s, spot.spot.x, spot.spot.y - (contact.area === 'paddock' ? 1.5 : 0.5), contact.area, pieces, 'produce', per);
        fx('scatter', spot.line.x, spot.line.y);
      }
      k.held = null;
      log(s, 'info', `Овощи разбросаны (${placed} кусков) — слонам есть что поискать.`, { silent: true });
      return true;
    }
    case 'tossBrowse': {
      if (h?.kind !== 'browse' && h?.kind !== 'bamboo') return true;
      const here = areaAt(k.x, k.y);
      const kind = h.kind;
      if (here) {
        const x = k.x + Math.cos(k.facing) * 0.9;
        const y = k.y + Math.sin(k.facing) * 0.9;
        addFood(s, kind, x, y, 1, here === 'paddock' ? 'paddock' : 'barn');
        fx(kind === 'bamboo' ? 'bamboo' : 'browse', x, y);
      } else {
        const contact = keeperContact(s);
        if (!contact) return true;
        const spot = contactSpotNear(contact.area, k.x, k.y);
        if (!spot) return true;
        const zone = contact.area === 'paddock' ? 'paddock' : 'barn';
        addFood(s, kind, spot.spot.x + (random(s) - 0.5) * 2, spot.spot.y - 0.6, 1, zone);
        fx(kind === 'bamboo' ? 'bamboo' : 'browse', spot.line.x, spot.line.y);
      }
      k.held = null;
      return true;
    }
    case 'fillDrum':
      if (h?.kind === 'ration' && h.load > 0) {
        w.drum = Math.min(FOOD.drumMax, w.drum + h.load);
        k.held = null;
        fx('drum', DRUM.x, DRUM.y);
      }
      return true;
    case 'takeTub': {
      const tub = tubById(s, Number(ref.target));
      if (!tub || h || w.barrow.pushed) return true;
      if (tub.where !== 'rack' && tub.where !== 'prep') return true;
      tub.where = 'held';
      k.held = { kind: 'tub', load: 0, aux: tub.id, owner: tub.owner };
      return true;
    }
    case 'rackTub': {
      const tub = tubById(s, Number(ref.target));
      if (!tub || h?.kind !== 'tub' || tubKg(tub) > 0.3 || tub.dirty || tub.broken) return true;
      tub.where = 'rack';
      k.held = null;
      return true;
    }
    case 'prepVeg': {
      const tub = tubById(s, Number(ref.target));
      if (!tub || tub.broken) return true;
      if (h?.kind === 'tub' && h.aux === tub.id) k.held = null;
      tub.where = 'prep';
      const r = STATIONS.prepTable.rect!;
      tub.x = (r.x0 + r.x1) / 2;
      tub.y = (r.y0 + r.y1) / 2;
      k.prep = { tubId: tub.id, hand: null, trimmed: false, combo: 0 };
      fx('prepOpen', k.x, k.y);
      return true;
    }
    case 'prepPick': {
      const p = k.prep;
      if (!p) return true;
      const tub = tubById(s, p.tubId);
      if (!tub) return true;
      if (!p.hand) {
        const next = nextVeg(s, p.tubId);
        if (!next) {
          finishPrep(s);
          return true;
        }
        w.stock.veg[next] = Math.max(0, w.stock.veg[next] - 1);
        p.hand = next;
        p.trimmed = false;
        fx('vegPick', k.x, k.y, null, next);
      } else if (p.trimmed) {
        tub.veg[p.hand] += 1;
        fx('vegToss', k.x, k.y, null, p.hand);
        p.hand = null;
        p.trimmed = false;
        p.combo++;
        if (!nextVeg(s, p.tubId)) finishPrep(s);
      } else {
        p.combo = 0;
        fx('prepMiss', k.x, k.y, null, 'needTrim');
      }
      return true;
    }
    case 'prepTrim': {
      const p = k.prep;
      if (!p) return true;
      if (p.hand && !p.trimmed) {
        p.trimmed = true;
        fx('chop', k.x, k.y, null, p.hand);
      } else {
        p.combo = 0;
        fx('prepMiss', k.x, k.y, null, p.hand ? 'trimmed' : 'empty');
      }
      return true;
    }
    case 'prepExit': {
      const p = k.prep;
      if (!p) return true;
      // Овощ в руке кладём обратно в ящик
      if (p.hand) w.stock.veg[p.hand] += 1;
      k.prep = null;
      fx('prepClose', k.x, k.y);
      return true;
    }
    case 'mixPorridge': {
      const e = s.elephants.find((x) => x.id === ref.target);
      if (!e || h) return true;
      const diet = DIETS[e.profile.habits.diet];
      if (w.stock.porridge[diet.id] < diet.porridge.kg) return true;
      w.stock.porridge[diet.id] -= diet.porridge.kg;
      const r = STATIONS.porridgeStation.rect!;
      const n = w.items.filter((it) => it.kind === 'porridge' && dist(it, STATIONS.porridgeStation.keeper) < 2.5).length;
      w.items.push({ id: s.nextId++, kind: 'porridge', x: r.x0 + 0.4 + n * 0.55, y: r.y0 - 0.45, load: diet.porridge.kg, aux: s.t, owner: e.id });
      fx('pour', k.x, k.y);
      log(s, 'info', `Каша для ${nameCase(e.profile.name, 'gen')} (${diet.porridge.product} ${diet.porridge.kg} кг) залита горячей водой — запарится через ${PORRIDGE_SOAK_MIN} мин.`, { silent: true });
      return true;
    }
    case 'takePorridge': {
      const it = w.items.find((x) => String(x.id) === ref.target && x.kind === 'porridge');
      if (!it || h || s.t - it.aux < PORRIDGE_SOAK_MIN) return true;
      w.items = w.items.filter((x) => x !== it);
      k.held = { kind: 'porridge', load: it.load, aux: it.aux, owner: it.owner };
      return true;
    }
    case 'wash': {
      if (!h) return true;
      switch (ref.target) {
        case 'emptyTank':
          if (h.kind === 'tank') {
            h.load = 0;
            h.aux = 1;
            fx('pour', k.x, k.y);
          }
          break;
        case 'tank':
          if (h.kind === 'tank' && h.load <= 0) h.aux = 0;
          break;
        case 'tub': {
          const tub = h.kind === 'tub' ? tubById(s, h.aux) : undefined;
          if (tub && tubKg(tub) <= 0.3) {
            for (const v of VEG_KINDS) tub.veg[v] = 0;
            tub.dirty = false;
            tub.damage = Math.max(0, tub.damage - 0.05);
          }
          break;
        }
        case 'tubTrash': {
          const tub = h.kind === 'tub' ? tubById(s, h.aux) : undefined;
          if (tub?.broken) {
            tub.where = 'rack';
            tub.broken = true;
            k.held = null;
            w.container = Math.min(KEEPER.containerMax, w.container + 1);
            log(s, 'info', `Разбитый таз ${nameCase(ownerName(s, tub.owner), 'gen')} — в контейнер. Новый привезут утром.`, { silent: true });
          }
          break;
        }
        case 'porridge':
          if (h.kind === 'porridge' && h.load <= 0) k.held = null;
          break;
        case 'washKit':
          if (h.kind === 'washKit') h.load = 1;
          break;
      }
      fx('wash', k.x, k.y);
      return true;
    }
    case 'refillPouch':
      k.pouch = FOOD.pouchMax;
      return true;
    case 'journal':
      fx('openJournal', k.x, k.y);
      return true;
  }
  return false;
}

// Ведро нарезанных овощей (для разбрасывания и кормления с руки)
export function takeRation(s: State): void {
  const w = s.world;
  const k = s.keeper;
  if (k.held || w.barrow.pushed) return;
  const portions = Math.max(FOOD.rationPortions, s.elephants.length);
  let need = portions * 2;
  for (const v of VEG_KINDS) {
    const take = Math.min(w.stock.veg[v], need);
    w.stock.veg[v] -= take;
    need -= take;
    if (need <= 0) break;
  }
  k.held = { kind: 'ration', load: portions, aux: 0, owner: null };
  fx('chop', k.x, k.y);
}

function finishPrep(s: State): void {
  const k = s.keeper;
  const p = k.prep;
  if (!p) return;
  const tub = tubById(s, p.tubId);
  k.prep = null;
  fx('prepClose', k.x, k.y);
  if (tub) log(s, 'good', `Таз для ${nameCase(ownerName(s, tub.owner), 'gen')} собран: ${Math.round(tubKg(tub))} кг овощей.`, { kind: 'prepDone' });
}
