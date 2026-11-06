// Итог смены в 08:00: как прожили сутки слоны, в каком виде вольеры, как кипер отвечал на сигналы.

import { DELIVERY } from '../data/balance';
import { dailyDrift } from './behavior/learning';
import { wellbeing } from './behavior/needs';
import { log } from './events';
import { clamp } from './rng';
import { emptyDayStats } from './state';
import { shiftDay } from './time';
import type { DayReport, ElephantDayReport, State } from './types';
import { cleanliness } from './world';

const ACT_NAMES: Partial<Record<string, string>> = {
  play: 'играла',
  explore: 'исследовала',
  bathe: 'купалась',
  dust: 'посыпалась песком',
  socialize: 'общалась с подругами',
  eat: 'ела',
  pace: 'нервно ходила взад-вперёд',
};

export function buildReport(s: State): DayReport {
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
    if (d.urineBedding > 0) highlights.push(`мочилась на подстилку: ${d.urineBedding}`);
    if (d.urineDrain > 0) highlights.push(`над стоком: ${d.urineDrain}`);
    if (d.conflicts > 0) highlights.push(`стычек у еды: ${d.conflicts}`);
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
  const supplies =
    (s.world.water.barnWater.level > 25 ? 0.25 : 0) +
    (s.world.water.paddockWater.level > 25 ? 0.25 : 0) +
    (s.world.hay.barnRack > 15 ? 0.25 : 0) +
    (s.world.hay.paddockFeeder > 15 || s.world.gateOpen ? 0.25 : 0.1);
  const score = Math.round(clamp(0.5 * avgWb + 18 * barnClean + 7 * paddockClean + 15 * responseRate + 10 * supplies, 0, 100));
  const notes: string[] = [];
  for (const x of els) {
    if (x.ignored >= 2) notes.push(`${x.name} ${x.ignored} раз(а) звала и не дождалась — она станет звать реже.`);
    if (x.trustDelta >= 5) notes.push(`${x.name} заметно больше доверяет тебе (+${x.trustDelta}).`);
    if (x.trustDelta <= -5) notes.push(`${x.name} доверяет тебе меньше (${x.trustDelta}).`);
    if (x.sleepHours < 1) notes.push(`${x.name} почти не ложилась — проверь подстилку.`);
  }
  if (barnClean < 0.8) notes.push('Сменщик принял грязный слоновник.');
  if (s.world.dung.length > 6) notes.push(`Осталось неубранных куч навоза: ${s.world.dung.length}.`);
  const verdict =
    score >= 85
      ? 'Отличная смена: слоны спокойны, вольеры в порядке.'
      : score >= 70
        ? 'Хорошая смена. Есть мелочи, но слонам было хорошо.'
        : score >= 55
          ? 'Смена прошла, но слоны были не в лучшем состоянии.'
          : 'Тяжёлая смена: слонам не хватало заботы.';
  return {
    day: shiftDay(s.t - 1),
    score,
    verdict,
    elephants: els,
    barnClean: Math.round(barnClean * 100),
    paddockClean: Math.round(paddockClean * 100),
    dungLeft: s.world.dung.length,
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
  const st = s.world.stock;
  st.hay = Math.max(st.hay, Math.min(st.hay + DELIVERY.hay, DELIVERY.hay + 6));
  st.straw = Math.max(st.straw, Math.min(st.straw + DELIVERY.straw, DELIVERY.straw + 4));
  st.produce = Math.max(st.produce, Math.min(st.produce + DELIVERY.produce, DELIVERY.produce + 3));
  st.browse = Math.max(st.browse, Math.min(st.browse + DELIVERY.browse, DELIVERY.browse + 2));
  s.world.container = Math.min(s.world.container, 6);
  log(s, 'info', 'Утро: привезли сено, солому, овощи и ветки, контейнер с навозом вывезли.', { silent: true });
  for (const e of s.elephants) {
    dailyDrift(e);
    e.day = emptyDayStats();
    for (const k of Object.keys(e.mem.habit)) e.mem.habit[k] = Math.round(e.mem.habit[k] * 0.35 * 1000) / 1000;
    s.startOfDay[e.id] = { trust: e.learned.trust, cooperation: e.learned.cooperation };
  }
  s.dailyKeeper = { treats: 0, interactions: 0, answered: 0, ignored: 0, calls: 0, callsObeyed: 0 };
  s.dayStart += 1440;
}
