import { BALANCE } from '../data/balance';
import { inBedding, inReachZone, nearStation } from '../data/map';
import { WHY } from '../data/why';
import { emit, hint } from './events';
import { countWet } from './floor';
import { MEAL_LABELS, mealStatus, type MealStatus } from './feeding';
import { profileOf } from './elephants';
import type { ChecklistId, MealId, State } from './types';

const H = BALANCE.handover;

export interface Report {
  score: number;
  stars: 1 | 2 | 3;
  phrase: string;
  pees: { name: string; inBucket: number; missed: number; dung: number }[];
  bucketRate: number;
  dryAvg: number;
  meals: { label: string; statuses: { name: string; status: MealStatus }[] }[];
  losses: string[];
  footDebt: { name: string; debt: number }[];
  acceptance: { found: number; defects: number; missed: string[]; nitpicks: string[] };
  remarks: string[];
  begTreats: number;
}

export function acceptShift(state: State): void {
  if (state.phase !== 'acceptance') return;
  state.phase = 'shift';
  const found = state.checklist.filter((c) => c.defect && c.mark === false).length;
  const defects = state.checklist.filter((c) => c.defect).length;
  emit(state, {
    kind: 'info',
    text: defects ? `Смена принята. Косяков сменщика найдено: ${found} из ${defects}.` : 'Смена принята.',
  });
  hint(state, 'start', 'С утра — ночная грязь. Тачка во дворе у сенника: прикати её к стойке, сложи инвентарь, и в слоновник.');
}

// Пункты чек-листа, которые сейчас не в порядке
export function checklistProblems(state: State): ChecklistId[] {
  const problems: ChecklistId[] = [];
  if (!state.fenceOn) problems.push('fence');
  if (state.gateOpen) problems.push('gate');
  const b = state.barrow;
  if (state.items.some((i) => inReachZone(i.x, i.y)) || inReachZone(b.x, b.y) || inBedding(b.x, b.y)) problems.push('fenceItems');
  if (state.elephants.some((e) => e.footDebt - e.footDebtStart >= BALANCE.footDebt.limpThreshold)) problems.push('standing');
  if (state.trough < H.troughMin) problems.push('water');
  if (state.feederHay < H.hayMin) problems.push('hay');
  const onRack = (kind: 'bucket' | 'scoop') =>
    state.items.some((i) => i.kind === kind && nearStation('rack', i.x, i.y, 0.6) && !i.dirty && !(i.liters ?? 0));
  if (!onRack('bucket') || !onRack('scoop')) problems.push('inventory');
  return problems;
}

export function finishShift(state: State): Report {
  const problems = checklistProblems(state);
  const remarks = state.checklist.filter((c) => problems.includes(c.id)).map((c) => `✗ ${c.label}`);
  if (countWet(state) > H.wetCellsRemark) remarks.push('Мокрая подстилка');
  if (state.dung.length > 0) remarks.push(`Не убран навоз (${state.dung.length})`);
  if (state.elephants.some((e) => e.lyingInWet)) remarks.push('Слониха лежала в мокром');
  if (state.items.some((i) => i.kind === 'bag' && (i.fill ?? 0) > 0)) remarks.push('Мешки не вывезены');
  if (state.items.some((i) => i.kind === 'basin')) remarks.push('Тазы не убраны');
  if (state.barrow.waste > 0) remarks.push('Тачка с мусором не вывезена');

  const pees = state.elephants.map((e) => ({ name: profileOf(e).name, ...e.tally }));
  const inBucket = pees.reduce((s, p) => s + p.inBucket, 0);
  const total = inBucket + pees.reduce((s, p) => s + p.missed, 0);
  const bucketRate = total ? inBucket / total : 1;
  const dryAvg = state.stats.drySamples ? state.stats.drySum / state.stats.drySamples : 1;

  const mealIds: MealId[] = ['kasha1', 'kasha2', 'dinner'];
  const meals = mealIds.map((m) => ({
    label: MEAL_LABELS[m],
    statuses: state.elephants.map((e) => ({ name: profileOf(e).name, status: mealStatus(state, m, e.id) })),
  }));
  const mealPoints = meals.flatMap((m) => m.statuses).map((s) => (s.status === 'ok' ? 1 : s.status === 'late' ? 0.5 : 0));
  const mealScore = mealPoints.reduce<number>((a, b) => a + b, 0) / mealPoints.length;

  const losses = [...state.stats.broken, ...Array(state.stats.basinsLost).fill('таз')];
  const footDebt = state.elephants.map((e) => ({ name: profileOf(e).name, debt: Math.round(e.footDebt - e.footDebtStart) }));
  const avgDebt = footDebt.reduce((s, f) => s + f.debt, 0) / footDebt.length;

  const defects = state.checklist.filter((c) => c.defect);
  const found = defects.filter((c) => c.mark === false).length;
  const acceptance = {
    found,
    defects: defects.length,
    missed: defects.filter((c) => c.mark !== false).map((c) => c.label),
    nitpicks: state.checklist.filter((c) => !c.defect && c.mark === false).map((c) => c.label),
  };

  const parts = {
    bucket: 25 * bucketRate,
    dry: 15 * clamp01((dryAvg - 0.6) / 0.4),
    meals: 20 * mealScore,
    feet: 10 * clamp01(1 - avgDebt / BALANCE.footDebt.limpThreshold),
    acceptance: 10 * (defects.length ? found / defects.length : 1) - 3 * acceptance.nitpicks.length,
    remarks: Math.max(0, 20 - 5 * remarks.length),
  };
  const lossPenalty = Math.min(15, 5 * losses.length);
  const score = Math.round(Math.max(0, Math.min(100, Object.values(parts).reduce((a, b) => a + b, 0) - lossPenalty)));
  // Голодные слонихи — потолок оценки, как бы чисто ни было в слоновнике
  const mealsMissed = meals.filter((m) => m.statuses.every((x) => x.status === 'missed')).length;
  const cap = mealsMissed >= 2 ? 1 : mealsMissed === 1 ? 2 : 3;
  const stars = Math.min(cap, score >= BALANCE.score.threeStars ? 3 : score >= BALANCE.score.twoStars ? 2 : 1) as 1 | 2 | 3;

  const report: Report = {
    score,
    stars,
    phrase: phraseFor(parts, losses.length),
    pees,
    bucketRate,
    dryAvg,
    meals,
    losses,
    footDebt,
    acceptance,
    remarks,
    begTreats: state.stats.begTreats,
  };
  state.report = report;
  state.phase = 'report';
  return report;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Сменщик говорит одну фразу — по самому слабому месту
function phraseFor(parts: Record<string, number>, losses: number): string {
  if (losses >= 2) return 'Сменщик: «Ты тут дежурил или слоны тебя?» Пересчитывает инвентарь вслух.';
  const ratio: [string, number][] = [
    ['bucket', parts.bucket / 25],
    ['dry', parts.dry / 15],
    ['meals', parts.meals / 20],
    ['remarks', parts.remarks / 20],
    ['feet', parts.feet / 10],
  ];
  const [worst, value] = ratio.sort((a, b) => a[1] - b[1])[0];
  if (value >= 0.85) return 'Сменщик: «Чисто. Даже придраться не к чему. Подозрительно.»';
  const lines: Record<string, string> = {
    bucket: 'Сменщик: «Бак у тебя для красоты стоял?» Под ногами хлюпает.',
    dry: 'Сменщик: «Это подстилка или болото?» Идёт за вилами.',
    meals: 'Сменщик: «Слонихи на меня так смотрят, будто их вчера не кормили.»',
    remarks: 'Сменщик молча достаёт ручку и пишет замечания. Много.',
    feet: 'Сменщик: «Ноги им кто смотреть будет? Ветврач?»',
  };
  return lines[worst];
}

export function whyText(key: keyof typeof WHY): string {
  return WHY[key];
}

