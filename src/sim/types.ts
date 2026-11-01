import type { WhyKey } from '../data/why';

export type Phase = 'acceptance' | 'shift' | 'report';

export type CellKind = 'straw' | 'wet' | 'bareWet' | 'sawdust' | 'bare';

export interface Cell {
  kind: CellKind;
  since: number; // когда клетка стала такой (для опилок и расползания)
}

export type ItemKind =
  | 'bucket'
  | 'scoop'
  | 'fork'
  | 'broom'
  | 'sawdust'
  | 'bag'
  | 'basin'
  | 'hay'
  | 'straw';

export interface Item {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  droppedAt: number;
  liters?: number; // бак
  dirty?: boolean; // бак, совок
  charges?: number; // опилки, солома
  fill?: number; // мешок
  food?: 'kasha' | 'veg' | null; // таз: с едой или пустой грязный
  meal?: MealId;
  owner?: string; // таз: чей слот
  stack?: number; // таз: сколько в стопке в руках
  eatenAt?: number; // таз: когда опустел
}

export type ElephantState =
  | 'idle'
  | 'walk'
  | 'eatHay'
  | 'eatBasin'
  | 'drink'
  | 'signal'
  | 'peeing'
  | 'walkCommand'
  | 'sleep'
  | 'sway'
  | 'reach';

export interface Tally {
  inBucket: number;
  missed: number;
  dung: number;
}

export interface Elephant {
  id: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  state: ElephantState;
  next: ElephantState; // что делать по прибытии
  timer: number; // игровых минут до конца текущего занятия
  hunger: number;
  thirst: number;
  bladder: number;
  bowel: number;
  boredom: number;
  trust: number;
  footDebt: number;
  footDebtStart: number; // с чем приняли (хромота от сменщика)
  limp: boolean;
  lyingInWet: boolean;
  praiseUntil: number;
  begTreats: number;
  tally: Tally;
  targetItem?: number;
  signalStarted?: number;
}

export type MealId = 'kasha1' | 'kasha2' | 'dinner';

export interface Kitchen {
  kasha: { status: 'idle' | 'cooking' | 'ready'; readyAt: number; portions: number; meal: MealId | null };
  veg: { stage: number; nextAt: number; portions: number };
  cleanBasins: number;
}

export type ChecklistId =
  | 'fence'
  | 'gate'
  | 'fenceItems'
  | 'standing'
  | 'water'
  | 'hay'
  | 'inventory';

export interface ChecklistEntry {
  id: ChecklistId;
  label: string;
  defect: boolean; // сменщик оставил косяк
  mark: boolean | null; // отметка игрока: true = в порядке, false = не в порядке
}

export interface ShiftEvent {
  kind: 'info' | 'good' | 'bad' | 'hint';
  text: string;
  why?: WhyKey;
  elephantId?: string;
}

export interface State {
  seed: number;
  rng: number;
  phase: Phase;
  t: number; // игровых минут от 08:00 дня приёма
  nextItemId: number;
  player: { x: number; y: number; held: Item | null; facing: { x: number; y: number } };
  elephants: Elephant[];
  cells: Cell[][]; // [cy][cx]
  dung: { id: number; x: number; y: number; at: number }[];
  items: Item[];
  kitchen: Kitchen;
  feederHay: number;
  trough: number;
  valveOpen: boolean;
  lastOverflow: number;
  fenceOn: boolean;
  gateOpen: boolean;
  spareBucket: boolean;
  meals: Record<MealId, Record<string, number | null>>; // когда подан таз каждой
  checklist: ChecklistEntry[];
  stats: {
    drySamples: number;
    drySum: number;
    lastDryCheck: number;
    lastSpread: number;
    broken: string[];
    basinsLost: number;
    bagsOut: number;
    begTreats: number;
    hintsShown: string[];
  };
  log: ShiftEvent[];
  report: import('./handover').Report | null;
}

export type Command =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'action' }
  | { type: 'inspect' }
  | { type: 'toggleCheck'; id: ChecklistId; value: boolean }
  | { type: 'acceptShift' };
