import { describe, expect, it } from 'vitest';
import { advance, createShift, walkable } from '../src/sim';
import { MAP, inPaddock } from '../src/data/map';
import { pee } from '../src/sim/elephants';
import { countWet } from '../src/sim/floor';
import { nearContainer } from '../src/sim/barrow';
import { act, at, cleanShift, driveTo, el, hold } from './helpers';
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
    expect(walkable(4.4, 13)).toBe(false);
    expect(walkable(2.2, 11.4)).toBe(true); // дежурка
    expect(walkable(7.1, 11.4)).toBe(true); // мойка
    expect(walkable(11.8, 11.4)).toBe(true); // кормовая
    expect(walkable(12.0, 15.6)).toBe(false); // задняя стена
    expect(walkable(13.7, 15.6)).toBe(true); // задняя дверь кормовой
  });

  it('трава — часть вольера, дорожка — нет', () => {
    expect(inPaddock(17, 5)).toBe(true);
    expect(inPaddock(17, 10)).toBe(false);
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

  it('моча на траве: промах засчитан, подстилка не мокнет', () => {
    const s = cleanShift();
    const e = el(s, 'pretty');
    hold(e, 17, 5);
    pee(s, e);
    expect(e.tally.missed).toBe(1);
    expect(countWet(s)).toBe(0);
  });

  it('тачку везут из дежурки по дорожке и заезжают в открытый контейнер', () => {
    const s = cleanShift();
    at(s, MAP.barrowStart.x, MAP.barrowStart.y + 0.8);
    expect(act(s)).toBe('Везти тачку');
    const d = MAP.stations.dump;
    driveTo(s, { x: d.x, y: d.y - d.h / 2 - 0.6 });
    expect(nearContainer(s)).toBe(true);
  });
});

describe('маршрут бота', () => {
  it('ведёт в точную цель, даже если маршрут между теми же клетками уже искали', () => {
    const from = { x: 2.9, y: 10.2 };
    route(from, { x: 16.1, y: 13.3 });
    const path = route(from, { x: 16.3, y: 13.4 });
    expect(path[path.length - 1]).toEqual({ x: 16.3, y: 13.4 });
  });
});

describe('бот у решётки', () => {
  it('вещь в вольере, до которой с дорожки не дотянуться, берёт изнутри', () => {
    const far = reachPoint({ x: 6, y: 8.1 });
    expect(Math.hypot(far.x - 6, far.y - 8.1)).toBeLessThanOrEqual(1.1 - 0.25);
    const near = reachPoint({ x: 6, y: 8.5 });
    expect(near.y).toBeGreaterThan(MAP.fenceY);
  });
});
