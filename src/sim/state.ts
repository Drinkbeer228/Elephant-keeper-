import { START_STOCK, TIME, KEEPER } from '../data/balance';
import { BALL_START, BARN_SPOTS, BEDDING, BARROW_HOME, KEEPER_START, W, H, inRect } from '../data/facility';
import { idleActivity } from './behavior/act';
import { clampHerdSize, generateHerd, initialBonds, initialLearned } from './herd';
import { random, range } from './rng';
import type { DayStats, Elephant, ElephantProfile, State, Traits } from './types';
import { cellCenter, dropDung, forCells, touchCells } from './world';

export const SAVE_VERSION = 2;

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
    dung: 0,
    ate: 0,
    treats: 0,
    conflicts: 0,
    refusals: 0,
    wellbeingSum: 0,
    wellbeingSamples: 0,
    lyingMinutes: 0,
  };
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
    },
    day: emptyDayStats(),
  };
}

export function createState(opts: NewGameOptions): State {
  const seed = opts.seed >>> 0 || 1;
  const herd = generateHerd({ seed, size: clampHerdSize(opts.herdSize ?? 3), overrides: opts.overrides });
  const cells = W * H;
  const s: State = {
    version: SAVE_VERSION,
    seed,
    rng: seed,
    t: TIME.start,
    simSec: 0,
    nextId: 1,
    elephants: [],
    bonds: initialBonds(herd, seed),
    keeper: { x: KEEPER_START.x, y: KEEPER_START.y, facing: -Math.PI / 2, held: null, pouch: KEEPER.startTreats, task: null, running: false, moving: false },
    world: {
      gateOpen: false,
      hay: { barnRack: 14, paddockFeeder: 0 },
      trough: { portions: 0, since: TIME.start },
      water: {
        barnWater: { level: 42, valve: false, overflow: 0 },
        paddockWater: { level: 55, valve: false, overflow: 0 },
      },
      pool: { dirt: 0.08, valve: false },
      drum: 0,
      ball: { x: BALL_START.x, y: BALL_START.y, vx: 0, vy: 0 },
      cells: { wet: new Array(cells).fill(0), soil: new Array(cells).fill(0), bedding: new Array(cells).fill(0) },
      cellsVersion: 0,
      dirt: { barn: 0, paddock: 0, minute: -1 },
      dung: [],
      food: [],
      items: [],
      tools: { fork: true, rake: true, hose: true },
      barrow: { x: BARROW_HOME.x, y: BARROW_HOME.y, heading: 0, pushed: false, load: 0 },
      container: 18,
      stock: { ...START_STOCK },
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
  for (const e of s.elephants) s.startOfDay[e.id] = { trust: e.learned.trust, cooperation: e.learned.cooperation };
  if (opts.mess !== false) addNightMess(s);
  return s;
}

// После ночи в слоновнике: кучи навоза и мокрые пятна на подстилке
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
  touchCells(s);
}
