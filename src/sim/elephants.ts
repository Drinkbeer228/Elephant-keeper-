import { BALANCE } from '../data/balance';
import { ELEPHANTS, type ElephantProfile } from '../data/elephants';
import { MAP } from '../data/map';
import { isNight } from './clock';
import { emit, hint } from './events';
import { cellAt, footHarm, isWet, wetAround } from './floor';
import { reachableItems } from './items';
import { chance, randomRange } from './rng';
import type { Elephant, ElephantState, Item, State } from './types';

const E = BALANCE.elephant;

export function profileOf(e: Elephant): ElephantProfile {
  return ELEPHANTS.find((p) => p.id === e.id)!;
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Где слонихи гуляют: весь вольер, подстилка и трава
const BOUNDS = {
  x0: MAP.paddock.x0 + 0.7,
  y0: MAP.paddock.y0 + 0.7,
  x1: MAP.paddock.x1 - 0.7,
  y1: MAP.paddock.y1 - 0.6,
};

function clampInside(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, BOUNDS.x0), BOUNDS.x1),
    y: Math.min(Math.max(y, BOUNDS.y0), BOUNDS.y1),
  };
}

function walkTo(e: Elephant, x: number, y: number, next: ElephantState): void {
  const p = clampInside(x, y);
  e.tx = p.x;
  e.ty = p.y;
  e.state = 'walk';
  e.next = next;
}

function sleepingAt(state: State, e: Elephant): boolean {
  const p = profileOf(e);
  return isNight(state) && state.t >= p.bedtime && state.t < BALANCE.time.nightEnd - 30;
}

export function updateElephants(state: State, dt: number, dtReal: number): void {
  for (const e of state.elephants) updateOne(state, e, dt, dtReal);
}

function updateOne(state: State, e: Elephant, dt: number, dtReal: number): void {
  const p = profileOf(e);
  const night = isNight(state);
  const f = night ? E.nightNeedsFactor : 1;
  const asleep = e.state === 'sleep';

  e.hunger = clamp(e.hunger + E.hungerPerMinute * f * dt);
  e.thirst = clamp(e.thirst + E.thirstPerMinute * p.thirstFactor * f * dt);
  e.bladder = Math.min(100, e.bladder + p.bladderPerMinute * (night ? E.nightBladderFactor : 1) * dt);
  e.bowel += E.bowelPerMinute * 100 * f * dt;
  if (!asleep) {
    const begFactor = 1 + E.begTreatBoredomRate * e.begTreats;
    e.boredom = clamp(e.boredom + E.boredomPerMinute * p.boredomFactor * begFactor * dt);
    if (dist(e, state.player) < 2.2) e.boredom = clamp(e.boredom + E.playerNearBoredom * dt);
  }
  e.footDebt += footHarm(state, e.x, e.y) * (asleep ? BALANCE.footDebt.lyingFactor : 1) * dt;

  if (e.bowel >= 100) {
    e.bowel = 0;
    e.tally.dung++;
    state.dung.push({ id: state.nextItemId++, x: e.x, y: e.y + 0.5, at: state.t });
    hint(state, 'dung', 'Навоз убирают совком. Свежий слонихи обходят, залежавшийся — затопчут.');
  }

  if (e.bladder >= 100 && e.signalStarted === undefined) startSignal(state, e, p);
  trample(state, e);

  switch (e.state) {
    case 'walk': {
      const d = dist(e, { x: e.tx, y: e.ty });
      const step = E.speed * dtReal;
      if (d <= step || d < 0.05) {
        e.x = e.tx;
        e.y = e.ty;
        arrive(state, e, p);
      } else {
        e.x += ((e.tx - e.x) / d) * step;
        e.y += ((e.ty - e.y) / d) * step;
      }
      break;
    }
    case 'signal':
    case 'walkCommand':
      e.timer -= dt;
      if (e.timer <= 0) pee(state, e);
      break;
    case 'eatHay': {
      const eat = Math.min(E.hayFeederPerMinute * dt, state.feederHay);
      state.feederHay -= eat;
      const before = e.hunger;
      e.hunger = clamp(e.hunger - E.hayEatPerMinute * dt);
      e.bowel += (before - e.hunger) * E.eatToBowel;
      e.boredom = clamp(e.boredom - 0.1 * dt);
      e.timer -= dt;
      if (e.timer <= 0 || e.hunger < 5 || state.feederHay <= 0) decide(state, e);
      break;
    }
    case 'drink': {
      const before = e.thirst;
      e.thirst = clamp(e.thirst - E.drinkPerMinute * dt);
      e.bladder = Math.min(100, e.bladder + (before - e.thirst) * E.drinkToBladder);
      state.trough = Math.max(0, state.trough - E.troughPerMinute * dt);
      e.timer -= dt;
      if (e.timer <= 0 || e.thirst < 5 || state.trough <= 0) decide(state, e);
      break;
    }
    case 'eatBasin': {
      e.timer -= dt;
      if (e.timer <= 0) finishBasin(state, e, p);
      break;
    }
    case 'sway':
      e.timer -= dt;
      if (e.timer <= 0 || e.boredom < 50) decide(state, e);
      break;
    case 'sleep':
      e.timer -= dt;
      if (e.timer <= 0) {
        // Проснулась: короткое бодрствование, потом снова решает
        e.state = 'idle';
        e.timer = randomRange(state, 15, 30);
      }
      break;
    default:
      e.timer -= dt;
      if (e.timer <= 0) decide(state, e);
  }
}

// Свежий навоз слонихи обходят. Залежавшийся — затаптывают и разносят следами по подстилке.
// На траве куча так и лежит: затаптывать некуда, её убирают совком
function trample(state: State, e: Elephant): void {
  if (e.state === 'sleep') return;
  const pile = state.dung.find((d) => state.t - d.at > E.dungTolerance && dist(e, d) < 0.75 && cellAt(state, d.x, d.y));
  if (pile) {
    state.dung = state.dung.filter((d) => d !== pile);
    const ref = cellAt(state, pile.x, pile.y);
    if (ref) state.cells[ref.cy][ref.cx] = { kind: 'dung', since: state.t };
    e.dirtyFeet = E.trackCells;
    hint(state, 'trampled', 'Залежавшийся навоз затоптали — теперь по подстилке пойдут следы.');
  }
  const ref = cellAt(state, e.x, e.y);
  if (!ref) return;
  const key = `${ref.cx},${ref.cy}`;
  if (key === e.lastCell) return;
  e.lastCell = key;
  if (e.dirtyFeet > 0 && ref.cell.kind !== 'dung') {
    e.dirtyFeet--;
    if (chance(state, 0.7)) state.cells[ref.cy][ref.cx] = { kind: 'dung', since: state.t };
  }
}

function clamp(v: number): number {
  return Math.min(100, Math.max(0, v));
}

function startSignal(state: State, e: Elephant, p: ElephantProfile): void {
  e.signalStarted = state.t;
  if (p.signal === 'none') {
    pee(state, e);
    return;
  }
  emit(state, { kind: 'info', text: `${p.name} просится`, elephantId: e.id });
  if (p.signal === 'fenceStare') {
    walkTo(e, e.x, MAP.fenceY - 0.6, 'signal');
  } else {
    e.state = 'signal';
    e.timer = p.signalLead;
  }
}

export function bucketUnder(state: State, e: Elephant): Item | undefined {
  return state.items.find((i) => i.kind === 'bucket' && dist(i, e) <= E.bucketRadius);
}

export function pee(state: State, e: Elephant): void {
  const p = profileOf(e);
  const liters = randomRange(state, E.peeLiters[0], E.peeLiters[1]);
  const bucket = bucketUnder(state, e);
  if (bucket && (bucket.liters ?? 0) + liters <= E.bucketCapacity) {
    bucket.liters = (bucket.liters ?? 0) + liters;
    bucket.dirty = true;
    e.tally.inBucket++;
    e.praiseUntil = state.t + E.praiseWindow;
    emit(state, { kind: 'good', text: `${p.name} — в бак!`, elephantId: e.id });
  } else {
    wetAround(state, e.x, e.y, E.peeWetRadius);
    e.tally.missed++;
    emit(state, {
      kind: 'bad',
      text: bucket ? `${p.name}: бак полон — мимо.` : `${p.name} — мимо бака, подстилка мокрая.`,
      why: bucket ? 'fullBucket' : 'missedPee',
      elephantId: e.id,
    });
  }
  e.bladder = 0;
  e.signalStarted = undefined;
  e.state = 'idle';
  e.timer = 2;
}

// Бак подставлен: просится — сходит сразу; не просится — «Давай гуляй», если есть чем
export function walkCommand(state: State, e: Elephant): boolean {
  if (e.state === 'walkCommand') return true;
  if (e.signalStarted !== undefined) {
    e.state = 'walkCommand';
    e.timer = E.walkCommandDelay;
    return true;
  }
  if (e.bladder < E.walkCommandMinBladder || e.state === 'sleep') return false;
  e.state = 'walkCommand';
  e.timer = E.walkCommandDelay;
  e.signalStarted = state.t;
  return true;
}

function arrive(state: State, e: Elephant, p: ElephantProfile): void {
  switch (e.next) {
    case 'signal':
      e.state = 'signal';
      e.timer = p.signalLead;
      break;
    case 'eatHay':
      e.state = 'eatHay';
      e.timer = randomRange(state, 15, 30);
      break;
    case 'drink':
      e.state = 'drink';
      e.timer = 10;
      break;
    case 'eatBasin':
      if (ownBasin(state, e)) {
        e.state = 'eatBasin';
        e.timer = E.basinEatMinutes;
      } else decide(state, e);
      break;
    case 'reach':
      e.state = 'reach';
      e.timer = randomRange(state, 5, 10);
      break;
    case 'sleep':
      lieDown(state, e, p);
      break;
    default:
      e.state = 'idle';
      e.timer = randomRange(state, 3, 8);
  }
}

function ownBasin(state: State, e: Elephant): Item | undefined {
  return state.items.find((i) => i.kind === 'basin' && i.owner === e.id && i.food);
}

function finishBasin(state: State, e: Elephant, p: ElephantProfile): void {
  const basin = ownBasin(state, e);
  if (basin) {
    const leftover = basin.food === 'kasha' && chance(state, p.leftoverChance);
    const before = e.hunger;
    e.hunger = clamp(e.hunger - (leftover ? E.mealHunger / 2 : E.mealHunger));
    e.bowel += (before - e.hunger) * E.eatToBowel;
    e.boredom = clamp(e.boredom - 5);
    if (leftover) emit(state, { kind: 'info', text: `${p.name} оставила полтаза каши. Врачу это важно.`, elephantId: e.id });
    basin.food = null;
    basin.dirty = true;
    basin.eatenAt = state.t;
    basin.droppedAt = state.t;
  }
  decide(state, e);
}

function lieDown(state: State, e: Elephant, p: ElephantProfile): void {
  e.state = 'sleep';
  e.timer = randomRange(state, 90, 130);
  const ref = cellAt(state, e.x, e.y);
  if (ref && isWet(ref.cell) && !e.lyingInWet) {
    e.lyingInWet = true;
    emit(state, { kind: 'bad', text: `${p.name} легла в мокрое.`, why: 'lieInWet', elephantId: e.id });
  }
}

// Сухая солома без навоза в радиусе 3 клеток, ближайшая; занятые соседками места пропускаем
function bedSpot(state: State, e: Elephant): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  state.cells.forEach((row, cy) =>
    row.forEach((c, cx) => {
      if (c.kind !== 'straw') return;
      const x = MAP.bedding.x + cx + 0.5;
      const y = MAP.bedding.y + cy + 0.5;
      const dd = Math.hypot(x - e.x, y - e.y);
      if (dd > 3 || dd >= bestD) return;
      if (state.dung.some((d) => Math.hypot(d.x - x, d.y - y) < 1)) return;
      if (state.elephants.some((o) => o !== e && Math.hypot(o.x - x, o.y - y) < 1.8)) return;
      best = { x, y };
      bestD = dd;
    }),
  );
  return best;
}

export function decide(state: State, e: Elephant): void {
  const p = profileOf(e);
  const basin = ownBasin(state, e);
  if (basin) return walkTo(e, basin.x, basin.y - 0.6, 'eatBasin');
  if (e.thirst > 60 && state.trough > 5) return walkTo(e, MAP.trough.x - 0.4, MAP.trough.y + 0.9, 'drink');
  const hungry = sleepingAt(state, e) ? 70 : 45;
  if (e.hunger > hungry && state.feederHay > 0) return walkTo(e, MAP.feeder.x + 0.3, MAP.feeder.y + 0.9, 'eatHay');
  if (sleepingAt(state, e)) {
    // Ложится на самое сухое место поблизости: сухая подстилка к ночи — забота о ногах
    const spot = bedSpot(state, e);
    if (spot && dist(spot, e) > 0.4) return walkTo(e, spot.x, spot.y, 'sleep');
    return lieDown(state, e, p);
  }
  if (e.boredom >= E.swayBoredom && p.stereotypy) {
    e.state = 'sway';
    e.timer = 20;
    emit(state, { kind: 'bad', text: `${p.name} качается — ей тоскливо.`, why: 'sway', elephantId: e.id });
    return;
  }
  if (e.boredom >= E.reachBoredom) {
    const target = reachableItems(state).sort((a, b) => dist(a, e) - dist(b, e))[0];
    if (target) {
      e.targetItem = target.id;
      return walkTo(e, target.x, target.y - 0.8, 'reach');
    }
  }
  if (chance(state, 0.6)) {
    let x = randomRange(state, BOUNDS.x0, BOUNDS.x1);
    let y = randomRange(state, BOUNDS.y0, BOUNDS.y1);
    for (let i = 0; i < 6 && state.dung.some((d) => Math.hypot(d.x - x, d.y - y) < 1.4); i++) {
      x = randomRange(state, BOUNDS.x0, BOUNDS.x1);
      y = randomRange(state, BOUNDS.y0, BOUNDS.y1);
    }
    walkTo(e, x, y, 'idle');
  } else {
    e.state = 'idle';
    e.timer = randomRange(state, 3, 8);
  }
}

// Лакомство — только за бак: доверие растёт, скуки меньше
export function treat(state: State, e: Elephant): void {
  if (state.t > e.praiseUntil) return;
  e.trust = clamp(e.trust + E.treatTrust);
  e.boredom = clamp(e.boredom + E.treatBoredom);
  e.praiseUntil = -1;
}
