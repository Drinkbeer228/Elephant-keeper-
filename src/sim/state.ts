import { KEEPER, START_STOCK, TIME } from '../data/balance';
import { BALL_START, BARN_SPOTS, BARROW_HOME, BEDDING, FEEDER_IDS, HOSE_LENGTH, HOSE_REEL, KEEPER_START, STATIONS, TANK_HOME, TREES, TROUGH_IDS, W, H, inRect, type TroughId } from '../data/facility';
import { DIET_IDS, PORRIDGE_SACK_KG, emptyVeg, seasonalFor, type VegKind } from '../data/rations';
import { idleActivity } from './behavior/act';
import { clampHerdSize, generateHerd, initialBonds, initialLearned } from './herd';
import { random, range } from './rng';
import type { BodyState, DayStats, Elephant, ElephantProfile, ShiftChecks, State, TroughState, Traits, Tub } from './types';
import { addLitter, cellCenter, dropDung, forCells, touchCells } from './world';
import { log } from './events';

export const SAVE_VERSION = 3;

export interface NewGameOptions {
  seed: number;
  herdSize?: number;
  overrides?: Partial<Traits>[];
  mess?: boolean; // ночная грязь в слоновнике на старте (по умолчанию есть)
}

export function emptyDayStats(): DayStats {
  return {
    minutes: {},
    distance: 0,
    signals: 0,
    answered: 0,
    ignored: 0,
    urineDrain: 0,
    urineOutside: 0,
    urineBedding: 0,
    urineTank: 0,
    dung: 0,
    ate: 0,
    tubKg: 0,
    stolen: 0,
    robbed: 0,
    treats: 0,
    conflicts: 0,
    refusals: 0,
    fermented: 0,
    groomed: 0,
    wellbeingSum: 0,
    wellbeingSamples: 0,
    lyingMinutes: 0,
    dirtyLying: 0,
  };
}

export function emptyChecks(): ShiftChecks {
  const troughChanged = {} as Record<TroughId, boolean>;
  for (const id of TROUGH_IDS) troughChanged[id] = false;
  return { troughChanged, hoseIncidents: 0, tubsBroken: 0, porridge: {}, vegTub: {} };
}

export function cleanBody(): BodyState {
  return { back: 0, side: 0, legs: 0, head: 0, hay: 0, soap: 0 };
}

export function freshTrough(level: number, debris = 0): TroughState {
  return { level, valve: false, overflow: 0, drain: false, debris, chem: 0, stage: 'ok', changed: -1 };
}

// Место таза на стеллаже кормокухни
export function rackSpot(i: number): { x: number; y: number } {
  const r = STATIONS.tubRack.rect!;
  return { x: r.x0 + 0.4 + (i % 6) * 0.62, y: (r.y0 + r.y1) / 2 };
}

export function newTub(s: State, owner: string, i: number): Tub {
  const p = rackSpot(i);
  return { id: s.nextId++, owner, x: p.x, y: p.y, heading: 0, where: 'rack', veg: emptyVeg(), emptySince: -1, damage: 0, broken: false, dirty: false };
}

// Запас овощей на кормокухне: на каждую слониху 20+20+20 кг и сезонное — по рациону SlonVet
export function vegStockFor(seed: number, day: number, herd: number): Record<VegKind, number> {
  const v = emptyVeg();
  for (const k of ['potato', 'carrot', 'beet'] as VegKind[]) v[k] = herd * 20 + 8;
  v[seasonalFor(seed, day)] = herd * 12 + 6;
  return v;
}

function createElephant(s: State, p: ElephantProfile, i: number): Elephant {
  const spot = BARN_SPOTS[i % BARN_SPOTS.length];
  return {
    id: p.id,
    profile: p,
    learned: initialLearned(p),
    needs: {
      hunger: range(s, 38, 55),
      thirst: range(s, 30, 48),
      bladder: range(s, 25, 60),
      bowel: range(s, 18, 55),
      fatigue: range(s, 6, 20),
      boredom: range(s, 32, 55),
      social: range(s, 5, 15),
      heat: 0,
      stress: range(s, 6, 14),
    },
    x: spot.x,
    y: spot.y,
    heading: range(s, -Math.PI, Math.PI),
    speed: 0,
    act: { ...idleActivity(s.t), dur: range(s, 0.2, 2) },
    path: [],
    pathGoal: null,
    lying: false,
    wet: 0,
    dust: range(s, 0, 0.4),
    body: { ...cleanBody(), side: Math.round(range(s, 0, 0.15) * 1000) / 1000, legs: Math.round(range(s, 0.05, 0.2) * 1000) / 1000, hay: Math.round(range(s, 0, 0.3) * 1000) / 1000 },
    tipsy: 0,
    trunk: { kind: null, amount: 0 },
    signal: null,
    stuck: 0,
    bestDist: 1e6,
    mem: {
      nextThink: s.t + i * 0.35,
      cooldown: {},
      habit: {},
      call: null,
      lastGreet: {},
      lastAte: s.t - 60,
      spooked: -1000,
      zone: 'barn',
      zoneSince: s.t - 600,
      lastSignalFx: -100,
    },
    day: emptyDayStats(),
  };
}

export function createState(opts: NewGameOptions): State {
  const seed = opts.seed >>> 0 || 1;
  const herd = generateHerd({ seed, size: clampHerdSize(opts.herdSize ?? 3), overrides: opts.overrides });
  const cells = W * H;
  const porridge = {} as Record<(typeof DIET_IDS)[number], number>;
  for (const d of DIET_IDS) porridge[d] = PORRIDGE_SACK_KG;
  const feeders = {} as State['world']['feeders'];
  for (const f of FEEDER_IDS) feeders[f] = { hay: 0, straw: 0 };
  feeders.barnRackW.hay = 10;
  feeders.barnRackE.hay = 8;
  const s: State = {
    version: SAVE_VERSION,
    seed,
    rng: seed,
    t: TIME.start,
    simSec: 0,
    nextId: 1,
    elephants: [],
    bonds: initialBonds(herd, seed),
    keeper: { x: KEEPER_START.x, y: KEEPER_START.y, facing: -Math.PI / 2, held: null, pouch: KEEPER.startTreats, task: null, prep: null, running: false, moving: false, carried: 0 },
    world: {
      gates: { outer: false, shift: true },
      feeders,
      troughs: { barnWaterW: freshTrough(46, 0.25), barnWaterE: freshTrough(38, 0.3), paddockWater: freshTrough(55, 0.15) },
      pool: { dirt: 0.08, valve: false },
      drum: 0,
      ball: { x: BALL_START.x, y: BALL_START.y, vx: 0, vy: 0 },
      cells: {
        wet: new Array(cells).fill(0),
        soil: new Array(cells).fill(0),
        bedding: new Array(cells).fill(0),
        litter: new Array(cells).fill(0),
        sawdust: new Array(cells).fill(0),
      },
      cellsVersion: 0,
      dirt: { barn: 0, paddock: 0, minute: -1 },
      dung: [],
      food: [],
      items: [],
      tools: { shovel: true, rake: true, broom: true, mop: true, brush: true },
      barrow: { x: BARROW_HOME.x, y: BARROW_HOME.y, heading: 0, pushed: false, load: 0, cargo: [] },
      hose: { state: 'reel', path: [{ x: HOSE_REEL.x, y: HOSE_REEL.y }], end: { x: HOSE_REEL.x, y: HOSE_REEL.y }, length: HOSE_LENGTH, damage: 0, chewed: 0 },
      tubs: [],
      trees: Object.fromEntries(TREES.filter((t) => t.fruit).map((t, i) => [t.id, 9 - i * 2])),
      container: 18,
      stock: { ...START_STOCK, veg: vegStockFor(seed, 1, herd.length), porridge },
      supplies: { chem: 2, shampoo: 3, tape: 3 },
      checks: emptyChecks(),
    },
    journal: [],
    alerts: [],
    dayStart: TIME.start,
    dailyKeeper: { treats: 0, interactions: 0, answered: 0, ignored: 0, calls: 0, callsObeyed: 0 },
    startOfDay: {},
    reports: [],
    pendingReport: null,
  };
  for (let i = 0; i < cells; i++) {
    const c = cellCenter(i);
    if (inRect(BEDDING, c.x, c.y)) s.world.cells.bedding[i] = Math.round((0.82 + random(s) * 0.18) * 1000) / 1000;
  }
  s.elephants = herd.map((p, i) => createElephant(s, p, i));
  s.world.tubs = s.elephants.map((e, i) => newTub(s, e.id, i));
  s.world.items.push({ id: s.nextId++, kind: 'tank', x: TANK_HOME.x, y: TANK_HOME.y, load: 0, aux: 0, owner: null });
  for (const e of s.elephants) s.startOfDay[e.id] = { trust: e.learned.trust, cooperation: e.learned.cooperation };
  if (opts.mess !== false) addNightMess(s);
  log(s, 'info', 'Утро. Слоны ночевали в слоновнике. Проверь поилки, положи сено на выгул и открой ворота на выгул — пульт в проходе у решётки, между стойлами.', { kind: 'welcome' });
  return s;
}

// После ночи в слоновнике: кучи навоза, мокрые пятна, растасканное у кормушек сено
function addNightMess(s: State): void {
  const n = s.elephants.length;
  const piles = 2 + n;
  for (let i = 0; i < piles; i++) {
    dropDung(s, range(s, BEDDING.x0 + 1.5, BEDDING.x1 - 1.5), range(s, BEDDING.y0 + 1.2, BEDDING.y1 - 0.8));
    s.world.dung[s.world.dung.length - 1].t = s.t - range(s, 30, 300);
  }
  const wet = 1 + Math.ceil(n / 2);
  for (let i = 0; i < wet; i++) {
    const x = range(s, BEDDING.x0 + 1.5, BEDDING.x1 - 1.5);
    const y = range(s, BEDDING.y0 + 1.2, BEDDING.y1 - 0.8);
    forCells(x, y, 1.1, (idx) => {
      s.world.cells.wet[idx] = Math.min(1, s.world.cells.wet[idx] + 0.8);
    });
  }
  for (const id of ['barnRackW', 'barnRackE'] as const) {
    const r = STATIONS[id].reach!;
    addLitter(s, r.x + range(s, -1, 1), r.y - 1.3, 0.35, 1.4);
  }
  touchCells(s);
}
