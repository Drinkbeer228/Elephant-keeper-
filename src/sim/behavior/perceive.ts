// Что слон «знает» о мире: зоны, места у кормушек, где кипер, кто рядом.

import { ELEPHANT, KEEPER } from '../../data/balance';
import { CONTACT_LINES, STATIONS, zoneAt, type StationId, type ZoneId } from '../../data/facility';
import { closestOnSegment, dist } from '../geometry';
import { bondKey, rankScore } from '../herd';
import type { Elephant, State, Vec } from '../types';

export function zoneOf(e: { x: number; y: number }): ZoneId {
  return zoneAt(e.x, e.y) ?? (e.y < 20 ? 'paddock' : 'barn');
}

export function reachableZones(s: State, e: Elephant): ZoneId[] {
  return s.world.gateOpen ? ['barn', 'paddock'] : [zoneOf(e)];
}

export function canReachZone(s: State, e: Elephant, zone: ZoneId): boolean {
  return s.world.gateOpen || zoneOf(e) === zone;
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
      best = { zone: l.zone, keeper: { x: k.x, y: k.y }, line: { x: c.x, y: c.y }, spot, face: l.keeperSide > 0 ? Math.PI / 2 : -Math.PI / 2 };
    }
  }
  return best;
}

// Ближайшая точка у линии контакта к произвольной точке — для зова и подхода к киперу
export function contactSpotNear(zone: ZoneId, x: number, y: number): { spot: Vec; face: number; line: Vec } | null {
  let best: { spot: Vec; face: number; line: Vec } | null = null;
  let bestD = Infinity;
  for (const l of CONTACT_LINES) {
    if (l.zone !== zone) continue;
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

export function keeperCanTouch(s: State, e: Elephant): boolean {
  return keeperDistanceToHead(s, e) <= KEEPER.elephantReach && !e.lying;
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
