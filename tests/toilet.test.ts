import { describe, expect, it } from 'vitest';
import { advance } from '../src/sim';
import { countWet } from '../src/sim/floor';
import { act, at, cleanShift, el, hold, texts } from './helpers';

describe('туалет', () => {
  it('Претти подаёт сигнал; без бака — мимо и мокрая подстилка', () => {
    const s = cleanShift();
    const pretty = el(s, 'pretty');
    hold(pretty, 6, 4);
    pretty.bladder = 99.9;
    advance(s, 1);
    expect(texts(s)).toContain('топ передней ногой');
    expect(pretty.state).toBe('signal');
    advance(s, 5);
    expect(pretty.tally.missed).toBe(1);
    expect(pretty.tally.inBucket).toBe(0);
    expect(countWet(s)).toBeGreaterThan(0);
    expect(s.log.some((l) => l.why === 'missedPee')).toBe(true);
  });

  it('бак подставили за время сигнала — в бак, и лакомство за это поднимает доверие', () => {
    const s = cleanShift();
    const pretty = el(s, 'pretty');
    hold(pretty, 6, 4);
    pretty.bladder = 99.9;
    advance(s, 1);
    // Взять бак со стойки и подойти
    at(s, 1.8, 11.2);
    expect(act(s)).toMatch(/Взять: бак/);
    at(s, 6, 5.2);
    expect(act(s)).toBe('Подставить бак под Претти');
    advance(s, 5);
    expect(pretty.tally.inBucket).toBe(1);
    expect(countWet(s)).toBe(0);
    hold(pretty, 6, 4);
    const trust = pretty.trust;
    expect(act(s)).toBe('Угостить Претти (за бак)');
    expect(pretty.trust).toBeGreaterThan(trust);
  });

  it('Марго идёт к ограждению и ждёт дольше', () => {
    const s = cleanShift();
    const margo = el(s, 'margo');
    hold(margo, 6.5, 3);
    margo.bladder = 99.9;
    for (let i = 0; i < 40 && margo.state !== 'signal'; i++) advance(s, 0.5);
    expect(margo.state).toBe('signal');
    expect(margo.y).toBeGreaterThan(7.5);
    advance(s, 8);
    expect(margo.tally.missed).toBe(0);
    advance(s, 4);
    expect(margo.tally.missed).toBe(1);
  });

  it('Одри писает без сигнала, поймать можно только «погулять»', () => {
    const s = cleanShift();
    const audrey = el(s, 'audrey');
    hold(audrey, 4, 4);
    audrey.bladder = 99.9;
    advance(s, 1);
    expect(audrey.tally.missed).toBe(1);

    hold(audrey, 4, 4);
    audrey.bladder = 30;
    at(s, 1.8, 11.2);
    act(s);
    at(s, 4, 5.3);
    expect(act(s)).toBe('Бак под Одри: «Давай гуляй»');
    expect(texts(s)).toContain('не хочет');

    s.player.held = s.items.find((i) => i.kind === 'bucket')!;
    s.items = s.items.filter((i) => i !== s.player.held);
    audrey.bladder = 60;
    act(s);
    advance(s, 2);
    expect(audrey.tally.inBucket).toBe(1);
  });

  it('лакомство без повода — слониха начинает выпрашивать', () => {
    const s = cleanShift();
    const audrey = el(s, 'audrey');
    hold(audrey, 4, 4);
    at(s, 4, 5.3);
    expect(act(s)).toBe('Угостить Одри');
    expect(audrey.begTreats).toBe(1);
    expect(s.log.some((l) => l.why === 'begTreat')).toBe(true);
  });

  it('полный бак не принимает мочу', () => {
    const s = cleanShift();
    const pretty = el(s, 'pretty');
    hold(pretty, 6, 4);
    const bucket = s.items.find((i) => i.kind === 'bucket')!;
    bucket.x = 6;
    bucket.y = 4;
    bucket.liters = 60;
    pretty.bladder = 99.9;
    advance(s, 6);
    expect(pretty.tally.missed).toBe(1);
    expect(s.log.some((l) => l.why === 'fullBucket')).toBe(true);
  });
});
