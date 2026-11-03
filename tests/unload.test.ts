import { describe, expect, it } from 'vitest';
import { advance, availableAction } from '../src/sim';
import { BALANCE } from '../src/data/balance';
import { MAP } from '../src/data/map';
import { act, at, cleanShift, stand } from './helpers';

const S = BALANCE.supply;

// Рохля у борта, кипер у борта
function atBort(s: ReturnType<typeof cleanShift>): void {
  at(s, MAP.stations.unload.x - 1.1, MAP.stations.unload.y);
  s.jack.x = MAP.stations.unload.x - 0.3;
  s.jack.y = MAP.stations.unload.y;
  s.jack.pushed = false;
  s.jack.cargo = null;
}

describe('разгрузка', () => {
  it('у борта: снять смешанный поддон на рохлю', () => {
    const s = cleanShift();
    advance(s, S.arriveAt + 0.5);
    atBort(s);
    const n0 = s.supply.bays.length;
    // Рохля рядом: меню объединяет «Везти рохлю» и снятие поддонов
    expect(act(s)).toBe('Рохля у борта…');
    expect(act(s, 'Зерно')).toBe('Зерно 4 + Фрукты 6');
    expect(s.supply.bays.length).toBe(n0 - 1);
    expect(s.jack.cargo).toEqual([
      { kind: 'grain', qty: 4 },
      { kind: 'fruit', qty: 6 },
    ]);
  });

  it('рохля с грузом у борта: её везут сдавать, а не снимают новый поддон', () => {
    const s = cleanShift();
    advance(s, S.arriveAt + 0.5);
    atBort(s);
    s.jack.cargo = [{ kind: 'veg', qty: 3 }];
    // Рохля рядом и занята — сначала довези этот груз
    expect(act(s)).toBe('Везти рохлю');

    s.jack.pushed = false;
    s.jack.x = MAP.jackStart.x;
    s.jack.y = MAP.jackStart.y; // рохля осталась в коридоре — у борта только объяснение
    expect(act(s)).toBe('Сначала сдай этот груз — рохля одна');
  });

  it('сдача смешанного поддона по частям: зерно и фрукты — у стола кормовой, овощи — у стеллажа', () => {
    const s = cleanShift();
    advance(s, S.arriveAt + 0.5);
    s.jack.pushed = true;
    s.jack.cargo = [
      { kind: 'grain', qty: 4 },
      { kind: 'fruit', qty: 6 },
    ];
    const g0 = s.stock.grain;
    const f0 = s.stock.fruit;
    stand(s, 'stove');
    s.jack.x = MAP.stations.stove.x;
    s.jack.y = MAP.stations.stove.y;
    expect(act(s)).toBe('Сдать груз: Зерно (4)');
    expect(s.stock.grain).toBe(g0 + 4);
    expect(s.jack.cargo).toEqual([{ kind: 'fruit', qty: 6 }]);
    stand(s, 'vegRack');
    s.jack.x = MAP.stations.vegRack.x;
    s.jack.y = MAP.stations.vegRack.y;
    expect(act(s)).toBe('Сдать груз: Фрукты (6)');
    expect(s.stock.fruit).toBe(f0 + 6);
    expect(s.jack.cargo).toBeNull();

    s.jack.cargo = [{ kind: 'veg', qty: 3 }];
    s.jack.x = MAP.stations.stove.x;
    s.jack.y = MAP.stations.stove.y;
    stand(s, 'stove');
    expect(availableAction(s)?.label).toBe('Поставить рохлю (Овощи)');
    stand(s, 'vegRack');
    s.jack.x = MAP.stations.vegRack.x;
    s.jack.y = MAP.stations.vegRack.y;
    expect(availableAction(s)?.label).toBe('Сдать груз: Овощи (3)');
    expect(act(s)).toBe('Сдать груз: Овощи (3)');
    expect(s.stock.veg).toBe(BALANCE.stockStart.veg + 3);
  });

  it('принял весь борт — грузовик уезжает без замечания', () => {
    const s = cleanShift();
    advance(s, S.arriveAt + 0.5);
    for (const bay of [...s.supply.bays]) {
      for (const unit of bay) {
        s.stock[unit.kind] += unit.qty;
      }
    }
    s.supply.bays = [];
    advance(s, S.leaveAt - s.t + 1);
    expect(s.supply.missed).toBe(false);
  });

  it('снимает все четыре паллеты на площадку и отпускает грузовик', () => {
    const s = cleanShift();
    advance(s, S.arriveAt + 0.5);
    atBort(s);

    for (let i = 0; i < 4; i++) {
      expect(act(s, 'На площадку:')).toMatch(/^На площадку:/);
    }

    expect(s.supply.bays).toHaveLength(0);
    expect(s.supply.ground).toHaveLength(4);
    expect(s.supply.left).toBe(true);
    expect(s.supply.missed).toBe(false);
    expect(s.log.some((event) => event.text?.includes('Груз принят'))).toBe(true);

    const pallet = s.supply.ground[0];
    s.jack.pushed = true;
    s.jack.x = pallet.x;
    s.jack.y = pallet.y;
    at(s, pallet.x - 0.5, pallet.y);
    expect(act(s)).toMatch(/^Поднять паллету на рохлю:/);
    expect(s.supply.ground).toHaveLength(3);
    expect(s.jack.cargo).toEqual(pallet.cargo);
  });

  it.each([
    ['grain', 'stove'],
    ['veg', 'vegRack'],
    ['fruit', 'vegRack'],
    ['hay', 'hay'],
    ['straw', 'straw'],
    ['sawdust', 'sawdust'],
  ] as const)('сдаёт груз %s у соответствующей точки склада', (kind, station) => {
    const s = cleanShift();
    const before = s.stock[kind];
    s.jack.pushed = true;
    s.jack.cargo = [{ kind, qty: 1 }];
    s.jack.x = MAP.stations[station].x;
    s.jack.y = MAP.stations[station].y;
    at(s, s.jack.x - 0.6, s.jack.y);

    expect(act(s)).toBe(`Сдать груз: ${kind === 'grain' ? 'Зерно' : kind === 'veg' ? 'Овощи' : kind === 'fruit' ? 'Фрукты' : kind === 'hay' ? 'Сено' : kind === 'straw' ? 'Солома' : 'Опилки'} (1)`);
    expect(s.stock[kind]).toBe(before + 1);
    expect(s.jack.cargo).toBeNull();
  });
});
