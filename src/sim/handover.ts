import { BALANCE } from '../data/balance';
import { MAP, inPaddock, inReachZone, nearStation } from '../data/map';
import { WHY } from '../data/why';
import { countWet } from './floor';
import { basinsOnRack } from './items';
import { MEAL_LABELS, mealStatus, type MealStatus } from './feeding';
import { profileOf } from './elephants';
import type { MealId, State } from './types';

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
  checklist: { id: HandoverCheckId; label: string; ok: boolean }[];
  remarks: string[]; // прочие замечания сменщика, вне чек-листа
  begTreats: number;
}

// Источники вони: залежавшийся навоз, затоптанное, бак с мочой, грязные тазы
export function stinkSources(state: State): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const d of state.dung) if (state.t - d.at > 20) out.push(d);
  state.cells.forEach((row, cy) =>
    row.forEach((c, cx) => {
      if (c.kind === 'dung') out.push({ x: MAP.floor.x + cx + 0.5, y: MAP.floor.y + cy + 0.5 });
    }),
  );
  for (const i of state.items) {
    if ((i.kind === 'bucket' && (i.liters ?? 0) > 0) || (i.kind === 'basin' && i.dirty)) {
      if (state.t - i.droppedAt > 10) out.push(i);
    }
  }
  return out;
}

export type HandoverCheckId =
  | 'gate'
  | 'paddockClear'
  | 'standing'
  | 'water'
  | 'hay'
  | 'inventory'
  | 'barrow'
  | 'basins'
  | 'dryBedding'
  | 'dungCleared';

function onRack(state: State, kind: 'bucket' | 'scoop' | 'fork' | 'broom'): boolean {
  return state.items.some((i) => i.kind === kind && nearStation('rack', i.x, i.y, 0.6) && !i.dirty && !(i.liters ?? 0) && !(i.load ?? 0));
}

// Чек-лист сдачи: сменщик в 08:00 проверяет вольер. Тазы — только своим пунктом
export const HANDOVER_CHECKS: { id: HandoverCheckId; label: string; ok: (s: State) => boolean }[] = [
  { id: 'gate', label: 'Ворота закрыты', ok: (s) => !s.gateOpen },
  {
    id: 'paddockClear',
    label: 'В вольере и у ограды нет посторонних вещей',
    ok: (s) => {
      const inside = (x: number, y: number) => inPaddock(x, y) || inReachZone(x, y);
      return !s.items.some((i) => i.kind !== 'basin' && inside(i.x, i.y)) && !inside(s.barrow.x, s.barrow.y);
    },
  },
  {
    id: 'standing',
    label: 'Все трое на ногах, без хромоты',
    ok: (s) => !s.elephants.some((e) => e.footDebt - e.footDebtStart >= BALANCE.footDebt.limpThreshold),
  },
  { id: 'water', label: 'Вода в поилке', ok: (s) => s.trough >= H.troughMin },
  { id: 'hay', label: 'Сено в кормушке', ok: (s) => s.feederHay >= H.hayMin },
  {
    id: 'inventory',
    label: 'Инвентарь чистый, на стойке',
    ok: (s) => (['bucket', 'scoop', 'fork', 'broom'] as const).every((k) => onRack(s, k)),
  },
  {
    id: 'barrow',
    label: 'Тачка и рохля пустые, на своих местах',
    ok: (s) => {
      const b = s.barrow;
      const home = !b.pushed && Math.hypot(b.x - MAP.barrowStart.x, b.y - MAP.barrowStart.y) <= 1.5;
      const j = s.jack;
      const jackHome = !j.pushed && !j.cargo && Math.hypot(j.x - MAP.jackStart.x, j.y - MAP.jackStart.y) <= 1.5;
      return home && jackHome && !b.waste && !b.tools.length && !b.bales && !b.sawdust && !b.straw;
    },
  },
  {
    id: 'basins',
    label: 'Тазы вымыты и на стеллаже',
    ok: (s) => {
      const all = s.items.filter((i) => i.kind === 'basin');
      const onRack = basinsOnRack(s);
      return s.player.held?.kind !== 'basin' && onRack.length === all.length && onRack.every((b) => !b.dirty && !b.food);
    },
  },
  { id: 'dryBedding', label: 'Подстилка сухая', ok: (s) => countWet(s) <= H.wetCellsRemark },
  {
    id: 'dungCleared',
    label: 'Навоз убран',
    ok: (s) => s.dung.length + s.cells.flat().filter((c) => c.kind === 'dung').length === 0,
  },
];

export function finishShift(state: State): Report {
  const checklist = HANDOVER_CHECKS.map((c) => ({ id: c.id, label: c.label, ok: c.ok(state) }));
  const remarks: string[] = [];
  if (stinkSources(state).length >= 5) remarks.push('Мухи и вонь');
  if (state.elephants.some((e) => e.lyingInWet)) remarks.push('Слониха лежала в мокром');
  if (state.items.some((i) => i.kind === 'bag' && (i.fill ?? 0) > 0)) remarks.push('Мешки не вывезены');
  if (state.supply.missed) remarks.push('Груз не принят');
  if (state.dutyLight) remarks.push('Дежурный свет не выключен');
  if (state.litter.length >= 6) remarks.push('Сор на дорожке');

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

  const parts = {
    bucket: 25 * bucketRate,
    dry: 15 * clamp01((dryAvg - 0.6) / 0.4),
    meals: 20 * mealScore,
    feet: 10 * clamp01(1 - avgDebt / BALANCE.footDebt.limpThreshold),
    handover: (30 * checklist.filter((c) => c.ok).length) / checklist.length,
    remarks: -3 * remarks.length,
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
    checklist,
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
    ['handover', parts.handover / 30],
    ['feet', parts.feet / 10],
  ];
  const [worst, value] = ratio.sort((a, b) => a[1] - b[1])[0];
  if (value >= 0.85) return 'Сменщик: «Чисто. Даже придраться не к чему. Подозрительно.»';
  const lines: Record<string, string> = {
    bucket: 'Сменщик: «Бак у тебя для красоты стоял?» Под ногами хлюпает.',
    dry: 'Сменщик: «Это подстилка или болото?» Идёт за вилами.',
    meals: 'Сменщик: «Слонихи на меня так смотрят, будто их вчера не кормили.»',
    handover: 'Сменщик молча достаёт ручку и идёт по чек-листу. Пунктов много.',
    feet: 'Сменщик: «Ноги им кто смотреть будет? Ветврач?»',
  };
  return lines[worst];
}

export function whyText(key: keyof typeof WHY): string {
  return WHY[key];
}

