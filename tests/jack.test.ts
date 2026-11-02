import { describe, expect, it } from 'vitest';
import { availableAction, tick } from '../src/sim';
import { act, at, cleanShift } from './helpers';
import { MAP } from '../src/data/map';

function takeJack(s: ReturnType<typeof cleanShift>): void {
  at(s, MAP.jackStart.x - 0.5, MAP.jackStart.y);
  expect(act(s)).toBe('Везти рохлю');
  expect(s.jack.pushed).toBe(true);
}

const STEP = 1 / 30;

describe('рохля', () => {
  it('стоит на свободном месте коридора, рядом меню «Везти рохлю», потом «Поставить рохлю»', () => {
    const s = cleanShift();
    expect(s.jack).toEqual({ x: MAP.jackStart.x, y: MAP.jackStart.y, pushed: false, cargo: null });
    expect(s.items.some((i) => Math.hypot(i.x - s.jack.x, i.y - s.jack.y) < 1.3)).toBe(false);
    takeJack(s);
    expect(act(s)).toBe('Поставить рохлю');
    expect(s.jack.pushed).toBe(false);
  });

  it('едет по коридору и не заезжает в вольер', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => (e.timer = 1e9));
    takeJack(s);
    for (let i = 0; i < 60; i++) tick(s, STEP, [{ type: 'move', dx: -1, dy: 0 }]);
    expect(s.jack.x).toBeLessThan(MAP.jackStart.x);
    for (let i = 0; i < 180; i++) tick(s, STEP, [{ type: 'move', dx: 0, dy: -1 }]);
    expect(s.jack.y).toBeGreaterThanOrEqual(MAP.fenceY + 0.3 - 0.1);
  });

  it('скорость с рохлей ниже свободной', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => (e.timer = 1e9));
    takeJack(s);
    at(s, 48.0, 15.4);
    s.jack.x = s.player.x + 0.75;
    s.jack.y = s.player.y;
    const x0 = s.player.x;
    for (let i = 0; i < 30; i++) tick(s, STEP, [{ type: 'move', dx: -1, dy: 0 }]);
    const jackDist = x0 - s.player.x;
    expect(jackDist).toBeGreaterThan(0);

    const s2 = cleanShift();
    at(s2, 48.0, 15.4);
    const x1 = s2.player.x;
    for (let i = 0; i < 30; i++) tick(s2, STEP, [{ type: 'move', dx: -1, dy: 0 }]);
    expect(x1 - s2.player.x).toBeGreaterThan(jackDist);
  });

  it('толкать можно что-то одно: рохля не перехватывает везомую тачку', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => (e.timer = 1e9));
    takeJack(s);
    s.barrow.x = MAP.jackStart.x - 0.4;
    s.barrow.y = MAP.jackStart.y;
    expect(s.jack.pushed).toBe(true);
    expect(act(s)).not.toBe('Везти тачку');
  });

  it('занятые руки дают явную подсказку', () => {
    const s = cleanShift();
    s.player.held = s.items.find((i) => i.kind === 'bucket')!;
    s.items = s.items.filter((i) => i !== s.player.held);
    at(s, MAP.jackStart.x - 0.5, MAP.jackStart.y);
    expect(availableAction(s)?.label).toBe('Освободите руки, чтобы везти рохлю');
    act(s);
    expect(s.log.at(-1)?.text).toBe('Освободите руки, чтобы везти рохлю');
  });
});
