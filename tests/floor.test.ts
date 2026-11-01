import { describe, expect, it } from 'vitest';
import { advance } from '../src/sim';
import { cellAt, setCell } from '../src/sim/floor';
import { newItem } from '../src/sim/state';
import { act, at, cleanShift, el, hold } from './helpers';

describe('пол', () => {
  it('цепочка: мокрое вилами → опилки → впитали → метла → солома', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 11, 7));
    setCell(s, 2, 2, 'wet'); // клетка мира (3..4, 3..4)
    at(s, 3.5, 3.5);
    s.items.push({ ...newItem(s, 'bag', { fill: 0 }), x: 4.5, y: 3.5 });

    s.player.held = newItem(s, 'sawdust', { charges: 6 });
    expect(act(s)).toBe('Сначала убери мокрую солому вилами');
    expect(cellAt(s, 3.5, 3.5)!.cell.kind).toBe('wet');

    s.player.held = newItem(s, 'fork');
    expect(act(s)).toBe('Убрать мокрую солому в мешок');
    expect(cellAt(s, 3.5, 3.5)!.cell.kind).toBe('bareWet');

    s.player.held = newItem(s, 'sawdust', { charges: 6 });
    expect(act(s)).toBe('Засыпать опилками');

    s.player.held = newItem(s, 'broom');
    expect(act(s)).toBe('Опилки ещё впитывают');
    advance(s, 31);
    expect(act(s)).toBe('Вымести опилки в мешок');
    expect(cellAt(s, 3.5, 3.5)!.cell.kind).toBe('bare');

    s.player.held = newItem(s, 'straw', { charges: 3 });
    expect(act(s)).toBe('Постелить солому');
    expect(cellAt(s, 3.5, 3.5)!.cell.kind).toBe('straw');
    expect(s.items.find((i) => i.kind === 'bag')!.fill).toBe(2);
  });

  it('на мокрой клетке растёт долг ног, на сухой — нет', () => {
    const s = cleanShift();
    const a = el(s, 'audrey');
    const m = el(s, 'margo');
    hold(a, 3.5, 3.5);
    hold(m, 8.5, 3.5);
    setCell(s, 2, 2, 'wet');
    for (let i = 0; i < 120; i++) {
      advance(s, 1);
      // Чтобы сами не намочили и не испачкали свои клетки
      [a, m].forEach((e) => ((e.bladder = 0), (e.bowel = 0)));
    }
    expect(a.footDebt).toBeGreaterThan(100);
    expect(m.footDebt).toBe(0);
  });

  it('навоз убирается совком только в открытый мешок рядом', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 11, 7));
    s.dung.push({ id: 999, x: 5.5, y: 5.5, at: 0 });
    at(s, 5.5, 5.8);
    s.player.held = newItem(s, 'scoop');
    expect(act(s)).toMatch(/нужен открытый мешок/);
    s.items.push({ ...newItem(s, 'bag', { fill: 0 }), x: 7, y: 5.5 });
    expect(act(s)).toBe('Убрать навоз в мешок');
    expect(s.dung).toHaveLength(0);
  });

  it('открытый вентиль переливает поилку в подстилку', () => {
    const s = cleanShift();
    s.elephants.forEach((e) => hold(e, 3, 7));
    s.valveOpen = true;
    advance(s, 20);
    expect(s.log.some((l) => l.why === 'troughOverflow')).toBe(true);
    expect(cellAt(s, 11.8, 2.4)!.cell.kind).toBe('wet');
  });
});
