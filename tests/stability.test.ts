import { describe, expect, it } from 'vitest';
import { createState, runMinutes, step, serialize } from '../src/sim';
import { zoneAt } from '../src/data/facility';
import type { State } from '../src/sim';

function sane(s: State): void {
  for (const e of s.elephants) {
    expect(Number.isFinite(e.x) && Number.isFinite(e.y)).toBe(true);
    expect(zoneAt(e.x, e.y), `${e.profile.name} вне вольеров`).not.toBeNull();
    for (const [k, v] of Object.entries(e.needs)) {
      expect(Number.isFinite(v), k).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    for (const v of Object.values(e.learned)) expect(v >= 0 && v <= 1).toBe(true);
  }
  expect(serialize(s).includes('null,null')).toBe(false);
}

describe('устойчивость', () => {
  it('шесть слонов, трое суток без кипера: ничего не ломается', () => {
    const s = createState({ seed: 99, herdSize: 6 });
    for (let d = 0; d < 3; d++) {
      runMinutes(s, 1440);
      sane(s);
    }
    expect(s.reports).toHaveLength(3);
    expect(s.journal.length).toBeLessThanOrEqual(400);
  });

  it('сутки с тремя слонами считаются быстро', () => {
    const s = createState({ seed: 5, herdSize: 3 });
    const t0 = performance.now();
    runMinutes(s, 1440);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(8000);
  });

  it('ворота открыты весь день: слоны свободно ходят между зонами', () => {
    const s = createState({ seed: 6, herdSize: 3 });
    s.world.gateOpen = true;
    const zones = new Set<string>();
    for (let i = 0; i < 30 * 60 * 8; i++) {
      step(s);
      if (i % 300 === 0) for (const e of s.elephants) zones.add(`${e.id}:${zoneAt(e.x, e.y)}`);
    }
    expect([...zones].some((z) => z.endsWith('paddock'))).toBe(true);
    sane(s);
  });

  it('уведомления не спамят: одинаковые записи редки', () => {
    const s = createState({ seed: 12, herdSize: 4 });
    runMinutes(s, 1440);
    const counts = new Map<string, number>();
    for (const j of s.journal) counts.set(j.key, (counts.get(j.key) ?? 0) + 1);
    const worst = Math.max(...counts.values());
    expect(worst).toBeLessThan(40);
  });

  it('утро нового дня: отчёт, привоз, вывоз контейнера', () => {
    const s = createState({ seed: 13, herdSize: 3 });
    s.world.stock.hay = 0;
    s.world.container = 70;
    runMinutes(s, 1440);
    expect(s.pendingReport).toBe(0);
    const r = s.reports[0];
    expect(r.day).toBe(1);
    expect(r.elephants).toHaveLength(3);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(s.world.stock.hay).toBeGreaterThan(5);
    expect(s.world.container).toBeLessThanOrEqual(6);
    expect(s.elephants[0].day.signals).toBe(0);
  });
});
