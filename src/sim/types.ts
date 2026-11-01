import type { WhyKey } from '../data/why';

export type Phase = 'shift' | 'report';

// dung — затоптанный навоз; grass и puddle (лужа мочи) — на лугу
export type CellKind = 'straw' | 'wet' | 'bareWet' | 'sawdust' | 'bare' | 'dung' | 'grass' | 'puddle';

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
  | 'straw'
  | 'basket';

export interface Item {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  droppedAt: number;
  liters?: number; // бак
  dirty?: boolean; // бак, совок, таз после еды
  charges?: number; // опилки, солома
  load?: number; // совок: единиц навоза в накопительном отсеке
  veg?: 'raw' | 'soaking' | 'washed' | 'peeled'; // корзина: что с овощами
  soakUntil?: number; // корзина в раковине: до скольки отмокает
  fill?: number; // мешок
  food?: 'kasha' | 'veg' | null; // таз: с едой или пустой грязный
  meal?: MealId;
  owner?: string; // таз: чей слот
  nested?: Item[]; // таз в руках: вложенные в него пустые тазы — стопка из настоящих тазов
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
  dirtyFeet: number; // сколько клеток ещё испачкает следами
  lastCell: string;
  tally: Tally;
  targetItem?: number;
  signalStarted?: number;
}

export type MealId = 'kasha1' | 'kasha2' | 'dinner';

export interface Kitchen {
  kasha: { status: 'idle' | 'cooking' | 'ready'; readyAt: number; portions: number; meal: MealId | null };
  veg: { portions: number }; // нарезанный ужин, ждёт тазов
}

// Чистка овощей: крупный план овоща, на нём дефекты — срезать каждый
export type VegKind = 'carrot' | 'potato' | 'beet';
export interface VegSpot {
  kind: 'top' | 'tail' | 'rot' | 'eye'; // ботва, хвостик, гниль, глазок
  x: number; // доля ширины рисунка
  y: number; // доля высоты
  cut: boolean;
}
export interface Prep {
  pieces: { kind: VegKind; spots: VegSpot[] }[];
  index: number; // какой овощ сейчас на доске
  open: boolean; // окно чистки открыто
}

export interface ShiftEvent {
  kind: 'info' | 'good' | 'bad' | 'hint';
  text: string;
  why?: WhyKey;
  elephantId?: string;
}

export type Tool = 'scoop' | 'fork' | 'broom';

// Тачка: возит инвентарь, опилки, солому, тюки и мусор
export interface Barrow {
  x: number;
  y: number;
  pushed: boolean;
  tools: Tool[];
  sawdust: number; // заряды опилок
  straw: number; // заряды соломы
  bales: number;
  waste: number; // единицы мусора
  balance: number; // -1..1, на краях тюк падает
  parkedAt: number;
  trail: number; // сколько проехала с грузом с последнего рассыпания
}

// Большой мусорный бак: заезжать, пока не наполовину; потом дверцу закрыть и ставить трап; полный — вызывать мусоровоз
export interface Container {
  fill: number;
  doorClosed: boolean;
  ramp: boolean;
  truckAt: number | null; // когда приедет мусоровоз
  truckLeftAt: number | null; // когда уехал (для картинки)
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
  litter: { id: number; x: number; y: number; kind: 'straw' | 'hay' | 'sawdust' }[]; // сор с тачки на твёрдом полу
  items: Item[];
  kitchen: Kitchen;
  feederHay: number;
  trough: number;
  valveOpen: boolean;
  dutyLight: boolean; // дежурный свет в вольере
  lastOverflow: number;
  gateOpen: boolean;
  barrow: Barrow;
  container: Container;
  spareBucket: boolean;
  meals: Record<MealId, Record<string, number | null>>; // когда подан таз каждой
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
  prep: Prep | null;
  report: import('./handover').Report | null;
}

export type Command =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'balance'; dir: -1 | 1 }
  | { type: 'action'; choice?: number }
  | { type: 'inspect' }
  | { type: 'prepCut'; spot: number }
  | { type: 'prepClose' };
