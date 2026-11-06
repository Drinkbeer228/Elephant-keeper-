import { describe, expect, it } from 'vitest';
import { BARN, BARN_SPOTS, BEDDING, DOORS, DRAIN, KEEPER_START, PADDOCK, POOL, STATIONS, TREES, zoneAt, inRect, type StationId } from '../src/data/facility';
import { elephantCanStand, elephantRoute, keeperRoute, keeperFieldAt } from '../src/sim/nav';
import { keeperIndex } from '../src/sim/geometry';

const BIG = 1.09; // радиус самой крупной слонихи

describe('карта слоновника', () => {
  it('зоны и объекты на своих местах', () => {
    expect(inRect(BARN, BEDDING.x0 + 0.1, BEDDING.y0 + 0.1)).toBe(true);
    expect(zoneAt(DRAIN.x, DRAIN.y)).toBe('barn');
    expect(zoneAt(POOL.x, POOL.y)).toBe('paddock');
    for (const t of TREES) expect(zoneAt(t.x, t.y)).toBe('paddock');
    expect(zoneAt(KEEPER_START.x, KEEPER_START.y)).toBeNull();
    expect(PADDOCK.x1).toBeGreaterThan(BARN.x1);
  });

  it('все станции кипера достижимы пешком от дежурки', () => {
    const doors = { gateOpen: false, barnDoor: false, paddockDoor: false };
    for (const st of Object.values(STATIONS)) {
      const p = st.keeper;
      expect(keeperIndex.hits(p.x, p.y, 0.3), `${st.id}: точка кипера в стене`).toBe(false);
      expect(keeperFieldAt(p.x, p.y, doors), `${st.id}: нет прохода`).toBeGreaterThan(0.3);
      const route = keeperRoute(KEEPER_START, p, doors);
      expect(route, `${st.id}: недостижима`).not.toBeNull();
    }
  });

  it('в пустой слоновник и на пустой выгул кипер проходит через свои двери', () => {
    const open = { gateOpen: false, barnDoor: true, paddockDoor: true };
    expect(keeperRoute(KEEPER_START, { x: 20, y: 24 }, open)).not.toBeNull();
    expect(keeperRoute(KEEPER_START, { x: 20, y: 10 }, open)).not.toBeNull();
    const closed = { gateOpen: false, barnDoor: false, paddockDoor: false };
    expect(keeperRoute(KEEPER_START, { x: 20, y: 24 }, closed)).toBeNull();
    expect(keeperRoute(KEEPER_START, { x: 20, y: 10 }, closed)).toBeNull();
  });

  it('места слонов у кормушек и поилок доступны даже самой крупной', () => {
    for (const st of Object.values(STATIONS)) {
      for (const sl of st.slots ?? []) {
        expect(elephantCanStand(sl.x, sl.y, BIG, true), `${st.id}`).toBe(true);
        const from = st.zone === 'barn' ? BARN_SPOTS[0] : { x: 24, y: 10 };
        expect(elephantRoute(from, sl, BIG, true), `${st.id}: путь`).not.toBeNull();
      }
    }
  });

  it('ворота: закрыты — слон не пройдёт, открыты — пройдёт; в двери кипера слон не влезает', () => {
    expect(elephantRoute(BARN_SPOTS[1], { x: 24, y: 10 }, BIG, false)).toBeNull();
    expect(elephantRoute(BARN_SPOTS[1], { x: 24, y: 10 }, BIG, true)).not.toBeNull();
    for (const d of DOORS) {
      const cx = (d.rect.x0 + d.rect.x1) / 2;
      const cy = (d.rect.y0 + d.rect.y1) / 2;
      expect(elephantCanStand(cx, cy, 0.8, true)).toBe(false);
    }
  });

  it('у каждой станции есть подпись и точка подхода', () => {
    const ids = Object.keys(STATIONS) as StationId[];
    expect(ids.length).toBeGreaterThan(15);
    for (const id of ids) expect(STATIONS[id].label.length).toBeGreaterThan(2);
  });
});
