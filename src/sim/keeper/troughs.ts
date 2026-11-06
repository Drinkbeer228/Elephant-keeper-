// Поилки: кран (налить), пробка слива; мытьё по порядку — слить, нанести средство для поилок,
// отмыть ершом, ополоснуть (шлангом или проточной водой из крана), закрыть слив и налить.
// Работать с химией у поилки можно, только если рядом нет слона: поилки у решётки.

import { TROUGH_IDS, STATIONS, type TroughId } from '../../data/facility';
import { headPos } from '../behavior/perceive';
import { fx, log } from '../events';
import { dist } from '../geometry';
import type { ActionOption, ActionRef, State } from '../types';
import { near, off, opt, type KCtx } from './common';
import { hoseUsable } from './hose';

const STAGE_TEXT = { ok: '', drained: 'слита', chem: 'в средстве', scrubbed: 'отмыта', rinsed: 'ополоснута' } as const;

function elephantAtTrough(s: State, id: TroughId): string | null {
  const r = STATIONS[id].rect!;
  const c = { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  for (const e of s.elephants) if (dist(headPos(e, 1.6), c) < 2.6) return e.profile.name;
  return null;
}

export function troughOptions(c: KCtx, out: ActionOption[]): void {
  const { s, w, h } = c;
  if (near(s, 'poolValve')) {
    const dirt = Math.round(w.pool.dirt * 100);
    out.push(opt({ verb: 'valve', target: 'pool' }, w.pool.valve ? `Закрыть кран бассейна (муть ${dirt}%)` : `Освежить воду в бассейне (муть ${dirt}%)`, w.pool.valve ? 60 : 35, { group: STATIONS.poolValve.label }));
  }
  for (const id of TROUGH_IDS) {
    if (!near(s, id, 1.5)) continue;
    const t = w.troughs[id];
    const group = STATIONS[id].label;
    const lvl = Math.round(t.level);
    const stage = STAGE_TEXT[t.stage];
    // Кран
    if (t.valve) out.push(opt({ verb: 'valve', target: id }, t.drain ? 'Закрыть кран (проточная промывка)' : `Закрыть кран (воды ${lvl}%)`, t.level >= 95 && !t.drain ? 130 : 85, { group }));
    else {
      const label = t.drain ? 'Открыть кран: промыть проточной водой' : `Открыть кран поилки (воды ${lvl}%${stage ? `, ${stage}` : ''})`;
      const prio = t.stage === 'rinsed' && !t.drain ? 125 : t.level < 60 && t.stage === 'ok' ? 88 : 40;
      out.push(opt({ verb: 'valve', target: id }, label, prio, { group }));
    }
    // Слив
    if (!t.drain) {
      const dirty = t.debris > 0.3 || t.chem > 0.05 || !w.checks.troughChanged[id];
      out.push(opt({ verb: 'drainTrough', target: id }, `Слить воду${t.debris > 0.3 ? ' — в ней сено и сор' : t.chem > 0.05 ? ' — в ней средство!' : ''}`, dirty && t.level > 5 ? 74 : 30, { group }));
    } else out.push(opt({ verb: 'drainTrough', target: id }, t.level > 1 ? `Закрыть слив (сливается: ${lvl}%)` : 'Закрыть слив', t.stage === 'rinsed' ? 128 : 50, { group }));
    // Мытьё
    const animal = elephantAtTrough(s, id);
    if (t.stage === 'drained' || (t.level <= 1 && t.drain && t.stage === 'ok')) {
      const ref: ActionRef = { verb: 'chemTrough', target: id };
      if (h?.kind !== 'chem') out.push(off(ref, 'Нанести средство для поилок', 'Возьми средство в шкафу инвентарной', 60, { group }));
      else if (animal) out.push(off(ref, 'Нанести средство', `У поилки ${animal} — с химией работать нельзя`, 60, { group }));
      else out.push(opt(ref, 'Нанести средство для поилок', 110, { group, timed: true }));
    }
    if (t.stage === 'chem') {
      const ref: ActionRef = { verb: 'scrubTrough', target: id };
      if (h?.kind !== 'chem') out.push(off(ref, 'Отмыть поилку ершом', 'Ёрш — вместе со средством', 60, { group }));
      else if (animal) out.push(off(ref, 'Отмыть поилку ершом', `У поилки ${animal}`, 60, { group }));
      else out.push(opt(ref, 'Отмыть поилку ершом', 112, { group, timed: true }));
    }
    if (t.stage === 'scrubbed' || t.stage === 'chem') {
      const ref: ActionRef = { verb: 'rinseTrough', target: id };
      if (h?.kind === 'hose' && hoseUsable(s)) out.push(opt(ref, 'Ополоснуть поилку из шланга', t.stage === 'scrubbed' ? 114 : 70, { group, timed: true }));
      else if (t.drain) out.push(opt(ref, 'Ополоснуть поилку проточной водой', t.stage === 'scrubbed' ? 113 : 66, { group, timed: true }));
      else out.push(off(ref, 'Ополоснуть поилку', 'Открой слив — смывать средство в него', 60, { group }));
    }
  }
}

export function applyTrough(s: State, ref: ActionRef): boolean {
  const w = s.world;
  const k = s.keeper;
  switch (ref.verb) {
    case 'valve':
      if (ref.target === 'pool') w.pool.valve = !w.pool.valve;
      else if (ref.target in w.troughs) {
        const t = w.troughs[ref.target as TroughId];
        t.valve = !t.valve;
        t.overflow = 0;
      }
      fx('valve', k.x, k.y);
      return true;
    case 'drainTrough': {
      const t = w.troughs[ref.target as TroughId];
      if (!t) return true;
      t.drain = !t.drain;
      if (t.drain && t.level <= 1 && t.stage === 'ok') t.stage = 'drained';
      fx('drain', k.x, k.y);
      return true;
    }
    case 'chemTrough': {
      const t = w.troughs[ref.target as TroughId];
      const h = k.held;
      if (!t || h?.kind !== 'chem' || h.load <= 0 || elephantAtTrough(s, ref.target as TroughId)) return true;
      if (t.level > 1) return true;
      t.stage = 'chem';
      t.chem = 1;
      h.load--;
      if (h.load <= 0) k.held = null;
      fx('foam', k.x, k.y);
      return true;
    }
    case 'scrubTrough': {
      const t = w.troughs[ref.target as TroughId];
      if (!t || t.stage !== 'chem' || elephantAtTrough(s, ref.target as TroughId)) return true;
      t.stage = 'scrubbed';
      t.debris = 0;
      fx('brush', k.x, k.y);
      return true;
    }
    case 'rinseTrough': {
      const t = w.troughs[ref.target as TroughId];
      if (!t) return true;
      if (t.stage !== 'scrubbed' && t.stage !== 'chem') return true;
      const viaHose = k.held?.kind === 'hose' && hoseUsable(s);
      if (!viaHose && !t.drain) return true;
      if (t.stage === 'chem') log(s, 'info', `${STATIONS[ref.target as TroughId].label}: средство смыто, но поилку не отмыли — сор останется.`, { silent: true });
      t.stage = t.stage === 'scrubbed' ? 'rinsed' : 'drained';
      t.chem = 0;
      t.level = 0;
      fx('spray', k.x, k.y);
      return true;
    }
  }
  return false;
}

