// Вещи в руках и в тачке. В руках — одна вещь. Тачку толкают пустыми руками:
// инвентарь, тюки и тазы сначала кладут в неё. Корм к навозу не кладут.

import { KEEPER } from '../../data/balance';
import { STATIONS, TANK_HOME, TOOL_KINDS, TOOL_SLOTS, type StationId, type ToolKind } from '../../data/facility';
import { fx, log } from '../events';
import { dist } from '../geometry';
import type { ActionOption, ActionRef, Held, LooseItem, State, ThingKind } from '../types';
import { tubById, tubKg } from '../world';
import { THING_ACC, THING_NOM, foodThing, near, off, opt, ownerName, stowable, type KCtx } from './common';
import { takeRation } from './feeding';
import { dropHose } from './hose';

const TOOL_ACC: Record<ToolKind, string> = { shovel: 'лопату', rake: 'грабли', broom: 'метлу', mop: 'швабру', brush: 'щётку для чистки слонов' };

// Склад: что лежит где
const STOCK: { station: StationId; kind: 'hay' | 'straw' | 'browse' | 'bamboo' | 'sawdust'; label: string }[] = [
  { station: 'hayStack', kind: 'hay', label: 'тюк сена' },
  { station: 'strawStack', kind: 'straw', label: 'тюк соломы' },
  { station: 'browsePile', kind: 'browse', label: 'охапку веток' },
  { station: 'bambooPile', kind: 'bamboo', label: 'связку бамбука' },
  { station: 'sawdustPile', kind: 'sawdust', label: 'мешок опилок' },
];

export function heldLabel(h: Held | null, s?: State): string {
  if (!h) return 'руки свободны';
  switch (h.kind) {
    case 'shovel':
      return h.load > 0 ? 'лопата с грязью' : 'лопата';
    case 'mop':
      return h.load >= 1 ? 'мокрая швабра — отожми' : `швабра${h.load > 0.3 ? ' (влажная)' : ''}`;
    case 'sawdust':
      return `мешок опилок (${h.load})`;
    case 'tank':
      return h.load > 0 ? `ведро: ${Math.round(h.load)} л` : h.aux ? 'грязное ведро' : 'ведро для мочи';
    case 'washKit':
      return h.load > 0.05 ? 'ведро для мытья с шампунем' : 'пустое ведро для мытья';
    case 'chem':
      return `средство для поилок (${h.load})`;
    case 'ration':
      return `ведро с овощами (${h.load} порц.)`;
    case 'porridge':
      return h.load > 0 ? `каша для ${s ? ownerName(s, h.owner) : ''}` : 'пустое ведро из-под каши';
    case 'tub': {
      const t = s ? tubById(s, h.aux) : undefined;
      const name = s ? ownerName(s, h.owner) : '';
      if (!t) return 'таз';
      const kg = tubKg(t);
      return kg > 0.5 ? `таз ${name}: ${Math.round(kg)} кг` : t.dirty ? `грязный таз ${name}` : `таз ${name}`;
    }
    default:
      return THING_NOM[h.kind];
  }
}

function thing(kind: ThingKind, load = 0, aux = 0, owner: string | null = null): Held {
  return { kind, load, aux, owner };
}

export function thingOptions(c: KCtx, out: ActionOption[]): void {
  const { s, k, w, h } = c;
  const busy = h ? `Руки заняты: ${THING_NOM[h.kind]}` : c.pushing ? 'Руки заняты тачкой — оставь её' : '';
  // Стойка инвентаря
  if (near(s, 'toolRack', 1.6)) {
    const group = 'Стойка инвентаря';
    for (const t of TOOL_KINDS) {
      if (!w.tools[t]) continue;
      const ref: ActionRef = { verb: 'take', target: t };
      if (busy) out.push(off(ref, `Взять ${TOOL_ACC[t]}`, busy, 30, { group }));
      else out.push(opt(ref, `Взять ${TOOL_ACC[t]}`, t === 'shovel' ? 56 : 54, { group }));
    }
    if (h && (TOOL_KINDS as string[]).includes(h.kind)) {
      const ref: ActionRef = { verb: 'putBack', target: h.kind };
      if (h.kind === 'shovel' && h.load > 0) out.push(off(ref, 'Повесить лопату', 'Сначала стряхни грязь в тачку или контейнер', 50, { group }));
      else out.push(opt(ref, `Повесить ${THING_ACC[h.kind]} на стойку`, 50, { group }));
    }
  }
  // Склад: тюки, ветки, бамбук, опилки
  for (const st of STOCK) {
    if (!near(s, st.station, 1.4)) continue;
    const group = STATIONS[st.station].label;
    const n = w.stock[st.kind];
    const ref: ActionRef = { verb: 'take', target: st.kind };
    if (n <= 0) out.push(off(ref, `Взять ${st.label}`, 'Кончилось — привоз утром', 40, { group }));
    else if (busy) out.push(off(ref, `Взять ${st.label}`, busy, 40, { group }));
    else out.push(opt(ref, `Взять ${st.label} (${n})`, 55, { group }));
    if (h?.kind === st.kind && (st.kind !== 'sawdust' || h.load >= KEEPER.sawdustUses)) out.push(opt({ verb: 'putBack', target: st.kind }, 'Положить обратно', 20, { group }));
  }
  // Шкаф: средство для поилок, набор для мытья слонов
  if (near(s, 'cabinet', 1.4)) {
    const group = STATIONS.cabinet.label;
    const chem: ActionRef = { verb: 'take', target: 'chem' };
    if (w.supplies.chem <= 0) out.push(off(chem, 'Взять средство для поилок', 'Кончилось — привоз утром', 40, { group }));
    else if (busy) out.push(off(chem, 'Взять средство для поилок', busy, 40, { group }));
    else out.push(opt(chem, `Взять средство для поилок и ёрш (${w.supplies.chem})`, 52, { group }));
    const kit: ActionRef = { verb: 'take', target: 'washKit' };
    if (w.supplies.shampoo <= 0) out.push(off(kit, 'Взять набор для мытья слонов', 'Шампунь кончился — привоз утром', 40, { group }));
    else if (busy) out.push(off(kit, 'Взять набор для мытья слонов', busy, 40, { group }));
    else out.push(opt(kit, 'Взять набор для мытья слонов (шампунь, щётка, ведро тёплой воды)', 52, { group }));
    if (h && (h.kind === 'chem' || h.kind === 'washKit')) out.push(opt({ verb: 'putBack', target: h.kind }, `Убрать ${THING_ACC[h.kind]} в шкаф`, 48, { group }));
  }
  // Ведро для мочи — на своё место в инвентарной
  if (h?.kind === 'tank' && dist(k, TANK_HOME) < 1.4) {
    const ref: ActionRef = { verb: 'putBack', target: 'tank' };
    if (h.load > 0 || h.aux) out.push(off(ref, 'Поставить ведро на место', 'Сначала вылей и помой его в мойке', 40, { group: 'Ведро' }));
    else out.push(opt(ref, 'Поставить ведро на место', 40, { group: 'Ведро' }));
  }
  // Вещи на полу
  if (!c.pushing) {
    const items = w.items.filter((x) => dist(x, k) <= 1.2 && x.kind !== 'pile' && x.kind !== 'shard').sort((p, q) => dist(p, k) - dist(q, k));
    for (const it of items.slice(0, 4)) {
      const ref: ActionRef = { verb: 'pickUp', target: String(it.id) };
      const label = it.kind === 'porridge' ? `Взять ${THING_ACC.porridge} ${ownerName(s, it.owner) ? `для ${ownerName(s, it.owner)}` : ''}`.trim() : `Поднять: ${THING_ACC[it.kind]}`;
      if (h) out.push(off(ref, label, busy, 30, { group: 'На полу' }));
      else out.push(opt(ref, label, 75, { group: 'На полу' }));
    }
  }
  // Положить на пол
  if (h && !c.pushing && h.kind !== 'tub') {
    const label = h.kind === 'hose' ? 'Бросить шланг здесь' : `Положить ${THING_ACC[h.kind]}`;
    out.push(opt({ verb: 'drop', target: 'held' }, label, 5, { group: 'В руках' }));
  }
  barrowOptions(c, out);
}

function barrowOptions(c: KCtx, out: ActionOption[]): void {
  const { k, w, h, barrow: b } = c;
  const group = 'Тачка';
  if (b.pushed) {
    out.push(opt({ verb: 'parkBarrow', target: 'barrow' }, 'Оставить тачку', 40, { group }));
    if (near(c.s, 'container', 2.4) && b.load > 0) {
      if (w.container >= KEEPER.containerMax) out.push(off({ verb: 'dumpBarrow', target: 'container' }, 'Высыпать тачку', 'Контейнер полон — его вывозят утром', 100, { group }));
      else out.push(opt({ verb: 'dumpBarrow', target: 'container' }, `Высыпать тачку в контейнер (${b.load}/${KEEPER.barrowMax})`, 100, { group, timed: true }));
    }
    return;
  }
  const d = dist(k, b);
  if (d > 1.8) return;
  if (!h) out.push(opt({ verb: 'pushBarrow', target: 'barrow' }, `Взять тачку${b.load > 0 ? ` (навоз ${b.load}/${KEEPER.barrowMax})` : ''}${b.cargo.length ? ` · в ней: ${b.cargo.map((x) => THING_NOM[x.kind]).join(', ')}` : ''}`, 36, { group }));
  else out.push(off({ verb: 'pushBarrow', target: 'barrow' }, 'Взять тачку', `Сначала положи ${THING_ACC[h.kind]} в тачку или на пол`, 30, { group }));
  if (h && stowable(h)) {
    const ref: ActionRef = { verb: 'stow', target: 'barrow' };
    const label = `Положить ${THING_ACC[h.kind]} в тачку`;
    if (b.cargo.length >= KEEPER.barrowCargo) out.push(off(ref, label, 'В тачке нет места', 60, { group }));
    else if (foodThing(h) && b.load > 0) out.push(off(ref, label, 'В тачке навоз — корм туда не кладут', 60, { group }));
    else if (h.kind === 'shovel' && h.load > 0) out.push(off(ref, label, 'Сначала скинь грязь с лопаты', 60, { group }));
    else out.push(opt(ref, label, 62, { group, timed: true }));
  }
  if (!h) {
    b.cargo.forEach((x, i) => {
      const name = x.kind === 'tub' ? `таз ${ownerName(c.s, x.owner)}` : THING_ACC[x.kind];
      out.push(opt({ verb: 'unstow', target: String(i) }, `Взять из тачки: ${name}`, 58, { group, timed: true }));
    });
  }
}

export function applyThing(s: State, ref: ActionRef): boolean {
  const k = s.keeper;
  const w = s.world;
  const h = k.held;
  switch (ref.verb) {
    case 'take': {
      if (h || w.barrow.pushed) return true;
      const t = ref.target;
      if (t === 'ration') {
        takeRation(s);
        return true;
      }
      if ((TOOL_KINDS as string[]).includes(t)) {
        const tool = t as ToolKind;
        if (!w.tools[tool]) return true;
        w.tools[tool] = false;
        k.held = thing(tool);
        return true;
      }
      if (t === 'hay' || t === 'straw' || t === 'browse' || t === 'bamboo' || t === 'sawdust') {
        if (w.stock[t] <= 0) return true;
        w.stock[t]--;
        k.held = thing(t, t === 'sawdust' ? KEEPER.sawdustUses : 0);
        k.carried = 0;
        return true;
      }
      if (t === 'chem' && w.supplies.chem > 0) {
        w.supplies.chem--;
        k.held = thing('chem', KEEPER.chemUses);
        return true;
      }
      if (t === 'washKit' && w.supplies.shampoo > 0) {
        w.supplies.shampoo--;
        k.held = thing('washKit', 1);
        return true;
      }
      return true;
    }
    case 'putBack': {
      if (!h) return true;
      if ((TOOL_KINDS as string[]).includes(h.kind)) {
        if (h.kind === 'shovel' && h.load > 0) return true;
        w.tools[h.kind as ToolKind] = true;
        k.held = null;
      } else if (h.kind === 'hay' || h.kind === 'straw' || h.kind === 'browse' || h.kind === 'bamboo' || h.kind === 'sawdust') {
        w.stock[h.kind]++;
        k.held = null;
      } else if (h.kind === 'chem') {
        if (h.load > 0) w.supplies.chem++;
        k.held = null;
      } else if (h.kind === 'washKit') {
        k.held = null;
      } else if (h.kind === 'tank') {
        w.items.push({ id: s.nextId++, kind: 'tank', x: TANK_HOME.x, y: TANK_HOME.y, load: 0, aux: 0, owner: null });
        k.held = null;
      }
      return true;
    }
    case 'pickUp': {
      const it = w.items.find((x) => String(x.id) === ref.target);
      if (!it || h || w.barrow.pushed) return true;
      w.items = w.items.filter((x) => x !== it);
      k.held = { kind: it.kind, load: it.load, aux: it.aux, owner: it.owner };
      if (it.kind === 'tub') {
        const tub = tubById(s, it.aux);
        if (tub) tub.where = 'held';
      }
      return true;
    }
    case 'drop': {
      if (!h) return true;
      if (h.kind === 'hose') {
        dropHose(s);
        k.held = null;
        return true;
      }
      const x = k.x + Math.cos(k.facing) * 0.55;
      const y = k.y + Math.sin(k.facing) * 0.55;
      if (h.kind === 'tub') {
        placeTubAt(s, h.aux, x, y);
        k.held = null;
        return true;
      }
      w.items.push({ id: s.nextId++, kind: h.kind, x, y, load: h.load, aux: h.aux, owner: h.owner });
      k.held = null;
      return true;
    }
    case 'pushBarrow': {
      const b = w.barrow;
      if (h || b.pushed) return true;
      b.pushed = true;
      b.heading = Math.atan2(b.y - k.y, b.x - k.x);
      k.facing = b.heading;
      b.x = k.x + Math.cos(b.heading) * 0.95;
      b.y = k.y + Math.sin(b.heading) * 0.95;
      return true;
    }
    case 'parkBarrow':
      w.barrow.pushed = false;
      return true;
    case 'dumpBarrow': {
      const put = Math.min(w.barrow.load, KEEPER.containerMax - w.container);
      w.container += put;
      w.barrow.load -= put;
      fx('dump', w.barrow.x, w.barrow.y);
      return true;
    }
    case 'stow': {
      const b = w.barrow;
      if (!h || !stowable(h) || b.cargo.length >= KEEPER.barrowCargo) return true;
      if (foodThing(h) && b.load > 0) return true;
      b.cargo.push({ ...h });
      if (h.kind === 'tub') {
        const tub = tubById(s, h.aux);
        if (tub) tub.where = 'barrow';
      }
      k.held = null;
      fx('stow', b.x, b.y);
      return true;
    }
    case 'unstow': {
      const b = w.barrow;
      const i = Number(ref.target);
      if (h || !b.cargo[i]) return true;
      const x = b.cargo.splice(i, 1)[0];
      k.held = x;
      if (x.kind === 'tub') {
        const tub = tubById(s, x.aux);
        if (tub) tub.where = 'held';
      }
      k.carried = 0;
      return true;
    }
  }
  return false;
}

// Поставить таз на пол (в зале, на выгуле или на кухне)
export function placeTubAt(s: State, tubId: number, x: number, y: number): void {
  const tub = tubById(s, tubId);
  if (!tub) return;
  tub.where = 'floor';
  tub.x = x;
  tub.y = y;
  tub.emptySince = -1;
  fx('tubPlace', x, y);
}

export function itemById(s: State, id: number): LooseItem | undefined {
  return s.world.items.find((x) => x.id === id);
}

export function toolSlot(kind: ToolKind) {
  return TOOL_SLOTS[kind];
}

export function logPickedUp(s: State, what: string): void {
  log(s, 'info', what, { silent: true });
}
