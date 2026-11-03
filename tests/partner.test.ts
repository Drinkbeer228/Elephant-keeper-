import { describe, expect, it } from 'vitest';
import { advance, availableAction, createShift } from '../src/sim';
import { BALANCE } from '../src/data/balance';
import { ELEPHANTS } from '../src/data/elephants';
import { MAP, inPaddock } from '../src/data/map';
import { dist, pee } from '../src/sim/elephants';
import { cellAt } from '../src/sim/floor';
import { updateKitchen } from '../src/sim/feeding';
import { updatePartner } from '../src/sim/partner';
import type { State } from '../src/sim/types';
import { route } from '../src/sim/nav';

describe('напарник нижнего слоновника', () => {
  it('Раджа, Барон и Цезарь находятся в нижнем загоне со своими кормушкой и поилкой', () => {
    const s = createShift(21, { mess: false });
    const males = ELEPHANTS.filter((profile) => profile.paddock === 'male');

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
    expect(route(s.partner, rajah, { gates: s.gates, deliveryOpen: false }).length).toBeGreaterThan(0);

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

  it('подставляет бак под самца и выливает полный бак в слив мойки', () => {
    const s = createShift(22, { mess: false });
    s.musthEventsRemaining = 0;
    const rajah = s.elephants.find((elephant) => elephant.id === 'radja')!;
    rajah.signalStarted = s.t;
    s.partner.x = rajah.x + 4;
    s.partner.y = rajah.y;
    s.partner.mode = 'idle';
    s.partner.timer = 0;

    for (let i = 0; i < 300 && dist(s.partner, rajah) > 0.9; i++) updatePartner(s, 1 / 30, 1 / 30);
    expect(s.partner.mode).toBe('toilet');
    expect(dist(s.partner, rajah)).toBeLessThan(BALANCE.elephant.bucketRadius);

    pee(s, rajah);
    expect(s.partner.bucket).toBeGreaterThan(0);
    expect(rajah.tally.inBucket).toBe(1);

    s.partner.bucket = 40;
    s.partner.x = MAP.stations.drain.x;
    s.partner.y = MAP.stations.drain.y - 1;
    s.partner.mode = 'idle';
    s.partner.timer = 0;
    updatePartner(s, 1 / 30, 1 / 30);
    expect(s.partner.bucket).toBe(0);
  });

  it('убирает мокрое, расходует общий запас опилок и несёт сено из общего запаса', () => {
    const s = createShift(23, { mess: false });
    s.musthEventsRemaining = 0;
    const wetX = MAP.bedding2.x;
    const wetY = MAP.bedding2.y;
    const wet = cellAt(s, wetX, wetY)!;
    s.cells[wet.cy][wet.cx] = { kind: 'wet', since: s.t };
    s.partner.x = wetX + 0.5;
    s.partner.y = wetY + 0.5;
    s.partner.mode = 'idle';
    s.partner.timer = 0;

    updatePartner(s, 1 / 30, 1 / 30);
    expect(cellAt(s, wetX, wetY)!.cell.kind).toBe('bareWet');
    s.partner.timer = 0;
    updatePartner(s, 1 / 30, 1 / 30);
    expect(cellAt(s, wetX, wetY)!.cell.kind).toBe('sawdust');
    expect(s.stock.sawdust).toBe(BALANCE.stockStart.sawdust - 1);

    s.partner.mode = 'idle';
    s.partner.timer = 0;
    s.partner.x = MAP.stations.hay.x;
    s.partner.y = MAP.stations.hay.y - 1.2;
    s.feederHay2 = 0;
    const hay = s.stock.hay;
    updatePartner(s, 1 / 30, 1 / 30);
    expect(s.partner.mode).toBe('hayCarry');
    expect(s.stock.hay).toBe(hay - 1);

    s.partner.x = MAP.feeder2.x + 0.8;
    s.partner.y = MAP.feeder2.y - 1;
    s.partner.path = [];
    s.partner.pathTarget = null;
    updatePartner(s, 1 / 30, 1 / 30);
    expect(s.feederHay2).toBe(BALANCE.food.hayBale);
  });

  it('готовит шесть овощных тазов и сам доставляет порции самцам', () => {
    const s = createShift(24, { mess: false });
    s.musthEventsRemaining = 0;
    s.kitchen.veg.portions = 6;
    s.partner.x = MAP.stations.kitchen.x;
    s.partner.y = MAP.stations.kitchen.y + 1.2;
    s.partner.mode = 'idle';
    s.partner.timer = 0;

    updatePartner(s, 1 / 30, 1 / 30);
    expect(s.kitchen.veg.portions).toBe(0);
    expect(s.items.filter((item) => item.kind === 'basin' && item.food === 'veg')).toHaveLength(6);

    for (let i = 0; i < 5000 && s.meals.dinner.radja === null; i++) updatePartner(s, 1 / 30, 1 / 30);
    expect(s.meals.dinner.radja).not.toBeNull();
    expect(s.items.some((item) => item.kind === 'basin' && item.owner === 'radja' && item.food === 'veg')).toBe(true);
  });

  it('открывает нижний вентиль при пустой поилке и закрывает на полной', () => {
    const s = createShift(21, { mess: false });
    s.musthEventsRemaining = 0;
    s.trough2 = 0;
    s.partner.x = MAP.stations.valve2.x;
    s.partner.y = MAP.stations.valve2.y - 1;
    s.partner.timer = 0;

    updatePartner(s, 1 / 30, 1 / 30);
    expect(s.valve2Open).toBe(true);

    s.trough2 = BALANCE.partner.troughMax;
    s.partner.mode = 'idle';
    s.partner.timer = 0;
    updatePartner(s, 1 / 30, 1 / 30);
    expect(s.valve2Open).toBe(false);
  });

  it('самцы получают случайные черты, а Димон уходит за решётку при мустe', () => {
    const s = createShift(32, { mess: false });
    s.musthEventsRemaining = 1;
    s.musthNextAt = 0;

    advance(s, 0.5);

    const males = s.elephants.filter((elephant) => ELEPHANTS.find((profile) => profile.id === elephant.id)?.paddock === 'male');
    expect(males).toHaveLength(3);
    expect(males.every((elephant) => Object.values(elephant.traits).every((trait) => trait >= 0.8 && trait <= 1.4))).toBe(true);
    const aggressive = males.find((elephant) => elephant.musthTimer > 0)!;
    expect(aggressive.musthTimer).toBeGreaterThan(119);
    expect(aggressive.musthTimer).toBeLessThanOrEqual(180);

    s.partner.x = MAP.complexes.male.rotation.x0 + 2;
    s.partner.y = MAP.complexes.male.rotation.y0 + 2;
    s.partner.mode = 'idle';
    for (let i = 0; i < 1200 && inPaddock(s.partner.x, s.partner.y); i++) updatePartner(s, 1 / 30, 1 / 30);
    expect(s.partner.mode).toBe('flee');
    expect(inPaddock(s.partner.x, s.partner.y)).toBe(false);
  });

  it('кипер может прекратить муст лакомством из коридора', () => {
    const s = createShift(33, { mess: false });
    const rajah = s.elephants.find((elephant) => elephant.id === 'radja')!;
    rajah.musthTimer = 150;
    rajah.x = MAP.feeder2.x;
    rajah.y = MAP.fenceY2 + 0.5;
    s.player.x = MAP.paddock2.x0 - 0.5;
    s.player.y = 40;
    rajah.x = MAP.paddock2.x0 + 0.5;
    rajah.y = 40;

    expect(availableAction(s)?.label).toBe('Бросить успокоительное лакомство Раджа через решётку');
    availableAction(s)!.run(s);
    expect(rajah.musthTimer).toBe(0);
    expect(s.player.pocketTreats).toBe(BALANCE.player.pocketStart - 1);
  });

  it('Димон резервирует буферную паллету, доставляет её на склад и не отдаёт игроку одновременно', () => {
    const s = createShift(34, { mess: false });
    const spot = MAP.receivingSpots[0];
    const before = s.stock.grain;
    s.supply.arrived = true;
    s.supply.left = true;
    const pallet: State['supply']['ground'][number] = {
      id: s.nextItemId++,
      cargo: [{ kind: 'grain', qty: 4 }],
      ...spot,
    };
    s.supply.ground.push(pallet);
    s.partner.x = spot.x - 0.4;
    s.partner.y = spot.y;
    s.partner.timer = 0;
    s.partner.mode = 'idle';
    s.jack.pushed = true;
    s.jack.x = spot.x;
    s.jack.y = spot.y;
    s.player.x = spot.x - 0.5;
    s.player.y = spot.y;

    updatePartner(s, 1 / 30, 1 / 30);

    expect(s.partner.supplyPalletId).toBe(pallet.id);
    expect(pallet.reservedBy).toBe('partner');
    expect(pallet.carriedBy).toBe('partner');
    expect(availableAction(s)?.label).not.toMatch(/^Поднять паллету на рохлю:/);

    for (let i = 0; i < 30 * 300 && s.supply.ground.length; i++) {
      updatePartner(s, 1 / 30, 1 / 30);
    }

    expect(s.supply.ground).toHaveLength(0);
    expect(s.partner.supplyPalletId).toBeNull();
    expect(s.stock.grain).toBe(before + 4);
  });
});
