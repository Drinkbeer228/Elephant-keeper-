import { describe, expect, it } from 'vitest';
import { availableAction } from '../src/sim';
import { MAP } from '../src/data/map';
import { BALANCE } from '../src/data/balance';
import { act, at, cleanShift } from './helpers';

const heap = MAP.stations.sawdust;
const pail = (s: ReturnType<typeof cleanShift>) => s.items.find((i) => i.kind === 'sawdust')!;

describe('навес: опилки', () => {
  it('ведро для опилок стоит в дежурке, пустое', () => {
    const s = cleanShift();
    const p = pail(s);
    expect(Math.hypot(p.x - MAP.pailSpot.x, p.y - MAP.pailSpot.y)).toBeLessThan(0.01);
    expect(p.charges).toBe(0);
  });

  it('лопата наполняет ведро у ларя, ведро возвращается в дежурку', () => {
    const s = cleanShift();
    const p = pail(s);
    p.x = heap.x;
    p.y = heap.y - 1;
    const shovel = s.items.find((i) => i.kind === 'shovel')!;
    s.items = s.items.filter((i) => i !== shovel);
    s.player.held = shovel;
    at(s, heap.x, heap.y - heap.h / 2 - 0.4);
    expect(act(s)).toBe('Насыпать опилок в ведро');
    expect(p.charges).toBe(BALANCE.items.sawdustCharges);
    expect(s.stock.sawdust).toBe(BALANCE.stockStart.sawdust - BALANCE.items.sawdustCharges);
    s.player.held = p;
    at(s, MAP.pailSpot.x - 0.5, MAP.pailSpot.y);
    expect(act(s)).toBe('Поставить ведро на место');
    expect(s.player.held).toBeNull();
  });

  it('из нескольких станций рядом выбирается ближайшая', () => {
    const s = cleanShift();
    pail(s).x = 7;
    const straw = MAP.stations.straw;
    at(s, straw.x + straw.w / 2 + 0.2, straw.y + straw.h / 2 + 0.2);
    expect(availableAction(s)?.label).toBe('Взять охапку соломы');
  });

  it('испорченную подстилку можно сдать целиком только в уличный бак', () => {
    const s = cleanShift();
    Object.assign(s.barrow, {
      x: MAP.stations.dump.x - 1.7,
      y: MAP.stations.dump.y,
      pushed: true,
      sawdust: 8,
      waste: 2,
      spoiled: true,
    });
    at(s, s.barrow.x - 0.9, s.barrow.y);
    expect(availableAction(s)?.label).toBe('Заехать в бак и высыпать тачку');
    expect(act(s)).toBe('Заехать в бак и высыпать тачку');
    expect(s.container.fill).toBe(10);
    expect(s.barrow.sawdust).toBe(0);
    expect(s.barrow.waste).toBe(0);
    expect(s.barrow.spoiled).toBe(false);
  });
});

describe('вещи рядом', () => {
  it('две вещи почти в одной точке — «Взять» предлагает выбор', () => {
    const s = cleanShift();
    const bucket = s.items.find((i) => i.kind === 'bucket')!;
    const p = pail(s);
    Object.assign(bucket, { x: 15.5, y: 10.55 });
    Object.assign(p, { x: 15.48, y: 10.55 });
    at(s, 15.5, 10.9);
    const a = availableAction(s)!;
    expect(a.choices?.map((c) => c.label)).toEqual(['Взять: бак 65 л', 'Взять: ведро для опилок (пустое)']);
    expect(act(s, 'Взять: бак')).toBe('Взять: бак 65 л');
    expect(s.player.held).toBe(bucket);
  });

  it('если одна вещь явно ближе — берётся сразу, без меню', () => {
    const s = cleanShift();
    at(s, MAP.rackSpots.fork.x + 0.4, MAP.rackSpots.fork.y);
    expect(act(s)).toBe('Взять: вилы');
  });
});
