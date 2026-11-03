import { describe, expect, it } from 'vitest';
import { advance, createShift, walkable } from '../src/sim';
import { MAP, inPaddock } from '../src/data/map';
import { MAP as LEGACY_MAP } from '../src/data/map-legacy';
import { pee } from '../src/sim/elephants';
import { cellAt, countWet } from '../src/sim/floor';
import { BALANCE } from '../src/data/balance';
import { newItem } from '../src/sim/state';
import { nearContainer } from '../src/sim/barrow';
import { act, at, cleanShift, el, hold } from './helpers';
import { reachPoint, route } from '../src/dev/bot';

describe('карта-комплекс', () => {
  it('рабочая старая карта сохраняет ограждения обоих слоновников и проходы', () => {
    for (const y of [LEGACY_MAP.fenceY, LEGACY_MAP.fenceY2]) {
      expect(LEGACY_MAP.walls).toContainEqual({ x0: 4, y0: y, x1: 6.2, y1: y });
      expect(LEGACY_MAP.walls).toContainEqual({ x0: 7.6, y0: y, x1: 9.6, y1: y });
      expect(LEGACY_MAP.walls).toContainEqual({ x0: 12.4, y0: y, x1: 52, y1: y });
    }
    expect(LEGACY_MAP.walls).toContainEqual({ x0: 52, y0: 1, x1: 52, y1: 13 });
    expect(LEGACY_MAP.walls).toContainEqual({ x0: 52, y0: 28, x1: 52, y1: 47 });
    expect(LEGACY_MAP.elephantGate).toEqual({ x0: 9.6, x1: 12.4 });
    expect(LEGACY_MAP.elephantGate2).toEqual({ x0: 9.6, x1: 12.4 });
  });

  it('контейнер непроходим, к нему есть маршрут', () => {
    const d = MAP.stations.dump;
    expect(walkable(d.x, d.y)).toBe(false);
    expect(walkable(d.x, d.y - d.h / 2 - 0.6)).toBe(true);
  });

  it('ворота комплексов независимы, а служебный проход закрыт для животных', () => {
    const femaleGate = { x: 26, y: 34 };
    const maleGate = { x: 85, y: 34 };
    expect(walkable(femaleGate.x, femaleGate.y, { gates: { female: false, male: false } })).toBe(false);
    expect(walkable(femaleGate.x, femaleGate.y, { gates: { female: true, male: false } })).toBe(true);
    expect(walkable(maleGate.x, maleGate.y, { gates: { female: true, male: false } })).toBe(false);
    expect(walkable(18.5, 34, { animal: 'female', gates: { female: true, male: false } })).toBe(false);
    expect(walkable(44.5, 34, { animal: 'female', gates: { female: true, male: false } })).toBe(false);
    expect(walkable(44.5, 34, { gates: { female: false, male: false } })).toBe(true);
    expect(walkable(42.25, 48, { gates: { female: false, male: false } })).toBe(true);
    expect(walkable(64.5, 48, { gates: { female: false, male: false } })).toBe(true);
  });

  it('дверные проёмы сохраняют проходимость, стены зданий блокируют', () => {
    expect(walkable(16, 60)).toBe(false);
    expect(walkable(22, 56)).toBe(true);
    expect(walkable(18.5, 74)).toBe(true);
    expect(walkable(25, 77)).toBe(false);
    expect(walkable(84, 60, { deliveryOpen: false })).toBe(false);
    expect(walkable(84, 60, { deliveryOpen: true })).toBe(true);
  });

  it('северные комплексы раздельны, оба имеют собственные ротацию, слоновник и бассейн', () => {
    expect(inPaddock(30, 25)).toBe(true);
    expect(inPaddock(80, 25)).toBe(true);
    expect(inPaddock(54, 25)).toBe(false);
    expect(MAP.complexes.female.barn).not.toEqual(MAP.complexes.male.barn);
    expect(MAP.pools).toHaveLength(2);
    expect(walkable(4, 5)).toBe(false);
  });

  it('план покрывает карту 120×100, складские зоны имеют отдельные маршруты', () => {
    const s = cleanShift();
    expect(MAP.floor).toMatchObject({ cols: 120, rows: 100 });
    expect(s.cells).toHaveLength(100);
    expect(s.cells.every((row) => row.length === 120)).toBe(true);
    expect(route(MAP.playerStart, { x: MAP.stations.hay.x, y: MAP.stations.hay.y + 2 }).length).toBeGreaterThan(0);
    expect(route(MAP.playerStart, { x: MAP.stations.unload.x, y: MAP.stations.unload.y }, { deliveryOpen: true }).length).toBeGreaterThan(0);
    expect(route(MAP.playerStart, { x: 22, y: 25 }).length).toBeGreaterThan(0);
    expect(route(MAP.playerStart, { x: 70, y: 25 }).length).toBeGreaterThan(0);
  });

  it('слоны гуляют и по траве, но не покидают вольеры', () => {
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
  }, 15000);

  it('моча на траве: промах засчитан, на лугу лужа, подстилка не мокнет', () => {
    const s = cleanShift();
    const e = el(s, 'pretty');
    hold(e, 34, 25);
    pee(s, e);
    expect(e.tally.missed).toBe(1);
    expect(countWet(s)).toBe(0);
    expect(cellAt(s, 34, 25)!.cell.kind).toBe('puddle');
  });

  it('на лугу бак под слонихой работает так же, как на подстилке', () => {
    const s = cleanShift();
    const e = el(s, 'pretty');
    hold(e, 34, 25);
    s.items.push({ ...newItem(s, 'bucket', { liters: 0 }), x: 34, y: 25 });
    pee(s, e);
    expect(e.tally.inBucket).toBe(1);
    expect(cellAt(s, 34, 25)!.cell.kind).toBe('grass');
  });

  it('лужа на траве впитывается сама', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, e.id === 'radja' || e.id === 'baron' || e.id === 'caesar' ? 90 : 45, 24));
    const ref = cellAt(s, 34, 25)!;
    s.cells[ref.cy][ref.cx] = { kind: 'puddle', since: 0 };
    advance(s, BALANCE.floor.puddleDry + 1);
    expect(cellAt(s, 34, 25)!.cell.kind).toBe('grass');
  });

  it('навоз на лугу затаптывают, совком счищают до травы', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, e.id === 'radja' || e.id === 'baron' || e.id === 'caesar' ? 90 : 45, 24));
    const e = el(s, 'margo');
    s.dung.push({ id: 960, x: 34.5, y: 25.5, at: 0 });
    hold(e, 34.5, 25.5);
    s.t = BALANCE.elephant.dungTolerance + 5;
    advance(s, 1);
    expect(cellAt(s, 34.5, 25.5)!.cell.kind).toBe('dung');
    hold(e, 45, 24);
    s.player.held = newItem(s, 'scoop');
    at(s, 34.5, 25.5);
    expect(act(s)).toBe('Счистить затоптанный навоз в совок (2/6)');
    expect(cellAt(s, 34.5, 25.5)!.cell.kind).toBe('grass');
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
    const from = { x: 52.5, y: 53.2 };
    route(from, { x: 42.1, y: 60.3 });
    const path = route(from, { x: 42.3, y: 60.4 });
    expect(path[path.length - 1]).toEqual({ x: 42.3, y: 60.4 });
  });
});

describe('бот у решётки', () => {
  it('вещь в вольере, до которой с дорожки не дотянуться, берёт изнутри', () => {
    const far = reachPoint({ x: 20, y: 25 });
    expect(Math.hypot(far.x - 20, far.y - 25)).toBeLessThanOrEqual(1.1 - 0.25);
    const near = reachPoint({ x: 20, y: MAP.fenceY - 0.5 });
    expect(near.y).toBeGreaterThan(MAP.fenceY);
  });
});
