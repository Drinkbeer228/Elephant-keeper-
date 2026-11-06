// Все настраиваемые числа симуляции в одном месте.
// Время потребностей — в игровых минутах; движение — в секундах симуляции.

export const TIME = {
  start: 8 * 60, // смена начинается в 08:00 первого дня
  day: 1440,
  step: 1 / 30, // фиксированный шаг симуляции, секунд
  // Игровых минут за секунду симуляции
  paceDay: 1.0,
  paceNight: 2.5,
  nightFrom: 22 * 60,
  nightTo: 6 * 60,
} as const;

export const NEEDS = {
  hunger: 0.26,
  hungerSleep: 0.1,
  thirst: 0.2,
  bladder: 0.28,
  bowel: 0.14,
  drinkToBladder: 0.42, // каждая единица утолённой жажды
  eatToBowel: 0.4, // каждая единица утолённого голода
  fatigueAwake: 0.05,
  fatigueWalk: 0.025,
  fatigueRest: 0.13,
  fatigueSleep: 0.42,
  boredom: 0.11,
  social: 0.2,
  socialRelief: 0.9,
  heatPerDegree: 0.055, // за каждый градус выше 23 на солнце
  heatShade: 0.8,
  heatWater: 3,
  stressFollow: 0.06,
} as const;

export const FOOD = {
  hayEat: 0.9, // снижение голода в минуту у кормушки
  hayUse: 0.11, // сколько сена уходит из кормушки в минуту
  bale: 35, // единиц сена в тюке
  feederMax: 100,
  portionHunger: 24, // одна порция овощей
  portionMinutes: 3.5,
  browseEat: 0.45,
  browseUse: 0.035, // доля охапки в минуту
  drumEat: 0.6,
  drumUse: 0.05, // порций в минуту
  drumMax: 4,
  scatterPieces: 6, // кусков из одной порции при разбрасывании
  pieceHunger: 4,
  spoilAfter: 360, // остатки портятся через столько минут
  rationPortions: 3,
  pouchMax: 10,
} as const;

export const WATER = {
  drink: 6, // снижение жажды в минуту
  use: 0.7, // расход воды из поилки в минуту
  fill: 5, // наполнение открытым краном в минуту
  max: 100,
  overflowEvery: 6, // минут переполнения до новой лужи
  poolDirtBathe: 0.012,
  poolDirtDung: 0.18,
  poolRefresh: 0.012,
} as const;

export const FLOOR = {
  urineRadius: 1.15,
  urineWet: 0.9,
  sandDry: 0.006, // песок на выгуле подсыхает сам
  concreteDry: 0.004,
  drainDry: 0.05,
  beddingDry: 0.0004, // мокрая солома почти не сохнет
  trampleAfter: 50, // свежий навоз обходят, залежавшийся затаптывают
  trampleSoil: 0.55,
  baleRadius: 2.25, // сколько клеток покрывает тюк соломы
  rakeRadius: 1.05,
  hoseRadius: 1.25,
} as const;

export const KEEPER = {
  radius: 0.3,
  speed: 3.2, // м/с
  runFactor: 1.5,
  heavyFactor: 0.7,
  barrowFactor: 0.82,
  reach: 1.25, // до станции
  elephantReach: 2.7, // до головы слона через решётку
  callRange: 34,
  barrowReach: 3.2, // вилы бросают в тачку, если она ближе этого
  toolLoad: 2, // сколько порций мусора держат вилы или грабли
  barrowMax: 12,
  containerMax: 80,
  startTreats: 6,
} as const;

// Длительность действий кипера, секунд симуляции
export const TASK = {
  fork: 0.8,
  rake: 1.0,
  hose: 0.8,
  straw: 1.6,
  hay: 1.2,
  prep: 4,
  ration: 1.0,
  scatter: 1.2,
  browse: 0.9,
  treat: 0.6,
  scratch: 1.8,
  shower: 2.2,
  handFeed: 1.4,
  drum: 1.2,
  dump: 1.0,
  pouch: 0.8,
  clearTrough: 1.0,
} as const;

export const ELEPHANT = {
  speedAmble: 0.95,
  speedPurpose: 1.35,
  speedTrot: 2.0,
  turn: 1.8, // рад/с на ходу
  pivot: 1.05, // рад/с на месте
  radius: 0.95, // радиус проходимости (× размер)
  bodyCircle: 0.82, // радиус кругов тела для расталкивания (× размер)
  bodyOffset: 0.78, // смещение кругов от центра вдоль корпуса (× размер × длина)
  thinkEvery: [1.6, 3.2] as const, // минут между пересмотрами плана
  urgeBladder: 72,
  urgeBowel: 82,
  personalSpace: 2.6,
  keeperSpookDistance: 6,
} as const;

export const LEARN = {
  expectUp: 0.14,
  expectDown: 0.11,
  trustTreat: 0.03,
  trustScratch: 0.018,
  trustAnswer: 0.035,
  trustIgnore: 0.012,
  trustSpook: 0.02,
  trustShower: 0.02,
  coopReward: 0.05,
  coopUnrewarded: 0.025,
  rewardWindow: 4, // минут после выполнения команды, когда угощение — награда
  baselinePull: 0.004, // в сутки к врождённому уровню
} as const;

export const DELIVERY = {
  // Утренний привоз в 08:00: пополнение запасов до нормы
  hay: 14,
  straw: 8,
  produce: 6,
  browse: 4,
} as const;

export const START_STOCK = { hay: 12, straw: 7, produce: 6, browse: 3 } as const;
