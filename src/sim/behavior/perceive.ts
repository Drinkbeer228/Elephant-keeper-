// Что слон «знает» о мире: отсеки и ворота, места у кормушек, где кипер, кто рядом.

import { ELEPHANT, KEEPER } from '../../data/balance';
import { AREA_ZONE, CONTACT_LINES, GATES, STATIONS, areaAt, zoneAt, type AreaId, type GateId, type StationId, type ZoneId } from '../../data/facility';
import { closestOnSegment, dist } from '../geometry';
import { bondKey, rankScore } from '../herd';
import type { Elephant, State, Vec } from '../types';

export function zoneOf(e: { x: number; y: number }): ZoneId {
  return zoneAt(e.x, e.y) ?? (e.y < 20 ? 'paddock' : 'barn');
}

export function areaOf(e: { x: number; y: number }): AreaId {
  return areaAt(e.x, e.y) ?? (e.y < 20 ? 'paddock' : e.x < 20 ? 'stallW' : 'stallE');
}

// Маска открытых ворот — ключ для полей навигации
export function gateMask(s: State): number {
  return (s.world.gates.outer ? 1 : 0) | (s.world.gates.shift ? 2 : 0);
}

export function maskOpen(mask: number, id: GateId): boolean {
  return id === 'outer' ? (mask & 1) !== 0 : (mask & 2) !== 0;
}

// Отсеки, соединённые с данным открытыми воротами (включая его самого)
export function connectedAreas(s: State, area: AreaId): AreaId[] {
  return connectedByMask(gateMask(s), area);
}

const connCache = new Map<string, AreaId[]>();

export function connectedByMask(mask: number, area: AreaId): AreaId[] {
  const key = `${mask}:${area}`;
  let out = connCache.get(key);
  if (out) return out;
  out = [area];
  for (let changed = true; changed; ) {
    changed = false;
    for (const g of GATES) {
      if (!maskOpen(mask, g.id)) continue;
      const hasA = out.includes(g.a);
      const hasB = out.includes(g.b);
      if (hasA && !hasB) {
        out.push(g.b);
        changed = true;
      } else if (hasB && !hasA) {
        out.push(g.a);
        changed = true;
      }
    }
  }
  connCache.set(key, out);
  return out;
}

export function reachableAreas(s: State, e: Elephant): AreaId[] {
  return connectedAreas(s, areaOf(e));
}

export function reachableZones(s: State, e: Elephant): ZoneId[] {
  const out: ZoneId[] = [];
  for (const a of reachableAreas(s, e)) if (!out.includes(AREA_ZONE[a])) out.push(AREA_ZONE[a]);
  return out;
}

export function canReachZone(s: State, e: Elephant, zone: ZoneId): boolean {
  return reachableZones(s, e).includes(zone);
}

export function canReachArea(s: State, e: Elephant, area: AreaId | null | undefined): boolean {
  return !!area && reachableAreas(s, e).includes(area);
}

export function canReachPoint(s: State, e: Elephant, p: { x: number; y: number }): boolean {
  return canReachArea(s, e, areaAt(p.x, p.y));
}

// Первые закрытые ворота на пути из одного отсека в другой (null — путь открыт или его нет)
export function blockingGate(s: State, from: AreaId, to: AreaId): GateId | null {
  if (from === to) return null;
  // Поиск в ширину по графу отсеков, ворота — рёбра
  const prev = new Map<AreaId, { area: AreaId; gate: GateId }>();
  const queue: AreaId[] = [from];
  const seen = new Set<AreaId>([from]);
  while (queue.length) {
    const a = queue.shift()!;
    if (a === to) break;
    for (const g of GATES) {
      const b = g.a === a ? g.b : g.b === a ? g.a : null;
      if (!b || seen.has(b)) continue;
      seen.add(b);
      prev.set(b, { area: a, gate: g.id });
      queue.push(b);
    }
  }
  if (!prev.has(to)) return null;
  const chain: GateId[] = [];
  for (let a: AreaId = to; a !== from; ) {
    const p = prev.get(a)!;
    chain.unshift(p.gate);
    a = p.area;
  }
  return chain.find((g) => !s.world.gates[g]) ?? null;
}

export function radiusOf(e: Elephant): number {
  return ELEPHANT.radius * e.profile.look.size;
}

export function rankOf(e: Elephant): number {
  return rankScore(e.profile);
}

export function bond(s: State, a: string, b: string): number {
  return s.bonds[bondKey(a, b)] ?? 0;
}

export function adjustBond(s: State, a: string, b: string, delta: number): void {
  const k = bondKey(a, b);
  s.bonds[k] = Math.max(-1, Math.min(1, (s.bonds[k] ?? 0) + delta));
}

// Голова и круп — для еды, мочи и навоза
export function headPos(e: Elephant, ahead = 1.55): Vec {
  const k = ahead * e.profile.look.size * e.profile.look.length;
  return { x: e.x + Math.cos(e.heading) * k, y: e.y + Math.sin(e.heading) * k };
}

export function rearPos(e: Elephant, back = 1.05): Vec {
  const k = back * e.profile.look.size * e.profile.look.length;
  return { x: e.x - Math.cos(e.heading) * k, y: e.y - Math.sin(e.heading) * k };
}

export function slotPos(station: StationId, slot: number): { x: number; y: number; face: number } {
  return STATIONS[station].slots![slot];
}

// Место у станции занято, если туда идёт или там стоит другой слон
export function slotTakenBy(s: State, e: Elephant, station: StationId, slot: number): Elephant | null {
  const p = slotPos(station, slot);
  for (const o of s.elephants) {
    if (o === e) continue;
    const t = o.act.target;
    if (t && t.t === 'slot' && t.station === station && t.slot === slot) return o;
    if (dist(o, p) < 1.4) return o;
  }
  return null;
}

export function freeSlot(s: State, e: Elephant, station: StationId): number {
  const slots = STATIONS[station].slots ?? [];
  let best = -1;
  let bestD = Infinity;
  slots.forEach((p, i) => {
    if (slotTakenBy(s, e, station, i)) return;
    const d = dist(e, p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

// Кипер у решётки или ограды: ближайшая точка линии контакта и место для слона напротив
export interface KeeperContact {
  area: AreaId;
  zone: ZoneId;
  keeper: Vec;
  line: Vec;
  spot: Vec; // где встать слону, чтобы дотянуться хоботом
  face: number;
}

export function keeperContact(s: State): KeeperContact | null {
  const k = s.keeper;
  let best: KeeperContact | null = null;
  let bestD = 1.65;
  for (const l of CONTACT_LINES) {
    const c = closestOnSegment(k.x, k.y, l.x0, l.y0, l.x1, l.y1);
    if (c.d < bestD && (k.y - c.y) * l.keeperSide >= 0) {
      bestD = c.d;
      // Слону — по другую сторону линии, на расстоянии длины корпуса от решётки
      const spot = { x: c.x, y: c.y - l.keeperSide * 1.95 };
      best = { area: l.area, zone: AREA_ZONE[l.area], keeper: { x: k.x, y: k.y }, line: { x: c.x, y: c.y }, spot, face: l.keeperSide > 0 ? Math.PI / 2 : -Math.PI / 2 };
    }
  }
  return best;
}

// Ближайшая точка у линии контакта отсека к произвольной точке — для зова и подхода к киперу
export function contactSpotNear(area: AreaId, x: number, y: number): { spot: Vec; face: number; line: Vec } | null {
  let best: { spot: Vec; face: number; line: Vec } | null = null;
  let bestD = Infinity;
  for (const l of CONTACT_LINES) {
    if (l.area !== area) continue;
    const c = closestOnSegment(x, y, l.x0, l.y0, l.x1, l.y1);
    if (c.d < bestD) {
      bestD = c.d;
      const sx = Math.max(Math.min(l.x0, l.x1) + 1.2, Math.min(Math.max(l.x0, l.x1) - 1.2, c.x));
      best = { spot: { x: sx, y: c.y - l.keeperSide * 1.95 }, face: l.keeperSide > 0 ? Math.PI / 2 : -Math.PI / 2, line: { x: c.x, y: c.y } };
    }
  }
  return best;
}

export function keeperDistanceToHead(s: State, e: Elephant): number {
  return dist(headPos(e, 1.7), s.keeper);
}

// Ближайшая к киперу точка корпуса (для работы с лежащей или стоящей боком слонихой)
export function keeperDistanceToBody(s: State, e: Elephant): number {
  const L = e.profile.look;
  const half = 1.05 * L.size * L.length;
  const c = Math.cos(e.heading);
  const sn = Math.sin(e.heading);
  const cl = closestOnSegment(s.keeper.x, s.keeper.y, e.x - c * half, e.y - sn * half, e.x + c * half, e.y + sn * half);
  return Math.max(0, cl.d - 0.95 * L.size * L.girth);
}

// Можно ли дотянуться до слона через решётку: до головы — стоящую, до бока — лежащую или стоящую боком
export function keeperCanTouch(s: State, e: Elephant): boolean {
  if (e.lying) return keeperDistanceToBody(s, e) <= 1.3;
  return keeperDistanceToHead(s, e) <= KEEPER.elephantReach || keeperDistanceToBody(s, e) <= 0.9;
}

export function nearestOther(s: State, e: Elephant): { o: Elephant; d: number } | null {
  let best: { o: Elephant; d: number } | null = null;
  for (const o of s.elephants) {
    if (o === e) continue;
    const d = dist(e, o);
    if (!best || d < best.d) best = { o, d };
  }
  return best;
}

export function bestFriend(s: State, e: Elephant): Elephant | null {
  let best: Elephant | null = null;
  let bestB = -Infinity;
  for (const o of s.elephants) {
    if (o === e) continue;
    const b = bond(s, e.id, o.id);
    if (b > bestB) {
      bestB = b;
      best = o;
    }
  }
  return best;
}

export function elephantById(s: State, id: string): Elephant | undefined {
  return s.elephants.find((e) => e.id === id);
}
