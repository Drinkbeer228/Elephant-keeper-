// Ритм ночи у каждой свой: сколько обычно спит за раз (около двух часов), при какой полноте
// пузыря просыпается и сколько потом стоит сонная. Выводится из характера и внешности — постоянно.

import { jitter } from '../herd';
import type { Elephant } from '../types';

export function boutMinutes(e: Elephant): number {
  return Math.round(120 + 50 * jitter(e.profile.look.seed, 41) - 16 * (e.profile.traits.activity - 0.5));
}

export function wakeBladder(e: Elephant): number {
  return 84 + 14 * jitter(e.profile.look.seed, 43) - 8 * e.learned.toilet;
}

export function drowsyMinutes(e: Elephant): number {
  return (2.5 + 5 * (jitter(e.profile.look.seed, 47) + 0.5)) * (1.25 - 0.5 * e.profile.traits.activity);
}

