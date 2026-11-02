import { describe, expect, it } from 'vitest';
import { createShift } from '../src/sim';
import { BALANCE } from '../src/data/balance';
import { ELEPHANTS } from '../src/data/elephants';
import { MAP, inPaddock } from '../src/data/map';
import { updateKitchen } from '../src/sim/feeding';
import { updatePartner } from '../src/sim/partner';

describe('напарник нижнего слоновника', () => {
  it('Раджа, Барон и Цезарь находятся в нижнем загоне со своими кормушкой и поилкой', () => {
    const s = createShift(21, { mess: false });
    const males = ELEPHANTS.filter((profile) => profile.paddock === 'lower');

    expect(males.map((profile) => profile.name)).toEqual(['Раджа', 'Барон', 'Цезарь']);
    expect(s.elephants.filter((e) => males.some((profile) => profile.id === e.id)).every((e) => inPaddock(e.x, e.y))).toBe(true);
    expect(inPaddock(MAP.feeder2.x, MAP.feeder2.y)).toBe(true);
    expect(inPaddock(MAP.trough2.x, MAP.trough2.y)).toBe(true);
  });

  it('проходит к самцу через дверь и остаётся рядом, пока тот не сходит', () => {
    const s = createShift(21, { mess: false });
    const rajah = s.elephants.find((e) => e.id === 'radja')!;
    rajah.bladder = BALANCE.partner.bladderCare + 10;
    s.partner.timer = 0;

    for (let i = 0; i < 600 && Math.hypot(s.partner.x - rajah.x, s.partner.y - rajah.y) > 1; i++) {
      updatePartner(s, 1 / 30, 1 / 30);
    }

    expect(s.partner.mode).toBe('toilet');
    expect(Math.hypot(s.partner.x - rajah.x, s.partner.y - rajah.y)).toBeLessThan(1);
  });

  it('нижний вентиль наполняет свою поилку', () => {
    const s = createShift(21, { mess: false });
    s.valve2Open = true;
    s.trough2 = 50;

    updateKitchen(s, 2);

    expect(s.trough2).toBe(50 + BALANCE.food.troughFill * 2);
    expect(s.trough).toBe(80);
  });
});
