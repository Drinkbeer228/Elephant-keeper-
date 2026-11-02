import { describe, expect, it } from 'vitest';
import { advance, availableAction, pocketTreat } from '../src/sim';
import { BALANCE } from '../src/data/balance';
import { act, at, cleanShift, el, hold, stand } from './helpers';

describe('поясная сумка кипера', () => {
  it('на старте смены в кармане 1 лакомство', () => {
    const s = cleanShift();
    expect(s.player.pocketTreats).toBe(BALANCE.player.pocketStart);
    expect(s.player.pocketTreats).toBe(1);
  });

  it('у склада фруктов набирают в карман до 3 — из запаса, руки не занимает', () => {
    const s = cleanShift();
    stand(s, 'vegRack');
    expect(act(s)).toMatch(/Набрать фруктов в карман/);
    expect(s.player.pocketTreats).toBe(3);
    expect(s.stock.fruit).toBe(BALANCE.stockStart.fruit - 2);
    // Карман полон — пункта больше нет
    expect(act(s) ?? '').not.toMatch(/в карман/);
  });

  it('даёт лакомство из кармана, даже когда руки заняты баком', () => {
    const s = cleanShift();
    const margo = el(s, 'margo');
    s.elephants.forEach((e) => hold(e, 18, 3));
    hold(margo, 6.5, 3);
    margo.boredom = 80; // тоскует — пункт появляется
    margo.bladder = 20; // «Давай гуляй» бесполезно
    s.player.held = s.items.find((i) => i.kind === 'bucket')!;
    s.items = s.items.filter((i) => i !== s.player.held);
    at(s, margo.x, margo.y + 1.1);
    const a = availableAction(s)!;
    expect(a.label).toMatch(/из кармана/);
    a.run(s);
    expect(s.player.pocketTreats).toBe(0);
    expect(margo.boredom).toBeLessThan(50);
    expect(s.player.held?.kind).toBe('bucket'); // бак никуда не делся
  });

  it('прерывает качание', () => {
    const s = cleanShift();
    const pretty = el(s, 'pretty');
    s.elephants.forEach((e) => hold(e, 18, 3));
    hold(pretty, 6, 3);
    pretty.boredom = 90;
    pretty.state = 'sway';
    pretty.timer = 20;
    at(s, pretty.x, pretty.y + 1.1);
    expect(availableAction(s)!.label).toMatch(/из кармана/);
    expect(pocketTreat(s, pretty)).toBe(true);
    expect(pretty.state).not.toBe('sway');
    expect(s.log.some((l) => l.kind === 'good' && /сумки/.test(l.text))).toBe(true);
  });

  it('спокойной слонихе карман не предлагают, при сигнале — бак важнее', () => {
    const s = cleanShift();
    const margo = el(s, 'margo');
    s.elephants.forEach((e) => hold(e, 18, 3));
    hold(margo, 6.5, 3);
    margo.boredom = 10; // спокойна
    at(s, margo.x, margo.y + 1.1);
    expect(availableAction(s)?.label ?? '').not.toMatch(/из кармана/);

    margo.boredom = 80;
    margo.bladder = 99.9;
    for (let i = 0; i < 40 && margo.signalStarted === undefined; i++) advance(s, 0.5);
    expect(margo.signalStarted).toBeDefined();
    s.player.held = s.items.find((i) => i.kind === 'bucket')!;
    s.items = s.items.filter((i) => i !== s.player.held);
    expect(availableAction(s)?.label).toMatch(/Подставить бак|Бак под/);
  });
});
