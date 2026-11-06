// Уборка — у каждого инструмента своё дело:
//   лопата — навоз, мокрая и грязная подстилка, опилки, кучи сора, паданцы и осколки (в тачку);
//   метла — рассыпанное сено и солома на твёрдом полу (в кучу, кучу — лопатой);
//   швабра — вода и моча на бетоне и полу помещений (отжимать в мойке);
//   грабли — сор и яблоки на песке выгула, взрыхлить слежавшуюся подстилку;
//   опилки — быстро подсушить мокрую подстилку (потом всё равно вынести);
//   тюк соломы — свежая подстилка на вычищенное; шланг — смыть бетон в сток.

import { FLOOR, FOOD, KEEPER } from '../../data/balance';
import { DRAIN, areaAt, hardFloor, zoneAt } from '../../data/facility';
import { fx, log } from '../events';
import { dist } from '../geometry';
import type { ActionOption, ActionRef, State } from '../types';
import { cellCenter, cellOf, forCells, isBeddingCell, touchCells } from '../world';
import { near, off, opt, type KCtx } from './common';
import { hoseUsable } from './hose';

// Точка перед кипером, куда он тянется инструментом
function front(c: KCtx, k = 0.65): { x: number; y: number } {
  return { x: c.k.x + Math.cos(c.k.facing) * k, y: c.k.y + Math.sin(c.k.facing) * k };
}

// Где кипер может работать с полом: в зале и на выгуле — там, где стоит сам, среди слонов;
// во дворах и помещениях — на твёрдом полу
function workable(c: KCtx, x: number, y: number): boolean {
  const a = areaAt(x, y);
  if (a) return c.area === a; // внутри вольера — только в той части, где стоишь сам
  return hardFloor(x, y);
}

// Самая грязная клетка подстилки или бетона рядом: мокрое, грязь, опилки
function dirtyCell(c: KCtx): { i: number; what: 'wet' | 'soil' | 'sawdust' } | null {
  const w = c.w.cells;
  const p = front(c);
  let best: { i: number; what: 'wet' | 'soil' | 'sawdust' } | null = null;
  let bestV = 0.14;
  forCells(p.x, p.y, 1.1, (i, cx, cy) => {
    if (!zoneAt(cx, cy) || !workable(c, cx, cy)) return;
    const paddock = zoneAt(cx, cy) === 'paddock';
    const wet = w.wet[i] * (paddock ? 0.35 : 1);
    const cand: [number, 'wet' | 'soil' | 'sawdust'][] = [
      [wet, 'wet'],
      [w.soil[i], 'soil'],
      [w.sawdust[i] * 0.9, 'sawdust'],
    ];
    for (const [v, what] of cand) {
      if (v > bestV) {
        bestV = v;
        best = { i, what };
      }
    }
  });
  return best;
}

function litterAround(c: KCtx, r: number, hard: boolean): number {
  const w = c.w.cells;
  const p = front(c, 0.8);
  let sum = 0;
  forCells(p.x, p.y, r, (i, cx, cy) => {
    if (isBeddingCell(i)) return;
    if (hard !== hardFloor(cx, cy)) return;
    if (!workable(c, cx, cy)) return;
    sum += w.litter[i];
  });
  return sum;
}

function wetHardAround(c: KCtx): number {
  const w = c.w.cells;
  const p = front(c, 0.7);
  let n = 0;
  forCells(p.x, p.y, FLOOR.mopRadius, (i, cx, cy) => {
    if (isBeddingCell(i) || !hardFloor(cx, cy) || !workable(c, cx, cy)) return;
    if (w.wet[i] > 0.15) n++;
  });
  return n;
}

export function cleaningOptions(c: KCtx, out: ActionOption[]): void {
  const { s, k, w, h } = c;
  if (!h || c.pushing) return;
  const group = 'Уборка';
  const b = w.barrow;
  const barrowOk = c.barrowNear && !b.cargo.some((x) => x.kind === 'hay' || x.kind === 'straw' || x.kind === 'browse' || x.kind === 'bamboo' || x.kind === 'tub' || x.kind === 'porridge' || x.kind === 'ration');
  if (h.kind === 'shovel') {
    if (h.load > 0) {
      if (c.barrowNear) {
        if (!barrowOk) out.push(off({ verb: 'dumpShovel', target: 'barrow' }, 'Скинуть в тачку', 'В тачке корм — грязь туда нельзя', 96, { group }));
        else if (b.load >= KEEPER.barrowMax) out.push(off({ verb: 'dumpShovel', target: 'barrow' }, 'Скинуть в тачку', 'Тачка полна — отвези в контейнер', 96, { group }));
        else out.push(opt({ verb: 'dumpShovel', target: 'barrow' }, `Скинуть с лопаты в тачку (${b.load}/${KEEPER.barrowMax})`, 97, { group, timed: true }));
      } else if (near(s, 'container', 2.4)) out.push(opt({ verb: 'dumpShovel', target: 'container' }, 'Скинуть с лопаты в контейнер', 98, { group, timed: true }));
      else out.push(off({ verb: 'dumpShovel', target: 'barrow' }, 'Скинуть с лопаты', 'Лопата полна — подкати тачку поближе', 60, { group }));
      return;
    }
    const p = front(c);
    const dung = w.dung.filter((d) => dist(d, p) <= 1.25 && workable(c, d.x, d.y)).sort((a, q) => dist(a, p) - dist(q, p))[0];
    if (dung) out.push(opt({ verb: 'shovel', target: `dung:${dung.id}` }, 'Подцепить навоз лопатой', 120, { group, timed: true }));
    const pile = w.items.filter((it) => (it.kind === 'pile' || it.kind === 'shard') && dist(it, p) <= 1.3 && workable(c, it.x, it.y)).sort((a, q) => dist(a, p) - dist(q, p))[0];
    if (pile) out.push(opt({ verb: 'shovel', target: `item:${pile.id}` }, pile.kind === 'shard' ? 'Собрать осколки таза' : 'Собрать кучу сора лопатой', 112, { group, timed: true }));
    const food = w.food
      .filter((f) => (f.kind === 'remains' || f.kind === 'fruit' || ((f.kind === 'hay' || f.kind === 'straw') && f.amount < 3)) && dist(f, p) <= 1.3 && workable(c, f.x, f.y))
      .sort((a, q) => dist(a, p) - dist(q, p))[0];
    if (food) out.push(opt({ verb: 'shovel', target: `food:${food.id}` }, food.kind === 'fruit' ? (food.rot >= FOOD.fruitFerment ? 'Убрать гнилые паданцы' : 'Собрать паданцы') : 'Убрать объедки', 108, { group, timed: true }));
    const cell = dirtyCell(c);
    if (cell) {
      const bed = isBeddingCell(cell.i);
      const label = cell.what === 'sawdust' ? 'Выбрать опилки с мокрой соломой' : cell.what === 'wet' ? (bed ? 'Выбрать мокрую подстилку' : 'Соскрести мокрое с бетона') : bed ? 'Выбрать грязную подстилку' : 'Соскрести грязь';
      out.push(opt({ verb: 'shovel', target: `cell:${cell.i}` }, label, 115, { group, timed: true }));
    }
    return;
  }
  if (h.kind === 'broom') {
    const litter = litterAround(c, FLOOR.sweepRadius, true);
    if (litter > 0.12) out.push(opt({ verb: 'sweep', target: 'here' }, 'Подмести сено и солому в кучу', 110, { group, timed: true }));
    else if (litterAround(c, FLOOR.sweepRadius, false) > 0.12) out.push(off({ verb: 'sweep', target: 'here' }, 'Подмести', 'На песке и подстилке метлой не метут — тут грабли', 20, { group }));
    return;
  }
  if (h.kind === 'mop') {
    const n = wetHardAround(c);
    if (h.load >= 1) {
      if (n > 0) out.push(off({ verb: 'mop', target: 'here' }, 'Протереть шваброй', 'Швабра мокрая — отожми в мойке', 90, { group }));
    } else if (n > 0) out.push(opt({ verb: 'mop', target: 'here' }, 'Протереть пол шваброй', 110, { group, timed: true }));
    else if (c.area && isBeddingCell(cellOf(k.x, k.y))) out.push(off({ verb: 'mop', target: 'here' }, 'Протереть шваброй', 'Подстилку шваброй не моют — мокрое выбирают лопатой', 15, { group }));
    if (h.load > 0.05 && (near(s, 'washSink', 1.4) || near(s, 'kitchenSink', 1.4))) out.push(opt({ verb: 'wring', target: 'sink' }, 'Отжать швабру', 92, { group, timed: true }));
    return;
  }
  if (h.kind === 'rake') {
    if (c.area === 'paddock') {
      const p = front(c, 0.8);
      const fruit = w.food.some((f) => f.kind === 'fruit' && dist(f, p) < FLOOR.rakeRadius + 0.3);
      if (litterAround(c, FLOOR.rakeRadius, false) > 0.12 || fruit) out.push(opt({ verb: 'rake', target: 'pile' }, fruit ? 'Сгрести паданцы и сор в кучу' : 'Сгрести сор в кучу', 105, { group, timed: true }));
    } else if (c.area) {
      // Взрыхлить слежавшуюся подстилку (без мокрого и грязи)
      let n = 0;
      forCells(k.x, k.y, FLOOR.rakeRadius, (i) => {
        if (isBeddingCell(i) && w.cells.bedding[i] > 0.25 && w.cells.bedding[i] < 0.85 && w.cells.wet[i] < 0.2 && w.cells.soil[i] < 0.2) n++;
      });
      if (n > 0) out.push(opt({ verb: 'rake', target: 'fluff' }, 'Взрыхлить подстилку граблями', 70, { group, timed: true }));
    }
    return;
  }
  if (h.kind === 'sawdust') {
    if (!c.area) return;
    let n = 0;
    forCells(k.x, k.y, 1.3, (i) => {
      if (isBeddingCell(i) && w.cells.wet[i] > 0.25) n++;
    });
    if (n > 0) out.push(opt({ verb: 'sawdust', target: 'here' }, `Посыпать мокрое опилками (мешок: ${h.load})`, 100, { group, timed: true }));
    return;
  }
  if (h.kind === 'straw' && c.area && c.area !== 'paddock') {
    const st = strawTargets(c);
    if (st.dirty > 0 && st.bare === 0) out.push(off({ verb: 'spreadStraw', target: 'here' }, 'Расстелить солому', 'Здесь мокро или грязно — сначала выбери лопатой', 100, { group }));
    else if (st.bare > 0) out.push(opt({ verb: 'spreadStraw', target: 'here' }, `Расстелить солому (${st.bare} м²)`, 105, { group, timed: true }));
    else out.push(off({ verb: 'spreadStraw', target: 'here' }, 'Расстелить солому', 'Здесь подстилка и так свежая', 30, { group }));
    return;
  }
  if (h.kind === 'hose' && hoseUsable(s)) {
    // Смыть бетон: в зале или во дворе
    const p = front(c, 0.9);
    let dirty = 0;
    forCells(p.x, p.y, FLOOR.hoseRadius, (i, cx, cy) => {
      if (isBeddingCell(i) || !workable(c, cx, cy) || !hardFloor(cx, cy)) return;
      dirty += w.cells.soil[i] + w.cells.litter[i] * 0.5;
    });
    if (dirty > 0.2) out.push(opt({ verb: 'hoseFloor', target: 'here' }, 'Смыть грязь с бетона', 102, { group, timed: true }));
  }
}

function strawTargets(c: KCtx): { bare: number; dirty: number } {
  const cells = c.w.cells;
  let bare = 0;
  let dirty = 0;
  forCells(c.k.x, c.k.y, FLOOR.baleRadius, (i) => {
    if (!isBeddingCell(i)) return;
    if (cells.wet[i] > 0.2 || cells.soil[i] > 0.2 || cells.sawdust[i] > 0.2) dirty++;
    else if (cells.bedding[i] < 0.7) bare++;
  });
  return { bare, dirty };
}

// Куча сора: сливаем с ближайшей, если она рядом
function addPile(s: State, x: number, y: number, amount: number): void {
  const near = s.world.items.find((it) => it.kind === 'pile' && Math.hypot(it.x - x, it.y - y) < 1.2);
  if (near) near.load += amount;
  else s.world.items.push({ id: s.nextId++, kind: 'pile', x, y, load: amount, aux: 0, owner: null });
}

export function applyCleaning(s: State, ref: ActionRef): boolean {
  const k = s.keeper;
  const w = s.world;
  const h = k.held;
  const c = w.cells;
  const fr = (d = 0.65) => ({ x: k.x + Math.cos(k.facing) * d, y: k.y + Math.sin(k.facing) * d });
  switch (ref.verb) {
    case 'shovel': {
      if (h?.kind !== 'shovel' || h.load > 0) return true;
      const [kind, idStr] = ref.target.split(':');
      const id = Number(idStr);
      if (kind === 'dung') {
        const d = w.dung.find((x) => x.id === id);
        if (!d) return true;
        w.dung = w.dung.filter((x) => x !== d);
        fx('shovel', d.x, d.y);
      } else if (kind === 'item') {
        const it = w.items.find((x) => x.id === id);
        if (!it) return true;
        w.items = w.items.filter((x) => x !== it);
        fx('shovel', it.x, it.y);
      } else if (kind === 'food') {
        const f = w.food.find((x) => x.id === id);
        if (!f) return true;
        // Паданцы рядом — все разом
        w.food = w.food.filter((x) => x !== f && !(x.kind === 'fruit' && f.kind === 'fruit' && Math.hypot(x.x - f.x, x.y - f.y) < 0.9));
        fx('shovel', f.x, f.y);
      } else if (kind === 'cell') {
        const p = cellCenter(id);
        let removed = 0;
        forCells(p.x, p.y, FLOOR.shovelRadius, (i, cx, cy) => {
          if (!zoneAt(cx, cy)) return;
          const v = c.wet[i] + c.soil[i] + c.sawdust[i];
          if (v < 0.1) return;
          removed += v;
          c.soil[i] = 0;
          c.sawdust[i] = 0;
          if (zoneAt(cx, cy) === 'barn') {
            c.wet[i] = 0;
            if (isBeddingCell(i)) c.bedding[i] = 0; // мокрую солому выносят — под ней голый пол
          } else c.wet[i] = Math.max(0, c.wet[i] - 0.6);
        });
        if (removed <= 0) return true;
        touchCells(s);
        fx('shovel', p.x, p.y);
      }
      h.load = 1;
      return true;
    }
    case 'dumpShovel': {
      if (h?.kind !== 'shovel' || h.load <= 0) return true;
      if (ref.target === 'container') w.container = Math.min(KEEPER.containerMax, w.container + 1);
      else w.barrow.load = Math.min(KEEPER.barrowMax, w.barrow.load + 1);
      h.load = 0;
      fx('dump', k.x, k.y);
      return true;
    }
    case 'sweep': {
      if (h?.kind !== 'broom') return true;
      const p = fr(0.8);
      let sum = 0;
      forCells(p.x, p.y, FLOOR.sweepRadius, (i, cx, cy) => {
        if (isBeddingCell(i) || !hardFloor(cx, cy)) return;
        const a = areaAt(cx, cy);
        if (a && a !== areaAt(k.x, k.y)) return;
        sum += c.litter[i];
        c.litter[i] = 0;
      });
      if (sum > 0) {
        addPile(s, p.x, p.y, sum);
        touchCells(s);
        fx('sweep', p.x, p.y);
      }
      return true;
    }
    case 'mop': {
      if (h?.kind !== 'mop' || h.load >= 1) return true;
      const p = fr(0.7);
      let n = 0;
      forCells(p.x, p.y, FLOOR.mopRadius, (i, cx, cy) => {
        if (isBeddingCell(i) || !hardFloor(cx, cy) || c.wet[i] <= 0.15) return;
        const a = areaAt(cx, cy);
        if (a && a !== areaAt(k.x, k.y)) return;
        c.wet[i] = 0;
        n++;
      });
      if (n > 0) {
        h.load = Math.min(1, h.load + n / FLOOR.mopCells);
        touchCells(s);
        fx('mop', p.x, p.y);
      }
      return true;
    }
    case 'wring':
      if (h?.kind === 'mop') {
        h.load = 0;
        fx('wring', k.x, k.y);
      }
      return true;
    case 'rake': {
      if (h?.kind !== 'rake') return true;
      if (ref.target === 'fluff') {
        forCells(k.x, k.y, FLOOR.rakeRadius, (i) => {
          if (isBeddingCell(i) && c.wet[i] < 0.2 && c.soil[i] < 0.2) c.bedding[i] = Math.min(1, c.bedding[i] + 0.25);
        });
        touchCells(s);
        fx('rake', k.x, k.y);
        return true;
      }
      const p = fr(0.8);
      let sum = 0;
      forCells(p.x, p.y, FLOOR.rakeRadius, (i, cx, cy) => {
        if (zoneAt(cx, cy) !== 'paddock') return;
        sum += c.litter[i];
        c.litter[i] = 0;
      });
      const fruit = w.food.filter((f) => f.kind === 'fruit' && dist(f, p) < FLOOR.rakeRadius + 0.3);
      if (fruit.length) {
        w.food = w.food.filter((f) => !fruit.includes(f));
        sum += fruit.length * 0.4;
      }
      if (sum > 0) {
        addPile(s, p.x, p.y, sum);
        touchCells(s);
        fx('rake', p.x, p.y);
      }
      return true;
    }
    case 'sawdust': {
      if (h?.kind !== 'sawdust' || h.load <= 0) return true;
      let n = 0;
      forCells(k.x, k.y, 1.3, (i) => {
        if (!isBeddingCell(i) || c.wet[i] <= 0.25) return;
        c.wet[i] *= 1 - FLOOR.sawdustAbsorb;
        c.sawdust[i] = 1;
        n++;
      });
      if (n > 0) {
        h.load--;
        touchCells(s);
        fx('sawdust', k.x, k.y);
        if (h.load <= 0) {
          k.held = null;
          log(s, 'info', 'Мешок опилок кончился.', { silent: true });
        }
      }
      return true;
    }
    case 'spreadStraw': {
      if (h?.kind !== 'straw') return true;
      forCells(k.x, k.y, FLOOR.baleRadius, (i) => {
        if (!isBeddingCell(i) || c.wet[i] > 0.2 || c.soil[i] > 0.2 || c.sawdust[i] > 0.2) return;
        c.bedding[i] = 1;
        c.litter[i] = 0;
      });
      touchCells(s);
      k.held = null;
      fx('straw', k.x, k.y);
      return true;
    }
    case 'hoseFloor': {
      if (h?.kind !== 'hose') return true;
      const p = fr(0.9);
      forCells(p.x, p.y, FLOOR.hoseRadius, (i, cx, cy) => {
        if (isBeddingCell(i) || !hardFloor(cx, cy)) return;
        const a = areaAt(cx, cy);
        if (a && a !== areaAt(k.x, k.y)) return;
        c.soil[i] = 0;
        c.litter[i] = 0;
        // У стока вода уходит, на остальном бетоне остаётся лужа — её добирают шваброй
        c.wet[i] = Math.hypot(cx - DRAIN.x, cy - DRAIN.y) < 3 ? 0 : Math.max(c.wet[i], 0.35);
      });
      touchCells(s);
      fx('spray', p.x, p.y);
      return true;
    }
  }
  return false;
}
