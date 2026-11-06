// Сигналы: слон сообщает о потребности, которую не может закрыть сам.
// Подавать ли сигнал и как ясно — зависит от характера (выразительность, упрямство)
// и от опыта (ожидает ли слон, что ему ответят). Как именно — личная привычка:
// одна топает определённой ногой, другая урчит, третья молча смотрит у решётки.

import { FEEDER_IDS, STATIONS, TROUGH_IDS } from '../../data/facility';
import { log } from '../events';
import { dist } from '../geometry';
import { footText } from '../herd';
import { clamp } from '../rng';
import type { Elephant, SignalKind, State } from '../types';
import { troughDrinkable, troughOfArea, tubKg } from '../world';
import { onSignalAnswered, onSignalIgnored } from './learning';
import { areaOf, canReachArea, canReachZone } from './perceive';

export function signalWillingness(e: Elephant): number {
  const T = e.profile.traits;
  const L = e.learned;
  return clamp(0.06 + 0.42 * T.expressiveness + 0.52 * L.expectation - 0.2 * (1 - L.trust));
}

// Сколько минут слон готов ждать ответа
export function signalPatience(e: Elephant): number {
  const T = e.profile.traits;
  return 9 + 26 * T.persistence * (0.45 + e.learned.expectation);
}

// Насколько заметен сигнал: громкий и ясный — или едва уловимый
export function signalClarity(e: Elephant): number {
  return clamp(0.25 + 0.75 * e.profile.traits.expressiveness);
}

const WANT: Record<SignalKind, string> = {
  toilet: 'просится в туалет',
  out: 'просится на выгул',
  in: 'хочет в слоновник',
  food: 'требует еды у пустой кормушки',
  water: 'просит воды',
  attention: 'хочет внимания',
};

// Как выглядит её сигнал — по привычке
function gesture(e: Elephant, kind: SignalKind, clear: boolean): string {
  const h = e.profile.habits;
  if (kind === 'attention') return h.signal === 'beg' ? 'тянет хобот и выпрашивает лакомство' : clear ? 'тянет к тебе хобот' : 'держится поближе к тебе';
  if (!clear) {
    switch (kind) {
      case 'toilet':
        return 'тихо переминается';
      case 'food':
        return 'обнюхивает пустую кормушку';
      case 'water':
        return 'трогает хоботом поилку';
      default:
        return 'молча стоит у ворот';
    }
  }
  switch (h.signal) {
    case 'stomp':
      return `топает ${footText(h.foot)} ногой`;
    case 'rumble':
      return 'урчит и встряхивает хоботом';
    case 'stare':
      return 'стоит у решётки и пристально смотрит на тебя';
    case 'gate':
      return 'стоит у ворот и не уходит';
    case 'beg':
      return kind === 'food' ? 'тянет хобот к сумке с лакомствами' : 'нетерпеливо машет хоботом в твою сторону';
  }
}

export function signalText(e: Elephant, kind: SignalKind): string {
  const clear = signalClarity(e) >= 0.5;
  return `${e.profile.name} ${gesture(e, kind, clear)} — ${WANT[kind]}`;
}

export function beginSignal(s: State, e: Elephant, kind: SignalKind): void {
  if (e.signal) return;
  e.signal = { kind, start: s.t, until: s.t + signalPatience(e), answered: false };
  e.day.signals++;
  e.mem.lastSignalFx = s.t - 10;
  const clear = signalClarity(e) >= 0.5;
  log(s, clear ? 'warn' : 'info', `${signalText(e, kind)}.`, {
    key: `signal:${e.id}:${kind}`,
    cooldown: 20,
    elephantId: e.id,
    x: e.x,
    y: e.y,
    kind: 'signal',
    silent: !clear,
  });
}

export function answerSignal(s: State, e: Elephant, how: string): void {
  const sig = e.signal;
  if (!sig || sig.answered) return;
  sig.answered = true;
  e.day.answered++;
  s.dailyKeeper.answered++;
  onSignalAnswered(e);
  const waited = Math.max(0, Math.round(s.t - sig.start));
  log(s, 'good', `${e.profile.name}: ${how} (ждала ${waited} мин).`, { elephantId: e.id, x: e.x, y: e.y, kind: 'answered', silent: true });
  e.signal = null;
}

export function ignoreSignal(s: State, e: Elephant): void {
  const sig = e.signal;
  if (!sig) return;
  e.day.ignored++;
  s.dailyKeeper.ignored++;
  onSignalIgnored(e);
  log(s, 'warn', `${e.profile.name} не дождалась ответа и перестала звать.`, {
    key: `ignored:${e.id}`,
    cooldown: 30,
    elephantId: e.id,
    x: e.x,
    y: e.y,
    kind: 'ignored',
  });
  e.signal = null;
  e.mem.cooldown[`signal:${sig.kind}`] = s.t + 20 + 70 * (1 - e.learned.expectation);
}

// Ответили ли на сигнал самим состоянием мира (открытые ворота, налитая вода, сено)
export function signalSatisfied(s: State, e: Elephant): string | null {
  const sig = e.signal;
  if (!sig) return null;
  const w = s.world;
  const area = areaOf(e);
  switch (sig.kind) {
    case 'out':
    case 'toilet':
      return area !== 'paddock' && canReachZone(s, e, 'paddock') ? 'ворота открыли' : null;
    case 'in':
      return area === 'paddock' && canReachZone(s, e, 'barn') ? 'ворота открыли' : null;
    case 'water': {
      const own = troughOfArea(area);
      if (troughDrinkable(s, own, e.profile.traits.sensitivity, e.needs.thirst) && w.troughs[own].level > 15) return 'воду налили';
      for (const t of TROUGH_IDS) if (t !== own && canReachArea(s, e, STATIONS[t].area) && troughDrinkable(s, t, e.profile.traits.sensitivity, e.needs.thirst) && w.troughs[t].level > 15) return 'вода есть рядом';
      return null;
    }
    case 'food': {
      for (const f of FEEDER_IDS) if (canReachArea(s, e, STATIONS[f].area) && w.feeders[f].hay > 8) return 'сено положили';
      if (w.tubs.some((t) => t.where === 'floor' && !t.broken && tubKg(t) > 1 && canReachArea(s, e, areaOfPoint(t)))) return 'овощи в тазу';
      if (w.food.some((f) => f.kind !== 'remains' && f.kind !== 'straw' && dist(f, e) < 12 && canReachArea(s, e, areaOfPoint(f)))) return 'корм рядом';
      if (area === 'paddock' && w.drum > 0.5) return 'корм в барабане';
      return null;
    }
    case 'attention':
      return null; // только живой ответ кипера
  }
}

function areaOfPoint(p: { x: number; y: number }) {
  return areaOf(p);
}

export function updateSignal(s: State, e: Elephant): 'answered' | 'ignored' | null {
  const sig = e.signal;
  if (!sig) return null;
  const how = signalSatisfied(s, e);
  if (how) {
    answerSignal(s, e, how);
    return 'answered';
  }
  if (s.t >= sig.until) {
    ignoreSignal(s, e);
    return 'ignored';
  }
  return null;
}
