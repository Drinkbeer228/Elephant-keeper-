// Шланг — вещь в мире: тянется от катушки и огибает стены и ограды по пути кипера,
// остаётся лежать там, где его бросили, и сам не сматывается. Слоны могут его
// тянуть и грызть — тогда он течёт, становится короче, а то и выходит из строя.

import { HOSE } from '../../data/balance';
import { HOSE_LENGTH, HOSE_REEL } from '../../data/facility';
import { fx, log } from '../events';
import { BARRIER_RECTS, dist, segmentHitsRect } from '../geometry';
import type { ActionOption, ActionRef, State, Vec } from '../types';
import { near, off, opt, type KCtx } from './common';

function clear(a: Vec, b: Vec): boolean {
  for (const r of BARRIER_RECTS) if (segmentHitsRect(a.x, a.y, b.x, b.y, r, 0.12)) return false;
  return true;
}

export function hoseUsable(s: State): boolean {
  return s.world.hose.length >= HOSE.minLength;
}

// Длина шланга, если его конец окажется в точке p
export function hoseLengthTo(s: State, p: Vec): number {
  const pts = s.world.hose.path;
  let len = 0;
  for (let i = 0; i + 1 < pts.length; i++) len += dist(pts[i], pts[i + 1]);
  return len + dist(pts[pts.length - 1], p);
}

// Кипер со шлангом сделал шаг: огибаем углы, распрямляем, проверяем длину
export function hoseFollow(s: State, from: Vec, to: Vec): boolean {
  const h = s.world.hose;
  const path = h.path.map((p) => ({ x: p.x, y: p.y }));
  // Распрямить: если с предпоследней точки уже видно новое место — последний перегиб не нужен
  while (path.length >= 2 && clear(path[path.length - 2], to)) path.pop();
  // Обогнуть: прямой отрезок упёрся в стену — перегиб там, где кипер стоял
  if (!clear(path[path.length - 1], to)) path.push({ x: from.x, y: from.y });
  let len = 0;
  for (let i = 0; i + 1 < path.length; i++) len += dist(path[i], path[i + 1]);
  len += dist(path[path.length - 1], to);
  if (len > h.length) return false;
  h.path = path;
  h.end = { x: to.x, y: to.y };
  return true;
}

export function hoseOptions(c: KCtx, out: ActionOption[]): void {
  const { s, k, w, h } = c;
  const hose = w.hose;
  const group = 'Шланг';
  if (near(s, 'hoseReel', 1.5)) {
    if (hose.state === 'reel') {
      if (!hoseUsable(s)) out.push(off({ verb: 'takeHose', target: 'hose' }, 'Взять шланг', 'Шланг перекушен — нужен новый (привезут утром)', 40, { group }));
      else if (h || c.pushing) out.push(off({ verb: 'takeHose', target: 'hose' }, 'Взять шланг', 'Руки заняты', 40, { group }));
      else out.push(opt({ verb: 'takeHose', target: 'hose' }, hose.damage > 0.2 ? `Взять шланг (течёт ${Math.round(hose.damage * 100)}%)` : 'Взять шланг', 50, { group }));
      if (hose.damage > 0.05) {
        if (w.supplies.tape > 0) out.push(opt({ verb: 'repairHose', target: 'tape' }, `Заклеить шланг (лента: ${w.supplies.tape})`, 45, { group, timed: true }));
        else out.push(off({ verb: 'repairHose', target: 'tape' }, 'Заклеить шланг', 'Лента кончилась — в шкафу пусто до утра', 30, { group }));
      }
    } else {
      const held = s.elephants.some((e) => e.act.kind === 'manipulate' && e.act.target?.t === 'obj' && e.act.target.id === 'hose' && e.act.phase === 'do');
      const label = 'Смотать шланг на катушку';
      if (held) out.push(off({ verb: 'reelHose', target: 'hose' }, label, 'Слониха держит шланг хоботом', 60, { group }));
      else out.push(opt({ verb: 'reelHose', target: 'hose' }, label, h?.kind === 'hose' ? 70 : 52, { group, timed: true }));
    }
  }
  // Лежащий шланг: поднять конец
  if (hose.state === 'floor' && !h && !c.pushing && dist(k, hose.end) <= 1.2) {
    out.push(opt({ verb: 'grabHose', target: 'hose' }, 'Поднять шланг', 74, { group }));
  }
}

export function applyHose(s: State, ref: ActionRef): boolean {
  const w = s.world;
  const k = s.keeper;
  const hose = w.hose;
  switch (ref.verb) {
    case 'takeHose':
      if (hose.state !== 'reel' || k.held || !hoseUsable(s)) return true;
      hose.state = 'held';
      hose.path = [{ x: HOSE_REEL.x, y: HOSE_REEL.y }];
      hose.end = { x: k.x, y: k.y };
      k.held = { kind: 'hose', load: 0, aux: 0, owner: null };
      return true;
    case 'grabHose':
      if (hose.state !== 'floor' || k.held) return true;
      hose.state = 'held';
      hose.end = { x: k.x, y: k.y };
      k.held = { kind: 'hose', load: 0, aux: 0, owner: null };
      return true;
    case 'reelHose':
      if (hose.state === 'reel') return true;
      hose.state = 'reel';
      hose.path = [{ x: HOSE_REEL.x, y: HOSE_REEL.y }];
      hose.end = { x: HOSE_REEL.x, y: HOSE_REEL.y };
      if (k.held?.kind === 'hose') k.held = null;
      fx('reel', HOSE_REEL.x, HOSE_REEL.y);
      return true;
    case 'repairHose':
      if (w.supplies.tape <= 0 || hose.state !== 'reel') return true;
      w.supplies.tape--;
      hose.damage = Math.max(0, hose.damage - HOSE.tapeFix);
      log(s, 'info', 'Шланг заклеен изолентой.', { silent: true });
      return true;
  }
  return false;
}

// Бросить шланг: остаётся лежать, где бросили
export function dropHose(s: State): void {
  const hose = s.world.hose;
  hose.state = 'floor';
  hose.end = { x: s.keeper.x + Math.cos(s.keeper.facing) * 0.35, y: s.keeper.y + Math.sin(s.keeper.facing) * 0.35 };
}

// Утренняя замена перекушенного шланга
export function replaceHoseIfBroken(s: State): void {
  const hose = s.world.hose;
  if (hose.length >= HOSE.minLength) return;
  hose.length = HOSE_LENGTH;
  hose.damage = 0;
  hose.state = 'reel';
  hose.path = [{ x: HOSE_REEL.x, y: HOSE_REEL.y }];
  hose.end = { x: HOSE_REEL.x, y: HOSE_REEL.y };
  log(s, 'info', 'Утром привезли новый шланг.', { silent: true });
}
