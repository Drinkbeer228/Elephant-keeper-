import v5save from './fixtures/save-v5.json?raw';
import { describe, expect, it } from 'vitest';
import { availableActions, createState, deserialize, minuteOfDay, runMinutes, SAVE_VERSION, step, validateState, type State } from '../src/sim';
import { KITTEN } from '../src/data/balance';
import { KITTEN_PLACES, ROOMS, YARDS, areaAt, inRect, zoneAt } from '../src/data/facility';
import { catTemper, catTolerance } from '../src/sim/behavior/cat';
import { gapToBody, headPos } from '../src/sim/behavior/perceive';
import { kittenCanStand } from '../src/sim/nav';
import type { Elephant, Kitten, Traits } from '../src/sim/types';
import { act, at } from './helpers';

// Слониха стоит на месте, но живёт: видит котёнка и может отреагировать
function hold(e: Elephant, x: number, y: number, heading: number): void {
  e.x = x;
  e.y = y;
  e.heading = heading;
  e.path = [];
  e.pathGoal = null;
  e.act = { ...e.act, kind: 'idle', phase: 'do', dur: 1e6, doStart: 0, forced: false, target: null, key: 'idle' };
  e.mem.nextThink = 1e9;
}

// Посадить котёнка в точку: сидит, смотрит по сторонам
function sitKitten(s: State, x: number, y: number, minutes = 1e6): Kitten {
  const k = s.kitten;
  k.x = x;
  k.y = y;
  k.path = [];
  k.perch = null;
  k.hop = false;
  k.up = null;
  k.pending = null;
  k.fear = 0;
  k.act = { kind: 'sit', start: s.t, until: s.t + minutes, target: null, arrived: true, look: null, spot: '' };
  return k;
}

function one(seed: number, traits: Partial<Traits>): { s: State; e: Elephant } {
  const s = createState({ seed, herdSize: 1, overrides: [traits], mess: false });
  s.journal = [];
  const e = s.elephants[0];
  s.t = 10 * 60;
  s.dayStart = 8 * 60;
  for (const k of Object.keys(e.needs) as (keyof Elephant['needs'])[]) e.needs[k] = 10;
  return { s, e };
}

// Где котёнок: помещение, двор или отсек слонов
function placeOf(x: number, y: number): string {
  return ROOMS.find((r) => inRect(r.rect, x, y))?.id ?? YARDS.find((r) => inRect(r.rect, x, y))?.id ?? areaAt(x, y) ?? 'other';
}

describe('котёнок со станции', () => {
  it('живёт сам по себе: обходит всё хозяйство, спит в разных местах, не ходит хвостом за кипером и не попадает под слонов', () => {
    const s = createState({ seed: 4, herdSize: 3 });
    const places = new Set<string>();
    const naps = new Set<string>();
    let steps = 0;
    let napping = 0;
    let under = 0;
    let inWall = 0;
    let keeperDist = 0;
    while (s.t < 480 + 1440 * 2) {
      // Вода и сено есть всегда, днём ворота на выгул открыты; кипер у себя в дежурке
      for (const id of ['barnRackW', 'barnRackE', 'paddockFeeder'] as const) s.world.feeders[id].hay = Math.max(s.world.feeders[id].hay, 50);
      for (const id of ['barnWaterW', 'barnWaterE', 'paddockWater'] as const) s.world.troughs[id].level = 90;
      const m = minuteOfDay(s.t);
      const day = m >= 8.5 * 60 && m < 19 * 60;
      if (day !== s.world.gates.outer && !s.elephants.some((e) => Math.abs(e.x - 15.5) < 3.2 && Math.abs(e.y - 20) < 2.2)) s.world.gates.outer = day;
      step(s);
      s.pendingReport = null;
      const k = s.kitten;
      steps++;
      places.add(placeOf(k.x, k.y));
      if (k.act.kind === 'nap' && k.act.arrived) {
        napping++;
        naps.add(k.act.spot);
      }
      if (!k.perch && !k.hop) {
        if (s.elephants.some((e) => gapToBody(e, k) < -0.05)) under++;
        if (!kittenCanStand(k.x, k.y)) inWall++;
      }
      keeperDist += Math.hypot(k.x - s.keeper.x, k.y - s.keeper.y);
    }
    expect(places.size).toBeGreaterThanOrEqual(5);
    expect(naps.size).toBeGreaterThanOrEqual(2);
    // Кошка спит много, но не всё время
    expect(napping / steps).toBeGreaterThan(0.3);
    expect(napping / steps).toBeLessThan(0.8);
    expect(under).toBe(0);
    expect(inWall).toBeLessThan(steps * 0.002);
    expect(keeperDist / steps).toBeGreaterThan(4);
  }, 120000);

  it('у каждой слонихи своё отношение к котёнку — от характера', () => {
    const avg = (traits: Partial<Traits>) => {
      const sum = { startle: 0, dislike: 0, interest: 0 };
      for (let seed = 1; seed <= 8; seed++) {
        const T = catTemper(createState({ seed, herdSize: 1, overrides: [traits] }).elephants[0]);
        sum.startle += T.startle / 8;
        sum.dislike += T.dislike / 8;
        sum.interest += T.interest / 8;
      }
      return sum;
    };
    const calm = avg({ nervousness: 0.1, sensitivity: 0.2, confidence: 0.5, foodDrive: 0.3, cooperation: 0.8, playfulness: 0.3, curiosity: 0.2 });
    const nervous = avg({ nervousness: 0.95, sensitivity: 0.9, confidence: 0.1 });
    const bossy = avg({ confidence: 0.95, foodDrive: 0.9, cooperation: 0.1, playfulness: 0.1 });
    const curious = avg({ curiosity: 0.95, playfulness: 0.9, nervousness: 0.15 });
    expect(nervous.startle).toBeGreaterThan(calm.startle + 0.35);
    expect(bossy.dislike).toBeGreaterThan(calm.dislike + 0.3);
    expect(curious.interest).toBeGreaterThan(calm.interest + 0.3);
  });

  it('властная не терпит котёнка рядом: резкий выпад — котёнок удирает туда, где не достать, и, успокоившись, возвращается', () => {
    const { s, e } = one(51, { confidence: 0.95, foodDrive: 0.9, cooperation: 0.05, playfulness: 0.05, nervousness: 0.1 });
    e.learned.cat = 0.05;
    hold(e, 15, 25, 0);
    const h = headPos(e, 1.6);
    const k = sitKitten(s, h.x + 1.1, h.y);
    k.wary[e.id] = 0.1;
    e.mem.cat.saw = s.t; // видит его давно — не испуг, а неприязнь
    let shoo = false;
    for (let i = 0; i < 30 * 60 * 5 && !shoo; i++) {
      step(s);
      shoo = e.act.kind === 'shoo';
    }
    expect(shoo).toBe(true);
    // Выпад его не догоняет: котёнок всё время на расстоянии и через пару секунд в безопасности
    let closest = 9;
    for (let i = 0; i < 30 * 6; i++) {
      step(s);
      closest = Math.min(closest, gapToBody(e, s.kitten));
    }
    expect(closest).toBeGreaterThan(0.3);
    expect(!!s.kitten.perch || zoneAt(s.kitten.x, s.kitten.y) === null).toBe(true);
    expect(s.journal.some((j) => /выпад/.test(j.text))).toBe(true);
    // Испуг проходит: успокаивается и снова занят своим
    let calm = false;
    for (let m = 0; m < 120 && !calm; m += 1) {
      runMinutes(s, 1);
      calm = s.kitten.fear < KITTEN.fearCalm && s.kitten.act.kind !== 'flee' && s.kitten.act.kind !== 'hide';
    }
    expect(calm).toBe(true);
    expect(s.kitten.wary[e.id]).toBeGreaterThan(0.3); // и запомнил, что к ней лучше не подходить
  });

  it('любопытная тянется к котёнку хоботом, спокойная его почти не замечает', () => {
    const curious = one(52, { curiosity: 0.95, playfulness: 0.95, nervousness: 0.05, confidence: 0.3, foodDrive: 0.2, cooperation: 0.9 });
    curious.e.learned.cat = 0.8;
    hold(curious.e, 15, 25, 0);
    const h1 = headPos(curious.e, 1.6);
    sitKitten(curious.s, h1.x + 1.4, h1.y).wary[curious.e.id] = 0.05;
    curious.s.kitten.bold = 0.7;
    curious.e.mem.cat.saw = curious.s.t;
    let sniffed = false;
    for (let i = 0; i < 30 * 60 * 10 && !sniffed; i++) {
      step(curious.s);
      sniffed = curious.e.act.kind === 'sniffCat';
    }
    expect(sniffed).toBe(true);

    const calm = one(53, { nervousness: 0.05, sensitivity: 0.1, confidence: 0.35, foodDrive: 0.2, cooperation: 0.95, playfulness: 0.1, curiosity: 0.05 });
    calm.e.learned.cat = 0.6;
    hold(calm.e, 15, 25, 0);
    const h2 = headPos(calm.e, 1.6);
    sitKitten(calm.s, h2.x + 1.6, h2.y).wary[calm.e.id] = 0.1;
    calm.e.mem.cat.saw = calm.s.t;
    at(calm.s, 15, 30.5); // кипер в зале и видит, как она себя ведёт
    let reacted = false;
    for (let i = 0; i < 30 * 60 * 10; i++) {
      step(calm.s);
      if (['shoo', 'sniffCat', 'avoid'].includes(calm.e.act.kind)) reacted = true;
    }
    expect(reacted).toBe(false);
    expect(calm.e.mem.seen.cat.calm).toBeGreaterThan(0);
  });

  it('привыкание: спокойное соседство день за днём — и подпускает ближе, пугается реже', () => {
    const { s, e } = one(54, { confidence: 0.7, foodDrive: 0.6, cooperation: 0.3, nervousness: 0.5 });
    e.learned.cat = 0.1;
    hold(e, 15, 25, 0);
    const tol0 = catTolerance(e, false);
    sitKitten(s, 15, 30.6).wary[e.id] = 0.6; // сидит в отдалении, у сенника
    runMinutes(s, 180);
    expect(e.learned.cat).toBeGreaterThan(0.25);
    expect(catTolerance(e, false)).toBeLessThan(tol0);
  });

  it('котёнка можно погладить — по желанию; заботиться о нём не нужно', () => {
    const s = createState({ seed: 55, herdSize: 2 });
    const k = s.kitten;
    // С утра он спит на столе в дежурке, рядом с кипером
    expect(k.act.kind).toBe('nap');
    at(s, 4.6, 35.9);
    const pet = availableActions(s).find((a) => a.id === 'petKitten:kitten');
    expect(pet).toBeDefined();
    // Важнее работы со слонами он не становится
    expect(pet!.priority).toBeLessThan(20);
    const f0 = k.friendly;
    expect(act(s, 'petKitten:kitten')).toBe(true);
    expect(s.kitten.friendly).toBeGreaterThan(f0);
    // Итог смены о котёнке не спрашивает: в нём нет ничего про котёнка
    runMinutes(s, 1440);
    expect(JSON.stringify(s.reports)).not.toMatch(/котён/i);
  }, 60000);

  it('места котёнка: сверху — на что-то, снизу — откуда запрыгнуть', () => {
    for (const p of KITTEN_PLACES) {
      expect(kittenCanStand(p.from.x, p.from.y), `${p.id}: откуда запрыгнуть`).toBe(true);
      if (!p.high) expect(kittenCanStand(p.x, p.y), p.id).toBe(true);
    }
  });

  it('сейв v5 (ночь, ведро под струёй) переносится: появляется котёнок, у слонов — привычка к нему', () => {
    const old = JSON.parse(v5save) as { version: number; state: { t: number; elephants: { learned: { trust: number }; mem: { stream: unknown } }[] } };
    expect(old.version).toBe(5);
    const res = deserialize(v5save);
    if (!res.ok) throw new Error(res.detail);
    expect(res.migrated).toBe(true);
    const s = res.state;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.t).toBe(old.state.t);
    expect(s.kitten.act.kind).toBe('nap');
    s.elephants.forEach((e, i) => {
      expect(e.learned.trust).toBe(old.state.elephants[i].learned.trust);
      expect(e.learned.cat).toBeGreaterThan(0);
      expect(e.learned.cat).toBeLessThan(1);
      expect(e.mem.seen.cat).toEqual({ startle: 0, shoo: 0, sniff: 0, calm: 0 });
      expect(e.mem.stream).toEqual(old.state.elephants[i].mem.stream);
    });
    expect(validateState(s)).toBeNull();
    runMinutes(s, 90);
    expect(validateState(s)).toBeNull();
  });
});
