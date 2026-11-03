import { describe, expect, it } from 'vitest';
import { advance, tick } from '../src/sim';
import { setCell } from '../src/sim/floor';
import { BALANCE } from '../src/data/balance';
import { MAP } from '../src/data/map';
import { act, at, cleanShift, el, hold, stand } from './helpers';

function push(s: ReturnType<typeof cleanShift>, dx: number, dy: number, seconds: number, balance?: -1 | 1): void {
  for (let i = 0; i < seconds * 30; i++) {
    const cmds: Parameters<typeof tick>[2] = [{ type: 'move', dx, dy }];
    if (balance) cmds.push({ type: 'balance', dir: balance });
    tick(s, 1 / 30, cmds);
  }
}

describe('тачка', () => {
  it('везти тачку от её места к стойке, сложить инвентарь, вернуть обратно', () => {
    const s = cleanShift();
    at(s, MAP.barrowStart.x, MAP.barrowStart.y - 0.8);
    expect(act(s)).toBe('Везти тачку');
    expect(s.barrow.pushed).toBe(true);
    Object.assign(s.barrow, { x: MAP.stations.rack.x + 1.7, y: MAP.stations.rack.y });
    at(s, MAP.stations.rack.x + 0.8, MAP.stations.rack.y);
    expect(act(s)).toBe('Сложить инвентарь в тачку');
    expect(s.barrow.tools.sort()).toEqual(['broom', 'fork', 'scoop']);
    expect(s.items.some((i) => i.kind === 'scoop')).toBe(false);
    expect(act(s)).toBe('Вернуть инвентарь на стойку');
    expect(s.barrow.tools).toEqual([]);
    expect(s.items.filter((i) => ['scoop', 'fork', 'broom'].includes(i.kind))).toHaveLength(3);
  });

  it('из стоящей тачки берут инструмент, убирают в неё и кладут инструмент обратно', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 45, 24));
    Object.assign(s.barrow, { x: 20, y: 22.5, pushed: false, tools: ['scoop', 'fork', 'broom'], parkedAt: 0 });
    s.dung.push({ id: 900, x: 18.5, y: 22.5, at: 0 });
    setCell(s, 18, 22, 'wet');
    at(s, 20, 22.5);
    expect(act(s, 'Взять: совок')).toMatch(/совок/);
    expect(s.player.held?.kind).toBe('scoop');
    at(s, 18.5, 22.8);
    expect(act(s)).toBe('Убрать навоз в тачку');
    at(s, 20, 22.5);
    expect(act(s)).toBe('Положить в тачку: совок со скребком');
    expect(act(s, 'Взять: вилы')).toBe('Взять: вилы');
    at(s, 18.5, 22.5);
    expect(act(s)).toBe('Убрать мокрую солому в тачку');
    at(s, 20, 22.5);
    act(s);
    expect(act(s, 'Взять: метл')).toMatch(/метл/);
    expect(s.player.held?.kind).toBe('broom');
    at(s, 20, 22.5);
    expect(act(s)).toBe('Положить в тачку: метла');
    expect(s.barrow.tools).toContain('broom');
    expect(s.barrow.waste).toBe(2);
  });

  it('тачка едет перед кипером и не проходит сквозь ограждение', () => {
    const s = cleanShift();
    Object.assign(s.barrow, { x: 30, y: 49.5, pushed: true });
    at(s, 30, 49.5);
    push(s, 0, -1, 1.5);
    expect(s.player.y).toBeGreaterThanOrEqual(MAP.complexes.female.bounds.y1 + 0.3 - 0.1);
    expect(s.barrow.y).toBeGreaterThanOrEqual(MAP.complexes.female.bounds.y1 + 0.3 - 0.1);
  });

  it('три тюка раскачиваются: без балансировки падают, с ней доезжают', () => {
    const ride = (steer: boolean) => {
      const s = cleanShift(3);
      Object.assign(s.barrow, { x: 52, y: 53, pushed: true, bales: 3 });
      at(s, 51, 53);
      for (let i = 0; i < 30 * 6; i++) {
        const dir = (i % 60 < 30 ? -1 : 1) as -1 | 1;
        const cmds: Parameters<typeof tick>[2] = [{ type: 'move', dx: dir, dy: 0 }];
        // Выравнивать в сторону, противоположную крену
        if (steer && Math.abs(s.barrow.balance) > 0.05) cmds.push({ type: 'balance', dir: s.barrow.balance > 0 ? -1 : 1 });
        tick(s, 1 / 30, cmds);
      }
      return s.barrow.bales;
    };
    expect(ride(false)).toBeLessThan(3);
    expect(ride(true)).toBe(3);
  });

  it('два тюка едут спокойно', () => {
    const s = cleanShift();
    Object.assign(s.barrow, { x: 52, y: 53, pushed: true, bales: 2 });
    at(s, 51, 53);
    push(s, -1, 0, 3);
    expect(s.barrow.bales).toBe(2);
  });

  it('тюк из тачки — в кормушку', () => {
    const s = cleanShift();
    s.feederHay = 10;
    Object.assign(s.barrow, { x: MAP.feeder.x + 0.8, y: MAP.feeder.y + 0.6, pushed: true, bales: 2 });
    at(s, MAP.feeder.x, MAP.feeder.y);
    expect(act(s)).toBe('Выгрузить тюк в кормушку');
    expect(s.barrow.bales).toBe(1);
    expect(s.feederHay).toBe(10 + BALANCE.food.hayBale);
  });

  it('скучающая слониха опрокидывает тачку у себя под боком', () => {
    const s = cleanShift(5);
    s.elephants.forEach((e) => {
      hold(e, 19, 22.5);
      e.trust = 0;
      e.boredom = 100;
    });
    Object.assign(s.barrow, { x: 19, y: 22.5, pushed: false, tools: ['scoop'], waste: 6, parkedAt: 0 });
    advance(s, 600);
    expect(s.barrow.tools).toEqual([]);
    expect(s.log.some((l) => l.why === 'barrowTipped')).toBe(true);
  });
});

describe('мусорный бак', () => {
  const atBox = (s: ReturnType<typeof cleanShift>) => {
    stand(s, 'dump');
    Object.assign(s.barrow, { x: MAP.stations.dump.x, y: s.player.y + 0.6, pushed: true });
  };

  it('пока не наполовину — заезжаешь и высыпаешь', () => {
    const s = cleanShift();
    atBox(s);
    s.barrow.waste = 10;
    expect(act(s)).toBe('Заехать в бак и высыпать тачку');
    expect(s.container.fill).toBe(10);
    expect(s.barrow.waste).toBe(0);
  });

  it('с половины: закрыть дверцу, поставить трап, высыпать по трапу; полный — мусоровоз', () => {
    const s = cleanShift();
    s.container.fill = BALANCE.container.capacity / 2;
    atBox(s);
    s.barrow.waste = 5;
    expect(act(s)).toMatch(/закрой дверцу/);
    s.barrow.pushed = false;
    s.barrow.x = 15;
    expect(act(s)).toBe('Закрыть дверцу бака');
    expect(act(s)).toBe('Поставить трап к баку');
    atBox(s);
    expect(act(s)).toBe('Поднять по трапу и высыпать тачку');
    s.container.fill = BALANCE.container.capacity;
    s.barrow.pushed = false;
    s.barrow.x = 15;
    expect(act(s)).toBe('Позвонить: вывезти мусорный бак');
    advance(s, BALANCE.container.truckDelay + 1);
    expect(s.container.fill).toBe(0);
    expect(s.container.doorClosed).toBe(false);
    expect(s.container.ramp).toBe(false);
  });
});

describe('туалет и слив', () => {
  it('просится — бак под неё, сходит сразу; бак выливают в решётку слива', () => {
    const s = cleanShift();
    const margo = el(s, 'margo');
    hold(margo, 22, 30);
    margo.bladder = 99.9;
    for (let i = 0; i < 40 && margo.state !== 'signal'; i++) advance(s, 0.5);
    s.player.held = s.items.find((i) => i.kind === 'bucket')!;
    s.items = s.items.filter((i) => i !== s.player.held);
    at(s, margo.x, margo.y + 1.1);
    expect(act(s)).toBe('Подставить бак под Марго');
    advance(s, 1.5);
    expect(margo.tally.inBucket).toBe(1);
    expect(act(s)).toBe('Угостить Марго (за бак)');
    at(s, margo.x, margo.y + 0.2);
    act(s);
    expect(s.player.held?.kind).toBe('bucket');
    stand(s, 'drain');
    expect(act(s)).toBe('Вылить бак в слив');
    expect(s.player.held?.liters).toBe(0);
  });
});

describe('тачка за оградой', () => {
  it('не помогает, если стоит по другую сторону ограждения', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 45, 24));
    Object.assign(s.barrow, { x: 20, y: 49, pushed: false, tools: ['scoop', 'fork', 'broom'] });
    s.dung.push({ id: 901, x: 20, y: 25, at: 0 });
    at(s, 20, 25.2);
    expect(act(s) ?? '').not.toMatch(/в тачку/);
  });
});
