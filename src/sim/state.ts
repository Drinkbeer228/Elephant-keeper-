import { BALANCE } from '../data/balance';
import { ELEPHANTS } from '../data/elephants';
import { MAP } from '../data/map';
import { pick, randomInt } from './rng';
import type { ChecklistEntry, ChecklistId, Elephant, Item, State } from './types';

export const CHECKLIST: { id: ChecklistId; label: string }[] = [
  { id: 'fence', label: 'Электропастух работает' },
  { id: 'gate', label: 'Задвижки и замки закрыты' },
  { id: 'fenceItems', label: 'У ограждения нет посторонних вещей' },
  { id: 'standing', label: 'Все трое на ногах, без травм и хромоты' },
  { id: 'water', label: 'Вода в доступе' },
  { id: 'hay', label: 'Сено в доступе' },
  { id: 'inventory', label: 'Скребок, совок и бак на месте' },
];

export interface ShiftOptions {
  defects?: ChecklistId[]; // какие косяки оставил сменщик; по умолчанию случайные
  mess?: boolean; // ночная грязь на подстилке, по умолчанию есть
}

export function createShift(seed: number, opts: ShiftOptions = {}): State {
  const state: State = {
    seed,
    rng: seed,
    phase: 'acceptance',
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
      cleanBasins: BALANCE.food.basins,
    },
    feederHay: BALANCE.food.hayStart,
    trough: 80,
    valveOpen: false,
    lastOverflow: 0,
    fenceOn: true,
    gateOpen: false,
    spareBucket: true,
    meals: {
      kasha1: Object.fromEntries(ELEPHANTS.map((p) => [p.id, null])),
      kasha2: Object.fromEntries(ELEPHANTS.map((p) => [p.id, null])),
      dinner: Object.fromEntries(ELEPHANTS.map((p) => [p.id, null])),
    },
    checklist: CHECKLIST.map((c) => ({ ...c, defect: false, mark: null }) satisfies ChecklistEntry),
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

  if (opts.mess !== false) addNightMess(state);

  const defects = opts.defects ?? randomDefects(state);
  defects.forEach((id) => applyDefect(state, id));
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
    limp: false,
    lyingInWet: false,
    praiseUntil: -1,
    begTreats: 0,
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

function randomDefects(state: State): ChecklistId[] {
  const count = randomInt(state, 0, BALANCE.handover.maxDefects);
  const pool = CHECKLIST.map((c) => c.id);
  const result: ChecklistId[] = [];
  while (result.length < count) {
    const id = pick(state, pool);
    if (!result.includes(id)) result.push(id);
  }
  return result;
}

function applyDefect(state: State, id: ChecklistId): void {
  const entry = state.checklist.find((c) => c.id === id)!;
  entry.defect = true;
  switch (id) {
    case 'fence':
      state.fenceOn = false;
      break;
    case 'gate':
      state.gateOpen = true;
      break;
    case 'fenceItems':
      addItem(state, 'basin', 10.5, 9.4, { food: null, eatenAt: -60 });
      state.kitchen.cleanBasins--;
      break;
    case 'standing': {
      const e = pick(state, state.elephants);
      e.limp = true;
      e.footDebt = BALANCE.footDebt.limpThreshold + 10;
      break;
    }
    case 'water':
      state.trough = 0;
      break;
    case 'hay':
      state.feederHay = 0;
      break;
    case 'inventory': {
      // Совок не на месте: валяется у мойки
      const scoop = state.items.find((i) => i.kind === 'scoop')!;
      scoop.x = 12.2;
      scoop.y = 14.2;
      scoop.dirty = true;
      break;
    }
  }
}
