// Простое научение: три выученные величины, которые меняются от опыта общения с кипером.
//  • доверие — как слон относится к киперу вообще;
//  • покладистость — насколько охотно идёт на зов (растёт, если за выполненное хвалят);
//  • ожидание ответа — стоит ли вообще подавать сигналы (падает, если на них не отвечают).
// На физиологию эти числа не влияют: голод, жажда, моча и навоз от них не зависят.

import { LEARN } from '../../data/balance';
import { initialLearned } from '../herd';
import { clamp } from '../rng';
import type { Elephant, State } from '../types';

function up(v: number, rate: number): number {
  return clamp(v + rate * (1 - v));
}

function down(v: number, rate: number): number {
  return clamp(v - rate * v);
}

export function onSignalAnswered(e: Elephant): void {
  e.learned.expectation = up(e.learned.expectation, LEARN.expectUp);
  e.learned.trust = up(e.learned.trust, LEARN.trustAnswer);
}

export function onSignalIgnored(e: Elephant): void {
  e.learned.expectation = down(e.learned.expectation, LEARN.expectDown);
  e.learned.trust = down(e.learned.trust, LEARN.trustIgnore);
}

// Угощение: укрепляет доверие; если слон только что выполнил просьбу — это награда за неё.
// Награда за туалет в бак закрепляет связь «попросилась — сходила — похвалили»
export function onTreat(s: State, e: Elephant): 'call' | 'toilet' | 'lie' | null {
  e.learned.trust = up(e.learned.trust, LEARN.trustTreat);
  const call = e.mem.call;
  if (call && call.arrivedAt >= 0 && !call.rewarded && s.t - call.arrivedAt <= LEARN.rewardWindow) {
    call.rewarded = true;
    e.learned.cooperation = up(e.learned.cooperation, LEARN.coopReward);
    if (call.why === 'toilet' && e.day.urineTank + e.day.urineDrain > 0) {
      e.learned.toilet = up(e.learned.toilet, LEARN.toiletUp);
      e.learned.expectation = up(e.learned.expectation, LEARN.expectUp * 0.5);
    }
    return call.why;
  }
  return null;
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

// Пришла на зов (или сходила в бак), а похвалы не было — в следующий раз пойдёт неохотнее
export function onCallUnrewarded(e: Elephant, why: 'call' | 'toilet' | 'lie' = 'call'): void {
  e.learned.cooperation = down(e.learned.cooperation, LEARN.coopUnrewarded);
  if (why === 'toilet') e.learned.toilet = down(e.learned.toilet, LEARN.toiletDown);
}

export function onSpooked(e: Elephant): void {
  e.learned.trust = down(e.learned.trust, LEARN.trustSpook);
}

// Раз в сутки выученное чуть-чуть тянется к врождённому уровню (забывание)
export function dailyDrift(e: Elephant): void {
  const base = initialLearned(e.profile);
  const k = LEARN.baselinePull;
  e.learned.trust = clamp(e.learned.trust + (base.trust - e.learned.trust) * k);
  e.learned.cooperation = clamp(e.learned.cooperation + (base.cooperation - e.learned.cooperation) * k);
  e.learned.expectation = clamp(e.learned.expectation + (base.expectation - e.learned.expectation) * k);
  e.learned.toilet = clamp(e.learned.toilet + (base.toilet - e.learned.toilet) * k);
}
