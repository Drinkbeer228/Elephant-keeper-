import { describe, expect, it } from 'vitest';
import {
  AISLE,
  BARN_SPOTS,
  BEDDING,
  DOORS,
  DRAIN,
  KEEPER_START,
  POOL,
  SERVICE_EDGE_Y,
  STALL_E,
  STALL_W,
  STATIONS,
  TREES,
  TROUGH_IDS,
  areaAt,
  hardFloor,
  inRect,
  surfaceAt,
  zoneAt,
  type StationId,
} from '../src/data/facility';
import { elephantCanStand, elephantRoute, keeperFieldAt, keeperRoute, type KeeperNavState } from '../src/sim/nav';
import { keeperIndex } from '../src/sim/geometry';

const BIG = 1.09; // радиус самой крупной слонихи
// mask: 1 — ворота на выгул открыты, 2 — ворота между стойлами открыты
const ALL_OPEN = 3;
const LOCKED: KeeperNavState = { mask: 2, access: [] };

describe('карта слоновника', () => {
  it('два стойла, проход кипера и выгул на своих местах', () => {
    expect(areaAt(15, 24)).toBe('stallW');
    expect(areaAt(25, 24)).toBe('stallE');
    expect(areaAt(20, 10)).toBe('paddock');
    expect(areaAt(20, 31.5)).toBeNull();
    expect(inRect(AISLE, 20, 31.5)).toBe(true);
    expect(zoneAt(DRAIN.x, DRAIN.y)).toBe('barn');
    expect(zoneAt(POOL.x, POOL.y)).toBe('paddock');
    for (const t of TREES) expect(zoneAt(t.x, t.y)).toBe('paddock');
    expect(zoneAt(KEEPER_START.x, KEEPER_START.y)).toBeNull();
    expect(STALL_W.x1).toBe(STALL_E.x0);
  });

  it('подстилка — на всё стойло, у решётки — бетонная служебная полоса', () => {
    expect(surfaceAt(15, 24)).toBe('bedding');
    expect(surfaceAt(15, SERVICE_EDGE_Y + 0.8)).toBe('concrete');
    expect(hardFloor(15, SERVICE_EDGE_Y + 0.8)).toBe(true);
    expect(BEDDING.y1).toBe(SERVICE_EDGE_Y);
  });

  it('поилки стойл — на бетоне у решётки, а не в подстилке', () => {
    for (const id of ['barnWaterW', 'barnWaterE'] as const) {
      const r = STATIONS[id].rect!;
      expect(r.y0).toBeGreaterThan(SERVICE_EDGE_Y);
      expect(surfaceAt((r.x0 + r.x1) / 2, r.y0 - 0.2)).toBe('concrete');
    }
    expect(TROUGH_IDS).toHaveLength(3);
  });

  it('все станции кипера достижимы пешком от дежурки, даже когда слоны во всех отсеках', () => {
    for (const st of Object.values(STATIONS)) {
      const p = st.keeper;
      expect(keeperIndex.hits(p.x, p.y, 0.3), `${st.id}: точка кипера в стене`).toBe(false);
      expect(keeperFieldAt(p.x, p.y, LOCKED), `${st.id}: нет прохода`).toBeGreaterThan(0.3);
      expect(keeperRoute(KEEPER_START, p, LOCKED), `${st.id}: недостижима`).not.toBeNull();
    }
  });

  it('в пустое стойло — через свою дверь из прохода; в занятое — никак', () => {
    const open: KeeperNavState = { mask: 0, access: ['stallW', 'stallE', 'paddock'] };
    expect(keeperRoute(KEEPER_START, { x: 15, y: 24 }, open)).not.toBeNull();
    expect(keeperRoute(KEEPER_START, { x: 25, y: 24 }, open)).not.toBeNull();
    expect(keeperRoute(KEEPER_START, { x: 20, y: 10 }, open)).not.toBeNull();
    expect(keeperRoute(KEEPER_START, { x: 15, y: 24 }, LOCKED)).toBeNull();
    expect(keeperRoute(KEEPER_START, { x: 25, y: 24 }, LOCKED)).toBeNull();
    expect(keeperRoute(KEEPER_START, { x: 20, y: 10 }, LOCKED)).toBeNull();
    // Только западное пусто
    const west: KeeperNavState = { mask: 0, access: ['stallW'] };
    expect(keeperRoute(KEEPER_START, { x: 15, y: 24 }, west)).not.toBeNull();
    expect(keeperRoute(KEEPER_START, { x: 25, y: 24 }, west)).toBeNull();
  });

  it('места слонов у кормушек, поилок и стенки доступны даже самой крупной', () => {
    for (const st of Object.values(STATIONS)) {
      for (const sl of st.slots ?? []) {
        expect(elephantCanStand(sl.x, sl.y, BIG, ALL_OPEN), `${st.id}`).toBe(true);
        const from = areaAt(sl.x, sl.y) === 'paddock' ? { x: 24, y: 10 } : BARN_SPOTS[0];
        expect(elephantRoute(from, sl, BIG, ALL_OPEN), `${st.id}: путь`).not.toBeNull();
      }
    }
  });

  it('ворота: на выгул и между стойлами — закрыты не пройти, открыты — пройти; в двери кипера слон не влезает', () => {
    const west = BARN_SPOTS[0];
    const east = { x: 25, y: 24 };
    const out = { x: 24, y: 10 };
    expect(elephantRoute(west, out, BIG, 0)).toBeNull();
    expect(elephantRoute(west, out, BIG, 1)).not.toBeNull();
    expect(elephantRoute(west, east, BIG, 0)).toBeNull();
    expect(elephantRoute(west, east, BIG, 2)).not.toBeNull();
    expect(elephantRoute(east, out, BIG, 1)).toBeNull();
    expect(elephantRoute(east, out, BIG, 3)).not.toBeNull();
    for (const d of DOORS) {
      const cx = (d.rect.x0 + d.rect.x1) / 2;
      const cy = (d.rect.y0 + d.rect.y1) / 2;
      expect(elephantCanStand(cx, cy, 0.8, ALL_OPEN), d.id).toBe(false);
    }
  });

  it('у каждой станции есть подпись и точка подхода', () => {
    const ids = Object.keys(STATIONS) as StationId[];
    expect(ids.length).toBeGreaterThan(25);
    for (const id of ids) expect(STATIONS[id].label.length).toBeGreaterThan(2);
  });
});
