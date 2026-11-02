import { BALANCE } from '../data/balance';
import { MAP, inPaddock } from '../data/map';
import { ELEPHANTS } from '../data/elephants';
import { dist } from './elephants';
import { cleared } from './floor';
import { route, walkable } from './nav';
import { chance, randomRange } from './rng';
import { takeStock } from './stock';
import { callTruck } from './barrow';
import type { Elephant, State } from './types';

const P = BALANCE.partner;
const K = BALANCE.container;

// Димон — второй дежурный кипер (ИИ-напарник): сам обслуживает нижний загон самцов.
// Ведёт «гулять» под свой бак, убирает навоз, носит сено из Сенника, следит за поилкой,
// копит мусор в своей тачке и вывозит его в общий бак у дороги.

interface Job {
  mode: string;
  target: () => { x: number; y: number } | null;
  done: (s: State) => boolean;
}

const MALES = () => ELEPHANTS.filter((p) => p.paddock === 'lower').map((p) => p.id);

function maleOf(state: State, id: string): Elephant {
  return state.elephants.find((e) => e.id === id)!;
}

// Очередное дело для нижнего загона; null — всё спокойно
function nextJob(state: State): Job | null {
  const s = state;

  // 1. Самец просится или с полным пузырём: встать под него с баком
  const care = s.elephants.find(
    (e) => MALES().includes(e.id) && (e.signalStarted !== undefined || (e.bladder >= P.bladderCare && e.state !== 'sleep')) && dist(s.partner, e) > BALANCE.elephant.bucketRadius,
  );
  if (care) {
    return {
      mode: 'toilet',
      target: () => {
        const e = maleOf(s, care.id);
        return { x: e.x + 0.55, y: e.y };
      },
      done: () => false, // ждать, пока не сходит в бак
    };
  }

  // 2. Бак Димона полон — вылить в слив мойки
  if (s.partner.bucket >= 40) {
    return {
      mode: 'dumpBucket',
      target: () => ({ x: MAP.stations.drain.x, y: MAP.stations.drain.y - 1.0 }),
      done: (st) => {
        if (dist(st.partner, { x: MAP.stations.drain.x, y: MAP.stations.drain.y - 1.0 }) < 0.9) {
          st.partner.bucket = 0;
          return true;
        }
        return false;
      },
    };
  }

  // 3. Навоз в нижнем загоне: свежие кучи и затоптанные клетки
  const lower = { x0: MAP.paddock2.x0, y0: MAP.paddock2.y0, x1: MAP.paddock2.x1, y1: MAP.paddock2.y1 };
  const pile = s.dung
    .filter((d) => d.x >= lower.x0 && d.x < lower.x1 && d.y >= lower.y0 && d.y < lower.y1)
    .sort((a, b) => dist(a, s.partner) - dist(b, s.partner))[0];
  if (pile) {
    return {
      mode: 'dung',
      target: () => (s.dung.includes(pile) ? { x: pile.x, y: pile.y + 0.5 } : null),
      done: (st) => {
        if (!st.dung.includes(pile)) return true;
        if (dist(st.partner, pile) < 1.0) {
          st.dung = st.dung.filter((d) => d !== pile);
          st.partner.waste += 1;
          return true;
        }
        return false;
      },
    };
  }
  const trampled = s.cells.findIndex((row, cy) =>
    row.some((c, cx) => c.kind === 'dung' && cx + MAP.floor.x >= lower.x0 && cx + MAP.floor.x < lower.x1 && cy + MAP.floor.y >= lower.y0 && cy + MAP.floor.y < lower.y1),
  );
  if (trampled >= 0) {
    const spot = { cy: trampled, cx: s.cells[trampled].findIndex((c) => c.kind === 'dung') };
    const target = { x: spot.cx + MAP.floor.x + 0.5, y: spot.cy + MAP.floor.y + 0.5 };
    return {
      mode: 'dung',
      target: () => target,
      done: (st) => {
        if (st.cells[spot.cy][spot.cx].kind !== 'dung') return true;
        if (dist(st.partner, target) < 1.0) {
          setCellCleared(st, spot.cx, spot.cy);
          st.partner.waste += 2;
          return true;
        }
        return false;
      },
    };
  }

  // 4. Сено: кормушка нижнего загона пустеет — тюк из Сенника
  if (s.feederHay2 < P.feederMin && s.stock.hay > 0) {
    if (s.partner.mode !== 'hayCarry') {
      return {
        mode: 'hayTake',
        target: () => ({ x: MAP.stations.hay.x, y: MAP.stations.hay.y - 1.2 }),
        done: (st) => {
          if (dist(st.partner, { x: MAP.stations.hay.x, y: MAP.stations.hay.y - 1.2 }) < 1.2) {
            st.partner.mode = 'hayCarry';
            takeStock(st, 'hay', 1);
            return true;
          }
          return false;
        },
      };
    }
    return {
      mode: 'hayCarry',
      target: () => ({ x: MAP.feeder2.x + 0.8, y: MAP.feeder2.y - 1.0 }),
      done: (st) => {
        if (dist(st.partner, { x: MAP.feeder2.x + 0.8, y: MAP.feeder2.y - 1.0 }) < 1.6) {
          st.feederHay2 = Math.min(100, st.feederHay2 + BALANCE.food.hayBale);
          return true;
        }
        return false;
      },
    };
  }

  // 5. Поилка нижнего загона: вентиль
  if (s.trough2 < P.troughMin && !s.valve2Open) {
    return {
      mode: 'valve',
      target: () => ({ x: MAP.stations.valve2.x, y: MAP.stations.valve2.y - 1.0 }),
      done: (st) => {
        if (dist(st.partner, { x: MAP.stations.valve2.x, y: MAP.stations.valve2.y - 1.0 }) < 1.2) {
          st.valve2Open = true;
          return true;
        }
        return false;
      },
    };
  }
  if (s.trough2 >= P.troughMax && s.valve2Open) {
    return {
      mode: 'valve',
      target: () => ({ x: MAP.stations.valve2.x, y: MAP.stations.valve2.y - 1.0 }),
      done: (st) => {
        if (dist(st.partner, { x: MAP.stations.valve2.x, y: MAP.stations.valve2.y - 1.0 }) < 1.2) {
          st.valve2Open = false;
          return true;
        }
        return false;
      },
    };
  }

  // 6. Мусор: тачка Димона полна — вывалить в бак у дороги
  if (s.partner.waste >= P.wasteBeforeDump) {
    return {
      mode: 'dumpWaste',
      target: () => ({ x: MAP.stations.dump.x, y: MAP.stations.dump.y - 1.4 }),
      done: (st) => {
        if (dist(st.partner, { x: MAP.stations.dump.x, y: MAP.stations.dump.y - 1.4 }) < 1.2) {
          const put = Math.min(st.partner.waste, Math.max(0, K.capacity - st.container.fill));
          st.container.fill += put;
          st.partner.waste -= put;
          if (st.container.fill >= K.capacity && st.container.truckAt === null) callTruck(st);
          return true;
        }
        return false;
      },
    };
  }

  return null;
}

function setCellCleared(state: State, cx: number, cy: number): void {
  state.cells[cy][cx] = { kind: cleared(cx, cy), since: state.t };
}

export function updatePartner(state: State, dt: number, dtReal: number): void {
  const p = state.partner;
  p.babbleAt -= dt;

  // Реплики Димона — чтобы игрок помнил, что нижний загон не брошен
  if (p.babbleAt <= 0) {
    p.babbleAt = P.babbleEvery + randomRange(state, -10, 10);
    const lines = [
      'Димон: нижний загон под контролем.',
      'Димон: Раджа — тот ещё характер.',
      'Димон: понесу мусор, тут убрал.',
      'Димон: самцы сено умяли в два счёта.',
    ];
    state.log.push({ kind: 'info', text: lines[Math.floor(state.rng % lines.length)] });
  }

  // Между делами — короткая пауза, потом выбирает новое
  if (p.timer > 0) {
    p.timer -= dt;
    p.mode = 'idle';
    return;
  }

  if (p.mode === 'idle' || p.mode === '' ) {
    const job = nextJob(state);
    if (job) {
      p.mode = job.mode;
      p.timer = 0;
    } else {
      // Пауза-патруль по нижнему коридору
      p.timer = randomRange(state, 4, 9);
      return;
    }
  }

  // Цель текущего дела — актуальная точка (самцы ходят)
  const job = nextJob(state) ?? null;
  const target = job?.target() ?? null;

  // Хвост toilet: стоим под самцом, пока тот не сходит; бак не растёт — ждём
  if (p.mode === 'toilet') {
    const e = state.elephants
      .filter((el) => MALES().includes(el.id) && (el.signalStarted !== undefined || el.bladder >= P.bladderCare))
      .sort((a, b) => dist(p, a) - dist(p, b))[0];
    if (!e) {
      p.mode = 'idle';
      p.timer = 1;
      return;
    }
    // Держаться в радиусе бака
    if (dist(p, e) > BALANCE.elephant.bucketRadius - 0.1) stepTo(state, { x: e.x + 0.55, y: e.y }, dtReal);
    return;
  }

  if (!target) {
    p.mode = 'idle';
    p.timer = 1;
    return;
  }
  if (job && job.done(state)) {
    // Взял тюк — сразу несёт в нижний загон
    if (p.mode === 'hayTake') p.mode = 'hayCarry';
    else {
      p.mode = 'idle';
      p.timer = randomRange(state, 1, 3);
    }
    return;
  }
  stepTo(state, target, dtReal);
}

// Шаг к цели по твёрдому полу и вольеру: сначала по прямой, потом оси по очереди
function stepTo(state: State, target: { x: number; y: number }, dtReal: number): void {
  const p = state.partner;
  const free = (x: number, y: number) => walkable(x, y, false, false) && (inPaddock(x, y) || x > MAP.forest.x1);
  if (!p.pathTarget || dist(p.pathTarget, target) > 0.5 || !p.path.length) {
    p.path = route(p, target);
    p.pathTarget = { ...target };
  }
  while (p.path.length > 1 && dist(p, p.path[0]) < 0.2) p.path.shift();
  const waypoint = p.path[0] ?? target;
  const d = dist(p, waypoint);
  if (d < 0.15) {
    p.path.shift();
    return;
  }
  const step = P.speed * dtReal;
  const nx = (waypoint.x - p.x) / d;
  const ny = (waypoint.y - p.y) / d;
  p.facing = { x: nx, y: ny };
  if (free(p.x + nx * step, p.y + ny * step)) {
    p.x += nx * step;
    p.y += ny * step;
  } else if (free(p.x + nx * step, p.y)) {
    p.x += nx * step;
  } else if (free(p.x, p.y + ny * step)) {
    p.y += ny * step;
  } else {
    // Упёрся — отступ в сторону
    p.x += (chance(state, 0.5) ? 1 : -1) * step;
  }
  p.x = Math.min(MAP.w - 0.5, Math.max(MAP.forest.x1 + 0.4, p.x));
  p.y = Math.min(MAP.h - 0.5, Math.max(0.5, p.y));
}
