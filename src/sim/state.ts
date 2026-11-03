import { BALANCE } from '../data/balance';
import { ELEPHANTS } from '../data/elephants';
import { MAP } from '../data/map';
import { randomInt } from './rng';
import { groundOf } from './floor';
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
    player: { x: MAP.playerStart.x, y: MAP.playerStart.y, held: null, facing: { x: 0, y: -1 }, pocketTreats: BALANCE.player.pocketStart, knockdownTimer: 0 },
    elephants: ELEPHANTS.map(createElephant),
    // Сетка пола на весь мир: солома в песочных зонах, трава на лугах, бетон вне загонов
    cells: Array.from({ length: MAP.floor.rows }, (_, cy) =>
      Array.from({ length: MAP.floor.cols }, (_, cx) => ({ kind: groundOf(cx, cy), since: 0 })),
    ),
    dung: [],
    litter: [],
    items: [],
    kitchen: {
      kasha: { status: 'idle', readyAt: 0, portions: 0, meal: null },
      veg: { portions: 0 },
    },
    stock: { ...BALANCE.stockStart },
    feederHay: BALANCE.food.hayStart,
    trough: 80,
    valveOpen: false,
    feederHay2: BALANCE.food.hayStart,
    trough2: 80,
    valve2Open: false,
    pools: MAP.pools.map(() => ({ dirty: 0, floats: [] })),
    tires: (['female', 'male'] as const).map((id) => {
      const { active } = MAP.complexes[id];
      return {
        id,
        paddock: id,
        x: (active.x0 + active.x1) / 2,
        y: (active.y0 + active.y1) / 2,
        vx: 0,
        vy: 0,
        flightLeft: 0,
        flightDuration: 0,
        cooldown: 0,
        hit: false,
      };
    }),
    musthEventsRemaining: 0,
    musthNextAt: Number.POSITIVE_INFINITY,
    partner: {
      x: MAP.partnerStart.x,
      y: MAP.partnerStart.y,
      facing: { x: 0, y: -1 },
      bucket: 0,
      waste: 0,
      mode: 'idle',
      babbleAt: BALANCE.partner.babbleEvery,
      timer: 2,
      path: [],
      pathTarget: null,
      foodBasin: null,
      supplyPalletId: null,
      knockdownTimer: 0,
    },
    dutyLight: false,
    lastOverflow: 0,
    gates: { female: false, male: false },
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
      trail: 0,
      stuck: false,
      spoiled: false,
    },
    jack: { x: MAP.jackStart.x, y: MAP.jackStart.y, pushed: false, cargo: null },
    supply: {
      arrived: false,
      left: false,
      missed: false,
      bays: [],
      ground: [],
      driver: { x: MAP.stations.unload.x + 2.2, y: MAP.stations.unload.y, wp: 0, said: false, babbleAt: 0 },
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
    prep: null,
    report: null,
  };

  for (const elephant of state.elephants) {
    if (ELEPHANTS.find((p) => p.id === elephant.id)?.paddock === 'male') {
      elephant.traits = {
        appetite: randomInt(state, 80, 140) / 100,
        messiness: randomInt(state, 80, 140) / 100,
        aggression: randomInt(state, 80, 140) / 100,
      };
    }
  }
  state.musthEventsRemaining = randomInt(state, 1, 2);
  state.musthNextAt = randomInt(state, 150, 360);

  const spots = MAP.rackSpots;
  addItem(state, 'bucket', spots.bucket.x, spots.bucket.y, { liters: 0, dirty: false });
  addItem(state, 'scoop', spots.scoop.x, spots.scoop.y, { dirty: false });
  addItem(state, 'fork', spots.fork.x, spots.fork.y);
  addItem(state, 'broom', spots.broom.x, spots.broom.y);
  // Длинный сачок для бассейнов — на стойке в Дежурке
  addItem(state, 'net', spots.net.x, spots.net.y);
  // Совковая лопата — в Опилочнике у стены
  addItem(state, 'shovel', MAP.shovelSpot.x, MAP.shovelSpot.y);
  // Корзина для овощей — у стеллажа в кормовой
  addItem(state, 'basket', MAP.basketSpot.x, MAP.basketSpot.y);
  // Ведро для опилок — пустое, в Дежурке у шкафчиков
  addItem(state, 'sawdust', MAP.pailSpot.x, MAP.pailSpot.y, { charges: 0 });
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
    wetness: 0,
    traits: { appetite: 1, messiness: 1, aggression: 1 },
    musthTimer: 0,
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

// Ночная грязь в обоих загонах: мокрые клетки и кучи навоза на песке
function addNightMess(state: State): void {
  for (const b of [MAP.bedding, MAP.bedding2]) {
    const wet = randomInt(state, 3, 5);
    for (let i = 0; i < wet; i++) {
      const cx = b.x + randomInt(state, 0, b.cols - 1);
      const cy = b.y + randomInt(state, 0, b.rows - 1);
      state.cells[cy][cx] = { kind: 'wet', since: 0 };
    }
    const piles = randomInt(state, 1, 3);
    for (let i = 0; i < piles; i++) {
      state.dung.push({
        id: state.nextItemId++,
        x: b.x + randomInt(state, 0, b.cols - 1) + 0.5,
        y: b.y + randomInt(state, 0, b.rows - 1) + 0.5,
        at: 0,
      });
    }
  }
}
