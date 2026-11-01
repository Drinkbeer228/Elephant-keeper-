import { BALANCE } from '../data/balance';
import { ELEPHANTS } from '../data/elephants';
import { MAP } from '../data/map';
import { randomInt } from './rng';
import type { Elephant, Item, State } from './types';

export interface ShiftOptions {
  mess?: boolean; // ночная грязь на подстилке, по умолчанию есть
}

export function createShift(seed: number, opts: ShiftOptions = {}): State {
  const state: State = {
    seed,
    rng: seed,
    phase: 'shift',
    t: 0,
    nextItemId: 1,
    player: { x: MAP.playerStart.x, y: MAP.playerStart.y, held: null, facing: { x: 0, y: -1 } },
    elephants: ELEPHANTS.map(createElephant),
    cells: Array.from({ length: MAP.bedding.rows }, () =>
      Array.from({ length: MAP.bedding.cols }, () => ({ kind: 'straw' as const, since: 0 })),
    ),
    dung: [],
    items: [],
    kitchen: {
      kasha: { status: 'idle', readyAt: 0, portions: 0, meal: null },
      veg: { stage: 0, nextAt: 0, portions: 0 },
    },
    feederHay: BALANCE.food.hayStart,
    trough: 80,
    valveOpen: false,
    lastOverflow: 0,
    gateOpen: false,
    barrow: {
      x: MAP.barrowStart.x,
      y: MAP.barrowStart.y,
      pushed: false,
      tools: [],
      sawdust: 0,
      straw: 0,
      bales: 0,
      waste: 0,
      balance: 0,
      parkedAt: 0,
    },
    container: { fill: 0, doorClosed: false, ramp: false, truckAt: null, truckLeftAt: null },
    spareBucket: true,
    meals: {
      kasha1: Object.fromEntries(ELEPHANTS.map((p) => [p.id, null])),
      kasha2: Object.fromEntries(ELEPHANTS.map((p) => [p.id, null])),
      dinner: Object.fromEntries(ELEPHANTS.map((p) => [p.id, null])),
    },
    stats: {
      drySamples: 0,
      drySum: 0,
      lastDryCheck: 0,
      lastSpread: 0,
      broken: [],
      basinsLost: 0,
      bagsOut: 0,
      begTreats: 0,
      hintsShown: [],
    },
    log: [],
    report: null,
  };

  const spots = MAP.rackSpots;
  addItem(state, 'bucket', spots.bucket.x, spots.bucket.y, { liters: 0, dirty: false });
  addItem(state, 'scoop', spots.scoop.x, spots.scoop.y, { dirty: false });
  addItem(state, 'fork', spots.fork.x, spots.fork.y);
  addItem(state, 'broom', spots.broom.x, spots.broom.y);
  // Тазы — чистые, на стеллаже в кормовой
  MAP.basinSpots.slice(0, BALANCE.food.basins).forEach((p) => addItem(state, 'basin', p.x, p.y, { food: null, dirty: false }));

  if (opts.mess !== false) addNightMess(state);
  return state;
}

function createElephant(p: (typeof ELEPHANTS)[number]): Elephant {
  return {
    id: p.id,
    x: p.start.x,
    y: p.start.y,
    tx: p.start.x,
    ty: p.start.y,
    state: 'idle',
    next: 'idle',
    timer: 2,
    hunger: 35,
    thirst: 25,
    bladder: 20 + p.signalLead * 3,
    bowel: 30,
    boredom: 20,
    trust: p.trust,
    footDebt: 0,
    footDebtStart: 0,
    limp: false,
    lyingInWet: false,
    praiseUntil: -1,
    begTreats: 0,
    dirtyFeet: 0,
    lastCell: '',
    tally: { inBucket: 0, missed: 0, dung: 0 },
  };
}

export function addItem(state: State, kind: Item['kind'], x: number, y: number, extra: Partial<Item> = {}): Item {
  const item: Item = { id: state.nextItemId++, kind, x, y, droppedAt: state.t, ...extra };
  state.items.push(item);
  return item;
}

export function newItem(state: State, kind: Item['kind'], extra: Partial<Item> = {}): Item {
  return { id: state.nextItemId++, kind, x: 0, y: 0, droppedAt: state.t, ...extra };
}

function addNightMess(state: State): void {
  const b = MAP.bedding;
  const wet = randomInt(state, 3, 5);
  for (let i = 0; i < wet; i++) {
    const cx = randomInt(state, 0, b.cols - 1);
    const cy = randomInt(state, 0, b.rows - 1);
    state.cells[cy][cx] = { kind: 'wet', since: 0 };
  }
  const piles = randomInt(state, 2, 3);
  for (let i = 0; i < piles; i++) {
    state.dung.push({
      id: state.nextItemId++,
      x: b.x + randomInt(state, 0, b.cols - 1) + 0.5,
      y: b.y + randomInt(state, 0, b.rows - 1) + 0.5,
      at: 0,
    });
  }
}
