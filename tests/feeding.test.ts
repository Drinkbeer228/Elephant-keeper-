import { describe, expect, it } from 'vitest';
import { advance } from '../src/sim';
import { mealStatus } from '../src/sim/feeding';
import { profileOf } from '../src/sim/elephants';
import { act, at, cleanShift, hold } from './helpers';

function serveKasha(s: ReturnType<typeof cleanShift>): void {
  for (const e of s.elephants) {
    at(s, 16.5, 11);
    expect(act(s)).toBe('Взять таз с кашей');
    const slot = profileOf(e).slot;
    at(s, slot.x, slot.y + 0.9);
    expect(act(s)).toMatch(/^Поставить таз с кашей для/);
  }
}

describe('корм', () => {
  it('каша: раньше 12:00 не запарить, в 12:40 — готова к 13:00, подана вовремя', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    at(s, 16.5, 11);
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
    at(s, 16.5, 11);
    act(s);
    advance(s, 21);
    serveKasha(s); // 13:21 — ещё в пределах 15 мин? нет, 21 > 15
    for (const e of s.elephants) {
      expect(mealStatus(s, 'kasha1', e.id)).toBe('late');
      expect(mealStatus(s, 'kasha2', e.id)).toBe('missed');
    }
  });

  it('пустой таз не забрали — его раздавят', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    s.items.push({ id: 500, kind: 'basin', x: 3.5, y: 8.3, droppedAt: 0, food: null, eatenAt: 0, owner: 'audrey' });
    advance(s, 400);
    expect(s.stats.basinsLost).toBe(1);
    expect(s.log.some((l) => l.why === 'basinCrushed')).toBe(true);
  });

  it('ужин: пять этапов на кормовой, между ними ожидание', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 6, 3));
    advance(s, 365); // 14:05, утренняя каша уже не актуальна
    at(s, 16.5, 11);
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
    expect(act(s)).toBe('Взять таз с кашей');
    s.player.held = null;
    s.kitchen.kasha = { status: 'idle', readyAt: 0, portions: 0, meal: null };
    expect(act(s)).toBe('Взять таз с овощами');
  });

  it('слониха сама идёт к тазу и съедает', () => {
    const s = cleanShift();
    advance(s, 280);
    at(s, 16.5, 11);
    act(s);
    advance(s, 21);
    const audrey = s.elephants.find((e) => e.id === 'audrey')!;
    audrey.hunger = 80;
    at(s, 16.5, 11);
    act(s);
    at(s, 3.5, 9.2);
    act(s);
    advance(s, 60);
    const basin = s.items.find((i) => i.kind === 'basin' && i.owner === 'audrey')!;
    expect(basin.food).toBeNull();
    expect(audrey.hunger).toBeLessThan(80);
  });
});
