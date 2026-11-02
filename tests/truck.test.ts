import { describe, expect, it } from 'vitest';
import { advance } from '../src/sim';
import { finishShift } from '../src/sim/handover';
import { supplyOpen } from '../src/sim/truck';
import { BALANCE } from '../src/data/balance';
import { MAP } from '../src/data/map';
import { at, cleanShift, hold } from './helpers';

const S = BALANCE.supply;

describe('поставка', () => {
  it('утром приезжает с гудком и готовит поддоны к приёмке у дороги', () => {
    const s = cleanShift();
    expect(supplyOpen(s)).toBe(false);
    advance(s, S.arriveAt + 0.5);
    expect(s.supply.arrived).toBe(true);
    // 4 поддона: кладовая (зерно+фрукты), овощи, сено, навес (солома+опилки)
    expect(s.supply.bays.length).toBe(4);
    expect(s.log.some((l) => l.why === 'supplyHorn')).toBe(true);
    expect(supplyOpen(s)).toBe(true);
  });

  it('водитель доходит до борта, остаётся там и не преследует кипера', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    advance(s, S.arriveAt + 0.5);
    advance(s, 70);
    const d = s.supply.driver;
    const board = { x: MAP.stations.unload.x - 1.1, y: MAP.stations.unload.y };
    expect(d.wp).toBe(1);
    expect(Math.hypot(d.x - board.x, d.y - board.y)).toBeLessThan(0.2);
    expect(d.said).toBe(true);
    expect(s.log.some((l) => l.text.startsWith('Водитель'))).toBe(true);

    at(s, 18, 15);
    advance(s, 30);
    expect(d.x).toBeCloseTo(board.x);
    expect(d.y).toBeCloseTo(board.y);
  });

  it('пропустил окно — уехал с грузом, замечание «Груз не принят» (−3)', () => {
    const s = cleanShift();
    advance(s, S.leaveAt + 1);
    expect(s.supply.left).toBe(true);
    expect(s.supply.missed).toBe(true);
    expect(s.supply.bays.length).toBe(0);
    expect(s.log.some((l) => l.why === 'supplyMissed')).toBe(true);
    const rep = finishShift(s);
    expect(rep.remarks).toContain('Груз не принят');
  });

  it('принял всё до конца окна — уезжает без замечания', () => {
    const s = cleanShift();
    advance(s, S.arriveAt + 0.5);
    s.supply.bays = [];
    advance(s, S.leaveAt - s.t + 1);
    expect(s.supply.left).toBe(true);
    expect(s.supply.missed).toBe(false);
    expect(s.log.some((l) => l.why === 'supplyMissed')).toBe(false);
  });
});
