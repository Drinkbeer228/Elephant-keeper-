// Котёнок со станции — тот же чёрный котёнок-«смокинг» с белой грудкой, белой мордочкой и белыми
// лапками, что живёт на Research Station. Здесь он сам по себе: бродит по слоновнику, дворам и
// подсобкам, обнюхивает вещи, сидит, умывается, охотится на соломинки, спит где уютно, иногда идёт
// рядом с кипером. Испугавшись, удирает туда, куда слону не добраться — на ограду или стену, на
// дерево, в дверь подсобки, между прутьями закрытых ворот, — и, когда всё стихнет, успокаивается
// и возвращается. Он не задача кипера: его не надо кормить и за ним не надо следить.
//
// Слоны замечают котёнка и ведут себя с ним по характеру (behavior/cat.ts); от того, как каждая
// с ним обходится, котёнок учится, кого обходить стороной.
//
// У котёнка свой генератор случайностей: он не сдвигает решения слонов.

import { CONTACT, KITTEN, TIME } from '../data/balance';
import { DOORS, GATES, KITTEN_HOME, KITTEN_PLACES, SOLIDS, TREES, areaAt, zoneAt, type KittenPlace } from '../data/facility';
import { spook, startActivity } from './behavior/act';
import { canMindKitten, catTemper, catTolerance, getUsedToKitten } from './behavior/cat';
import { areaOf, bodyCircles, connectedAreas, gapToBody } from './behavior/perceive';
import { keeperIndoors } from './behavior/urine';
import { fx, log } from './events';
import { angleDiff, dist } from './geometry';
import { nameCase } from './herd';
import { kittenCanStand, kittenRoute, type Obstacle } from './nav';
import { clamp, random, range } from './rng';
import { minuteOfDay } from './time';
import type { CatSeen, Elephant, Kitten, KittenActKind, KittenPerch, State, Vec } from './types';

// ---------------------------------------------------------------------------
// Создание
// ---------------------------------------------------------------------------

export function createKitten(seed: number): Kitten {
  const home = KITTEN_PLACES.find((p) => p.id === KITTEN_HOME)!;
  const k: Kitten = {
    x: home.x,
    y: home.y,
    heading: -Math.PI / 2,
    speed: 0,
    act: { kind: 'nap', start: TIME.start - 120, until: TIME.start + 20, target: null, arrived: true, look: null, spot: home.text },
    path: [],
    perch: { x: home.x, y: home.y, down: { ...home.from }, tree: false },
    up: null,
    pending: null,
    hop: false,
    fear: 0,
    energy: 0.8,
    bold: 0.5,
    friendly: 0.5,
    wary: {},
    rng: (Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0) || 7,
    next: TIME.start + 20,
    blocked: 0,
    timer: 0,
    lastNap: home.id,
  };
  k.bold = Math.round((0.35 + 0.4 * random(k)) * 1000) / 1000;
  k.friendly = Math.round((0.4 + 0.3 * random(k)) * 1000) / 1000;
  return k;
}

// ---------------------------------------------------------------------------
// Вспомогательное
// ---------------------------------------------------------------------------

function wary(k: Kitten, id: string): number {
  return k.wary[id] ?? 0.3;
}

function setWary(k: Kitten, id: string, v: number): void {
  k.wary[id] = Math.round(clamp(v) * 1000) / 1000;
}

// Слониха может до него добраться: оба в зонах слонов, и между ними нет закрытых ворот
function inReach(s: State, e: Elephant, p: Vec): boolean {
  const a = areaAt(p.x, p.y);
  if (!a) return false;
  const her = areaOf(e);
  return a === her || connectedAreas(s, her).includes(a);
}

// Здесь безопасно: наверху или там, куда слоны не заходят
function safeHere(k: Kitten): boolean {
  return !!k.perch || zoneAt(k.x, k.y) === null;
}

// На каком расстоянии от её корпуса ему спокойно: кого побаивается — от той держится дальше
function comfort(k: Kitten, e: Elephant): number {
  return 0.5 + 3 * wary(k, e.id) * (1 - 0.5 * k.bold);
}

// Ближайшая слониха, которой он побаивается и которая может до него добраться
function feared(s: State, k: Kitten, p: Vec, within: number): Elephant | null {
  let best: Elephant | null = null;
  let bestGap = within;
  for (const e of s.elephants) {
    if (wary(k, e.id) < 0.3 || !inReach(s, e, p)) continue;
    const g = gapToBody(e, p);
    if (g < bestGap) {
      bestGap = g;
      best = e;
    }
  }
  return best;
}

// Слоны для обхода: корпус непроходим, вокруг — тем дороже, чем больше он её побаивается
function bodies(s: State, k: Kitten, threat: string | null = null): Obstacle[] {
  const out: Obstacle[] = [];
  for (const e of s.elephants) {
    const soft = 0.35 + 1.4 * wary(k, e.id) + (e.id === threat ? 1.4 : 0);
    for (const c of bodyCircles(e)) out.push({ x: c.x, y: c.y, r: c.r + 0.05, soft });
  }
  return out;
}

function pathLength(from: Vec, path: Vec[]): number {
  let len = 0;
  let a = from;
  for (const b of path) {
    len += dist(a, b);
    a = b;
  }
  return len;
}

function setAct(s: State, k: Kitten, kind: KittenActKind, minutes: number, o: { target?: Vec | null; look?: string | null; spot?: string; arrived?: boolean } = {}): void {
  k.act = { kind, start: s.t, until: s.t + minutes, target: o.target ?? null, arrived: o.arrived ?? !o.target, look: o.look ?? null, spot: o.spot ?? '' };
  k.timer = 0;
}

// Проложить путь; сидит наверху — сначала спрыгнуть
function goTo(s: State, k: Kitten, to: Vec, threat: string | null = null): boolean {
  const start = k.perch ? k.perch.down : k;
  const r = kittenRoute(start, to, bodies(s, k, threat));
  if (!r) return false;
  k.path = k.perch ? [{ ...k.perch.down }, ...r] : r;
  k.hop = !!k.perch;
  k.up = null;
  k.blocked = 0;
  return true;
}

// Не наступить на слона: шаг, который ещё глубже уводит под корпус, запрещён
function bumps(s: State, k: Kitten, x: number, y: number): boolean {
  for (const e of s.elephants) {
    if (Math.abs(e.x - x) > 4 || Math.abs(e.y - y) > 4) continue;
    const g = gapToBody(e, { x, y });
    if (g < 0.1 && g < gapToBody(e, k)) return true;
  }
  return false;
}

// Идти по пути; true — дошёл
function walk(s: State, k: Kitten, speed: number, dtSec: number): boolean {
  let left = speed * dtSec;
  const x0 = k.x;
  const y0 = k.y;
  while (left > 1e-6 && k.path.length) {
    const wp = k.path[0];
    const d = dist(k, wp);
    const stepLen = Math.min(d, left);
    if (stepLen > 1e-6) {
      const nx = k.x + ((wp.x - k.x) / d) * stepLen;
      const ny = k.y + ((wp.y - k.y) / d) * stepLen;
      if (!k.hop && bumps(s, k, nx, ny)) {
        k.blocked += dtSec;
        break;
      }
      k.heading = Math.atan2(ny - k.y, nx - k.x);
      k.x = nx;
      k.y = ny;
      left -= stepLen;
    }
    if (stepLen >= d - 1e-9) {
      k.path.shift();
      if (k.hop) {
        // Прыжок закончен: спрыгнул вниз — или запрыгнул наверх
        k.hop = false;
        if (k.up) {
          k.perch = k.up;
          k.up = null;
        } else k.perch = null;
      }
    }
  }
  const moved = Math.hypot(k.x - x0, k.y - y0);
  k.speed = moved / Math.max(dtSec, 1e-6);
  if (moved > 1e-4) k.blocked = 0;
  return k.path.length === 0;
}

// Запрыгнуть наверх: ограда, стена, дерево, стол, сено
function hopUp(k: Kitten, perch: KittenPerch): void {
  k.path = [{ x: perch.x, y: perch.y }];
  k.hop = true;
  k.up = perch;
}

// ---------------------------------------------------------------------------
// Испуг и бегство
// ---------------------------------------------------------------------------

interface Escape {
  to: Vec; // куда бежать (у ограды, за дверью, у дерева)
  perch: KittenPerch | null; // потом запрыгнуть сюда
  text: string; // для журнала: «вспрыгнул на ограду»
  spot: string; // где теперь: «на ограде»
}

const DOOR_TEXT: Record<string, [string, string]> = {
  kitchenDoor: ['юркнул в дверь кормокухни', 'в кормокухне'],
  equipDoor: ['юркнул в инвентарную', 'в инвентарной'],
  hallWest: ['выскочил в западный двор', 'во дворе'],
  barnDoor: ['выскочил во двор', 'во дворе'],
  paddockDoor: ['выскочил с выгула во двор', 'во дворе'],
};

function escapes(s: State, k: Kitten): Escape[] {
  const out: Escape[] = [];
  const here = zoneAt(k.x, k.y);
  // В дверь подсобки или двора: слону туда не пройти
  if (here) {
    for (const d of DOORS) {
      const c = { x: (d.rect.x0 + d.rect.x1) / 2, y: (d.rect.y0 + d.rect.y1) / 2 };
      const vertical = d.rect.x1 - d.rect.x0 < d.rect.y1 - d.rect.y0;
      for (const sg of [1, -1]) {
        const p = vertical ? { x: c.x + sg * 2, y: c.y } : { x: c.x, y: c.y + sg * 2 };
        const back = vertical ? { x: c.x - sg * 1.2, y: c.y } : { x: c.x, y: c.y - sg * 1.2 };
        if (zoneAt(p.x, p.y) !== null || zoneAt(back.x, back.y) !== here || !kittenCanStand(p.x, p.y)) continue;
        const [text, spot] = DOOR_TEXT[d.id] ?? ['юркнул в дверь', 'за дверью'];
        out.push({ to: p, perch: null, text, spot });
      }
    }
    // Между прутьями закрытых ворот — на ту сторону
    for (const g of GATES) {
      if (s.world.gates[g.id]) continue;
      const mine = areaAt(k.x, k.y);
      if (mine !== g.a && mine !== g.b) continue;
      const other = mine === g.a ? g.b : g.a;
      const far = g.approach[other];
      const near = g.approach[mine];
      if (!far || !near) continue;
      const p = { x: far.x + (far.x - near.x) * 0.3, y: far.y + (far.y - near.y) * 0.3 };
      if (kittenCanStand(p.x, p.y)) out.push({ to: p, perch: null, text: 'проскочил между прутьями ворот', spot: 'за воротами' });
    }
  }
  // На ограду или стену: ближайший участок
  for (const sd of SOLIDS) {
    const r = sd.rect;
    const q = { x: clamp(k.x, r.x0, r.x1), y: clamp(k.y, r.y0, r.y1) };
    const d = dist(k, q);
    if (d > 8 || d < 1e-3) continue;
    const n = { x: (k.x - q.x) / d, y: (k.y - q.y) / d };
    const horizontal = r.x1 - r.x0 >= r.y1 - r.y0;
    const p = horizontal ? { x: clamp(q.x, r.x0 + 0.2, r.x1 - 0.2), y: (r.y0 + r.y1) / 2 } : { x: (r.x0 + r.x1) / 2, y: clamp(q.y, r.y0 + 0.2, r.y1 - 0.2) };
    const a = { x: p.x + n.x * 0.45 + (horizontal ? 0 : 0), y: p.y + n.y * 0.45 };
    if (!kittenCanStand(a.x, a.y)) continue;
    const fence = sd.kind === 'fence';
    out.push({ to: a, perch: { x: p.x, y: p.y, down: a, tree: false }, text: fence ? 'вспрыгнул на ограду' : 'взлетел на стену', spot: fence ? 'на ограде' : 'на стене' });
  }
  // На дерево
  if (here === 'paddock') {
    for (const t of TREES) {
      const d = dist(k, t);
      if (d > 12) continue;
      const ang = Math.atan2(k.y - t.y, k.x - t.x);
      const a = { x: t.x + Math.cos(ang) * (t.trunk + 0.4), y: t.y + Math.sin(ang) * (t.trunk + 0.4) };
      if (!kittenCanStand(a.x, a.y)) continue;
      out.push({ to: a, perch: { x: t.x, y: t.y, down: a, tree: true }, text: 'вскарабкался на дерево', spot: 'на дереве' });
    }
  }
  // В подсобке — повыше: на стол, шкаф, сено
  if (!here) {
    for (const p of KITTEN_PLACES) {
      if (!p.high || p.tree || dist(k, p.from) > 9) continue;
      out.push({ to: { ...p.from }, perch: { x: p.x, y: p.y, down: { ...p.from }, tree: false }, text: 'запрыгнул повыше', spot: p.text });
    }
  }
  return out;
}

// Убежать от угрозы: туда, где безопасно, и не мимо неё
function flee(s: State, k: Kitten, from: Vec, who: string | null): string | null {
  const away = Math.atan2(k.y - from.y, k.x - from.x);
  const threat = who ? s.elephants.find((e) => e.id === who) ?? null : null;
  const options = escapes(s, k)
    .map((x) => ({ x, d: dist(k, x.to) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 9);
  let best: { x: Escape; path: Vec[]; score: number } | null = null;
  for (const { x } of options) {
    const path = kittenRoute(k, x.to, bodies(s, k, who));
    if (!path) continue;
    let score = pathLength(k, path) + (x.perch ? 0 : 0.6);
    // Не бежать на неё: первый отрезок — от угрозы
    const first = path[0];
    const dir = Math.atan2(first.y - k.y, first.x - k.x);
    if (Math.abs(angleDiff(dir, away)) > 1.9) score += 5;
    if (threat) for (const p of path) if (gapToBody(threat, p) < 0.7) score += 6;
    if (!best || score < best.score) best = { x, path, score };
  }
  if (!best) {
    // Некуда — просто прочь от неё, сколько получится
    for (const m of [3, 2, 1.2]) {
      for (const da of [0, 0.6, -0.6, 1.2, -1.2]) {
        const p = { x: k.x + Math.cos(away + da) * m, y: k.y + Math.sin(away + da) * m };
        if (!kittenCanStand(p.x, p.y)) continue;
        const r = kittenRoute(k, p, bodies(s, k, who));
        if (!r) continue;
        k.perch = null;
        k.path = r;
        k.hop = false;
        k.up = null;
        setAct(s, k, 'flee', 3, { target: p, look: who, spot: 'в стороне', arrived: false });
        return 'отскочил в сторону';
      }
    }
    return null;
  }
  k.path = best.path;
  k.hop = false;
  k.up = null;
  setAct(s, k, 'flee', 4, { target: best.x.to, look: who, spot: best.x.spot, arrived: false });
  k.pending = best.x.perch;
  return best.x.text;
}

// Испугался. Сильно — убегает в безопасное место; возвращает, куда (для журнала)
export function scareKitten(s: State, amount: number, from: Vec, who: string | null): string | null {
  const k = s.kitten;
  k.fear = clamp(Math.max(k.fear, amount) + 0.2 * amount);
  if (who) setWary(k, who, wary(k, who) + 0.3 * amount);
  if (k.perch) {
    // Наверху его не достать — только прижался и переждёт
    if (k.act.kind !== 'hide') setAct(s, k, 'hide', 2, { look: who, spot: k.act.spot || 'наверху' });
    return null;
  }
  if (k.fear < KITTEN.fearFlee) return null;
  if (k.act.kind === 'flee' && !k.act.arrived) return null;
  return flee(s, k, from, who);
}

// Кипер погладил
export function petKitten(s: State): void {
  const k = s.kitten;
  k.friendly = Math.round(clamp(k.friendly + 0.05) * 1000) / 1000;
  k.fear = 0;
  fx('purr', k.x, k.y);
  if (k.act.kind === 'nap') {
    log(s, 'info', 'Котёнок мурлычет сквозь сон.', { key: 'kittenPet', cooldown: 20, silent: true });
    return;
  }
  k.path = [];
  setAct(s, k, 'sit', range(k, 0.6, 1.6), { look: 'keeper' });
  log(s, 'info', 'Котёнок мурлычет и трётся о ноги.', { key: 'kittenPet', cooldown: 20, silent: true });
}

// ---------------------------------------------------------------------------
// Шаг
// ---------------------------------------------------------------------------

export function updateKitten(s: State, dt: number, dtSec: number): void {
  const k = s.kitten;
  const napping = k.act.kind === 'nap' && k.act.arrived;
  k.energy = clamp(k.energy + (napping ? KITTEN.energyNap : -KITTEN.energyUse * (k.act.kind === 'flee' || k.act.kind === 'play' ? 2 : 1)) * dt);
  const calm = safeHere(k) ? 2.2 : feared(s, k, k, 4) ? 0.3 : 1;
  k.fear = clamp(k.fear - KITTEN.fearDecay * dt * calm);
  senses(s, k, dtSec);
  elephantsSee(s, k, dt);
  if (s.kitten !== k) return;
  stepAct(s, k, dtSec);
}

// Сам котёнок: под ногами у слона, слон идёт прямо на него, слишком близко к той, кого боится,
// кипер бежит мимо, брызги из шланга
function senses(s: State, k: Kitten, dtSec: number): void {
  if (k.perch || k.hop) return;
  const kp = s.keeper;
  for (const e of s.elephants) {
    if (Math.abs(e.x - k.x) > 6 || Math.abs(e.y - k.y) > 6 || !inReach(s, e, k)) continue;
    const g = gapToBody(e, k);
    if (g < 0.02) {
      // Слон надвинулся на него: отскочить из-под ног
      pushOut(k, e);
      const where = scareKitten(s, 0.75, e, e.id);
      if (where) log(s, 'info', `Котёнок отскочил из-под ног ${nameCase(e.profile.name, 'gen')} и ${where}.`, { key: 'kittenUnder', cooldown: 30, silent: true });
      return;
    }
    if (k.act.kind === 'flee' && !k.act.arrived) continue;
    // Идёт прямо на него — посторониться
    if (!e.lying && e.speed > 0.35 && g < 2.2) {
      const toK = Math.atan2(k.y - e.y, k.x - e.x);
      if (Math.abs(angleDiff(e.heading, toK)) < 0.6 && !(k.act.kind === 'wander' && k.act.look === e.id && !k.act.arrived)) {
        dodge(s, k, e);
        return;
      }
    }
    // Слишком близко к той, кого побаивается
    const c = comfort(k, e);
    if (g < c && k.act.kind !== 'hide') {
      k.fear = clamp(k.fear + dtSec * 0.35 * (1 - g / c));
      if (k.fear >= KITTEN.fearFlee) {
        scareKitten(s, k.fear, e, e.id);
        return;
      }
      if (k.act.kind !== 'wander' || k.act.look !== e.id) stepAway(s, k, e, c);
    }
  }
  if (kp.running && kp.moving && dist(kp, k) < 2.2) scareKitten(s, 0.3, kp, null);
  const v = kp.task?.action.verb;
  if ((v === 'shower' || v === 'hoseWash' || v === 'hoseFloor') && dist(kp, k) < 3.5 && k.act.kind !== 'flee') {
    const where = scareKitten(s, 0.65, kp, null);
    if (where) log(s, 'info', `Котёнок шарахнулся от брызг из шланга и ${where}.`, { key: 'kittenHose', cooldown: 30, silent: true });
  }
}

function pushOut(k: Kitten, e: Elephant): void {
  let best = bodyCircles(e)[0];
  for (const c of bodyCircles(e)) if (Math.hypot(k.x - c.x, k.y - c.y) - c.r < Math.hypot(k.x - best.x, k.y - best.y) - best.r) best = c;
  const base = Math.atan2(k.y - best.y, k.x - best.x);
  for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) {
    const a = base + da;
    const p = { x: best.x + Math.cos(a) * (best.r + 0.2), y: best.y + Math.sin(a) * (best.r + 0.2) };
    if (kittenCanStand(p.x, p.y) && gapToBody(e, p) > 0.05) {
      k.x = p.x;
      k.y = p.y;
      k.path = [];
      return;
    }
  }
}

// Посторониться от идущего слона: шаг-два вбок
function dodge(s: State, k: Kitten, e: Elephant): void {
  const cross = Math.cos(e.heading) * (k.y - e.y) - Math.sin(e.heading) * (k.x - e.x);
  const side = cross >= 0 ? 1 : -1;
  for (const sg of [side, -side]) {
    const dir = e.heading + (sg * Math.PI) / 2;
    for (const m of [1.6, 1.1, 2.3]) {
      const p = { x: k.x + Math.cos(dir) * m, y: k.y + Math.sin(dir) * m };
      if (!kittenCanStand(p.x, p.y) || gapToBody(e, p) < 0.7) continue;
      if (!goTo(s, k, p, e.id)) continue;
      setAct(s, k, 'wander', 1.5, { target: p, look: e.id, arrived: false });
      k.fear = clamp(k.fear + 0.12);
      return;
    }
  }
  scareKitten(s, 0.6, e, e.id);
}

// Отойти от неё на спокойное расстояние
function stepAway(s: State, k: Kitten, e: Elephant, c: number): void {
  const away = Math.atan2(k.y - e.y, k.x - e.x);
  for (const da of [0, 0.5, -0.5, 1, -1]) {
    for (const m of [c + 1.5, c + 0.8]) {
      const p = { x: k.x + Math.cos(away + da) * m, y: k.y + Math.sin(away + da) * m };
      if (!kittenCanStand(p.x, p.y) || gapToBody(e, p) < c) continue;
      if (!goTo(s, k, p, e.id)) continue;
      setAct(s, k, 'wander', 2, { target: p, look: e.id, arrived: false });
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Слоны видят котёнка
// ---------------------------------------------------------------------------

function observe(s: State, e: Elephant, kind: keyof CatSeen): boolean {
  const kp = s.keeper;
  const seen = dist(kp, e) < 16 && !keeperIndoors(s);
  if (seen) e.mem.seen.cat[kind]++;
  return seen;
}

function elephantsSee(s: State, k: Kitten, dt: number): void {
  for (const e of s.elephants) {
    const d = dist(e, k);
    if (d > KITTEN.noticeFront + 1) continue;
    const near = inReach(s, e, k);
    // Спокойное соседство: привыкает
    if (near && d < 6 && !e.lying && k.act.kind !== 'flee') getUsedToKitten(e, dt);
    if (s.t < e.mem.cat.next) continue;
    e.mem.cat.next = s.t + KITTEN.look;
    if (e.lying || !near) continue;
    const gap = gapToBody(e, k);
    const bearing = Math.abs(angleDiff(e.heading, Math.atan2(k.y - e.y, k.x - e.x)));
    const sees = (bearing <= CONTACT.viewHalfAngle && d <= KITTEN.noticeFront) || gap <= KITTEN.noticeBack;
    if (!sees) continue;
    const surprised = (s.t - e.mem.cat.saw > 3 && gap < KITTEN.surprise) || (k.speed > 2 && gap < 1.4);
    e.mem.cat.saw = s.t;
    if (k.perch || k.hop || s.t < e.mem.cat.react || !canMindKitten(e)) continue;
    const T = catTemper(e);
    const fam = e.learned.cat;
    const eating = e.act.kind === 'eat' && e.act.phase === 'do';
    if (surprised && random(k) < T.startle * (1 - 0.8 * fam)) {
      startle(s, k, e);
      return;
    }
    if (gap < catTolerance(e, eating) && random(k) < T.dislike * (1 - 0.6 * fam) * (eating ? 1.5 : 1)) {
      shoo(s, e);
      return;
    }
    if (gap < 3 && k.fear < 0.2 && T.interest > 0.3 && k.act.kind !== 'flee' && random(k) < T.interest * (0.25 + 0.45 * fam) * 0.6) {
      sniff(s, k, e);
      return;
    }
    if (gap < 2.5) {
      e.mem.cat.react = s.t + 4;
      observe(s, e, 'calm');
      setWary(k, e.id, wary(k, e.id) - 0.03);
    }
  }
}

// Вздрогнула: котёнок выскочил внезапно
function startle(s: State, k: Kitten, e: Elephant): void {
  spook(s, e, k, 'вздрогнула: котёнок выскочил прямо под ноги');
  e.mem.cat.react = s.t + KITTEN.reactCooldown;
  e.learned.cat = clamp(e.learned.cat - 0.015);
  const where = scareKitten(s, 0.6, e, e.id);
  const seen = observe(s, e, 'startle');
  fx('catStartle', e.x, e.y, e.id);
  log(s, 'info', `${e.profile.name} вздрогнула и отпрянула: котёнок выскочил прямо у неё под ногами${where ? ` — и ${where}` : ''}.`, {
    key: `catStartle:${e.id}`,
    cooldown: 45,
    elephantId: e.id,
    x: e.x,
    y: e.y,
    kind: 'catStartle',
    silent: !seen,
  });
}

// Не терпит рядом: резкий выпад в его сторону. Котёнок удирает — выпад его не догоняет
function shoo(s: State, e: Elephant): void {
  startActivity(s, e, { kind: 'shoo', target: null, score: 1.3, dur: 3, key: 'shoo', signal: null, note: 'прогоняет котёнка', aux: { x: e.x, y: e.y } }, true);
  e.mem.cat.react = s.t + KITTEN.reactCooldown;
  fx('shoo', e.x, e.y, e.id);
  const where = scareKitten(s, 1, e, e.id) ?? 'отскочил';
  const seen = observe(s, e, 'shoo');
  log(s, 'info', `${e.profile.name} не терпит котёнка рядом: резкий выпад в его сторону — котёнок ${where}.`, {
    key: `catShoo:${e.id}`,
    cooldown: 45,
    elephantId: e.id,
    x: e.x,
    y: e.y,
    kind: 'catShoo',
    silent: !seen,
  });
}

// Любопытно: тянется хоботом. Смелый котёнок сидит смирно, робкий отпрыгивает
function sniff(s: State, k: Kitten, e: Elephant): void {
  startActivity(s, e, { kind: 'sniffCat', target: null, score: 1, dur: 2.5, key: 'sniffCat', signal: null, note: 'тянется хоботом к котёнку', aux: null }, true);
  e.mem.cat.react = s.t + KITTEN.reactCooldown;
  const stays = k.bold * (1 - wary(k, e.id)) > 0.25 + 0.25 * random(k);
  if (stays) {
    k.path = [];
    setAct(s, k, 'sit', 2, { look: e.id });
    setWary(k, e.id, wary(k, e.id) - 0.08);
    e.learned.cat = clamp(e.learned.cat + 0.03);
  } else {
    k.fear = clamp(k.fear + 0.15);
    setWary(k, e.id, wary(k, e.id) + 0.03);
    stepAway(s, k, e, comfort(k, e) + 0.5);
  }
  observe(s, e, 'sniff');
  log(s, 'info', `${e.profile.name} тянется хоботом к котёнку. ${stays ? 'Котёнок сидит смирно и нюхает хобот.' : 'Котёнок отпрыгнул в сторону.'}`, {
    key: `catSniff:${e.id}`,
    cooldown: 40,
    elephantId: e.id,
    silent: true,
  });
}

// ---------------------------------------------------------------------------
// Занятия
// ---------------------------------------------------------------------------

function stepAct(s: State, k: Kitten, dtSec: number): void {
  const a = k.act;
  // Прыжок — сначала долететь
  if (k.hop) {
    walk(s, k, 3, dtSec);
    return;
  }
  switch (a.kind) {
    case 'flee': {
      const done = walk(s, k, KITTEN.run, dtSec);
      if (k.blocked > 0.4) {
        k.blocked = 0;
        flee(s, k, k, a.look);
        return;
      }
      if (!done && s.t < a.until) return;
      const perch = k.pending;
      k.pending = null;
      if (perch) hopUp(k, perch);
      setAct(s, k, 'hide', range(k, 1, 3), { look: a.look, spot: a.spot });
      return;
    }
    case 'hide': {
      k.speed = 0;
      if (s.t < a.until || k.fear > KITTEN.fearCalm || feared(s, k, k.perch ? k.perch.down : k, 3.5)) {
        if (s.t > a.until + 60) k.fear = clamp(k.fear - 0.01);
        return;
      }
      log(s, 'info', `Котёнок успокоился${k.perch ? ' и умывается наверху' : ''} — скоро снова пойдёт гулять.`, { key: 'kittenCalm', cooldown: 20, silent: true });
      setAct(s, k, 'groom', range(k, 0.6, 1.5), { spot: a.spot });
      return;
    }
    case 'follow':
      stepFollow(s, k, dtSec);
      return;
    case 'play':
      stepPlay(s, k, dtSec);
      return;
    default:
      break;
  }
  // Идёт к цели
  if (!a.arrived) {
    const speed = a.kind === 'nap' && k.path.length && pathLength(k, k.path) > 10 ? KITTEN.trot : a.kind === 'wander' && a.look ? KITTEN.trot : KITTEN.walk;
    const done = walk(s, k, speed, dtSec);
    if (k.blocked > 0.8) {
      k.blocked = 0;
      if (!a.target || !goTo(s, k, a.target)) decide(s, k);
      return;
    }
    if (s.t > a.start + 25) {
      decide(s, k);
      return;
    }
    if (!done) return;
    a.arrived = true;
    a.start = s.t;
    if (k.pending) {
      hopUp(k, k.pending);
      k.pending = null;
    }
    arrive(s, k);
    return;
  }
  k.speed = 0;
  // Спит: проснётся, когда выспится, по времени — или если слон подошёл вплотную
  if (a.kind === 'nap') {
    if (!k.perch) {
      const e = s.elephants.find((x) => !x.lying && inReach(s, x, k) && gapToBody(x, k) < 1.4);
      if (e) {
        scareKitten(s, 0.35, e, e.id);
        if (k.act.kind === 'nap') decide(s, k);
        return;
      }
    }
    if (s.t >= a.until) decide(s, k);
    return;
  }
  if (a.kind === 'watch' && a.look) {
    const e = s.elephants.find((x) => x.id === a.look);
    if (e) k.heading = turnTo(k.heading, Math.atan2(e.y - k.y, e.x - k.x), dtSec * 3);
  }
  if (s.t >= a.until) decide(s, k);
}

function turnTo(h: number, target: number, rate: number): number {
  const d = angleDiff(h, target);
  return h + Math.sign(d) * Math.min(Math.abs(d), rate);
}

// Дошёл: что делать на месте
function arrive(s: State, k: Kitten): void {
  const a = k.act;
  switch (a.kind) {
    case 'nap': {
      a.until = s.t + napMinutes(s, k);
      const friend = a.look ? s.elephants.find((e) => e.id === a.look) : null;
      if (friend) {
        const seen = observe(s, friend, 'calm');
        log(s, 'info', `Котёнок устроился спать рядом с ${nameCase(friend.profile.name, 'ins')}.`, { key: 'kittenFriend', cooldown: 720, elephantId: friend.id, kind: 'kitten', silent: !seen });
      } else if (dist(s.keeper, k) < 10) log(s, 'info', `Котёнок свернулся клубком ${a.spot}.`, { key: 'kittenNap', cooldown: 120, silent: true });
      return;
    }
    case 'sniff':
      a.until = s.t + range(k, 0.3, 1.2);
      return;
    case 'watch':
      a.until = s.t + range(k, 1, 4);
      return;
    default:
      // Дошёл, куда шёл: посидеть, оглядеться
      setAct(s, k, 'sit', range(k, 0.2, 0.9), { look: a.look === 'keeper' ? 'keeper' : null });
  }
}

function napMinutes(s: State, k: Kitten): number {
  const m = minuteOfDay(s.t);
  const night = m >= 22 * 60 || m < 5 * 60;
  return night ? range(k, 60, 190) : range(k, 20, 85);
}

// Решить, чем заняться дальше
function decide(s: State, k: Kitten): void {
  k.pending = null;
  const m = minuteOfDay(s.t);
  const night = m >= 22 * 60 || m < 5 * 60;
  const dusk = (m >= 5 * 60 && m < 7.5 * 60) || (m >= 19 * 60 && m < 22 * 60);
  const en = k.energy;
  const litter = litterNear(s, k);
  const invite = keeperInvites(s, k);
  const choices: [KittenActKind, number][] = [
    ['nap', Math.max(0, (1 - en) * 3.2 + (night ? 1.6 : 0) - (en > 0.9 ? 2 : 0))],
    ['wander', (dusk ? 1.8 : 1.1) * en],
    ['sniff', 1.0 * en],
    ['watch', 0.8 * en * (0.4 + k.bold)],
    ['sit', 0.55],
    ['groom', 0.45],
    ['play', litter ? 0.9 * en : 0],
    ['follow', invite ? 1.6 * k.friendly : 0],
  ];
  const total = choices.reduce((acc, [, v]) => acc + v, 0);
  let r = random(k) * total;
  let pick: KittenActKind = 'sit';
  for (const [kind, v] of choices) {
    r -= v;
    if (r <= 0) {
      pick = kind;
      break;
    }
  }
  const ok =
    (pick === 'nap' && startNap(s, k)) ||
    (pick === 'wander' && startWander(s, k)) ||
    (pick === 'sniff' && startSniff(s, k)) ||
    (pick === 'watch' && startWatch(s, k)) ||
    (pick === 'play' && litter !== null && startPlay(s, k, litter)) ||
    (pick === 'follow' && startFollow(s, k));
  if (ok) return;
  k.path = [];
  setAct(s, k, pick === 'groom' ? 'groom' : 'sit', range(k, 0.5, 2.2), { spot: k.perch ? k.act.spot : '' });
}

// Где поспать: уютное, безопасное, недалеко и не рядом с той, кого он боится.
// Бывает — рядом со спящей слонихой, которая к нему привыкла и которой он доверяет
function startNap(s: State, k: Kitten): boolean {
  const m = minuteOfDay(s.t);
  const day = m >= 8 * 60 && m < 18 * 60;
  let best: { score: number; to: Vec; perch: KittenPerch | null; spot: string; place: string; look: string | null } | null = null;
  const consider = (score: number, to: Vec, perch: KittenPerch | null, spot: string, place: string, look: string | null = null) => {
    if (!best || score > best.score) best = { score, to, perch, spot, place, look };
  };
  const night = m >= 21 * 60 || m < 6 * 60;
  for (const p of KITTEN_PLACES as KittenPlace[]) {
    const d = dist(k, p.from);
    const indoor = zoneAt(p.from.x, p.from.y) === null && !p.sun;
    let score = p.nap + (p.sun && day ? 0.35 : 0) + (p.high ? 0.25 : 0) + (zoneAt(p.from.x, p.from.y) === null ? 0.25 : 0) + (night && indoor ? 0.25 : 0) - 0.012 * d + 0.55 * random(k);
    // Любимые места есть, но спит не всегда в одном
    const last = KITTEN_PLACES.find((q) => q.id === k.lastNap);
    if (last && dist(last, p) < 6) score -= 0.4;
    if (feared(s, k, p.from, 4)) score -= 1.5;
    consider(score, { ...p.from }, p.high ? { x: p.x, y: p.y, down: { ...p.from }, tree: !!p.tree } : null, p.text, p.id);
  }
  for (const e of s.elephants) {
    if (!e.lying && e.act.kind !== 'rest') continue;
    if (wary(k, e.id) > 0.12 || e.learned.cat < 0.65 || dist(k, e) > 20) continue;
    const side = e.heading + Math.PI / 2;
    const c = bodyCircles(e)[1];
    const p = { x: c.x + Math.cos(side) * (c.r + 0.5), y: c.y + Math.sin(side) * (c.r + 0.5) };
    if (!kittenCanStand(p.x, p.y)) continue;
    consider(0.95 + 0.3 * random(k), p, null, `рядом с ${nameCase(e.profile.name, 'ins')}`, `el:${e.id}`, e.id);
  }
  const b = best as { score: number; to: Vec; perch: KittenPerch | null; spot: string; place: string; look: string | null } | null;
  if (!b) return false;
  k.lastNap = b.place;
  // Уже на месте
  if (k.perch && b.perch && dist(k.perch, b.perch) < 0.3) {
    k.path = [];
    setAct(s, k, 'nap', 0, { spot: b.spot });
    arrive(s, k);
    return true;
  }
  if (!goTo(s, k, b.to)) return false;
  setAct(s, k, 'nap', 0, { target: b.to, spot: b.spot, look: b.look, arrived: false });
  k.pending = b.perch;
  return true;
}

function freePoint(s: State, k: Kitten, p: Vec): boolean {
  return kittenCanStand(p.x, p.y) && !feared(s, k, p, 3.5) && !s.elephants.some((e) => gapToBody(e, p) < 0.6);
}

// Места, куда стоит сходить: двор, выгул, сенник, кормокухня — котёнок обходит всё хозяйство
const ROAM: Vec[] = [
  { x: 6, y: 25 }, // западный двор
  { x: 38, y: 24 }, // восточный двор
  { x: 15, y: 25 }, // зал, западная половина
  { x: 25, y: 25 }, // зал, восточная половина
  { x: 12, y: 10 }, // выгул
  { x: 24, y: 8 },
  { x: 38, y: 15 },
  { x: 40, y: 35.5 }, // сенник
  { x: 18, y: 35.2 }, // кормокухня
  { x: 29, y: 36 }, // инвентарная
  { x: 7, y: 37.5 }, // дежурка
];

// Побродить: куда-нибудь неподалёку, а иногда — через всё хозяйство
function startWander(s: State, k: Kitten): boolean {
  const base = k.perch ? k.perch.down : k;
  if (random(k) < 0.35) {
    const far = ROAM.filter((p) => dist(p, base) > 8);
    for (let i = 0; i < 3 && far.length; i++) {
      const c = far.splice(Math.floor(random(k) * far.length), 1)[0];
      const p = { x: c.x + range(k, -2, 2), y: c.y + range(k, -1.5, 1.5) };
      if (!freePoint(s, k, p) || !goTo(s, k, p)) continue;
      setAct(s, k, 'wander', 0, { target: p, arrived: false });
      return true;
    }
  }
  for (let i = 0; i < 10; i++) {
    const a = random(k) * Math.PI * 2;
    const m = range(k, 2, 9);
    const p = { x: base.x + Math.cos(a) * m, y: base.y + Math.sin(a) * m };
    if (!freePoint(s, k, p) || !goTo(s, k, p)) continue;
    setAct(s, k, 'wander', 0, { target: p, arrived: false });
    return true;
  }
  return false;
}

// Обнюхать вещь: станцию, ведро, тачку, таз, корм на полу
function startSniff(s: State, k: Kitten): boolean {
  const base = k.perch ? k.perch.down : k;
  const cand: { p: Vec; spot: string }[] = [];
  for (const it of s.world.items) cand.push({ p: { x: it.x, y: it.y }, spot: 'вещь на полу' });
  for (const t of s.world.tubs) if (t.where === 'floor') cand.push({ p: { x: t.x, y: t.y }, spot: 'таз' });
  const b = s.world.barrow;
  if (!b.pushed) cand.push({ p: { x: b.x, y: b.y }, spot: 'тачку' });
  for (const f of s.world.food) if (f.kind === 'produce' || f.kind === 'fruit' || f.kind === 'hay') cand.push({ p: { x: f.x, y: f.y }, spot: 'корм на полу' });
  for (const p of KITTEN_PLACES) cand.push({ p: { ...p.from }, spot: p.text });
  const near = cand
    .map((c) => ({ c, d: dist(base, c.p) }))
    .filter((x) => x.d > 1 && x.d < 14)
    .sort((x, y) => x.d - y.d)
    .slice(0, 8);
  for (let i = 0; i < 4 && near.length; i++) {
    const j = Math.floor(random(k) * near.length);
    const { c } = near.splice(j, 1)[0];
    // Подойти вплотную, но не на саму вещь
    let p = c.p;
    if (!kittenCanStand(p.x, p.y)) {
      const ang = Math.atan2(base.y - p.y, base.x - p.x);
      p = { x: p.x + Math.cos(ang) * 0.5, y: p.y + Math.sin(ang) * 0.5 };
    }
    if (!freePoint(s, k, p) || !goTo(s, k, p)) continue;
    setAct(s, k, 'sniff', 0, { target: p, spot: c.spot, arrived: false });
    return true;
  }
  return false;
}

// Посмотреть на слониху издалека
function startWatch(s: State, k: Kitten): boolean {
  const base = k.perch ? k.perch.down : k;
  const list = s.elephants.filter((e) => dist(e, base) < 25 && !e.lying);
  if (!list.length) return false;
  const e = list[Math.floor(random(k) * list.length)];
  const away = Math.atan2(base.y - e.y, base.x - e.x);
  const d = comfort(k, e) + range(k, 2, 3.5) + 1.3 * e.profile.look.size;
  const p = { x: e.x + Math.cos(away) * d, y: e.y + Math.sin(away) * d };
  if (!freePoint(s, k, p) || !goTo(s, k, p)) return false;
  setAct(s, k, 'watch', 0, { target: p, look: e.id, arrived: false });
  return true;
}

// Сено или солома на полу — поохотиться на соломинки
function litterNear(s: State, k: Kitten): Vec | null {
  const base = k.perch ? k.perch.down : k;
  const L = s.world.cells.litter;
  let best: Vec | null = null;
  let bestD = 6;
  const x0 = Math.max(0, Math.floor(base.x - 6));
  const x1 = Math.min(47, Math.floor(base.x + 6));
  const y0 = Math.max(0, Math.floor(base.y - 6));
  const y1 = Math.min(41, Math.floor(base.y + 6));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (L[y * 48 + x] < 0.2) continue;
      const p = { x: x + 0.5, y: y + 0.5 };
      const d = dist(base, p);
      if (d < bestD && kittenCanStand(p.x, p.y)) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

function startPlay(s: State, k: Kitten, p: Vec): boolean {
  if (!freePoint(s, k, p) || !goTo(s, k, p)) return false;
  setAct(s, k, 'play', range(k, 1, 2.2), { target: p, arrived: false });
  return true;
}

// Охота на соломинки: подкрасться, замереть, прыгнуть — и снова
function stepPlay(s: State, k: Kitten, dtSec: number): void {
  const a = k.act;
  if (!a.arrived) {
    const done = walk(s, k, KITTEN.walk, dtSec);
    if (k.blocked > 0.8 || s.t > a.until + 10) {
      decide(s, k);
      return;
    }
    if (done) {
      a.arrived = true;
      k.timer = 0;
    }
    return;
  }
  if (k.path.length) {
    walk(s, k, KITTEN.pounce, dtSec);
    return;
  }
  k.speed = 0;
  k.timer += dtSec;
  if (s.t >= a.until) {
    setAct(s, k, 'groom', range(k, 0.5, 1.2));
    return;
  }
  if (k.timer < 1.4 + random(k) * 0.02) return;
  k.timer = 0;
  const ang = random(k) * Math.PI * 2;
  const p = { x: k.x + Math.cos(ang) * 0.7, y: k.y + Math.sin(ang) * 0.7 };
  if (kittenCanStand(p.x, p.y) && !bumps(s, k, p.x, p.y)) {
    k.path = [p];
    k.heading = ang;
  }
}

// Кипер рядом и идёт — котёнок может увязаться за ним
function keeperInvites(s: State, k: Kitten): boolean {
  const kp = s.keeper;
  const base = k.perch ? k.perch.down : k;
  return dist(kp, base) < 6 && kp.moving && !kp.running && k.fear < 0.1 && !k.perch?.tree;
}

function startFollow(s: State, k: Kitten): boolean {
  if (k.perch) {
    k.path = [{ ...k.perch.down }];
    k.hop = true;
  } else k.path = [];
  const side = (random(k) < 0.5 ? 1 : -1) * range(k, 2.2, 2.7);
  setAct(s, k, 'follow', range(k, 1.5, 5), { target: { x: side, y: 0 }, look: 'keeper', arrived: true });
  fx('meow', k.x, k.y);
  log(s, 'info', 'Котёнок увязался за тобой.', { key: 'kittenFollow', cooldown: 90, silent: true });
  return true;
}

// Идёт рядом, чуть позади и сбоку — как на станции; кипер встал — садится рядом
function stepFollow(s: State, k: Kitten, dtSec: number): void {
  const kp = s.keeper;
  const a = k.act;
  if (s.t >= a.until || kp.running || k.energy < 0.12) {
    if (kp.running) k.fear = clamp(k.fear + 0.2);
    decide(s, k);
    return;
  }
  // Кипер подошёл к той, кого он побаивается, — дальше не идёт: сядет и посмотрит издали
  const e = feared(s, k, kp, 2.2);
  if (e) {
    k.path = [];
    setAct(s, k, 'watch', range(k, 0.8, 2), { look: e.id });
    return;
  }
  const side = a.target?.x ?? 2.4;
  let goal = { x: kp.x + Math.cos(kp.facing + side) * 0.85, y: kp.y + Math.sin(kp.facing + side) * 0.85 };
  if (!kittenCanStand(goal.x, goal.y)) goal = { x: kp.x - Math.cos(kp.facing) * 0.8, y: kp.y - Math.sin(kp.facing) * 0.8 };
  const d = dist(k, goal);
  if (d < 0.35 && !k.path.length) {
    k.speed = 0;
    k.heading = turnTo(k.heading, kp.facing, dtSec * 4);
    return;
  }
  k.timer += dtSec;
  const last = k.path.length ? k.path[k.path.length - 1] : null;
  if (!last || k.timer > 0.6 || dist(last, goal) > 0.6) {
    k.timer = 0;
    if (kittenCanStand(goal.x, goal.y)) {
      const r = kittenRoute(k, goal, bodies(s, k));
      if (r) k.path = r;
    }
  }
  walk(s, k, d > 3 ? 2.4 : d > 1 ? KITTEN.trot : KITTEN.walk, dtSec);
}

// ---------------------------------------------------------------------------
// Для интерфейса
// ---------------------------------------------------------------------------

export function kittenDoing(s: State): string {
  const k = s.kitten;
  const a = k.act;
  const her = (id: string | null) => s.elephants.find((e) => e.id === id) ?? null;
  switch (a.kind) {
    case 'nap':
      return a.arrived ? `спит ${a.spot}` : 'идёт спать';
    case 'flee':
      return 'удирает';
    case 'hide':
      return k.perch ? `сидит ${a.spot}, переводит дух` : `прячется ${a.spot}`;
    case 'follow':
      return 'идёт рядом с тобой';
    case 'groom':
      return 'умывается';
    case 'watch': {
      const e = her(a.look);
      return e ? `смотрит на ${nameCase(e.profile.name, 'acc')}` : 'смотрит по сторонам';
    }
    case 'sniff':
      return a.arrived ? `обнюхивает ${a.spot}` : 'идёт что-то обнюхать';
    case 'play':
      return 'охотится на соломинки';
    case 'wander':
      return 'гуляет';
    default:
      return a.look === 'keeper' ? 'сидит рядом с тобой' : 'сидит, смотрит по сторонам';
  }
}
