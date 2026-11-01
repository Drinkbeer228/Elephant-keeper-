import { state, stats, player, wheelbarrow, elephants, feeders, waterTrough, dumpsterState, garbageTruck, vetSchedule, vetNPC, keeperState, gameTime, dayNightCycle, qteState, sawdustStorage, particles, notificationToast, situationalEvents, addLog } from '../gameState.js';
import { sfx } from '../sound.js';
import { shiftTasks } from './tasks.js';
import { clearUrineQtEResultTimeout } from '../elephants/physiology.js';

export function restartShift() {
        gameTime.hour = 8;
        gameTime.minute = 0;
        gameTime.secondAccum = 0;
        gameTime.isShiftEnded = false;

        // Полный сброс суточного цикла
        dayNightCycle.cycleTimer = 0;
        dayNightCycle.phase = 'DAY';
        dayNightCycle.lastPhase = 'DAY';
        dayNightCycle.darkness = 0.0;
        dayNightCycle.sunsetGlow = 0.0;
        dayNightCycle.sunriseGlow = 0.0;
        dayNightCycle.fullDaysCount = 0;

        stats.manureCleanedKg = 0;
        stats.foodDelivered = 0;
        stats.urineSamplesCollected = 0;
        stats.pedicuresDone = 0;
        stats.inspectionsDone = 0;
        stats.observationsRecorded = 0;
        stats.tasksCompleted = 0;
        stats.tasksCompletedOnTime = 0;
        stats.tasksRecovered = 0;
        stats.tasksMissed = 0;
        stats.totalScore = 0;
        stats.situationalEventsOccurred = 0;
        stats.situationalEventsNoticed = 0;
        stats.situationalEventsResolved = 0;
        stats.followUpChecksDone = 0;
        stats.wetHayCleanedKg = 0;
        stats.missedPeeEvents = 0;
        stats.washesDone = 0;
        stats.treatsUsed = 0;
        stats.vetVisitsCompleted = 0;
        stats.vetProceduresDone = 0;
        stats.dumpsterPickupsCompleted = 0;
        stats.sawdustUsed = 0;
        stats.puddlesAbsorbed = 0;
        stats.puddlesCleanedFork = 0;

        // Сброс контейнера навоза и мусоровоза
        dumpsterState.kg = 240;
        dumpsterState.warned80 = false;
        dumpsterState.isFull = false;
        dumpsterState.pickupRequested = false;
        dumpsterState.pickupTimer = 0;

        garbageTruck.active = false;
        garbageTruck.state = 'OFFSITE';
        garbageTruck.x = 1060;
        garbageTruck.y = 88;
        garbageTruck.liftProgress = 0;

        // Сброс графика и NPC ветеринара
        vetSchedule.notified = false;
        vetSchedule.completed = false;

        vetNPC.active = false;
        vetNPC.state = 'OFFSITE';
        vetNPC.x = 650;
        vetNPC.y = 35;
        vetNPC.currentElephantIndex = 0;
        vetNPC.currentElephant = null;
        vetNPC.examProgress = 0;
        vetNPC.keeperAssisting = false;

        // Сброс луж мочи, склада опилок и инвентаря
        state.wetSpots = [
          { id: 1, x: 420, y: 390, r: 28, amount: 14, maxAmount: 14, size: 'medium', sawdustNeeded: 2, sawdustApplied: 0, pourProgress: 0, state: 'puddle', variant: 0 }
        ];
        state.nextWetSpotId = 2;
        sawdustStorage.stock = 30;
        keeperState.treatsStock = 2;
        keeperState.leadingElephantId = null;
        keeperState.washingElephant = null;
        keeperState.washProgress = 0;
        keeperState.washDebounceTimer = 0;

        situationalEvents.length = 0;
        state.activeSituationalEvent = null;
        state.eventCooldownTimer = 35;
        state.misplacedTool = null;
        state.scatteredHay = null;
        state.feederCrust = null;

        notificationToast.timer = 0;
        shiftTasks.forEach(t => {
          t.status = t.startHour <= 8.0 ? 'available' : 'pending';
        });

        player.x = 650;
        player.y = 130;
        player.carrying = 'none';
        player.isDoingPedicure = false;
        player.pedicureProgress = 0;
        player.fullBarrowAlertTimer = 0;
        player.rackDebounceTimer = 0;
        player.forageDebounce = 0;
        // ЭТАП 27R: сброс инструментов и режимов ухода (вилы, мойка, очередь действия)
        player.hasPitchfork = false;
        player.forkProgress = 0;
        player.isWashing = false;
        player.actionQueued = false;
        player.treatDebounceTimer = 0;
        player.washHintDebounce = 0;
        player.isShoveling = false;
        player.shovelProgress = 0;
        player.sawdustStock = 0;
        player.sawdustPourTimer = 0;
        player.isPouringSawdust = false;

        elephants.forEach((el, i) => {
          el.satiety = 50 + i * 10;
          el.thirst = 25 + i * 10;
          el.energy = 85 - i * 5;
          el.state = 'IDLE';
          el.stateTimer = 4 + i * 2;
          el.statusText = el.id === 'audrey' ? 'Наблюдает за порядком в вольере' : (el.id === 'margo' ? 'Осматривается' : 'Отдыхает в зоне настила');
          el.mood = el.id === 'audrey' ? 'Спокойная' : (el.id === 'margo' ? 'Игривая' : 'Спокойная');
          el.isWantingPee = false;
          el.peeTimer = 35 + i * 20;
          el.peeUrgencyTimer = 0;
          el.isWantingPedicure = false;
          el.pedicureTimer = 45 + i * 25;
          el.pedicureUrgencyTimer = 0;
          // Переинициализация таймера навоза для новой смены (как в исходном состоянии слоних)
          el.pooTimer = [35, 25, 45][i % 3];
          // ЭТАП 27R: сброс физиологии и ухода к исходным значениям слоних
          el.bladder = [30, 35, 20][i % 3];
          el.bowel = [30, 40, 20][i % 3];
          el.footDirt = 0;
          el.bodyDirtVisual = 0;
          el.followPause = 0;
          el.feetStatus = ['Подошвы в норме, трещин нет', 'Ногти подстрижены', 'Кожа упругая, здоровая'][i % 3];
          el.lastInspected = 'Не проводился';
          el.observations = [];
          el.lastInspectionSnapshot = null;
          el.pedicureDone = false;
          el.urineSampleDone = false;
          el.selectedObsCategory = 0;
          el.inspectedInPhase = null;
          el.missingBucketAlertTimer = 0;
          el.nightRoutine = null;
        });

        waterTrough.water = 75;
        waterTrough.isRefilling = false;

        // Сброс остатков корма в кормушках до исходного состояния смены
        if (feeders[0]) feeders[0].food = 40;
        if (feeders[1]) feeders[1].food = 30;
        if (feeders[2]) feeders[2].food = 50;

        // Сброс частиц и активных QTE
        particles.length = 0;
        clearUrineQtEResultTimeout(); // отложенное закрытие экрана результата не должно переживать рестарт
        qteState.active = false;
        qteState.result = null;
        qteState.elephant = null;
        qteState.endTimer = 0;
        qteState.returnState = 'PLAYING';
        state.inspectingElephant = null;

        // Сброс счётчика куч навоза: id стартовых куч — 1 и 2, следующая новая куча получает id 3
        state.nextPileId = 3;

        state.dungPiles = [
          { id: 1, x: 260, y: 360, kg: 15, rot: 0.3 },
          { id: 2, x: 560, y: 480, kg: 18, rot: 1.1 }
        ];

        // Сброс тачки и локальных уведомлений
        wheelbarrow.x = 770;
        wheelbarrow.y = 135;
        wheelbarrow.inHands = false;
        wheelbarrow.kg = 0;
        wheelbarrow.isDamaged = false;
        wheelbarrow.damageAnimTimer = 0;
        wheelbarrow.unattendedTimer = 0;
        state.worldToasts = [];

        state.gameState = 'PLAYING';
        state.lastTime = performance.now();
        state.worldAnimTime = 0;
        sfx.playSuccess();
        addLog('Начата новая дневная смена кипера!');
      }
