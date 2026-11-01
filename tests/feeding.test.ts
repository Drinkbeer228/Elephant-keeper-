import { describe, expect, it } from 'vitest';
import { advance } from '../src/sim';
import { mealStatus } from '../src/sim/feeding';
import { profileOf } from '../src/sim/elephants';
import { act, at, cleanShift, hold, stand } from './helpers';

function serveKasha(s: ReturnType<typeof cleanShift>): void {
  stand(s, 'kitchen');
  expect(act(s)).toBe('Взять тазы с кашей (3)');
  for (const e of s.elephants) {
    const slot = profileOf(e).slot;
    at(s, slot.x, slot.y + 0.9);
    expect(act(s)).toMatch(/^Поставить таз с кашей для/);
  }
}

describe('корм', () => {
  it('каша: раньше 12:00 не запарить, в 12:40 — готова к 13:00, подана вовремя', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    stand(s, 'kitchen');
    advance(s, 200); // 11:20
    expect(act(s)).toMatch(/Кормовая: каша в 13:00/);
    advance(s, 80); // 12:40
    expect(act(s)).toBe('Запарить кашу (20 мин)');
    advance(s, 21);
    serveKasha(s);
    for (const e of s.elephants) expect(mealStatus(s, 'kasha1', e.id)).toBe('ok');
  });

  it('каша на полчаса позже — «опоздание», без каши — «пропуск»', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    advance(s, 300);
    stand(s, 'kitchen');
    act(s);
    advance(s, 21);
    advance(s, 5);
    serveKasha(s); // 13:26 — позже 20 минут запаса
    for (const e of s.elephants) {
      expect(mealStatus(s, 'kasha1', e.id)).toBe('late');
      expect(mealStatus(s, 'kasha2', e.id)).toBe('missed');
    }
  });

  it('пустой таз не забрали — его раздавят', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    s.items.push({ id: 500, kind: 'basin', x: 3.5, y: 8.3, droppedAt: 0, food: null, eatenAt: 0, owner: 'audrey' });
    advance(s, 900);
    expect(s.stats.basinsLost).toBe(1);
    expect(s.log.some((l) => l.why === 'basinCrushed')).toBe(true);
  });

  it('ужин: пять этапов на кормовой, между ними ожидание', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    advance(s, 365); // 14:05, утренняя каша уже не актуальна
    stand(s, 'kitchen');
    const labels: string[] = [];
    for (let i = 0; i < 5; i++) {
      let label = act(s)!;
      // С 16:00 кормовая сначала предлагает вторую кашу, ужин — следующим нажатием
      if (label.startsWith('Запарить')) label = act(s)!;
      labels.push(label);
      advance(s, 31);
    }
    expect(labels[0]).toBe('Ужин: Замочить овощи');
    expect(labels[4]).toBe('Ужин: Собрать ужин по тазам');
    expect(s.kitchen.veg.portions).toBe(3);
    // Каша к 17:00 тоже готова — её берут первой, овощи следом
    expect(act(s)).toBe('Взять тазы с кашей (3)');
    s.player.held = null;
    s.kitchen.kasha = { status: 'idle', readyAt: 0, portions: 0, meal: null };
    expect(act(s)).toBe('Взять тазы с овощами (3)');
  });

  it('слониха сама идёт к тазу и съедает', () => {
    const s = cleanShift();
    advance(s, 280);
    stand(s, 'kitchen');
    act(s);
    advance(s, 21);
    const audrey = s.elephants.find((e) => e.id === 'audrey')!;
    audrey.hunger = 80;
    stand(s, 'kitchen');
    act(s);
    at(s, 3.5, 9.2);
    act(s);
    advance(s, 60);
    const basin = s.items.find((i) => i.kind === 'basin' && i.owner === 'audrey')!;
    expect(basin.food).toBeNull();
    expect(audrey.hunger).toBeLessThan(80);
  });
});

describe('тазы стопкой', () => {
  it('пустые тазы собираются в стопку и моются разом', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    s.items.push({ id: 601, kind: 'basin', x: 3.5, y: 8.3, droppedAt: 0, food: null, eatenAt: 0 });
    s.items.push({ id: 602, kind: 'basin', x: 4.3, y: 8.3, droppedAt: 0, food: null, eatenAt: 0 });
    const clean = s.kitchen.cleanBasins;
    at(s, 3.5, 8.5);
    expect(act(s)).toBe('Взять: пустой таз');
    at(s, 4.3, 8.5);
    expect(act(s)).toBe('Взять ещё пустой таз (будет 2)');
    stand(s, 'wash');
    expect(act(s)).toBe('Вымыть тазы (2)');
    expect(s.kitchen.cleanBasins).toBe(clean + 2);
  });
});
