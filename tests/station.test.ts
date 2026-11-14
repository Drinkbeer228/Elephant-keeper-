import { describe, expect, it } from 'vitest';
import { SCENARIOS, ScenarioRun, scenarioById } from '../src/station/scenarios';
import { markScenario, readSummary, SUMMARY_KEY } from '../src/station/link';
import { createState, step, type SimEvent } from '../src/sim';
import { AutoKeeper } from '../src/dev/autokeeper';

const ev = (kind: string): SimEvent => ({ kind, x: 0, y: 0, elephantId: null, severity: 'info', text: '' });

function memory() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('задания стажировки', () => {
  it('находятся по id из ссылки, чужие и кривые id — нет', () => {
    expect(scenarioById('prep')?.title).toBe('Кормокухня');
    expect(scenarioById('nope')).toBeNull();
    expect(scenarioById('<x>')).toBeNull();
    expect(scenarioById(null)).toBeNull();
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });

  it('засчитываются по своим событиям и один раз', () => {
    const run = new ScenarioRun(scenarioById('cleaning')!);
    expect(run.push([ev('shovel'), ev('rake'), ev('shovel')])).toBe(false);
    expect(run.done).toBe(2);
    expect(run.push([ev('shovel'), ev('shovel'), ev('shovel')])).toBe(true);
    expect(run.complete).toBe(true);
    expect(run.push([ev('shovel')])).toBe(false);
  });
});

describe('сводка для станции', () => {
  it('пишет ers.progress/1 и не откатывает done в started', () => {
    const m = memory();
    markScenario('prep', 'started', m, '2026-11-14T10:00:00.000Z');
    markScenario('prep', 'done', m, '2026-11-14T10:05:00.000Z');
    markScenario('prep', 'started', m, '2026-11-14T11:00:00.000Z');
    const s = JSON.parse(m.data.get(SUMMARY_KEY)!);
    expect(s).toEqual({ schema: 'ers.progress/1', module: 'keeper', updatedAt: '2026-11-14T10:05:00.000Z', items: { prep: { kind: 'scenario', status: 'done', at: '2026-11-14T10:05:00.000Z' } } });
  });

  it('повреждённая сводка читается как пустая; отказ памяти не бросает', () => {
    const m = memory();
    m.data.set(SUMMARY_KEY, '{oops');
    expect(readSummary(m).items).toEqual({});
    expect(() => markScenario('prep', 'done', { getItem: () => null, setItem: () => { throw new Error('quota'); } })).not.toThrow();
  });
});

describe('задания выполнимы в настоящей смене', () => {
  it('бот-кипер за день выполняет кормокухню, сено, кашу, уборку и доверие', () => {
    const s = createState({ seed: 1, herdSize: 3 });
    const bot = new AutoKeeper();
    const runs = ['prep', 'feeding', 'porridge', 'cleaning', 'trust'].map((id) => new ScenarioRun(scenarioById(id)!));
    while (s.t < 480 + 1440 && runs.some((r) => !r.complete)) {
      const events = step(s, bot.decide(s));
      for (const r of runs) r.push(events);
    }
    expect(runs.map((r) => [r.scenario.id, r.complete])).toEqual([['prep', true], ['feeding', true], ['porridge', true], ['cleaning', true], ['trust', true]]);
  });
});
