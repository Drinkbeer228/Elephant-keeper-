// Работа со слоном через решётку: угостить и наградить, погладить, почесать, протянуть руку,
// попросить лечь (решает слониха), почистить щёткой, вымыть (мыло → щётка → смыть) или из шланга,
// туалет в бак по команде «Давай гуляй», каша и овощи, тазы, зов своим свистком.

import { BODY, FOOD, KEEPER, LEARN } from '../../data/balance';
import { STATIONS, TANK_PORT, areaAt } from '../../data/facility';
import { DIETS, PORRIDGE_SOAK_MIN } from '../../data/rations';
import { finishActivity, lieOnCommand, respondToCall, spook, startActivity } from '../behavior/act';
import { callCompliance, lieCompliance, toiletCompliance } from '../behavior/engine';
import { onGroom, onHand, onPet, onScratch, onShowerEnjoyed, onTreat } from '../behavior/learning';
import { ambientTemp } from '../behavior/needs';
import { connectedAreas, contactSpotNear, keeperCanTouch, keeperContact, keeperDistanceToHead } from '../behavior/perceive';
import { answerSignal } from '../behavior/signals';
import { fx, log } from '../events';
import { closestOnSegment, dist } from '../geometry';
import { nameCase } from '../herd';
import { random } from '../rng';
import type { ActionOption, ActionRef, BodyPart, Elephant, State } from '../types';
import { tubById, tubKg } from '../world';
import { near, off, opt, ownerName, type KCtx } from './common';
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

function atToiletStance(e: Elephant): boolean {
  return dist(e, STATIONS.trainingWall.slots![1]) <= 1.1;
}

function tankAtPort(s: State) {
  return s.world.items.find((it) => it.kind === 'tank' && dist(it, TANK_PORT) < 0.8);
}

export function careOptions(c: KCtx, out: ActionOption[]): void {
  const { s, k, h } = c;
  for (const e of s.elephants) {
    if (!keeperCanTouch(s, e)) continue;
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
    if (e.act.kind === 'lie') out.push(opt({ verb: 'standUp', target: e.id }, `Попросить ${acc} встать`, 28, x));
    else if (!e.lying) out.push(opt({ verb: 'lieDown', target: e.id }, `Попросить ${acc} лечь`, 36 + (e.body.back > 0.3 || e.body.hay > 0.3 ? 30 : 0), x));
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
    // Туалет в бак: у тренировочной стенки, слониха стоит боком
    if (near(s, 'trainingWall', 1.6) && atToiletStance(e)) {
      const tank = tankAtPort(s);
      if (h?.kind === 'tank' && !tank) {
        if (h.load >= KEEPER.tankLiters - 5) out.push(off({ verb: 'tankPlace', target: e.id }, 'Подставить бак', 'Бак полон — вылей в мойке', 80, x));
        else out.push(opt({ verb: 'tankPlace', target: e.id }, `Подставить бак под ${acc}`, 140, { ...x, timed: true }));
      }
      if (tank) out.push(opt({ verb: 'toiletCmd', target: e.id }, `Скомандовать ${nameCase(e.profile.name, 'dat')}: «Давай гуляй»`, 150, x));
      else if (h?.kind !== 'tank') out.push(off({ verb: 'toiletCmd', target: e.id }, '«Давай гуляй»', 'Сначала подставь бак — он стоит в проходе у стенки', 60, x));
    }
  }
  // Бак у стенки: забрать
  const tank = tankAtPort(s);
  if (tank && near(s, 'trainingWall', 1.6) && !h && !c.pushing) {
    const busy = s.elephants.some((e) => e.act.kind === 'urinate' && e.act.phase === 'do' && atToiletStance(e));
    if (busy) out.push(off({ verb: 'tankTake', target: String(tank.id) }, 'Забрать бак', 'Подожди, она ещё не закончила', 60, { group: 'Бак' }));
    else out.push(opt({ verb: 'tankTake', target: String(tank.id) }, tank.load > 0 ? `Забрать бак (${Math.round(tank.load)} л)` : 'Забрать пустой бак', tank.load > 0 ? 95 : 40, { group: 'Бак', timed: true }));
  }
  tubOptions(c, out);
  callOptions(c, out);
}

// Тазы: поставить за решётку, забрать крюком
function tubOptions(c: KCtx, out: ActionOption[]): void {
  const { s, h } = c;
  const contact = c.contact ?? keeperContact(s);
  if (h?.kind === 'tub') {
    const tub = tubById(s, h.aux);
    if (tub) {
      const name = ownerName(s, tub.owner);
      const kg = tubKg(tub);
      if (contact && !c.area) {
        const label = `Поставить таз ${nameCase(name, 'gen')} за решётку${kg > 0.5 ? ` (${Math.round(kg)} кг)` : ' (пустой)'}`;
        out.push(opt({ verb: 'placeTub', target: String(tub.id) }, label, kg > 0.5 ? 110 : 20, { group: 'Таз', timed: true }));
      } else if (c.area) {
        // В пустом отсеке — поставить прямо здесь, пока слоны снаружи
        const label = `Поставить таз ${nameCase(name, 'gen')} здесь${kg > 0.5 ? ` (${Math.round(kg)} кг)` : ' (пустой)'}`;
        out.push(opt({ verb: 'placeTub', target: String(tub.id) }, label, kg > 0.5 ? 100 : 15, { group: 'Таз', timed: true }));
      }
    }
  }
  if (!h && !c.pushing) {
    for (const tub of s.world.tubs) {
      if (tub.where !== 'floor') continue;
      // В пустом отсеке таз поднимают руками; из прохода — крюком через решётку
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

// Зов: тех, до кого не дотянуться, — к себе; у стенки — к баку
function callOptions(c: KCtx, out: ActionOption[]): void {
  const { s, k } = c;
  const contact = c.contact;
  if (!contact || c.area) return;
  const linked = connectedAreas(s, contact.area);
  const atWall = contact.area === 'stallE' && near(s, 'trainingWall', 1.6);
  const list = s.elephants.filter((e) => linked.includes(areaAt(e.x, e.y) ?? 'paddock') && !keeperCanTouch(s, e)).sort((a, b) => dist(a, k) - dist(b, k));
  for (const e of list) {
    const acc = nameCase(e.profile.name, 'acc');
    const toilet = e.signal?.kind === 'toilet';
    const x = { elephantId: e.id, group: e.profile.name };
    const label = `Позвать ${acc} своим свистком`;
    if (e.lying) out.push(off({ verb: 'call', target: e.id }, label, `${e.profile.name} спит`, 8, x));
    else if (e.act.kind === 'follow') out.push(off({ verb: 'call', target: e.id }, label, `${e.profile.name} уже идёт к тебе`, 8, x));
    else out.push(opt({ verb: 'call', target: e.id }, label, 30 + (e.signal ? 20 : 0), x));
    if (atWall && !e.lying && e.act.kind !== 'follow') out.push(opt({ verb: 'call', target: `${e.id}:toilet` }, `Позвать ${acc} к стенке в туалет`, 34 + (toilet ? 140 : 0), x));
  }
  // Стоит у решётки боком к стенке — тоже можно позвать к баку
  if (atWall) {
    for (const e of s.elephants) {
      if (!keeperCanTouch(s, e) || atToiletStance(e) || e.lying || e.act.kind === 'follow' || !linked.includes(areaAt(e.x, e.y) ?? 'paddock')) continue;
      out.push(opt({ verb: 'call', target: `${e.id}:toilet` }, `Повернуть ${nameCase(e.profile.name, 'acc')} боком к баку`, 30 + (e.signal?.kind === 'toilet' ? 140 : 0), { elephantId: e.id, group: e.profile.name }));
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
  const touch = e ? keeperCanTouch(s, e) : false;
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
      const reward = onTreat(s, e);
      if (e.signal?.kind === 'attention') answerSignal(s, e, 'угостили');
      fx('treat', e.x, e.y, e.id);
      if (reward === 'toilet') log(s, 'good', `${e.profile.name} получила награду за туалет в бак — в следующий раз позовёт охотнее.`, { elephantId: e.id, silent: true });
      else if (reward === 'lie') log(s, 'good', `${e.profile.name} получила награду за то, что легла по просьбе.`, { elephantId: e.id, silent: true });
      else if (reward) log(s, 'good', `${e.profile.name} получила награду за то, что пришла на зов.`, { elephantId: e.id, silent: true });
      return true;
    }
    case 'pet': {
      if (!e || !touch) return true;
      const T = e.profile.traits;
      s.dailyKeeper.interactions++;
      if (e.learned.trust > 0.1 + 0.3 * T.nervousness) {
        onPet(e);
        e.needs.social = Math.max(0, e.needs.social - 8);
        e.needs.stress = Math.max(0, e.needs.stress - 4);
        if (e.signal?.kind === 'attention') answerSignal(s, e, 'погладили');
        fx('heart', e.x, e.y, e.id);
      } else {
        e.needs.stress = Math.min(100, e.needs.stress + 2);
        log(s, 'info', `${e.profile.name} отводит хобот — пока сторонится.`, { key: `shy:${e.id}`, cooldown: 20, elephantId: e.id });
      }
      return true;
    }
    case 'scratch': {
      if (!e || !touch) return true;
      const T = e.profile.traits;
      s.dailyKeeper.interactions++;
      if (e.learned.trust > 0.22 + 0.4 * T.nervousness) {
        onScratch(e);
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
      e.needs.boredom = Math.max(0, e.needs.boredom - 3 * e.profile.traits.curiosity);
      if (e.signal?.kind === 'attention') answerSignal(s, e, 'протянули руку');
      fx('sniff', e.x, e.y, e.id);
      log(s, 'info', `${e.profile.name} обнюхивает ладонь хоботом.`, { key: `hand:${e.id}`, cooldown: 30, elephantId: e.id, silent: true });
      return true;
    }
    case 'lieDown': {
      if (!e || !touch || e.lying) return true;
      const { p, why } = lieCompliance(s, e, k.pouch > 0);
      s.dailyKeeper.interactions++;
      if (random(s) < p) {
        lieOnCommand(s, e, 7 + 6 * e.learned.cooperation);
        log(s, 'good', `${e.profile.name} ложится у решётки — теперь достать до спины.`, { elephantId: e.id, x: e.x, y: e.y, kind: 'lie' });
      } else {
        e.day.refusals++;
        log(s, 'info', `${e.profile.name} не стала ложиться — ${why}.`, { key: `nolie:${e.id}`, cooldown: 3, elephantId: e.id, x: e.x, y: e.y, kind: 'refuse' });
        fx('refuse', e.x, e.y, e.id);
      }
      return true;
    }
    case 'standUp':
      if (e && e.act.kind === 'lie') finishActivity(s, e, 'done');
      return true;
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
        if (e.signal?.kind === 'attention') answerSignal(s, e, 'окатили из шланга');
        log(s, 'good', `${e.profile.name} подставляет бока под струю — довольна.`, { elephantId: e.id, silent: true });
      } else {
        e.needs.stress = Math.min(100, e.needs.stress + 8);
        if (!e.lying) spook(s, e, k, 'уходит от струи воды');
        log(s, 'info', `${e.profile.name} не любит душ${temp < 17 ? ' в прохладу' : ''} и отходит — но вымокла.`, { key: `shower:${e.id}`, cooldown: 30, elephantId: e.id });
      }
      return true;
    }
    case 'tankPlace': {
      if (h?.kind !== 'tank' || tankAtPort(s)) return true;
      w.items.push({ id: s.nextId++, kind: 'tank', x: TANK_PORT.x, y: TANK_PORT.y, load: h.load, aux: h.aux, owner: null });
      k.held = null;
      fx('tankPlace', TANK_PORT.x, TANK_PORT.y);
      return true;
    }
    case 'toiletCmd': {
      if (!e || !tankAtPort(s)) return true;
      const p = toiletCompliance(e, k.pouch > 0);
      s.dailyKeeper.interactions++;
      if (random(s) < p) {
        const hadSignal = e.signal?.kind === 'toilet';
        // Сходит сразу: моча — в бак, если он под ней; окно для награды открыто
        startActivity(s, e, { kind: 'urinate', target: null, score: 2, dur: 1.2, key: 'urinate', signal: null, note: 'мочится в бак по команде', aux: null }, true);
        e.mem.call = { until: s.t + 10, x: e.x, y: e.y, arrivedAt: s.t, rewarded: false, why: 'toilet' };
        if (hadSignal) answerSignal(s, e, 'сходила в бак по команде');
      } else {
        e.day.refusals++;
        const why = e.needs.bladder < 28 ? 'ей сейчас не нужно' : e.profile.habits.signal === 'beg' && k.pouch <= 0 ? 'сначала хочет лакомство' : 'не готова';
        log(s, 'info', `${e.profile.name} не стала — ${why}.`, { key: `notoilet:${e.id}`, cooldown: 3, elephantId: e.id, kind: 'refuse' });
        fx('refuse', e.x, e.y, e.id);
      }
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
    case 'call':
      if (e) callElephant(s, e, ref.target.endsWith(':toilet') ? 'toilet' : 'call');
      return true;
  }
  return false;
}

// Позвать слона к себе (или к стенке в туалет). Пойдёт или нет — решает слон
export function callElephant(s: State, e: Elephant, why: 'call' | 'toilet'): void {
  const k = s.keeper;
  const contact = keeperContact(s);
  if (!contact) return;
  s.dailyKeeper.calls++;
  const toilet = why === 'toilet';
  fx('call', k.x, k.y, e.id);
  const p = callCompliance(e, k.pouch > 0, toilet);
  if (random(s) < p) {
    s.dailyKeeper.callsObeyed++;
    const slot = toilet ? STATIONS.trainingWall.slots![1] : null;
    const spot = slot ?? { x: contact.spot.x, y: contact.spot.y, face: contact.face };
    if (e.signal?.kind === 'attention') answerSignal(s, e, 'кипер позвал');
    else if (e.signal && !(toilet && e.signal.kind === 'toilet')) e.signal = null;
    respondToCall(s, e, spot, spot.face, toilet ? 'идёт к стенке в туалет' : 'идёт на зов кипера', toilet ? 'toilet' : 'call');
  } else {
    e.day.refusals++;
    const why2 = e.lying ? 'спит' : e.act.kind === 'eat' ? 'занята едой' : e.act.kind === 'play' ? 'увлечена игрой' : e.needs.stress > 50 ? 'нервничает' : e.profile.habits.signal === 'beg' && k.pouch <= 0 ? 'ждёт лакомство' : 'не хочет';
    log(s, 'info', `${e.profile.name} не пошла на зов — ${why2}.`, { key: `refuse:${e.id}`, cooldown: 3, elephantId: e.id, x: e.x, y: e.y, kind: 'refuse' });
    fx('refuse', e.x, e.y, e.id);
  }
}
