import { describe, expect, it } from 'vitest';
import { availableAction } from '../src/sim';
import { MAP } from '../src/data/map';
import { newItem } from '../src/sim/state';
import { act, at, cleanShift, hold, stand } from './helpers';

// Кипер с совком в руках (со стойки), слонихи отведены на траву
function withScoop(load = 0) {
  const s = cleanShift();
  s.elephants.forEach((e) => hold(e, 18, 3));
  const scoop = s.items.find((i) => i.kind === 'scoop')!;
  s.items = s.items.filter((i) => i !== scoop);
  scoop.load = load;
  scoop.dirty = load > 0;
  s.player.held = scoop;
  return s;
}

describe('совок с отсеком', () => {
  it('без тачки и мешка навоз — в отсек, до 6 единиц', () => {
    const s = withScoop();
    for (let i = 0; i < 7; i++) s.dung.push({ id: 900 + i, x: 2 + i * 1.5, y: 5.5, at: 0 });
    for (let i = 0; i < 6; i++) {
      at(s, 2 + i * 1.5, 5.8);
      expect(act(s)).toBe(`Убрать навоз в совок (${i + 1}/6)`);
    }
    expect(s.player.held!.load).toBe(6);
    at(s, 2 + 6 * 1.5, 5.8);
    expect(availableAction(s)?.label).toBe('Совок полон — высыпи в тачку, мешок или контейнер');
    expect(s.dung).toHaveLength(1);
  });

  it('затоптанная клетка — 2 единицы', () => {
    const s = withScoop();
    s.cells[3][3] = { kind: 'dung', since: 0 };
    at(s, MAP.bedding.x + 3.5, MAP.bedding.y + 3.5);
    expect(act(s)).toBe('Счистить затоптанный навоз в совок (2/6)');
    expect(s.player.held!.load).toBe(2);
    expect(s.cells[3][3].kind).toBe('bare');
  });

  it('рядом тачка — навоз сразу в тачку, отсек пуст', () => {
    const s = withScoop();
    Object.assign(s.barrow, { x: 5, y: 4, pushed: false });
    s.dung.push({ id: 950, x: 4, y: 5.5, at: 0 });
    at(s, 4, 5.8);
    expect(act(s)).toBe('Убрать навоз в тачку');
    expect(s.barrow.waste).toBe(1);
    expect(s.player.held!.load ?? 0).toBe(0);
  });

  it('высыпать в тачку', () => {
    const s = withScoop(4);
    Object.assign(s.barrow, { x: 7, y: 10.6, pushed: false });
    at(s, 7, 10.0 + 0.5);
    expect(act(s)).toBe('Высыпать совок в тачку');
    expect(s.barrow.waste).toBe(4);
    expect(s.player.held!.load).toBe(0);
  });

  it('высыпать в мешок — сколько влезет', () => {
    const s = withScoop(5);
    at(s, 7, 10.5);
    s.items.push({ ...newItem(s, 'bag', { fill: 3 }), x: 7.6, y: 10.6 });
    expect(act(s)).toBe('Высыпать совок в мешок');
    expect(s.items.find((i) => i.kind === 'bag')!.fill).toBe(6);
    expect(s.player.held!.load).toBe(2);
  });

  it('высыпать в контейнер', () => {
    const s = withScoop(2);
    stand(s, 'dump');
    expect(act(s)).toBe('Высыпать совок в контейнер');
    expect(s.container.fill).toBe(2);
    expect(s.player.held!.load).toBe(0);
  });

  it('совок с навозом в тачку — навоз высыпается в тачку, не пропадает', () => {
    const s = withScoop(3);
    Object.assign(s.barrow, { x: 7, y: 10.6, pushed: false });
    at(s, 7, 10.5);
    act(s);
    expect(act(s)).toBe('Положить в тачку: совок со скребком');
    expect(s.barrow.tools).toContain('scoop');
    expect(s.barrow.waste).toBe(3);
  });

  it('мыть совок можно только пустым', () => {
    const s = withScoop(2);
    stand(s, 'wash');
    expect(availableAction(s)?.label ?? '').not.toBe('Вымыть совок');
    s.player.held!.load = 0;
    expect(availableAction(s)?.label).toBe('Вымыть совок');
  });
});
