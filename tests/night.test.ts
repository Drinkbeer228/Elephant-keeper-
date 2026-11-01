import { describe, expect, it } from 'vitest';
import { availableAction, walkable } from '../src/sim';
import { MAP } from '../src/data/map';
import { newItem } from '../src/sim/state';
import { finishShift } from '../src/sim/handover';
import { act, at, cleanShift, hold } from './helpers';

// Ночь, кипер с совком у кучи навоза в вольере
function nightPile(t = 900) {
  const s = cleanShift();
  s.elephants.forEach((e) => hold(e, 18, 3));
  s.t = t;
  s.dung.push({ id: 990, x: 5.5, y: 5.5, at: t });
  s.player.held = newItem(s, 'scoop');
  at(s, 5.5, 5.8);
  return s;
}

const switchSpot = () => ({ x: MAP.stations.lightSwitch.x + 0.5, y: MAP.stations.lightSwitch.y - 0.5 });

describe('ночь и дежурный свет', () => {
  it('ночью без дежурного света в вольере не видно, что убирать', () => {
    const s = nightPile();
    expect(availableAction(s)?.label).toBe('Темно — не видно, что убирать. Включи дежурный свет у двери дежурки');
  });

  it('с дежурным светом уборка работает', () => {
    const s = nightPile();
    s.dutyLight = true;
    expect(act(s)).toBe('Убрать навоз в совок (1/6)');
  });

  it('днём свет не нужен', () => {
    const s = nightPile(300);
    expect(act(s)).toBe('Убрать навоз в совок (1/6)');
  });

  it('выключатель у двери дежурки включает и выключает свет', () => {
    const s = cleanShift();
    const p = switchSpot();
    at(s, p.x, p.y);
    expect(act(s)).toBe('Включить дежурный свет');
    expect(s.dutyLight).toBe(true);
    expect(act(s)).toBe('Выключить дежурный свет');
    expect(s.dutyLight).toBe(false);
  });

  it('свет, забытый включённым к сдаче, — замечание', () => {
    const s = cleanShift();
    s.dutyLight = true;
    expect(finishShift(s).remarks).toContain('Дежурный свет не выключен');
  });
});

describe('хозяйственный проезд', () => {
  it('на проезд не выйти ни из кормовой, ни из навеса, ни с площадки контейнера', () => {
    expect(walkable(13.7, MAP.road.y0)).toBe(false); // задняя дверь кормовой закрыта
    expect(walkable(16.8, MAP.road.y0)).toBe(false); // перила за навесом
    expect(walkable(20.3, MAP.road.y0)).toBe(false); // перила у площадки
    expect(walkable(20.3, MAP.road.y0 + 1)).toBe(true); // сам проезд в мире есть — по нему ездит мусоровоз
  });
});
