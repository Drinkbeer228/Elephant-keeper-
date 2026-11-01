import { state, elephants, waterTrough, feeders, player, keeperState, qteState, particles, addLog } from '../gameState.js';
import { sfx } from '../sound.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT, ELEPHANT_SLEEP_SPOTS, washZone } from '../config.js';
import { canElephantMoveTo } from '../world.js';
import { performSleepUrination } from './physiology.js';

export function moveElephantToward(el, tx, ty, dt, effectiveSpeed) {
        const dist = Math.hypot(tx - el.x, ty - el.y);
        if (dist <= 4) return;

        // Обход куч навоза
        const nearDung = state.dungPiles.find(p => Math.hypot(el.x - p.x, el.y - p.y) < 52);
        if (nearDung) {
          const repAngle = Math.atan2(el.y - nearDung.y, el.x - nearDung.x);
          const repStep = 20 * dt;
          const dodgeX = el.x + Math.cos(repAngle) * repStep;
          const dodgeY = el.y + Math.sin(repAngle) * repStep;
          if (canElephantMoveTo(dodgeX, dodgeY, el.radius, el.id)) {
            el.x = dodgeX;
            el.y = dodgeY;
          }
        }

        const angle = Math.atan2(ty - el.y, tx - el.x);
        const step = Math.min(dist, effectiveSpeed * dt);
        const nextX = el.x + Math.cos(angle) * step;
        const nextY = el.y + Math.sin(angle) * step;

        if (canElephantMoveTo(nextX, nextY, el.radius, el.id)) {
          el.x = nextX;
          el.y = nextY;
        } else if (canElephantMoveTo(nextX, el.y, el.radius, el.id)) {
          el.x = nextX;
        } else if (canElephantMoveTo(el.x, nextY, el.radius, el.id)) {
          el.y = nextY;
        }
        el.walkCycle += dt * (effectiveSpeed / 10);
      }

export function initElephantNightRoutine(el) {
        if (!el.nightRoutine) {
          const sleepSpot = ELEPHANT_SLEEP_SPOTS[el.id] || { x: el.x, y: el.y };
          const distToBed = Math.hypot(el.x - sleepSpot.x, el.y - sleepSpot.y);
          // Индивидуальные таймеры ночного сна:
          // Одри: более долгий глубокий сон (14..18 сек)
          // Марго: более легкий и чуткий сон (9.5..13 сек)
          // Претти: активный молодой режим (10.5..14 сек)
          const initialSleep = el.id === 'audrey' ? (14.0 + Math.random() * 4.0) :
                               (el.id === 'margo' ? (9.5 + Math.random() * 3.5) : (10.5 + Math.random() * 3.5));
          const shouldWalk = distToBed > 38;
          el.nightRoutine = {
            active: true,
            stage: shouldWalk ? 'WALKING_TO_BED' : 'SLEEPING',
            timer: initialSleep,
            targetFeederId: null,
            sleepSpot: sleepSpot,
            mealsTakenTonight: 0
          };
          if (shouldWalk) {
            el.targetX = sleepSpot.x;
            el.targetY = sleepSpot.y;
            el.state = 'WANDER';
            el.statusText = 'Идёт на мягкий настил ко сну';
          } else {
            el.state = 'REST';
            el.statusText = 'Ночной сон на мягком настиле';
          }
        }
      }

export function updateElephantNightRoutine(el, dt, effectiveSpeed) {
        initElephantNightRoutine(el);
        const nr = el.nightRoutine;

        // Если кипер взаимодействует со слонихой — автономное поведение уступает игроку
        if (el.state === 'FOLLOW' || keeperState.leadingElephantId === el.id ||
            (player.isDoingPedicure && player.pedicureProgress > 0) ||
            keeperState.washingElephant === el ||
            (qteState.active && qteState.elephant === el)) {
          return;
        }

        nr.active = true;

        switch (nr.stage) {
          case 'SLEEPING': {
            // Сон на мягком настиле (REST) с восстановлением сил
            el.state = 'REST';
            nr.timer -= dt;

            const cleanBonus = state.dungPiles.length <= 2 ? 1.25 : (state.dungPiles.length >= 5 ? 0.75 : 1.0);
            el.energy = Math.min(100, el.energy + el.energyRecoveryRate * dt * 1.25 * cleanBonus);
            el.statusText = el.id === 'pretty' ? 'Глубокий ночной сон на мягком настиле' :
                           (el.id === 'audrey' ? 'Спокойный ночной сон матриарха' : 'Ночной сон на мягком настиле');

            if (nr.timer <= 0) {
              // Время сна истекло — пробуждение для ночного перекуса
              nr.stage = 'WAKING';
              nr.timer = el.id === 'pretty' ? 1.5 : (el.id === 'audrey' ? 2.5 : 2.0);
              el.state = 'IDLE';
              el.statusText = 'Проснулась ночью, потягивается и чувствует голод';
              el.trunkAngle = 0.25;
            }
            break;
          }

          case 'WAKING': {
            nr.timer -= dt;
            el.state = 'IDLE';
            if (nr.timer <= 0) {
              // Выбор кормушки:
              // 1. Предпочитает свою
              // 2. Если своя пуста — ближайшую кормушку с кормом
              // 3. Если все пусты — возвращается спать
              let chosenFeeder = feeders.find(f => f.id === el.id);
              if (!chosenFeeder || chosenFeeder.food <= 5) {
                const available = feeders.filter(f => f.food > 5);
                if (available.length > 0) {
                  chosenFeeder = available.reduce((best, cur) => {
                    const dBest = Math.hypot(el.x - (best.x + best.w / 2), el.y - (best.y + 70));
                    const dCur = Math.hypot(el.x - (cur.x + cur.w / 2), el.y - (cur.y + 70));
                    return dCur < dBest ? cur : best;
                  });
                  addLog(`Слониха ${el.name} заметила корм в кормушке (${chosenFeeder.name}).`);
                } else {
                  chosenFeeder = null;
                }
              }

              if (chosenFeeder) {
                nr.targetFeederId = chosenFeeder.id;
                nr.stage = 'WALKING_TO_FEEDER';
                el.targetX = chosenFeeder.x + chosenFeeder.w / 2;
                el.targetY = chosenFeeder.y + 70;
                el.state = 'WANDER';
                el.statusText = `Идёт к кормушке (${chosenFeeder.name}) на ночной перекус`;
              } else {
                // Все кормушки пусты
                nr.stage = 'WALKING_TO_BED';
                el.targetX = nr.sleepSpot.x;
                el.targetY = nr.sleepSpot.y;
                el.state = 'WANDER';
                el.statusText = 'Кормушки пусты, возвращается спать на настил';
                addLog(`Слониха ${el.name} проверила кормушки — корма нет. Возвращается ко сну.`);
              }
            }
            break;
          }

          case 'WALKING_TO_FEEDER': {
            el.state = 'WANDER';
            const f = feeders.find(fd => fd.id === nr.targetFeederId);
            if (!f || f.food <= 0) {
              const other = feeders.find(fd => fd.food > 5);
              if (other) {
                nr.targetFeederId = other.id;
                el.targetX = other.x + other.w / 2;
                el.targetY = other.y + 70;
                el.statusText = `Перенаправилась к кормушке ${other.name}`;
              } else {
                nr.stage = 'WALKING_TO_BED';
                el.targetX = nr.sleepSpot.x;
                el.targetY = nr.sleepSpot.y;
                el.statusText = 'Корм закончился, возвращается спать';
              }
              break;
            }

            const dist = Math.hypot(el.x - el.targetX, el.y - el.targetY);
            if (dist <= 20) {
              // Прибыла к кормушке — приём пищи
              nr.stage = 'EATING';
              el.state = 'EAT';
              // 60–120 игровых секунд (в реальном времени 4.5..8.5 сек)
              const eatDuration = el.id === 'audrey' ? (6.5 + Math.random() * 2.5) :
                                 (el.id === 'margo' ? (4.5 + Math.random() * 2.5) : (5.5 + Math.random() * 2.5));
              nr.timer = eatDuration;
              el.statusText = `Ночной приём пищи у кормушки (${f.name})`;
              addLog(`Слониха ${el.name} подошла к кормушке и ест корм.`);
            } else {
              moveElephantToward(el, el.targetX, el.targetY, dt, effectiveSpeed);
            }
            break;
          }

          case 'EATING': {
            el.state = 'EAT';
            nr.timer -= dt;

            const f = feeders.find(fd => fd.id === nr.targetFeederId);
            if (f && f.food > 0) {
              const eatAmount = dt * 4.2;
              f.food = Math.max(0, f.food - eatAmount);
              el.satiety = Math.min(100, el.satiety + eatAmount * 1.5);
              el.bowel = Math.min(100, el.bowel + eatAmount * 1.2);
              el.energy = Math.min(100, el.energy + dt * 1.0);

              if (Math.random() < 0.1) {
                particles.push({
                  x: f.x + Math.random() * f.w,
                  y: f.y + Math.random() * f.h,
                  vx: (Math.random() - 0.5) * 12,
                  vy: (Math.random() - 0.5) * 12,
                  life: 0.5,
                  maxLife: 0.5,
                  color: '#e6c86e',
                  size: 2
                });
              }

              if (f.food <= 0) {
                addLog(`Кормушка (${f.name}) опустела во время ночного кормления.`);
                nr.stage = 'WALKING_TO_BED';
                el.targetX = nr.sleepSpot.x;
                el.targetY = nr.sleepSpot.y;
                el.state = 'WANDER';
                el.statusText = 'Корм закончился, возвращается спать';
                break;
              }
            }

            if (nr.timer <= 0 || el.satiety >= 98) {
              nr.mealsTakenTonight++;
              nr.stage = 'WALKING_TO_BED';
              el.targetX = nr.sleepSpot.x;
              el.targetY = nr.sleepSpot.y;
              el.state = 'WANDER';
              el.statusText = 'Насытилась, возвращается на мягкий настил спать';
              addLog(`Слониха ${el.name} закончила ночную трапезу и идёт отдыхать.`);
            }
            break;
          }

          case 'WALKING_TO_BED': {
            el.state = 'WANDER';
            const dist = Math.hypot(el.x - el.targetX, el.y - el.targetY);
            if (dist <= 22) {
              nr.stage = 'SLEEPING';
              el.state = 'REST';
              // 2–4 игровых минуты сна (в реальном времени 10..18 сек)
              const sleepDuration = el.id === 'audrey' ? (13.0 + Math.random() * 5.0) :
                                   (el.id === 'margo' ? (9.0 + Math.random() * 4.0) : (10.5 + Math.random() * 4.5));
              nr.timer = sleepDuration;
              el.statusText = 'Улеглась на мягкий настил, засыпает';
            } else {
              moveElephantToward(el, el.targetX, el.targetY, dt, effectiveSpeed);
            }
            break;
          }
        }
      }

export function chooseNextElephantState(el) {
        // ЭТАП 27R.2: режим ведения за лакомством имеет приоритет над обычным
        // выбором поведения — обычный FSM не должен сбрасывать FOLLOW.
        if (el.state === 'FOLLOW' && keeperState.leadingElephantId === el.id) return;

        const myFeeder = feeders.find(f => f.id === el.id);

        // Вспомогательная функция поиска чистой точки без навоза
        function findCleanWanderPoint(minX, maxX, minY, maxY) {
          let tries = 0;
          while (tries < 16) {
            const rx = minX + Math.random() * (maxX - minX);
            const ry = minY + Math.random() * (maxY - minY);
            const nearTrough = (rx > 420 && rx < 570 && ry > 520);
            const nearDung = state.dungPiles.some(p => Math.hypot(rx - p.x, ry - p.y) < 65);
            if (!nearTrough && !nearDung && canElephantMoveTo(rx, ry, el.radius, el.id)) {
              return { x: rx, y: ry };
            }
            tries++;
          }
          return { x: minX + (maxX - minX) * 0.5, y: minY + (maxY - minY) * 0.5 };
        }

        // ЭТАП 27: поиск подходящего места для сна на мягком настиле — безопасно
        // (не у кипера, других слонов, стен, интерактивных объектов и мокрого сена)
        function findSleepSpot(e, prefX, prefY) {
          let best = null;
          let bestDist = Infinity;
          for (let tries = 0; tries < 24; tries++) {
            const ang = Math.random() * Math.PI * 2;
            const rad = tries < 12 ? Math.random() * 140 : 140 + Math.random() * 260;
            const rx = Math.max(90, Math.min(CANVAS_WIDTH - 90, prefX + Math.cos(ang) * rad));
            const ry = Math.max(265, Math.min(560, prefY + Math.sin(ang) * rad));
            if (!canElephantMoveTo(rx, ry, e.radius, e.id)) continue;
            if (Math.hypot(player.x - rx, player.y - ry) < 110) continue; // не ложимся на кипера
            if (state.wetSpots.some(w => w.state !== 'absorbed' && Math.hypot(rx - w.x, ry - w.y) < w.r + 55)) continue; // не спим в жидкой луже
            if (state.dungPiles.some(p => Math.hypot(rx - p.x, ry - p.y) < 70)) continue;
            if (rx > washZone.x - washZone.r - 40 && rx < washZone.x + washZone.r + 40 &&
                ry > washZone.y - washZone.r - 40) continue; // не перекрываем зону мойки
            const d = Math.hypot(rx - e.x, ry - e.y);
            if (d < bestDist) { bestDist = d; best = { x: rx, y: ry }; }
          }
          return best;
        }

        // 1. Потребность в воде (жажда > 45 и в поилке есть вода)
        if (el.thirst > 45 && waterTrough.water > 5) {
          // Марго может по пути отвлечься на чесание или внешние звуки
          if (el.id === 'margo' && Math.random() < (el.distractionChance || 0.35)) {
            el.state = 'IDLE';
            el.stateTimer = 3.0 + Math.random() * 2.5;
            el.statusText = 'По пути к поилке отвлеклась и чешет бок';
            el.earAngle = Math.sin(state.worldAnimTime * 3) * 0.18;
            return;
          }
          el.state = 'WANDER';
          el.targetX = 475 + (Math.random() - 0.5) * 45;
          el.targetY = 535 + (Math.random() - 0.5) * 15;
          el.stateTimer = 11;
          el.statusText = 'Идёт к поилке';
          return;
        }

        // 2. Потребность в корме при наличии еды в кормушке
        if (el.satiety < 60 && myFeeder && myFeeder.food > 5) {
          if (el.id === 'margo' && Math.random() < 0.25) {
            el.state = 'IDLE';
            el.stateTimer = 2.5 + Math.random() * 2.5;
            el.statusText = 'Приостановилась по пути к кормушке';
            return;
          }
          el.state = 'WANDER';
          el.targetX = myFeeder.x + myFeeder.w / 2;
          el.targetY = myFeeder.y + 70;
          el.stateTimer = 11;
          el.statusText = 'Идёт к кормушке';
          return;
        }

        // 2А. Голодное кормовое поведение: если сытость < 45% или кормушка пуста, слониха активнее ищет корм
        if ((el.satiety < 45 || (myFeeder && myFeeder.food <= 5)) && Math.random() < 0.65) {
          el.state = 'WANDER';
          const targetOffset = (Math.random() - 0.5) * 44;
          el.targetX = myFeeder ? myFeeder.x + myFeeder.w / 2 + targetOffset : 240;
          el.targetY = myFeeder ? myFeeder.y + 70 + (Math.random() - 0.5) * 20 : 360;
          el.stateTimer = 9.0;
          el.statusText = myFeeder && myFeeder.food > 5 ? 'Ищет корм у кормушки' : 'Принюхивается к пустой кормушке';
          return;
        }

        // 3. Индивидуальные особенности слоних (Этап 10):
        // А) Претти (14 лет, Прэтти): склонность к более длительному отдыху, мягкий настил и аппетит
        if (el.id === 'pretty') {
          const needRest = el.energy < 60 || Math.random() < el.restChance;
          if (needRest) {
            const fatigueBonus = el.energy < 40 ? 6.0 : 0;
            // ЭТАП 27: весь пол — мягкий настил. Претти ищет чистое свободное место
            // рядом с привычным уголком, а не одну маленькую зону отдыха.
            const spot = findSleepSpot(el, 780, 470);
            if (spot && (Math.hypot(spot.x - el.x, spot.y - el.y) > 90 || Math.random() < 0.5)) {
              el.state = 'WANDER';
              el.targetX = spot.x;
              el.targetY = spot.y;
              el.stateTimer = 8.0;
              el.statusText = 'Ищет удобное место на мягком настиле для сна';
              return;
            } else {
              el.state = 'REST';
              el.stateTimer = el.restDurationMin + fatigueBonus + Math.random() * (el.restDurationMax - el.restDurationMin);
              el.statusText = fatigueBonus > 0 ? 'Глубокий восстановительный сон' : 'Спокойный длительный отдых на настиле';
              return;
            }
          }
        }

        // Б) Одри (42 года, матриарх): любопытство, исследование вольера, интерес к предметам обогащения
        if (el.id === 'audrey' && Math.random() < el.curiosityRate) {
          el.state = 'WANDER';
          const interestRoll = Math.random();
          if (interestRoll < 0.35) {
            // Исследование бревна-чесалки и подвесного кольца обогащения среды (x: 280, y: 460)
            el.targetX = 275 + (Math.random() - 0.5) * 35;
            el.targetY = 460 + (Math.random() - 0.5) * 25;
            el.statusText = 'Исследует бревно-чесалку и обогащение среды';
          } else if (interestRoll < 0.65) {
            // Осмотр бассейна и поилки
            el.targetX = 470 + (Math.random() - 0.5) * 40;
            el.targetY = 515 + (Math.random() - 0.5) * 20;
            el.statusText = 'Осматривает зону поилки и настил';
          } else if (interestRoll < 0.85) {
            // Периметр вольера
            el.targetX = 860 + (Math.random() - 0.5) * 40;
            el.targetY = 310 + (Math.random() - 0.5) * 30;
            el.statusText = 'Осматривает периметр вольера';
          } else {
            const pt = findCleanWanderPoint(100, 900, 260, 540);
            el.targetX = pt.x;
            el.targetY = pt.y;
            el.statusText = 'Любознательно исследует вольер';
          }
          el.stateTimer = el.wanderDurationMin + Math.random() * (el.wanderDurationMax - el.wanderDurationMin);
          return;
        }

        // В) Марго (28 лет): переменчивость поведения, периодическая смена занятий, отвлечения
        if (el.id === 'margo' && Math.random() < (el.distractionChance || 0.35)) {
          const mRoll = Math.random();
          if (mRoll < 0.5) {
            el.state = 'IDLE';
            el.stateTimer = 2.5 + Math.random() * 3.0;
            el.statusText = 'Отвлеклась на шорох и чешет бок о брус';
            el.earAngle = Math.sin(state.worldAnimTime * 3) * 0.2;
            return;
          } else {
            // Внезапная смена занятия и направления прогулки
            el.state = 'WANDER';
            const pt = findCleanWanderPoint(180, 820, 280, 520);
            el.targetX = pt.x;
            el.targetY = pt.y;
            el.stateTimer = 3.5 + Math.random() * 3.0;
            el.statusText = 'Сменила занятие, исследует настил';
            return;
          }
        }

        // 4. Потребность в отдыхе (длительная активность повышает потребность в отдыхе).
        // ЭТАП 27: сон возможен на любом мягком настиле — слониха сначала ищет
        // чистую свободную область (без кипера, слонов, стен, объектов и луж).
        const dynamicRestChance = el.restChance + Math.max(0, (60 - el.energy) * 0.008);
        if (el.energy < 35 || Math.random() < dynamicRestChance) {
          const fatigueBonus = el.energy < 40 ? 5.0 : 0;
          const spot = findSleepSpot(el, el.x, el.y);
          if (spot && (Math.hypot(spot.x - el.x, spot.y - el.y) > 70)) {
            el.state = 'WANDER';
            el.targetX = spot.x;
            el.targetY = spot.y;
            el.stateTimer = 9.0;
            el.statusText = 'Ищет чистое место на настиле, чтобы лечь';
            return;
          }
          el.state = 'REST';
          el.stateTimer = el.restDurationMin + fatigueBonus + Math.random() * (el.restDurationMax - el.restDurationMin);
          el.statusText = fatigueBonus > 0 ? 'Глубокий отдых после активности' : 'Спокойно отдыхает на мягком настиле';
          return;
        }

        // 5. Прогулка по вольеру (с обязательным поиском чистой точки)
        if (Math.random() < el.curiosityRate) {
          el.state = 'WANDER';
          const pt = findCleanWanderPoint(80, 920, 270, 550);
          el.targetX = pt.x;
          el.targetY = pt.y;
          el.stateTimer = el.wanderDurationMin + Math.random() * (el.wanderDurationMax - el.wanderDurationMin);
          el.statusText = 'Гуляет по вольеру';
          return;
        }

        // 6. Спокойное стояние на месте (IDLE)
        el.state = 'IDLE';
        el.stateTimer = el.idleDurationMin + Math.random() * (el.idleDurationMax - el.idleDurationMin);
        el.statusText = 'Наблюдает за окружением';
      }
