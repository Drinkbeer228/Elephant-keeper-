import type { AreaId, DoorId, FeederId, GateId, StationId, ToolKind, TroughId, ZoneId } from '../data/facility';
import type { DietId, VegKind } from '../data/rations';

export type { AreaId, DoorId, FeederId, GateId, StationId, ToolKind, TroughId, ZoneId, DietId, VegKind };

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
  mischief: number; // бережная ↔ шкодливая (тянет, грызёт и ломает вещи)
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
  'mischief',
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

// Как слониха сообщает, что ей нужно: личная привычка, а не общая анимация
export type SignalStyle = 'stomp' | 'rumble' | 'stare' | 'gate' | 'beg';
export type Foot = 'FL' | 'FR' | 'HL' | 'HR';

export interface Habits {
  signal: SignalStyle;
  foot: Foot;
  diet: DietId;
}

// Голосовые просьбы кипера. Каждая слониха знает их по-своему: что-то с прежними киперами
// выучено крепко, что-то — едва. Знание растёт, если за выполненное хвалят, и тает без похвалы
// Просьбы кипера. Back — «En arrière!» (назад), go — «Partez!» (вперёд, пошла), foot — «Ногу!»
export type Cue = 'come' | 'stay' | 'move' | 'lie' | 'follow' | 'no' | 'back' | 'go' | 'foot';
export const CUES: Cue[] = ['come', 'stay', 'move', 'lie', 'follow', 'no', 'back', 'go', 'foot'];

export interface ElephantProfile {
  id: string;
  name: string;
  age: number;
  traits: Traits;
  look: Look;
  favoriteFood: FoodKind;
  color: string; // цвет-метка в интерфейсе
  habits: Habits;
}

// Выученное: меняется от опыта и сохраняется между сменами
export interface Learned {
  trust: number; // доверие к киперу: спокойна ли рядом с ним
  familiarity: number; // насколько он для неё «свой»: растёт от времени рядом и каждодневной заботы
  cooperation: number; // готовность выполнять просьбы кипера
  expectation: number; // ожидание, что на сигнал ответят
  toilet: number; // связь «попросилась — подставили ведро — похвалили»
  cues: Record<Cue, number>; // как знает каждую голосовую просьбу
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

// Кожа: грязь по местам (0 — чисто, 1 — сильно), сено на спине и мыльная пена
export interface BodyState {
  back: number; // спину достать можно, только когда слониха лежит
  side: number;
  legs: number;
  head: number;
  hay: number;
  soap: number;
}

export type BodyPart = 'back' | 'side' | 'legs' | 'head';

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
  | 'avoid'
  | 'carry'
  | 'toss'
  | 'shake'
  | 'manipulate'
  | 'lie'
  | 'stay' // стоит на месте по просьбе
  | 'giveWay' // отступает от кипера по просьбе «подвинься»
  | 'walkWith' // идёт рядом с кипером
  | 'warn' // предупреждает: уши в стороны, мотает головой — кипер слишком близко
  | 'drowsy' // только что проснулась: стоит сонная, смотрит в одну точку
  | 'backUp' // пятится назад по «En arrière!»
  | 'forward' // идёт вперёд по «Partez!»
  | 'foot'; // держит ногу поднятой по «Ногу!»

export const ACTIVITY_KINDS: ActivityKind[] = [
  'idle',
  'wander',
  'explore',
  'eat',
  'drink',
  'urinate',
  'defecate',
  'sleep',
  'rest',
  'play',
  'bathe',
  'dust',
  'socialize',
  'signal',
  'seekKeeper',
  'follow',
  'pace',
  'avoid',
  'carry',
  'toss',
  'shake',
  'manipulate',
  'lie',
  'stay',
  'giveWay',
  'walkWith',
  'warn',
  'drowsy',
  'backUp',
  'forward',
  'foot',
];

export type SignalKind = 'toilet' | 'out' | 'in' | 'food' | 'water' | 'attention';

export type ObjectId = 'ball' | 'log' | 'drum' | 'tire' | 'pool' | 'dust' | 'treeA' | 'treeB' | 'treeC' | 'hose';

export type TargetRef =
  | { t: 'point'; x: number; y: number; face: number | null }
  | { t: 'slot'; station: StationId; slot: number }
  | { t: 'obj'; id: ObjectId; x: number; y: number }
  | { t: 'food'; id: number }
  | { t: 'el'; id: string }
  | { t: 'item'; id: number }
  | { t: 'tub'; id: number }
  | { t: 'gate'; gate: GateId; side: AreaId };

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
  aux: Vec | null; // вторая точка (куда нести сено, маршрут хождения взад-вперёд)
  flag: number; // служебная отметка занятия (спор за место решён, сено взято, направление хождения)
}

export interface SignalState {
  kind: SignalKind;
  start: number;
  until: number; // когда терпение кончится
  answered: boolean;
}

export type Request = 'come' | 'stay' | 'move' | 'lie' | 'follow' | 'toilet' | 'back' | 'go' | 'foot';

export interface DayStats {
  minutes: Partial<Record<ActivityKind, number>>;
  distance: number;
  signals: number;
  answered: number;
  ignored: number;
  urineDrain: number;
  urineOutside: number;
  urineBedding: number;
  urineTank: number;
  dung: number;
  ate: number; // единиц голода утолено
  tubKg: number; // съедено из своего таза
  stolen: number; // сколько раз отняла чужой корм
  robbed: number; // сколько раз отняли у неё
  treats: number;
  conflicts: number;
  refusals: number;
  fermented: number; // забродивших яблок
  groomed: number;
  wellbeingSum: number;
  wellbeingSamples: number;
  lyingMinutes: number;
  dirtyLying: number; // минут лёжа на мокром и грязном
  caughtLitres: number; // сколько мочи кипер поймал в ведро
  shoves: number; // оттолкнула кипера
  kicks: number; // лягнула (подошли сзади без оклика)
  contactMinutes: number; // минут рядом с кипером
}

export interface ElephantMemory {
  nextThink: number;
  cooldown: Record<string, number>; // ключ поведения → игровое время, раньше которого его не выбирают
  habit: Record<string, number>; // привыкание к видам обогащения 0..1
  // Последняя выполненная (или выполняемая) просьба кипера — в окне награды её хвалят
  call: { until: number; x: number; y: number; arrivedAt: number; rewarded: boolean; why: Request } | null;
  aware: number; // когда последний раз видела или слышала кипера
  tension: number; // 0..1 — насколько ей сейчас тесно рядом с кипером
  accepted: number; // когда последний раз сама приняла контакт (дала погладить, взяла угощение, выполнила просьбу)
  lastWarn: number; // когда предупреждала
  nag: { cue: string; t: number; n: number }; // одну и ту же просьбу повторяют, а она не хочет
  lastGreet: Record<string, number>;
  lastAte: number;
  spooked: number; // когда кипер в последний раз напугал
  zone: ZoneId;
  zoneSince: number; // когда вошла в текущую зону
  lastSignalFx: number; // когда последний раз топнула/заурчала (для ритма сигнала)
  // Ночь: когда проснулась, сколько спала и куда её потянет после (у каждой — по-своему)
  woke: { t: number; slept: number; plan: WakePlan };
  stream: UrineStream | null; // мочится сейчас: сколько всего и куда ушло
  lastPee: { t: number; where: UrineWhere }; // где и когда в последний раз
  seen: { signal: number; wakePee: number }; // что кипер видел сам: её манеру просить, туалет после сна
}

// После пробуждения: попросится, сначала поест, побродит, снова ляжет или сразу пойдёт в туалет
export type WakePlan = 'none' | 'signal' | 'eat' | 'wander' | 'sleep' | 'go';
export type UrineWhere = 'bucket' | 'drain' | 'bedding' | 'concrete' | 'outside' | 'pool' | 'none';

export interface UrineStream {
  litres: number; // сколько всего: зависит от того, сколько выпила
  bladder: number; // наполненность пузыря в начале
  caught: number; // поймано в ведро
  drain: number; // ушло в сток
  floor: number; // на пол
  bedding: boolean; // попало на подстилку
}

// Что слон держит хоботом
export interface Trunk {
  kind: 'hay' | 'straw' | 'bamboo' | 'fruit' | null;
  amount: number;
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
  body: BodyState;
  fluid: number; // выпитая вода, которая ещё станет мочой (в долях пузыря, 0..)
  tipsy: number; // опьянение от забродивших яблок 0..1
  trunk: Trunk;
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

export type FoodItemKind = 'produce' | 'browse' | 'bamboo' | 'hay' | 'straw' | 'fruit' | 'remains';

export interface FoodItem {
  id: number;
  kind: FoodItemKind;
  x: number;
  y: number;
  amount: number; // для кусков — единиц голода; для веток — доля 0..1; для сена — единиц
  t: number;
  zone: ZoneId;
  rot: number; // спелость яблока: 0 — свежее … 0.5 бродит … 0.8+ гниль
}

// Всё, что кипер носит в руках, кладёт на пол или в тачку
export type ThingKind =
  | ToolKind
  | 'hose'
  | 'hay'
  | 'straw'
  | 'browse'
  | 'bamboo'
  | 'sawdust'
  | 'tank'
  | 'washKit'
  | 'chem'
  | 'ration'
  | 'porridge'
  | 'tub'
  | 'pile'
  | 'shard';

// load: лопата — мусор на полотне (0/1), швабра — сырость 0..1, мешок опилок — горстей,
// ведро для мочи — литров, набор для мытья — воды 0..1, средство — порций, ведро овощей — порций,
// каша — кг, куча — объём; aux: таз — его id, каша — когда залили водой; owner — чей таз/каша
export interface Held {
  kind: ThingKind;
  load: number;
  aux: number;
  owner: string | null;
}

export interface LooseItem extends Held {
  id: number;
  x: number;
  y: number;
}

export type TroughStage = 'ok' | 'drained' | 'chem' | 'scrubbed' | 'rinsed';

export interface TroughState {
  level: number;
  valve: boolean;
  overflow: number; // минут переполнения
  drain: boolean; // открыта пробка слива
  debris: number; // сено и сор в воде 0..1
  chem: number; // остаток моющего средства 0..1 (не смыли — пить нельзя)
  stage: TroughStage;
  changed: number; // когда воду последний раз полностью меняли с мытьём
}

export interface FeederState {
  hay: number;
  straw: number;
}

export interface Cells {
  wet: number[];
  soil: number[];
  bedding: number[];
  litter: number[]; // рассыпанное сено и солома на полу
  sawdust: number[]; // опилки поверх мокрого
}

export interface Barrow {
  x: number;
  y: number;
  heading: number;
  pushed: boolean;
  load: number; // навоз и грязная подстилка
  cargo: Held[]; // тюки, мешки, инвентарь, тазы
}

export interface HoseState {
  state: 'reel' | 'held' | 'floor';
  path: Vec[]; // точки перегибов от катушки; последний отрезок — до конца шланга
  end: Vec;
  length: number; // рабочая длина (после покусов короче)
  damage: number; // течь 0..1
  chewed: number; // сколько раз прокусывали
}

export interface Tub {
  id: number;
  owner: string;
  x: number;
  y: number;
  heading: number;
  where: 'rack' | 'prep' | 'held' | 'barrow' | 'floor';
  veg: Record<VegKind, number>; // кг каждого вида
  emptySince: number; // когда опустел на полу (−1 — нет)
  damage: number; // трещины 0..1
  broken: boolean;
  dirty: boolean;
}

export interface ShiftChecks {
  troughChanged: Record<TroughId, boolean>;
  hoseIncidents: number;
  tubsBroken: number;
  porridge: Record<string, number[]>; // слон → когда кормили кашей
  vegTub: Record<string, number>; // слон → сколько кг овощей поставили в таз
  feet: Record<string, boolean>; // слон → осмотрели и почистили стопу
}

export interface World {
  gates: Record<GateId, boolean>;
  feeders: Record<FeederId, FeederState>;
  troughs: Record<TroughId, TroughState>;
  pool: { dirt: number; valve: boolean };
  drum: number;
  ball: { x: number; y: number; vx: number; vy: number };
  cells: Cells;
  cellsVersion: number;
  dirt: { barn: number; paddock: number; minute: number }; // грязь зон, пересчёт раз в минуту
  dung: Dung[];
  food: FoodItem[];
  items: LooseItem[];
  tools: Record<ToolKind, boolean>; // что висит на стойке
  barrow: Barrow;
  hose: HoseState;
  tubs: Tub[];
  trees: Record<string, number>; // яблок на дереве
  container: number;
  stock: {
    hay: number;
    straw: number;
    browse: number;
    bamboo: number;
    sawdust: number;
    veg: Record<VegKind, number>; // кг
    porridge: Record<DietId, number>; // кг сухой смеси
  };
  supplies: { chem: number; shampoo: number; tape: number };
  checks: ShiftChecks;
}

export interface KeeperTask {
  action: ActionRef;
  label: string;
  elapsed: number;
  dur: number;
}

// Нарезка овощей: что сейчас в руке
export interface PrepState {
  tubId: number;
  hand: VegKind | null;
  trimmed: boolean;
  combo: number; // сколько подряд без ошибок
}

export interface Keeper {
  x: number;
  y: number;
  facing: number;
  held: Held | null;
  pouch: number;
  task: KeeperTask | null;
  prep: PrepState | null;
  running: boolean;
  moving: boolean;
  carried: number; // метров пронесено с тюком (для рассыпания)
  stun: number; // секунд приходит в себя после толчка
}

// Действие кипера — данные, а не замыкание: его можно сохранить, повторить и проверить
export interface ActionRef {
  verb: Verb;
  target: string; // станция, id предмета, id слона, клетка
}

export type Verb =
  | 'take'
  | 'putBack'
  | 'takeHose'
  | 'reelHose'
  | 'grabHose'
  | 'pickUp'
  | 'drop'
  | 'stow'
  | 'unstow'
  | 'pushBarrow'
  | 'parkBarrow'
  | 'dumpBarrow'
  | 'loadFeeder'
  | 'shovel'
  | 'dumpShovel'
  | 'sweep'
  | 'mop'
  | 'wring'
  | 'rake'
  | 'sawdust'
  | 'spreadStraw'
  | 'hoseFloor'
  | 'valve'
  | 'drainTrough'
  | 'chemTrough'
  | 'scrubTrough'
  | 'rinseTrough'
  | 'gate'
  | 'treat'
  | 'scratch'
  | 'pet'
  | 'hand'
  | 'voice'
  | 'groom'
  | 'soap'
  | 'scrub'
  | 'rinse'
  | 'shower'
  | 'hoseWash'
  | 'pourDrain'
  | 'footCare'
  | 'tankTake'
  | 'emptyTank'
  | 'feedPorridge'
  | 'handFeed'
  | 'placeTub'
  | 'collectTub'
  | 'takeTub'
  | 'rackTub'
  | 'prepVeg'
  | 'prepPick'
  | 'prepTrim'
  | 'prepToss'
  | 'prepExit'
  | 'mixPorridge'
  | 'takePorridge'
  | 'wash'
  | 'refillPouch'
  | 'scatter'
  | 'tossBrowse'
  | 'fillDrum'
  | 'repairHose'
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
  group: string; // к чему относится: имя слона, станция, тачка, «в руках»
  dist: number; // до цели, м — для порядка в списке
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
  urineTank: number;
  trustDelta: number;
  cooperationDelta: number;
  familiarityDelta?: number; // насколько стала «своей» за смену (в отчётах до полного контакта нет)
  contactMinutes?: number; // сколько была рядом с кипером
  shoves?: number;
  kicks?: number;
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
  startOfDay: Record<string, { trust: number; cooperation: number; familiarity?: number }>;
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
  tag?: string; // подробность для анимации (например, какой овощ)
}
