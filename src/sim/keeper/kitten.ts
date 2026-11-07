// Котёнок рядом — его можно погладить. Это не обязанность и не задача смены: просто можно.

import { dist } from '../geometry';
import { petKitten } from '../kitten';
import type { ActionOption, ActionRef, State } from '../types';
import { opt, type KCtx } from './common';

export function kittenOptions(c: KCtx, out: ActionOption[]): void {
  const k = c.s.kitten;
  if (k.perch?.tree || k.hop || k.act.kind === 'flee' || k.fear > 0.35) return;
  if (dist(c.k, k) > 1.1) return;
  out.push(opt({ verb: 'petKitten', target: 'kitten' }, k.act.kind === 'nap' ? 'Погладить спящего котёнка' : 'Погладить котёнка', 6, { group: 'Котёнок' }));
}

export function applyKitten(s: State, ref: ActionRef): boolean {
  if (ref.verb !== 'petKitten') return false;
  petKitten(s);
  return true;
}
