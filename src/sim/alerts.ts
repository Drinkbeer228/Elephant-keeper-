// Тревоги вытекают из состояния мира: пустая поилка, грязная подстилка, слон в стрессе.
// Никаких случайных уведомлений: тревога поднимается при пересечении порога и
// снимается, когда причина устранена (с запасом, чтобы не мигать).

import { KEEPER } from '../data/balance';
import { cachedDirt } from './behavior/needs';
import { log } from './events';
import type { Severity, State } from './types';
import { troughSpoiled } from './world';

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

const STATIC_RULES: Rule[] = [
  {
    key: 'water:barnWater',
    severity: 'warn',
    on: (s) => s.world.water.barnWater.level < 18,
    off: (s) => s.world.water.barnWater.level > 35,
    text: () => 'Поилка в слоновнике почти пуста — кран у западной стены.',
    resolved: 'Поилка в слоновнике наполнена.',
  },
  {
    key: 'water:paddockWater',
    severity: 'warn',
    on: (s) => s.world.water.paddockWater.level < 18,
    off: (s) => s.world.water.paddockWater.level > 35,
    text: () => 'Поилка на выгуле почти пуста — кран в западном дворе.',
    resolved: 'Поилка на выгуле наполнена.',
  },
  {
    key: 'hay:barnRack',
    severity: 'warn',
    on: (s) => s.world.hay.barnRack < 6 && evening(s),
    off: (s) => s.world.hay.barnRack > 20 || !evening(s),
    text: () => 'В слоновнике кончается сено, а впереди ночь.',
    resolved: 'Сено на ночь в слоновнике есть.',
  },
  {
    key: 'hay:paddockFeeder',
    severity: 'warn',
    on: (s) => s.world.hay.paddockFeeder < 5 && s.elephants.some((e) => e.y < 20) && !evening(s),
    off: (s) => s.world.hay.paddockFeeder > 18 || evening(s) || !s.elephants.some((e) => e.y < 20),
    text: () => 'Кормушка на выгуле пустая.',
    resolved: 'Кормушка на выгуле наполнена.',
  },
  {
    key: 'bedding',
    severity: 'warn',
    on: (s) => cachedDirt(s, 'barn') > 0.24,
    off: (s) => cachedDirt(s, 'barn') < 0.14,
    text: () => 'Подстилка в слоновнике грязная: мокрые пятна и навоз.',
    resolved: 'Слоновник чистый.',
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
    key: 'trough',
    severity: 'warn',
    on: (s) => troughSpoiled(s),
    off: (s) => !troughSpoiled(s),
    text: () => 'Овощи в кормушке испортились — вычисти её вилами.',
    resolved: 'Кормушка вычищена.',
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
