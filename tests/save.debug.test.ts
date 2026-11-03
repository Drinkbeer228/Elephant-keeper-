import { describe, expect, it } from 'vitest';
import { loadStateFromSave, serializeSave } from '../src/sim';
import { MAP, MAP_ID } from '../src/data/map';
import { cleanShift, el } from './helpers';
import { tick, type State } from '../src/sim';

describe('debug', () => {
  it('held', () => {
    const s = cleanShift(7);
    for (let i = 0; i < 300; i++) {
      tick(s, 1 / 30, [{ type: 'move', dx: Math.sin(i * 0.21), dy: Math.cos(i * 0.17), sprint: false }]);
    }
    const fork = s.items.find((it) => it.kind === 'fork')!;
    s.items = s.items.filter((it) => it !== fork);
    s.player.held = fork;
    const json = serializeSave(s, MAP_ID, { cols: MAP.floor.cols, rows: MAP.floor.rows });
    const file = JSON.parse(json);
    console.log('HELD-IN-JSON:', JSON.stringify(file.state.player.held));
    console.log('FORK-ID:', fork.id, 'IN-ITEMS?', file.state.items.some((i: any) => i.id === fork.id));
    const res = loadStateFromSave(json, { mapId: MAP_ID, cols: MAP.floor.cols, rows: MAP.floor.rows });
    console.log('RES.OK:', res.ok, (res as any).reason, (res as any).detail);
    if (res.ok) console.log('HELD-AFTER:', res.state.player.held?.kind);
    void el;
    expect(true).toBe(false); // force output
  });
});
