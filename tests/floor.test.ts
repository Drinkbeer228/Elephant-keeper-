import { describe, expect, it } from 'vitest';
import { advance } from '../src/sim';
import { cellAt, setCell } from '../src/sim/floor';
import { newItem } from '../src/sim/state';
import { MAP } from '../src/data/map';
import { BALANCE } from '../src/data/balance';
import { act, at, cleanShift, el, hold } from './helpers';

describe('пол', () => {
  it('цепочка: мокрое вилами → опилки → впитали → метла → солома', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 11, 7));
    setCell(s, 18, 22, 'wet');
    at(s, 18.5, 22.5);
    s.items.push({ ...newItem(s, 'bag', { fill: 0 }), x: 19.5, y: 22.5 });

    s.player.held = newItem(s, 'sawdust', { charges: 8 });
    expect(act(s)).toBe('Сначала убери мокрую солому вилами');
    expect(cellAt(s, 18.5, 22.5)!.cell.kind).toBe('wet');

    s.player.held = newItem(s, 'fork');
    expect(act(s)).toBe('Убрать мокрую солому в мешок');
    expect(cellAt(s, 18.5, 22.5)!.cell.kind).toBe('bareWet');

    s.player.held = newItem(s, 'sawdust', { charges: 8 });
    expect(act(s)).toBe('Засыпать опилками');

    s.player.held = newItem(s, 'broom');
    expect(act(s)).toBe('Опилки ещё впитывают');
    advance(s, 31);
    expect(act(s)).toBe('Вымести опилки в мешок');
    expect(cellAt(s, 18.5, 22.5)!.cell.kind).toBe('bare');

    s.player.held = newItem(s, 'straw', { charges: 3 });
    expect(act(s)).toBe('Постелить солому');
    expect(cellAt(s, 18.5, 22.5)!.cell.kind).toBe('straw');
    expect(s.items.find((i) => i.kind === 'bag')!.fill).toBe(2);
  });

  it('на мокрой клетке растёт долг ног, на сухой — нет', () => {
    const s = cleanShift();
    const a = el(s, 'audrey');
    const m = el(s, 'margo');
    hold(a, 18.5, 22.5);
    hold(m, 21.5, 22.5);
    setCell(s, 18, 22, 'wet');
    for (let i = 0; i < 120; i++) {
      advance(s, 1);
      // Чтобы сами не намочили и не испачкали свои клетки
      [a, m].forEach((e) => ((e.bladder = 0), (e.bowel = 0)));
    }
    expect(a.footDebt).toBeGreaterThan(100);
    expect(m.footDebt).toBe(0);
  });

  it('без мешка и тачки навоз уходит в отсек совка, рядом с мешком — в мешок', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 11, 7));
    s.dung.push({ id: 999, x: 18.5, y: 22.5, at: 0 }, { id: 998, x: 19.5, y: 22.5, at: 0 });
    at(s, 18.5, 22.8);
    s.player.held = newItem(s, 'scoop');
    expect(act(s)).toBe('Убрать навоз в совок (1/6)');
    expect(s.player.held!.load).toBe(1);
    s.items.push({ ...newItem(s, 'bag', { fill: 0 }), x: 20.5, y: 22.5 });
    at(s, 19.5, 22.8);
    expect(act(s)).toBe('Убрать навоз в мешок');
    expect(s.dung).toHaveLength(0);
  });

  it('открытый вентиль переливает поилку в подстилку', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 3, 7));
    s.valveOpen = true;
    advance(s, 20);
    expect(s.log.some((l) => l.why === 'troughOverflow')).toBe(true);
    expect(cellAt(s, MAP.trough.x - 0.4, MAP.trough.y + 0.2)!.cell.kind).toBe('puddle');
  });
});

describe('подсказки', () => {
  it('опилки впитались — подсказка про метлу', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 18, 3));
    s.cells[22][18] = { kind: 'sawdust', since: 0 };
    advance(s, BALANCE.floor.sawdustAbsorb + 1);
    expect(s.log.some((l) => l.kind === 'hint' && l.text.includes('метлой'))).toBe(true);
  });
});

describe('затоптанный навоз', () => {
  it('свежий навоз обходят, залежавшийся затаптывают и разносят следами', () => {
    const s = cleanShift(2);
    const a = s.elephants[0];
    s.elephants.slice(1).forEach((e) => hold(e, 11, 7));
    s.dung.push({ id: 950, x: 18.5, y: 22.5, at: 0 });
    hold(a, 18.5, 22.5);
    advance(s, 30);
    expect(s.dung).toHaveLength(1); // свежий — не тронут
    advance(s, 70);
    // постояла на залежавшемся — затоптала, пошла дальше и наследила
    a.state = 'walk';
    a.tx = 25.5;
    a.ty = 22.5;
    a.next = 'idle';
    for (let i = 0; i < 400 && a.state === 'walk'; i++) advance(s, 0.5);
    const trampled = s.cells.flat().filter((c) => c.kind === 'dung').length;
    expect(s.dung).toHaveLength(0);
    expect(trampled).toBeGreaterThanOrEqual(2);
  });

  it('затоптанное счищают совком до пола', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 11, 7));
    setCell(s, 18, 22, 'dung');
    s.items.push({ ...newItem(s, 'bag', { fill: 0 }), x: 19.5, y: 22.5 });
    s.player.held = newItem(s, 'scoop');
    at(s, 18.5, 22.5);
    expect(act(s)).toBe('Счистить затоптанный навоз в мешок');
    expect(cellAt(s, 18.5, 22.5)!.cell.kind).toBe('bare');
  });
});

describe('еда и вода', () => {
  it('ест — кишечник наполняется, пьёт — пузырь', () => {
    const s = cleanShift();
    const e = s.elephants[0];
    hold(e, MAP.feeder.x + 0.3, MAP.feeder.y + 0.3);
    e.state = 'eatHay';
    e.hunger = 80;
    e.bowel = 0;
    e.timer = 30;
    advance(s, 20);
    expect(e.bowel).toBeGreaterThan(8);
    hold(e, MAP.trough.x - 0.4, MAP.trough.y);
    e.state = 'drink';
    e.thirst = 80;
    e.bladder = 0;
    e.timer = 10;
    advance(s, 8);
    expect(e.bladder).toBeGreaterThan(15);
  });
});
