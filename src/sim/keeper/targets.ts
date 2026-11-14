// Цели взаимодействия. Всё, что кипер может сделать рядом, собирается по тому, к чему оно
// относится: слониха (и уход, и голос), станция, ворота, вещь на полу, тачка, работа перед собой.
// Интерфейс показывает одну цель и одно главное действие, поэтому здесь же решается, какая цель
// ближе к намерению кипера:
//   • та, к которой он стоит лицом и ближе всего (до большой станции — до её ближайшего края);
//   • до чего можно дотянуться рукой — важнее той, кого можно только позвать;
//   • важное действие немного «приближает» цель;
//   • то, что за спиной, и слониха дальше нескольких метров сами главными не становятся —
//     их выбирают из списка или кнопкой «следующая цель».
// «Положить вещь» целью не считается: для этого есть своя клавиша и своя кнопка.

import { FOCUS } from '../../data/balance';
import { GATES, STATIONS, type Rect } from '../../data/facility';
import { gapToBody, headPos } from '../behavior/perceive';
import { angleDiff, distToRect } from '../geometry';
import type { ActionOption, Elephant, InteractionTarget, State, Vec } from '../types';
import { availableActions } from './index';

// Основания станций и проёмы ворот — по названию, которым подписаны их действия
const PLACE_RECT = new Map<string, Rect>();
for (const st of Object.values(STATIONS)) if (st.rect) PLACE_RECT.set(st.label, st.rect);
for (const g of GATES) PLACE_RECT.set(g.label, g.rect);

interface Aim {
  gap: number;
  dir: number; // направление от кипера, рад
}

function pointAim(k: Vec, p: Vec): Aim {
  return { gap: Math.hypot(p.x - k.x, p.y - k.y), dir: Math.atan2(p.y - k.y, p.x - k.x) };
}

// До прямоугольника — до его ближайшей точки
function rectAim(k: Vec, r: Rect): Aim {
  const x = Math.max(r.x0, Math.min(k.x, r.x1));
  const y = Math.max(r.y0, Math.min(k.y, r.y1));
  return pointAim(k, { x, y });
}

// До слонихи: до корпуса или до головы — хобот тянется навстречу руке
function elephantAim(e: Elephant, k: Vec): Aim {
  const head = headPos(e, 1.7);
  const toHead = pointAim(k, head);
  const headGap = Math.max(0, toHead.gap - FOCUS.headReach);
  const bodyGap = Math.max(0, gapToBody(e, k));
  if (headGap <= bodyGap) return { gap: headGap, dir: toHead.dir };
  return { gap: bodyGap, dir: Math.atan2(e.y - k.y, e.x - k.x) };
}

// «Эффективное расстояние» до цели, м: меньше — лучше
export function targetScore(t: { gap: number; bearing: number; top: number; contact: boolean; enabled: boolean }): number {
  const side = t.gap < FOCUS.onTop ? 0 : 1 - Math.cos(t.bearing);
  const pull = t.enabled ? Math.max(0, Math.min(1, (t.top - FOCUS.urgentFrom) / FOCUS.urgentSpan)) * FOCUS.urgentPull : 0;
  return t.gap * (1 + FOCUS.facing * side) - pull + (t.contact ? 0 : FOCUS.voicePenalty) + (t.enabled ? 0 : FOCUS.offPenalty);
}

function byUse(a: ActionOption, b: ActionOption): number {
  return Number(b.enabled) - Number(a.enabled) || b.priority - a.priority || a.order - b.order;
}

export function interactionTargets(s: State, actions: ActionOption[] = availableActions(s)): InteractionTarget[] {
  const k = s.keeper;
  if (k.prep) return [];
  const groups = new Map<string, ActionOption[]>();
  for (const o of actions) {
    if (o.ref.verb === 'drop') continue;
    const key = o.elephantId ? `el:${o.elephantId}` : `g:${o.group || 'Рядом'}`;
    const list = groups.get(key);
    if (list) list.push(o);
    else groups.set(key, [o]);
  }
  const out: InteractionTarget[] = [];
  for (const [key, list] of groups) {
    const options = list.slice().sort(byUse);
    const main = options[0];
    const enabled = main.enabled;
    const e = main.elephantId ? s.elephants.find((x) => x.id === main.elephantId) : undefined;
    let aim: Aim;
    let x: number;
    let y: number;
    let rect: Rect | null = null;
    let contact = true;
    let centerDist = 0;
    if (e) {
      aim = elephantAim(e, k);
      x = e.x;
      y = e.y;
      contact = options.some((o) => o.ref.verb !== 'voice');
      centerDist = Math.hypot(e.x - k.x, e.y - k.y);
    } else {
      const anchor = main.at ?? options.find((o) => o.at)?.at ?? null;
      x = anchor ? anchor.x : k.x;
      y = anchor ? anchor.y : k.y;
      aim = anchor ? pointAim(k, anchor) : { gap: 0, dir: k.facing };
      for (const o of options) {
        if (!o.at) continue;
        const a = pointAim(k, o.at);
        if (a.gap < aim.gap) aim = a;
      }
      // Станция или ворота: расстояние — до ближайшего края, рамка — если действие относится к самой станции
      const place = PLACE_RECT.get(main.group);
      if (place && options.some((o) => o.at && distToRect(o.at.x, o.at.y, place) <= 1)) {
        const a = rectAim(k, place);
        if (a.gap < aim.gap) aim = a;
        if (anchor && distToRect(anchor.x, anchor.y, place) <= 0.05) rect = place;
      }
    }
    const gap = Math.round(aim.gap * 100) / 100;
    const bearing = gap < FOCUS.onTop ? 0 : Math.abs(angleDiff(k.facing, aim.dir));
    const top = main.priority;
    const score = targetScore({ gap, bearing, top, contact, enabled });
    let auto: boolean;
    if (!enabled) auto = contact && gap <= FOCUS.offGap && bearing <= FOCUS.offAngle;
    else if (contact) auto = !(bearing > FOCUS.behind && gap > FOCUS.onTop);
    else auto = top >= FOCUS.urgentVoice || (centerDist <= FOCUS.voiceRange && bearing <= FOCUS.voiceAngle);
    out.push({ key, label: e ? e.profile.name : main.group || 'Рядом', elephantId: e ? e.id : null, x, y, rect, gap, bearing, contact, enabled, top, auto, score, options });
  }
  // Сначала те, что могут стать главными сами; среди них — ближе к намерению
  return out.sort((a, b) => Number(b.auto) - Number(a.auto) || a.score - b.score || (a.key < b.key ? -1 : 1));
}
