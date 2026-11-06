import { describe, expect, it } from 'vitest';
import { availableActions, doorUnlocked, runMinutes, step } from '../src/sim';
import { DOORS, STATIONS, TOOL_SLOTS } from '../src/data/facility';
import { cellOf, isBeddingCell } from '../src/sim/world';
import { act, actions, at, atStation, game, park, walk } from './helpers';

const barnDoor = DOORS.find((d) => d.id === 'barnDoor')!;
const paddockDoor = DOORS.find((d) => d.id === 'paddockDoor')!;

function allOut(s: ReturnType<typeof game>): void {
  s.elephants.forEach((e, i) => park(e, 14 + i * 6, 10));
}

describe('защищённый контакт', () => {
  it('в слоновник со слонами не войти: дверь заперта, кипер остаётся снаружи', () => {
    const s = game(1);
    expect(doorUnlocked(s, barnDoor)).toBe(false);
    at(s, 31.2, 27.6);
    walk(s, -1, 0, 2);
    expect(s.keeper.x).toBeGreaterThan(30);
  });

  it('когда все слоны на выгуле и ворота закрыты — дверь открыта, можно войти', () => {
    const s = game(1);
    allOut(s);
    expect(doorUnlocked(s, barnDoor)).toBe(true);
    expect(doorUnlocked(s, paddockDoor)).toBe(false);
    at(s, 31.2, 27.6);
    walk(s, -1, 0, 1.5);
    expect(s.keeper.x).toBeLessThan(29.5);
  });

  it('открытые ворота соединяют зоны: пока слоны где-либо, входа нет никуда', () => {
    const s = game(1);
    allOut(s);
    s.world.gateOpen = true;
    expect(doorUnlocked(s, barnDoor)).toBe(false);
    expect(doorUnlocked(s, paddockDoor)).toBe(false);
  });

  it('ворота не закрываются на слоне и не открываются, пока в вольере тачка', () => {
    const s = game(1);
    atStation(s, 'gateControl');
    s.world.gateOpen = true;
    park(s.elephants[0], 20, 20.3);
    const close = availableActions(s).find((a) => a.ref.verb === 'gate')!;
    expect(close.enabled).toBe(false);
    park(s.elephants[0], 14, 24);
    expect(act(s, 'gate:gate')).toBe(true);
    expect(s.world.gateOpen).toBe(false);
    s.world.barrow.x = 22;
    s.world.barrow.y = 25;
    const open = availableActions(s).find((a) => a.ref.verb === 'gate')!;
    expect(open.enabled).toBe(false);
  });
});

describe('работа кипера', () => {
  it('сено: тюк со склада — в кормушку слоновника', () => {
    const s = game(2);
    const stock = s.world.stock.hay;
    atStation(s, 'hayStack');
    expect(act(s, 'takeHay')).toBe(true);
    expect(s.world.stock.hay).toBe(stock - 1);
    expect(s.keeper.held?.kind).toBe('hay');
    atStation(s, 'barnRack');
    const before = s.world.hay.barnRack;
    expect(act(s, 'loadHay:barnRack')).toBe(true);
    expect(s.world.hay.barnRack).toBeCloseTo(before + 35, 5);
    expect(s.keeper.held).toBeNull();
  });

  it('кран поилки: вода прибывает, а забытый открытым — переливается на пол', () => {
    const s = game(3);
    s.elephants.forEach((e) => park(e, 22, 22));
    atStation(s, 'barnWater');
    s.world.water.barnWater.level = 50;
    expect(act(s, 'valve:barnWater')).toBe(true);
    expect(s.world.water.barnWater.valve).toBe(true);
    runMinutes(s, 40);
    expect(s.world.water.barnWater.level).toBe(100);
    const wet = [cellOf(12.5, 24), cellOf(11.5, 24)].reduce((a, i) => a + s.world.cells.wet[i], 0);
    expect(wet).toBeGreaterThan(0.2);
    expect(s.journal.some((j) => j.text.includes('переливается'))).toBe(true);
  });

  it('уборка: вилы — навоз в тачку, грабли — мокрую подстилку, солома — свежая подстилка', () => {
    const s = game(4, 3);
    allOut(s);
    s.world.dung = [{ id: 500, x: 15, y: 24, t: s.t, zone: 'barn' }];
    // Вилы со стойки
    at(s, 26.6, 38.5);
    expect(act(s, 'takeTool:fork')).toBe(true);
    expect(s.world.tools.fork).toBe(false);
    // Тачка рядом с кучей
    s.world.barrow.x = 16.5;
    s.world.barrow.y = 25;
    at(s, 15.6, 24.4);
    expect(act(s, 'fork:dung:500')).toBe(true);
    expect(s.world.dung).toHaveLength(0);
    expect(s.world.barrow.load).toBe(1);
    // Мокрая подстилка
    const i = cellOf(19.5, 23.5);
    s.world.cells.wet[i] = 0.9;
    s.keeper.held = { kind: 'rake', load: 0 };
    at(s, 19.5, 24.2);
    s.keeper.facing = -Math.PI / 2;
    expect(act(s, 'rake:')).toBe(true);
    expect(s.world.cells.wet[i]).toBe(0);
    expect(s.world.cells.bedding[i]).toBe(0);
    expect(s.world.barrow.load).toBe(2);
    // Свежая солома на вычищенное
    s.keeper.held = { kind: 'straw' };
    at(s, 19.5, 23.5);
    expect(act(s, 'spreadStraw')).toBe(true);
    expect(s.world.cells.bedding[i]).toBe(1);
    expect(isBeddingCell(i)).toBe(true);
  });

  it('тачка и контейнер: отвезти и высыпать', () => {
    const s = game(5);
    s.world.barrow.load = 7;
    const b = s.world.barrow;
    at(s, b.x - 1.1, b.y);
    expect(act(s, 'pushBarrow')).toBe(true);
    expect(s.world.barrow.pushed).toBe(true);
    at(s, STATIONS.container.keeper.x, STATIONS.container.keeper.y);
    const before = s.world.container;
    expect(act(s, 'dumpBarrow')).toBe(true);
    expect(s.world.container).toBe(before + 7);
    expect(s.world.barrow.load).toBe(0);
  });

  it('инвентарь возвращается на стойку', () => {
    const s = game(6);
    at(s, 26.6, 38.5);
    act(s, 'takeTool:rake');
    expect(s.keeper.held?.kind).toBe('rake');
    expect(actions(s)).toContain('returnTool:rake');
    act(s, 'returnTool:rake');
    expect(s.world.tools.rake).toBe(true);
    expect(TOOL_SLOTS.rake.x).toBeGreaterThan(0);
  });

  it('овощи: нарезать, высыпать в кормушку; слоны едят, разборчивые оставляют остатки', () => {
    const s = game(7, 2, [{ foodDrive: 0.1 }, { foodDrive: 0.1 }]);
    atStation(s, 'prepTable');
    const produce = s.world.stock.produce;
    expect(act(s, 'prepRation')).toBe(true);
    expect(s.world.stock.produce).toBe(produce - 1);
    expect(s.keeper.held?.kind).toBe('ration');
    atStation(s, 'barnTrough');
    expect(act(s, 'fillTrough')).toBe(true);
    expect(s.world.trough.portions).toBeGreaterThan(2);
    s.elephants.forEach((e) => (e.needs.hunger = 30));
    runMinutes(s, 120);
    expect(s.elephants.some((e) => e.day.ate > 10)).toBe(true);
  });

  it('разбросанный корм — занятие: слоны находят куски', () => {
    const s = game(8, 3);
    s.world.gateOpen = false;
    s.elephants.forEach((e, i) => park(e, 15 + i * 8, 9));
    s.elephants.forEach((e) => (e.act.forced = false));
    s.elephants.forEach((e) => (e.act.dur = 0));
    s.keeper.held = { kind: 'ration', portions: 3 };
    at(s, 36, 21);
    expect(act(s, 'scatter:paddock')).toBe(true);
    const pieces = s.world.food.filter((f) => f.kind === 'produce').length;
    expect(pieces).toBeGreaterThan(8);
    s.elephants.forEach((e) => (e.needs.hunger = 55));
    runMinutes(s, 120);
    expect(s.world.food.filter((f) => f.kind === 'produce').length).toBeLessThan(pieces);
  });

  it('лакомство повышает доверие и тратит запас сумки', () => {
    const s = game(9, 1);
    const e = s.elephants[0];
    park(e, 19, 27.6);
    e.heading = Math.PI / 2;
    at(s, 19, 31);
    const trust = e.learned.trust;
    const pouch = s.keeper.pouch;
    expect(act(s, `treat:${e.id}`)).toBe(true);
    expect(s.keeper.pouch).toBe(pouch - 1);
    expect(e.learned.trust).toBeGreaterThan(trust);
  });

  it('шланг ограничен длиной: дальше катушки не уйти', () => {
    const s = game(10);
    atStation(s, 'hoseReel');
    act(s, 'takeHose');
    expect(s.keeper.held?.kind).toBe('hose');
    walk(s, 1, 0.3, 8, true);
    expect(Math.hypot(s.keeper.x - 30.6, s.keeper.y - 22.6)).toBeLessThanOrEqual(15.05);
    step(s);
  });
});
