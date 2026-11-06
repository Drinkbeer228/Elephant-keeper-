// Итог смены в 08:00: как прожили сутки слоны, в каком виде вольеры и инвентарь,
// как кипер отвечал на сигналы, всё ли по рациону. Сменщик принимает смену по этому списку.

import { DELIVERY } from '../data/balance';
import { FEEDER_IDS, STATIONS, TANK_HOME, TOOL_KINDS, TROUGH_IDS, type ToolKind } from '../data/facility';
import { DIETS, DIET_IDS, MEALS, PORRIDGE_SACK_KG, VEG_KINDS, vegPlan } from '../data/rations';
import { dailyDrift } from './behavior/learning';
import { bodyDirt, wellbeing } from './behavior/needs';
import { log } from './events';
import { dist } from './geometry';
import { nameCase } from './herd';
import { replaceHoseIfBroken } from './keeper';
import { clamp } from './rng';
import { emptyChecks, emptyDayStats, newTub, vegStockFor } from './state';
import { shiftDay } from './time';
import type { DayReport, ElephantDayReport, State } from './types';
import { cleanliness, floorLeftovers } from './world';

const ACT_NAMES: Partial<Record<string, string>> = {
  play: 'играла',
  explore: 'исследовала',
  bathe: 'купалась',
  dust: 'посыпалась песком',
  socialize: 'общалась с подругами',
  eat: 'ела',
  pace: 'нервно ходила взад-вперёд',
  manipulate: 'шалила с вещами',
};

const TOOL_NOM: Record<ToolKind, string> = { shovel: 'лопата', rake: 'грабли', broom: 'метла', mop: 'швабра', brush: 'щётка' };

export function buildReport(s: State): DayReport {
  const w = s.world;
  const day = shiftDay(s.t - 1);
  const plan = vegPlan(s.seed, day);
  const planKg = Object.values(plan).reduce((a, b) => a + (b ?? 0), 0);
  const els: ElephantDayReport[] = s.elephants.map((e) => {
    const d = e.day;
    const wb = d.wellbeingSamples > 0 ? d.wellbeingSum / d.wellbeingSamples : wellbeing(e);
    const start = s.startOfDay[e.id] ?? { trust: e.learned.trust, cooperation: e.learned.cooperation };
    const highlights: string[] = [];
    const mins = Object.entries(d.minutes)
      .filter(([k]) => ACT_NAMES[k])
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
    for (const [k, v] of mins.slice(0, 2)) if ((v ?? 0) >= 20) highlights.push(`${ACT_NAMES[k]} ${Math.round(v ?? 0)} мин`);
    if (d.lyingMinutes < 60) highlights.push('почти не спала лёжа');
    if (d.urineTank > 0) highlights.push(`в бак: ${d.urineTank}`);
    if (d.urineBedding > 0) highlights.push(`мимо, на подстилку: ${d.urineBedding}`);
    if (d.urineDrain > 0) highlights.push(`над стоком: ${d.urineDrain}`);
    if (d.robbed > 1) highlights.push(`у неё отнимали корм: ${d.robbed}`);
    if (d.stolen > 1) highlights.push(`отнимала корм: ${d.stolen}`);
    if (d.conflicts > 0) highlights.push(`стычек у еды: ${d.conflicts}`);
    if (d.fermented > 0) highlights.push(`забродивших яблок: ${d.fermented}`);
    if (d.dirtyLying > 60) highlights.push(`лежала в мокром ${Math.round(d.dirtyLying)} мин`);
    if (d.signals === 0) highlights.push('ни разу не позвала — следи за ней внимательнее');
    return {
      id: e.id,
      name: e.profile.name,
      wellbeing: Math.round(wb),
      sleepHours: Math.round((d.lyingMinutes / 60) * 10) / 10,
      signals: d.signals,
      answered: d.answered,
      ignored: d.ignored,
      urineBedding: d.urineBedding,
      urineTank: d.urineTank,
      trustDelta: Math.round((e.learned.trust - start.trust) * 100),
      cooperationDelta: Math.round((e.learned.cooperation - start.cooperation) * 100),
      highlights,
    };
  });
  const barnClean = cleanliness(s, 'barn');
  const paddockClean = cleanliness(s, 'paddock');
  const answered = s.dailyKeeper.answered;
  const ignored = s.dailyKeeper.ignored;
  const responseRate = answered + ignored > 0 ? answered / (answered + ignored) : 1;
  const avgWb = els.reduce((a, x) => a + x.wellbeing, 0) / Math.max(1, els.length);
  const notes: string[] = [];
  // Рацион по SlonVet: каша дважды, овощи — полный таз
  let ration = 0;
  for (const e of s.elephants) {
    const porridge = (w.checks.porridge[e.id] ?? []).length;
    const veg = w.checks.vegTub[e.id] ?? 0;
    const name = e.profile.name;
    if (porridge < 2) notes.push(`${name}: каша ${porridge} из 2 (${DIETS[e.profile.habits.diet].porridge.product}, ${MEALS[1].prep}).`);
    if (veg < planKg - 1) notes.push(`${name}: овощей в тазу ${Math.round(veg)} из ${planKg} кг.`);
    ration += Math.min(1, porridge / 2) * 0.5 + Math.min(1, veg / planKg) * 0.5;
  }
  ration /= Math.max(1, s.elephants.length);
  // Поилки: вымыть и сменить воду раз в смену
  const unchanged = TROUGH_IDS.filter((id) => !w.checks.troughChanged[id]);
  if (unchanged.length) notes.push(`Не вымыты и без смены воды: ${unchanged.map((id) => STATIONS[id].label.toLowerCase()).join(', ')}.`);
  const troughs = 1 - unchanged.length / TROUGH_IDS.length;
  // Пол и подстилка
  const left = floorLeftovers(s);
  if (left.sawdust > 0) notes.push(`Опилки на подстилке не убраны: ${left.sawdust} м² — сменщик найдёт под ними мокрое.`);
  if (left.litter > 3) notes.push(`На бетоне рассыпаны сено и солома: ${left.litter} м².`);
  if (left.wetHard > 3) notes.push(`Мокрый пол: ${left.wetHard} м².`);
  if (barnClean < 0.8) notes.push('Сменщик принял грязный слоновник.');
  if (w.dung.length > 6) notes.push(`Осталось неубранных куч навоза: ${w.dung.length}.`);
  const rotten = w.food.filter((f) => f.kind === 'fruit' && f.rot >= 0.82).length;
  if (rotten > 2) notes.push(`Под яблонями гниют паданцы: ${rotten}.`);
  // Инвентарь
  const missing = TOOL_KINDS.filter((t) => !w.tools[t] && s.keeper.held?.kind !== t);
  if (missing.length) notes.push(`Инвентарь не на месте: ${missing.map((t) => TOOL_NOM[t]).join(', ')}.`);
  if (w.hose.state !== 'reel') notes.push('Шланг не смотан.');
  if (w.checks.hoseIncidents > 0) notes.push(`Шланг прокусывали слоны: ${w.checks.hoseIncidents} раз(а) — не оставляй его в зоне хобота.`);
  if (w.checks.tubsBroken > 0) notes.push(`Разбито тазов: ${w.checks.tubsBroken}. Пустые тазы забирают сразу после еды.`);
  const loose = w.tubs.filter((t) => t.where === 'floor' && t.emptySince >= 0);
  if (loose.length) notes.push(`Не собраны пустые тазы: ${loose.map((t) => nameCase(s.elephants.find((e) => e.id === t.owner)?.profile.name ?? '', 'gen')).join(', ')}.`);
  const tank = w.items.find((it) => it.kind === 'tank');
  if (!tank && s.keeper.held?.kind !== 'tank') notes.push('Бака для мочи нет на месте.');
  else if (tank && (tank.load > 0 || tank.aux || dist(tank, TANK_HOME) > 1.5)) notes.push('Бак для мочи не вымыт или не на месте.');
  // Слоны
  let skin = 0;
  for (const e of s.elephants) {
    const d = bodyDirt(e);
    skin += 1 - d;
    if (d > 0.45) notes.push(`${e.profile.name} сдана грязной — ${e.body.back > e.body.side ? 'спина' : 'бока'} в навозе и мокрой подстилке.`);
  }
  skin /= Math.max(1, s.elephants.length);
  for (const x of els) {
    if (x.ignored >= 2) notes.push(`${x.name} ${x.ignored} раз(а) звала и не дождалась — она станет звать реже.`);
    if (x.trustDelta >= 5) notes.push(`${x.name} заметно больше доверяет тебе (+${x.trustDelta}).`);
    if (x.trustDelta <= -5) notes.push(`${x.name} доверяет тебе меньше (${x.trustDelta}).`);
    if (x.sleepHours < 1) notes.push(`${x.name} почти не ложилась — проверь подстилку.`);
  }
  const supplies =
    (FEEDER_IDS.some((f) => f !== 'paddockFeeder' && w.feeders[f].hay > 15) ? 0.5 : 0) + (TROUGH_IDS.filter((id) => w.troughs[id].level > 25 && w.troughs[id].chem < 0.05).length / TROUGH_IDS.length) * 0.5;
  const score = Math.round(clamp(0.38 * avgWb + 14 * barnClean + 5 * paddockClean + 12 * responseRate + 6 * supplies + 10 * ration + 7 * troughs + 8 * skin, 0, 100));
  const verdict =
    score >= 85
      ? 'Отличная смена: слоны спокойны и сыты, вольеры и инвентарь в порядке.'
      : score >= 70
        ? 'Хорошая смена. Есть мелочи, но слонам было хорошо.'
        : score >= 55
          ? 'Смена прошла, но сменщику есть к чему придраться.'
          : 'Тяжёлая смена: слонам не хватало заботы.';
  return {
    day,
    score,
    verdict,
    elephants: els,
    barnClean: Math.round(barnClean * 100),
    paddockClean: Math.round(paddockClean * 100),
    dungLeft: w.dung.length,
    responseRate: Math.round(responseRate * 100),
    treats: s.dailyKeeper.treats,
    notes,
  };
}

// Смена закончилась: отчёт, утренний привоз, вывоз контейнера, новый день
export function rollDay(s: State): void {
  const report = buildReport(s);
  s.reports.push(report);
  if (s.reports.length > 14) s.reports.shift();
  s.pendingReport = s.reports.length - 1;
  log(s, 'info', `Смена ${report.day} сдана: ${report.score} баллов. ${report.verdict}`, { kind: 'report' });
  const w = s.world;
  const st = w.stock;
  st.hay = Math.max(st.hay, Math.min(st.hay + DELIVERY.hay, DELIVERY.hay + 6));
  st.straw = Math.max(st.straw, Math.min(st.straw + DELIVERY.straw, DELIVERY.straw + 4));
  st.browse = Math.max(st.browse, Math.min(st.browse + DELIVERY.browse, DELIVERY.browse + 2));
  st.bamboo = Math.max(st.bamboo, DELIVERY.bamboo);
  st.sawdust = Math.max(st.sawdust, DELIVERY.sawdust);
  // Овощи — на новый день по рациону: основные и сезонное этого дня
  const fresh = vegStockFor(s.seed, report.day + 1, s.elephants.length);
  for (const v of VEG_KINDS) st.veg[v] = Math.max(st.veg[v], fresh[v]);
  for (const d of DIET_IDS) if (st.porridge[d] < PORRIDGE_SACK_KG * 0.4) st.porridge[d] += PORRIDGE_SACK_KG;
  w.supplies = { chem: Math.max(w.supplies.chem, 2), shampoo: Math.max(w.supplies.shampoo, 3), tape: Math.max(w.supplies.tape, 3) };
  w.container = Math.min(w.container, 6);
  replaceHoseIfBroken(s);
  // Разбитые тазы заменяют новыми
  w.tubs = w.tubs.map((t, i) => (t.broken && t.where === 'rack' ? newTub(s, t.owner, i) : t));
  for (const [id, n] of Object.entries(w.trees)) w.trees[id] = Math.min(14, n + 6);
  w.checks = emptyChecks();
  log(s, 'info', 'Утро: привезли сено, солому, ветки, бамбук, опилки и овощи, контейнер с навозом вывезли.', { silent: true });
  for (const e of s.elephants) {
    dailyDrift(e);
    e.day = emptyDayStats();
    for (const k of Object.keys(e.mem.habit)) e.mem.habit[k] = Math.round(e.mem.habit[k] * 0.35 * 1000) / 1000;
    s.startOfDay[e.id] = { trust: e.learned.trust, cooperation: e.learned.cooperation };
  }
  s.dailyKeeper = { treats: 0, interactions: 0, answered: 0, ignored: 0, calls: 0, callsObeyed: 0 };
  s.dayStart += 1440;
}
