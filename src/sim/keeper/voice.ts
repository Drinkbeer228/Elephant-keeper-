// Голос: кипер разговаривает со слонихой — по имени, привычными словами, как со знакомым
// животным, а не подаёт собаке команду. Окликнуть и позвать «иди сюда» можно издалека (до 25 м,
// с выгула), остальные просьбы — только рядом (до 9 м). Откликнется ли —
// решает она: знает ли эту просьбу, доверяет ли, «свой» ли ты для неё, чем занята,
// в каком настроении. Часто звать и не нужно: подойди и делай дело рядом с ней.
//
//  «Зоя!» — окликнуть: заметит тебя (так не напугаешь, подходя сзади), может подойти поздороваться
//  «Иди сюда» · «Стоять» · «Подвинься» · «Пошли» (рядом с тобой) · «Ложись» / «Вставай»
//  «En arrière!» — назад (пятится) · «Partez!» — вперёд, пошла (в открытые ворота — проходит)
//  «Ногу!» — подаёт ближнюю к тебе ногу для осмотра стопы
//  «Давай» — в туалет (с ведром у задних ног — в ведро) · «Нельзя!» · «Молодец» · поговорить спокойно
// Команды не жёсткие: каждая знает их по-своему, и многое решают ваши отношения.

import { CONTACT, LEARN } from '../../data/balance';
import { GATE_BY_ID, ROOMS, TOILET_STANCE, areaAt, hardFloor, inRect } from '../../data/facility';
import { finishActivity, giveWay, lieOnCommand, respondToCall, startActivity } from '../behavior/act';
import { acceptContact, comfortGap, noticeKeeper } from '../behavior/contact';
import { cueCompliance, lieCompliance, toiletCompliance } from '../behavior/engine';
import { onNag, onPraise, onScoldWrong, onTalk } from '../behavior/learning';
import { connectedAreas, gapToBody, gateMask, keeperBearing, keeperMeet, nearestFoot, radiusOf } from '../behavior/perceive';
import { keeperCatching } from '../behavior/urine';
import { elephantCanStand } from '../nav';
import { answerSignal } from '../behavior/signals';
import { fx, log } from '../events';
import { dist } from '../geometry';
import { nameCase } from '../herd';
import { random } from '../rng';
import type { ActionOption, ActionRef, Cue, Elephant, Foot, State, Vec } from '../types';
import { lyingComfort } from '../world';
import { off, opt, type KCtx } from './common';

export type VoiceCue = 'name' | 'come' | 'stay' | 'move' | 'follow' | 'lie' | 'up' | 'toilet' | 'no' | 'praise' | 'talk' | 'back' | 'go' | 'foot';

const FOOT_GEN: Record<Foot, string> = { FL: 'левую переднюю', FR: 'правую переднюю', HL: 'левую заднюю', HR: 'правую заднюю' };

// Куда она пятится: прямо назад, сколько есть места
function behindPoint(s: State, e: Elephant): Vec | null {
  const mask = gateMask(s);
  const r = radiusOf(e);
  for (const m of [2.0, 1.4, 0.8]) {
    const p = { x: e.x - Math.cos(e.heading) * m, y: e.y - Math.sin(e.heading) * m };
    if (elephantCanStand(p.x, p.y, r, mask)) return p;
  }
  return null;
}

// Куда идёт по «Partez!»: у открытых ворот на выгул — проходит их; иначе — вперёд, сколько есть места
function forwardPoint(s: State, e: Elephant): { p: Vec; through: boolean } | null {
  const g = GATE_BY_ID.outer;
  const here = areaAt(e.x, e.y);
  if (s.world.gates.outer && (here === g.a || here === g.b)) {
    const near = g.approach[here];
    if (near && Math.hypot(e.x - near.x, e.y - near.y) < 7) {
      const other = here === g.a ? g.b : g.a;
      const far = g.approach[other];
      const dir = Math.sign(far.y - near.y) || 1;
      return { p: { x: far.x, y: far.y + dir * 2.2 }, through: true };
    }
  }
  const mask = gateMask(s);
  const r = radiusOf(e);
  for (const m of [3.5, 2.5, 1.5]) {
    const p = { x: e.x + Math.cos(e.heading) * m, y: e.y + Math.sin(e.heading) * m };
    if (elephantCanStand(p.x, p.y, r, mask)) return { p, through: false };
  }
  return null;
}

// Что она делает такого, за что говорят «нельзя»
function misbehaving(s: State, e: Elephant): string | null {
  const a = e.act;
  if (a.kind === 'manipulate') return a.target?.t === 'obj' && a.target.id === 'hose' ? 'тянет шланг' : 'катает таз';
  if (a.kind === 'warn') return 'напирает на тебя';
  if (a.kind === 'eat' && a.target?.t === 'tub') {
    const tub = s.world.tubs.find((t) => a.target?.t === 'tub' && t.id === a.target.id);
    if (tub && tub.owner !== e.id) return 'ест из чужого таза';
  }
  if (a.kind === 'explore' && a.target?.t === 'item') return 'тащит вещь';
  return null;
}

function rewardOpen(s: State, e: Elephant): boolean {
  const call = e.mem.call;
  return !!call && call.arrivedAt >= 0 && !call.rewarded && s.t - call.arrivedAt <= LEARN.rewardWindow;
}

// В помещении кипера слоны не слышат (и ему не до них)
function keeperIndoors(s: State): boolean {
  return ROOMS.some((r) => inRect(r.rect, s.keeper.x, s.keeper.y));
}

export function voiceOptions(c: KCtx, out: ActionOption[]): void {
  const { s, k, h } = c;
  if (keeperIndoors(s)) return;
  for (const e of s.elephants) {
    const d = dist(e, k);
    if (d > CONTACT.callRange) continue;
    const far = d > CONTACT.voiceRange;
    const name = e.profile.name;
    const group = name;
    const x = { elephantId: e.id, group };
    const ref = (cue: VoiceCue): ActionRef => ({ verb: 'voice', target: `${e.id}:${cue}` });
    const gap = gapToBody(e, k);
    const aware = s.t - e.mem.aware <= 1;
    const behind = keeperBearing(s, e) > CONTACT.viewHalfAngle;
    const sig = e.signal?.kind;
    const asleep = e.lying && e.act.kind === 'sleep';
    // Окликнуть: прежде чем подходить сзади или к той, что не смотрит
    if (!aware || asleep) out.push(opt(ref('name'), `Окликнуть: «${name}!»`, behind && gap < 4 ? 98 : asleep ? 20 : far ? 18 : 34, x));
    if (asleep) continue;
    if (gap > 2.2) out.push(opt(ref('come'), `«${name}, иди сюда»`, (far ? 22 : 30) + (sig === 'attention' || sig === 'food' ? 30 : 0), x));
    if (far) continue;
    if (gap < 3.5 && !e.lying) out.push(opt(ref('move'), `«${name}, подвинься»`, 28 + (gap < 1.2 ? 25 : 0) + (e.mem.tension > 0.4 ? 20 : 0), x));
    if (d <= 7 && !e.lying) {
      const handling = h && (h.kind === 'tank' || h.kind === 'brush' || h.kind === 'washKit' || h.kind === 'hose');
      out.push(opt(ref('stay'), `«${name}, стоять»`, 26 + (handling && e.speed > 0.2 ? 45 : 0) + (e.act.kind === 'walkWith' ? 40 : 0), x));
    }
    if (d <= 6 && !e.lying && e.act.kind !== 'walkWith') {
      const lead = (sig === 'toilet' && h?.kind === 'tank') || (sig === 'out' && c.s.world.gates.outer) ? 60 : 0;
      out.push(opt(ref('follow'), `«${name}, пошли» — рядом с тобой`, 29 + lead, x));
    }
    if (d <= 5 && !e.lying) {
      const dirtyBack = e.body.back > 0.25 || e.body.hay > 0.25;
      const tools = h && (h.kind === 'brush' || h.kind === 'washKit' || h.kind === 'hose');
      out.push(opt(ref('lie'), `«${name}, ложись»`, 24 + (dirtyBack && tools ? 35 : 0), x));
    }
    if (e.lying && e.act.kind === 'lie') out.push(opt(ref('up'), `«${name}, вставай»`, 26, x));
    if (d <= 7 && !e.lying && e.act.kind !== 'backUp') {
      const inWay = gap < 1.0 || (s.world.gates.outer && Math.hypot(e.x - 15.5, e.y - 20) < 3);
      out.push(opt(ref('back'), `«${name}, en arrière!» — назад`, 24 + (inWay ? 24 : 0), x));
    }
    if (d <= 8 && !e.lying && e.act.kind !== 'forward') {
      const gate = s.world.gates.outer && Math.hypot(e.x - 15.5, e.y - 20) < 7 && (sig === 'out' || sig === 'in' || e.act.kind === 'idle' || e.act.kind === 'signal');
      out.push(opt(ref('go'), gate ? `«${name}, partez!» — в ворота` : `«${name}, partez!» — вперёд`, 23 + (gate ? 34 : 0), x));
    }
    if (d <= 4.5 && !e.lying && e.act.kind !== 'foot') {
      const due = !s.world.checks.feet[e.id];
      out.push(opt(ref('foot'), `«${name}, ногу!» — осмотреть стопу`, 20 + (e.body.legs > 0.3 ? 18 : 0) + (due ? 8 : 0), x));
    }
    if (d <= 5 && !e.lying) {
      const catching = h?.kind === 'tank' && keeperCatching(s, e);
      const label = catching ? `«${name}, давай» — в ведро` : `«${name}, давай» — в туалет`;
      const ready = catching || dist(e, TOILET_STANCE) < 4;
      if (e.needs.bladder < 20) out.push(off(ref('toilet'), label, 'Ей сейчас не нужно', 8, x));
      else out.push(opt(ref('toilet'), label, (ready ? 120 : 30) + (sig === 'toilet' ? 50 : 0), x));
    }
    if (d <= 6) {
      const bad = misbehaving(s, e);
      out.push(opt(ref('no'), bad ? `«Нельзя, ${name}!» — ${bad}` : `«Нельзя, ${name}!»`, bad ? 115 : 4, x));
      out.push(opt(ref('praise'), `«Молодец, ${name}!»`, rewardOpen(s, e) ? 100 : 10, x));
    }
    if (d <= 5) out.push(opt(ref('talk'), `Поговорить с ${nameCase(name, 'ins')} спокойно`, 22 + (e.mem.tension > 0.3 ? 60 : 0) + (e.needs.stress > 40 ? 25 : 0), { ...x, timed: true }));
  }
}

function refuse(s: State, e: Elephant, what: string, why: string): void {
  e.day.refusals++;
  fx('refuse', e.x, e.y, e.id);
  log(s, 'info', `${e.profile.name} ${what} — ${why}.`, { key: `refuse:${e.id}`, cooldown: 2, elephantId: e.id, x: e.x, y: e.y, kind: 'refuse' });
}

// Одну и ту же просьбу повторяют, а она уже отказала
function nag(s: State, e: Elephant, cue: string): void {
  const n = e.mem.nag;
  if (n.cue === cue && s.t - n.t < 1.5) n.n++;
  else {
    n.cue = cue;
    n.n = 1;
  }
  n.t = s.t;
  if (n.n >= 3) {
    onNag(e);
    log(s, 'warn', `Ты повторяешь ${nameCase(e.profile.name, 'dat')} одно и то же, а она не хочет, — это её злит. Сделай паузу, займись чем-то рядом.`, { key: `nag:${e.id}`, cooldown: 10, elephantId: e.id, kind: 'refuse' });
  }
}

function tryCue(s: State, e: Elephant, cue: Cue): boolean {
  const { p } = cueCompliance(s, e, cue, s.keeper.pouch > 0);
  return random(s) < p;
}

export function applyVoice(s: State, ref: ActionRef): boolean {
  if (ref.verb !== 'voice') return false;
  const [id, cue] = ref.target.split(':') as [string, VoiceCue];
  const e = s.elephants.find((x) => x.id === id);
  if (!e) return true;
  const k = s.keeper;
  s.dailyKeeper.calls++;
  s.dailyKeeper.interactions++;
  noticeKeeper(s, e);
  fx('voice', k.x, k.y, e.id, cue);
  const name = e.profile.name;
  const hasTreats = k.pouch > 0;
  switch (cue) {
    case 'name': {
      if (e.lying && e.act.kind === 'sleep') {
        log(s, 'info', `${name} приоткрыла глаза — слышит тебя.`, { key: `wake:${e.id}`, cooldown: 3, elephantId: e.id, silent: true });
        return true;
      }
      // Свой кипер позвал по имени — бывает, подходит поздороваться
      const L = e.learned;
      const calm = ['idle', 'wander', 'rest', 'explore'].includes(e.act.kind);
      if (calm && L.trust > 0.5 && L.familiarity > 0.45 && random(s) < 0.2 + 0.35 * e.profile.traits.sociability) {
        const m = keeperMeet(s, e);
        if (m && connectedAreas(s, areaAt(e.x, e.y) ?? 'paddock').includes(m.area)) respondToCall(s, e, m.spot, m.face, 'подходит к тебе поздороваться', 'come');
      }
      return true;
    }
    case 'come': {
      const m = keeperMeet(s, e);
      if (!m || !connectedAreas(s, areaAt(e.x, e.y) ?? 'paddock').includes(m.area)) {
        refuse(s, e, 'не может подойти', 'между вами закрытые ворота или ограда');
        return true;
      }
      if (gapToBody(e, k) < 1.8) return true;
      if (tryCue(s, e, 'come')) {
        s.dailyKeeper.callsObeyed++;
        if (e.signal?.kind === 'attention') answerSignal(s, e, 'кипер позвал');
        respondToCall(s, e, m.spot, m.face, 'идёт к тебе', 'come');
      } else {
        refuse(s, e, 'не идёт', cueCompliance(s, e, 'come', hasTreats).why);
        nag(s, e, cue);
      }
      return true;
    }
    case 'stay': {
      const walking = e.act.kind === 'walkWith';
      if (tryCue(s, e, 'stay') || walking) {
        s.dailyKeeper.callsObeyed++;
        // Шла рядом — прогулка выполнена: хвалить сейчас
        if (walking && e.mem.call?.why === 'follow') e.mem.call.arrivedAt = s.t;
        const keep = e.mem.call;
        startActivity(s, e, { kind: 'stay', target: null, score: 1.2, dur: 3 + 6 * e.learned.cues.stay, key: 'stay', signal: null, note: 'стоит, как просили', aux: null });
        e.mem.call = walking && keep ? keep : { until: s.t + 10, x: e.x, y: e.y, arrivedAt: s.t, rewarded: false, why: 'stay' };
        acceptContact(s, e);
      } else {
        refuse(s, e, 'не стоит на месте', cueCompliance(s, e, 'stay', hasTreats).why);
        nag(s, e, cue);
      }
      return true;
    }
    case 'move': {
      if (tryCue(s, e, 'move') && giveWay(s, e, k, 2.6, 'отходит, как просили', false)) {
        s.dailyKeeper.callsObeyed++;
        e.mem.call = { until: s.t + 6, x: e.x, y: e.y, arrivedAt: -1, rewarded: false, why: 'move' };
        acceptContact(s, e);
      } else {
        refuse(s, e, 'не подвинулась', cueCompliance(s, e, 'move', hasTreats).why);
        nag(s, e, cue);
      }
      return true;
    }
    case 'follow': {
      if (tryCue(s, e, 'follow')) {
        s.dailyKeeper.callsObeyed++;
        startActivity(s, e, { kind: 'walkWith', target: null, score: 1.1, dur: 20 + 15 * e.learned.cues.follow, key: 'walkWith', signal: null, note: 'идёт рядом с кипером', aux: null });
        e.mem.call = { until: s.t + 40, x: e.x, y: e.y, arrivedAt: -1, rewarded: false, why: 'follow' };
        acceptContact(s, e);
        if (e.signal?.kind === 'toilet' || e.signal?.kind === 'out' || e.signal?.kind === 'in') answerSignal(s, e, 'кипер повёл её');
      } else {
        refuse(s, e, 'не пошла с тобой', cueCompliance(s, e, 'follow', hasTreats).why);
        nag(s, e, cue);
      }
      return true;
    }
    case 'lie': {
      const { p, why } = lieCompliance(s, e, hasTreats);
      if (random(s) < p) {
        s.dailyKeeper.callsObeyed++;
        lieOnCommand(s, e, 7 + 6 * e.learned.cooperation);
        acceptContact(s, e);
        log(s, 'good', `${name} ложится — теперь можно достать до спины.`, { elephantId: e.id, x: e.x, y: e.y, kind: 'lie' });
      } else {
        refuse(s, e, 'не легла', why);
        nag(s, e, cue);
      }
      return true;
    }
    case 'up':
      if (e.act.kind === 'lie') finishActivity(s, e, 'done');
      return true;
    case 'toilet': {
      if (e.needs.bladder < 20) {
        refuse(s, e, 'не стала', 'ей сейчас не нужно');
        return true;
      }
      const p = toiletCompliance(e, hasTreats);
      if (random(s) >= p) {
        refuse(s, e, 'не стала', e.profile.habits.signal === 'beg' && !hasTreats ? 'сначала хочет лакомство' : 'не готова');
        nag(s, e, cue);
        return true;
      }
      s.dailyKeeper.callsObeyed++;
      const hadSignal = e.signal?.kind === 'toilet';
      const catching = keeperCatching(s, e);
      // Ведро у её задних ног — справляется прямо в него, где бы ни стояла; приученная у стока
      // сама встаёт над решёткой
      if (!catching && dist(e, TOILET_STANCE) < 4 && hardFloor(e.x, e.y) && areaAt(e.x, e.y) === areaAt(TOILET_STANCE.x, TOILET_STANCE.y)) {
        respondToCall(s, e, TOILET_STANCE, TOILET_STANCE.face, 'встаёт над стоком', 'toilet');
      } else {
        startActivity(s, e, { kind: 'urinate', target: null, score: 2, dur: 0.3, key: 'urinate', signal: null, note: catching ? 'мочится в ведро' : 'мочится', aux: null }, true);
        // Окно похвалы откроется, когда закончит (если в ведро)
        e.mem.call = { until: s.t + 10, x: e.x, y: e.y, arrivedAt: -1, rewarded: false, why: 'toilet' };
      }
      if (hadSignal) answerSignal(s, e, 'кипер пришёл с ведром');
      return true;
    }
    case 'back': {
      const p = behindPoint(s, e);
      if (!p) {
        refuse(s, e, 'не пятится', 'сзади нет места');
        return true;
      }
      if (tryCue(s, e, 'back')) {
        s.dailyKeeper.callsObeyed++;
        startActivity(s, e, { kind: 'backUp', target: null, score: 1.2, dur: 6, key: 'backUp', signal: null, note: 'пятится назад, как просили', aux: p }, true);
        e.mem.call = { until: s.t + 8, x: p.x, y: p.y, arrivedAt: -1, rewarded: false, why: 'back' };
        acceptContact(s, e);
      } else {
        refuse(s, e, 'не пятится', cueCompliance(s, e, 'back', hasTreats).why);
        nag(s, e, cue);
      }
      return true;
    }
    case 'go': {
      const f = forwardPoint(s, e);
      if (!f) {
        refuse(s, e, 'не идёт', 'впереди нет места');
        return true;
      }
      if (tryCue(s, e, 'go')) {
        s.dailyKeeper.callsObeyed++;
        const walk = Math.hypot(f.p.x - e.x, f.p.y - e.y) * 1.3;
        startActivity(s, e, { kind: 'forward', target: { t: 'point', x: f.p.x, y: f.p.y, face: null }, score: 1.2, dur: 0.3, key: 'forward', signal: null, note: f.through ? 'идёт в ворота, как просили' : 'идёт вперёд, как просили', aux: null }, true);
        e.mem.call = { until: s.t + 10 + walk, x: f.p.x, y: f.p.y, arrivedAt: -1, rewarded: false, why: 'go' };
        acceptContact(s, e);
        if (f.through && (e.signal?.kind === 'out' || e.signal?.kind === 'in')) answerSignal(s, e, 'кипер пропустил её в ворота');
      } else {
        refuse(s, e, 'стоит на месте', cueCompliance(s, e, 'go', hasTreats).why);
        nag(s, e, cue);
      }
      return true;
    }
    case 'foot': {
      if (tryCue(s, e, 'foot')) {
        s.dailyKeeper.callsObeyed++;
        const foot = nearestFoot(e, k);
        startActivity(s, e, { kind: 'foot', target: null, score: 1.2, dur: 1.5 + 3.5 * e.learned.cues.foot, key: `foot:${foot}`, signal: null, note: `держит ${FOOT_GEN[foot]} ногу поднятой`, aux: null }, true);
        e.mem.call = { until: s.t + 10, x: e.x, y: e.y, arrivedAt: s.t, rewarded: false, why: 'foot' };
        acceptContact(s, e);
      } else {
        refuse(s, e, 'не даёт ногу', cueCompliance(s, e, 'foot', hasTreats).why);
        nag(s, e, cue);
      }
      return true;
    }
    case 'no': {
      const bad = misbehaving(s, e);
      if (!bad) {
        onScoldWrong(e);
        e.mem.tension = Math.min(1, e.mem.tension + 0.1);
        log(s, 'warn', `«Нельзя» без причины: ${name} не понимает, за что её ругают, — доверие падает.`, { key: `scold:${e.id}`, cooldown: 5, elephantId: e.id, kind: 'refuse' });
        return true;
      }
      if (tryCue(s, e, 'no')) {
        const key = e.act.key;
        finishActivity(s, e, 'done');
        e.mem.cooldown[key] = s.t + 25;
        e.mem.call = { until: s.t + 5, x: e.x, y: e.y, arrivedAt: s.t, rewarded: false, why: 'stay' };
        log(s, 'info', `${name} перестала: ${bad}. Похвали, что послушалась.`, { elephantId: e.id, x: e.x, y: e.y });
      } else {
        refuse(s, e, 'не слушается', cueCompliance(s, e, 'no', hasTreats).why);
        nag(s, e, cue);
      }
      return true;
    }
    case 'praise': {
      const r = onPraise(s, e);
      if (r) {
        acceptContact(s, e);
        log(s, 'good', `${name} поняла, что сделала хорошо.`, { elephantId: e.id, silent: true });
      }
      return true;
    }
    case 'talk': {
      e.needs.stress = Math.max(0, e.needs.stress - 8);
      e.mem.tension = Math.max(0, e.mem.tension - 0.35);
      onTalk(e);
      if (e.learned.trust > 0.25 && gapToBody(e, k) > comfortGap(s, e) * 0.5) acceptContact(s, e);
      if (e.signal?.kind === 'attention') answerSignal(s, e, 'с ней поговорили');
      return true;
    }
  }
  return true;
}

// Лечь удобно ли здесь (для подсказок)
export function lieSpotOk(s: State, e: Elephant): boolean {
  return lyingComfort(s, e.x, e.y) >= 0.32;
}
