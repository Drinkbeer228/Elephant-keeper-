import { describe, expect, it } from 'vitest';
import { INTERNSHIP_STAGES, SCENARIOS, ScenarioRun, scenarioById } from '../src/station/scenarios';
import {
  computeShiftFlags,
  evaluateShiftCare,
  LEGACY_SUMMARY_KEY,
  markScenario,
  readSummary,
  SUMMARY_KEY,
  targetOrigin,
} from '../src/station/link';
import { buildReport } from '../src/sim/report';
import { createState, step, type SimEvent } from '../src/sim';
import { AutoKeeper } from '../src/dev/autokeeper';

const ev = (kind: string, severity: SimEvent['severity'] = 'info', text = ''): SimEvent => ({
  kind,
  x: 0,
  y: 0,
  elephantId: null,
  severity,
  text,
});

function memory() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('задания и 4-этапная кампания стажировки', () => {
  it('находятся по id из ссылки (включая stage-1..stage-4 и internship), чужие и кривые id — нет', () => {
    expect(scenarioById('prep')?.title).toBe('Кормокухня');
    expect(scenarioById('stage-1')?.stage).toBe(1);
    expect(scenarioById('stage-2')?.stage).toBe(2);
    expect(scenarioById('stage-3')?.stage).toBe(3);
    expect(scenarioById('stage-4')?.stage).toBe(4);
    expect(scenarioById('internship')?.stages?.length).toBe(4);
    expect(scenarioById('nope')).toBeNull();
    expect(scenarioById('<x>')).toBeNull();
    expect(scenarioById(null)).toBeNull();
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });

  it('одиночное задание засчитывается по своим событиям и один раз', () => {
    const run = new ScenarioRun(scenarioById('cleaning')!);
    expect(run.push([ev('shovel'), ev('rake'), ev('shovel')])).toBe(false);
    expect(run.done).toBe(2);
    expect(run.push([ev('shovel'), ev('shovel'), ev('shovel')])).toBe(true);
    expect(run.complete).toBe(true);
    expect(run.push([ev('shovel')])).toBe(false);
  });

  it('этап стажировки ведёт по шагам со сменой реплик старшего кипера', () => {
    const run = new ScenarioRun(scenarioById('stage-1')!);
    expect(run.stepIndex).toBe(0);
    expect(run.mentorText).toContain('Старший кипер:');
    expect(run.mentorTone).toBe('info');

    // Шаг 1: окликнуть слониху голосом
    expect(run.push([ev('voice')])).toBe(false);
    expect(run.stepIndex).toBe(1);
    expect(run.mentorText).toContain('Осмотри периметр');

    // Шаг 2: открыть кран поилки
    expect(run.push([ev('valve')])).toBe(false);
    expect(run.stepIndex).toBe(2);
    expect(run.mentorText).toContain('кормокухню');

    // Шаг 3: собрать таз рациона
    expect(run.push([ev('prepDone')])).toBe(true);
    expect(run.complete).toBe(true);
    expect(run.mentorTone).toBe('good');
    expect(run.mentorText).toContain('Вводный инструктаж сдан');
    expect(run.drainCompletedStages()).toEqual(['stage-1']);
  });

  it('нарушения ТБ вызывают замечания старшего кипера или провал смены с возможностью сброса', () => {
    const run = new ScenarioRun(scenarioById('stage-2')!);

    // Первое предупреждение от слона (warn) не валит смену, но меняет реплику наставника
    expect(run.push([ev('warn', 'warn')])).toBe(false);
    expect(run.failed).toBe(false);
    expect(run.warnings).toBe(1);
    expect(run.mentorTone).toBe('warn');
    expect(run.mentorText).toContain('Слониха растопырила уши');

    // Испуг стада (spook) после уже имеющегося предупреждения доводит счётчик до 2 — провал смены
    expect(run.push([ev('spook', 'warn')])).toBe(false);
    expect(run.failed).toBe(true);
    expect(run.mentorTone).toBe('bad');
    expect(run.failReason).toContain('переполох в стаде');

    // После провала события не двигают прогресс до reset()
    expect(run.push([ev('hay'), ev('hay')])).toBe(false);
    expect(run.done).toBe(0);

    run.reset();
    expect(run.failed).toBe(false);
    expect(run.stepIndex).toBe(0);

    // Первый испуг с нуля — предупреждение, второй — провал
    expect(run.push([ev('spook', 'warn')])).toBe(false);
    expect(run.failed).toBe(false);
    expect(run.push([ev('spook', 'warn')])).toBe(false);
    expect(run.failed).toBe(true);

    run.reset();
    // Подход сзади в слепую зону (kick) мгновенно проваливает смену
    expect(run.push([ev('kick', 'bad')])).toBe(false);
    expect(run.failed).toBe(true);
    expect(run.failReason).toContain('слепую зону');

    // На экзамене (stage-4) даже один испуг (spook) сразу останавливает смену
    const exam = new ScenarioRun(scenarioById('stage-4')!);
    expect(exam.push([ev('spook', 'warn')])).toBe(false);
    expect(exam.failed).toBe(true);

    // Несмытое моющее средство в поилке также проваливает смену
    const chem = new ScenarioRun(scenarioById('stage-1')!);
    expect(chem.push([ev('refuse', 'bad', 'В поилке среднее средство не смыли — слониха отвернулась.')])).toBe(false);
    expect(chem.failed).toBe(true);
  });

  it('полная кампания internship проводит через все 4 этапа подряд', () => {
    const run = new ScenarioRun(scenarioById('internship')!);
    expect(run.activeStageId).toBe('stage-1');

    // Этап 1: voice (1), valve/hay (1), prepDone/hay/pour (1)
    expect(run.push([ev('voice'), ev('valve'), ev('prepDone')])).toBe(false);
    expect(run.drainCompletedStages()).toEqual(['stage-1']);
    expect(run.activeStageId).toBe('stage-2');

    // Этап 2: hay/valve (2), gate (1), shovel (3)
    expect(run.push([ev('hay'), ev('hay'), ev('gate'), ev('shovel'), ev('shovel'), ev('shovel')])).toBe(false);
    expect(run.drainCompletedStages()).toEqual(['stage-2']);
    expect(run.activeStageId).toBe('stage-3');

    // Этап 3: voice (2), heart/treat/porridgeServed (2), brush/spray/shovel (2)
    expect(run.push([ev('voice'), ev('voice'), ev('heart'), ev('treat'), ev('brush'), ev('spray')])).toBe(false);
    expect(run.drainCompletedStages()).toEqual(['stage-3']);
    expect(run.activeStageId).toBe('stage-4');

    // Этап 4: prepDone/porridgeServed/pour (2), shovel/hay/straw/rake/spray (3), heart/treat/brush/porridgeServed (2)
    expect(
      run.push([
        ev('prepDone'),
        ev('porridgeServed'),
        ev('shovel'),
        ev('hay'),
        ev('straw'),
        ev('heart'),
        ev('treat'),
      ]),
    ).toBe(true);
    expect(run.complete).toBe(true);
    expect(run.drainCompletedStages()).toEqual(['stage-4']);
  });
});

describe('телеметрия качества смены и метки пропущенного ухода (flags)', () => {
  it('формирует метки not-fed, no-water, not-cleaned при пропусках и пустой массив при чистой смене', () => {
    const s = createState({ seed: 42, herdSize: 3 });

    // На старте смены: на выгуле кормушка пуста и рацион ещё не выдан (not-fed), в денниках ночной навоз (not-cleaned), поилки с водой
    expect(computeShiftFlags(s)).toEqual(['not-fed', 'not-cleaned']);

    // Если опустошить поилку — добавляется no-water (все три метки)
    s.world.troughs.barnWaterW.level = 0;
    expect(computeShiftFlags(s)).toEqual(['not-fed', 'no-water', 'not-cleaned']);

    // Убираем навоз из денников: остаются только not-fed и no-water
    s.world.dung = [];
    expect(computeShiftFlags(s)).toEqual(['not-fed', 'no-water']);

    // Наполняем поилки чистой водой и кормушки сеном -> «чистая смена» без меток
    s.world.troughs.barnWaterW.level = 85;
    s.world.feeders.paddockFeeder.hay = 14;
    const cleanCare = evaluateShiftCare(s);
    expect(cleanCare.fed).toBe(true);
    expect(cleanCare.watered).toBe(true);
    expect(cleanCare.cleaned).toBe(true);
    expect(cleanCare.flags).toEqual([]);
    expect(cleanCare.items.every((i) => i.ok)).toBe(true);

    // Если один из слонов остался голодным или кормушка в деннике опустела — снова not-fed
    s.world.feeders.barnRackE.hay = 0;
    expect(computeShiftFlags(s)).toEqual(['not-fed']);

    // Полевой рапорт включается в итоговый отчёт смены buildReport
    const report = buildReport(s);
    expect(report.care?.flags).toEqual(['not-fed']);
    expect(report.care?.items.length).toBe(3);
  });

  it('записывает flags в ers_progress_v1:keeper при status: done и снимает их при чистой смене', () => {
    const m = memory();

    // При status: "started" метки не добавляются
    markScenario('feeding', 'started', m, '2026-11-14T09:00:00.000Z', ['not-fed', 'no-water']);
    const startedKeeper = JSON.parse(m.data.get(LEGACY_SUMMARY_KEY)!);
    expect(startedKeeper.items.feeding).toEqual({
      kind: 'scenario',
      status: 'started',
      at: '2026-11-14T09:00:00.000Z',
    });

    // Завершение смены с пропусками ухода записывает flags в объект сценария внутри items[<scenarioId>]
    markScenario('feeding', 'done', m, '2026-11-14T09:10:00.000Z', ['not-fed', 'no-water']);
    const withFlagsKeeper = JSON.parse(m.data.get(LEGACY_SUMMARY_KEY)!);
    expect(withFlagsKeeper).toEqual({
      schema: 'ers.progress/1',
      module: 'keeper',
      updatedAt: '2026-11-14T09:10:00.000Z',
      items: {
        feeding: {
          kind: 'scenario',
          status: 'done',
          at: '2026-11-14T09:10:00.000Z',
          flags: ['not-fed', 'no-water'],
        },
      },
    });

    // Брошенная попытка поверх завершённой (status: "started") не затирает done и его flags
    markScenario('feeding', 'started', m, '2026-11-14T09:15:00.000Z');
    expect(JSON.parse(m.data.get(LEGACY_SUMMARY_KEY)!).items.feeding.flags).toEqual(['not-fed', 'no-water']);

    // Повторное прохождение «чистой сменой» (flags = []) убирает поле flags, чтобы станция сняла выговор
    markScenario('feeding', 'done', m, '2026-11-14T09:30:00.000Z', []);
    const cleanKeeper = JSON.parse(m.data.get(LEGACY_SUMMARY_KEY)!);
    expect(cleanKeeper.items.feeding).toEqual({
      kind: 'scenario',
      status: 'done',
      at: '2026-11-14T09:30:00.000Z',
    });
    expect('flags' in cleanKeeper.items.feeding).toBe(false);
  });

  it('использует window.location.origin для postMessage при наличии window.location', () => {
    const prevWindow = globalThis.window;
    try {
      Object.defineProperty(globalThis, 'window', {
        value: { location: { origin: 'http://localhost:3000' } },
        configurable: true,
        writable: true,
      });
      expect(targetOrigin()).toBe('http://localhost:3000');
    } finally {
      Object.defineProperty(globalThis, 'window', {
        value: prevWindow,
        configurable: true,
        writable: true,
      });
    }
  });
});

describe('сводка для станции (ers_progress_v1:elephantkeeper)', () => {
  it('пишет ers.progress/1 в ключ ers_progress_v1:elephantkeeper и не откатывает done в started', () => {
    expect(SUMMARY_KEY).toBe('ers_progress_v1:elephantkeeper');
    const m = memory();
    markScenario('prep', 'started', m, '2026-11-14T10:00:00.000Z');
    markScenario('prep', 'done', m, '2026-11-14T10:05:00.000Z');
    markScenario('prep', 'started', m, '2026-11-14T11:00:00.000Z');
    const s = JSON.parse(m.data.get(SUMMARY_KEY)!);
    expect(s).toEqual({
      schema: 'ers.progress/1',
      module: 'elephantkeeper',
      updatedAt: '2026-11-14T10:05:00.000Z',
      items: { prep: { kind: 'scenario', status: 'done', at: '2026-11-14T10:05:00.000Z' } },
    });
    expect(m.data.get(LEGACY_SUMMARY_KEY)).toBeDefined();
  });

  it('автоматически отмечает internship как done после завершения всех 4 этапов', () => {
    const m = memory();
    for (const st of INTERNSHIP_STAGES) {
      markScenario(st.id, 'done', m, '2026-11-14T12:00:00.000Z');
    }
    const s = readSummary(m);
    expect(s.items['internship']?.status).toBe('done');
  });

  it('повреждённая сводка читается как пустая; отказ памяти не бросает', () => {
    const m = memory();
    m.data.set(SUMMARY_KEY, '{oops');
    expect(readSummary(m).items).toEqual({});
    expect(() => markScenario('prep', 'done', { getItem: () => null, setItem: () => { throw new Error('quota'); } })).not.toThrow();
  });
});

describe('задания и кампания стажировки выполнимы в настоящей смене', () => {
  it('бот-кипер за день выполняет одиночные задания и все 4 этапа стажировки без нарушений ТБ', () => {
    const s = createState({ seed: 1, herdSize: 3 });
    const bot = new AutoKeeper();
    const ids = ['prep', 'feeding', 'porridge', 'cleaning', 'trust', 'stage-1', 'stage-2', 'stage-3', 'stage-4'];
    const runs = ids.map((id) => new ScenarioRun(scenarioById(id)!));
    while (s.t < 480 + 1440 && runs.some((r) => !r.complete)) {
      const events = step(s, bot.decide(s));
      for (const r of runs) r.push(events);
    }
    expect(runs.map((r) => [r.scenario.id, r.complete, r.failed])).toEqual(ids.map((id) => [id, true, false]));
  });
});
