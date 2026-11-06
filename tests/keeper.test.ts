import { describe, expect, it } from 'vitest';
import { availableActions, doorUnlocked, gateOpenBlock, NO_INPUT, runMinutes, step, tubKg, type State } from '../src/sim';
import { DOORS, HOSE_REEL, STATIONS, TROUGH_IDS } from '../src/data/facility';
import { DIETS, PORRIDGE_SOAK_MIN, VEG_KINDS, vegPlan } from '../src/data/rations';
import { shiftDay } from '../src/sim/time';
import { addFood, cellOf, dropFruit, fruitStage, isBeddingCell } from '../src/sim/world';
import { act, actions, at, atStation, game, park, walk } from './helpers';

const door = (id: string) => DOORS.find((d) => d.id === id)!;

function allOut(s: State): void {
  s.elephants.forEach((e, i) => park(e, 12 + i * 7, 10));
}

function opt(s: State, id: string) {
  return availableActions(s).find((a) => a.id === id || a.id.startsWith(id));
}

describe('защищённый контакт: два стойла, проход кипера, ворота', () => {
  it('слоны в стойлах — двери заперты, из прохода не войти; сенник, поилка и пульт работают через решётку', () => {
    const s = game(1);
    expect(doorUnlocked(s, door('doorW'))).toBe(false);
    expect(doorUnlocked(s, door('doorE'))).toBe(false);
    at(s, 15.2, 31.2);
    walk(s, 0, -1, 2);
    expect(s.keeper.y).toBeGreaterThan(30);
    s.keeper.held = { kind: 'hay', load: 0, aux: 0, owner: null };
    atStation(s, 'barnRackW');
    expect(opt(s, 'loadFeeder:barnRackW:hay')?.enabled).toBe(true);
    s.keeper.held = null;
    atStation(s, 'barnWaterW');
    expect(opt(s, 'valve:barnWaterW')?.enabled).toBe(true);
    atStation(s, 'gatePanel');
    expect(actions(s)).toContain('gate:outer');
    expect(actions(s)).toContain('gate:shift');
  });

  it('все на выгуле, ворота на выгул закрыты — оба стойла пусты, можно войти и выйти', () => {
    const s = game(1);
    allOut(s);
    expect(doorUnlocked(s, door('doorW'))).toBe(true);
    expect(doorUnlocked(s, door('doorE'))).toBe(true);
    expect(doorUnlocked(s, door('paddockDoor'))).toBe(false);
    at(s, 15.2, 31.2);
    walk(s, 0, -1, 2);
    expect(s.keeper.y).toBeLessThan(29.5);
    walk(s, 0, 1, 2.5);
    expect(s.keeper.y).toBeGreaterThan(30.2);
  });

  it('слоны в восточном, ворота между стойлами закрыты — западное стойло можно убирать', () => {
    const s = game(2);
    s.elephants.forEach((e, i) => park(e, 23 + i * 2.2, 23 + (i % 2)));
    s.world.gates.shift = false;
    expect(doorUnlocked(s, door('doorW'))).toBe(true);
    expect(doorUnlocked(s, door('doorE'))).toBe(false);
    // Пока кипер внутри, ворота между стойлами не открыть
    at(s, 15.2, 28.6);
    expect(gateOpenBlock(s, 'shift')).toMatch(/внутри/);
    at(s, 15.2, 31.2);
    expect(gateOpenBlock(s, 'shift')).toBeNull();
    s.world.gates.shift = true;
    expect(doorUnlocked(s, door('doorW'))).toBe(false);
  });

  it('пульт: ворота не закрыть на слоне в проёме и не открыть, пока в отсеке тачка', () => {
    const s = game(3);
    atStation(s, 'gatePanel');
    s.world.gates.outer = true;
    park(s.elephants[0], 15.5, 20.2);
    expect(opt(s, 'gate:outer')!.enabled).toBe(false);
    park(s.elephants[0], 13, 24);
    expect(act(s, 'gate:outer')).toBe(true);
    expect(s.world.gates.outer).toBe(false);
    allOut(s);
    s.world.barrow.x = 15;
    s.world.barrow.y = 25;
    expect(opt(s, 'gate:outer')!.enabled).toBe(false);
    expect(opt(s, 'gate:outer')!.reason).toMatch(/тачку/);
  });

  it('у решётки — все действия со слонихой сразу, а не два: панель Q', () => {
    const s = game(4, 1, [{ nervousness: 0.1 }]);
    const e = s.elephants[0];
    e.learned.trust = 0.8;
    park(e, 13, 27.6);
    e.heading = Math.PI / 2;
    at(s, 13, 31);
    const list = availableActions(s).filter((a) => a.elephantId === e.id);
    const verbs = new Set(list.map((a) => a.ref.verb));
    for (const v of ['treat', 'pet', 'scratch', 'hand', 'lieDown']) expect(verbs.has(v as never), v).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(5);
    for (const a of list) expect(a.group).toBe(e.profile.name);
    // Порядок: доступное — выше, при равной важности — ближе
    const all = availableActions(s);
    for (let i = 1; i < all.length; i++) if (all[i - 1].enabled === all[i].enabled) expect(all[i - 1].priority).toBeGreaterThanOrEqual(all[i].priority);
  });

  it('лечь по просьбе решает слониха; спину почистить можно только лежащей', () => {
    const s = game(5, 1, [{ nervousness: 0.05, cooperation: 0.95 }]);
    const e = s.elephants[0];
    e.learned.trust = 0.95;
    e.learned.cooperation = 0.95;
    e.needs.fatigue = 70;
    e.needs.hunger = 0;
    // Стоит у решётки и ждёт (не уходит есть между просьбами)
    park(e, 13, 27.6);
    e.heading = Math.PI / 2;
    at(s, 13, 31);
    s.keeper.held = { kind: 'brush', load: 0, aux: 0, owner: null };
    e.body.back = 0.6;
    const standing = opt(s, `groom:${e.id}`);
    expect(standing?.label).not.toMatch(/спину/);
    let lay = false;
    for (let i = 0; i < 8 && !lay; i++) {
      act(s, `lieDown:${e.id}`);
      runMinutes(s, 1);
      lay = e.lying;
    }
    expect(lay).toBe(true);
    // Лежит у решётки: подойти вплотную — достать до спины
    at(s, 13, 30.4);
    expect(opt(s, `groom:${e.id}`)?.label).toMatch(/спину/);
  });
});

describe('руки и тачка', () => {
  it('с тачкой тюк не взять; оставил тачку — взял тюк, положил в тачку, отвёз, сено в сенник из тачки', () => {
    const s = game(6);
    const b = s.world.barrow;
    atStation(s, 'hayStack');
    b.x = s.keeper.x + 1;
    b.y = s.keeper.y - 0.6;
    expect(act(s, 'pushBarrow')).toBe(true);
    expect(b.pushed).toBe(true);
    const take = opt(s, 'take:hay')!;
    expect(take.enabled).toBe(false);
    expect(take.reason).toMatch(/тачк/);
    expect(act(s, 'parkBarrow')).toBe(true);
    expect(act(s, 'take:hay')).toBe(true);
    expect(s.keeper.held?.kind).toBe('hay');
    expect(opt(s, 'pushBarrow')!.enabled).toBe(false);
    expect(act(s, 'stow:barrow')).toBe(true);
    expect(s.keeper.held).toBeNull();
    expect(b.cargo.map((c) => c.kind)).toEqual(['hay']);
    // Везём к сеннику западного стойла
    expect(act(s, 'pushBarrow')).toBe(true);
    at(s, STATIONS.barnRackW.keeper.x, STATIONS.barnRackW.keeper.y);
    b.x = s.keeper.x + 0.95;
    b.y = s.keeper.y;
    expect(act(s, 'parkBarrow')).toBe(true);
    const before = s.world.feeders.barnRackW.hay;
    expect(act(s, 'loadFeeder:barnRackW:barrowHay')).toBe(true);
    expect(s.world.feeders.barnRackW.hay).toBeGreaterThan(before);
    expect(b.cargo).toHaveLength(0);
  });

  it('в руках одна вещь: с лопатой тюк не взять; инвентарь можно возить в тачке', () => {
    const s = game(7);
    atStation(s, 'toolRack');
    expect(act(s, 'take:shovel')).toBe(true);
    atStation(s, 'hayStack');
    expect(opt(s, 'take:hay')!.enabled).toBe(false);
    const b = s.world.barrow;
    b.x = s.keeper.x + 1;
    b.y = s.keeper.y;
    expect(act(s, 'stow:barrow')).toBe(true);
    expect(b.cargo[0].kind).toBe('shovel');
    expect(act(s, 'take:hay')).toBe(true);
    expect(act(s, 'stow:barrow')).toBe(true);
    expect(b.cargo.map((c) => c.kind)).toEqual(['shovel', 'hay']);
    expect(act(s, 'unstow:0')).toBe(true);
    expect(s.keeper.held?.kind).toBe('shovel');
  });

  it('с тюка в руках по дороге сыплется сено — потом мести', () => {
    const s = game(8);
    atStation(s, 'hayStack');
    act(s, 'take:hay');
    walk(s, -1, 0, 6);
    const litter = s.world.cells.litter.reduce((a, v) => a + v, 0);
    expect(litter).toBeGreaterThan(0);
  });
});

describe('журнал смены', () => {
  it('стол дежурного открывает журнал', () => {
    const s = game(9);
    atStation(s, 'desk');
    expect(actions(s)).toContain('journal:desk');
    const events = step(s, { ...NO_INPUT, actions: ['journal:desk'] });
    expect(events.some((e) => e.kind === 'openJournal')).toBe(true);
  });
});

describe('сено, солома, бамбук', () => {
  it('солома лежит отдельно: не вытесняет сено, едят её неохотно', () => {
    const feed = (hay: number, straw: number) => {
      const s = game(10, 1, [{ foodDrive: 0.8 }]);
      for (const id of ['barnRackW', 'barnRackE', 'paddockFeeder'] as const) s.world.feeders[id] = { hay: 0, straw: 0 };
      s.world.feeders.barnRackW.hay = hay;
      s.world.feeders.barnRackW.straw = straw;
      s.elephants[0].needs.hunger = 80;
      runMinutes(s, 60);
      return s;
    };
    const s = game(10, 1);
    s.world.feeders.barnRackW = { hay: 40, straw: 0 };
    s.keeper.held = { kind: 'straw', load: 0, aux: 0, owner: null };
    atStation(s, 'barnRackW');
    expect(act(s, 'loadFeeder:barnRackW:straw')).toBe(true);
    expect(s.world.feeders.barnRackW.hay).toBe(40);
    expect(s.world.feeders.barnRackW.straw).toBeGreaterThan(0);
    // Только солома — голод уходит хуже, чем на сене
    const onHay = feed(40, 0).elephants[0].needs.hunger;
    const onStraw = feed(0, 40).elephants[0].needs.hunger;
    expect(onStraw).toBeGreaterThan(onHay);
    // Сено и солома вместе: солому выдёргивают под ноги, но не так, чтобы она кончилась раньше сена
    const both = feed(40, 40);
    expect(both.world.feeders.barnRackW.straw).toBeGreaterThan(20);
  });

  it('бамбук — отдельный корм: связку бросают за ограду', () => {
    const s = game(11);
    atStation(s, 'bambooPile');
    expect(act(s, 'take:bamboo')).toBe(true);
    at(s, 35, 21.1);
    expect(act(s, 'tossBrowse')).toBe(true);
    expect(s.world.food.some((f) => f.kind === 'bamboo' && f.zone === 'paddock')).toBe(true);
  });
});

describe('яблони и брожение', () => {
  it('паданцы зреют, бродят и гниют; перебродившие — хмель, у каждой свой', () => {
    const s = game(12, 2, [{ foodDrive: 0.9 }, { foodDrive: 0.9 }]);
    expect(dropFruit(s, 'treeA', 3)).toBeGreaterThan(0);
    const fruit = s.world.food.filter((f) => f.kind === 'fruit');
    expect(fruit.length).toBeGreaterThan(0);
    expect(fruitStage(fruit[0].rot)).toBe('fresh');
    for (const f of fruit) f.rot = 0.6;
    expect(fruitStage(0.6)).toBe('ferment');
    expect(fruitStage(0.95)).toBe('rotten');
    allOut(s);
    s.world.gates.outer = true;
    const [a] = s.elephants;
    park(a, 15, 9.5);
    a.act.forced = false;
    a.needs.hunger = 70;
    a.mem.nextThink = s.t;
    for (const f of fruit) addFood(s, 'fruit', f.x + 0.3, f.y + 0.2, f.amount, 'paddock', 0.6);
    runMinutes(s, 90);
    expect(a.tipsy + s.elephants[1].tipsy).toBeGreaterThan(0);
  });

  it('паданцы на выгуле собирает кипер, когда выгул пуст', () => {
    const s = game(13);
    dropFruit(s, 'treeA', 2);
    const f = s.world.food.find((x) => x.kind === 'fruit')!;
    s.elephants.forEach((e, i) => park(e, 12 + i * 3, 24));
    s.world.gates.outer = false;
    s.keeper.held = { kind: 'shovel', load: 0, aux: 0, owner: null };
    at(s, f.x, f.y + 0.7);
    s.keeper.facing = -Math.PI / 2;
    const o = availableActions(s).find((x) => x.ref.verb === 'shovel' && x.ref.target === `food:${f.id}`);
    expect(o?.enabled).toBe(true);
    act(s, o!.id);
    expect(s.world.food.some((x) => x.id === f.id)).toBe(false);
  });
});

describe('овощи: тазы и нарезка', () => {
  it('нарезка: левая — взять, правая — обрезать хвостик, левая — бросить; без обрезки не бросить', () => {
    const s = game(14);
    const tub = s.world.tubs[0];
    atStation(s, 'tubRack');
    expect(act(s, `takeTub:${tub.id}`)).toBe(true);
    atStation(s, 'prepTable');
    expect(act(s, `prepVeg:${tub.id}`)).toBe(true);
    expect(s.keeper.prep).not.toBeNull();
    // Во время нарезки — только руки
    expect(actions(s).sort()).toEqual(['prepExit:exit', 'prepPick:L', 'prepTrim:R']);
    // Нож без овоща — промах
    act(s, 'prepTrim:R');
    expect(s.keeper.prep!.combo).toBe(0);
    act(s, 'prepPick:L');
    const kind = s.keeper.prep!.hand!;
    expect(kind).toBeTruthy();
    // Бросить необрезанный нельзя
    act(s, 'prepPick:L');
    expect(tub.veg[kind]).toBe(0);
    expect(s.keeper.prep!.hand).toBe(kind);
    act(s, 'prepTrim:R');
    expect(s.keeper.prep!.trimmed).toBe(true);
    act(s, 'prepPick:L');
    expect(tub.veg[kind]).toBe(1);
    expect(s.keeper.prep!.combo).toBe(1);
  });

  it('полный таз — по 20 кг картофеля, моркови и свёклы плюс сезонное (SlonVet)', () => {
    const s = game(15);
    const tub = s.world.tubs[0];
    atStation(s, 'tubRack');
    act(s, `takeTub:${tub.id}`);
    atStation(s, 'prepTable');
    act(s, `prepVeg:${tub.id}`);
    let guard = 0;
    while (s.keeper.prep && guard++ < 1000) {
      const p = s.keeper.prep;
      step(s, { ...NO_INPUT, actions: [p.hand && !p.trimmed ? 'prepTrim:R' : 'prepPick:L'] });
    }
    const plan = vegPlan(s.seed, shiftDay(s.t));
    const planKg = Object.values(plan).reduce((a, b) => a + (b ?? 0), 0);
    expect(plan.potato).toBe(20);
    expect(plan.carrot).toBe(20);
    expect(plan.beet).toBe(20);
    expect(planKg).toBe(72);
    expect(tubKg(tub)).toBe(planKg);
    expect(s.journal.some((j) => j.text.includes('собран'))).toBe(true);
    // Таз — со стола к решётке
    expect(act(s, `takeTub:${tub.id}`)).toBe(true);
    at(s, 13, 31);
    expect(act(s, 'placeTub')).toBe(true);
    expect(tub.where).toBe('floor');
    expect(s.world.checks.vegTub[tub.owner]).toBe(planKg);
  });

  it('проказница двигает пустой таз и может его повредить', () => {
    let damage = 0;
    for (const seed of [16, 17, 18]) {
      const s = game(seed, 1, [{ mischief: 0.97, curiosity: 0.9, playfulness: 0.9 }]);
      const e = s.elephants[0];
      const tub = s.world.tubs[0];
      tub.where = 'floor';
      tub.x = 14;
      tub.y = 25;
      tub.emptySince = s.t - 120;
      e.needs.boredom = 90;
      e.needs.hunger = 5;
      e.needs.thirst = 5;
      runMinutes(s, 180);
      damage += tub.damage + (tub.broken ? 1 : 0);
    }
    expect(damage).toBeGreaterThan(0);
  });
});

describe('поилки', () => {
  it('смена воды по шагам: слить, средство, ёрш, проточная вода, налить — смена засчитана', () => {
    const s = game(19);
    allOut(s);
    const id = 'barnWaterW';
    const t = s.world.troughs[id];
    expect(s.world.checks.troughChanged[id]).toBe(false);
    atStation(s, id);
    expect(act(s, `drainTrough:${id}`)).toBe(true);
    runMinutes(s, 8);
    expect(t.level).toBeLessThanOrEqual(1);
    // Без средства — не начать
    expect(opt(s, `chemTrough:${id}`)!.enabled).toBe(false);
    s.keeper.held = { kind: 'chem', load: 3, aux: 0, owner: null };
    expect(act(s, `chemTrough:${id}`)).toBe(true);
    expect(t.stage).toBe('chem');
    expect(act(s, `scrubTrough:${id}`)).toBe(true);
    expect(t.stage).toBe('scrubbed');
    expect(act(s, `rinseTrough:${id}`)).toBe(true);
    expect(t.stage).toBe('rinsed');
    expect(act(s, `drainTrough:${id}`)).toBe(true);
    expect(act(s, `valve:${id}`)).toBe(true);
    runMinutes(s, 40);
    expect(t.stage).toBe('ok');
    expect(t.chem).toBe(0);
    expect(s.world.checks.troughChanged[id]).toBe(true);
  });

  it('с химией у поилки нельзя работать, пока рядом слон', () => {
    const s = game(20, 1);
    const e = s.elephants[0];
    park(e, 17.4, 27.3);
    e.heading = Math.PI / 2;
    const t = s.world.troughs.barnWaterW;
    t.level = 0;
    t.drain = true;
    t.stage = 'drained';
    s.keeper.held = { kind: 'chem', load: 3, aux: 0, owner: null };
    atStation(s, 'barnWaterW');
    const o = opt(s, 'chemTrough:barnWaterW')!;
    expect(o.enabled).toBe(false);
    expect(o.reason).toMatch(/нельзя/);
    expect(TROUGH_IDS).toContain('barnWaterW');
  });
});

describe('шланг', () => {
  it('шланг тянется от катушки, огибает решётки и не длиннее себя; брошенный лежит, где бросили', () => {
    const s = game(21);
    atStation(s, 'hoseReel');
    expect(act(s, 'takeHose')).toBe(true);
    expect(s.keeper.held?.kind).toBe('hose');
    walk(s, 1, 0.6, 30, true);
    const from = Math.hypot(s.keeper.x - HOSE_REEL.x, s.keeper.y - HOSE_REEL.y);
    expect(from).toBeLessThanOrEqual(s.world.hose.length + 0.1);
    expect(act(s, 'drop:held')).toBe(true);
    expect(s.world.hose.state).toBe('floor');
    const end = { ...s.world.hose.end };
    runMinutes(s, 30);
    expect(s.world.hose.end).toEqual(end);
    at(s, end.x, end.y);
    expect(act(s, 'grabHose')).toBe(true);
    expect(s.keeper.held?.kind).toBe('hose');
  });

  it('шланг у решётки слониха может схватить и пожевать — шланг портится', () => {
    let damage = 0;
    for (const seed of [22, 23, 24]) {
      const s = game(seed, 1, [{ mischief: 0.95, curiosity: 0.9, playfulness: 0.8 }]);
      const e = s.elephants[0];
      e.needs.boredom = 90;
      e.needs.hunger = 5;
      atStation(s, 'hoseReel');
      act(s, 'takeHose');
      // Протянуть по проходу к западному стойлу и бросить у решётки
      at(s, 30.6, 31.2);
      step(s);
      for (const [x, y] of [
        [26, 31.2],
        [20, 30.7],
        [15, 30.4],
      ]) {
        walk(s, x - s.keeper.x, y - s.keeper.y, Math.hypot(x - s.keeper.x, y - s.keeper.y) / 1.3);
      }
      act(s, 'drop:held');
      runMinutes(s, 180);
      damage += s.world.hose.damage;
    }
    expect(damage).toBeGreaterThan(0);
  });
});

describe('уборка', () => {
  it('метла — сено на бетоне в кучу, лопата — кучу в тачку', () => {
    const s = game(25);
    for (const x of [21, 22, 23]) s.world.cells.litter[cellOf(x, 31.5)] = 0.6;
    atStation(s, 'toolRack');
    act(s, 'take:broom');
    at(s, 20.4, 31.5);
    s.keeper.facing = 0;
    expect(act(s, 'sweep')).toBe(true);
    const pile = s.world.items.find((it) => it.kind === 'pile');
    expect(pile).toBeTruthy();
    s.keeper.held = { kind: 'shovel', load: 0, aux: 0, owner: null };
    s.world.barrow.x = pile!.x;
    s.world.barrow.y = pile!.y + 1.4;
    at(s, pile!.x - 0.65, pile!.y);
    s.keeper.facing = 0;
    expect(act(s, `shovel:item:${pile!.id}`)).toBe(true);
    expect(s.keeper.held?.load).toBeGreaterThan(0);
    const load = s.world.barrow.load;
    expect(act(s, 'dumpShovel:barrow')).toBe(true);
    expect(s.world.barrow.load).toBeGreaterThan(load);
  });

  it('лопата — навоз и мокрая подстилка в пустом стойле; солому на мокрое не стелют', () => {
    const s = game(26);
    allOut(s);
    s.world.dung = [{ id: 900, x: 15, y: 24, t: s.t, zone: 'barn' }];
    s.keeper.held = { kind: 'shovel', load: 0, aux: 0, owner: null };
    s.world.barrow.x = 16.5;
    s.world.barrow.y = 25.5;
    at(s, 15, 24.65);
    s.keeper.facing = -Math.PI / 2;
    expect(act(s, 'shovel:dung:900')).toBe(true);
    expect(s.world.dung).toHaveLength(0);
    expect(act(s, 'dumpShovel:barrow')).toBe(true);
    expect(s.world.barrow.load).toBe(1);
    const i = cellOf(13.5, 23.5);
    s.world.cells.wet[i] = 0.9;
    s.keeper.held = { kind: 'straw', load: 0, aux: 0, owner: null };
    at(s, 13.5, 23.5);
    expect(opt(s, 'spreadStraw')!.enabled).toBe(false);
    s.keeper.held = { kind: 'shovel', load: 0, aux: 0, owner: null };
    at(s, 13.5, 24.2);
    s.keeper.facing = -Math.PI / 2;
    expect(act(s, `shovel:cell:${i}`)).toBe(true);
    expect(s.world.cells.wet[i]).toBe(0);
    s.keeper.held = { kind: 'straw', load: 0, aux: 0, owner: null };
    at(s, 13.5, 23.5);
    expect(act(s, 'spreadStraw')).toBe(true);
    expect(s.world.cells.bedding[i]).toBeGreaterThan(0.9);
    expect(isBeddingCell(i)).toBe(true);
  });

  it('швабра — мокрый бетон; мокрую швабру отжать в мойке', () => {
    const s = game(27);
    for (const x of [21, 22]) s.world.cells.wet[cellOf(x, 31.5)] = 0.8;
    s.keeper.held = { kind: 'mop', load: 0, aux: 0, owner: null };
    at(s, 20.6, 31.5);
    s.keeper.facing = 0;
    expect(act(s, 'mop')).toBe(true);
    expect(s.world.cells.wet[cellOf(21, 31.5)]).toBeLessThan(0.8);
    expect(s.keeper.held!.load).toBeGreaterThan(0);
    s.keeper.held!.load = 1;
    expect(opt(s, 'mop')?.enabled ?? false).toBe(false);
    atStation(s, 'washSink');
    expect(act(s, 'wring')).toBe(true);
    expect(s.keeper.held!.load).toBe(0);
  });

  it('опилки — временно: мокрое подсушат, но к сдаче смены их надо вынести', () => {
    const s = game(28);
    allOut(s);
    const i = cellOf(14.5, 24.5);
    s.world.cells.wet[i] = 0.8;
    s.keeper.held = { kind: 'sawdust', load: 6, aux: 0, owner: null };
    at(s, 14.5, 25.2);
    s.keeper.facing = -Math.PI / 2;
    expect(act(s, 'sawdust')).toBe(true);
    expect(s.world.cells.sawdust.reduce((a, v) => a + v, 0)).toBeGreaterThan(0);
    s.t = s.dayStart + 1439.9;
    runMinutes(s, 1);
    const r = s.reports[0];
    expect(r.notes.some((n) => n.includes('пилк'))).toBe(true);
  });
});

describe('мытьё слонихи', () => {
  it('набор для мытья: намылить, потереть щёткой, смыть — грязь сходит', () => {
    const s = game(29, 1, [{ nervousness: 0.1, sensitivity: 0.2 }]);
    const e = s.elephants[0];
    e.learned.trust = 0.8;
    park(e, 13, 27.6);
    e.heading = Math.PI / 2;
    e.body.side = 0.7;
    at(s, 13, 31);
    s.keeper.held = { kind: 'washKit', load: 1, aux: 0, owner: null };
    expect(act(s, `soap:${e.id}`)).toBe(true);
    expect(e.body.soap).toBeGreaterThan(0);
    for (let i = 0; i < 4; i++) act(s, `scrub:${e.id}`);
    expect(act(s, `rinse:${e.id}`)).toBe(true);
    expect(e.body.side).toBeLessThan(0.7);
  });
});

describe('каша по рациону SlonVet', () => {
  it('замешать по рациону, запарить час, покормить хозяйку; чужую кашу не дать', () => {
    const s = game(30, 2);
    const [a, b] = s.elephants;
    atStation(s, 'porridgeStation');
    const diet = DIETS[a.profile.habits.diet];
    const stock = s.world.stock.porridge[diet.id];
    expect(act(s, `mixPorridge:${a.id}`)).toBe(true);
    expect(s.world.stock.porridge[diet.id]).toBeCloseTo(stock - diet.porridge.kg, 5);
    const item = s.world.items.find((it) => it.kind === 'porridge' && it.owner === a.id)!;
    expect(item.load).toBe(diet.porridge.kg);
    const early = opt(s, `takePorridge:${item.id}`)!;
    expect(early.enabled).toBe(false);
    runMinutes(s, PORRIDGE_SOAK_MIN + 1);
    expect(act(s, `takePorridge:${item.id}`)).toBe(true);
    park(a, 13, 27.6);
    a.heading = Math.PI / 2;
    park(b, 14.6, 27.6);
    b.heading = Math.PI / 2;
    at(s, 13.8, 31);
    expect(opt(s, `feedPorridge:${b.id}`)!.enabled).toBe(false);
    expect(act(s, `feedPorridge:${a.id}`)).toBe(true);
    expect(s.world.checks.porridge[a.id]).toHaveLength(1);
    expect(VEG_KINDS).toContain('cabbage');
  });
});
