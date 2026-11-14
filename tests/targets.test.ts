import { describe, expect, it } from 'vitest';
import { availableActions, interactionTargets, targetScore, type InteractionTarget, type State } from '../src/sim';
import { GATE_BY_ID, STATIONS } from '../src/data/facility';
import { FOCUS } from '../src/data/balance';
import { at, atStation, game, park } from './helpers';
import type { Elephant } from '../src/sim/types';

const NORTH = -Math.PI / 2;
const SOUTH = Math.PI / 2;
const EAST = 0;
const WEST = Math.PI;

function allOut(s: State): void {
  s.elephants.forEach((e, i) => park(e, 12 + i * 7, 6));
}

// Слониха стоит на месте головой в нужную сторону
function stand(e: Elephant, x: number, y: number, heading: number): void {
  park(e, x, y);
  e.heading = heading;
}

function face(s: State, angle: number): void {
  s.keeper.facing = angle;
}

function target(s: State, key: string): InteractionTarget | undefined {
  return interactionTargets(s).find((t) => t.key === key);
}

// Цель, которую интерфейс выбрал бы сам
function best(s: State): InteractionTarget | undefined {
  return interactionTargets(s).filter((t) => t.auto)[0];
}

describe('цели взаимодействия: действия собраны по тому, к чему относятся', () => {
  it('каждое действие попадает ровно в одну цель; «положить вещь» целью не считается', () => {
    const s = game(1);
    allOut(s);
    const e = s.elephants[0];
    stand(e, 14, 25, SOUTH);
    at(s, 14, 28.4);
    face(s, NORTH);
    s.keeper.held = { kind: 'brush', load: 0, aux: 0, owner: null };
    const actions = availableActions(s);
    const targets = interactionTargets(s, actions);
    const inTargets = targets.flatMap((t) => t.options.map((o) => o.id));
    expect(new Set(inTargets).size).toBe(inTargets.length);
    expect(inTargets).not.toContain('drop:held');
    expect(actions.some((a) => a.id === 'drop:held')).toBe(true);
    expect([...inTargets, 'drop:held'].sort()).toEqual(actions.map((a) => a.id).sort());
    // У слонихи — одна цель: и уход, и голос
    const hers = targets.filter((t) => t.elephantId === e.id);
    expect(hers).toHaveLength(1);
    expect(hers[0].key).toBe(`el:${e.id}`);
    expect(hers[0].label).toBe(e.profile.name);
    expect(hers[0].options.some((o) => o.ref.verb === 'voice')).toBe(true);
    expect(hers[0].options.some((o) => o.ref.verb === 'groom')).toBe(true);
    expect(hers[0].contact).toBe(true);
  });

  it('действия внутри цели: сначала доступные, потом по важности', () => {
    const s = game(2);
    allOut(s);
    const e = s.elephants[0];
    stand(e, 14, 25, SOUTH);
    at(s, 14, 28.4);
    face(s, NORTH);
    s.keeper.pouch = 0; // лакомства кончились — «угостить» недоступно
    const t = target(s, `el:${e.id}`)!;
    const firstOff = t.options.findIndex((o) => !o.enabled);
    expect(firstOff).toBeGreaterThan(0);
    expect(t.options.slice(firstOff).every((o) => !o.enabled)).toBe(true);
    const on = t.options.slice(0, firstOff);
    for (let i = 1; i < on.length; i++) expect(on[i - 1].priority).toBeGreaterThanOrEqual(on[i].priority);
    expect(t.top).toBe(on[0].priority);
    expect(t.enabled).toBe(true);
  });

  it('порядок сбора действий сохраняется — по нему строится устойчивый список', () => {
    const s = game(3);
    allOut(s);
    stand(s.elephants[0], 14, 25, SOUTH);
    at(s, 14, 28.4);
    const actions = availableActions(s);
    const orders = actions.map((a) => a.order);
    expect(new Set(orders).size).toBe(orders.length);
    // Уход за слонихой собирается раньше голосовых просьб
    const treat = actions.find((a) => a.ref.verb === 'treat')!;
    const voice = actions.find((a) => a.ref.verb === 'voice')!;
    expect(treat.order).toBeLessThan(voice.order);
    expect(actions.filter((a) => a.at).length).toBeGreaterThan(0);
  });

  it('во время нарезки овощей целей нет', () => {
    const s = game(4);
    allOut(s);
    s.keeper.prep = { tubId: s.world.tubs[0].id, hand: null, trimmed: false, combo: 0 };
    expect(interactionTargets(s)).toEqual([]);
  });
});

describe('какая цель главная: лицом к ней и ближе всего', () => {
  it('из двух слоних целью становится та, к которой кипер стоит лицом', () => {
    const s = game(5);
    allOut(s);
    const [a, b] = s.elephants;
    stand(a, 13, 24, SOUTH);
    stand(b, 19, 24, SOUTH);
    at(s, 16, 27);
    face(s, Math.atan2(24 - 27, 13 - 16));
    expect(best(s)?.elephantId).toBe(a.id);
    face(s, Math.atan2(24 - 27, 19 - 16));
    expect(best(s)?.elephantId).toBe(b.id);
  });

  it('до кого можно дотянуться — важнее той, кого можно только позвать', () => {
    const s = game(6);
    allOut(s);
    const [near, far] = s.elephants;
    stand(near, 13.6, 27, EAST); // голова у самого кипера, сбоку от него
    stand(far, 16, 22.5, EAST); // прямо перед кипером, но в четырёх метрах
    at(s, 16, 27);
    face(s, NORTH);
    const tNear = target(s, `el:${near.id}`)!;
    const tFar = target(s, `el:${far.id}`)!;
    expect(tNear.contact).toBe(true);
    expect(tFar.contact).toBe(false);
    expect(tFar.auto).toBe(true);
    expect(tNear.score).toBeLessThan(tFar.score);
    expect(best(s)?.elephantId).toBe(near.id);
  });

  it('слониха дальше шести метров или за спиной сама целью не становится, но в списке остаётся', () => {
    const s = game(7);
    allOut(s);
    const e = s.elephants[0];
    at(s, 16, 30);
    face(s, NORTH);
    stand(e, 16, 22, EAST); // 8 м
    expect(target(s, `el:${e.id}`)).toBeDefined();
    expect(target(s, `el:${e.id}`)!.auto).toBe(false);
    stand(e, 16, 26, EAST); // 4 м, перед кипером
    expect(target(s, `el:${e.id}`)!.auto).toBe(true);
    face(s, SOUTH); // теперь она за спиной
    expect(target(s, `el:${e.id}`)!.auto).toBe(false);
    expect(best(s)).toBeUndefined();
  });

  it('то, что требует ответа сейчас, становится целью и не глядя на неё', () => {
    const s = game(8);
    allOut(s);
    const e = s.elephants[0];
    stand(e, 16, 26, EAST);
    at(s, 16, 30);
    face(s, SOUTH);
    expect(target(s, `el:${e.id}`)!.auto).toBe(false);
    // Выполнила просьбу — окно похвалы открыто: «молодец» важнее всего
    e.mem.call = { until: s.t + 10, x: e.x, y: e.y, arrivedAt: s.t, rewarded: false, why: 'stay' };
    const t = target(s, `el:${e.id}`)!;
    expect(t.top).toBeGreaterThanOrEqual(FOCUS.urgentVoice);
    expect(t.auto).toBe(true);
  });

  it('станция: лицом к ней — цель, спиной — нет; рядом с воротами решает взгляд', () => {
    const s = game(9);
    allOut(s);
    at(s, 19.5, 31.6);
    const trough = `g:${STATIONS.barnWaterW.label}`;
    const gate = `g:${GATE_BY_ID.shift.label}`;
    face(s, WEST);
    expect(target(s, trough)!.auto).toBe(true);
    expect(target(s, gate)!.auto).toBe(false);
    expect(best(s)?.key).toBe(trough);
    face(s, EAST);
    expect(target(s, trough)!.auto).toBe(false);
    expect(best(s)?.key).toBe(gate);
  });

  it('длинная станция: расстояние считается до её ближайшего края, а не до середины', () => {
    const s = game(10);
    allOut(s);
    atStation(s, 'barnRackW');
    face(s, WEST);
    s.keeper.held = { kind: 'hay', load: 0, aux: 0, owner: null };
    const t = target(s, `g:${STATIONS.barnRackW.label}`)!;
    expect(t.rect).toEqual(STATIONS.barnRackW.rect);
    expect(t.gap).toBeLessThan(0.8);
    expect(t.auto).toBe(true);
    expect(best(s)?.key).toBe(t.key);
    expect(t.options[0].id).toBe('loadFeeder:barnRackW:hay');
  });

  it('вещь на полу перед кипером — цель; у неё главное действие «поднять»', () => {
    const s = game(11);
    allOut(s);
    at(s, 26, 26);
    face(s, EAST);
    s.world.items.push({ id: s.nextId++, kind: 'rake', x: 26.8, y: 26, load: 0, aux: 0, owner: null });
    const t = best(s)!;
    expect(t.key).toBe('g:На полу');
    expect(t.options[0].ref.verb).toBe('pickUp');
    expect(t.gap).toBeCloseTo(0.8, 1);
    expect(t.bearing).toBeLessThan(0.1);
  });

  it('цель, у которой сейчас ничего нельзя сделать, показывается, только если стоишь к ней лицом', () => {
    const s = game(12);
    allOut(s);
    atStation(s, 'hayStack');
    s.keeper.held = { kind: 'rake', load: 0, aux: 0, owner: null }; // руки заняты — тюк не взять
    const key = `g:${STATIONS.hayStack.label}`;
    const r = STATIONS.hayStack.rect!;
    const toStack = Math.atan2((r.y0 + r.y1) / 2 - s.keeper.y, (r.x0 + r.x1) / 2 - s.keeper.x);
    face(s, toStack);
    const t = target(s, key)!;
    expect(t.enabled).toBe(false);
    expect(t.auto).toBe(true);
    expect(t.options[0].reason).toMatch(/Руки заняты/);
    face(s, toStack + Math.PI / 2 + 0.3);
    expect(target(s, key)!.auto).toBe(false);
  });
});

describe('главное действие у слонихи, до которой не дотянуться', () => {
  // Кипер позади неё, в полутора метрах от корпуса: голову не достать
  function behindHer(seed: number): { s: State; e: Elephant } {
    const s = game(seed);
    allOut(s);
    const e = s.elephants[0];
    stand(e, 16, 24, EAST);
    at(s, 12.8, 24);
    face(s, EAST);
    e.needs.bladder = 50;
    return { s, e };
  }

  it('рядом и она тебя видит — поговорить: так она подпускает ближе', () => {
    const { s, e } = behindHer(21);
    e.mem.aware = s.t;
    const t = target(s, `el:${e.id}`)!;
    expect(t.contact).toBe(false);
    expect(t.options[0].id).toBe(`voice:${e.id}:talk`);
  });

  it('рядом сзади, а она не знает, что ты здесь — окликнуть, и это срочно', () => {
    const { s, e } = behindHer(22);
    e.mem.aware = -1e9;
    const t = target(s, `el:${e.id}`)!;
    expect(t.options[0].id).toBe(`voice:${e.id}:name`);
    expect(t.top).toBeGreaterThanOrEqual(FOCUS.urgentVoice);
  });

  it('в нескольких метрах — позвать к себе', () => {
    const s = game(23);
    allOut(s);
    const e = s.elephants[0];
    stand(e, 16, 24, EAST);
    at(s, 16, 28.5);
    face(s, NORTH);
    e.mem.aware = s.t;
    e.needs.bladder = 50;
    expect(target(s, `el:${e.id}`)!.options[0].id).toBe(`voice:${e.id}:come`);
  });

  it('«давай» становится главным, только когда к месту: просится или уже у стока', () => {
    const { s, e } = behindHer(24);
    e.mem.aware = s.t;
    expect(target(s, `el:${e.id}`)!.options[0].id).not.toBe(`voice:${e.id}:toilet`);
    e.signal = { kind: 'toilet', start: s.t, until: s.t + 10, answered: false };
    expect(target(s, `el:${e.id}`)!.options[0].id).toBe(`voice:${e.id}:toilet`);
  });
});

describe('оценка цели: «эффективное расстояние»', () => {
  const base = { gap: 1, bearing: 0, top: 50, contact: true, enabled: true };

  it('ближе — лучше; перед собой — лучше, чем сбоку', () => {
    expect(targetScore({ ...base, gap: 0.5 })).toBeLessThan(targetScore(base));
    expect(targetScore(base)).toBeLessThan(targetScore({ ...base, bearing: Math.PI / 2 }));
    expect(targetScore({ ...base, bearing: Math.PI / 2 })).toBeLessThan(targetScore({ ...base, bearing: Math.PI }));
  });

  it('вплотную взгляд не важен', () => {
    expect(targetScore({ ...base, gap: 0.1, bearing: Math.PI })).toBeCloseTo(targetScore({ ...base, gap: 0.1, bearing: 0 }), 5);
  });

  it('важное действие приближает цель, но не безгранично', () => {
    const plain = targetScore(base);
    const urgent = targetScore({ ...base, top: 120 });
    const veryUrgent = targetScore({ ...base, top: 200 });
    expect(urgent).toBeLessThan(plain);
    expect(veryUrgent).toBeCloseTo(urgent, 5);
    expect(plain - urgent).toBeCloseTo(FOCUS.urgentPull, 5);
  });

  it('только голосом и «сейчас нельзя» — хуже', () => {
    expect(targetScore({ ...base, contact: false })).toBeCloseTo(targetScore(base) + FOCUS.voicePenalty, 5);
    expect(targetScore({ ...base, enabled: false })).toBeCloseTo(targetScore(base) + FOCUS.offPenalty, 5);
  });
});
