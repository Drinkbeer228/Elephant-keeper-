import { sfx } from './sound.js';

// Единый объект игрового состояния (State Container)
export const state = {
  gameState: 'TITLE',
  inspectingElephant: null,
  activeSituationalEvent: null,
  journalOpen: false,
  worldAnimTime: 0,
  lastTime: 0,
  nextPileId: 3,
  nextWetSpotId: 2,
  eventCooldownTimer: 35,
  urineQtEResultTimeoutId: null,
  stepSoundTimer: 0,

  misplacedTool: null,
  scatteredHay: null,
  feederCrust: null,

  dungPiles: [
    { id: 1, x: 260, y: 360, kg: 15, rot: 0.3 },
    { id: 2, x: 560, y: 480, kg: 18, rot: 1.1 }
  ],

  wetSpots: [
    {
      id: 1,
      x: 370,
      y: 410,
      r: 28,
      amount: 14,
      maxAmount: 14,
      size: 'medium',
      sawdustNeeded: 2,
      sawdustApplied: 0,
      pourProgress: 0,
      state: 'puddle',
      variant: 0
    }
  ],

  particles: [],
  logs: [
    { time: '08:00', text: 'Смена началась. Слонихи приветствуют дежурного кипера!' }
  ],
  situationalEvents: [],

  waterTrough: {
        x: 460,
        y: 585,
        w: 85,
        h: 65,
        valveX: 435,
        valveY: 605,
        water: 75, // 0..100%
        maxWater: 100,
        isRefilling: false,
        refillRate: 28, // % в сек при зажатии вентиля
        refillSoundTimer: 0
      },
  feeders: [
        { id: 'audrey', name: 'Кормушка Одри', x: 130, y: 215, w: 80, h: 36, food: 40, maxFood: 100 },
        { id: 'margo', name: 'Кормушка Марго', x: 470, y: 215, w: 80, h: 36, food: 30, maxFood: 100 },
        { id: 'pretty', name: 'Кормушка Претти', x: 800, y: 215, w: 80, h: 36, food: 50, maxFood: 100 }
      ],
  elephants: [
        {
          id: 'audrey',
          name: 'Одри',
          age: 42,
          role: 'Матриарх, любознательная',
          x: 180,
          y: 420,
          targetX: 180,
          targetY: 420,
          vx: 0,
          vy: 0,
          speed: 25, // px/сек (спокойный размеренный шаг)
          color: '#636b73',
          darkColor: '#474e55',
          earColor: '#d6a29f',
          radius: 46,
          satiety: 65,
          thirst: 30,
          energy: 85,
          mood: 'Спокойная',
          state: 'IDLE', // 'IDLE', 'WANDER', 'EAT', 'DRINK', 'REST'
          stateTimer: 6.0,
          statusText: 'Наблюдает за вольером',
          // Индивидуальные параметры поведения Одри (42 года, матриарх):
          // Любопытство, исследование вольера, интерес к окружающим объектам и обогащению
          idleDurationMin: 6,
          idleDurationMax: 12,
          // ЭТАП 28 FIX: отдых заметно длиннее (было 8..15 с — слоны спали
          // считанные секунды). Ориентир 25..45 с игрового времени.
          restDurationMin: 26,
          restDurationMax: 42,
          wanderDurationMin: 5,
          wanderDurationMax: 10,
          restChance: 0.30,
          curiosityRate: 0.44, // Высокий интерес к предметам вольера, чесалке и обогащению
          hungerRate: 0.45,
          thirstRate: 0.40,
          energyDrainRate: 0.85,
          bladderRate: 0.42, // ЭТАП 27: индивидуальный темп наполнения мочевого пузыря
          energyRecoveryRate: 3.6,
          earAngle: 0,
          trunkAngle: 0,
          walkCycle: 0,
          peeTimer: 45,
          bladder: 30, // ЭТАП 27: наполнение мочевого пузыря 0..100
          isWantingPee: false,
          peeUrgencyTimer: 0,
          pooTimer: 35,
          bowel: 30, // ЭТАП 27: наполнение кишечника 0..100
          footDirt: 0, // ЭТАП 27: загрязнение ног 0..100
          pedicureTimer: 40,
          isWantingPedicure: false,
          pedicureUrgencyTimer: 0,
          tailWiggle: 0,
          missingBucketAlertTimer: 0,
          health: 'Отличное',
          earsStatus: 'Чистые, ухоженные',
          trunkStatus: 'Влажный, подвижный',
          feetStatus: 'Подошвы в норме, трещин нет',
          lastInspected: 'Не проводился',
          observations: [],
          lastInspectionSnapshot: null,
          pedicureDone: false,
          urineSampleDone: false,
          selectedObsCategory: 0,
          inspectedInPhase: null
        },
        {
          id: 'margo',
          name: 'Марго',
          age: 28,
          role: 'Переменчивая, общительная',
          x: 500,
          y: 380,
          targetX: 500,
          targetY: 380,
          vx: 0,
          vy: 0,
          speed: 34, // px/сек (средний бодрый темп)
          color: '#727982',
          darkColor: '#535a63',
          earColor: '#dfaba8',
          radius: 42,
          satiety: 50,
          thirst: 40,
          energy: 80,
          mood: 'Игривая',
          state: 'IDLE',
          stateTimer: 4.0,
          statusText: 'Осматривается',
          // Индивидуальные параметры поведения Марго (28 лет):
          // Переменчивость поведения, частая смена занятий, отвлечения на шорохи и почесывания
          idleDurationMin: 2.5,
          idleDurationMax: 5.5,
          // ЭТАП 28 FIX: 25..34 с (было 4..8 с)
          restDurationMin: 25.0,
          restDurationMax: 34.0,
          wanderDurationMin: 3.5,
          wanderDurationMax: 7.0,
          restChance: 0.22,
          distractionChance: 0.35, // Склонность внезапно сменить цель или отвлечься
          curiosityRate: 0.38,
          hungerRate: 0.55,
          thirstRate: 0.50,
          energyDrainRate: 1.15,
          bladderRate: 0.55, // ЭТАП 27: индивидуальный темп наполнения мочевого пузыря
          energyRecoveryRate: 4.0,
          earAngle: 0,
          trunkAngle: 0,
          walkCycle: 0,
          peeTimer: 30,
          bladder: 35, // ЭТАП 27: наполнение мочевого пузыря 0..100
          isWantingPee: false,
          peeUrgencyTimer: 0,
          pooTimer: 25,
          bowel: 40, // ЭТАП 27: наполнение кишечника 0..100
          footDirt: 0, // ЭТАП 27: загрязнение ног 0..100
          pedicureTimer: 65,
          isWantingPedicure: false,
          pedicureUrgencyTimer: 0,
          tailWiggle: 0,
          missingBucketAlertTimer: 0,
          health: 'Хорошее',
          earsStatus: 'Без повреждений',
          trunkStatus: 'Дыхание ровное, чистый',
          feetStatus: 'Ногти подстрижены',
          lastInspected: 'Не проводился',
          observations: [],
          lastInspectionSnapshot: null,
          pedicureDone: false,
          urineSampleDone: false,
          selectedObsCategory: 0,
          inspectedInPhase: null
        },
        {
          id: 'pretty',
          name: 'Претти',
          age: 14,
          role: 'Склонна к покою, чуткая к аппетиту',
          x: 780,
          y: 450,
          targetX: 780,
          targetY: 450,
          vx: 0,
          vy: 0,
          speed: 38, // px/сек
          color: '#828994',
          darkColor: '#606771',
          earColor: '#e8b8b6',
          radius: 38,
          satiety: 55,
          thirst: 35,
          energy: 90,
          mood: 'Спокойная',
          state: 'IDLE',
          stateTimer: 3.0,
          statusText: 'Отдыхает в зоне настила',
          // Индивидуальные параметры поведения Претти (14 лет, Прэтти):
          // Склонность к более длительному отдыху, потребность во внимании к аппетиту и активности
          idleDurationMin: 3.0,
          idleDurationMax: 6.0,
          // ЭТАП 28 FIX: 30..45 с (было 10..20 с) — самый долгий глубокий отдых
          restDurationMin: 30.0,
          restDurationMax: 45.0, // Долгий глубокий отдых
          wanderDurationMin: 3.0,
          wanderDurationMax: 6.0,
          restChance: 0.42, // Выраженная склонность к покою на мягком настиле
          appetiteSensitivity: 1.25, // Чуткость к наличию свежего корма
          curiosityRate: 0.22,
          hungerRate: 0.60,
          thirstRate: 0.50,
          energyDrainRate: 1.25,
          bladderRate: 0.65, // ЭТАП 27: индивидуальный темп наполнения мочевого пузыря
          energyRecoveryRate: 4.8,
          earAngle: 0,
          trunkAngle: 0,
          walkCycle: 0,
          peeTimer: 60,
          bladder: 20, // ЭТАП 27: наполнение мочевого пузыря 0..100
          isWantingPee: false,
          peeUrgencyTimer: 0,
          pooTimer: 45,
          bowel: 20, // ЭТАП 27: наполнение кишечника 0..100
          footDirt: 0, // ЭТАП 27: загрязнение ног 0..100
          pedicureTimer: 85,
          isWantingPedicure: false,
          pedicureUrgencyTimer: 0,
          tailWiggle: 0,
          missingBucketAlertTimer: 0,
          health: 'Прекрасное',
          earsStatus: 'Очень подвижные',
          trunkStatus: 'Тянется к угощениям',
          feetStatus: 'Кожа упругая, здоровая',
          lastInspected: 'Не проводился',
          observations: [],
          lastInspectionSnapshot: null,
          pedicureDone: false,
          urineSampleDone: false,
          selectedObsCategory: 0,
          inspectedInPhase: null
        }
      ],
  player: {
        x: 650,
        y: 130,
        vx: 0,
        vy: 0,
        speed: 162, // px/сек (эквивалент 2.70 px/кадр при 60 FPS)
        radius: 16,
        dir: 'down', // up, down, left, right
        isMoving: false,
        walkAnim: 0,
        carrying: 'none', // 'none', 'hay', 'mash', 'bucket', 'treat' (банан-лакомство, Этап 27)
        isShoveling: false,
        shovelProgress: 0, // 0..1
        isDoingPedicure: false,
        pedicureProgress: 0,
        fullBarrowAlertTimer: 0,
        rackDebounceTimer: 0,
        forageDebounce: 0,
        treatDebounceTimer: 0,
        washHintDebounce: 0,
        isWashing: false,
        hasPitchfork: false,   // вилы взяты со стойки (Этап 27)
        forkProgress: 0,       // 0..1 прогресс уборки мокрого сена вилами
        sawdustStock: 0,       // 0..5 переносимых порций опилок (Этап 30)
        sawdustMaxStock: 5,
        isPouringSawdust: false,
        actionQueued: false,   // ЭТАП 27R: одиночное нажатие действия (Space/E/тап), гасится в update()
        targetPile: null
      },
  sawdustStorage: {
        x: 242,
        y: 55,
        w: 48,
        h: 58,
        stock: 30,     // 30 условных порций на складе
        maxStock: 30
      },
  dumpsterState: {
        x: 825,
        y: 55,
        w: 130,
        h: 65,
        kg: 240,         // начальная загрузка 240/500 кг для наглядности и комфортного тестирования
        maxKg: 500,      // максимальная вместимость 500 кг
        warned80: false,
        isFull: false,
        pickupRequested: false,
        pickupTimer: 0   // таймер ожидания мусоровоза
      },
  garbageTruck: {
        active: false,
        state: 'OFFSITE', // 'OFFSITE' | 'APPROACHING' | 'POSITIONED' | 'EMPTYING' | 'COMPLETED' | 'DEPARTING'
        x: 1060,
        y: 88,
        w: 105,
        h: 52,
        speed: 68,
        targetX: 885,
        targetY: 88,
        timer: 0,
        beaconAnim: 0,
        liftProgress: 0,
        particlesEmitted: 0
      },
  vetSchedule: {
        notifyHour: 10.0,      // 10:00 - предварительное оповещение дежурного кипера
        arrivalHour: 10.5,     // 10:30 - прибытие ветеринарного врача
        notified: false,
        completed: false
      },
  vetNPC: {
        active: false,
        state: 'OFFSITE',      // 'OFFSITE' | 'WALKING_IN' | 'WALKING_TO_ELEPHANT' | 'EXAMINING' | 'CONCLUDING' | 'WALKING_OUT' | 'LEFT'
        x: 650,
        y: 35,
        targetX: 650,
        targetY: 195,
        w: 24,
        h: 36,
        dir: 'down',
        speed: 52,
        walkCycle: 0,
        currentElephantIndex: 0, // 0: Одри, 1: Марго, 2: Претти
        currentElephant: null,
        examPhase: 'VISUAL',     // 'VISUAL' | 'FEET' | 'URINE' | 'VERDICT'
        examProgress: 0,         // 0..100%
        pauseTimer: 0,
        keeperAssisting: false,
        elephantResults: {
          audrey: null,
          margo: null,
          pretty: null
        }
      },
  gameTime: {
        hour: 8,
        minute: 0,
        secondAccum: 0,
        isShiftEnded: false
      },
  dayNightCycle: {
        totalSec: 1200,
        daySec: 840,
        nightSec: 360,
        duskSec: 30,
        dawnSec: 30,

        cycleTimer: 0, // секунды в текущем 1200-секундном цикле (через dt)
        phase: 'DAY',  // 'DAY' | 'DUSK' | 'NIGHT' | 'DAWN'
        lastPhase: 'DAY',
        darkness: 0.0, // 0.0 (день) .. 1.0 (ночь)
        sunsetGlow: 0.0,
        sunriseGlow: 0.0,
        fullDaysCount: 0
      },
  stats: {
        manureCleanedKg: 0,
        foodDelivered: 0,
        urineSamplesCollected: 0,
        pedicuresDone: 0,
        inspectionsDone: 0,
        observationsRecorded: 0,
        tasksCompleted: 0,
        tasksCompletedOnTime: 0,
        tasksRecovered: 0,
        tasksMissed: 0,
        totalScore: 0,
        situationalEventsOccurred: 0,
        situationalEventsNoticed: 0,
        situationalEventsResolved: 0,
        followUpChecksDone: 0,
        wetHayCleanedKg: 0,
        missedPeeEvents: 0,
        washesDone: 0,
        treatsUsed: 0,
        vetVisitsCompleted: 0,
        vetProceduresDone: 0,
        dumpsterPickupsCompleted: 0,
        sawdustUsed: 0,
        puddlesAbsorbed: 0,
        puddlesCleanedFork: 0
      },
  qteState: {
        active: false,
        elephant: null,
        sliderPos: 0, // 0..100
        sliderDir: 1,
        speed: 95, // Скорость бегунка
        targetMin: 38,
        targetMax: 62,
        result: null, // 'perfect', 'good', 'miss'
        endTimer: 0, // реальные мс окончания показа результата (performance.now()+1100; 0 = экран не активен)
        returnState: 'PLAYING' // состояние, в которое возвращаемся после QTE (пауза/планшет/модалка/титры/табель)
      },
  touchControls: {
        dpad: { cx: 95, cy: 590, r: 58, active: false },
        actionBtn: { cx: 925, cy: 590, r: 42, active: false },
        inspectBtn: { cx: 815, cy: 590, r: 32, active: false },
        knob: { x: 0, y: 0 },
        isMouseDown: false
      },
  virtualKeys: {
        up: false,
        down: false,
        left: false,
        right: false,
        action: false
      },
  keeperState: {
        treatsStock: 2,            // запас лакомств на столе (Этап 27)
        leadingElephantId: null,   // слон, ведомый за лакомством (не более одного)
        washingElephant: null,     // слон, которого моют в зоне мойки
        washProgress: 0,           // 0..1 прогресс текущей мойки
        washDebounceTimer: 0       // защита от повторных сообщений при прерывании
      },
  wheelbarrow: {
        x: 770,
        y: 135,
        inHands: false,
        kg: 0,
        maxKg: 60,
        isDamaged: false,
        damageAnimTimer: 0,
        price: 40,
        unattendedTimer: 0
      },
  worldToasts: [],
  nextWorldToastId: 1,
  hudDebugMode: false,
  notificationToast: { text: '', color: '#f39c12', timer: 0, maxTimer: 3.5 },
  keys: {}
};

// Экспорт постоянных ссылок на сущности
export const player = state.player;
export const wheelbarrow = state.wheelbarrow;
export const elephants = state.elephants;
export const feeders = state.feeders;
export const waterTrough = state.waterTrough;
export const sawdustStorage = state.sawdustStorage;
export const dumpsterState = state.dumpsterState;
export const garbageTruck = state.garbageTruck;
export const vetSchedule = state.vetSchedule;
export const vetNPC = state.vetNPC;
export const gameTime = state.gameTime;
export const dayNightCycle = state.dayNightCycle;
export const stats = state.stats;
export const qteState = state.qteState;
export const touchControls = state.touchControls;
export const virtualKeys = state.virtualKeys;
export const keeperState = state.keeperState;
export const notificationToast = state.notificationToast;
export const keys = state.keys;
export const logs = state.logs;
export const particles = state.particles;
export const situationalEvents = state.situationalEvents;

export function addLog(text) {
  const timeStr = `${String(state.gameTime.hour).padStart(2, '0')}:${String(Math.floor(state.gameTime.minute)).padStart(2, '0')}`;
  if (state.logs.length > 0 && state.logs[0].text === text) {
    state.logs[0].count = (state.logs[0].count || 1) + 1;
    return;
  }
  state.logs.unshift({ time: timeStr, text, count: 1 });
  if (state.logs.length > 6) state.logs.pop();
}

export function showToast(text, color = '#f39c12', duration = 3.5) {
  state.notificationToast.text = text;
  state.notificationToast.color = color;
  state.notificationToast.timer = duration;
  state.notificationToast.maxTimer = duration;
}

export function addWorldToast(x, y, text, icon = '', color = '#f1c40f', duration = 2.5) {
  if (!state.worldToasts) state.worldToasts = [];
  if (state.worldToasts.length >= 5) {
    state.worldToasts.shift();
  }
  state.worldToasts.push({
    id: (state.nextWorldToastId = (state.nextWorldToastId || 1) + 1),
    x,
    y,
    startY: y,
    text,
    icon,
    color,
    timer: duration,
    maxTimer: duration,
    vy: -15
  });
}
