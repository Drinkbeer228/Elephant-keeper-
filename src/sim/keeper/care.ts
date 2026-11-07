// Работа рядом со слонихой, в одном пространстве с ней: угостить и наградить, погладить, почесать,
// протянуть руку, почистить щёткой (спину — когда легла), вымыть (мыло → щётка → смыть) или из
// шланга, держать ведро под струёй (где бы она ни мочилась) и вылить его в сток, осмотреть
// поданную ногу, покормить кашей и овощами с руки, поставить таз.
// Голосовые просьбы (позвать, стоять, подвинься, пошли, ложись, давай, нельзя) — в voice.ts.

import { BODY, FOOD, KEEPER, LEARN } from '../../data/balance';
import { DRAIN, areaAt } from '../../data/facility';
import { DIETS, PORRIDGE_SOAK_MIN } from '../../data/rations';
import { spook } from '../behavior/act';
import { acceptContact } from '../behavior/contact';
import { onGroom, onHand, onPet, onRewardPushy, onScratch, onShowerEnjoyed, onTreat } from '../behavior/learning';
import { ambientTemp } from '../behavior/needs';
import { contactSpotNear, footPos, keeperCanTouch, keeperContact, keeperDistanceToHead, rearPos } from '../behavior/perceive';
import { answerSignal } from '../behavior/signals';
import { fx, log } from '../events';
import { closestOnSegment, dist } from '../geometry';
import { nameCase } from '../herd';
import type { ActionOption, ActionRef, BodyPart, Elephant, Foot, State } from '../types';
import { tubById, tubKg } from '../world';
import { off, opt, ownerName, type KCtx } from './common';
import { hoseUsable } from './hose';
import { placeTubAt } from './things';

const PART_ACC: Record<BodyPart, string> = { back: 'спину', side: 'бока', legs: 'ноги', head: 'голову' };

// Что можно достать: стоящей — бока, ноги, голову; спину — только лежащей
function reachableParts(e: Elephant): BodyPart[] {
  return e.lying ? ['back', 'side', 'head'] : ['side', 'legs', 'head'];
}

function dirtiest(e: Elephant): { part: BodyPart; v: number; reachable: boolean } {
  const parts: BodyPart[] = ['back', 'side', 'legs', 'head'];
  let best: BodyPart = 'side';
  let bestV = -1;
  for (const p of parts) {
    if (e.body[p] > bestV) {
      bestV = e.body[p];
      best = p;
    }
  }
  const reach = reachableParts(e);
  if (!reach.includes(best)) {
    const alt = reach.reduce((a, b) => (e.body[b] > e.body[a] ? b : a), reach[0]);
    return { part: e.body[alt] > 0.08 ? alt : best, v: e.body[alt] > 0.08 ? e.body[alt] : bestV, reachable: e.body[alt] > 0.08 };
  }
  return { part: best, v: bestV, reachable: true };
}

function rewardOpen(s: State, e: Elephant): boolean {
  const call = e.mem.call;
  return !!call && call.arrivedAt >= 0 && !call.rewarded && s.t - call.arrivedAt <= LEARN.rewardWindow;
}

// Ведро, стоящее рядом с кипером на полу
function tankNear(s: State) {
  return s.world.items.find((it) => it.kind === 'tank' && dist(it, s.keeper) < 1.8);
}

const FOOT_ACC: Record<Foot, string> = { FL: 'левую переднюю', FR: 'правую переднюю', HL: 'левую заднюю', HR: 'правую заднюю' };

// Достать до слонихи: до головы — хобот дотянется, до бока — стоишь рядом
function reachable(s: State, e: Elephant): boolean {
  return keeperCanTouch(s, e);
}

export function careOptions(c: KCtx, out: ActionOption[]): void {
  const { s, k, h } = c;
  for (const e of s.elephants) {
    if (!reachable(s, e)) continue;
    const acc = nameCase(e.profile.name, 'acc');
    const group = e.profile.name;
    const sig = e.signal?.kind;
    const att = sig === 'attention' ? 70 : 0;
    const x = { elephantId: e.id, group };
    // Лакомство: за выполненное — награда
    const reward = rewardOpen(s, e);
    const treatLabel = reward ? `Наградить ${acc} лакомством` : `Угостить ${acc}`;
    if (k.pouch > 0) out.push(opt({ verb: 'treat', target: e.id }, treatLabel, 55 + (reward ? 90 : 0) + (sig ? 25 : 0), x));
    else out.push(off({ verb: 'treat', target: e.id }, treatLabel, 'Лакомства кончились — пополни в холодильнике на кухне', 20, x));
    const handsFree = !h || h.kind === 'brush' || h.kind === 'shovel' || h.kind === 'rake' || h.kind === 'broom';
    if (handsFree) {
      out.push(opt({ verb: 'pet', target: e.id }, `Погладить ${acc}`, 42 + att, { ...x, timed: true }));
      if (!e.lying && keeperDistanceToHead(s, e) <= KEEPER.elephantReach) out.push(opt({ verb: 'scratch', target: e.id }, `Почесать ${acc} за ухом`, 45 + att, { ...x, timed: true }));
      out.push(opt({ verb: 'hand', target: e.id }, `Протянуть ${nameCase(e.profile.name, 'dat')} руку`, 38 + (e.learned.trust < 0.35 ? 25 : 0) + att * 0.5, { ...x, timed: true }));
    }
    // Щётка, мытьё, шланг
    const dirt = dirtiest(e);
    if (h?.kind === 'brush') {
      const part = e.lying ? 'спину и бока' : 'бока';
      const hayNote = e.body.hay > 0.2 && !e.lying ? ' (сено на спине не достать — попроси лечь)' : '';
      out.push(opt({ verb: 'groom', target: e.id }, `Почистить ${acc} щёткой: ${part}${hayNote}`, 64 + (e.body.hay + e.dust) * 30, { ...x, timed: true }));
    }
    if (h?.kind === 'washKit') {
      const hint = dirt.reachable ? PART_ACC[dirt.part] : `${PART_ACC[dirt.part]} — не достать, попроси лечь`;
      if (h.load < 0.1) out.push(off({ verb: 'soap', target: e.id }, `Намылить ${acc}`, 'В ведре нет воды — набери в мойке', 50, x));
      else if (e.body.soap < 0.3) out.push(opt({ verb: 'soap', target: e.id }, `Намылить ${acc}: ${hint}`, 70 + dirt.v * 40, { ...x, timed: true }));
      else {
        if (dirt.reachable && dirt.v > 0.05) out.push(opt({ verb: 'scrub', target: e.id }, `Потереть ${acc} щёткой: ${PART_ACC[dirt.part]}`, 80 + dirt.v * 40, { ...x, timed: true }));
        out.push(opt({ verb: 'rinse', target: e.id }, `Смыть пену с ${nameCase(e.profile.name, 'gen')}`, dirt.v > 0.1 && dirt.reachable ? 60 : 90, { ...x, timed: true }));
      }
    }
    if (h?.kind === 'hose') {
      if (!hoseUsable(s)) out.push(off({ verb: 'shower', target: e.id }, `Окатить ${acc}`, 'Шланг перекушен', 40, x));
      else {
        out.push(opt({ verb: 'shower', target: e.id }, `Окатить ${acc} водой`, 50 + (e.needs.heat > 45 ? 35 : 0), { ...x, timed: true }));
        if (dirt.v > 0.08 || e.body.soap > 0.2 || e.body.hay > 0.2) out.push(opt({ verb: 'hoseWash', target: e.id }, `Помыть ${acc} из шланга: ${e.body.soap > 0.2 ? 'смыть пену' : PART_ACC[dirt.reachable ? dirt.part : 'side']}`, 72 + dirt.v * 40, { ...x, timed: true }));
      }
    }
    // Еда из рук: овощи, каша
    if (h?.kind === 'ration' && h.load > 0) out.push(opt({ verb: 'handFeed', target: e.id }, `Покормить ${acc} овощами с руки`, 66 + (sig === 'food' ? 50 : 0), { ...x, timed: true }));
    if (h?.kind === 'porridge' && h.load > 0) {
      if (h.owner === e.id) out.push(opt({ verb: 'feedPorridge', target: e.id }, `Покормить ${acc} кашей (${DIETS[e.profile.habits.diet].porridge.product})`, 120, { ...x, timed: true }));
      else out.push(off({ verb: 'feedPorridge', target: e.id }, `Покормить ${acc} кашей`, `Это каша для ${ownerName(s, h.owner)} — у ${nameCase(e.profile.name, 'gen')} свой рацион`, 30, x));
    }
  }
  // Подала ногу: осмотреть и почистить стопу, пока держит
  for (const e of s.elephants) {
    if (e.act.kind !== 'foot') continue;
    const foot = e.act.key.split(':')[1] as Foot;
    if (dist(k, footPos(e, foot)) > 1.6) continue;
    out.push(opt({ verb: 'footCare', target: e.id }, `Осмотреть и почистить ${FOOT_ACC[foot]} стопу ${nameCase(e.profile.name, 'gen')}`, 112, { elephantId: e.id, group: e.profile.name, timed: true }));
  }
  // Ведро с мочой: вылить в сток посреди зала (или в слив в инвентарной)
  if (h?.kind === 'tank' && h.load > 0 && dist(k, DRAIN) <= DRAIN.r + 0.9) {
    out.push(opt({ verb: 'pourDrain', target: 'drain' }, `Вылить ведро в сток (${Math.round(h.load)} л)`, 94, { group: 'Сток', timed: true }));
  }
  // Ведро на полу рядом: забрать
  const tank = tankNear(s);
  if (tank && !h && !c.pushing) {
    const busy = s.elephants.some((e) => e.act.kind === 'urinate' && e.act.phase === 'do' && dist(rearPos(e), tank) < 1.5);
    if (busy) out.push(off({ verb: 'tankTake', target: String(tank.id) }, 'Забрать ведро', 'Подожди, она ещё не закончила', 60, { group: 'Ведро' }));
    else out.push(opt({ verb: 'tankTake', target: String(tank.id) }, tank.load > 0 ? `Забрать ведро (${Math.round(tank.load)} л)` : 'Забрать пустое ведро', tank.load > 0 ? 95 : 40, { group: 'Ведро', timed: true }));
  }
  tubOptions(c, out);
}

// Тазы: среди слонов — поставить на пол и поднять руками; с дорожки — через ограду выгула, забрать крюком
function tubOptions(c: KCtx, out: ActionOption[]): void {
  const { s, h } = c;
  const contact = c.contact ?? keeperContact(s);
  if (h?.kind === 'tub') {
    const tub = tubById(s, h.aux);
    if (tub) {
      const name = ownerName(s, tub.owner);
      const kg = tubKg(tub);
      if (contact && !c.area) {
        const label = `Поставить таз ${nameCase(name, 'gen')} за ограду${kg > 0.5 ? ` (${Math.round(kg)} кг)` : ' (пустой)'}`;
        out.push(opt({ verb: 'placeTub', target: String(tub.id) }, label, kg > 0.5 ? 110 : 20, { group: 'Таз', timed: true }));
      } else if (c.area) {
        // В зале или на выгуле — прямо здесь, на полу
        const label = `Поставить таз ${nameCase(name, 'gen')} здесь${kg > 0.5 ? ` (${Math.round(kg)} кг)` : ' (пустой)'}`;
        out.push(opt({ verb: 'placeTub', target: String(tub.id) }, label, kg > 0.5 ? 100 : 15, { group: 'Таз', timed: true }));
      }
    }
  }
  if (!h && !c.pushing) {
    for (const tub of s.world.tubs) {
      if (tub.where !== 'floor') continue;
      // Рядом — поднять руками; с дорожки — крюком через ограду
      const byHand = c.area !== null && areaAt(tub.x, tub.y) === c.area && dist(tub, s.keeper) <= 1.5;
      if (!byHand) {
        if (!contact || c.area || areaAt(tub.x, tub.y) !== contact.area) continue;
        const cl = closestOnSegment(tub.x, tub.y, contact.line.x - 2, contact.line.y, contact.line.x + 2, contact.line.y);
        if (cl.d > 1.9 || dist(tub, s.keeper) > 2.9) continue;
      }
      const name = ownerName(s, tub.owner);
      const eating = s.elephants.find((e) => e.act.kind === 'eat' && e.act.target?.t === 'tub' && e.act.target.id === tub.id && e.act.phase === 'do');
      const label = byHand
        ? tub.broken
          ? `Собрать осколки таза ${nameCase(name, 'gen')}`
          : `Поднять таз ${nameCase(name, 'gen')}`
        : tub.broken
          ? `Забрать осколки таза ${nameCase(name, 'gen')} крюком`
          : `Забрать таз ${nameCase(name, 'gen')} крюком`;
      if (eating) out.push(off({ verb: 'collectTub', target: String(tub.id) }, label, `${eating.profile.name} ещё ест из него`, 40, { group: 'Таз' }));
      else out.push(opt({ verb: 'collectTub', target: String(tub.id) }, label, tubKg(tub) < 0.5 ? 90 : 35, { group: 'Таз', timed: true }));
    }
  }
}

function elephantBy(s: State, id: string): Elephant | undefined {
  return s.elephants.find((e) => e.id === id.split(':')[0]);
}

export function applyCare(s: State, ref: ActionRef): boolean {
  const k = s.keeper;
  const w = s.world;
  const h = k.held;
  const e = elephantBy(s, ref.target);
  const touch = e ? reachable(s, e) : false;
  switch (ref.verb) {
    case 'treat': {
      if (!e || k.pouch <= 0 || !touch) return true;
      k.pouch--;
      e.needs.hunger = Math.max(0, e.needs.hunger - 2);
      e.needs.boredom = Math.max(0, e.needs.boredom - 4);
      e.needs.stress = Math.max(0, e.needs.stress - 3);
      e.day.treats++;
      s.dailyKeeper.treats++;
      s.dailyKeeper.interactions++;
      // Угощение, пока она напирает, — награда за напор
      if (e.act.kind === 'warn' || e.mem.tension > 0.6) {
        onRewardPushy(e);
        log(s, 'warn', `Ты угостил ${nameCase(e.profile.name, 'acc')}, пока она напирала, — так она учится требовать. Сначала пусть успокоится.`, { key: `pushy:${e.id}`, cooldown: 30, elephantId: e.id });
      }
      const reward = onTreat(s, e);
      acceptContact(s, e);
      if (e.signal?.kind === 'attention') answerSignal(s, e, 'угостили');
      fx('treat', e.x, e.y, e.id);
      if (reward === 'toilet') log(s, 'good', `${e.profile.name} получила награду за туалет — в следующий раз попросится охотнее.`, { elephantId: e.id, silent: true });
      else if (reward) log(s, 'good', `${e.profile.name} получила награду за выполненную просьбу — запомнит.`, { elephantId: e.id, silent: true });
      return true;
    }
    case 'pet': {
      if (!e || !touch) return true;
      const T = e.profile.traits;
      s.dailyKeeper.interactions++;
      if (e.learned.trust > 0.1 + 0.3 * T.nervousness && e.mem.tension < 0.5) {
        onPet(e);
        acceptContact(s, e);
        e.needs.social = Math.max(0, e.needs.social - 8);
        e.needs.stress = Math.max(0, e.needs.stress - 4);
        if (e.signal?.kind === 'attention') answerSignal(s, e, 'погладили');
        fx('heart', e.x, e.y, e.id);
      } else {
        e.needs.stress = Math.min(100, e.needs.stress + 2);
        e.mem.tension = Math.min(1, e.mem.tension + 0.15);
        log(s, 'info', `${e.profile.name} отводит хобот — пока сторонится. Дай ей время, поговори с ней.`, { key: `shy:${e.id}`, cooldown: 20, elephantId: e.id });
      }
      return true;
    }
    case 'scratch': {
      if (!e || !touch) return true;
      const T = e.profile.traits;
      s.dailyKeeper.interactions++;
      if (e.learned.trust > 0.22 + 0.4 * T.nervousness && e.mem.tension < 0.5) {
        onScratch(e);
        acceptContact(s, e);
        e.needs.social = Math.max(0, e.needs.social - 12);
        e.needs.boredom = Math.max(0, e.needs.boredom - 6);
        e.needs.stress = Math.max(0, e.needs.stress - 6);
        if (e.signal?.kind === 'attention') answerSignal(s, e, 'почесали за ухом');
        fx('heart', e.x, e.y, e.id);
      } else {
        e.needs.stress = Math.min(100, e.needs.stress + 3);
        log(s, 'info', `${e.profile.name} отстранилась — пока не доверяет настолько.`, { key: `shy:${e.id}`, cooldown: 20, elephantId: e.id });
      }
      return true;
    }
    case 'hand': {
      if (!e || !touch) return true;
      s.dailyKeeper.interactions++;
      onHand(e);
      acceptContact(s, e);
      e.needs.boredom = Math.max(0, e.needs.boredom - 3 * e.profile.traits.curiosity);
      if (e.signal?.kind === 'attention') answerSignal(s, e, 'протянули руку');
      fx('sniff', e.x, e.y, e.id);
      log(s, 'info', `${e.profile.name} обнюхивает ладонь хоботом.`, { key: `hand:${e.id}`, cooldown: 30, elephantId: e.id, silent: true });
      return true;
    }
    case 'groom': {
      if (!e || !touch || h?.kind !== 'brush') return true;
      const b = e.body;
      const reachBack = e.lying;
      b.hay = Math.max(0, b.hay - BODY.groomHay * (reachBack ? 1 : 0.3));
      e.dust = Math.max(0, e.dust - BODY.groomDust);
      b.side = Math.max(0, b.side - 0.08);
      if (reachBack) b.back = Math.max(0, b.back - 0.08);
      e.day.groomed++;
      onGroom(e);
      acceptContact(s, e);
      e.needs.stress = Math.max(0, e.needs.stress - 4 - 4 * e.profile.traits.sensitivity);
      e.needs.social = Math.max(0, e.needs.social - 5);
      if (e.signal?.kind === 'attention') answerSignal(s, e, 'почистили щёткой');
      fx('brush', e.x, e.y, e.id);
      s.dailyKeeper.interactions++;
      return true;
    }
    case 'soap': {
      if (!e || !touch || h?.kind !== 'washKit' || h.load < 0.1) return true;
      e.body.soap = 1;
      h.load = Math.max(0, h.load - 0.15);
      fx('foam', e.x, e.y, e.id);
      return true;
    }
    case 'scrub': {
      if (!e || !touch || h?.kind !== 'washKit' || e.body.soap < 0.2) return true;
      const d = dirtiest(e);
      if (!d.reachable) return true;
      e.body[d.part] = Math.max(0, e.body[d.part] - BODY.scrub);
      h.load = Math.max(0, h.load - 0.05);
      e.needs.stress = Math.max(0, e.needs.stress - 2);
      fx('brush', e.x, e.y, e.id);
      return true;
    }
    case 'rinse': {
      if (!e || !touch || h?.kind !== 'washKit') return true;
      if (h.load < 0.2) {
        log(s, 'info', 'В ведре мало воды — смыть пену можно из шланга или набери воды в мойке.', { key: 'rinseEmpty', cooldown: 5 });
        return true;
      }
      e.body.soap = 0;
      e.wet = 1;
      for (const p of reachableParts(e)) e.body[p] = Math.max(0, e.body[p] - 0.06);
      h.load = Math.max(0, h.load - 0.3);
      fx('spray', e.x, e.y, e.id);
      return true;
    }
    case 'shower':
    case 'hoseWash': {
      if (!e || h?.kind !== 'hose' || !hoseUsable(s)) return true;
      const T = e.profile.traits;
      const temp = ambientTemp(s, e);
      const leak = 1 - 0.6 * w.hose.damage;
      const joy = 0.6 * T.playfulness + 0.8 * (e.needs.heat / 100) + 0.3 * e.learned.trust - 0.5 * T.nervousness - (temp < 17 ? 0.4 : 0);
      s.dailyKeeper.interactions++;
      // Мокнет в любом случае, даже если ей не нравится
      e.wet = 1;
      e.dust *= 0.2;
      e.needs.heat = Math.max(0, e.needs.heat - 30 * leak);
      if (ref.verb === 'hoseWash') {
        const b = e.body;
        b.soap = 0;
        b.side = Math.max(0, b.side - BODY.hoseSide * leak);
        b.legs = Math.max(0, b.legs - BODY.hoseSide * leak);
        b.head = Math.max(0, b.head - BODY.hoseSide * 0.7 * leak);
        b.back = Math.max(0, b.back - (e.lying ? BODY.hoseBackLying : BODY.hoseBack) * leak);
        b.hay = Math.max(0, b.hay - 0.5 * leak);
      }
      fx('spray', e.x, e.y, e.id);
      if (joy > 0.28) {
        e.needs.boredom = Math.max(0, e.needs.boredom - 8);
        onShowerEnjoyed(e);
        acceptContact(s, e);
        if (e.signal?.kind === 'attention') answerSignal(s, e, 'окатили из шланга');
        log(s, 'good', `${e.profile.name} подставляет бока под струю — довольна.`, { elephantId: e.id, silent: true });
      } else {
        e.needs.stress = Math.min(100, e.needs.stress + 8);
        if (!e.lying) spook(s, e, k, 'уходит от струи воды');
        log(s, 'info', `${e.profile.name} не любит душ${temp < 17 ? ' в прохладу' : ''} и отходит — но вымокла.`, { key: `shower:${e.id}`, cooldown: 30, elephantId: e.id });
      }
      return true;
    }
    case 'pourDrain': {
      if (h?.kind !== 'tank' || h.load <= 0) return true;
      h.load = 0;
      h.aux = 1;
      fx('pour', DRAIN.x, DRAIN.y);
      fx('drain', DRAIN.x, DRAIN.y);
      log(s, 'info', 'Ведро вылито в сток. Помыть его можно в мойке инвентарной.', { silent: true });
      return true;
    }
    case 'footCare': {
      if (!e || e.act.kind !== 'foot') return true;
      const foot = e.act.key.split(':')[1] as Foot;
      if (dist(k, footPos(e, foot)) > 1.8) return true;
      e.body.legs = Math.max(0, e.body.legs - 0.45);
      w.checks.feet[e.id] = true;
      acceptContact(s, e);
      // Подала и держала ногу, пока осматривали, — за это хвалят
      e.mem.call = { until: s.t + 10, x: e.x, y: e.y, arrivedAt: s.t, rewarded: false, why: 'foot' };
      s.dailyKeeper.interactions++;
      fx('brush', footPos(e, foot).x, footPos(e, foot).y);
      log(s, 'good', `Стопа ${nameCase(e.profile.name, 'gen')} чистая, трещин и камешков нет. Похвали — держала ногу.`, { elephantId: e.id, silent: true });
      return true;
    }
    case 'tankTake': {
      const tank = w.items.find((it) => String(it.id) === ref.target && it.kind === 'tank');
      if (!tank || h) return true;
      w.items = w.items.filter((x) => x !== tank);
      k.held = { kind: 'tank', load: tank.load, aux: tank.load > 0 ? 1 : tank.aux, owner: null };
      return true;
    }
    case 'handFeed': {
      if (!e || h?.kind !== 'ration' || h.load <= 0 || !touch) return true;
      h.load--;
      e.needs.hunger = Math.max(0, e.needs.hunger - FOOD.portionHunger);
      e.day.ate += FOOD.portionHunger;
      onTreat(s, e);
      acceptContact(s, e);
      if (e.signal?.kind === 'food' || e.signal?.kind === 'attention') answerSignal(s, e, 'покормили с руки');
      s.dailyKeeper.interactions++;
      if (h.load <= 0) k.held = null;
      fx('munch', e.x, e.y, e.id);
      return true;
    }
    case 'feedPorridge': {
      if (!e || h?.kind !== 'porridge' || h.load <= 0 || h.owner !== e.id || !touch) return true;
      const soaked = s.t - h.aux;
      e.needs.hunger = Math.max(0, e.needs.hunger - h.load * FOOD.porridgeHunger);
      e.day.ate += h.load * FOOD.porridgeHunger;
      (w.checks.porridge[e.id] ??= []).push(Math.round(s.t));
      h.load = 0;
      if (e.signal?.kind === 'food') answerSignal(s, e, 'покормили кашей');
      s.dailyKeeper.interactions++;
      fx('munch', e.x, e.y, e.id);
      log(s, 'good', `${e.profile.name} съела кашу${soaked < PORRIDGE_SOAK_MIN ? ' (не до конца запаренную)' : ''}.`, { elephantId: e.id, silent: true });
      return true;
    }
    case 'placeTub': {
      if (h?.kind !== 'tub') return true;
      if (areaAt(k.x, k.y)) {
        const tub = tubById(s, h.aux);
        if (tub) {
          placeTubAt(s, tub.id, k.x + Math.cos(k.facing) * 0.8, k.y + Math.sin(k.facing) * 0.8);
          w.checks.vegTub[tub.owner] = Math.max(w.checks.vegTub[tub.owner] ?? 0, tubKg(tub));
        }
        k.held = null;
        return true;
      }
      const contact = keeperContact(s);
      if (!contact) return true;
      const spot = contactSpotNear(contact.area, s.keeper.x, s.keeper.y);
      if (!spot) return true;
      const x = spot.line.x;
      const y = spot.line.y - 1.1;
      const tub = tubById(s, h.aux);
      if (tub) {
        placeTubAt(s, tub.id, x, y);
        w.checks.vegTub[tub.owner] = Math.max(w.checks.vegTub[tub.owner] ?? 0, tubKg(tub));
      }
      k.held = null;
      return true;
    }
    case 'collectTub': {
      const tub = tubById(s, Number(ref.target));
      if (!tub || h || tub.where !== 'floor') return true;
      tub.where = 'held';
      k.held = { kind: 'tub', load: 0, aux: tub.id, owner: tub.owner };
      fx('hook', tub.x, tub.y);
      return true;
    }
  }
  return false;
}
