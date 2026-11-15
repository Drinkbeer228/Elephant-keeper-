import { describe, expect, it } from 'vitest';
import { addBarrow, BARROWS_PER_BUNKER, BUNKER_KEY, bunkerPercent, readBunker, WASTE_TANK_ITEM } from '../src/station/bunker';
import { LEGACY_SUMMARY_KEY, PROTOCOL_MODULE, readSummary, SUMMARY_KEY } from '../src/station/link';
import { createState } from '../src/sim';
import { drainEvents } from '../src/sim/events';
import { applyAction } from '../src/sim/keeper';

function memory() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('уличный бункер станции', () => {
  it('три тачки — 100 %: отметка waste-tank в обеих копиях сводки, партия начинается заново', () => {
    const s = memory();
    expect(readBunker(s)).toEqual({ loads: 0, fills: 0 });
    expect(addBarrow(s, '2026-11-15T09:00:00.000Z').full).toBe(false);
    expect(bunkerPercent(readBunker(s))).toBe(33);
    expect(addBarrow(s, '2026-11-15T09:10:00.000Z').full).toBe(false);
    expect(readSummary(s).items[WASTE_TANK_ITEM]).toBeUndefined();
    const third = addBarrow(s, '2026-11-15T09:20:00.000Z');
    expect(third.full).toBe(true);
    expect(third.bunker).toEqual({ loads: 0, fills: 1 });
    const item = { kind: 'event', status: 'done', at: '2026-11-15T09:20:00.000Z', score: 1 };
    expect(JSON.parse(s.data.get(SUMMARY_KEY)!).items[WASTE_TANK_ITEM]).toEqual(item);
    const legacy = JSON.parse(s.data.get(LEGACY_SUMMARY_KEY)!);
    expect(legacy.module).toBe('keeper');
    expect(legacy.items[WASTE_TANK_ITEM]).toEqual(item);
    expect(BARROWS_PER_BUNKER).toBe(3);
  });

  it('каждое наполнение — новая запись waste-tank с числом наполнений в score: станция шлёт по партии на каждое', () => {
    const s = memory();
    for (let i = 0; i < BARROWS_PER_BUNKER * 2; i++) addBarrow(s, `2026-11-15T10:0${i}:00.000Z`);
    expect(readBunker(s)).toEqual({ loads: 0, fills: 2 });
    expect(readSummary(s).items[WASTE_TANK_ITEM]).toEqual({ kind: 'event', status: 'done', at: '2026-11-15T10:05:00.000Z', score: 2 });
  });

  it('мусор в памяти — пустой бункер; отказ записи не бросает', () => {
    const s = memory();
    s.data.set(BUNKER_KEY, '{"loads":99,"fills":-4}');
    expect(readBunker(s)).toEqual({ loads: 2, fills: 0 });
    s.data.set(BUNKER_KEY, 'not json');
    expect(readBunker(s)).toEqual({ loads: 0, fills: 0 });
    expect(() => addBarrow({ getItem: () => null, setItem: () => { throw new Error('quota'); } })).not.toThrow();
  });

  it('станция знает симулятор как keeper', () => {
    expect(PROTOCOL_MODULE).toBe('keeper');
  });

  it('выгрузка непустой тачки в контейнер помечена для бункера; пустая — нет', () => {
    const st = createState({ seed: 7 });
    drainEvents();
    st.world.barrow.load = 5;
    const before = st.world.container;
    applyAction(st, { verb: 'dumpBarrow', target: 'container' });
    expect(st.world.container).toBe(before + 5);
    expect(drainEvents().filter((e) => e.kind === 'dump' && e.tag === 'barrow')).toHaveLength(1);
    applyAction(st, { verb: 'dumpBarrow', target: 'container' });
    expect(drainEvents().filter((e) => e.kind === 'dump' && e.tag === 'barrow')).toHaveLength(0);
  });
});
