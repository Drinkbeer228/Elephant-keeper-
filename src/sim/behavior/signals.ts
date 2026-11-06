// Сигналы: слон сообщает о потребности, которую не может закрыть сам.
// Подавать ли сигнал и как ясно — зависит от характера (выразительность, упрямство)
// и от опыта (ожидает ли слон, что ему ответят).

import { STATIONS } from '../../data/facility';
import { log } from '../events';
import { dist } from '../geometry';
import { clamp } from '../rng';
import type { Elephant, SignalKind, State } from '../types';
import { troughSpoiled } from '../world';
import { onSignalAnswered, onSignalIgnored } from './learning';
import { zoneOf } from './perceive';

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

const CLEAR: Record<SignalKind, string> = {
  toilet: 'просится в туалет — переминается у ворот',
  out: 'просится на выгул — ждёт у ворот',
  in: 'хочет в слоновник — ждёт у ворот снаружи',
  food: 'требует еды у пустой кормушки',
  water: 'у пустой поилки — нужна вода',
  attention: 'тянет к тебе хобот — хочет внимания',
};

const SUBTLE: Record<SignalKind, string> = {
  toilet: 'тихо переминается у ворот',
  out: 'молча стоит у ворот',
  in: 'молча стоит у ворот снаружи',
  food: 'обнюхивает пустую кормушку',
  water: 'трогает хоботом сухую поилку',
  attention: 'держится поближе к тебе',
};

export function signalText(e: Elephant, kind: SignalKind): string {
  return `${e.profile.name} ${signalClarity(e) >= 0.5 ? CLEAR[kind] : SUBTLE[kind]}`;
}

export function beginSignal(s: State, e: Elephant, kind: SignalKind): void {
  if (e.signal) return;
  e.signal = { kind, start: s.t, until: s.t + signalPatience(e), answered: false };
  e.day.signals++;
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
  switch (sig.kind) {
    case 'out':
    case 'toilet':
      return w.gateOpen && zoneOf(e) === 'barn' ? 'ворота открыли' : null;
    case 'in':
      return w.gateOpen && zoneOf(e) === 'paddock' ? 'ворота открыли' : null;
    case 'water': {
      const t = e.act.target;
      const id = t && t.t === 'slot' && (t.station === 'barnWater' || t.station === 'paddockWater') ? t.station : zoneOf(e) === 'barn' ? 'barnWater' : 'paddockWater';
      return w.water[id].level > 15 ? 'воду налили' : null;
    }
    case 'food': {
      const zone = zoneOf(e);
      const feeder = zone === 'barn' ? 'barnRack' : 'paddockFeeder';
      if (w.hay[feeder] > 8) return 'сено положили';
      if (zone === 'barn' && w.trough.portions > 0 && !troughSpoiled(s)) return 'овощи в кормушке';
      if (w.food.some((f) => f.zone === zone && f.kind !== 'remains' && dist(f, e) < 12)) return 'корм рядом';
      if (zone === 'paddock' && w.drum > 0.5 && dist(e, STATIONS.paddockFeeder.keeper) < 40) return 'корм в барабане';
      return null;
    }
    case 'attention':
      return null; // только живой ответ кипера
  }
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
