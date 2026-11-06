// Все настраиваемые числа симуляции в одном месте.
// Время потребностей — в игровых минутах; движение — в секундах симуляции.
// Рационы (каши, овощи, нормы сена) — не здесь, а в rations.ts: они взяты из SlonVet.

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
  bale: 35, // единиц сена или соломы в тюке
  feederMax: 100,
  strawMax: 60, // солома лежит в той же кормушке отдельно и сено не вытесняет
  strawEat: 0.32, // солома сытнее воздуха, но не сена
  strawUse: 0.14,
  strawPull: 0.07, // сколько соломы выдёргивают и рассыпают в минуту, пока едят
  beddingEat: 0.22, // голодная жуёт подстилку
  portionHunger: 24, // одна порция овощей из ведра
  portionMinutes: 3.5,
  browseEat: 0.45,
  browseUse: 0.035, // доля охапки в минуту
  bambooEat: 0.36,
  bambooUse: 0.022,
  drumEat: 0.6,
  drumUse: 0.05, // порций в минуту
  drumMax: 4,
  scatterPieces: 8, // кусков из одной порции при разбрасывании
  spoilAfter: 360, // остатки портятся через столько минут
  rationPortions: 3,
  pouchMax: 10,
  carryAmount: 7, // сколько сена слониха выдёргивает, чтобы унести
  tossUse: 0.5, // сена в минуту уходит на подбрасывание
  vegHunger: 1.15, // единиц голода на кг овощей
  vegKgPerMin: 2.6, // скорость еды из таза
  porridgeHunger: 9, // на кг сухой каши
  fruitHunger: 3.5,
  treeFruitMax: 14,
  treeRegrow: 6, // яблок за сутки
  fruitRot: 1 / 900, // спелость в минуту при 20°
  fruitFerment: 0.5, // с этой спелости яблоко бродит
  fruitRotten: 0.82,
  tipsyPerFruit: 0.11,
  tipsyDecay: 0.0055, // в минуту
} as const;

export const WATER = {
  drink: 6, // снижение жажды в минуту
  use: 0.7, // расход воды из поилки в минуту
  fill: 5, // наполнение открытым краном в минуту
  drain: 22, // слив открытой пробкой в минуту
  max: 100,
  overflowEvery: 6, // минут переполнения до новой лужи
  debrisDrink: 0.02, // сено с хобота в воду, если только что ела
  debrisToss: 0.05,
  debrisRefuse: 0.55, // с такого сора разборчивая пить не станет
  debrisSettle: 0.0004, // само по себе вода мутнеет
  poolDirtBathe: 0.012,
  poolDirtDung: 0.18,
  poolRefresh: 0.012,
} as const;

export const FLOOR = {
  urineRadius: 1.15,
  urineWet: 0.9,
  urineLiters: 12,
  sandDry: 0.006, // песок на выгуле подсыхает сам
  concreteDry: 0.004,
  drainDry: 0.05,
  beddingDry: 0.0004, // мокрая солома почти не сохнет
  sawdustAbsorb: 0.6, // доля сырости, которую сразу забирают опилки
  sawdustDry: 0.004, // опилки подсушивают подстилку
  trampleAfter: 50, // свежий навоз обходят, залежавшийся затаптывают
  trampleSoil: 0.55,
  baleRadius: 2.25, // сколько клеток покрывает тюк соломы
  shovelRadius: 0.75,
  sweepRadius: 1.3,
  mopRadius: 1.15,
  mopCells: 6, // сколько клеток моет швабра, пока не отожмёшь
  rakeRadius: 1.2,
  hoseRadius: 1.25,
  litterCarry: 0.006, // сыплется с тюка на каждый метр (бегом — втрое)
  litterBump: 0.25, // тачка с тюками ударилась
  litterVisible: 0.08,
} as const;

export const KEEPER = {
  radius: 0.3,
  speed: 3.2, // м/с
  runFactor: 1.5,
  leadSpeed: 1.3, // м/с: шаг, когда ведёшь слониху рядом с собой
  heavyFactor: 0.7,
  tubFactor: 0.6, // полный таз тяжёлый
  barrowFactor: 0.82,
  reach: 1.25, // до станции
  elephantReach: 2.7, // до головы слона: хобот тянется к руке
  barrowReach: 2.6, // с лопаты в тачку, если она ближе этого
  shovelLoad: 1, // лопата держит одну порцию
  barrowMax: 12,
  barrowCargo: 3, // мест в тачке под тюки, мешки, инвентарь и тазы
  containerMax: 80,
  startTreats: 6,
  tankLiters: 65,
  sawdustUses: 6,
  chemUses: 3,
} as const;

export const HOSE = {
  chew: 0.16, // прогрыз в минуту у шкодливой
  cutAt: 0.75, // прокушен насквозь
  cutLength: 3, // теряется метров при прокусе
  minLength: 9, // короче — шланг не годится
  tapeFix: 0.6, // ремонт закрывает такую долю течи
} as const;

export const BODY = {
  lyingWet: 0.03, // в минуту на мокрой подстилке
  lyingDung: 0.07, // рядом с навозом
  legsSoil: 0.004, // стоять в грязи
  legsClean: 0.003, // на чистом сухом полу и песке ноги понемногу очищаются
  poolClean: 0.02,
  hoseSide: 0.3,
  hoseBack: 0.12,
  hoseBackLying: 0.3,
  scrub: 0.28,
  groomHay: 0.45,
  groomDust: 0.25,
  hayToss: 0.16,
  soapIrritate: 25, // минут несмытой пены до раздражения
} as const;

// Длительность действий кипера, секунд симуляции
export const TASK = {
  talk: 1.6, // спокойно поговорить со слонихой
  shovel: 0.9,
  dumpShovel: 0.45,
  sweep: 1.0,
  mop: 1.1,
  wring: 1.0,
  rake: 1.0,
  sawdust: 1.2,
  hoseFloor: 0.8,
  straw: 1.6,
  loadFeeder: 1.2,
  scatter: 1.2,
  browse: 0.9,
  scratch: 1.8,
  pet: 1.2,
  hand: 1.4,
  groom: 2.0,
  soap: 1.6,
  scrub: 1.8,
  rinse: 1.6,
  shower: 2.2,
  hoseWash: 2.2,
  handFeed: 1.4,
  feedPorridge: 2.6,
  tank: 1.0,
  emptyTank: 1.6,
  drum: 1.2,
  dump: 1.0,
  pouch: 0.8,
  stow: 0.5,
  wash: 2.0,
  chemTrough: 1.6,
  scrubTrough: 3.0,
  rinseTrough: 2.2,
  mixPorridge: 2.5,
  tub: 1.2,
  repairHose: 3.0,
  reelHose: 2.4,
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
} as const;

export const LEARN = {
  expectUp: 0.14,
  expectDown: 0.11,
  trustTreat: 0.03,
  trustScratch: 0.018,
  trustPet: 0.012,
  trustHand: 0.02,
  trustGroom: 0.022,
  trustAnswer: 0.035,
  trustIgnore: 0.012,
  trustSpook: 0.02,
  trustShower: 0.02,
  coopReward: 0.05,
  coopUnrewarded: 0.025,
  toiletUp: 0.12,
  toiletDown: 0.04,
  rewardWindow: 4, // минут после выполнения команды, когда угощение — награда
  baselinePull: 0.004, // в сутки к врождённому уровню
  cueTreat: 0.07, // выполнила просьбу и получила лакомство — знание просьбы растёт
  cuePraise: 0.03, // похвалили голосом — растёт, но меньше
  cueUnrewarded: 0.015, // выполнила, а похвалы нет — знание тает
  nagTrust: 0.012, // одну просьбу повторяют снова и снова — раздражает
  scoldTrust: 0.025, // «нельзя» без причины
  pushyCoop: 0.03, // угостили, пока она напирала, — учится требовать
  trustTalk: 0.006,
  trustStartle: 0.03,
  trustKick: 0.05,
} as const;

// Полный контакт: кипер и слоны рядом. Минуты — игровые, метры — от поверхности корпуса
export const CONTACT = {
  viewRange: 12, // видит кипера впереди и сбоку
  viewHalfAngle: 1.95, // поле зрения: около 110° в каждую сторону
  hearSteps: 4, // слышит шаги за спиной
  voiceRange: 9, // слышит, когда к ней обращаются
  callRange: 25, // окликнуть по имени и позвать слышно издалека — с выгула
  awareMinutes: 5, // столько помнит, что кипер рядом и где он
  tensionRise: 2.2, // в минуту, когда кипер ближе, чем ей удобно, без приглашения
  tensionFall: 0.9,
  stepAway: 0.35, // отойти
  warn: 0.6, // предупредить: уши в стороны, мотает головой
  shove: 0.95, // оттолкнуть
  shovePush: 1.5,
  shoveStun: 2.0, // секунд
  startleGap: 1.0, // подошёл вплотную сзади, пока она не знала
  kickGap: 0.55,
  kickPush: 2.0,
  kickStun: 3.5,
  invitedFor: 5, // минут: после того как сама приняла контакт, кипер «свой» рядом с ней
  familiarityNear: 0.0012, // в минуту рядом (до 6 м), спокойно
  familiarityTouch: 0.006, // за каждый принятый контакт
  familiarityDecay: 0.03, // в сутки, если почти не виделись
} as const;

export const DELIVERY = {
  // Утренний привоз в 08:00: пополнение запасов до нормы
  hay: 14,
  straw: 8,
  browse: 4,
  bamboo: 3,
  sawdust: 4,
  vegKgPerElephant: 72, // на одну слониху: 60 кг основных овощей + сезонное (по SlonVet)
  porridgeSacks: 1, // мешок каждой смеси, если кончается
} as const;

export const START_STOCK = { hay: 12, straw: 7, browse: 3, bamboo: 2, sawdust: 3 } as const;
