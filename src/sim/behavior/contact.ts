// Полный контакт: как слониха чувствует кипера рядом.
//  • Замечает его — видит впереди и сбоку, слышит шаги за спиной и голос. Подошли вплотную сзади,
//    пока она не знала, — вздрагивает, а то и лягнёт.
//  • Ей нужно своё место: тем больше, чем меньше доверия и привычки к киперу, чем она нервнее,
//    раздражённее и чем ревнивее охраняет еду. Своему, которого она сама подпустила (взяла
//    угощение, дала погладить, выполнила просьбу), можно стоять вплотную.
//  • Кипер слишком близко без приглашения — растёт напряжение: робкая отходит, уверенная
//    предупреждает (уши в стороны, мотает головой), а если не отступить — оттолкнёт.
//  • Корпус слона — препятствие; надвинувшаяся слониха сдвигает кипера, у стены — прижимает.

import { CONTACT, KEEPER, LEARN } from '../../data/balance';
import { fx, log } from '../events';
import { dist, keeperIndex } from '../geometry';
import { nameCase } from '../herd';
import { chance, clamp } from '../rng';
import type { Elephant, State, Vec } from '../types';
import { finishActivity, giveWay, startActivity } from './act';
import { bodyCircles, gapToBody, headPos, keeperBearing, rearPos } from './perceive';

function up(v: number, rate: number): number {
  return clamp(v + rate * (1 - v));
}

function down(v: number, rate: number): number {
  return clamp(v - rate * v);
}

// Не в духе: голодна, перегрелась, устала, только что испугалась, стресс
export function irritable(s: State, e: Elephant): boolean {
  const n = e.needs;
  return n.stress > 55 || n.hunger > 82 || n.heat > 75 || n.fatigue > 88 || s.t - e.mem.spooked < 15;
}

// Ест что-то ценное и ревниво охраняет миску
function guarding(e: Elephant): boolean {
  const a = e.act;
  return a.kind === 'eat' && a.phase === 'do' && (a.target?.t === 'tub' || a.target?.t === 'food');
}

// Сколько места ей нужно вокруг (от поверхности корпуса до кипера), метров
export function comfortGap(s: State, e: Elephant): number {
  const T = e.profile.traits;
  const L = e.learned;
  let g = 0.4 + 2.4 * (1 - L.trust) * (0.55 + 0.9 * T.nervousness) - 0.7 * L.familiarity;
  if (irritable(s, e)) g += 0.9;
  if (guarding(e)) g += 0.9 * (0.4 + T.confidence) * (1 - L.trust);
  return clamp(g, 0.15, 3.5);
}

// Сама позвала кипера к себе: приняла контакт недавно, идёт по просьбе, стоит, лежит, пришла сама,
// просит у него (смотрит в упор, выпрашивает, зовёт поиграть)
export function invited(s: State, e: Elephant): boolean {
  if (s.t - e.mem.accepted < CONTACT.invitedFor) return true;
  const k = e.act.kind;
  if (k === 'follow' || k === 'walkWith' || k === 'stay' || k === 'seekKeeper') return true;
  if (k === 'lie' && e.lying) return true;
  if (k === 'explore' && e.act.key === 'explore:keeper') return true;
  if (k === 'signal' && (e.signal?.kind === 'attention' || e.profile.habits.signal === 'stare' || e.profile.habits.signal === 'beg')) return true;
  return false;
}

export function noticeKeeper(s: State, e: Elephant): void {
  e.mem.aware = s.t;
}

// Приняла контакт: угощение, ласку, выполненную просьбу — кипер «свой» рядом с ней
export function acceptContact(s: State, e: Elephant): void {
  e.mem.aware = s.t;
  e.mem.accepted = s.t;
  e.mem.tension = Math.max(0, e.mem.tension - 0.35);
  e.learned.familiarity = up(e.learned.familiarity, CONTACT.familiarityTouch);
}

function keeperFree(x: number, y: number): boolean {
  return !keeperIndex.hits(x, y, KEEPER.radius);
}

// Сдвинуть кипера от слонихи; если некуда — прижата к стене
function pushKeeper(s: State, from: Vec, metres: number): boolean {
  const k = s.keeper;
  const d = dist(k, from) || 1;
  const ux = (k.x - from.x) / d;
  const uy = (k.y - from.y) / d;
  for (const turn of [0, 0.5, -0.5, 1.0, -1.0]) {
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    const vx = ux * c - uy * sn;
    const vy = ux * sn + uy * c;
    for (const f of [1, 0.6, 0.3]) {
      const x = k.x + vx * metres * f;
      const y = k.y + vy * metres * f;
      if (keeperFree(x, y)) {
        k.x = x;
        k.y = y;
        return true;
      }
    }
  }
  return false;
}

function interruptKeeper(s: State): void {
  const k = s.keeper;
  if (k.task) k.task = null;
  if (k.prep) k.prep = null;
}

function shove(s: State, e: Elephant): void {
  const k = s.keeper;
  const h = headPos(e, 1.2);
  pushKeeper(s, h, CONTACT.shovePush);
  k.stun = Math.max(k.stun, CONTACT.shoveStun);
  interruptKeeper(s);
  e.day.shoves++;
  e.mem.tension = 0.3;
  e.needs.stress = clamp(e.needs.stress + 6, 0, 100);
  e.learned.trust = down(e.learned.trust, 0.01);
  fx('shove', k.x, k.y, e.id);
  log(s, 'warn', `${e.profile.name} оттолкнула тебя хоботом: ей было тесно. Отойди, дай ей место, заговори с ней — и подходи снова.`, {
    key: `shove:${e.id}`,
    cooldown: 4,
    elephantId: e.id,
    x: e.x,
    y: e.y,
    kind: 'shove',
  });
}

function startle(s: State, e: Elephant, gap: number): void {
  const k = s.keeper;
  const T = e.profile.traits;
  e.mem.aware = s.t;
  e.mem.spooked = s.t;
  e.needs.stress = clamp(e.needs.stress + 12 + 10 * T.nervousness, 0, 100);
  e.learned.trust = down(e.learned.trust, LEARN.trustStartle);
  if (e.lying) {
    // Спала — вскакивает
    finishActivity(s, e, 'done');
    log(s, 'warn', `${e.profile.name} вскочила: к спящей подошли вплотную, не окликнув. Спящую сначала зовут по имени.`, { key: `startle:${e.id}`, cooldown: 5, elephantId: e.id, x: e.x, y: e.y, kind: 'spook' });
    return;
  }
  const kick = gap <= CONTACT.kickGap && (T.confidence > 0.35 || T.nervousness > 0.6) && chance(s, 0.35 + 0.5 * T.nervousness + 0.2 * (1 - e.learned.trust));
  if (kick) {
    pushKeeper(s, rearPos(e, 1.1), CONTACT.kickPush);
    k.stun = Math.max(k.stun, CONTACT.kickStun);
    interruptKeeper(s);
    e.day.kicks++;
    e.learned.trust = down(e.learned.trust, LEARN.trustKick);
    fx('kick', k.x, k.y, e.id);
    log(s, 'bad', `${e.profile.name} лягнула: к ней подошли сзади, а она не знала. Заговори с ней издалека и подходи так, чтобы она тебя видела.`, {
      key: `kick:${e.id}`,
      cooldown: 3,
      elephantId: e.id,
      x: e.x,
      y: e.y,
      kind: 'kick',
    });
    return;
  }
  fx('trumpet', e.x, e.y, e.id);
  giveWay(s, e, k, 2.5, 'шарахнулась от неожиданности', true);
  log(s, 'warn', `${e.profile.name} вздрогнула и шарахнулась: за спиной вдруг кто-то оказался. Окликай, когда подходишь сзади.`, {
    key: `startle:${e.id}`,
    cooldown: 5,
    elephantId: e.id,
    x: e.x,
    y: e.y,
    kind: 'spook',
  });
}

// Каждый шаг: заметила ли, тесно ли ей, что делает в ответ
export function updateContact(s: State, e: Elephant, dt: number): void {
  const k = s.keeper;
  const T = e.profile.traits;
  const L = e.learned;
  const m = e.mem;
  const d = dist(e, k);
  if (d > 16) {
    m.tension = Math.max(0, m.tension - CONTACT.tensionFall * dt);
    return;
  }
  const gap = gapToBody(e, k) - KEEPER.radius;
  const bearing = keeperBearing(s, e);
  const asleep = e.lying && e.act.kind === 'sleep';

  // Видит или слышит: шаги рядом за спиной слышны почти сразу, если она не увлечена едой
  // или игрой; бегущего слышно всегда. Спящая не слышит — её окликают
  if (!asleep) {
    if (d <= CONTACT.viewRange && bearing <= CONTACT.viewHalfAngle) m.aware = s.t;
    else if (d <= CONTACT.hearSteps && k.moving) {
      const busy = e.act.phase === 'do' && (e.act.kind === 'eat' || e.act.kind === 'drink' || e.act.kind === 'play');
      if (k.running || chance(s, dt * (busy ? 1.5 : 6))) m.aware = s.t;
    }
  }
  const aware = s.t - m.aware <= CONTACT.awareMinutes;

  // Рядом с кипером — привыкает (если спокойна)
  if (d <= 6 && !irritable(s, e)) {
    e.day.contactMinutes += dt;
    L.familiarity = up(L.familiarity, CONTACT.familiarityNear * dt);
  }

  // Подошли вплотную сзади, а она не знала — испуг
  if (!aware && gap <= CONTACT.startleGap && (bearing > CONTACT.viewHalfAngle || asleep)) {
    startle(s, e, gap);
    return;
  }

  // Кипер бежит рядом — нервная шарахается
  if (k.running && k.moving && d <= 6 && T.nervousness > 0.45 && s.t - m.spooked > 6 && !e.act.forced) {
    if (chance(s, (T.nervousness - 0.4) * (1 - L.trust) * 2.4 * dt)) {
      m.spooked = s.t;
      e.needs.stress = clamp(e.needs.stress + 10 + 10 * T.nervousness, 0, 100);
      L.trust = down(L.trust, LEARN.trustSpook);
      fx('trumpet', e.x, e.y, e.id);
      giveWay(s, e, k, 4, 'шарахнулась от бегущего кипера', true);
      log(s, 'warn', `${e.profile.name} шарахнулась: рядом бегали. Возле слонов ходят шагом.`, { key: `spook:${e.id}`, cooldown: 25, elephantId: e.id, x: e.x, y: e.y, kind: 'spook' });
      return;
    }
  }

  // Тесно: ближе, чем ей удобно, без приглашения. Тесно становится, когда подходит кипер; если
  // он стоит, а подошла она сама, — почти не беспокоит (кроме ревности к своей еде)
  const need = comfortGap(s, e);
  if (gap < need && !invited(s, e) && !asleep) {
    const closeness = 1 - Math.max(0, gap) / need;
    const known = aware ? 0.7 : 1;
    // Разговаривает с ней спокойно — это не напор; занят ею самой (кормит с руки, чешет) — её
    // контакт, решает она сама; работает рядом руками с чем-то другим — почти как подошёл
    const job = k.task?.action;
    const talking = job?.verb === 'voice' && job.target === `${e.id}:talk`;
    const aboutHer = !!job && (job.target === e.id || job.target.startsWith(`${e.id}:`));
    const keeperCame = talking ? 0 : aboutHer ? 0.2 : k.moving || k.task !== null ? 1 : guarding(e) ? 0.8 : 0.2;
    m.tension = clamp(m.tension + CONTACT.tensionRise * (0.6 + T.nervousness) * closeness * known * keeperCame * dt);
  } else m.tension = Math.max(0, m.tension - CONTACT.tensionFall * (invited(s, e) ? 2.2 : 1) * dt);

  // Ответ на тесноту
  if (!e.lying && !e.act.forced && m.tension >= CONTACT.stepAway) {
    const bold = T.confidence > 0.55 && T.nervousness < 0.6;
    if (m.tension >= CONTACT.shove && bold && L.trust < 0.6 && s.t - m.lastWarn < 3 && gap < 0.8) {
      shove(s, e);
      return;
    }
    if (bold && m.tension >= CONTACT.warn && s.t - m.lastWarn > 3) {
      m.lastWarn = s.t;
      startActivity(s, e, { kind: 'warn', target: null, score: 1.4, dur: 1.2, key: 'warn', signal: null, note: 'предупреждает: уши в стороны, мотает головой', aux: null }, true);
      fx('warn', e.x, e.y, e.id);
      log(s, 'warn', `${e.profile.name} растопырила уши и мотает головой — ты слишком близко. Отступи или заговори с ней.`, {
        key: `warn:${e.id}`,
        cooldown: 6,
        elephantId: e.id,
        x: e.x,
        y: e.y,
        kind: 'warn',
      });
      return;
    }
    if (!bold && e.act.kind !== 'giveWay' && e.act.kind !== 'avoid') {
      giveWay(s, e, k, 2.4, 'отходит: кипер слишком близко', false);
      m.tension = Math.max(0, m.tension - 0.15);
    }
  }

  // Корпус надвинулся на кипера: сдвинуть, у стены — прижать
  if (gap < -0.05) {
    const c = bodyCircles(e).reduce((a, b) => (dist(a, k) - a.r < dist(b, k) - b.r ? a : b));
    const moved = pushKeeper(s, c, -gap + 0.05);
    if (!moved) {
      k.stun = Math.max(k.stun, 1.2);
      log(s, 'warn', `${e.profile.name} прижала тебя к стене. Не стой между слоном и стеной — оставляй себе выход.`, {
        key: `squeeze:${e.id}`,
        cooldown: 5,
        elephantId: e.id,
        x: k.x,
        y: k.y,
        kind: 'shove',
      });
    }
  }
}

// Раз в сутки: не виделись почти совсем — привычка к киперу немного тает
export function contactDailyDrift(e: Elephant): void {
  if (e.day.contactMinutes < 30) e.learned.familiarity = down(e.learned.familiarity, CONTACT.familiarityDecay);
}

export function nameAcc(e: Elephant): string {
  return nameCase(e.profile.name, 'acc');
}
