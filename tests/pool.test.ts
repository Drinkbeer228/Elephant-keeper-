import { describe, expect, it } from 'vitest';
import { advance, availableAction } from '../src/sim';
import { MAP } from '../src/data/map';
import { BALANCE } from '../src/data/balance';
import { newItem } from '../src/sim/state';
import { act, at, cleanShift, hold } from './helpers';

describe('бассейны', () => {
  it('есть водоём в каждом загоне и слон намокает в воде, затем сохнет', () => {
    const s = cleanShift();
    expect(MAP.pools).toHaveLength(2);
    const e = s.elephants[0];
    hold(e, MAP.pools[0].x, MAP.pools[0].y);
    e.state = 'bathe';
    e.pool = 0;
    e.timer = 1_000;

    advance(s, 5);
    expect(e.wetness).toBeGreaterThan(0);
    const wet = e.wetness;
    e.state = 'idle';
    e.timer = 1_000;
    advance(s, 10);
    expect(e.wetness).toBeLessThan(wet);
  });

  it('купание оставляет навоз в воде, длинный сачок вылавливает его с берега', () => {
    const s = cleanShift();
    const e = s.elephants[0];
    hold(e, MAP.pools[0].x, MAP.pools[0].y);
    e.state = 'bathe';
    e.pool = 0;
    e.timer = 10_000;
    advance(s, 600);
    expect(s.pools[0].floats.length).toBeGreaterThan(0);
    expect(s.pools[0].dirty).toBeGreaterThan(0);

    const net = s.items.find((i) => i.kind === 'net')!;
    s.items = s.items.filter((i) => i !== net);
    s.player.held = net;
    const bank = { x: MAP.pools[0].x + MAP.pools[0].rx + 0.2, y: MAP.pools[0].y };
    at(s, bank.x, bank.y);
    s.items.push({ ...newItem(s, 'bag', { fill: 0 }), x: bank.x, y: bank.y });

    const dirty = s.pools[0].dirty;
    const floats = s.pools[0].floats.length;
    expect(availableAction(s)?.label).toBe('Выловить навоз из бассейна (в мешок)');
    act(s);
    expect(s.pools[0].floats).toHaveLength(floats - 1);
    expect(s.pools[0].dirty).toBe(Math.max(0, dirty - BALANCE.pool.poopDirt));
    expect(s.items.find((i) => i.kind === 'bag')?.fill).toBe(1);
  });

  it('бак в бассейне можно поднять с берега', () => {
    const s = cleanShift();
    const pool = MAP.pools[0];
    const bucket = newItem(s, 'bucket');
    s.items.push({ ...bucket, x: pool.x, y: pool.y });
    at(s, pool.x, pool.y + pool.ry + 0.2);

    expect(availableAction(s)?.label).toMatch(/^Взять: бак/);
    act(s);
    expect(s.player.held?.kind).toBe('bucket');
  });
});
