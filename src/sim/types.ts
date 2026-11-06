import type { StationId, ZoneId } from '../data/facility';

export type { StationId, ZoneId };

export interface Vec {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Профиль слона: генерируется один раз при создании и дальше не меняется
// ---------------------------------------------------------------------------

export interface Traits {
  nervousness: number; // спокойная ↔ нервная
  confidence: number; // робкая ↔ уверенная, властная
  activity: number; // неторопливая ↔ энергичная
  curiosity: number;
  playfulness: number;
  sociability: number; // самостоятельная ↔ общительная
  foodDrive: number; // разборчивая ↔ прожорливая
  cooperation: number; // своенравная ↔ покладистая
  persistence: number; // переменчивая ↔ упрямая
  expressiveness: number; // молчаливая ↔ разговорчивая (ясность сигналов)
  sensitivity: number; // неприхотливая ↔ чувствительная к грязи, жаре и шуму
}

export type TraitKey = keyof Traits;

export const TRAIT_KEYS: TraitKey[] = [
  'nervousness',
  'confidence',
  'activity',
  'curiosity',
  'playfulness',
  'sociability',
  'foodDrive',
  'cooperation',
  'persistence',
  'expressiveness',
  'sensitivity',
];

export interface Look {
  size: number; // общий масштаб, ~0.86..1.14
  length: number; // вытянутость корпуса
  girth: number; // ширина корпуса
  head: number;
  ear: number;
  earShape: number; // 0 — округлое ухо, 1 — с вытянутой мочкой
  notch: number; // −1 — нет надрыва на ухе, иначе положение 0..1
  notchSide: number; // 1 — правое ухо, −1 — левое
  skin: string;
  freckles: number; // депигментация на ушах и хоботе
  tail: number;
  tuft: number;
  wrinkles: number;
  seed: number;
}

export type FoodKind = 'hay' | 'produce' | 'browse';

export interface ElephantProfile {
  id: string;
  name: string;
  age: number;
  traits: Traits;
  look: Look;
  favoriteFood: FoodKind;
  color: string; // цвет-метка в интерфейсе
}

// Выученное: меняется от опыта и сохраняется между сменами
export interface Learned {
  trust: number; // доверие к киперу
  cooperation: number; // готовность выполнять просьбы кипера
  expectation: number; // ожидание, что на сигнал ответят
}

export interface Needs {
  hunger: number;
  thirst: number;
  bladder: number;
  bowel: number;
  fatigue: number;
  boredom: number;
  social: number;
  heat: number;
  stress: number;
}

export type NeedKey = keyof Needs;

// ---------------------------------------------------------------------------
// Поведение
// ---------------------------------------------------------------------------

export type ActivityKind =
  | 'idle'
  | 'wander'
  | 'explore'
  | 'eat'
  | 'drink'
  | 'urinate'
  | 'defecate'
  | 'sleep'
  | 'rest'
  | 'play'
  | 'bathe'
  | 'dust'
  | 'socialize'
  | 'signal'
  | 'seekKeeper'
  | 'follow'
  | 'pace'
  | 'avoid';

export type SignalKind = 'toilet' | 'out' | 'in' | 'food' | 'water' | 'attention';

export type ObjectId = 'ball' | 'log' | 'drum' | 'tire' | 'pool' | 'dust' | 'treeA' | 'treeB' | 'treeC';

export type TargetRef =
  | { t: 'point'; x: number; y: number; face: number | null }
  | { t: 'slot'; station: StationId; slot: number }
  | { t: 'obj'; id: ObjectId; x: number; y: number }
  | { t: 'food'; id: number }
  | { t: 'el'; id: string }
  | { t: 'item'; id: number }
  | { t: 'gate'; side: ZoneId };

export interface Activity {
  kind: ActivityKind;
  target: TargetRef | null;
  phase: 'go' | 'do';
  start: number; // игровые минуты
  doStart: number;
  dur: number; // сколько длится «do», минут
  score: number; // полезность в момент выбора — для гистерезиса
  forced: boolean;
  signal: SignalKind | null;
  note: string; // причина выбора (для осмотра и отладки)
  key: string; // ключ поведения: для откатов и сравнения «то же самое занятие»
  aux: Vec | null; // вторая точка (маршрут хождения взад-вперёд)
  flag: number; // служебная отметка занятия (спор за место решён, направление хождения)
}

export interface SignalState {
  kind: SignalKind;
  start: number;
  until: number; // когда терпение кончится
  answered: boolean;
}

export interface DayStats {
  minutes: Partial<Record<ActivityKind, number>>;
  distance: number;
  signals: number;
  answered: number;
  ignored: number;
  urineDrain: number;
  urineOutside: number;
  urineBedding: number;
  dung: number;
  ate: number; // единиц голода утолено
  treats: number;
  conflicts: number;
  refusals: number;
  wellbeingSum: number;
  wellbeingSamples: number;
  lyingMinutes: number;
}

export interface ElephantMemory {
  nextThink: number;
  cooldown: Record<string, number>; // ключ поведения → игровое время, раньше которого его не выбирают
  habit: Record<string, number>; // привыкание к видам обогащения 0..1
  call: { until: number; x: number; y: number; arrivedAt: number; rewarded: boolean } | null;
  lastGreet: Record<string, number>;
  lastAte: number;
  spooked: number; // когда кипер в последний раз напугал
  zone: ZoneId;
  zoneSince: number; // когда вошла в текущую зону
}

export interface Elephant {
  id: string;
  profile: ElephantProfile;
  learned: Learned;
  needs: Needs;
  x: number;
  y: number;
  heading: number;
  speed: number; // текущая скорость, м/с
  act: Activity;
  path: Vec[];
  pathGoal: Vec | null;
  lying: boolean;
  wet: number; // мокрая кожа 0..1
  dust: number; // пыль на спине 0..1
  signal: SignalState | null;
  stuck: number; // секунд без продвижения к цели
  bestDist: number; // ближе всего к цели за текущий подход
  mem: ElephantMemory;
  day: DayStats;
}

// ---------------------------------------------------------------------------
// Мир
// ---------------------------------------------------------------------------

export interface Dung {
  id: number;
  x: number;
  y: number;
  t: number;
  zone: ZoneId;
}

export type FoodItemKind = 'produce' | 'browse' | 'hay' | 'remains';

export interface FoodItem {
  id: number;
  kind: FoodItemKind;
  x: number;
  y: number;
  amount: number; // для кусков — единиц голода; для веток — доля 0..1
  t: number;
  zone: ZoneId;
}

export type LooseKind = 'fork' | 'rake' | 'hay' | 'straw' | 'ration' | 'browse';

export interface LooseItem {
  id: number;
  kind: LooseKind;
  x: number;
  y: number;
  portions: number;
}

export interface WaterPoint {
  level: number;
  valve: boolean;
  overflow: number; // минут переполнения
}

export interface Cells {
  wet: number[];
  soil: number[];
  bedding: number[];
}

export interface World {
  gateOpen: boolean;
  hay: Record<'barnRack' | 'paddockFeeder', number>;
  trough: { portions: number; since: number };
  water: Record<'barnWater' | 'paddockWater', WaterPoint>;
  pool: { dirt: number; valve: boolean };
  drum: number;
  ball: { x: number; y: number; vx: number; vy: number };
  cells: Cells;
  cellsVersion: number;
  dirt: { barn: number; paddock: number; minute: number }; // грязь зон, пересчёт раз в минуту
  dung: Dung[];
  food: FoodItem[];
  items: LooseItem[];
  tools: { fork: boolean; rake: boolean; hose: boolean }; // что висит на месте
  barrow: { x: number; y: number; heading: number; pushed: boolean; load: number };
  container: number;
  stock: { hay: number; straw: number; produce: number; browse: number };
}

export type Held =
  | { kind: 'fork'; load: number }
  | { kind: 'rake'; load: number }
  | { kind: 'hose' }
  | { kind: 'hay' }
  | { kind: 'straw' }
  | { kind: 'ration'; portions: number }
  | { kind: 'browse' };

export interface KeeperTask {
  action: ActionRef;
  label: string;
  elapsed: number;
  dur: number;
}

export interface Keeper {
  x: number;
  y: number;
  facing: number;
  held: Held | null;
  pouch: number;
  task: KeeperTask | null;
  running: boolean;
  moving: boolean;
}

// Действие кипера — данные, а не замыкание: его можно сохранить, повторить и проверить
export interface ActionRef {
  verb: Verb;
  target: string; // станция, id предмета, id слона, клетка 'x,y'
}

export type Verb =
  | 'takeTool'
  | 'returnTool'
  | 'takeHose'
  | 'returnHose'
  | 'takeHay'
  | 'takeStraw'
  | 'takeBrowse'
  | 'prepRation'
  | 'refillPouch'
  | 'pickUp'
  | 'drop'
  | 'loadHay'
  | 'fillTrough'
  | 'handFeed'
  | 'scatter'
  | 'tossBrowse'
  | 'fillDrum'
  | 'clearTrough'
  | 'fork'
  | 'rake'
  | 'hose'
  | 'spreadStraw'
  | 'emptyTool'
  | 'pushBarrow'
  | 'parkBarrow'
  | 'dumpBarrow'
  | 'valve'
  | 'gate'
  | 'treat'
  | 'scratch'
  | 'shower'
  | 'call'
  | 'journal';

export interface ActionOption {
  id: string;
  ref: ActionRef;
  label: string;
  enabled: boolean;
  reason: string; // почему недоступно
  priority: number;
  elephantId: string | null;
  timed: boolean;
}

// ---------------------------------------------------------------------------
// Журнал, тревоги и итоги
// ---------------------------------------------------------------------------

export type Severity = 'info' | 'good' | 'warn' | 'bad';

export interface JournalEntry {
  id: number;
  t: number;
  severity: Severity;
  text: string;
  elephantId: string | null;
  key: string;
}

export interface Alert {
  key: string;
  since: number;
  severity: Severity;
  text: string;
}

export interface ElephantDayReport {
  id: string;
  name: string;
  wellbeing: number;
  sleepHours: number;
  signals: number;
  answered: number;
  ignored: number;
  urineBedding: number;
  trustDelta: number;
  cooperationDelta: number;
  highlights: string[];
}

export interface DayReport {
  day: number;
  score: number;
  verdict: string;
  elephants: ElephantDayReport[];
  barnClean: number;
  paddockClean: number;
  dungLeft: number;
  responseRate: number;
  treats: number;
  notes: string[];
}

export interface DailyKeeper {
  treats: number;
  interactions: number;
  answered: number;
  ignored: number;
  calls: number;
  callsObeyed: number;
}

export interface State {
  version: number;
  seed: number;
  rng: number;
  t: number; // игровые минуты с полуночи первого дня
  simSec: number;
  nextId: number;
  elephants: Elephant[];
  bonds: Record<string, number>; // 'a|b' → −1..1
  keeper: Keeper;
  world: World;
  journal: JournalEntry[];
  alerts: Alert[];
  dayStart: number;
  dailyKeeper: DailyKeeper;
  startOfDay: Record<string, { trust: number; cooperation: number }>;
  reports: DayReport[];
  pendingReport: number | null; // индекс отчёта, который ещё не показали
}

// Ввод на один шаг симуляции
export interface StepInput {
  move: Vec;
  run: boolean;
  actions: string[]; // id действий из availableActions
  cancel: boolean;
}

export interface SimEvent {
  kind: string; // 'signal', 'urinate', 'dung', 'gate', 'treat', 'trumpet', 'splash', ...
  x: number;
  y: number;
  elephantId: string | null;
  severity: Severity;
  text: string;
}
