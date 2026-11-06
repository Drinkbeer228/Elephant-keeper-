// Физиология и самочувствие: потребности растут и спадают независимо от отношений с кипером.

import { ELEPHANT, NEEDS } from '../../data/balance';
import { shadeAt } from '../../data/facility';
import { dist, inPool } from '../geometry';
import { clamp } from '../rng';
import { darkness, indoorTemperature, temperature } from '../time';
import type { Elephant, NeedKey, State } from '../types';
import { zoneDirt } from '../world';
import { bond, zoneOf } from './perceive';

export function ambientTemp(s: State, e: { x: number; y: number }): number {
  return zoneOf(e) === 'barn' ? indoorTemperature(s.seed, s.t) : temperature(s.seed, s.t);
}

// Грязь зоны считаем раз в игровую минуту — это обход всей сетки. Значение хранится
// в состоянии, поэтому после загрузки сейва поведение продолжается точно так же
export function cachedDirt(s: State, zone: 'barn' | 'paddock'): number {
  const minute = Math.floor(s.t);
  const d = s.world.dirt;
  if (d.minute !== minute) {
    d.minute = minute;
    d.barn = Math.round(zoneDirt(s, 'barn') * 1e4) / 1e4;
    d.paddock = Math.round(zoneDirt(s, 'paddock') * 1e4) / 1e4;
  }
  return d[zone];
}

const BOREDOM_GROWTH: Partial<Record<string, number>> = {
  eat: 0.15,
  drink: 0.3,
  sleep: 0,
  rest: 0.45,
  wander: 0.4,
  explore: 0,
  play: 0,
  bathe: 0,
  dust: 0,
  socialize: 0.2,
  follow: 0.2,
};

export function isLyingAsleep(e: Elephant): boolean {
  return e.act.kind === 'sleep' && e.act.phase === 'do' && e.lying;
}

export function updateNeeds(s: State, e: Elephant, dt: number): void {
  const n = e.needs;
  const T = e.profile.traits;
  const sleeping = isLyingAsleep(e);
  const resting = e.act.kind === 'rest' && e.act.phase === 'do';
  const temp = ambientTemp(s, e);

  n.hunger += (sleeping ? NEEDS.hungerSleep : NEEDS.hunger) * (0.75 + 0.5 * T.foodDrive) * dt;
  n.thirst += NEEDS.thirst * (1 + Math.max(0, temp - 20) / 22 + n.heat / 160) * (sleeping ? 0.5 : 1) * dt;
  n.bladder += NEEDS.bladder * (sleeping ? 0.7 : 1) * dt;
  n.bowel += NEEDS.bowel * (sleeping ? 0.5 : 1) * dt;

  if (sleeping) n.fatigue -= NEEDS.fatigueSleep * dt;
  else if (resting) n.fatigue -= NEEDS.fatigueRest * dt;
  else n.fatigue += (NEEDS.fatigueAwake + (e.speed > 0.15 ? NEEDS.fatigueWalk * Math.min(1.6, e.speed / 1.1) : 0)) * dt;

  // Скука копится от безделья; занятия (еда, игра, исследование) её не растят, а снимают сами
  const occupied = BOREDOM_GROWTH[e.act.kind] ?? 1;
  if (!sleeping) n.boredom += NEEDS.boredom * occupied * (0.55 + 0.35 * T.curiosity + 0.3 * T.activity + 0.25 * T.playfulness) * dt;

  // Общество: рядом с подругами одиночество спадает, вдали — растёт (сильнее у общительных)
  let company = 0;
  for (const o of s.elephants) {
    if (o === e) continue;
    const d = dist(e, o);
    if (d < 6) company += Math.max(0, 0.35 + bond(s, e.id, o.id)) * (1 - d / 6);
  }
  if (company > 0.15) n.social -= NEEDS.socialRelief * Math.min(1.5, company) * dt;
  else n.social += NEEDS.social * (0.25 + 1.1 * T.sociability) * dt;

  // Жара: солнце греет, тень, вода, мокрая кожа и пыль охлаждают
  if (inPool(e.x, e.y)) {
    n.heat -= NEEDS.heatWater * dt;
  } else {
    const sun = (1 - shadeAt(e.x, e.y)) * (1 - darkness(s.t));
    const load = Math.max(0, temp - 23) * NEEDS.heatPerDegree * sun * (1 - 0.55 * e.wet) * (1 - 0.35 * e.dust) * (0.8 + 0.4 * T.sensitivity);
    const cool = (temp < 22 ? NEEDS.heatShade : NEEDS.heatShade * (1 - sun)) + 0.9 * e.wet;
    n.heat += (load - cool) * dt;
  }
  e.wet = Math.max(0, e.wet - (0.012 + Math.max(0, temp - 14) * 0.0016) * dt);
  e.dust = Math.max(0, e.dust - 0.0018 * dt);

  n.stress += (stressTarget(s, e) - n.stress) * NEEDS.stressFollow * dt;

  for (const k of Object.keys(n) as NeedKey[]) n[k] = clamp(n[k], 0, 100);

  // Учёт дня
  const d = e.day;
  d.minutes[e.act.kind] = (d.minutes[e.act.kind] ?? 0) + dt;
  if (sleeping) d.lyingMinutes += dt;
  d.wellbeingSum += wellbeing(e) * dt;
  d.wellbeingSamples += dt;
}

function over(v: number, lo: number): number {
  return Math.max(0, v - lo);
}

export function stressTarget(s: State, e: Elephant): number {
  const n = e.needs;
  const T = e.profile.traits;
  const L = e.learned;
  let st = 6 + 14 * T.nervousness * (1 - L.trust);
  st += 0.4 * over(n.hunger, 75) + 0.45 * over(n.thirst, 70) + 0.3 * over(n.fatigue, 80);
  st += 0.3 * over(n.boredom, 72) * (0.6 + T.sensitivity);
  st += 0.55 * T.sociability * over(n.social, 60);
  st += 0.35 * over(n.heat, 55) * (0.6 + T.sensitivity);
  st += 45 * T.sensitivity * cachedDirt(s, zoneOf(e));
  for (const o of s.elephants) {
    if (o === e) continue;
    const d = dist(e, o);
    const space = ELEPHANT.personalSpace + 2.5 * T.nervousness;
    if (d < space) st += 12 * T.nervousness * (1 - T.confidence) * Math.max(0, 0.6 - bond(s, e.id, o.id)) * (1 - d / space);
  }
  return clamp(st, 0, 100);
}

// Самочувствие 0..100: сводка для карточек и отчёта
export function wellbeing(e: Elephant): number {
  const n = e.needs;
  const T = e.profile.traits;
  const pen =
    0.45 * over(n.hunger, 45) +
    0.5 * over(n.thirst, 45) +
    0.3 * over(n.fatigue, 55) +
    0.35 * over(n.boredom, 45) +
    0.6 * T.sociability * over(n.social, 45) +
    0.35 * over(n.heat, 40) +
    0.55 * n.stress;
  return clamp(100 - pen, 0, 100);
}

// Самая острая потребность — для карточки слона
export function pressingNeed(e: Elephant): { key: NeedKey; value: number } | null {
  const n = e.needs;
  const list: { key: NeedKey; value: number }[] = [
    { key: 'thirst', value: n.thirst },
    { key: 'hunger', value: n.hunger },
    { key: 'bladder', value: n.bladder * 0.85 },
    { key: 'fatigue', value: n.fatigue * 0.9 },
    { key: 'boredom', value: n.boredom * 0.9 },
    { key: 'heat', value: n.heat },
    { key: 'stress', value: n.stress * 1.1 },
    { key: 'social', value: n.social * e.profile.traits.sociability * 1.3 },
  ];
  list.sort((a, b) => b.value - a.value);
  return list[0].value >= 70 ? list[0] : null;
}
