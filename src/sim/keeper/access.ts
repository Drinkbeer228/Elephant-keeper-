// Защищённый контакт: кипер входит в отсек слонов, только если в нём и во всём, что с ним
// соединено открытыми воротами, нет слонов. Проход кипера вдоль решётки доступен всегда.
// Ворота управляются с пульта в проходе: створку не закрыть на слоне и не открыть в отсек,
// где осталась тачка или стоит кипер.

import { AREA_IDS, AREA_LABEL, GATES, GATE_BY_ID, areaAt, type AreaId, type DoorDef, type GateId } from '../../data/facility';
import { connectedAreas, connectedByMask, gateMask, headPos } from '../behavior/perceive';
import { fx, log } from '../events';
import { circleHitsRect } from '../geometry';
import type { KeeperNavState } from '../nav';
import type { ActionOption, ActionRef, Elephant, State } from '../types';
import { near, off, opt, type KCtx } from './common';

export function areaEmpty(s: State, area: AreaId): boolean {
  const linked = connectedAreas(s, area);
  for (const e of s.elephants) {
    const a = areaAt(e.x, e.y) ?? (e.y < 20 ? 'paddock' : e.x < 20 ? 'stallW' : 'stallE');
    if (linked.includes(a)) return false;
  }
  return true;
}

export function doorUnlocked(s: State, d: DoorDef): boolean {
  return areaEmpty(s, d.area);
}

export function keeperArea(s: State): AreaId | null {
  return areaAt(s.keeper.x, s.keeper.y);
}

// Куда кипер может войти (и откуда выйти, если уже внутри)
export function keeperAccess(s: State): AreaId[] {
  const out = AREA_IDS.filter((a) => areaEmpty(s, a));
  const here = keeperArea(s);
  if (here && !out.includes(here)) out.push(here);
  return out;
}

export function keeperNav(s: State): KeeperNavState {
  return { mask: gateMask(s), access: keeperAccess(s) };
}

function inGateway(e: Elephant, id: GateId): boolean {
  const r = GATE_BY_ID[id].rect;
  const grow = { x0: r.x0 - 0.4, y0: r.y0 - 0.4, x1: r.x1 + 0.4, y1: r.y1 + 0.4 };
  const L = e.profile.look;
  const rad = 0.85 * L.size * L.girth;
  const h = headPos(e, 0.8);
  const t = headPos(e, -0.8);
  return circleHitsRect(e.x, e.y, rad, grow) || circleHitsRect(h.x, h.y, rad * 0.8, grow) || circleHitsRect(t.x, t.y, rad * 0.8, grow);
}

// Почему эти ворота сейчас нельзя открыть (или null)
export function gateOpenBlock(s: State, id: GateId): string | null {
  const after = { ...s.world.gates, [id]: true };
  const mask = (after.outer ? 1 : 0) | (after.shift ? 2 : 0);
  // Что окажется в одной связке со слонами после открытия
  const inhabited = new Set<AreaId>();
  for (const e of s.elephants) {
    const a = areaAt(e.x, e.y);
    if (a) inhabited.add(a);
  }
  const linkedToElephants = (area: AreaId) => connectedByMask(mask, area).some((a) => inhabited.has(a));
  const b = s.world.barrow;
  const barrowArea = areaAt(b.x, b.y);
  if (barrowArea && linkedToElephants(barrowArea)) return `Сначала вывези тачку: ${AREA_LABEL[barrowArea]} станет доступно слонам`;
  const k = keeperArea(s);
  if (k && linkedToElephants(k)) return 'Ты сам внутри — выйди в проход';
  return null;
}

export function gateOptions(c: KCtx, out: ActionOption[]): void {
  const { s } = c;
  if (!near(s, 'gatePanel', 1.4)) return;
  for (const g of GATES) {
    const open = s.world.gates[g.id];
    const ref: ActionRef = { verb: 'gate', target: g.id };
    const label = `${open ? 'Закрыть' : 'Открыть'}: ${g.label.toLowerCase()}`;
    if (open) {
      const blocking = s.elephants.find((e) => inGateway(e, g.id));
      if (blocking) out.push(off(ref, label, `В проёме ${blocking.profile.name} — подожди`, 90, { group: 'Пульт ворот' }));
      else out.push(opt(ref, label, 88, { group: 'Пульт ворот' }));
    } else {
      const why = gateOpenBlock(s, g.id);
      // Кто-то просится через эти ворота — поднять в списке
      const asking = s.elephants.some((e) => e.signal && e.act.target?.t === 'gate' && e.act.target.gate === g.id);
      if (why) out.push(off(ref, label, why, 88, { group: 'Пульт ворот' }));
      else out.push(opt(ref, label, 86 + (asking ? 70 : 0), { group: 'Пульт ворот' }));
    }
  }
}

export function applyGate(s: State, ref: ActionRef): boolean {
  if (ref.verb !== 'gate') return false;
  const id = ref.target as GateId;
  const g = GATE_BY_ID[id];
  if (!g) return true;
  const open = !s.world.gates[id];
  if (open && gateOpenBlock(s, id)) return true;
  s.world.gates[id] = open;
  const cx = (g.rect.x0 + g.rect.x1) / 2;
  const cy = (g.rect.y0 + g.rect.y1) / 2;
  fx('gate', cx, cy);
  log(s, 'info', `${g.label}: ${open ? 'открыты' : 'закрыты'}.`, { silent: true, kind: 'gate', x: cx, y: cy });
  return true;
}
