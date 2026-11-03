import { describe, expect, it } from 'vitest';
import { advance } from '../src/sim';
import { countWet } from '../src/sim/floor';
import { MAP } from '../src/data/map';
import { act, at, cleanShift, el, hold, stand, texts } from './helpers';

function takeBucket(s: ReturnType<typeof cleanShift>): void {
  const spot = MAP.rackSpots.bucket;
  at(s, spot.x + 0.5, spot.y);
  expect(act(s)).toMatch(/Взять: бак/);
}

describe('туалет', () => {
  it('Претти просится; без бака — мимо и мокрая подстилка', () => {
    const s = cleanShift();
    const pretty = el(s, 'pretty');
    hold(pretty, 20, 25);
    pretty.bladder = 99.9;
    advance(s, 1);
    expect(texts(s)).toContain('Претти просится');
    expect(pretty.state).toBe('signal');
    advance(s, 6);
    expect(pretty.tally.missed).toBe(1);
    expect(countWet(s)).toBeGreaterThan(0);
  });

  it('бак подставили — сразу в бак, лакомство за это поднимает доверие', () => {
    const s = cleanShift();
    const pretty = el(s, 'pretty');
    hold(pretty, 20, 25);
    pretty.bladder = 99.9;
    advance(s, 1);
    takeBucket(s);
    at(s, 20, 25.8);
    expect(act(s)).toBe('Подставить бак под Претти');
    advance(s, 1.5);
    expect(pretty.tally.inBucket).toBe(1);
    expect(countWet(s)).toBe(0);
    hold(pretty, 20, 25);
    const trust = pretty.trust;
    expect(act(s)).toBe('Угостить Претти (за бак)');
    expect(pretty.trust).toBeGreaterThan(trust);
  });

  it('Марго идёт к ограждению и ждёт дольше', () => {
    const s = cleanShift();
    const margo = el(s, 'margo');
    hold(margo, 22, 30);
    margo.bladder = 99.9;
    for (let i = 0; i < 40 && margo.state !== 'signal'; i++) advance(s, 0.5);
    expect(margo.state).toBe('signal');
    expect(margo.y).toBeGreaterThan(33);
    advance(s, 8);
    expect(margo.tally.missed).toBe(0);
    advance(s, 4);
    expect(margo.tally.missed).toBe(1);
  });

  it('Одри писает без сигнала, поймать можно только «погулять»', () => {
    const s = cleanShift();
    const audrey = el(s, 'audrey');
    hold(audrey, 24, 24);
    audrey.bladder = 99.9;
    advance(s, 1);
    expect(audrey.tally.missed).toBe(1);

    hold(audrey, 24, 24);
    audrey.bladder = 30;
    takeBucket(s);
    at(s, 24, 24.8);
    expect(act(s)).toBe('Бак под Одри: «Давай гуляй»');
    expect(texts(s)).toContain('не хочет');

    s.player.held = s.items.find((i) => i.kind === 'bucket')!;
    s.items = s.items.filter((i) => i !== s.player.held);
    audrey.bladder = 60;
    act(s);
    advance(s, 2);
    expect(audrey.tally.inBucket).toBe(1);
  });

  it('угостить можно только за бак', () => {
    const s = cleanShift();
    const audrey = el(s, 'audrey');
    hold(audrey, 24, 24);
    at(s, 24, 24.8);
    expect(act(s) ?? '').not.toMatch(/Угостить/);
  });

  it('полный бак не принимает мочу', () => {
    const s = cleanShift();
    const pretty = el(s, 'pretty');
    hold(pretty, 20, 25);
    const bucket = s.items.find((i) => i.kind === 'bucket')!;
    bucket.x = 20;
    bucket.y = 25;
    bucket.liters = 60;
    pretty.bladder = 99.9;
    advance(s, 7);
    expect(pretty.tally.missed).toBe(1);
    expect(s.log.some((l) => l.why === 'fullBucket')).toBe(true);
  });

  it('бак выливают в решётку слива в мойке', () => {
    const s = cleanShift();
    const b = s.items.find((i) => i.kind === 'bucket')!;
    s.items = s.items.filter((i) => i !== b);
    s.player.held = { ...b, liters: 30, dirty: true };
    stand(s, 'drain');
    expect(act(s)).toBe('Вылить бак в слив');
    expect(s.player.held?.liters).toBe(0);
  });
});
