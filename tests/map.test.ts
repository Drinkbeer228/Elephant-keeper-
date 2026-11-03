import { describe, expect, it } from 'vitest';
import { advance, createShift, walkable } from '../src/sim';
import { MAP, inPaddock, inReachZone } from '../src/data/map';
import { pee } from '../src/sim/elephants';
import { cellAt, countWet, groundOf } from '../src/sim/floor';
import { BALANCE } from '../src/data/balance';
import { newItem } from '../src/sim/state';
import { nearContainer } from '../src/sim/barrow';
import { act, at, cleanShift, el, hold } from './helpers';
import { reachPoint, route } from '../src/dev/bot';

describe('карта-комплекс', () => {
  it('сквозь контейнер не пройти, к его дверям — можно', () => {
    const d = MAP.stations.dump;
    expect(walkable(d.x, d.y)).toBe(false);
    expect(walkable(d.x, d.y - d.h / 2 - 0.6)).toBe(true);
  });

  it('решётка: проход открыт всегда, ворота — только открытые', () => {
    const door = (MAP.door.x0 + MAP.door.x1) / 2;
    const gate = (MAP.elephantGate.x0 + MAP.elephantGate.x1) / 2;
    expect(walkable(door, MAP.fenceY)).toBe(true);
    expect(walkable(gate, MAP.fenceY, false)).toBe(false);
    expect(walkable(gate, MAP.fenceY, true)).toBe(true);
    expect(walkable(10.5, MAP.fenceY)).toBe(false);
    expect(walkable(17, MAP.fenceY)).toBe(false);
  });

  it('постройки: стены держат, двери пропускают', () => {
    expect(walkable(4.1, 20)).toBe(false); // западная стена дежурки
    expect(walkable(13.6, 20)).toBe(false); // перегородка дежурка/мойка
    expect(walkable(6.9, 17)).toBe(true); // дверь дежурки из верхнего коридора
    expect(walkable(17.1, 17)).toBe(true); // дверь мойки
    expect(walkable(27.3, 17)).toBe(true); // дверь кормовой
    expect(walkable(31.0, 24)).toBe(false); // южная стена кормовой
    expect(walkable(30.0, 24)).toBe(true); // дверь кормовой из нижнего коридора
    expect(walkable(10.7, 24)).toBe(true); // южная дверь дежурки — в нижний коридор
  });

  it('у каждой комнаты открыты двери в оба коридора и маршрут между ними', () => {
    for (const room of Object.values(MAP.rooms)) {
      const north = MAP.thresholds.find((t) => t.y0 === room.y0 && (t.x0 + t.x1) / 2 > room.x0 && (t.x0 + t.x1) / 2 < room.x1)!;
      const south = MAP.thresholds.find((t) => t.y0 === room.y1 && (t.x0 + t.x1) / 2 > room.x0 && (t.x0 + t.x1) / 2 < room.x1)!;
      const from = { x: (north.x0 + north.x1) / 2, y: room.y0 - 0.3 };
      const to = { x: (south.x0 + south.x1) / 2, y: room.y1 + 0.3 };

      expect(walkable(from.x, room.y0 + 0.2), `${room.label}: north doorway`).toBe(true);
      expect(walkable(to.x, room.y1 - 0.2), `${room.label}: south doorway`).toBe(true);
      expect(route(from, to).at(-1), `${room.label}: route through room`).toEqual(to);
    }
  });

  it('лесополоса — граница, вольер начинается после неё', () => {
    expect(inPaddock(5, 5)).toBe(true);
    expect(walkable(4.6, 5)).toBe(true);
    expect(walkable(3.8, 5)).toBe(false); // лес
    expect(MAP.bedding.x).toBe(4);
    expect(MAP.bedding.cols).toBe(18);
  });

  it('трава — часть обоих вольеров, коридор — нет', () => {
    expect(inPaddock(30, 5)).toBe(true);
    expect(inPaddock(30, 40)).toBe(true);
    expect(inPaddock(30, 20)).toBe(false);
  });

  it('покрывает карту 64×48 и размечает нижний сектор отдельной подстилкой', () => {
    const s = cleanShift();
    expect(MAP.floor).toMatchObject({ cols: 64, rows: 48 });
    for (const room of Object.values(MAP.rooms)) {
      expect(room.x1 - room.x0).toBeCloseTo(9.6);
      expect(room.y1 - room.y0).toBeCloseTo(7);
    }
    expect(s.cells).toHaveLength(48);
    expect(s.cells.every((row) => row.length === 64)).toBe(true);
    expect(groundOf(5, 28)).toBe('straw');
    expect(groundOf(5, 39)).toBe('straw');
    expect(groundOf(5, 40)).toBe('grass');
    expect(groundOf(5, 47)).toBe('bare');
    expect(cellAt(s, 5, 47)).toBeNull();
  });

  it('нижняя решётка открывает зону досягаемости со стороны коридора', () => {
    expect(inReachZone(15, MAP.fenceY)).toBe(true);
    expect(inReachZone(15, MAP.fenceY2 - 0.5)).toBe(true);
    expect(inReachZone(15, MAP.fenceY2 + 0.5)).toBe(false);
    expect(inPaddock(MAP.stations.valve.x, MAP.stations.valve.y)).toBe(false);
    expect(inPaddock(MAP.stations.valve2.x, MAP.stations.valve2.y)).toBe(false);
    expect(MAP.stations.valve.y - MAP.fenceY).toBeCloseTo(MAP.fenceY2 - MAP.stations.valve2.y);
    expect(MAP.road.x0).toBe(56);
    expect(MAP.road.y1).toBe(MAP.h);
  });

  it('слонихи гуляют и по траве, но не покидают вольер', () => {
    const s = createShift(4, { mess: false });
    let maxX = 0;
    for (let m = 0; m < 1440 && s.phase === 'shift'; m += 1) {
      advance(s, 1);
      for (const e of s.elephants) {
        expect(inPaddock(e.x, e.y)).toBe(true);
        maxX = Math.max(maxX, e.x);
      }
    }
    expect(maxX).toBeGreaterThan(MAP.bedding.x + MAP.bedding.cols);
  });

  it('моча на траве: промах засчитан, на лугу лужа, подстилка не мокнет', () => {
    const s = cleanShift();
    const e = el(s, 'pretty');
    hold(e, 30, 5);
    pee(s, e);
    expect(e.tally.missed).toBe(1);
    expect(countWet(s)).toBe(0);
    expect(cellAt(s, 30, 5)!.cell.kind).toBe('puddle');
  });

  it('на лугу бак под слонихой работает так же, как на подстилке', () => {
    const s = cleanShift();
    const e = el(s, 'pretty');
    hold(e, 30, 5);
    s.items.push({ ...newItem(s, 'bucket', { liters: 0 }), x: 30, y: 5 });
    pee(s, e);
    expect(e.tally.inBucket).toBe(1);
    expect(cellAt(s, 30, 5)!.cell.kind).toBe('grass');
  });

  it('лужа на траве впитывается сама', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    const ref = cellAt(s, 30, 5)!;
    s.cells[ref.cy][ref.cx] = { kind: 'puddle', since: 0 };
    advance(s, BALANCE.floor.puddleDry + 1);
    expect(cellAt(s, 30, 5)!.cell.kind).toBe('grass');
  });

  it('навоз на лугу затаптывают, совком счищают до травы', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    const e = el(s, 'margo');
    s.dung.push({ id: 960, x: 30.5, y: 5.5, at: 0 });
    hold(e, 30.5, 5.5);
    s.t = BALANCE.elephant.dungTolerance + 5;
    advance(s, 1);
    expect(cellAt(s, 30.5, 5.5)!.cell.kind).toBe('dung');
    hold(e, 6, 3);
    s.player.held = newItem(s, 'scoop');
    at(s, 30.5, 5.5);
    expect(act(s)).toBe('Счистить затоптанный навоз в совок (2/6)');
    expect(cellAt(s, 30.5, 5.5)!.cell.kind).toBe('grass');
  });

  it('A* находит путь к контейнеру, у бака тачка разгружается', () => {
    const s = cleanShift();
    at(s, MAP.barrowStart.x, MAP.barrowStart.y + 0.8);
    expect(act(s)).toBe('Везти тачку');
    const d = MAP.stations.dump;
    const goal = { x: d.x, y: d.y - d.h / 2 - 0.6 };
    expect(route({ x: MAP.barrowStart.x, y: MAP.barrowStart.y }, goal).length).toBeGreaterThan(0);
    Object.assign(s.barrow, { x: d.x - d.w / 2 - 0.4, y: d.y, waste: 1 });
    at(s, s.barrow.x - 0.9, s.barrow.y);
    expect(nearContainer(s)).toBe(true);
    expect(act(s)).toBe('Заехать в бак и высыпать тачку');
    expect(s.container.fill).toBe(1);
  });
});

describe('маршрут бота', () => {
  it('ведёт в точную цель, даже если маршрут между теми же клетками уже искали', () => {
    const from = { x: 8.5, y: 15.2 };
    route(from, { x: 16.1, y: 13.3 });
    const path = route(from, { x: 16.3, y: 13.4 });
    expect(path[path.length - 1]).toEqual({ x: 16.3, y: 13.4 });
  });
});

describe('бот у решётки', () => {
  it('вещь в вольере, до которой с дорожки не дотянуться, берёт изнутри', () => {
    const far = reachPoint({ x: 6, y: 8.1 });
    expect(Math.hypot(far.x - 6, far.y - 8.1)).toBeLessThanOrEqual(1.1 - 0.25);
    const near = reachPoint({ x: 6, y: MAP.fenceY - 0.5 });
    expect(near.y).toBeGreaterThan(MAP.fenceY);
  });
});
