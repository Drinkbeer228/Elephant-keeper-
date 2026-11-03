import { describe, expect, it } from 'vitest';
import { availableAction, createShift, tick } from '../src/sim';
import { throwTire } from '../src/sim/toys';

describe('игрушка-покрышка', () => {
  it('летит на 4–7 клеток и сбивает кипера с выпадением предмета', () => {
    const state = createShift(71, { mess: false });
    const tire = state.tires[0];
    throwTire(state, tire);
    const distance = Math.hypot(tire.vx, tire.vy) * tire.flightDuration;
    expect(distance).toBeGreaterThanOrEqual(4);
    expect(distance).toBeLessThanOrEqual(7);

    state.player.x = 10.4;
    state.player.y = 5;
    const held = { id: state.nextItemId++, kind: 'bucket' as const, x: 10.4, y: 5, droppedAt: state.t };
    state.player.held = held;
    Object.assign(tire, { x: 10, y: 5, vx: 10, vy: 0, flightLeft: 0.1, flightDuration: 0.1, hit: false });

    tick(state, 0.1);

    expect(state.player.knockdownTimer).toBe(2);
    expect(state.player.x).toBeLessThan(10.4);
    expect(state.player.held).toBeNull();
    expect(state.items).toContain(held);
    expect(availableAction(state)).toBeNull();

    const knockedDownAt = { x: state.player.x, y: state.player.y };
    tick(state, 0.1, [{ type: 'move', dx: -1, dy: 0 }]);
    expect(state.player).toMatchObject(knockedDownAt);

    tick(state, 2.1);
    expect(state.player.knockdownTimer).toBe(0);
  });
});
