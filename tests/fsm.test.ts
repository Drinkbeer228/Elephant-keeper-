// ============================================================================
// Golden-тест FSM-движка (инкремент 2). Эталон записан ДО подключения движка:
// seed 1, 600 игровых минут через advance (шаг maxStep), после каждого шага —
// сигнатура состояний всех слонов. Движок обязан давать ПОБЕТОВО тот же путь:
// тайминги и последовательность вызовов RNG не изменились.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { createShift } from '../src/sim/state';
import { advance } from '../src/sim/tick';
import { chance } from '../src/sim/rng';
import { serializeSave } from '../src/sim/save';
import { ELEPHANT_AI_REGISTRY } from '../src/sim/ai/states';
import { ensureFsm, canInterrupt, applyIntent, stepElephant } from '../src/sim/ai/engine';
import { elephantBehavior, resolveTransition, intentPriority, TEMPERAMENTS, temperamentOf } from '../src/sim/ai/rules';
import type { Elephant, State } from '../src/sim/types';

// Эталон снят ПОЛНОЙ симуляцией всех слонов через штатный advance (именно так
// работает живая игра): общий генератор State.rng (mulberry32) дёргается слонами
// по очереди, поэтому изоляция одного слона физически разрывает цепочку RNG и
// делает сравнение бессмысленным. Формат строки трейса — целые минуты без
// дробных хвостов: `${Math.floor(minute)}:${id}:${state}` (пары id:state через ':').
const GOLDEN = {
  minutes: 600,
  // rng — состояние генератора mulberry32 по окончании прогона; любое смещение
  // порядка или количества бросков меняет его, поэтому сверка полная
  rngEnd: -576385478,
  statesAtEnd: ['walk', 'walk', 'walk', 'walk', 'walk', 'walk'],
  traceCount: 219,
  traceHead: [
    '0:pretty:idle:margo:idle:audrey:idle:radja:idle:baron:idle:caesar:idle',
  ],
  traceTail: [
    '572:pretty:walk:margo:eatHay:audrey:eatHay:radja:walk:baron:walk:caesar:bathe',
    '578:pretty:walk:margo:eatHay:audrey:walk:radja:walk:baron:walk:caesar:bathe',
    '578:pretty:drink:margo:eatHay:audrey:walk:radja:walk:baron:walk:caesar:bathe',
    '588:pretty:idle:margo:eatHay:audrey:walk:radja:walk:baron:walk:caesar:bathe',
    '592:pretty:signal:margo:eatHay:audrey:walk:radja:walk:baron:walk:caesar:bathe',
    '595:pretty:signal:margo:eatHay:audrey:walk:radja:walk:baron:walk:caesar:walk',
    '597:pretty:idle:margo:walk:audrey:walk:radja:walk:baron:walk:caesar:walk',
    '599:pretty:walk:margo:walk:audrey:walk:radja:walk:baron:walk:caesar:walk',
  ],
};

function runGolden(): { state: State; trace: string[] } {
  const s = createShift(1);
  const trace: string[] = [];
  let last = '';
  for (let m = 0; m < GOLDEN.minutes; m += 0.5) {
    advance(s, 0.5);
    const sig = s.elephants.map((e) => `${e.id}:${e.state}`).join(':');
    if (sig !== last) {
      trace.push(`${Math.floor(m)}:${sig}`);
      last = sig;
    }
  }
  return { state: s, trace };
}

describe('FSM golden (инкремент 2)', () => {
  it('прогон seed 1 на движке побитово совпадает с эталоном старого switch', () => {
    const { state, trace } = runGolden();
    expect(trace.length).toBe(GOLDEN.traceCount);
    expect(trace.slice(0, 1)).toEqual(GOLDEN.traceHead);
    expect(trace.slice(-8)).toEqual(GOLDEN.traceTail);
    expect(state.rng).toBe(GOLDEN.rngEnd);
    expect(state.elephants.map((e) => e.state)).toEqual(GOLDEN.statesAtEnd);
  });

  it('fsm-метаданные живут в состоянии, но в сейв не пишутся', () => {
    // transitions ведёт движок только при СВОИХ переходах (applyIntent). Внешние
    // смены узла (pee/arrive/сигнал в updateOne) инкремент 2 сознательно оставляет
    // «внешними» — поэтому эталонный прогон seed 1 даёт нули у слонов, весь траектор
    // которых прошёл через внешние переходы. Гарантии теста: учёт создаётся на каждом
    // слоне и корректно считается там, где переход делал движок (проверка applyIntent выше).
    const { state } = runGolden();
    for (const e of state.elephants) {
      expect(e.fsm).toBeDefined();
      expect(e.fsm!.since).toBeGreaterThanOrEqual(0);
    }
    const json = serializeSave(state, 'modern', { cols: 120, rows: 100 }, 1730000000000);
    expect(json).not.toContain('"fsm"');
    expect(json).not.toContain('aiDt');
    expect(json).not.toContain('committedUntil');
  });
});

// Вспомогательный живой слон для юнит-проверок движка
function dummyElephant(state: Partial<Elephant> = {}): Elephant {
  return {
    id: 'kira', x: 0, y: 0, tx: 0, ty: 0, state: 'idle', next: 'idle', timer: 5,
    hunger: 0, thirst: 0, bladder: 0, bowel: 0, boredom: 0, trust: 50, footDebt: 0, footDebtStart: 0,
    limp: false, lyingInWet: false, praiseUntil: -1, begTreats: 0, dirtyFeet: 0, lastCell: '',
    tally: { inBucket: 0, missed: 0, dung: 0 }, wetness: 0,
    traits: { appetite: 1, messiness: 1, aggression: 0 }, musthTimer: 0, ...state,
  } as unknown as Elephant;
}

describe('движок FSM', () => {
  it('applyIntent ведёт учёт переходов и привязку finish-узлов', () => {
    const e = dummyElephant({ state: 'idle' });
    applyIntent(ELEPHANT_AI_REGISTRY, elephantBehavior, {}, e, { target: 'bathe', timer: 10 }, 100);
    expect(e.state).toBe('bathe');
    expect(e.timer).toBe(10);
    const fsm = ensureFsm(e);
    expect(fsm.last).toBe('idle');
    expect(fsm.transitions).toBe(1);
    expect(fsm.since).toBe(100);
    expect(fsm.committedUntil).toBe(103); // DEFAULT_MIN_COMMIT = 3
    // finish-узел нельзя прервать до окончания привязки
    expect(canInterrupt(ELEPHANT_AI_REGISTRY.defs, e, 101, 200)).toBe(false);
    expect(canInterrupt(ELEPHANT_AI_REGISTRY.defs, e, 104, 200)).toBe(true);
  });

  it('гистерезис: равный или +10 приоритет не прерывает', () => {
    const e = dummyElephant({ state: 'scratch' }); // priority 35
    expect(canInterrupt(ELEPHANT_AI_REGISTRY.defs, e, 0, 45)).toBe(false); // ровно +10
    expect(canInterrupt(ELEPHANT_AI_REGISTRY.defs, e, 0, 46)).toBe(true);
  });

  it('none-узлы не прерываются диспетчером', () => {
    const e = dummyElephant({ state: 'signal' });
    expect(resolveTransition([{ target: 'sleep', priority: 999 }], e, 1000)).toBeNull();
  });

  it('resolveTransition выбирает лучшего кандидата с запасом гистерезиса', () => {
    const e = dummyElephant({ state: 'idle' }); // priority 10
    const best = resolveTransition(
      [{ target: 'play', priority: 35 }, { target: 'eatBasin', priority: 80 }, { target: 'drink', priority: 21 }],
      e, 100,
    );
    expect(best?.target).toBe('eatBasin');
    // кандидат ниже порога (<= 10+10) не проходит
    expect(resolveTransition([{ target: 'sway', priority: 20 }], e, 100)).toBeNull();
  });

  it('intentPriority: явный приоритет важнее таблицы узлов', () => {
    expect(intentPriority({ target: 'idle', priority: 77 })).toBe(77);
    expect(intentPriority({ target: 'idle' })).toBe(10);
  });

  it('stepElephant исполняет цепочку timer→decide одним подшагом', () => {
    const s = createShift(7);
    const e = s.elephants[0];
    // decide() детерминирован по порогам: basin нет, thirst>60 при полной поилке —
    // гарантированный переход idle→walk (walkTo выставляет state/next напрямую).
    e.state = 'idle';
    e.timer = 0.1; // истечёт на этом же подшаге — decide выберет следующее занятие
    e.thirst = 95;
    s.trough = 80;
    // seed 7 в первом же броске даёт «остаться в idle» (decide: else-ветка), поэтому
    // прокручиваем генератор до первого chance(<0.6) — там walkTo ставит walk/drink.
    // Порядок RNG не меняется: это тот же mulberry32-поток, просто сдвинут старт.
    while (!chance(s, 0.6)) { /* ждём ветку wander в decide */ }
    stepElephant(ELEPHANT_AI_REGISTRY, elephantBehavior, { state: s, dt: 0.5, dtReal: 0.5 }, e, s.t);
    expect(e.state).toBe('walk'); // движок обязан был выйти из idle, как старый switch
    expect(e.next).toBe('drink');
    // bounded chain: новый узел (walk) получил первый шаг в этом же подшаге —
    // слон сдвинулся к цели, не дожидаясь следующего тика (старая семантика switch)
    expect(Math.hypot(e.tx - e.x, e.ty - e.y)).toBeGreaterThan(0);
    expect(ensureFsm(e).transitions).toBeGreaterThan(0);
  });

  it('характеры: в инкременте 2 все множители = 1 (нейтральный профиль)', () => {
    const t = temperamentOf({ id: 'kira' } as never);
    expect(t).toBe(TEMPERAMENTS.neutral);
    for (const v of Object.values(t.rates)) expect(v).toBe(1);
  });
});
