import { describe, expect, it } from 'vitest';
import { advance, availableAction } from '../src/sim';
import { mealStatus } from '../src/sim/feeding';
import { profileOf } from '../src/sim/elephants';
import { basinsOnRack } from '../src/sim/items';
import { finishShift } from '../src/sim/handover';
import { act, at, cleanShift, hold, kashaReady, serve, stand } from './helpers';

function serveKasha(s: ReturnType<typeof cleanShift>): void {
  stand(s, 'stove');
  expect(act(s)).toBe('Разложить кашу по тазам (6)');
  for (const e of s.elephants.filter((elephant) => profileOf(elephant).paddock === 'upper')) {
    const b = basinsOnRack(s).find((x) => x.food === 'kasha' && x.owner === e.id)!;
    at(s, b.x + 0.5, b.y);
    expect(act(s, `Взять: таз с кашей для ${profileOf(e).name}`)).toMatch(/^Взять: таз с кашей для/);
    const slot = profileOf(e).slot;
    at(s, slot.x, slot.y + 0.9);
    expect(act(s)).toMatch(/^Поставить таз с кашей для/);
  }
}

// Убрать тазы со стеллажа к местам слоних грязными, как после еды
function dirtyAtSlots(s: ReturnType<typeof cleanShift>, n: number): void {
  basinsOnRack(s)
    .slice(0, n)
    .forEach((b, i) => {
      const slot = profileOf(s.elephants[i]).slot;
      Object.assign(b, { x: slot.x, y: slot.y, dirty: true, food: null, eatenAt: 0 });
    });
}

describe('корм', () => {
  it('каша: раньше 12:00 не запарить, в 12:40 — готова к 13:00, подана вовремя', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    stand(s, 'stove');
    advance(s, 200); // 11:20
    // У кормовой теперь есть и «Набрать фруктов в карман»; главное — запаривать рано нельзя
    expect(availableAction(s)?.label).toMatch(/Котёл: каша в 13:00|Набрать фруктов в карман/);
    expect(availableAction(s)?.label).not.toBe('Запарить кашу (20 мин)');
    advance(s, 80); // 12:40
    expect(act(s)).toBe('Запарить кашу (20 мин)');
    advance(s, 21);
    serveKasha(s);
    for (const e of s.elephants.filter((elephant) => profileOf(elephant).paddock === 'upper')) expect(mealStatus(s, 'kasha1', e.id)).toBe('ok');
  });

  it('каша на полчаса позже — «опоздание», без каши — «пропуск»', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    advance(s, 300);
    stand(s, 'stove');
    act(s);
    advance(s, 21);
    advance(s, 5);
    serveKasha(s); // 13:26 — позже 20 минут запаса
    for (const e of s.elephants.filter((elephant) => profileOf(elephant).paddock === 'upper')) {
      expect(mealStatus(s, 'kasha1', e.id)).toBe('late');
      expect(mealStatus(s, 'kasha2', e.id)).toBe('missed');
    }
  });

  it('пустой таз не забрали — его раздавят', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    dirtyAtSlots(s, 1);
    advance(s, 900);
    expect(s.stats.basinsLost).toBe(1);
    expect(s.log.some((l) => l.why === 'basinCrushed')).toBe(true);
  });

  it('готовы и каша, и нарезанный ужин — сначала раскладывают кашу, потом ужин', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    advance(s, 545);
    s.kitchen.kasha = { status: 'ready', readyAt: s.t, portions: 3, meal: 'kasha2' };
    s.kitchen.veg.portions = 3;
    stand(s, 'stove');
    expect(availableAction(s)?.label).toBe('Разложить кашу по тазам (3)');
    s.kitchen.kasha = { status: 'idle', readyAt: 0, portions: 0, meal: null };
    stand(s, 'kitchen');
    expect(availableAction(s)?.label).toBe('Разложить ужин по тазам (3)');
  });

  it('слониха сама идёт к тазу и съедает', () => {
    const s = cleanShift();
    advance(s, 280);
    stand(s, 'stove');
    act(s);
    advance(s, 21);
    const audrey = s.elephants.find((e) => e.id === 'audrey')!;
    audrey.hunger = 80;
    stand(s, 'stove');
    act(s);
    serve(s, 'audrey');
    expect(s.meals.kasha1.audrey).not.toBeNull();
    advance(s, 90);
    const basin = s.items.find((i) => i.kind === 'basin' && i.owner === 'audrey')!;
    expect(basin.food).toBeNull();
    expect(audrey.hunger).toBeLessThan(80);
  });
});

describe('тазы — настоящие предметы', () => {
  it('на старте семь чистых тазов на стеллаже', () => {
    const s = cleanShift();
    expect(basinsOnRack(s)).toHaveLength(7);
    expect(basinsOnRack(s).every((b) => !b.dirty && !b.food)).toBe(true);
  });

  it('каша раскладывается по тазам на стеллаже, носят по одному', () => {
    const s = kashaReady();
    stand(s, 'stove');
    expect(act(s)).toBe('Разложить кашу по тазам (6)');
    expect(basinsOnRack(s).filter((b) => b.food === 'kasha')).toHaveLength(6);
    expect(s.kitchen.kasha.status).toBe('idle');
    const b = basinsOnRack(s).find((x) => x.food)!;
    at(s, b.x + 0.5, b.y);
    expect(act(s, 'Взять: таз с кашей')).toMatch(/^Взять: таз с кашей для/);
    expect(s.player.held?.food).toBe('kasha');
    expect(s.player.held?.nested ?? []).toHaveLength(0);
  });

  it('чистых тазов два — раскладываются две порции, следующая после мойки', () => {
    const s = kashaReady();
    dirtyAtSlots(s, 5);
    stand(s, 'stove');
    expect(act(s)).toBe('Разложить кашу по тазам (2)');
    expect(s.kitchen.kasha.portions).toBe(4);
    const slot = profileOf(s.elephants[0]).slot;
    at(s, slot.x, slot.y + 0.9);
    expect(act(s)).toBe('Взять: грязный таз');
    stand(s, 'wash');
    expect(act(s)).toBe('Вымыть таз');
    expect(s.player.held?.dirty).toBe(false);
    stand(s, 'basinRack');
    expect(act(s)).toBe('Поставить таз на стеллаж');
    expect(s.player.held).toBeNull();
    stand(s, 'stove');
    expect(act(s)).toBe('Разложить кашу по тазам (1)');
    expect(s.kitchen.kasha.status).toBe('ready');
    expect(s.kitchen.kasha.portions).toBe(3);
  });

  it('пустые собирают стопкой из настоящих тазов, моют — они остаются в руках, ставят на стеллаж', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 16, 3));
    dirtyAtSlots(s, 3);
    const slots = s.elephants.map((e) => profileOf(e).slot);
    at(s, slots[0].x, slots[0].y + 0.9);
    expect(act(s)).toBe('Взять: грязный таз');
    at(s, slots[1].x, slots[1].y + 0.9);
    expect(act(s)).toBe('Взять ещё пустой таз (будет 2)');
    at(s, slots[2].x, slots[2].y + 0.9);
    expect(act(s)).toBe('Взять ещё пустой таз (будет 3)');
    expect(s.player.held?.nested).toHaveLength(2);
    stand(s, 'wash');
    expect(act(s)).toBe('Вымыть тазы (3)');
    const all = [s.player.held!, ...s.player.held!.nested!];
    expect(all.every((b) => !b.dirty)).toBe(true);
    stand(s, 'basinRack');
    expect(act(s)).toBe('Поставить тазы на стеллаж (3)');
    expect(basinsOnRack(s)).toHaveLength(7);
    expect(s.player.held).toBeNull();
  });

  it('с полным тазом в руках ещё таз не берут; грязный в полный не вкладывают', () => {
    const s = kashaReady();
    dirtyAtSlots(s, 1);
    stand(s, 'stove');
    expect(act(s)).toBe('Разложить кашу по тазам (6)');
    const full = basinsOnRack(s).find((x) => x.food)!;
    at(s, full.x + 0.5, full.y);
    act(s, `Взять: таз с кашей для ${profileOf(s.elephants.find((elephant) => elephant.id === full.owner)!).name}`);
    const slot = profileOf(s.elephants[0]).slot;
    at(s, slot.x + 0.6, slot.y + 0.9);
    expect(availableAction(s)?.label ?? '').not.toMatch(/^Взять ещё/);
    s.player.held!.x = slot.x - 0.6;
    s.player.held!.y = slot.y;
    s.items.push(s.player.held!);
    s.player.held = null;
    const dirty = s.items.find((i) => i.kind === 'basin' && i.dirty)!;
    s.items = s.items.filter((i) => i !== dirty);
    s.player.held = dirty;
    expect(availableAction(s)?.label ?? '').not.toMatch(/^Взять ещё/);
  });

  it('раздавленный таз пропадает, остальных хватает на кормление', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    dirtyAtSlots(s, 1);
    advance(s, 900);
    expect(s.stats.basinsLost).toBe(1);
    expect(s.items.filter((i) => i.kind === 'basin')).toHaveLength(6);
    s.kitchen.kasha = { status: 'ready', readyAt: s.t, portions: 3, meal: 'kasha2' };
    stand(s, 'stove');
    expect(act(s)).toBe('Разложить кашу по тазам (3)');
  });

  it('сдача: грязный таз на стеллаже или забытый у ограды — ✗ «Тазы вымыты и на стеллаже»', () => {
    const a = cleanShift();
    basinsOnRack(a)[0].dirty = true;
    expect(finishShift(a).checklist.find((c) => c.id === 'basins')!.ok).toBe(false);
    const b = cleanShift();
    dirtyAtSlots(b, 1);
    expect(finishShift(b).checklist.find((c) => c.id === 'basins')!.ok).toBe(false);
    expect(finishShift(cleanShift()).checklist.find((c) => c.id === 'basins')!.ok).toBe(true);
  });
});
