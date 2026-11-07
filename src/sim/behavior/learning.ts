// Отношения слонихи с кипером — то, чему она учится в каждодневной работе рядом с ним:
//  • доверие — спокойна ли рядом, подпускает ли близко;
//  • привычка («свой») — растёт от времени рядом и заботы, тает в разлуке (см. contact.ts);
//  • покладистость — охотно ли откликается на просьбы;
//  • знание просьб — каждую голосовую просьбу она знает по-своему; выполнила и её похвалили —
//    знает крепче, выполнила впустую — слабее;
//  • ожидание ответа — стоит ли подавать сигналы.
// Подкрепление должно быть последовательным: угощение за напор учит требовать, «нельзя» без
// причины и одна и та же просьба по кругу подтачивают доверие. На физиологию всё это не влияет.

import { LEARN } from '../../data/balance';
import { clamp } from '../rng';
import { log } from '../events';
import { initialLearned, nameCase } from '../herd';
import { CUES, type Cue, type Elephant, type Request, type State } from '../types';

function up(v: number, rate: number): number {
  return clamp(v + rate * (1 - v));
}

function down(v: number, rate: number): number {
  return clamp(v - rate * v);
}

export function cueOf(why: Request): Cue | null {
  return why === 'toilet' ? null : why;
}

export function onSignalAnswered(e: Elephant): void {
  e.learned.expectation = up(e.learned.expectation, LEARN.expectUp);
  e.learned.trust = up(e.learned.trust, LEARN.trustAnswer);
}

export function onSignalIgnored(e: Elephant): void {
  e.learned.expectation = down(e.learned.expectation, LEARN.expectDown);
  e.learned.trust = down(e.learned.trust, LEARN.trustIgnore);
}

// Окно похвалы открыто: только что выполнила просьбу
function rewardOpen(s: State, e: Elephant): boolean {
  const call = e.mem.call;
  return !!call && call.arrivedAt >= 0 && !call.rewarded && s.t - call.arrivedAt <= LEARN.rewardWindow;
}

function reward(s: State, e: Elephant, strength: 'treat' | 'praise'): Request | null {
  const call = e.mem.call;
  if (!call || !rewardOpen(s, e)) return null;
  call.rewarded = true;
  const k = strength === 'treat' ? 1 : 0.45;
  e.learned.cooperation = up(e.learned.cooperation, LEARN.coopReward * k);
  const cue = cueOf(call.why);
  if (cue) e.learned.cues[cue] = up(e.learned.cues[cue], strength === 'treat' ? LEARN.cueTreat : LEARN.cuePraise);
  if (call.why === 'toilet' && e.day.urineTank + e.day.urineDrain > 0) {
    e.learned.toilet = up(e.learned.toilet, LEARN.toiletUp * k);
    e.learned.expectation = up(e.learned.expectation, LEARN.expectUp * 0.5 * k);
  }
  return call.why;
}

// Похвала сразу после лужи на полу учит её, что так и надо: подкрепляют только то, чего хотят
function wrongPraise(s: State, e: Elephant, k: number): boolean {
  const p = e.mem.lastPee;
  if (s.t - p.t > 3 || (p.where !== 'bedding' && p.where !== 'concrete')) return false;
  e.learned.toilet = down(e.learned.toilet, LEARN.toiletWrongPraise * k);
  log(s, 'warn', `Похвала сразу после лужи на полу учит ${nameCase(e.profile.name, 'acc')}, что можно и мимо ведра. Хвали за ведро и сток.`, { key: `wrongPraise:${e.id}`, cooldown: 30, elephantId: e.id, kind: 'refuse' });
  return true;
}

// Угощение: укрепляет доверие; если она только что выполнила просьбу — это награда за неё
export function onTreat(s: State, e: Elephant): Request | null {
  e.learned.trust = up(e.learned.trust, LEARN.trustTreat);
  if (wrongPraise(s, e, 1)) return null;
  return reward(s, e, 'treat');
}

// «Молодец, хорошая» — награда слабее лакомства, зато всегда с собой
export function onPraise(s: State, e: Elephant): Request | null {
  if (wrongPraise(s, e, 0.5)) return null;
  const r = reward(s, e, 'praise');
  if (!r) e.learned.familiarity = up(e.learned.familiarity, 0.004);
  // Просится — и её услышали: просить стоит
  if (!r && e.signal) e.learned.expectation = up(e.learned.expectation, LEARN.expectUp * 0.3);
  return r;
}

export function onScratch(e: Elephant): void {
  e.learned.trust = up(e.learned.trust, LEARN.trustScratch);
}

export function onPet(e: Elephant): void {
  e.learned.trust = up(e.learned.trust, LEARN.trustPet);
}

export function onHand(e: Elephant): void {
  e.learned.trust = up(e.learned.trust, LEARN.trustHand);
}

export function onGroom(e: Elephant): void {
  e.learned.trust = up(e.learned.trust, LEARN.trustGroom);
}

export function onShowerEnjoyed(e: Elephant): void {
  e.learned.trust = up(e.learned.trust, LEARN.trustShower);
}

export function onTalk(e: Elephant): void {
  e.learned.trust = up(e.learned.trust, LEARN.trustTalk);
  e.learned.familiarity = up(e.learned.familiarity, 0.008);
}

// Выполнила просьбу, а похвалы не было — в следующий раз пойдёт неохотнее
export function onCallUnrewarded(e: Elephant, why: Request = 'come'): void {
  e.learned.cooperation = down(e.learned.cooperation, LEARN.coopUnrewarded);
  const cue = cueOf(why);
  if (cue) e.learned.cues[cue] = down(e.learned.cues[cue], LEARN.cueUnrewarded);
  if (why === 'toilet') e.learned.toilet = down(e.learned.toilet, LEARN.toiletDown);
}

// Одна и та же просьба по кругу, а она уже отказала: раздражает
export function onNag(e: Elephant): void {
  e.learned.trust = down(e.learned.trust, LEARN.nagTrust);
  e.mem.tension = clamp(e.mem.tension + 0.15);
}

// «Нельзя» без причины
export function onScoldWrong(e: Elephant): void {
  e.learned.trust = down(e.learned.trust, LEARN.scoldTrust);
  e.learned.cooperation = down(e.learned.cooperation, LEARN.scoldTrust * 0.5);
}

// Угостили, пока она напирала (предупреждала, толкалась): учится требовать
export function onRewardPushy(e: Elephant): void {
  e.learned.cooperation = down(e.learned.cooperation, LEARN.pushyCoop);
}

export function onSpooked(e: Elephant): void {
  e.learned.trust = down(e.learned.trust, LEARN.trustSpook);
}

// Раз в сутки выученное чуть-чуть тянется к врождённому уровню (забывание)
export function dailyDrift(e: Elephant): void {
  const base = initialLearned(e.profile);
  const k = LEARN.baselinePull;
  const L = e.learned;
  L.trust = clamp(L.trust + (base.trust - L.trust) * k);
  L.cooperation = clamp(L.cooperation + (base.cooperation - L.cooperation) * k);
  L.expectation = clamp(L.expectation + (base.expectation - L.expectation) * k);
  L.toilet = clamp(L.toilet + (base.toilet - L.toilet) * k);
  for (const c of CUES) L.cues[c] = clamp(L.cues[c] + (base.cues[c] - L.cues[c]) * k);
}
