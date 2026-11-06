// Тревоги вытекают из состояния мира: пустая поилка, грязная подстилка, слон в стрессе.
// Никаких случайных уведомлений: тревога поднимается при пересечении порога и
// снимается, когда причина устранена (с запасом, чтобы не мигать).

import { KEEPER } from '../data/balance';
import { STATIONS, TROUGH_IDS, type TroughId } from '../data/facility';
import { MEALS, PORRIDGE_SOAK_MIN } from '../data/rations';
import { hoseReachPoint } from './behavior/options';
import { bodyDirt, cachedDirt } from './behavior/needs';
import { reachableAreas } from './behavior/perceive';
import { log } from './events';
import type { Severity, State } from './types';
import { tubKg } from './world';

interface Rule {
  key: string;
  severity: Severity;
  on: (s: State) => boolean;
  off: (s: State) => boolean;
  text: (s: State) => string;
  resolved: string;
}

function minute(s: State): number {
  return ((s.t % 1440) + 1440) % 1440;
}

function evening(s: State): boolean {
  const m = minute(s);
  return m >= 16 * 60 || m < 8 * 60;
}

function troughRules(id: TroughId): Rule[] {
  const label = STATIONS[id].label;
  return [
    {
      key: `water:${id}`,
      severity: 'warn',
      on: (s) => s.world.troughs[id].level < 18 && !s.world.troughs[id].drain && s.world.troughs[id].stage === 'ok',
      off: (s) => s.world.troughs[id].level > 35 || s.world.troughs[id].drain,
      text: () => `${label} почти пуста — открой кран у поилки.`,
      resolved: `${label} наполнена.`,
    },
    {
      key: `debris:${id}`,
      severity: 'info',
      on: (s) => s.world.troughs[id].debris > 0.5 && s.world.troughs[id].level > 10,
      off: (s) => s.world.troughs[id].debris < 0.3 || s.world.troughs[id].level < 5,
      text: () => `${label}: в воде сено и сор — разборчивые пить не станут. Слей, вымой средством, ополосни и налей.`,
      resolved: `${label}: вода чистая.`,
    },
    {
      key: `chem:${id}`,
      severity: 'bad',
      on: (s) => s.world.troughs[id].chem > 0.05 && s.world.troughs[id].level > 10,
      off: (s) => s.world.troughs[id].chem <= 0.05 || s.world.troughs[id].level < 5,
      text: () => `${label}: в воде моющее средство! Слей и ополосни.`,
      resolved: `${label}: средство смыто.`,
    },
  ];
}

const STATIC_RULES: Rule[] = [
  ...TROUGH_IDS.flatMap(troughRules),
  {
    key: 'hay:barn',
    severity: 'warn',
    on: (s) => s.world.feeders.barnRackW.hay + s.world.feeders.barnRackE.hay < 8 && evening(s),
    off: (s) => s.world.feeders.barnRackW.hay + s.world.feeders.barnRackE.hay > 25 || !evening(s),
    text: () => 'В сенниках слоновника кончается сено, а впереди ночь.',
    resolved: 'Сено на ночь в слоновнике есть.',
  },
  {
    key: 'hay:paddockFeeder',
    severity: 'warn',
    on: (s) => s.world.feeders.paddockFeeder.hay < 5 && s.elephants.some((e) => e.y < 20) && !evening(s),
    off: (s) => s.world.feeders.paddockFeeder.hay > 18 || evening(s) || !s.elephants.some((e) => e.y < 20),
    text: () => 'Кормушка на выгуле пустая.',
    resolved: 'Кормушка на выгуле наполнена.',
  },
  {
    key: 'bedding',
    severity: 'warn',
    on: (s) => cachedDirt(s, 'barn') > 0.24,
    off: (s) => cachedDirt(s, 'barn') < 0.14,
    text: () => 'Подстилка в слоновнике грязная: мокрые пятна и навоз.',
    resolved: 'Стойла чистые.',
  },
  {
    key: 'dung:paddock',
    severity: 'info',
    on: (s) => s.world.dung.filter((d) => d.zone === 'paddock').length >= 6,
    off: (s) => s.world.dung.filter((d) => d.zone === 'paddock').length <= 2,
    text: (s) => `На выгуле ${s.world.dung.filter((d) => d.zone === 'paddock').length} куч навоза — уберёшь, когда слоны будут внутри.`,
    resolved: 'Выгул убран.',
  },
  {
    key: 'container',
    severity: 'warn',
    on: (s) => s.world.container >= KEEPER.containerMax * 0.9,
    off: (s) => s.world.container < KEEPER.containerMax * 0.7,
    text: () => 'Контейнер для навоза почти полон — его вывезут утром.',
    resolved: 'Контейнер освободили.',
  },
  {
    key: 'pool',
    severity: 'info',
    on: (s) => s.world.pool.dirt > 0.55,
    off: (s) => s.world.pool.dirt < 0.3,
    text: () => 'Вода в бассейне мутная — открой кран бассейна у ограды.',
    resolved: 'Вода в бассейне снова чистая.',
  },
  {
    key: 'hose:reach',
    severity: 'warn',
    on: (s) => s.world.hose.state === 'floor' && s.elephants.some((e) => hoseReachPoint(s, e, reachableAreas(s, e)) !== null),
    off: (s) => s.world.hose.state !== 'floor' || !s.elephants.some((e) => hoseReachPoint(s, e, reachableAreas(s, e)) !== null),
    text: () => 'Шланг лежит в зоне хобота — шкодливая слониха его утащит или прокусит.',
    resolved: 'Шланг убран от слонов.',
  },
  {
    key: 'tubs:empty',
    severity: 'info',
    on: (s) => s.world.tubs.some((t) => t.where === 'floor' && t.emptySince >= 0 && s.t - t.emptySince > 40),
    off: (s) => !s.world.tubs.some((t) => t.where === 'floor' && t.emptySince >= 0 && s.t - t.emptySince > 20),
    text: () => 'Пустые тазы стоят у слонов — забери их, пока не раскрошили.',
    resolved: 'Пустые тазы собраны.',
  },
  {
    key: 'meal:porridge',
    severity: 'info',
    on: (s) => {
      const m = minute(s);
      const due = MEALS.filter((x) => x.id === 'porridge13' || x.id === 'porridge17').some((x) => m >= x.time - PORRIDGE_SOAK_MIN - 10 && m < x.time - PORRIDGE_SOAK_MIN + 5);
      return due && !s.world.items.some((it) => it.kind === 'porridge');
    },
    off: (s) => s.world.items.some((it) => it.kind === 'porridge') || !MEALS.some((x) => minute(s) >= x.time - PORRIDGE_SOAK_MIN - 10 && minute(s) < x.time + 30),
    text: () => 'Скоро каша: её запаривают за час — замешай на кормокухне.',
    resolved: 'Каша запаривается.',
  },
  {
    key: 'meal:veg',
    severity: 'info',
    on: (s) => minute(s) >= 18 * 60 && minute(s) < 19 * 60 + 30 && !s.world.tubs.some((t) => tubKg(t) > 10),
    off: (s) => s.world.tubs.some((t) => tubKg(t) > 10) || minute(s) >= 19 * 60 + 30 || minute(s) < 18 * 60,
    text: () => 'К 19:00 — овощи: по тазу на каждую слониху (нарезка на разделочном столе).',
    resolved: 'Овощные тазы собраны.',
  },
];

function elephantRules(s: State): Rule[] {
  const out: Rule[] = [];
  for (const e of s.elephants) {
    const name = e.profile.name;
    out.push(
      {
        key: `stress:${e.id}`,
        severity: 'bad',
        on: () => e.needs.stress > 65,
        off: () => e.needs.stress < 45,
        text: () => `${name} в стрессе. ${stressCause(s, e.id)}`,
        resolved: `${name} успокоилась.`,
      },
      {
        key: `thirst:${e.id}`,
        severity: 'bad',
        on: () => e.needs.thirst > 86,
        off: () => e.needs.thirst < 60,
        text: () => `${name} страдает от жажды.`,
        resolved: `${name} напилась.`,
      },
      {
        key: `hunger:${e.id}`,
        severity: 'bad',
        on: () => e.needs.hunger > 88,
        off: () => e.needs.hunger < 65,
        text: () => `${name} очень голодна.`,
        resolved: `${name} поела.`,
      },
      {
        key: `tired:${e.id}`,
        severity: 'warn',
        on: () => e.needs.fatigue > 88,
        off: () => e.needs.fatigue < 65,
        text: () => `${name} валится с ног — ей негде нормально лечь?`,
        resolved: `${name} отдохнула.`,
      },
      {
        key: `dirty:${e.id}`,
        severity: 'info',
        on: () => bodyDirt(e) > 0.5,
        off: () => bodyDirt(e) < 0.3,
        text: () => `${name} грязная — бока и спина в навозе и мокрой подстилке. Помой из шланга или набором для мытья.`,
        resolved: `${name} чистая.`,
      },
    );
  }
  return out;
}

function stressCause(s: State, id: string): string {
  const e = s.elephants.find((x) => x.id === id)!;
  const n = e.needs;
  const T = e.profile.traits;
  const causes: [number, string][] = [
    [n.thirst - 70, 'Ей нужна вода.'],
    [n.hunger - 75, 'Она голодна.'],
    [(n.social - 60) * T.sociability * 1.5, 'Ей одиноко без подруг.'],
    [n.boredom - 72, 'Ей скучно — нужно занятие.'],
    [n.heat - 55, 'Ей жарко.'],
    [n.fatigue - 80, 'Она не выспалась.'],
    [T.sensitivity * 60 * cachedDirt(s, e.y < 20 ? 'paddock' : 'barn') - 5, 'Ей не нравится грязь вокруг.'],
    [T.sensitivity * 40 * bodyDirt(e) - 12, 'У неё грязная кожа.'],
    [e.tipsy * 50 * T.nervousness, 'Она захмелела от забродивших яблок.'],
  ];
  causes.sort((a, b) => b[0] - a[0]);
  return causes[0][0] > 0 ? causes[0][1] : 'Рядом те, кого она побаивается.';
}

export function updateAlerts(s: State): void {
  const rules = [...STATIC_RULES, ...elephantRules(s)];
  for (const r of rules) {
    const idx = s.alerts.findIndex((a) => a.key === r.key);
    if (idx < 0) {
      if (r.on(s)) {
        const text = r.text(s);
        s.alerts.push({ key: r.key, since: s.t, severity: r.severity, text });
        log(s, r.severity, text, { key: `alert:${r.key}`, cooldown: 30, kind: 'alert' });
      }
    } else if (r.off(s)) {
      s.alerts.splice(idx, 1);
      log(s, 'good', r.resolved, { silent: true });
    }
  }
}
