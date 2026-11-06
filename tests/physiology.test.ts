import { describe, expect, it } from 'vitest';
import { runMinutes, step } from '../src/sim';
import { BEDDING, DRAIN, TOILET_STANCE } from '../src/data/facility';
import { cellOf } from '../src/sim/world';
import { rearPos } from '../src/sim/behavior/perceive';
import { game, park } from './helpers';

describe('физиология', () => {
  it('потребности растут со временем у всех слонов', () => {
    const s = game(1);
    const before = s.elephants.map((e) => ({ ...e.needs }));
    s.elephants.forEach((e) => park(e, e.x, e.y));
    runMinutes(s, 120);
    s.elephants.forEach((e, i) => {
      expect(e.needs.hunger).toBeGreaterThan(before[i].hunger);
      expect(e.needs.thirst).toBeGreaterThan(before[i].thirst);
      expect(e.needs.fatigue).toBeGreaterThan(before[i].fatigue);
    });
  });

  it('еда снижает голод и расходует сено из кормушки; при еде копится кишечник', () => {
    const s = game(2, 1);
    const e = s.elephants[0];
    e.needs.hunger = 85;
    e.needs.bowel = 10;
    s.world.feeders.barnRackW.hay = 60;
    s.world.feeders.barnRackE.hay = 60;
    runMinutes(s, 90);
    expect(e.needs.hunger).toBeLessThan(60);
    expect(s.world.feeders.barnRackW.hay + s.world.feeders.barnRackE.hay).toBeLessThan(120);
    expect(e.day.ate).toBeGreaterThan(20);
  });

  it('питьё снижает жажду, расходует воду и наполняет пузырь', () => {
    const s = game(3, 1);
    const e = s.elephants[0];
    e.needs.thirst = 85;
    e.needs.hunger = 5;
    e.needs.bladder = 5;
    s.world.troughs.barnWaterW.level = 60;
    s.world.troughs.barnWaterE.level = 60;
    runMinutes(s, 60);
    expect(e.needs.thirst).toBeLessThan(40);
    expect(s.world.troughs.barnWaterW.level + s.world.troughs.barnWaterE.level).toBeLessThan(120);
    expect(e.needs.bladder + e.day.urineBedding + e.day.urineOutside + e.day.urineDrain).toBeGreaterThan(5);
  });

  it('полный пузырь опустошается где угодно: на подстилке остаётся мокрое пятно', () => {
    const s = game(4, 1);
    const e = s.elephants[0];
    park(e, 16, 23.5);
    e.heading = 0;
    e.act.forced = false;
    e.needs.bladder = 100;
    const p = rearPos(e);
    const before = s.world.cells.wet[cellOf(p.x, p.y)];
    step(s);
    expect(e.act.kind).toBe('urinate');
    expect(e.needs.bladder).toBe(0);
    expect(s.world.cells.wet[cellOf(p.x, p.y)]).toBeGreaterThan(before + 0.3);
    expect(e.day.urineBedding).toBe(1);
  });

  it('физиология не зависит от доверия: недоверчивый слон всё равно мочится и испражняется', () => {
    const s = game(5, 1);
    const e = s.elephants[0];
    e.learned.trust = 0;
    e.learned.expectation = 0;
    e.learned.cooperation = 0;
    s.world.feeders.barnRackW.hay = 100;
    s.world.troughs.barnWaterW.level = 100;
    runMinutes(s, 600);
    expect(e.day.urineBedding + e.day.urineOutside + e.day.urineDrain).toBeGreaterThanOrEqual(1);
    expect(e.day.dung).toBeGreaterThanOrEqual(1);
  });

  it('навоз появляется там, где слон испражнился', () => {
    const s = game(6, 1);
    const e = s.elephants[0];
    park(e, 18, 23);
    e.act.forced = false;
    e.heading = Math.PI / 2;
    e.needs.bowel = 100;
    const n = s.world.dung.length;
    step(s);
    expect(s.world.dung.length).toBe(n + 1);
    const d = s.world.dung[s.world.dung.length - 1];
    expect(d.y).toBeLessThan(e.y);
    expect(d.zone).toBe('barn');
  });

  it('моча над стоком уходит в канализацию — подстилка остаётся сухой', () => {
    const s = game(7, 1);
    const e = s.elephants[0];
    // Место у стока: слониха стоит так, что зад — над решёткой стока
    park(e, TOILET_STANCE.x, TOILET_STANCE.y);
    e.heading = TOILET_STANCE.face;
    e.act.forced = false;
    e.needs.bladder = 100;
    const wetBefore = s.world.cells.wet.reduce((a, b) => a + b, 0);
    step(s);
    expect(e.day.urineDrain).toBe(1);
    expect(s.world.cells.wet.reduce((a, b) => a + b, 0)).toBeCloseTo(wetBefore, 3);
    expect(Math.hypot(rearPos(e).x - DRAIN.x, rearPos(e).y - DRAIN.y)).toBeLessThan(DRAIN.r);
  });

  it('залежавшийся навоз растаптывается в грязь', () => {
    const s = game(8, 1);
    const e = s.elephants[0];
    s.world.dung.push({ id: 999, x: 20, y: 24, t: s.t - 200, zone: 'barn' });
    park(e, 17, 24);
    e.act.forced = false;
    e.act = { ...e.act, kind: 'wander', phase: 'go', target: { t: 'point', x: 23, y: 24, face: null }, key: 'wander', dur: 0 };
    e.heading = 0;
    e.mem.nextThink = s.t + 100;
    runMinutes(s, 8);
    expect(s.world.dung.find((d) => d.id === 999)).toBeUndefined();
    expect(s.world.cells.soil[cellOf(20, 24)]).toBeGreaterThan(0.2);
    expect(BEDDING.x0).toBeLessThan(20);
  });
});
