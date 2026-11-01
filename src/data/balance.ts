// Все числа баланса в одном месте, чтобы крутить их на плейтесте.
// Время — в игровых минутах, если не сказано иное. 0 игровых минут = 08:00 дня приёма.

export const BALANCE = {
  time: {
    dayEnd: 720, // 20:00
    nightEnd: 1320, // 06:00
    shiftEnd: 1440, // 08:00 следующего дня
    // Реальных секунд на игровую минуту
    paceDay: 0.75,
    paceNight: 0.1,
    paceMorning: 0.6,
    // Самый крупный шаг симуляции за один подшаг, игровых минут
    maxStep: 0.5,
  },

  player: {
    speed: 3.4, // клеток в реальную секунду
    reach: 1.3, // радиус взаимодействия, клеток
    stationReach: 0.9, // до края станции
  },

  elephant: {
    speed: 0.9, // клеток в реальную секунду
    radius: 0.75,
    bucketRadius: 1.0, // бак считается «под слонихой» в этом радиусе
    peeLiters: [8, 15] as const,
    peeWetRadius: 0.8, // сколько подстилки мочит промах
    bucketCapacity: 65,
    praiseWindow: 10, // сколько минут после «в бак» лакомство считается заслуженным
    walkCommandDelay: 1, // «Давай гуляй»: через сколько минут сходит в бак
    walkCommandMinBladder: 50,
    bowelPerMinute: 1 / 400, // фон; остальное — от еды
    drinkToBladder: 0.55, // выпитое → пузырь
    eatToBowel: 0.5, // съеденное → кишечник
    dungTolerance: 90, // столько минут свежий навоз обходят, потом затаптывают
    trackCells: 3, // сколько клеток разнесёт на ногах
    hungerPerMinute: 0.12,
    thirstPerMinute: 0.15,
    boredomPerMinute: 0.08,
    nightNeedsFactor: 0.5,
    nightBladderFactor: 0.7,
    hayEatPerMinute: 1.0, // насколько падает голод, пока ест сено
    hayFeederPerMinute: 0.25, // сколько сена уходит из кормушки
    drinkPerMinute: 5,
    troughPerMinute: 1.5,
    mealHunger: 40, // каша или овощи сбивают голод на столько
    basinEatMinutes: 12,
    playerNearBoredom: -0.3, // в минуту, если кипер рядом
    treatBoredom: -10,
    treatTrust: 5,
    begTreatBoredomRate: 0.5, // насколько ускоряется скука от каждого лакомства «за выпрашивание»
    hayTossBoredom: -30,
    swayBoredom: 75,
    reachBoredom: 60,
  },

  barrow: {
    wasteCapacity: 12,
    reach: 4.5, // тачка помогает, если стоит не дальше этого
    speedFactor: 0.8,
    maxBales: 4,
    stableBales: 2, // до стольких тюков едут спокойно, дальше — балансировать
    sawdustLoad: 8,
    strawLoad: 8,
    drift: 0.9, // как быстро раскачивается сама
    noise: 0.55,
    control: 2.6, // насколько сильно выравнивает игрок (Q / E)
    turnKick: 0.12, // толчок при резком повороте
    tipChance: 0.02, // в минуту: скучающая слониха опрокидывает тачку рядом
  },

  container: {
    capacity: 60,
    doorAt: 0.5, // до половины можно заезжать с тачкой
    callAt: 0.7, // с этого можно вызывать мусоровоз
    truckDelay: 60,
  },

  footDebt: {
    // В минуту, пока слониха стоит на клетке такого вида; лёжа — вдвое
    wet: 1.0,
    dung: 0.5,
    trampled: 1.5, // затоптанный навоз: и мокро, и аммиак
    sawdust: 0.1,
    bare: 0.1,
    lyingFactor: 1.5,
    straw: 0,
    // ≈ минут на мокром за смену, после которых слониха начинает хромать
    limpThreshold: 300,
  },

  floor: {
    sawdustAbsorb: 20,
    spreadEvery: 60,
    spreadChance: 0.15,
    dryCheckEvery: 10,
  },

  items: {
    bagCapacity: 6,
    bagReach: 4.5, // мешок должен стоять не дальше этого от места уборки
    sawdustCharges: 6,
    strawCharges: 3,
    breakBase: 0.01, // шанс поломки в минуту для забытой вещи
    breakGrace: 5, // столько минут вещь лежит безопасно
    reachDistance: 2.2, // насколько далеко дотягивается хобот от центра слонихи
    fenceOffReachFactor: 2,
  },

  food: {
    kashaCook: 20,
    kashaEarly: 60, // раньше этого до срока запаривать нельзя
    basins: 6,
    basinCrushAfter: 45,
    basinCrushChance: 0.01,
    hayBale: 40,
    hayStart: 60,
    troughFill: 4,
    troughOverflowEvery: 10,
    lateOk: 20,
    kashaLateLimit: 60,
    dinnerLateLimit: 30,
    vegStartFrom: 360, // 14:00
    // Ожидание после каждого этапа ужина: замочить, взбить, промыть, нарезать
    vegWaits: [30, 20, 10, 10],
  },

  schedule: {
    kasha1: 300, // 13:00
    kasha2: 540, // 17:00
    dinner: 660, // 19:00
  },

  handover: {
    maxDefects: 3,
    wetCellsRemark: 3,
    troughMin: 30,
    hayMin: 20,
  },

  score: {
    threeStars: 80,
    twoStars: 55,
  },
} as const;
