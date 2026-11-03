// ============================================================================
// Golden-тест FSM-движка (инкремент 2). Эталон записан ДО подключения движка:
// seed 1, 600 игровых минут через advance (шаг maxStep), после каждого шага —
// сигнатура состояний всех слонов. Движок обязан давать ПОБЕТОВО тот же путь:
// тайминги и последовательность вызовов RNG не изменились.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { createShift } from '../src/sim/state';
import { advance } from '../src/sim/tick';
import { serializeSave } from '../src/sim/save';
import { ELEPHANT_AI_REGISTRY } from '../src/sim/ai/states';
import { ensureFsm, canInterrupt, applyIntent, stepElephant } from '../src/sim/ai/engine';
import { elephantBehavior, resolveTransition, intentPriority, TEMPERAMENTS, temperamentOf } from '../src/sim/ai/rules';
import type { Elephant, State } from '../src/sim/types';

const GOLDEN = {
  minutes: 600,
  // rng — состояние генератора mulberry32 по окончании прогона; любое смещение
  // порядка или количества бросков меняет его, поэтому сверка полная
  rngEnd: -589432709,
  statesAtEnd: ['idle', 'idle', 'walk', 'idle', 'idle', 'idle'],
  trace: [
    '0:idle|idle|idle|idle|idle|idle',
    '1:idle|idle|walk|idle|idle|idle',
    '3:idle|idle|eatHay|idle|idle|idle',
    '13:idle|idle|walk|idle|idle|idle',
    '15:idle|idle|eatBasin|idle|idle|idle',
    '35:idle|idle|walk|idle|idle|idle',
    '36:idle|idle|reach|idle|idle|idle',
    '43:idle|idle|walk|idle|idle|idle',
    '45:idle|idle|signal|idle|idle|idle',
    '47:idle|idle|idle|idle|idle|idle',
    '51:idle|idle|walk|idle|idle|idle',
    '55:idle|idle|drink|idle|idle|idle',
    '66:idle|idle|walk|idle|idle|idle',
    '67:idle|idle|idle|idle|idle|idle',
    '68:idle|idle|walk|idle|idle|idle',
    '72:idle|idle|eatBasin|idle|idle|idle',
    '92:idle|idle|walk|idle|idle|idle',
    '94:idle|idle|idle|idle|idle|idle',
    '95:idle|idle|walk|idle|idle|idle',
    '97:idle|idle|eatBasin|idle|idle|idle',
    '117:idle|idle|walk|idle|idle|idle',
    '119:idle|idle|eatHay|idle|idle|idle',
    '134:idle|idle|walk|idle|idle|idle',
    '136:idle|idle|eatHay|idle|idle|idle',
    '149:idle|idle|walk|idle|idle|idle',
    '151:idle|idle|eatHay|idle|idle|idle',
    '164:idle|idle|walk|idle|idle|idle',
    '166:idle|idle|eatHay|idle|idle|idle',
    '179:idle|idle|walk|idle|idle|idle',
    '181:idle|idle|eatHay|idle|idle|idle',
    '194:idle|idle|walk|idle|idle|idle',
    '196:idle|idle|eatHay|idle|idle|idle',
    '209:idle|idle|walk|idle|idle|idle',
    '211:idle|idle|eatHay|idle|idle|idle',
    '224:idle|idle|walk|idle|idle|idle',
    '226:idle|idle|eatBasin|idle|idle|idle',
    '246:idle|idle|walk|idle|idle|idle',
    '248:idle|idle|eatBasin|idle|idle|idle',
    '268:idle|idle|walk|idle|idle|idle',
    '270:idle|idle|eatBasin|idle|idle|idle',
    '290:idle|idle|walk|idle|idle|idle',
    '292:idle|idle|eatBasin|idle|idle|idle',
    '312:idle|idle|walk|idle|idle|idle',
    '314:idle|idle|eatBasin|idle|idle|idle',
    '334:idle|idle|walk|idle|idle|idle',
    '336:idle|idle|eatBasin|idle|idle|idle',
    '356:idle|idle|walk|idle|idle|idle',
    '358:idle|idle|eatBasin|idle|idle|idle',
    '378:idle|idle|walk|idle|idle|idle',
    '380:idle|idle|eatBasin|idle|idle|idle',
    '400:idle|idle|walk|idle|idle|idle',
    '402:idle|idle|eatBasin|idle|idle|idle',
    '422:idle|idle|walk|idle|idle|idle',
    '424:idle|idle|eatBasin|idle|idle|idle',
    '444:idle|idle|walk|idle|idle|idle',
    '446:idle|idle|eatBasin|idle|idle|idle',
    '466:idle|idle|walk|idle|idle|idle',
    '468:idle|idle|eatBasin|idle|idle|idle',
    '488:idle|idle|walk|idle|idle|idle',
    '490:idle|idle|eatBasin|idle|idle|idle',
    '510:idle|idle|walk|idle|idle|idle',
    '512:idle|idle|eatBasin|idle|idle|idle',
    '532:idle|idle|walk|idle|idle|idle',
    '534:idle|idle|eatBasin|idle|idle|idle',
    '554:idle|idle|walk|idle|idle|idle',
    '556:idle|idle|eatBasin|idle|idle|idle',
    '576:idle|idle|walk|idle|idle|idle',
    '578:idle|idle|eatBasin|idle|idle|idle',
    '598:idle|idle|walk|idle|idle|idle',
    '600:idle|idle|idle|idle|idle|idle',
  ],
};

function runGolden(): { state: State; trace: string[] } {
  const s = createShift(1);
  const trace: string[] = [];
  let last = '';
  for (let t = 0; t < GOLDEN.minutes; t += 0.5) {
    advance(s, 0.5);
    const sig = `${t.toFixed(1)}:${s.elephants.map((e) => e.state).join('|')}`;
    if (sig !== last) { trace.push(sig); last = sig; }
  }
  return { state: s, trace };
}

describe('FSM golden (инкремент 2)', () => {
  it('прогон seed 1 на движке побитово совпадает с эталоном старого switch', () => {
    const { state, trace } = runGolden();
    expect(trace).toEqual(GOLDEN.trace);
    expect(state.rng).toBe(GOLDEN.rngEnd);
    expect(state.elephants.map((e) => e.state)).toEqual(GOLDEN.statesAtEnd);
  });

  it('fsm-метаданные живут в состоянии, но в сейв не пишутся', () => {
    const { state } = runGolden();
    for (const e of state.elephants) {
      expect(e.fsm).toBeDefined();
      expect(e.fsm!.transitions).toBeGreaterThan(0);
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
    e.state = 'idle';
    e.timer = 0.1; // истечёт — decide выберет следующее занятие (walk/idle/sway...)
    stepElephant(ELEPHANT_AI_REGISTRY, elephantBehavior, { state: s, dt: 0.5, dtReal: 0.5 }, e, s.t);
    expect(e.state).not.toBe('idle'); // движок обязан был выйти из idle, как старый switch
    expect(e.timer).toBeGreaterThan(0);
  });

  it('характеры: в инкременте 2 все множители = 1 (нейтральный профиль)', () => {
    const t = temperamentOf({ id: 'kira' } as never);
    expect(t).toBe(TEMPERAMENTS.neutral);
    for (const v of Object.values(t.rates)) expect(v).toBe(1);
  });
});
