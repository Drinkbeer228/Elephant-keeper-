// Полный контакт: кипер и слоны работают в одном пространстве. Кипер ходит куда угодно —
// через свои узкие двери, щель в разделительных воротах, по залу и выгулу среди слонов.
// Ворота открывают и закрывают руками, стоя у створки; закрыть створку на слоне нельзя.

import { AREA_IDS, GATES, GATE_BY_ID, areaAt, type AreaId, type GateDef, type GateId } from '../../data/facility';
import { connectedAreas, gateMask, headPos } from '../behavior/perceive';
import { fx, log } from '../events';
import { circleHitsRect, closestOnSegment } from '../geometry';
import type { KeeperNavState } from '../nav';
import type { ActionOption, ActionRef, Elephant, State } from '../types';
import { off, opt, type KCtx } from './common';

// Нет ли слонов в отсеке и во всём, что с ним соединено открытыми воротами
export function areaEmpty(s: State, area: AreaId): boolean {
  const linked = connectedAreas(s, area);
  for (const e of s.elephants) {
    const a = areaAt(e.x, e.y) ?? (e.y < 20 ? 'paddock' : e.x < 20 ? 'stallW' : 'stallE');
    if (linked.includes(a)) return false;
  }
  return true;
}

export function keeperArea(s: State): AreaId | null {
  return areaAt(s.keeper.x, s.keeper.y);
}

export function keeperNav(s: State): KeeperNavState {
  return { mask: gateMask(s), access: AREA_IDS };
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

// Створка рядом: до ближайшей точки проёма не дальше вытянутой руки
export function nearGate(s: State, g: GateDef): boolean {
  const r = g.rect;
  const c = g.vertical ? closestOnSegment(s.keeper.x, s.keeper.y, (r.x0 + r.x1) / 2, r.y0, (r.x0 + r.x1) / 2, r.y1) : closestOnSegment(s.keeper.x, s.keeper.y, r.x0, (r.y0 + r.y1) / 2, r.x1, (r.y0 + r.y1) / 2);
  return c.d <= 1.5;
}

export function gateOptions(c: KCtx, out: ActionOption[]): void {
  const { s } = c;
  for (const g of GATES) {
    if (!nearGate(s, g)) continue;
    const open = s.world.gates[g.id];
    const ref: ActionRef = { verb: 'gate', target: g.id };
    const label = `${open ? 'Закрыть' : 'Открыть'}: ${g.label.toLowerCase()}`;
    const group = g.label;
    if (open) {
      const blocking = s.elephants.find((e) => inGateway(e, g.id));
      if (blocking) out.push(off(ref, label, `В проёме ${blocking.profile.name} — подожди или попроси отойти`, 90, { group }));
      else out.push(opt(ref, label, 70, { group }));
    } else {
      // Кто-то просится через эти ворота — поднять в списке
      const asking = s.elephants.some((e) => e.signal && e.act.target?.t === 'gate' && e.act.target.gate === g.id);
      out.push(opt(ref, label, 72 + (asking ? 70 : 0), { group }));
    }
  }
}

export function applyGate(s: State, ref: ActionRef): boolean {
  if (ref.verb !== 'gate') return false;
  const id = ref.target as GateId;
  const g = GATE_BY_ID[id];
  if (!g) return true;
  const open = !s.world.gates[id];
  if (!open && s.elephants.some((e) => inGateway(e, id))) return true;
  s.world.gates[id] = open;
  const cx = (g.rect.x0 + g.rect.x1) / 2;
  const cy = (g.rect.y0 + g.rect.y1) / 2;
  fx('gate', cx, cy);
  log(s, 'info', `${g.label}: ${open ? 'открыты' : 'закрыты'}.`, { silent: true, kind: 'gate', x: cx, y: cy });
  return true;
}
