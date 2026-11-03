import { BALANCE } from '../data/balance';
import { MAP, inPaddock } from '../data/map';
import { ELEPHANTS } from '../data/elephants';
import { dist } from './elephants';
import { emit, LOG_LIMIT } from './events';
import { cleared, sawdustAbsorbed, setCell } from './floor';
import { basinsOnRack, freeBasinSpot } from './items';
import { kashaDue, prepareMealBasins, startKasha } from './feeding';
import { route, walkable } from './nav';
import { chance, randomRange } from './rng';
import { giveStock, STOCK_LABELS, takeStock } from './stock';
import { callTruck } from './barrow';
import { deliveryAccessOpen } from './truck';
import type { Elephant, PartnerMode, State } from './types';

const P = BALANCE.partner;
const K = BALANCE.container;

// Димон — второй дежурный кипер (ИИ-напарник): сам обслуживает нижний загон самцов.
// Ведёт «гулять» под свой бак, убирает навоз, носит сено из Сенника, следит за поилкой,
// копит мусор в своей тачке и вывозит его в общий бак у дороги.

interface Job {
  mode: PartnerMode;
  target: () => { x: number; y: number } | null;
  done: (s: State) => boolean;
}

const MALES = () => ELEPHANTS.filter((p) => p.paddock === 'male').map((p) => p.id);

function maleOf(state: State, id: string): Elephant {
  return state.elephants.find((e) => e.id === id)!;
}

function toiletSpot(state: State, elephant: Elephant): { x: number; y: number } | null {
  const pool = MAP.pools[1];
  const heading = Math.atan2(elephant.y - pool.y, elephant.x - pool.x);
  const options = { gates: state.gates, deliveryOpen: deliveryAccessOpen(state) };
  for (let i = 0; i < 16; i++) {
    const angle = heading + (i * Math.PI) / 8;
    const candidate = { x: elephant.x + Math.cos(angle) * 0.9, y: elephant.y + Math.sin(angle) * 0.9 };
    if (walkable(candidate.x, candidate.y, options)) return candidate;
  }
  return null;
}

// Очередное дело для нижнего загона; null — всё спокойно
function nextJob(state: State): Job | null {
  const s = state;
  const carried = s.partner.foodBasin === null ? undefined : s.items.find((i) => i.id === s.partner.foodBasin && i.kind === 'basin');

  if (carried && s.partner.mode === 'basinCarry') {
    const owner = maleOf(s, carried.owner!);
    const slot = ELEPHANTS.find((e) => e.id === owner.id)!.slot;
    return {
      mode: 'basinCarry',
      target: () => ({ x: slot.x, y: slot.y + 0.6 }),
      done: (st) => {
        const basin = st.items.find((i) => i.id === st.partner.foodBasin && i.kind === 'basin');
        if (!basin || dist(st.partner, { x: slot.x, y: slot.y + 0.6 }) >= 0.9) return false;
        basin.x = slot.x;
        basin.y = slot.y;
        basin.droppedAt = st.t;
        if (basin.meal && basin.owner && st.meals[basin.meal][basin.owner] === null) st.meals[basin.meal][basin.owner] = st.t;
        st.partner.foodBasin = null;
        st.partner.mode = 'idle';
        return true;
      },
    };
  }
  if (carried && s.partner.mode === 'basinWash') {
    const target = { x: MAP.stations.drain.x, y: MAP.stations.drain.y - 0.8 };
    return {
      mode: 'basinWash',
      target: () => target,
      done: (st) => {
        const basin = st.items.find((i) => i.id === st.partner.foodBasin && i.kind === 'basin');
        if (!basin || dist(st.partner, target) >= 1) return false;
        basin.food = null;
        basin.dirty = false;
        basin.eatenAt = undefined;
        st.partner.mode = 'basinReturn';
        return true;
      },
    };
  }
  if (carried && s.partner.mode === 'basinReturn') {
    const spot = freeBasinSpot(s);
    if (!spot) return null;
    return {
      mode: 'basinReturn',
      target: () => spot,
      done: (st) => {
        const basin = st.items.find((i) => i.id === st.partner.foodBasin && i.kind === 'basin');
        if (!basin || dist(st.partner, spot) >= 0.8) return false;
        basin.x = spot.x;
        basin.y = spot.y;
        basin.owner = undefined;
        basin.droppedAt = st.t;
        st.partner.foodBasin = null;
        st.partner.mode = 'idle';
        return true;
      },
    };
  }

  const maleMealBasin = basinsOnRack(s).find((b) => b.kind === 'basin' && b.food && b.owner && MALES().includes(b.owner));
  if (!carried && maleMealBasin) {
    return {
      mode: 'basinPick',
      target: () => ({ x: maleMealBasin.x, y: maleMealBasin.y }),
      done: (st) => {
        if (!st.items.some((i) => i.id === maleMealBasin.id) || dist(st.partner, maleMealBasin) >= 1) return false;
        st.partner.foodBasin = maleMealBasin.id;
        st.partner.mode = 'basinCarry';
        return true;
      },
    };
  }

  const maleDirtyBasin = s.items.find((b) => b.kind === 'basin' && b.dirty && b.owner && MALES().includes(b.owner));
  if (!carried && maleDirtyBasin) {
    return {
      mode: 'basinCollect',
      target: () => ({ x: maleDirtyBasin.x, y: maleDirtyBasin.y }),
      done: (st) => {
        if (!st.items.some((i) => i.id === maleDirtyBasin.id) || dist(st.partner, maleDirtyBasin) >= 1) return false;
        st.partner.foodBasin = maleDirtyBasin.id;
        st.partner.mode = 'basinWash';
        return true;
      },
    };
  }

  const reservedPallet =
    s.partner.supplyPalletId === null
      ? undefined
      : s.supply.ground.find((pallet) => pallet.id === s.partner.supplyPalletId);
  if (reservedPallet) {
    if (reservedPallet.carriedBy !== 'partner') {
      return {
        mode: 'supplyPick',
        target: () => ({ x: reservedPallet.x, y: reservedPallet.y }),
        done: (st) => {
          const pallet = st.supply.ground.find((item) => item.id === reservedPallet.id);
          if (!pallet || pallet.reservedBy !== 'partner') {
            st.partner.supplyPalletId = null;
            return true;
          }
          if (dist(st.partner, pallet) >= 1) return false;
          pallet.carriedBy = 'partner';
          pallet.x = st.partner.x;
          pallet.y = st.partner.y;
          st.partner.mode = 'supplyCarry';
          emit(st, { kind: 'info', text: `Димон забрал паллету: ${pallet.cargo.map((unit) => STOCK_LABELS[unit.kind].toLowerCase()).join(' и ')}.` });
          return true;
        },
      };
    }

    const unit = reservedPallet.cargo[0];
    if (unit) {
      const station = MAP.stations[
        unit.kind === 'grain' ? 'stove'
          : unit.kind === 'veg' || unit.kind === 'fruit' ? 'vegRack'
            : unit.kind
      ];
      const target = unit.kind === 'grain'
        ? { x: station.x, y: station.y + 1.2 }
        : unit.kind === 'veg' || unit.kind === 'fruit'
          ? { x: station.x - 1.0, y: station.y }
          : { x: station.x, y: station.y - 1.2 };
      return {
        mode: 'supplyCarry',
        target: () => target,
        done: (st) => {
          const pallet = st.supply.ground.find((item) => item.id === reservedPallet.id && item.carriedBy === 'partner');
          if (!pallet || dist(st.partner, target) >= 1.0) return false;
          const delivered = pallet.cargo[0];
          if (!delivered) return false;
          giveStock(st, delivered.kind, delivered.qty);
          pallet.cargo.shift();
          emit(st, { kind: 'good', text: `Димон доставил на склад: ${STOCK_LABELS[delivered.kind].toLowerCase()} (${delivered.qty}).` });
          if (!pallet.cargo.length) {
            st.supply.ground = st.supply.ground.filter((item) => item.id !== pallet.id);
            st.partner.supplyPalletId = null;
          }
          return true;
        },
      };
    }
  }

  const unclaimedPallet = s.supply.ground.find((pallet) => !pallet.reservedBy && !pallet.carriedBy);
  if (unclaimedPallet) {
    return {
      mode: 'supplyPick',
      target: () => ({ x: unclaimedPallet.x, y: unclaimedPallet.y }),
      done: () => false,
    };
  }

  // Бак уже наполнился: сначала вылить в слив, чтобы не пропустить следующий сигнал.
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

  // Самец просится или с полным пузырём: встать под него с баком
  const care = s.elephants.find(
    (e) => MALES().includes(e.id) && (e.signalStarted !== undefined || (e.bladder >= P.bladderCare && e.state !== 'sleep')) && dist(s.partner, e) > BALANCE.elephant.bucketRadius,
  );
  if (care) {
    return {
      mode: 'toilet',
      target: () => toiletSpot(s, maleOf(s, care.id)),
      done: () => false, // ждать, пока не сходит в бак
    };
  }

  // Димон сам запаривает и раскладывает общий обед; женские миски оставляет киперу.
  if (s.kitchen.kasha.status === 'ready' && s.kitchen.kasha.portions > 0) {
    const target = { x: MAP.stations.stove.x, y: MAP.stations.stove.y + 1.2 };
    return {
      mode: 'mealPrep',
      target: () => target,
      done: (st) => {
        if (dist(st.partner, target) >= 1.2) return false;
        prepareMealBasins(st, 'kasha');
        return true;
      },
    };
  }
  const due = kashaDue(s);
  if (due && s.kitchen.kasha.status === 'idle' && s.stock.grain >= BALANCE.consumption.kashaGrain) {
    const target = { x: MAP.stations.stove.x, y: MAP.stations.stove.y + 1.2 };
    return {
      mode: 'mealCook',
      target: () => target,
      done: (st) => dist(st.partner, target) < 1.2 && startKasha(st),
    };
  }
  if (s.kitchen.veg.portions > 0 && !maleMealBasin) {
    const target = { x: MAP.stations.kitchen.x, y: MAP.stations.kitchen.y + 1.2 };
    return {
      mode: 'mealPrep',
      target: () => target,
      done: (st) => {
        if (dist(st.partner, target) >= 1.2) return false;
        prepareMealBasins(st, 'veg');
        return true;
      },
    };
  }

  // 3. Навоз в нижнем загоне: свежие кучи и затоптанные клетки
  const lower = MAP.complexes.male.bounds;
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

  const bedding = MAP.bedding2;
  const findCell = (matches: (kind: State['cells'][number][number]['kind'], cx: number, cy: number) => boolean) => {
    for (let cy = bedding.y; cy < bedding.y + bedding.rows; cy++) {
      for (let cx = bedding.x; cx < bedding.x + bedding.cols; cx++) {
        if (matches(s.cells[cy][cx].kind, cx, cy)) return { cx, cy, x: cx + 0.5, y: cy + 0.5 };
      }
    }
    return null;
  };
  const wetCell = findCell((kind) => kind === 'wet');
  if (wetCell) {
    return {
      mode: 'fork',
      target: () => wetCell,
      done: (st) => {
        if (st.cells[wetCell.cy][wetCell.cx].kind !== 'wet' || dist(st.partner, wetCell) >= 1) return false;
        setCell(st, wetCell.cx, wetCell.cy, 'bareWet');
        st.partner.waste++;
        return true;
      },
    };
  }
  const bareWet = s.stock.sawdust > 0 ? findCell((kind) => kind === 'bareWet') : null;
  if (bareWet) {
    return {
      mode: 'sawdust',
      target: () => bareWet,
      done: (st) => {
        if (st.cells[bareWet.cy][bareWet.cx].kind !== 'bareWet' || dist(st.partner, bareWet) >= 1 || !takeStock(st, 'sawdust')) return false;
        setCell(st, bareWet.cx, bareWet.cy, 'sawdust');
        return true;
      },
    };
  }
  const absorbedCell = findCell((kind, cx, cy) => kind === 'sawdust' && sawdustAbsorbed(s, s.cells[cy][cx]));
  if (absorbedCell) {
    return {
      mode: 'broom',
      target: () => absorbedCell,
      done: (st) => {
        if (st.cells[absorbedCell.cy][absorbedCell.cx].kind !== 'sawdust' || !sawdustAbsorbed(st, st.cells[absorbedCell.cy][absorbedCell.cx]) || dist(st.partner, absorbedCell) >= 1) return false;
        setCell(st, absorbedCell.cx, absorbedCell.cy, 'bare');
        st.partner.waste++;
        return true;
      },
    };
  }
  const bareCell = s.stock.straw > 0 ? findCell((kind) => kind === 'bare') : null;
  if (bareCell) {
    return {
      mode: 'straw',
      target: () => bareCell,
      done: (st) => {
        if (st.cells[bareCell.cy][bareCell.cx].kind !== 'bare' || dist(st.partner, bareCell) >= 1 || !takeStock(st, 'straw')) return false;
        let placed = 0;
        for (let cy = Math.max(bedding.y, bareCell.cy - 1); cy < Math.min(bedding.y + bedding.rows, bareCell.cy + 2) && placed < BALANCE.items.strawCharges; cy++) {
          for (let cx = Math.max(bedding.x, bareCell.cx - 1); cx < Math.min(bedding.x + bedding.cols, bareCell.cx + 2) && placed < BALANCE.items.strawCharges; cx++) {
            if (st.cells[cy][cx].kind === 'bare') {
              setCell(st, cx, cy, 'straw');
              placed++;
            }
          }
        }
        return true;
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
  if (p.knockdownTimer > 0) return;
  if (p.mode === 'recovering') {
    p.mode = 'idle';
    p.timer = 0;
  }
  const musthActive = state.elephants.some((e) => MALES().includes(e.id) && e.musthTimer > 0);
  if (musthActive) {
    if (p.mode !== 'flee') {
      p.path = [];
      p.pathTarget = null;
    }
    p.mode = 'flee';
    p.timer = 0;
    if (inPaddock(p.x, p.y)) {
      stepTo(state, { x: MAP.door2.x0 + 0.7, y: MAP.complexes.male.bounds.y1 + 0.5 }, dtReal);
    }
    return;
  }
  if (p.supplyPalletId !== null && !state.supply.ground.some((pallet) => pallet.id === p.supplyPalletId)) {
    p.supplyPalletId = null;
    if (p.mode === 'supplyPick' || p.mode === 'supplyCarry') {
      p.mode = 'idle';
      p.timer = 0;
    }
  }
  if (p.mode === 'flee') {
    p.mode = 'idle';
    p.timer = 0;
  }
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
    state.log.push({ kind: 'info', text: lines[Math.floor(randomRange(state, 0, lines.length))] });
    if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
  }

  // Между делами — короткая пауза, потом выбирает новое
  if (p.timer > 0) {
    p.timer -= dt;
    p.mode = 'idle';
    return;
  }

  if (p.mode === 'idle' || p.mode === '') {
    const job = nextJob(state);
    if (job) {
      if (job.mode === 'supplyPick' && p.supplyPalletId === null) {
        const pallet = state.supply.ground.find((item) => !item.reservedBy && !item.carriedBy);
        if (pallet) {
          pallet.reservedBy = 'partner';
          p.supplyPalletId = pallet.id;
        }
      }
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
    if (dist(p, e) > BALANCE.elephant.bucketRadius - 0.1) {
      const spot = toiletSpot(state, e);
      if (spot) stepTo(state, spot, dtReal);
    }
    return;
  }

  if (!target) {
    p.mode = 'idle';
    p.timer = 1;
    return;
  }
  const activeMode = p.mode;
  if (job && job.done(state)) {
    // Взял тюк — сразу несёт в нижний загон
    if (activeMode === 'hayTake') p.mode = 'hayCarry';
    else if (p.mode === activeMode) {
      p.mode = 'idle';
      p.timer = randomRange(state, 1, 3);
    }
    return;
  }
  stepTo(state, target, dtReal);
  if (p.foodBasin !== null) {
    const basin = state.items.find((i) => i.id === p.foodBasin);
    if (basin) {
      basin.x = p.x;
      basin.y = p.y;
    }
  }
  if (p.supplyPalletId !== null) {
    const pallet = state.supply.ground.find((item) => item.id === p.supplyPalletId && item.carriedBy === 'partner');
    if (pallet) {
      pallet.x = p.x;
      pallet.y = p.y;
    }
  }
}

// Шаг к цели по твёрдому полу и вольеру: сначала по прямой, потом оси по очереди
function stepTo(state: State, target: { x: number; y: number }, dtReal: number): void {
  const p = state.partner;
  const options = { gates: state.gates, deliveryOpen: deliveryAccessOpen(state) };
  const free = (x: number, y: number) => walkable(x, y, options) && (inPaddock(x, y) || x > MAP.forest.x1);
  if (!p.pathTarget || dist(p.pathTarget, target) > 0.5 || !p.path.length) {
    p.path = route(p, target, options);
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
