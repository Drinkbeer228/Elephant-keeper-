import { state, player, wheelbarrow, elephants, feeders, waterTrough, sawdustStorage, keeperState, gameTime, dayNightCycle, stats, notificationToast, virtualKeys, keys, logs, particles, dumpsterState, garbageTruck, vetSchedule, vetNPC, qteState, addWorldToast } from './gameState.js';
import { sfx } from './sound.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT, washZone, treatTable, forkRack, wheelbarrowStation, obstacles } from './config.js';
import { checkCollision, resolveKeeperCollisions, canElephantMoveTo } from './world.js';
import { moveElephantToward, updateElephantNightRoutine, chooseNextElephantState } from './elephants/ai.js';
import { performSleepUrination, performPedicureProcedure, cancelLeading, stopWashing, abortActiveProcedures, estimateNextPeeDelay, spawnWetSpot } from './elephants/physiology.js';
import { updateDayNightCycle } from './systems/dayNight.js';
import { checkAndTriggerSituationalEvents, updateSituationalEvents } from './systems/events.js';
import { updateDumpsterAndTruck } from './systems/dumpster.js';
import { updateVetVisit } from './systems/vet.js';
import { updateShiftTasks } from './shift/tasks.js';
import { render } from './renderer.js';
import { addLog, showToast } from './gameState.js';
import { triggerUrineEvent, startUrineQTE, closeUrineQTE } from './elephants/qte.js';
import { updateTouchControlsUI } from './input.js';

export function update(dt) {
        // 0. Мини-игра на реакцию (ловля анализа мочи в ведро):
        // Работает только бегунок, мир, время смены и слонихи полностью заморожены
        if (state.gameState === 'QTE_URINE') {
          if (qteState.active && qteState.result === null) {
            qteState.sliderPos += qteState.sliderDir * qteState.speed * dt;
            if (qteState.sliderPos >= 96) {
              qteState.sliderPos = 96;
              qteState.sliderDir = -1;
            } else if (qteState.sliderPos <= 4) {
              qteState.sliderPos = 4;
              qteState.sliderDir = 1;
            }
          } else if (qteState.endTimer > 0 && performance.now() >= qteState.endTimer) {
            // Отсчёт показа результата идёт по реальному времени и не зависит от
            // игрового dt; при рестарте смены сбрасывается через closeUrineQTE()
            closeUrineQTE();
          }
          return;
        }

        // Экран результата мог быть прерван переходом в паузу/планшет/модалку/табель.
        // Если к моменту возврата в PLAYING отведённое время истекло — закрываем его сразу.
        if (qteState.active && qteState.result !== null && state.gameState === 'PLAYING') {
          closeUrineQTE();
        }

        // Централизованная пауза: при открытых модальных окнах, планшете, паузе,
        // титульном экране или итоговом табеле симуляция мира остановлена
        if (state.gameState !== 'PLAYING') return;

        state.worldAnimTime += dt;

        // 1. Суточный цикл день/ночь (20 минут реального времени = 24 часа смены, старт 08:00)
        updateDayNightCycle(dt);

        // Автоматическое завершение смены после полного суточного цикла (08:00 следующего утра)
        if (dayNightCycle.fullDaysCount >= 1 && !gameTime.isShiftEnded) {
          gameTime.isShiftEnded = true;
          state.gameState = 'SHIFT_REPORT';
          sfx.playSuccess();
          sfx.playElephantTrumpet();
          addLog('🏁 Суточная смена кипера полностью завершена (24 часа). Подведение итогов дежурства.');
          return;
        }

        // Обновление всплывающего уведомления и проверка задач смены
        if (notificationToast.timer > 0) {
          notificationToast.timer -= dt;
        }
        updateShiftTasks();
        updateSituationalEvents(dt);
        updateDumpsterAndTruck(dt);
        updateVetVisit(dt);

        // 2. Управление движением кипера (Клавиатура WASD/Стрелки + Сенсорный стик)
        let moveX = 0;
        let moveY = 0;
        if (keys['KeyW'] || keys['ArrowUp'] || virtualKeys.up) moveY -= 1;
        if (keys['KeyS'] || keys['ArrowDown'] || virtualKeys.down) moveY += 1;
        if (keys['KeyA'] || keys['ArrowLeft'] || virtualKeys.left) moveX -= 1;
        if (keys['KeyD'] || keys['ArrowRight'] || virtualKeys.right) moveX += 1;

        if (moveX !== 0 && moveY !== 0) {
          // Нормализация вектора при диагонали
          moveX *= 0.7071;
          moveY *= 0.7071;
        }

        player.isMoving = moveX !== 0 || moveY !== 0;

        if (player.isMoving) {
          if (Math.abs(moveX) > Math.abs(moveY)) {
            player.dir = moveX > 0 ? 'right' : 'left';
          } else {
            player.dir = moveY > 0 ? 'down' : 'up';
          }

          player.walkAnim += dt * 8;
          state.stepSoundTimer += dt;
          if (state.stepSoundTimer > 0.3) {
            sfx.playStep();
            state.stepSoundTimer = 0;
          }

          // Скольжение по осям X и Y строго с учетом dt (player.speed в px/сек)
          const moveDist = player.speed * dt;
          const newX = player.x + moveX * moveDist;
          if (!checkCollision(newX, player.y, player.radius)) {
            player.x = newX;
          }

          const newY = player.y + moveY * moveDist;
          if (!checkCollision(player.x, newY, player.radius)) {
            player.y = newY;
          }

          // Этап 26: если шаг всё же привёл к перекрытию со слоном (например, слон
          // одновременно подошёл навстречу), немедленно корректируем позицию.
          resolveKeeperCollisions();
        } else {
          player.walkAnim = 0;
          // Этап 26: выталкивание при стоянии на месте — защита от застревания,
          // когда слон сам наступил на персонажа (управление не блокируется).
          resolveKeeperCollisions();
        }

        // Этап 26: если во время копания лопатой или педикюра слон вошёл в персонажа,
        // разблокируем действие после выталкивания — иначе игрок «застревает» в анимации.
        if ((player.isShoveling || player.isDoingPedicure) && checkCollision(player.x, player.y, player.radius)) {
          resolveKeeperCollisions();
          if (!checkCollision(player.x, player.y, player.radius)) {
            player.isShoveling = false;
            player.shovelProgress = 0;
            player.isDoingPedicure = false;
            player.pedicureProgress = 0;
          }
        }

        // 3. Взаимодействия игрока по клавишам Space / E / Сенсорной кнопке действия
        const actionDown = keys['Space'] || keys['KeyE'] || virtualKeys.action;
        // Флаг «нажатия» устанавливается в обработчике keydown/touchstart и гасится
        // здесь после обработки кадра — одно нажатие не срабатывает несколько раз.
        const actionPressed = player.actionQueued === true;
        const actionHeld = actionDown;
        player.actionQueued = false;

        if (player.fullBarrowAlertTimer > 0) player.fullBarrowAlertTimer -= dt;
        if (player.rackDebounceTimer > 0) player.rackDebounceTimer -= dt;
        if (player.forageDebounce > 0) player.forageDebounce -= dt;
        if (player.treatDebounceTimer > 0) player.treatDebounceTimer -= dt;
        if (player.washHintDebounce > 0) player.washHintDebounce -= dt;
        if (keeperState.washDebounceTimer > 0) keeperState.washDebounceTimer -= dt;

        // А) Уборка навоза лопатой в тачку с честной частичной загрузкой (лимит 60 кг)
        let nearPile = null;
        for (const pile of state.dungPiles) {
          const dist = Math.hypot(player.x - pile.x, player.y - pile.y);
          if (dist < 46) {
            nearPile = pile;
            break;
          }
        }

        // ЭТАП 28 FIX: уборка лопатой — НЕПРЕРЫВНОЕ действие. Прогресс
        // накапливается при удержании Space / сенсорной кнопки (actionHeld),
        // а не по однопиксельному флагу actionPressed (из-за чего уборка была
        // невозможна: флаг живёт один кадр, else-ветка сбрасывала прогресс).
        // Старт разрешён и при пустых руках, и с ведром в руке (ведро просто
        // остаётся при кипере); начинать нельзя во время мойки/педикюра.
        // Взаимодействие с тачкой как с самостоятельным объектом
        const distToWb = Math.hypot(player.x - wheelbarrow.x, player.y - wheelbarrow.y);

        // 1. Покупка новой тачки взамен сломанной на станции
        const distWbStation = Math.hypot(player.x - wheelbarrowStation.x, player.y - wheelbarrowStation.y);
        if (distWbStation < 55 && actionPressed && wheelbarrow.isDamaged) {
          if (stats.totalScore >= wheelbarrow.price) {
            stats.totalScore -= wheelbarrow.price;
            wheelbarrow.isDamaged = false;
            wheelbarrow.kg = 0;
            player.wheelbarrowKg = 0;
            wheelbarrow.x = wheelbarrowStation.x;
            wheelbarrow.y = wheelbarrowStation.y;
            wheelbarrow.inHands = false;
            sfx.playSuccess();
            addLog(`🛒 Куплена новая тачка взамен сломанной (-${wheelbarrow.price} очков).`);
            showToast(`🛒 Новая тачка приобретена (-${wheelbarrow.price} очк.)`, '#2ecc71', 3.0);
          } else {
            sfx.playAlert();
            showToast(`Недостаточно очков для покупки тачки (нужно ${wheelbarrow.price})`, '#e74c3c', 2.5);
          }
        }

        // 2. Поднять исправную тачку с земли
        if (!wheelbarrow.inHands && !wheelbarrow.isDamaged && distToWb < 48 && actionPressed && !nearPile) {
          wheelbarrow.inHands = true;
          if (typeof sfx.playWhoosh === 'function') sfx.playWhoosh();
          else if (typeof sfx.playStep === 'function') sfx.playStep();
          addLog('Кипер взял тачку.');
          showToast('Тачка в руках [E — оставить]', '#2ecc71', 2.0);
        }

        // 3. Оставить тачку на месте (клавиша E)
        if (wheelbarrow.inHands && keys['KeyE']) {
          wheelbarrow.inHands = false;
          wheelbarrow.x = player.x + (player.dir === 'left' ? -22 : 22);
          wheelbarrow.y = player.y;
          keys['KeyE'] = false;
          sfx.playThud();
          addLog('Кипер оставил тачку.');
          showToast('Тачка оставлена', '#3498db', 2.0);
        }

        // 4. Синхронизация позиции тачки в руках с кипером
        if (wheelbarrow.inHands) {
          wheelbarrow.x = player.x + (player.dir === 'left' ? -22 : 22);
          wheelbarrow.y = player.y;
        }

        // 5. Риск повреждения тачки слонами, если она оставлена внутри слоновника без присмотра
        if (!wheelbarrow.inHands && !wheelbarrow.isDamaged && wheelbarrow.y > 195) {
          const nearElephant = elephants.find(el => Math.hypot(el.x - wheelbarrow.x, el.y - wheelbarrow.y) < el.radius + 26);
          if (nearElephant) {
            wheelbarrow.unattendedTimer += dt;
            if (wheelbarrow.unattendedTimer >= 3.5) {
              wheelbarrow.isDamaged = true;
              wheelbarrow.damageAnimTimer = 2.0;
              sfx.playThud();
              sfx.playElephantTrumpet();
              stats.totalScore = Math.max(0, stats.totalScore - 30);
              if (wheelbarrow.kg > 0) {
                state.dungPiles.push({
                  id: state.nextPileId++,
                  x: Math.max(60, Math.min(CANVAS_WIDTH - 60, wheelbarrow.x + 8)),
                  y: Math.max(220, Math.min(CANVAS_HEIGHT - 60, wheelbarrow.y + 6)),
                  kg: wheelbarrow.kg,
                  rot: Math.random() * 3
                });
                wheelbarrow.kg = 0;
                player.wheelbarrowKg = 0;
              }
              addLog(`💥 ${nearElephant.name} опрокинула и помяла оставленную без присмотра тачку! Штраф -30 очков.`);
              addWorldToast(wheelbarrow.x, wheelbarrow.y - 20, 'Тачка сломана! (-30 очк)', '💥', '#e74c3c', 3.5);
              showToast('⚠️ Слон повредил тачку! Купите замену на складе инвентаря [40 очков]', '#e74c3c', 4.0);
            }
          } else {
            wheelbarrow.unattendedTimer = Math.max(0, wheelbarrow.unattendedTimer - dt * 0.5);
          }
        }

        // ЭТАП 28 FIX: уборка лопатой — НЕПРЕРЫВНОЕ действие.
        const shovelCanStart = !player.isDoingPedicure && !player.isWashing;
        if (nearPile && (actionHeld || player.isShoveling) && shovelCanStart) {
          if (!wheelbarrow.inHands) {
            player.isShoveling = false;
            player.shovelProgress = 0;
            if (player.fullBarrowAlertTimer <= 0) {
              sfx.playAlert();
              addLog('⚠️ Чтобы убирать навоз лопатой, сначала возьмите тачку в руки!');
              showToast('Возьмите тачку в руки для уборки навоза!', '#e67e22', 2.0);
              player.fullBarrowAlertTimer = 2.0;
            }
          } else if (wheelbarrow.kg >= wheelbarrow.maxKg) {
            player.isShoveling = false;
            player.shovelProgress = 0;
            if (player.fullBarrowAlertTimer <= 0) {
              sfx.playAlert();
              addLog(`⚠️ Тачка заполнена (60/60 кг)! Отвезите навоз в зеленый контейнер утилизации.`);
              player.fullBarrowAlertTimer = 2.0;
            }
          } else {
            // Набираем навоз лопатой
            player.isShoveling = true;
            player.shovelProgress += dt * 1.5;
            if (Math.random() < 0.2) sfx.playShovel();

            // Создаем частички разлетающейся соломы/грязи
            if (Math.random() < 0.4) {
              particles.push({
                x: nearPile.x + (Math.random() - 0.5) * 16,
                y: nearPile.y + (Math.random() - 0.5) * 16,
                vx: (Math.random() - 0.5) * 40,
                vy: -20 - Math.random() * 30,
                life: 0.4,
                maxLife: 0.4,
                color: '#8b5a2b',
                size: 3
              });
            }

            if (player.shovelProgress >= 1) {
              const freeCap = Math.max(0, wheelbarrow.maxKg - wheelbarrow.kg);
              const loadedKg = Math.min(freeCap, nearPile.kg);
              const remainingKg = Math.max(0, nearPile.kg - loadedKg);

              wheelbarrow.kg += loadedKg;
              player.wheelbarrowKg = wheelbarrow.kg;
              stats.manureCleanedKg += loadedKg;
              stats.totalScore += loadedKg * 2;

              if (remainingKg <= 0.01) {
                state.dungPiles = state.dungPiles.filter(p => p.id !== nearPile.id);
              } else {
                nearPile.kg = remainingKg;
              }

              // Реакция слоних на уборку зоны отдыха (Этап 10)
              elephants.forEach(el => {
                const distToCleaned = Math.hypot(el.x - nearPile.x, el.y - nearPile.y);
                if (distToCleaned < 160 || state.dungPiles.length <= 2) {
                  if (el.mood !== 'Спокойная' && el.mood !== 'Бодрая') el.mood = 'Спокойная';
                  if (el.state === 'IDLE' || el.state === 'REST') {
                    if (el.id === 'audrey') el.statusText = 'Одобряет чистоту и порядок в вольере';
                    else if (el.id === 'pretty') el.statusText = 'Довольна чистым настилом в зоне отдыха';
                    else if (el.id === 'margo') el.statusText = 'Наблюдает за уборкой, обмахивается ушами';
                  }
                }
              });

              player.isShoveling = false;
              player.shovelProgress = 0;
              sfx.playThud();

              if (remainingKg > 0.01) {
                addLog(`В тачку загружено ${loadedKg} кг (до максимума 60 кг). В куче осталось ${remainingKg} кг!`);
              } else {
                addLog(`Убрано ${loadedKg} кг навоза (в тачке: ${wheelbarrow.kg}/${wheelbarrow.maxKg} кг).`);
              }
            }
          }
        } else {
          player.isShoveling = false;
          player.shovelProgress = 0;
        }

        // Б) Разгрузка тачки в большой контейнер утиля (срабатывает слева, снизу и вплотную)
        const nearDumpster = player.x >= 780 && player.x <= 975 && player.y >= 50 && player.y <= 175;
        if (nearDumpster && actionPressed && (wheelbarrow.kg > 0 || player.wheelbarrowKg > 0)) {
          if (dumpsterState.kg >= dumpsterState.maxKg) {
            sfx.playAlert();
            showToast('⚠️ Контейнер утилизации переполнен (500/500 кг)! Разгрузка невозможна до вывоза мусоровозом.', '#e74c3c');
            addLog('⚠️ Контейнер навоза заполнен до предела (500 кг). Ожидайте прибытия мусоровоза коммунальной службы.');
          } else {
            const currentWbKg = wheelbarrow.kg || player.wheelbarrowKg;
            const availableSpace = dumpsterState.maxKg - dumpsterState.kg;
            const toUnload = Math.min(currentWbKg, availableSpace);
            dumpsterState.kg += toUnload;
            wheelbarrow.kg -= toUnload;
            player.wheelbarrowKg = wheelbarrow.kg;
            sfx.playThud();
            const earnedPoints = Math.max(10, Math.round(toUnload * 0.5));
            stats.totalScore += earnedPoints;

            if (wheelbarrow.kg <= 0.01) {
              wheelbarrow.kg = 0;
              player.wheelbarrowKg = 0;
              addLog(`Выгружено ${toUnload} кг навоза в контейнер утиля (${dumpsterState.kg}/${dumpsterState.maxKg} кг). Тачка свободна.`);
              showToast(`🗑️ Тачка полностью разгружена (+${earnedPoints} очк.)`, '#2ecc71');
            } else {
              addLog(`Выгружено ${toUnload} кг навоза. В тачке осталось ${wheelbarrow.kg} кг, так как контейнер заполнился до предела!`);
              showToast(`⚠️ Контейнер заполнился! В тачке осталось ${wheelbarrow.kg} кг`, '#f39c12');
            }

            // Предупреждение о 80% (400 кг)
            if (dumpsterState.kg >= 400 && !dumpsterState.warned80) {
              dumpsterState.warned80 = true;
              sfx.playAlert();
              showToast('⚠️ Контейнер навоза заполнен на 80% (400/500 кг)! Скоро потребуется вывоз.', '#f39c12');
              addLog('Внимание: контейнер навоза заполнен на 80% (400/500 кг).');
            }

            // Переполнение на 100% (500 кг) и автоматический вызов мусоровоза
            if (dumpsterState.kg >= dumpsterState.maxKg) {
              dumpsterState.isFull = true;
              if (!dumpsterState.pickupRequested) {
                dumpsterState.pickupRequested = true;
                dumpsterState.pickupTimer = 10.0;
                sfx.playAlert();
                showToast('🚨 Контейнер полон (500 кг)! Автоматическая заявка отправлена, мусоровоз в пути.', '#e74c3c');
                addLog('🚨 Контейнер навоза заполнен на 100% (500 кг). Диспетчерская служба направила мусоровоз.');
              }
            }
          }
        }

        // В) Интерактивная стойка чистых лабораторных ведер для проб мочи
        const nearBucketRack = player.x >= 705 && player.x <= 820 && player.y >= 50 && player.y <= 160;
        if (nearBucketRack && actionPressed && !player.isShoveling && !player.isDoingPedicure) {
          if (player.rackDebounceTimer <= 0) {
            if (player.carrying === 'none') {
              player.carrying = 'bucket';
              sfx.playThud();
              addLog('Взято чистое лабораторное ведро со стойки. Теперь можно подойти к слонихе для отбора пробы.');
              player.rackDebounceTimer = 0.5;
            } else if (player.carrying === 'bucket') {
              player.carrying = 'none';
              sfx.playThud();
              addLog('Лабораторное ведро возвращено на стойку инвентаря.');
              player.rackDebounceTimer = 0.5;
            } else {
              addLog('Руки заняты кормом! Сначала отнесите его в кормушку слоних.');
              player.rackDebounceTimer = 0.5;
            }
          }
        }

        // Г0) Стол с лакомствами — взять банан для ведения слона (Этап 27)
        const nearTreatTable = Math.hypot(player.x - treatTable.x, player.y - treatTable.y) < 55;
        if (nearTreatTable && actionPressed && !player.isShoveling && !player.isDoingPedicure && !player.isWashing) {
          if (player.carrying === 'none') {
            if (keeperState.treatsStock > 0) {
              player.carrying = 'treat';
              keeperState.treatsStock--;
              sfx.playThud();
              addLog('🍌 Взято лакомство (банан) со стола. Покажите его слонихе, чтобы повести её за собой.');
            } else if (player.treatDebounceTimer <= 0) {
              addLog('На столе лакомства закончились! Дождитесь пополнения или используйте стойку ведер.');
              player.treatDebounceTimer = 2.0;
            }
          } else if (player.carrying === 'treat') {
            player.carrying = 'none';
            keeperState.treatsStock++;
            sfx.playThud();
            addLog('Банан возвращён на стол с лакомствами.');
          }
        }

        // Г1) Стойка вил — взять/вернуть вилы для уборки мокрого сена (Этап 27R)
        const nearForkRack = Math.hypot(player.x - forkRack.x, player.y - forkRack.y) < 55;
        if (nearForkRack && actionPressed && !player.isShoveling && !player.isDoingPedicure && !player.isWashing) {
          if (player.rackDebounceTimer <= 0) {
            if (player.hasPitchfork) {
              player.hasPitchfork = false;
              player.forkProgress = 0;
              sfx.playThud();
              addLog('Вилы возвращены на стойку садового инвентаря.');
            } else if (player.carrying === 'none') {
              player.hasPitchfork = true;
              sfx.playThud();
              addLog('🛠️ Взяты вилы со стойки. Ими убираются мокрые участки настила в вольере.');
            } else {
              addLog('Руки заняты! Освободите их, чтобы взять вилы.');
            }
            player.rackDebounceTimer = 0.5;
          }
        }

        // Г1-b) Склад чистых опилок — набрать порции в сумку кипера (Этап 30)
        const distToSawdust = Math.hypot(player.x - (sawdustStorage.x + sawdustStorage.w / 2), player.y - (sawdustStorage.y + sawdustStorage.h / 2));
        if (distToSawdust < 58 && (actionPressed || (actionHeld && player.sawdustStock < player.sawdustMaxStock && player.rackDebounceTimer <= 0)) && !player.isShoveling && !player.isDoingPedicure && !player.isWashing) {
          if (sawdustStorage.stock <= 0) {
            sfx.playAlert();
            showToast('⚠️ Склад чистых опилок пуст (0/30 порций)!', '#e74c3c');
            addLog('Склад чистых опилок исчерпан. Используйте вилы для прямой уборки настила.');
          } else if (player.sawdustStock >= player.sawdustMaxStock) {
            sfx.playAlert();
            showToast(`⚠️ Запас опилок полон (${player.sawdustStock}/${player.sawdustMaxStock} порций)!`, '#f39c12');
            addLog(`Сумка для опилок заполнена (${player.sawdustStock}/${player.sawdustMaxStock} порций).`);
          } else {
            const need = player.sawdustMaxStock - player.sawdustStock;
            const take = Math.min(need, sawdustStorage.stock);
            player.sawdustStock += take;
            sawdustStorage.stock -= take;
            player.rackDebounceTimer = 0.4;
            sfx.playThud();
            addLog(`Набрано ${take} порц. опилок (в сумке: ${player.sawdustStock}/${player.sawdustMaxStock}, на складе: ${sawdustStorage.stock}/${sawdustStorage.maxStock}).`);
            showToast(`🪵 Набрано опилок: ${player.sawdustStock}/${player.sawdustMaxStock} (склад: ${sawdustStorage.stock})`, '#2ecc71');
          }
        }

        // Г2) Взаимодействие с лужами мочи и настилом (засыпание опилками / уборка вилами)
        let nearWetSpot = null;
        for (const w of state.wetSpots) {
          if (Math.hypot(player.x - w.x, player.y - w.y) < w.r + 38) {
            nearWetSpot = w;
            break;
          }
        }

        player.isPouringSawdust = false;

        if (nearWetSpot && actionHeld && !player.isShoveling && !player.isDoingPedicure && !player.isWashing) {
          // 1. Если лужа ещё не впитана (state !== 'absorbed'):
          if (nearWetSpot.state !== 'absorbed') {
            // Приоритет А: у кипера есть опилки при себе -> засыпаем лужу опилками
            if (player.sawdustStock > 0) {
              player.isPouringSawdust = true;
              nearWetSpot.pourProgress += dt * 1.25; // ~0.8с на внесение 1 порции

              if (Math.random() < 0.28) sfx.playSawdust();

              // Анимация летящих частиц светлых древесных опилок
              if (Math.random() < 0.55) {
                particles.push({
                  x: player.x + (Math.random() - 0.5) * 12,
                  y: player.y + (Math.random() - 0.5) * 12,
                  vx: (nearWetSpot.x - player.x) * (0.8 + Math.random() * 0.4) + (Math.random() - 0.5) * 20,
                  vy: (nearWetSpot.y - player.y) * (0.8 + Math.random() * 0.4) + (Math.random() - 0.5) * 20,
                  life: 0.35,
                  maxLife: 0.35,
                  color: Math.random() < 0.5 ? '#f5e2a3' : '#dfc98e',
                  size: 2.2 + Math.random() * 1.8
                });
              }

              if (nearWetSpot.pourProgress >= 1.0) {
                nearWetSpot.pourProgress = 0;
                player.sawdustStock--;
                nearWetSpot.sawdustApplied++;
                stats.sawdustUsed++;
                sfx.playThud();

                if (nearWetSpot.sawdustApplied < nearWetSpot.sawdustNeeded) {
                  nearWetSpot.state = 'absorbing';
                  addLog(`🪵 На лужу насыпана порция опилок (${nearWetSpot.sawdustApplied}/${nearWetSpot.sawdustNeeded}). Опилки впитывают жидкость.`);
                  showToast(`🪵 Засыпана порция опилок (${nearWetSpot.sawdustApplied}/${nearWetSpot.sawdustNeeded})`, '#f39c12');
                } else {
                  nearWetSpot.state = 'absorbed';
                  stats.puddlesAbsorbed++;
                  stats.totalScore += 25;
                  sfx.playSuccess();
                  addLog(`✨ Моча полностью впитана опилками (${nearWetSpot.sawdustNeeded} порц.)! Теперь соберите влажную массу вилами в тачку.`);
                  showToast(`✅ Лужа полностью впитана опилками! Уберите массу вилами.`, '#2ecc71');
                }
              }
            } else if (player.hasPitchfork) {
              // Приоритет Б: опилок нет, но есть вилы -> прямая уборка мокрого сена вилами
              if (player.wheelbarrowKg >= player.wheelbarrowMaxKg) {
                player.forkProgress = 0;
                if (player.fullBarrowAlertTimer <= 0) {
                  sfx.playAlert();
                  addLog('⚠️ Тачка заполнена (60/60 кг)! Разгрузите её в контейнер утиля.');
                  player.fullBarrowAlertTimer = 2.0;
                }
              } else {
                player.forkProgress += dt * 1.1;
                if (Math.random() < 0.25) sfx.playShovel();
                if (Math.random() < 0.35) {
                  particles.push({
                    x: nearWetSpot.x + (Math.random() - 0.5) * 26,
                    y: nearWetSpot.y + (Math.random() - 0.5) * 18,
                    vx: (Math.random() - 0.5) * 40,
                    vy: -20 - Math.random() * 25,
                    life: 0.45,
                    maxLife: 0.45,
                    color: '#c29f52',
                    size: 2.5
                  });
                }
                if (player.forkProgress >= 1.0) {
                  player.forkProgress = 0;
                  const freeCap = Math.max(0, player.wheelbarrowMaxKg - player.wheelbarrowKg);
                  const loadedKg = Math.min(freeCap, nearWetSpot.amount);
                  const remainingKg = Math.max(0, nearWetSpot.amount - loadedKg);
                  player.wheelbarrowKg += loadedKg;
                  stats.wetHayCleanedKg += loadedKg;
                  stats.totalScore += loadedKg * 2;
                  if (remainingKg <= 0.01) {
                    state.wetSpots = state.wetSpots.filter(w => w.id !== nearWetSpot.id);
                    stats.puddlesCleanedFork++;
                    addLog(`🍀 Мокрый настил убран вилами: ${loadedKg} кг в тачке. Участок чист!`);
                    showToast(`🍀 Участок убран вилами (+${loadedKg * 2} очк.)`, '#2ecc71');
                  } else {
                    nearWetSpot.amount = remainingKg;
                    addLog(`В тачку загружено ${loadedKg} кг мокрого сена (остаток: ${remainingKg} кг).`);
                  }
                  sfx.playThud();
                }
              }
            } else {
              // Нет ни опилок, ни вил
              if (player.forageDebounce <= 0) {
                sfx.playAlert();
                addLog('⚠️ Для уборки лужи наберите опилки на складе или возьмите вилы на стойке!');
                showToast('🪵 Наберите опилки на складе или возьмите вилы!', '#f39c12');
                player.forageDebounce = 2.0;
              }
            }
          } else {
            // 2. Лужа уже полностью впитана опилками (state === 'absorbed'):
            // Нельзя засыпать повторно! Убирается ТОЛЬКО вилами!
            if (player.hasPitchfork) {
              if (player.wheelbarrowKg >= player.wheelbarrowMaxKg) {
                player.forkProgress = 0;
                if (player.fullBarrowAlertTimer <= 0) {
                  sfx.playAlert();
                  addLog('⚠️ Тачка заполнена (60/60 кг)! Разгрузите её в зеленый контейнер утиля.');
                  player.fullBarrowAlertTimer = 2.0;
                }
              } else {
                player.forkProgress += dt * 1.25;
                if (Math.random() < 0.25) sfx.playShovel();
                if (Math.random() < 0.4) {
                  particles.push({
                    x: nearWetSpot.x + (Math.random() - 0.5) * 24,
                    y: nearWetSpot.y + (Math.random() - 0.5) * 16,
                    vx: (Math.random() - 0.5) * 35,
                    vy: -22 - Math.random() * 20,
                    life: 0.4,
                    maxLife: 0.4,
                    color: Math.random() < 0.5 ? '#9c7a42' : '#dfc98e',
                    size: 2.5
                  });
                }
                if (player.forkProgress >= 1.0) {
                  player.forkProgress = 0;
                  const freeCap = Math.max(0, player.wheelbarrowMaxKg - player.wheelbarrowKg);
                  const loadedKg = Math.min(freeCap, nearWetSpot.amount);
                  const remainingKg = Math.max(0, nearWetSpot.amount - loadedKg);
                  player.wheelbarrowKg += loadedKg;
                  stats.wetHayCleanedKg += loadedKg;
                  stats.puddlesCleanedFork++;
                  stats.totalScore += Math.round(loadedKg * 2.5);
                  if (remainingKg <= 0.01) {
                    state.wetSpots = state.wetSpots.filter(w => w.id !== nearWetSpot.id);
                    addLog(`🍀 Впитавшие опилки убраны вилами (${loadedKg} кг в тачку). Настил полностью чист и сух!`);
                    showToast(`✅ Загрязнённые опилки убраны вилами (+${Math.round(loadedKg * 2.5)} очк.)`, '#2ecc71');
                  } else {
                    nearWetSpot.amount = remainingKg;
                    addLog(`В тачку погружено ${loadedKg} кг загрязнённых опилок (остаток: ${remainingKg} кг).`);
                  }
                  sfx.playThud();
                }
              }
            } else {
              // Игрок подошёл без вил к впитанной массе
              player.forkProgress = 0;
              if (player.forageDebounce <= 0) {
                sfx.playAlert();
                addLog('⚠️ Лужа уже впитана опилками! Возьмите вилы на стойке инвентаря, чтобы собрать массу в тачку.');
                showToast('🛠️ Возьмите вилы на стойке, чтобы убрать впитавшие опилки!', '#f1c40f');
                player.forageDebounce = 2.0;
              }
            }
          }
        } else {
          player.forkProgress = 0;
          if (nearWetSpot) nearWetSpot.pourProgress = 0;
        }

        // Г) Взятие корма на складе фуража (Сено / Каша)
        const nearHay = Math.hypot(player.x - 80, player.y - 120) < 55;
        const nearMash = Math.hypot(player.x - 190, player.y - 120) < 55;

        if (actionPressed && !player.isShoveling && !player.isDoingPedicure) {
          if (nearHay) {
            if (player.carrying === 'none') {
              player.carrying = 'hay';
              sfx.playThud();
              addLog('Кипер взял тюк отборного лугового сена.');
            } else if (player.carrying === 'bucket') {
              if (player.forageDebounce <= 0) {
                addLog('В руках лабораторное ведро! Сначала верните его на стойку.');
                player.forageDebounce = 1.5;
              }
            }
          } else if (nearMash) {
            if (player.carrying === 'none') {
              player.carrying = 'mash';
              sfx.playThud();
              addLog('Кипер взял таз с теплой кашей и морковью.');
            } else if (player.carrying === 'bucket') {
              if (player.forageDebounce <= 0) {
                addLog('В руках лабораторное ведро! Сначала верните его на стойку.');
                player.forageDebounce = 1.5;
              }
            }
          }
        }

        // Д) Раскладка корма в кормушки слонов
        for (const feeder of feeders) {
          const dist = Math.hypot(player.x - (feeder.x + feeder.w / 2), player.y - (feeder.y + feeder.h / 2));
          if (dist < 55 && actionPressed) {
            if (player.carrying === 'hay' || player.carrying === 'mash') {
              const amount = player.carrying === 'hay' ? 35 : 45;
              feeder.food = Math.min(feeder.maxFood, feeder.food + amount);
              stats.foodDelivered += 1;
              stats.totalScore += 30;
              sfx.playThud();
              addLog(`Корм доставлен в ${feeder.name} (+${amount}%).`);
              player.carrying = 'none';

              // Реакция слоних на раздачу корма (Этап 10)
              const targetEl = elephants.find(e => e.id === feeder.id);
              if (targetEl) {
                targetEl.trunkAngle = 0.25;
                targetEl.earAngle = 0.2;
                if (targetEl.id === 'audrey') {
                  targetEl.statusText = 'Почувствовала запах свежего корма в кормушке';
                } else if (targetEl.id === 'margo') {
                  targetEl.statusText = 'Заметила раздачу корма и спешит полакомиться!';
                } else if (targetEl.id === 'pretty') {
                  targetEl.statusText = 'Проявила аппетит: подошла к свежей порции';
                }
                if (targetEl.state === 'IDLE' || targetEl.state === 'WANDER' || targetEl.satiety < 75) {
                  targetEl.state = 'WANDER';
                  targetEl.targetX = feeder.x + feeder.w / 2;
                  targetEl.targetY = feeder.y + 70;
                  targetEl.stateTimer = 11;
                }
              }
              break;
            }
          }
        }

        // Д1) Интерактивные внеплановые действия в вольере (Этап 09)
        // 1. Уборка забытого ведра на полу
        if (state.misplacedTool && state.misplacedTool.active && !player.isShoveling && !player.isDoingPedicure) {
          const distTool = Math.hypot(player.x - state.misplacedTool.x, player.y - state.misplacedTool.y);
          if (distTool < 48 && actionPressed) {
            state.misplacedTool.active = false;
            sfx.playThud();
            sfx.playSuccess();
            stats.totalScore += 25;
            if (state.activeSituationalEvent && state.activeSituationalEvent.type === 'tool_misplaced') {
              state.activeSituationalEvent.actionDone = true;
              state.activeSituationalEvent.followUpReady = true;
              state.activeSituationalEvent.pointsAwarded += 25;
            }
            showToast('🪣 Ведро убрано с прохода на стойку! (+25 очк.)', '#2ecc71');
            addLog('Забытое ведро убрано с прохода вольера на стойку инвентаря.');
          }
        }

        // 2. Сбор рассыпанного сена у кормушки
        if (state.scatteredHay && state.scatteredHay.active && !player.isShoveling && !player.isDoingPedicure) {
          const distHay = Math.hypot(player.x - state.scatteredHay.x, player.y - state.scatteredHay.y);
          if (distHay < 48 && actionPressed) {
            state.scatteredHay.active = false;
            sfx.playShovel();
            sfx.playSuccess();
            const fPretty = feeders.find(f => f.id === 'pretty');
            if (fPretty) fPretty.food = Math.min(100, fPretty.food + 15);
            stats.totalScore += 25;
            if (state.activeSituationalEvent && state.activeSituationalEvent.type === 'scattered_hay') {
              state.activeSituationalEvent.actionDone = true;
              state.activeSituationalEvent.followUpReady = true;
              state.activeSituationalEvent.pointsAwarded += 25;
            }
            showToast('🌾 Сено собрано обратно в кормушку! (+25 очк.)', '#2ecc71');
            addLog('Рассыпанный фураж собран в кормушку. Вольер приведен в порядок.');
          }
        }

        // 3. Санитарная очистка бортика кормушки от засохшей каши
        if (state.feederCrust && state.feederCrust.active && !player.isShoveling && !player.isDoingPedicure) {
          const fAudrey = feeders.find(f => f.id === state.feederCrust.feederId);
          if (fAudrey) {
            const distCrust = Math.hypot(player.x - (fAudrey.x + fAudrey.w / 2), player.y - (fAudrey.y + fAudrey.h / 2));
            if (distCrust < 55 && actionPressed) {
              state.feederCrust.progress += dt * 1.2;
              if (Math.random() < 0.25) sfx.playShovel();
              if (state.feederCrust.progress >= 1.0) {
                state.feederCrust.active = false;
                state.feederCrust.progress = 0;
                sfx.playSuccess();
                stats.totalScore += 25;
                if (state.activeSituationalEvent && state.activeSituationalEvent.type === 'feeder_crust') {
                  state.activeSituationalEvent.actionDone = true;
                  state.activeSituationalEvent.followUpReady = true;
                  state.activeSituationalEvent.pointsAwarded += 25;
                }
                showToast('🧼 Бортик кормушки вычищен щеткой! (+25 очк.)', '#2ecc71');
                addLog('Санитарная очистка бортика кормушки завершена (+25 очков).');
              }
            } else {
              state.feederCrust.progress = 0;
            }
          }
        }

        // Е) Водяной вентиль автопоилки слонов (постепенное пополнение чистой водой)
        const nearWaterValve = Math.hypot(player.x - waterTrough.valveX, player.y - waterTrough.valveY) < 60 ||
                               (player.x >= waterTrough.x - 45 && player.x <= waterTrough.x + waterTrough.w + 20 &&
                                player.y >= waterTrough.y - 45 && player.y <= waterTrough.y + waterTrough.h + 20);

        if (nearWaterValve && actionPressed && !player.isShoveling && !player.isDoingPedicure && player.carrying === 'none') {
          if (waterTrough.water < 100) {
            waterTrough.isRefilling = true;
            waterTrough.water = Math.min(100, waterTrough.water + waterTrough.refillRate * dt);

            // Реакция слоних на наполнение автопоилки (Этап 10)
            elephants.forEach(el => {
              if (el.thirst > 35 && el.state !== 'DRINK') {
                if (el.state === 'IDLE') {
                  if (el.id === 'audrey') el.statusText = 'Слышит плеск свежей воды в автопоилке';
                  else if (el.id === 'margo') el.statusText = 'Заинтересовалась шумом воды, поворачивается к поилке';
                  else if (el.id === 'pretty') el.statusText = 'Оживилась на звук наполняющейся поилки';
                }
                el.earAngle = Math.sin(state.worldAnimTime * 3) * 0.15;
              }
            });

            // Звук струи воды
            waterTrough.refillSoundTimer -= dt;
            if (waterTrough.refillSoundTimer <= 0) {
              sfx.playWaterFlow();
              waterTrough.refillSoundTimer = 0.22;
            }

            // Брызги воды из вентиля/трубы в поилку
            particles.push({
              x: waterTrough.valveX + 10 + Math.random() * 8,
              y: waterTrough.valveY + Math.random() * 6,
              vx: 25 + Math.random() * 30,
              vy: 10 + Math.random() * 20,
              life: 0.35,
              maxLife: 0.35,
              color: '#3498db',
              size: 2.5
            });

            if (waterTrough.water >= 100) {
              waterTrough.water = 100;
              waterTrough.isRefilling = false;
              sfx.playSuccess();
              stats.totalScore += 25;
              addLog('Автопоилка наполнена чистой свежей водой до 100% (+25 очков)!');

              // Слонихи с выраженной жаждой направляются к полной поилке
              elephants.forEach(el => {
                if (el.thirst > 40 && el.state === 'IDLE') {
                  el.state = 'WANDER';
                  el.targetX = 475 + (Math.random() - 0.5) * 40;
                  el.targetY = 535 + (Math.random() - 0.5) * 15;
                  el.stateTimer = 10;
                  el.statusText = 'Идёт к свеженаполненной поилке';
                }
              });
            }
          } else {
            waterTrough.isRefilling = false;
          }
        } else {
          waterTrough.isRefilling = false;
        }

        // Ж) Проверка ловли мочи (требуется обязательное лабораторное ведро в руках!)
        for (const el of elephants) {
          if (el.missingBucketAlertTimer > 0) el.missingBucketAlertTimer -= dt;
          if (el.isWantingPee) {
            const dist = Math.hypot(player.x - el.x, player.y - el.y);
            if (dist < el.radius + 55 && actionPressed && state.gameState === 'PLAYING') {
              if (player.carrying !== 'bucket') {
                if (el.missingBucketAlertTimer <= 0) {
                  sfx.playAlert();
                  addLog(`⚠️ Для отбора пробы у ${el.name} нужно взять чистое лабораторное ведро на стойке (возле ворот)!`);
                  el.missingBucketAlertTimer = 2.0;
                }
              } else {
                startUrineQTE(el);
                break;
              }
            }
          }
        }

        // Ж1) Ведение слона за лакомством (Этап 27): показать лакомство -> вести -> дать лакомство
        if (player.carrying === 'treat' && actionPressed && state.gameState === 'PLAYING' && !player.isShoveling && !player.isDoingPedicure && !player.isWashing) {
          if (keeperState.leadingElephantId) {
            // Слон уже ведом — даём лакомство и завершаем сопровождение
            const led = elephants.find(e => e.id === keeperState.leadingElephantId);
            if (led && Math.hypot(player.x - led.x, player.y - led.y) < led.radius + 60) {
              keeperState.leadingElephantId = null;
              player.carrying = 'none';
              stats.treatsUsed++;
              led.state = 'IDLE';
              led.stateTimer = 3.0;
              led.satiety = Math.min(100, led.satiety + 8);
              led.statusText = 'Съела лакомый банан и довольна';
              sfx.playSuccess();
              addLog(`🍌 Слониха ${led.name} съела лакомство! Сопровождение завершено.`);
            } else if (led) {
              if (player.treatDebounceTimer <= 0) {
                addLog(`Подойдите ближе к ${led.name}, чтобы дать лакомство.`);
                player.treatDebounceTimer = 1.2;
              }
            } else {
              keeperState.leadingElephantId = null;
            }
          } else {
            // Выбираем цель сопровождения — не более одного слона одновременно
            for (const el of elephants) {
              if (el.state === 'REST') continue;
              if (Math.hypot(player.x - el.x, player.y - el.y) < el.radius + 55) {
                keeperState.leadingElephantId = el.id;
                el.state = 'FOLLOW';
                el.followPause = 0;
                el.statusText = 'Идёт за кипером за лакомством';
                sfx.playSuccess();
                addLog(`🍌 ${el.name} заметила лакомство и следует за вами. Доведите её до нужного места и нажмите «Дать лакомство».`);
                break;
              }
            }
          }
        }

        // Ж2) Начало мойки в зоне мойки (Этап 27): удержание действия, пока слон в зоне
        const nearWashZone = Math.hypot(player.x - washZone.x, player.y - washZone.y) < washZone.r + 45;
        let washTarget = null;
        for (const el of elephants) {
          if (Math.hypot(el.x - washZone.x, el.y - washZone.y) < washZone.r && el.footDirt >= 25) {
            washTarget = el;
            break;
          }
        }
        if (actionHeld && nearWashZone && washTarget && state.gameState === 'PLAYING' &&
            !player.isShoveling && !player.isDoingPedicure && player.carrying === 'none' &&
            keeperState.leadingElephantId !== washTarget.id) {
          if (keeperState.washingElephant && keeperState.washingElephant !== washTarget) {
            stopWashing(false);
          }
          keeperState.washingElephant = washTarget;
        }
        if (keeperState.washingElephant) {
          const wel = keeperState.washingElephant;
          // ЭТАП 27R.2: если кипер вытолкнут коллизией за границу зоны, мойка
          // должна останавливаться немедленно — иначе состояние washingElephant
          // «висяло» бы до тех пор, пока игрок снова не оказался в зоне.
          const washBlocked = checkCollision(player.x, player.y, player.radius);
          const keeperStillHere = nearWashZone && !washBlocked;
          const elStillHere = Math.hypot(wel.x - washZone.x, wel.y - washZone.y) < washZone.r + 25;
          if (!keeperStillHere || !elStillHere || !actionHeld || wel.state === 'REST') {
            // Прерывание без зависания: кипер отошёл / животное ушло / действие отпущено
            stopWashing(true);
            if (!keeperStillHere && player.washHintDebounce <= 0) {
              addLog('🚿 Мойка остановлена: кипер вышел из зоны мойки или отпустил кнопку действия.');
              player.washHintDebounce = 2.0;
            }
          } else {
            player.isWashing = true;
            keeperState.washProgress += dt * 0.22; // ~4.5 сек непрерывной мойки
            wel.footDirt = Math.max(0, wel.footDirt - dt * 22);
            wel.bodyDirtVisual = Math.max(0, (wel.bodyDirtVisual === undefined ? 1 : wel.bodyDirtVisual) - dt * 0.22);
            wel.statusText = 'Стоит под мойкой, смывается грязь с ног';
            // Брызги воды над слоном
            if (Math.random() < 0.6) {
              particles.push({
                x: wel.x + (Math.random() - 0.5) * 60,
                y: wel.y - wel.radius * 0.9,
                vx: (Math.random() - 0.5) * 30,
                vy: 40 + Math.random() * 40,
                life: 0.5,
                maxLife: 0.5,
                color: '#68c5ff',
                size: 2.5
              });
            }
            if (Math.random() < 0.1) sfx.playWaterFlow();
            if (keeperState.washProgress >= 1) {
              wel.footDirt = 0;
              wel.feetStatus = 'Чистые после мойки';
              keeperState.washingElephant = null;
              keeperState.washProgress = 0;
              wel.state = 'IDLE';
              wel.stateTimer = 3.0;
              wel.statusText = 'Чистая и посвежевшая после мойки';
              stats.washesDone++;
              stats.totalScore += 70;
              sfx.playSuccess();
              addLog(`🚿 Мойка завершена: ${wel.name} чиста! Ноги вымыты. +70 очков.`);
              showToast(`🚿 ${wel.name} вымыта! (+70 очк.)`, '#3498db');
            }
          }
        } else {
          player.isWashing = false;
        }

        // З) Расчистка ногтей (Педикюр по зажатию Space / E)
        let targetPedicureEl = null;
        for (const el of elephants) {
          if (el.isWantingPedicure && Math.hypot(player.x - el.x, player.y - el.y) < el.radius + 55) {
            targetPedicureEl = el;
            break;
          }
        }
        if (targetPedicureEl && actionPressed && state.gameState === 'PLAYING' && !player.isShoveling && player.carrying === 'none' && targetPedicureEl.state !== 'REST') {
          player.isDoingPedicure = true;
          player.pedicureProgress += dt * 0.6; // ~1.7 сек на расчистку
          if (Math.random() < 0.25) sfx.playShovel();
          if (player.pedicureProgress >= 1) {
            targetPedicureEl.isWantingPedicure = false;
            targetPedicureEl.pedicureTimer = 65 + Math.random() * 40;
            targetPedicureEl.feetStatus = 'Отлично (расчищены)';
            targetPedicureEl.pedicureDone = true;
            const timeStr = `${String(gameTime.hour).padStart(2, '0')}:${String(Math.floor(gameTime.minute)).padStart(2, '0')}`;
            const snap = {
              time: timeStr,
              satiety: Math.round(targetPedicureEl.satiety),
              thirst: Math.round(targetPedicureEl.thirst),
              energy: Math.round(targetPedicureEl.energy)
            };
            targetPedicureEl.observations.unshift({
              time: timeStr,
              hourRecorded: gameTime.hour,
              category: 'Процедура',
              text: 'Выполнена ветеринарная расчистка стоп и подошв (педикюр)',
              keeper: 'Дежурный кипер',
              ok: true,
              snapshot: snap
            });
            targetPedicureEl.lastInspectionSnapshot = snap;
            if (targetPedicureEl.observations.length > 6) targetPedicureEl.observations.pop();
            player.isDoingPedicure = false;
            player.pedicureProgress = 0;
            stats.pedicuresDone++;
            stats.totalScore += 80;
            sfx.playSuccess();
            addLog(`💅 Проведен педикюр слонихе ${targetPedicureEl.name}! +80 очков.`);
          }
        } else {
          player.isDoingPedicure = false;
          player.pedicureProgress = 0;
        }

        // Мягкое взаимное расталкивание слоних (защита от взаимоблокировок при случайном сближении)
        for (let i = 0; i < elephants.length; i++) {
          for (let j = i + 1; j < elephants.length; j++) {
            const e1 = elephants[i];
            const e2 = elephants[j];
            const d = Math.hypot(e1.x - e2.x, e1.y - e2.y);
            const minDist = (e1.radius + e2.radius) * 0.72;
            if (d < minDist && d > 0.01) {
              const push = (minDist - d) * 0.5 * dt * 4;
              const angle = Math.atan2(e2.y - e1.y, e2.x - e1.x);
              const e1nx = e1.x - Math.cos(angle) * push;
              const e1ny = e1.y - Math.sin(angle) * push;
              const e2nx = e2.x + Math.cos(angle) * push;
              const e2ny = e2.y + Math.sin(angle) * push;
              if (e1nx > 60 && e1nx < CANVAS_WIDTH - 60 && e1ny > 240 && e1ny < 580) { e1.x = e1nx; e1.y = e1ny; }
              if (e2nx > 60 && e2nx < CANVAS_WIDTH - 60 && e2ny > 240 && e2ny < 580) { e2.x = e2nx; e2.y = e2ny; }
            }
          }
        }

        // Этап 26: после перемещения слоних корректируем положение кипера, если слон
        // вошёл в персонажа (застревание внутри модели). Управление не блокируется.
        resolveKeeperCollisions();

        // 4. Индивидуальное поведение трех слоних (FSM конечный автомат)
        elephants.forEach(el => {
          // ЭТАП 27R: естественное высыхание грязи на ногах между процедурами
          if (el.footDirt > 0 && el.state !== 'REST') {
            el.footDirt = Math.max(0, el.footDirt - dt * 0.1);
          }

          // Покачивание ушей, хобота и хвоста (привязано к state.worldAnimTime для паузы во время модалок)
          const animSpeed = el.state === 'REST' ? 1.5 : (el.state === 'DRINK' ? 2.0 : 3.0);
          el.earAngle = Math.sin(state.worldAnimTime * animSpeed + el.age) * 0.32;
          el.trunkAngle = Math.sin(state.worldAnimTime * (animSpeed * 0.7) + el.age * 2) * 0.38;
          el.tailWiggle = Math.sin(state.worldAnimTime * (animSpeed * 1.2) + el.age) * 0.45;

          // ЭТАП 27: кишечник накапливается от кормления (EAT) и со временем;
          // куча навоза появляется при полном наполнении, затем показатель сбрасывается.
          el.bowel = Math.min(100, el.bowel + 0.28 * dt);
          el.pooTimer -= dt;
          if (el.pooTimer <= 0 || el.bowel >= 100) {
            el.pooTimer = 40 + Math.random() * 35;
            el.bowel = 10;
            if (state.dungPiles.length < 8) {
              const pileX = el.x + (Math.random() - 0.5) * 50;
              const pileY = el.y + 35 + Math.random() * 20;
              const pileFinalX = Math.max(50, Math.min(CANVAS_WIDTH - 50, pileX));
              const pileFinalY = Math.max(220, Math.min(CANVAS_HEIGHT - 50, pileY));
              state.dungPiles.push({
                id: state.nextPileId++,
                x: pileFinalX,
                y: pileFinalY,
                kg: 12 + Math.floor(Math.random() * 8),
                rot: Math.random() * Math.PI
              });
              addWorldToast(pileFinalX, pileFinalY - 14, 'Куча навоза!', '💩', '#a07855', 2.8);
              addLog(`Слониха ${el.name} оставила свежую кучу навоза.`);
            }
          }

          // ЭТАП 27: физиология мочеиспускания. Мочевой пузырь накапливается со
          // временем и от питья (DRINK). Позыв возникает только при достижении
          // порога — событие не повторяется каждый кадр.
          if (!el.isWantingPee) {
            el.bladder = Math.min(100, el.bladder + el.bladderRate * dt);
            el.peeTimer -= dt;
            if (el.bladder >= 92 || el.peeTimer <= 0) {
              if (el.state === 'REST' && el.stateTimer > 4 && el.bladder < 97) {
                // Спящая слониха терпит до критического наполнения или конца сна
                el.peeTimer = 3;
              } else {
                triggerUrineEvent(el);
              }
            }
          } else {
            el.peeUrgencyTimer -= dt;
            if (el.peeUrgencyTimer <= 0) {
              el.isWantingPee = false;
              el.peeUrgencyTimer = 0; // согласованный сброс при пропущенном позыве (как при успехе в finishUrineQTE)
              el.bladder = 5;
              el.peeTimer = estimateNextPeeDelay(el);
              stats.missedPeeEvents++;
              spawnWetSpot(el, 16 + Math.floor(Math.random() * 8));
              sfx.playSplash();
              addLog(`💧 Слониха ${el.name} намочила мягкий настил. Проба упущена — участок мокрого сена требует уборки вилами!`);
            }
          }

          // Таймер педикюра (расчистки ногтей)
          if (!el.isWantingPedicure) {
            el.pedicureTimer -= dt;
            if (el.pedicureTimer <= 0 && !el.isWantingPee) {
              el.isWantingPedicure = true;
              el.pedicureUrgencyTimer = 28;
              sfx.playAlert();
              addLog(`🦶 У слонихи ${el.name} отросли ногти! Нужен педикюр.`);
            }
          } else {
            el.pedicureUrgencyTimer -= dt;
            if (el.pedicureUrgencyTimer <= 0) {
              el.isWantingPedicure = false;
              el.pedicureTimer = 55 + Math.random() * 35;
              addLog(`⚠️ Время педикюра для ${el.name} упущено.`);
            }
          }

          // Взаимосвязь физиологических показателей и последствия бездействия (Этап 10):
          // 1. Длительное отсутствие воды (жажда > 60%) снижает общий тонус и активность
          const isWaterScarce = waterTrough.water <= 15;
          const isWaterEmpty = waterTrough.water <= 0;
          const effectiveThirstRate = isWaterEmpty ? el.thirstRate * 1.85 : (isWaterScarce ? el.thirstRate * 1.45 : el.thirstRate);
          el.thirst = Math.min(100, el.thirst + effectiveThirstRate * dt * 0.22);

          if (el.thirst > 60) {
            const thirstStrain = ((el.thirst - 60) / 40) * 0.35;
            el.energy = Math.max(12, el.energy - dt * (0.16 + thirstStrain));
          }

          // 2. Дефицит корма стимулирует поиск еды и истощает силы при пустой кормушке
          const myFeeder = feeders.find(f => f.id === el.id);
          const isFeederEmpty = myFeeder && myFeeder.food <= 10;
          const effectiveHungerRate = isFeederEmpty ? el.hungerRate * 1.48 : el.hungerRate;
          el.satiety = Math.max(10, el.satiety - effectiveHungerRate * dt * 0.15);

          if (el.satiety < 35 && isFeederEmpty) {
            el.energy = Math.max(15, el.energy - dt * 0.26);
          }

          // 3. Неубранный навоз (>=4 куч) вынуждает слонов двигаться осторожно и медленнее
          const isManureHigh = state.dungPiles.length >= 4;
          const effectiveSpeed = isManureHigh ? el.speed * 0.76 : el.speed;

          // Обновление состояний конечного автомата (FSM)
          // Автономное ночное поведение слоних в фазе NIGHT:
          if (dayNightCycle.phase === 'NIGHT' && el.state !== 'FOLLOW' && keeperState.leadingElephantId !== el.id) {
            updateElephantNightRoutine(el, dt, effectiveSpeed);
          } else {
            if (el.nightRoutine && el.nightRoutine.active && dayNightCycle.phase !== 'NIGHT') {
              el.nightRoutine = null;
            }
            switch (el.state) {
            // ЭТАП 27R.2: ведение слона за лакомством. Слониха плавно идёт к точке
            // позади кипера (безопасная дистанция), используя штатную проверку
            // коллизий canElephantMoveTo — без телепортаций и прохода сквозь
            // препятствия. Если маршрут заблокирован — ждёт, не дёргаясь.
            case 'FOLLOW': {
              if (keeperState.leadingElephantId !== el.id) {
                // Цель ведения снята (отмена/рестарт) — возвращаемся к обычной жизни
                el.state = 'IDLE';
                el.stateTimer = 2.5;
                break;
              }
              const behindAngle = Math.atan2(el.y - player.y, el.x - player.x);
              const followDist = el.radius + 42;
              el.targetX = player.x + Math.cos(behindAngle) * followDist;
              el.targetY = player.y + Math.sin(behindAngle) * followDist;
              el.followPause = Math.max(0, (el.followPause || 0) - dt);

              const distToKeeper = Math.hypot(player.x - el.x, player.y - el.y);
              if (distToKeeper > followDist + 18 && el.followPause <= 0) {
                const angle = Math.atan2(el.targetY - el.y, el.targetX - el.x);
                const step = Math.min(distToKeeper, effectiveSpeed * 1.15 * dt);
                const nextX = el.x + Math.cos(angle) * step;
                const nextY = el.y + Math.sin(angle) * step;
                if (canElephantMoveTo(nextX, nextY, el.radius, el.id)) {
                  el.x = nextX;
                  el.y = nextY;
                } else if (canElephantMoveTo(nextX, el.y, el.radius, el.id)) {
                  el.x = nextX;
                } else if (canElephantMoveTo(el.x, nextY, el.radius, el.id)) {
                  el.y = nextY;
                } else {
                  el.followPause = 0.6; // маршрут перекрыт — короткая пауза вместо дёрганья
                }
                el.walkCycle += dt * (effectiveSpeed / 9);
                el.energy = Math.max(12, el.energy - el.energyDrainRate * dt * 0.7);
                el.statusText = 'Идёт за кипером за лакомством';
              } else if (distToKeeper <= followDist + 18) {
                el.statusText = 'Следует за вами в ожидании лакомства';
              }
              break;
            }

            case 'IDLE': {
              el.stateTimer -= dt;
              el.energy = Math.min(100, el.energy + el.energyRecoveryRate * dt * 0.5);

              // Интерес к киперу, если тот находится в вольере поблизости (Этап 09)
              const distToKeeper = Math.hypot(player.x - el.x, player.y - el.y);
              const keeperInsidePen = player.y > 200 && player.x > 30 && player.x < 970;

              if (keeperInsidePen && distToKeeper < 125 && distToKeeper > 45) {
                // Плавное обращение хобота в сторону кипера
                const toKeeperAngle = Math.atan2(player.y - el.y, player.x - el.x);
                el.trunkAngle = Math.sin(state.worldAnimTime * 2.5) * 0.15 + (toKeeperAngle * 0.22);

                if (player.carrying === 'hay' || player.carrying === 'mash') {
                  el.statusText = 'Тянется хоботом к корму у кипера';
                } else if (player.wheelbarrowKg > 0) {
                  el.statusText = 'Любопытно обнюхивает тачку кипера';
                } else {
                  el.statusText = 'Дружелюбно наблюдает за кипером';
                }
              } else if (isWaterEmpty && el.thirst > 60) {
                el.statusText = 'Томится от жажды (поилка пуста)';
              } else if (isFeederEmpty && el.satiety < 40) {
                el.statusText = 'Голодна, ждёт корм в кормушке';
              } else if (isManureHigh && state.dungPiles.length >= 6) {
                el.statusText = 'Осторожно обходит навоз';
              } else {
                el.statusText = 'Наблюдает за окружением';
              }
              if (el.stateTimer <= 0) {
                chooseNextElephantState(el);
              }
              break;
            }

            case 'REST': {
              el.stateTimer -= dt;
              // ЭТАП: весь пол слоновника покрыт мягким настилом — спать можно
              // в любом свободном месте. Засыпание луж опилками нейтрализует сырость настила.
              const nearWetHere = state.wetSpots.some(w => w.state !== 'absorbed' && Math.hypot(el.x - w.x, el.y - w.y) < w.r + 40);
              const cleanBeddingBonus = state.dungPiles.length <= 2 ? 1.25 : (state.dungPiles.length >= 5 ? 0.75 : 1.0);
              const softBedBonus = nearWetHere ? 0.6 : 1.1;
              el.energy = Math.min(100, el.energy + el.energyRecoveryRate * dt * cleanBeddingBonus * softBedBonus);

              if (el.stateTimer > 0) {
                if (el.id === 'pretty') {
                  el.statusText = 'Спокойный глубокий отдых на мягком настиле';
                } else if (state.dungPiles.length >= 5) {
                  el.statusText = 'Беспокойный отдых из-за загрязнения вольера';
                } else {
                  el.statusText = 'Спокойно отдыхает, восстанавливает силы';
                }
              }

              // Завершение длительного отдыха с реакцией на восстановление сил (Этап 10)
              // ЭТАП 27: очень глубокий сон при переполненном мочевом пузыре —
              // слониха не просыпается и мочится прямо на настил (мокрое сено).
              if (el.stateTimer > 0 && el.bladder >= 97 && !el.isWantingPee) {
                performSleepUrination(el);
              }

              // ЭТАП 28 FIX: раньше выход был по `el.energy >= 96` — слониха
              // просыпалась сразу после восстановления сил, не доживая до конца
              // таймера отдыха. Теперь будит только истёкший stateTimer;
              // энергия лишь ограничивает сверху (не глубже 100). Принудительные
              // пробуждения при физиологических событиях сохранены выше по коду
              // (мочеиспускание во сне обрабатывается отдельно).
              if (el.stateTimer <= 0) {
                el.state = 'IDLE';
                el.stateTimer = el.idleDurationMin;
                el.trunkAngle = 0.22;
                el.earAngle = 0.18;
                if (el.id === 'pretty') {
                  el.statusText = 'Приятно потягивается хоботом после долгого сна';
                  el.mood = 'Бодрая';
                } else if (el.id === 'audrey') {
                  el.statusText = 'Завершила отдых, расправила уши и осматривает группу';
                  el.mood = 'Спокойная';
                } else {
                  el.statusText = 'Проснулась бодрой, готова к движению';
                  el.mood = 'Игривая';
                }
                chooseNextElephantState(el);
              }
              break;
            }

            case 'WANDER': {
              const distToTarget = Math.hypot(el.x - el.targetX, el.y - el.targetY);
              const distToTrough = Math.hypot(el.x - (waterTrough.x + waterTrough.w / 2), el.y - (waterTrough.y + 10));
              const distToFeeder = myFeeder ? Math.hypot(el.x - (myFeeder.x + myFeeder.w / 2), el.y - (myFeeder.y + 65)) : 999;

              // Если цель была подойти к поилке
              if (distToTrough < 75 && el.thirst > 35) {
                if (waterTrough.water > 0) {
                  el.state = 'DRINK';
                  el.stateTimer = 4.5 + Math.random() * 3.5;
                  el.statusText = 'Пьёт воду';
                  sfx.playWaterFlow();
                  addLog(`Слониха ${el.name} подошла к поилке и пьёт чистую воду.`);
                  break;
                } else {
                  el.state = 'IDLE';
                  el.stateTimer = 3.0;
                  el.statusText = 'Поилка пуста!';
                  addLog(`Слониха ${el.name} хотела попить, но в поилке нет воды!`);
                  break;
                }
              }

              // Если цель была подойти к кормушке
              if (distToFeeder < 70 && el.satiety < 85) {
                if (myFeeder && myFeeder.food > 0) {
                  el.state = 'EAT';
                  el.stateTimer = 5.0 + Math.random() * 4.0;
                  el.statusText = 'Ест корм';
                  break;
                } else {
                  el.state = 'IDLE';
                  el.stateTimer = 3.0;
                  el.statusText = 'Кормушка пуста!';
                  break;
                }
              }

              // Прибытие к обычной целевой точке
              if (distToTarget <= 14) {
                el.state = Math.random() < el.restChance ? 'REST' : 'IDLE';
                // ЭТАП 28 FIX: при переходе в REST таймер обязан быть длительностью
                // отдыха, а не случайной idle-паузой (3..12 с) — иначе слониха
                // «просыпалась» почти сразу. fatigueBonus сохранён как в основном
                // пути выбора состояния.
                if (el.state === 'REST') {
                  const fatigueBonus = el.energy < 45 ? 6 : 0;
                  el.stateTimer = el.restDurationMin + fatigueBonus + Math.random() * (el.restDurationMax - el.restDurationMin);
                  el.statusText = 'Устроилась на мягком настиле';
                } else {
                  el.stateTimer = el.idleDurationMin + Math.random() * (el.idleDurationMax - el.idleDurationMin);
                  el.statusText = 'Осматривается';
                }
              } else {
                // ЭТАП: прохождение по луже мочи пачкает ноги, впитавшие опилки снижают загрязнение
                const wetUnder = state.wetSpots.find(w => Math.hypot(el.x - w.x, el.y - w.y) < w.r + el.radius * 0.4);
                if (wetUnder) {
                  const dirtRate = wetUnder.state === 'absorbed' ? 1.5 : 6;
                  el.footDirt = Math.min(100, el.footDirt + dt * dirtRate);
                  if (el.footDirt > 55 && el.id !== 'audrey' && wetUnder.state !== 'absorbed') el.statusText = 'Идёт по луже мочи, пачкает ноги';
                }

                // Обход свежего навоза в реальном времени: если на пути куча навоза, мягко огибаем
                const nearDung = state.dungPiles.find(p => Math.hypot(el.x - p.x, el.y - p.y) < 52);
                if (nearDung) {
                  el.statusText = 'Осторожно обходит навоз';
                  const repAngle = Math.atan2(el.y - nearDung.y, el.x - nearDung.x);
                  const repStep = 20 * dt;
                  const dodgeX = el.x + Math.cos(repAngle) * repStep;
                  const dodgeY = el.y + Math.sin(repAngle) * repStep;
                  if (canElephantMoveTo(dodgeX, dodgeY, el.radius, el.id)) {
                    el.x = dodgeX;
                    el.y = dodgeY;
                  }
                }

                // Плавный шаг к цели с учетом замедления при загрязненном вольере
                const angle = Math.atan2(el.targetY - el.y, el.targetX - el.x);
                const step = Math.min(distToTarget, effectiveSpeed * dt);
                const nextX = el.x + Math.cos(angle) * step;
                const nextY = el.y + Math.sin(angle) * step;

                if (canElephantMoveTo(nextX, nextY, el.radius, el.id)) {
                  el.x = nextX;
                  el.y = nextY;
                } else if (canElephantMoveTo(nextX, el.y, el.radius, el.id)) {
                  el.x = nextX;
                } else if (canElephantMoveTo(el.x, nextY, el.radius, el.id)) {
                  el.y = nextY;
                } else {
                  // Препятствие на пути — выбираем новую точку
                  chooseNextElephantState(el);
                }

                el.walkCycle += dt * (effectiveSpeed / 10);
                // Длительная активность повышает потребность в отдыхе
                el.energy = Math.max(12, el.energy - el.energyDrainRate * dt);
              }

              el.stateTimer -= dt;
              if (el.stateTimer <= 0) {
                chooseNextElephantState(el);
              }
              break;
            }

            case 'DRINK': {
              el.stateTimer -= dt;
              el.statusText = 'Пьёт воду';

              if (waterTrough.water > 0) {
                const drinkAmount = dt * 3.8;
                waterTrough.water = Math.max(0, waterTrough.water - drinkAmount);
                el.thirst = Math.max(0, el.thirst - drinkAmount * 2.8);
                // ЭТАП 27: питьё постепенно наполняет мочевой пузырь (без мгновенного события)
                el.bladder = Math.min(100, el.bladder + drinkAmount * 1.9);
                // Утоление жажды чистой водой восстанавливает общий тонус слонихи (Этап 10)
                el.energy = Math.min(100, el.energy + dt * 1.6);

                // Периодические брызги воды при питье
                if (Math.random() < 0.2) {
                  particles.push({
                    x: waterTrough.x + 20 + Math.random() * 45,
                    y: waterTrough.y + 15 + Math.random() * 30,
                    vx: (Math.random() - 0.5) * 10,
                    vy: -Math.random() * 15,
                    life: 0.4,
                    maxLife: 0.4,
                    color: '#68c5ff',
                    size: 2
                  });
                }

                if (waterTrough.water <= 0) {
                  el.state = 'IDLE';
                  el.stateTimer = 2.5;
                  el.statusText = 'Вода закончилась';
                  addLog(`Вода в поилке иссякла. Слониха ${el.name} прекратила пить.`);
                  break;
                }
              } else {
                el.state = 'IDLE';
                el.stateTimer = 2.0;
                break;
              }

              if (el.stateTimer <= 0 || el.thirst <= 5) {
                el.state = 'IDLE';
                el.stateTimer = el.idleDurationMin;
                el.statusText = 'Утолила жажду';
              }
              break;
            }

            case 'EAT': {
              el.stateTimer -= dt;
              el.statusText = 'Лакомится кормом';

              if (myFeeder && myFeeder.food > 0) {
                const eatAmount = dt * 4.2;
                myFeeder.food = Math.max(0, myFeeder.food - eatAmount);
                el.satiety = Math.min(100, el.satiety + eatAmount * 1.4);
                // ЭТАП 27: питание постепенно наполняет кишечник (без мгновенного события)
                el.bowel = Math.min(100, el.bowel + eatAmount * 1.5);
                // Поедание корма восстанавливает сытость и придаёт сил (Этап 10)
                const foodEnergyBonus = el.id === 'pretty' ? 1.4 : 1.1;
                el.energy = Math.min(100, el.energy + dt * 1.2 * foodEnergyBonus);

                if (Math.random() < 0.08) {
                  particles.push({
                    x: myFeeder.x + Math.random() * myFeeder.w,
                    y: myFeeder.y + Math.random() * myFeeder.h,
                    vx: (Math.random() - 0.5) * 15,
                    vy: (Math.random() - 0.5) * 15,
                    life: 0.6,
                    maxLife: 0.6,
                    color: '#e6c86e',
                    size: 2.5
                  });
                }

                if (myFeeder.food <= 0) {
                  el.state = 'IDLE';
                  el.stateTimer = 2.5;
                  el.statusText = 'Кормушка пуста';
                  addLog(`Кормушка слонихи ${el.name} опустела.`);
                  break;
                }
              } else {
                el.state = 'IDLE';
                el.stateTimer = 2.0;
                break;
              }

              if (el.stateTimer <= 0 || el.satiety >= 98) {
                el.state = 'IDLE';
                el.stateTimer = el.idleDurationMin;
                el.statusText = 'Сыта и довольна';
              }
              break;
            }
          }
        }
      });

        // Этап 26: финальная коррекция после движения слоних (FSM-шаги и расталкивание),
        // чтобы кипер никогда не оставался внутри коллайдера слона в конце кадра.
        resolveKeeperCollisions();

        // 5. Обновление частиц
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
          if (p.life <= 0) {
            particles.splice(i, 1);
          }
        }

        // 6. Обновление локализованных всплывающих уведомлений мира (worldToasts)
        if (state.worldToasts && state.worldToasts.length > 0) {
          for (let i = state.worldToasts.length - 1; i >= 0; i--) {
            const toast = state.worldToasts[i];
            toast.timer -= dt;
            toast.y += toast.vy * dt;
            if (toast.timer <= 0) {
              state.worldToasts.splice(i, 1);
            }
          }
        }
      }

export function gameLoop(timestamp) {
        if (!state.lastTime) state.lastTime = timestamp;
        let dt = (timestamp - state.lastTime) / 1000;
        state.lastTime = timestamp;

        // Защита от скачков времени при возврате на вкладку или лагах:
        // Если задержка превышает 0.1 сек (или некорректна), нормализуем до 1/60 сек
        if (dt > 0.1 || dt <= 0 || isNaN(dt)) {
          dt = 0.016667;
        }

        update(dt);
        render();

        requestAnimationFrame(gameLoop);
      }
