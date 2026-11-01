import { state, vetSchedule, vetNPC, stats, player, elephants, gameTime, virtualKeys, keys, particles, addWorldToast, addLog, showToast } from '../gameState.js';
import { ctx } from '../canvas.js';
import { sfx } from '../sound.js';
import { canElephantMoveTo } from '../world.js';

export function updateVetVisit(dt) {
        const curH = gameTime.hour + gameTime.minute / 60;

        // 1. Предварительное оповещение о визите в 10:00
        if (curH >= vetSchedule.notifyHour && !vetSchedule.notified) {
          vetSchedule.notified = true;
          sfx.playAlert();
          showToast('🩺 Внимание: в 10:30 запланирован визит главного ветеринарного врача!', '#3498db');
          addLog('🩺 [График смены] В 10:30 ожидается визит главного ветеринарного врача зоопарка для планового осмотра Одри, Марго и Претти.');
        }

        // 2. Прибытие ветеринара в 10:30
        if (curH >= vetSchedule.arrivalHour && !vetNPC.active && !vetSchedule.completed) {
          vetNPC.active = true;
          vetNPC.state = 'WALKING_IN';
          vetNPC.x = 650;
          vetNPC.y = 35;
          vetNPC.currentElephantIndex = 0;
          vetNPC.currentElephant = elephants[0];
          vetNPC.examProgress = 0;
          sfx.playSuccess();
          showToast('🩺 Главный ветврач прибыл в слоновник для осмотра!', '#2ecc71');
          addLog('🩺 Главный ветеринарный врач зоопарка зашёл в павильон: «Здравствуйте! Начинаем плановый осмотр подопечных слоних.»');
        }

        if (!vetNPC.active) return;

        vetNPC.walkCycle += dt * 6;

        switch (vetNPC.state) {
          case 'WALKING_IN': {
            // Врач идёт от служебного входа (650, 35) через проход (650, 195) в вольер
            vetNPC.dir = 'down';
            vetNPC.y += vetNPC.speed * dt;
            if (vetNPC.y >= 195) {
              vetNPC.y = 195;
              vetNPC.state = 'WALKING_TO_ELEPHANT';
              vetNPC.currentElephant = elephants[vetNPC.currentElephantIndex];
              addLog(`🩺 Ветврач направился к слонихе ${vetNPC.currentElephant.name} для осмотра.`);
            }
            break;
          }

          case 'WALKING_TO_ELEPHANT': {
            const el = vetNPC.currentElephant;
            if (!el) {
              vetNPC.state = 'CONCLUDING';
              break;
            }
            // Целевая позиция — рядом со слонихой
            const tx = el.x > 500 ? el.x - 48 : el.x + 48;
            const ty = el.y + 8;
            const dist = Math.hypot(tx - vetNPC.x, ty - vetNPC.y);

            if (dist <= 8) {
              vetNPC.x = tx;
              vetNPC.y = ty;
              vetNPC.state = 'EXAMINING';
              vetNPC.examProgress = 0;
              vetNPC.examPhase = 'VISUAL';
              addLog(`🩺 Ветврач подошёл к слонихе ${el.name} и приступил к осмотру. Кипер может подойти и помочь [удерживайте Space].`);
            } else {
              const angle = Math.atan2(ty - vetNPC.y, tx - vetNPC.x);
              vetNPC.x += Math.cos(angle) * vetNPC.speed * dt;
              vetNPC.y += Math.sin(angle) * vetNPC.speed * dt;
              if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) {
                vetNPC.dir = Math.cos(angle) > 0 ? 'right' : 'left';
              } else {
                vetNPC.dir = Math.sin(angle) > 0 ? 'down' : 'up';
              }
            }
            break;
          }

          case 'EXAMINING': {
            const el = vetNPC.currentElephant;
            if (!el) break;

            // Во время осмотра слониха проявляет доверие и стоит спокойно
            if (el.state === 'WANDER') {
              el.state = 'IDLE';
              el.statusText = 'Проходит ветеринарный осмотр';
            }

            // Проверка помощи кипера: нахождение рядом (<68px) и зажатие кнопки действия Space / виртуальной кнопки
            const distKeeper = Math.hypot(player.x - el.x, player.y - el.y);
            const isAssisting = distKeeper < 70 && (keys['Space'] || keys['KeyE'] || virtualKeys.action);
            vetNPC.keeperAssisting = isAssisting;

            // Скорость осмотра: без кипера ~4.5 сек, с помощью кипера ~2.5 сек (+бонус)
            const examRate = isAssisting ? 38 : 22;
            vetNPC.examProgress += examRate * dt;

            // Определение фазы осмотра
            if (vetNPC.examProgress < 25) {
              vetNPC.examPhase = 'VISUAL';
            } else if (vetNPC.examProgress < 55) {
              vetNPC.examPhase = 'FEET';
            } else if (vetNPC.examProgress < 80) {
              vetNPC.examPhase = 'URINE';
            } else {
              vetNPC.examPhase = 'VERDICT';
            }

            // Искорки/частицы при помощи кипера
            if (isAssisting && Math.random() < 0.22) {
              particles.push({
                x: vetNPC.x + (Math.random() - 0.5) * 20,
                y: vetNPC.y - 10 + (Math.random() - 0.5) * 15,
                vx: (Math.random() - 0.5) * 8,
                vy: -12 - Math.random() * 8,
                life: 0.4,
                maxLife: 0.4,
                color: '#3498db',
                size: 2
              });
            }

            // Осмотр слонихи завершён
            if (vetNPC.examProgress >= 100) {
              vetNPC.examProgress = 100;
              const timeStr = `${String(gameTime.hour).padStart(2, '0')}:${String(Math.floor(gameTime.minute)).padStart(2, '0')}`;
              const bonusScore = isAssisting ? 50 : 30;
              stats.totalScore += bonusScore;
              stats.vetProceduresDone = (stats.vetProceduresDone || 0) + 1;
              sfx.playSuccess();

              // Клинические выводы врача
              const feetOk = el.pedicureDone || !el.isWantingPedicure;
              const hungerOk = el.satiety >= 40;
              const thirstOk = el.thirst <= 60;
              const conclusion = (feetOk && hungerOk && thirstOk) 
                ? 'Клинически здорова, кондиция отличная' 
                : (!feetOk ? 'Требуется расчистка ногтей' : 'Повышенная жажда/голод');

              vetNPC.elephantResults[el.id] = {
                ok: feetOk && hungerOk && thirstOk,
                conclusion,
                time: timeStr
              };

              el.observations.unshift({
                time: timeStr,
                hourRecorded: gameTime.hour,
                category: 'Ветосмотр',
                text: `Плановый осмотр ветврачом: ${conclusion} (Тонус ${Math.round(el.energy)}%)`,
                keeper: 'Главный ветврач',
                ok: feetOk && hungerOk && thirstOk,
                snapshot: {
                  time: timeStr,
                  satiety: Math.round(el.satiety),
                  thirst: Math.round(el.thirst),
                  energy: Math.round(el.energy)
                }
              });
              if (el.observations.length > 6) el.observations.pop();
              el.lastInspected = timeStr;

              addLog(`🩺 [Осмотр ${el.name}] Заключение: ${conclusion}. (+${bonusScore} очков).`);
              addWorldToast(el.x, el.y - el.radius - 20, `${el.name}: осмотр завершён`, '📋', '#2ecc71', 3.0);

              // Переход к следующей слонихе
              vetNPC.currentElephantIndex++;
              if (vetNPC.currentElephantIndex < elephants.length) {
                vetNPC.currentElephant = elephants[vetNPC.currentElephantIndex];
                vetNPC.state = 'WALKING_TO_ELEPHANT';
                vetNPC.examProgress = 0;
                addLog(`🩺 Ветврач переходит к следующей подопечной (${vetNPC.currentElephant.name}).`);
              } else {
                // Все три слонихи осмотрены!
                vetNPC.state = 'CONCLUDING';
                vetNPC.pauseTimer = 3.0;
                stats.vetVisitsCompleted = (stats.vetVisitsCompleted || 0) + 1;
                stats.totalScore += 100;
                vetSchedule.completed = true;
                sfx.playSuccess();
                addLog('🩺 Главный ветврач: «Плановый осмотр всех трёх слоних завершён! Одри, Марго и Претти осмотрены и внесены в картотеку.» (+100 очков)');
                showToast('🩺 Осмотр всех слоних завершён! (+100 очк.)', '#2ecc71');
              }
            }
            break;
          }

          case 'CONCLUDING': {
            vetNPC.pauseTimer -= dt;
            if (vetNPC.pauseTimer <= 0) {
              vetNPC.state = 'WALKING_OUT';
              addLog('🩺 Главный ветврач направляется к выходу из слоновника. «Спасибо за содействие, кипер!»');
            }
            break;
          }

          case 'WALKING_OUT': {
            // Врач идёт сначала к воротам (650, 195), затем наверх к выходу (650, 30)
            if (vetNPC.y > 195) {
              const angle = Math.atan2(195 - vetNPC.y, 650 - vetNPC.x);
              vetNPC.x += Math.cos(angle) * vetNPC.speed * dt;
              vetNPC.y += Math.sin(angle) * vetNPC.speed * dt;
              vetNPC.dir = 'up';
              if (Math.hypot(650 - vetNPC.x, 195 - vetNPC.y) <= 8) {
                vetNPC.x = 650;
                vetNPC.y = 195;
              }
            } else {
              vetNPC.y -= vetNPC.speed * dt;
              vetNPC.dir = 'up';
              if (vetNPC.y <= 30) {
                vetNPC.active = false;
                vetNPC.state = 'LEFT';
                addLog('🩺 Главный ветеринарный врач покинул территорию павильона.');
              }
            }
            break;
          }
        }
      }

export function renderVetNPC() {
        if (!vetNPC.active) return;

        ctx.save();
        ctx.translate(vetNPC.x, vetNPC.y);

        // 1. Тень под ногами
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.ellipse(0, 15, 11, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Ноги в медицинских брюках (синий цвет)
        const legStep = Math.sin(vetNPC.walkCycle) * 3;
        ctx.fillStyle = '#2471a3';
        ctx.fillRect(-7, 4 + legStep, 5, 11);
        ctx.fillRect(2, 4 - legStep, 5, 11);

        // Обувь (темные ботинки)
        ctx.fillStyle = '#1c2833';
        ctx.fillRect(-8, 14 + legStep, 6, 3);
        ctx.fillRect(1, 14 - legStep, 6, 3);

        // 3. Белый медицинский халат врача
        ctx.fillStyle = '#f8f9f9';
        ctx.fillRect(-9, -12, 18, 18);
        ctx.strokeStyle = '#bdc3c7';
        ctx.lineWidth = 1;
        ctx.strokeRect(-9, -12, 18, 18);

        // Красный медицинский крест на груди
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(-6, -8, 5, 2);
        ctx.fillRect(-4.5, -9.5, 2, 5);

        // Стетоскоп на шее (темно-серый)
        ctx.strokeStyle = '#566573';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, -10, 4, 0.2, Math.PI - 0.2);
        ctx.stroke();

        // Планшет для записей в руках
        ctx.fillStyle = '#d4ac0d';
        ctx.fillRect(5, -6, 6, 8);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(6, -5, 4, 6);

        // 4. Голова и лицо
        ctx.fillStyle = '#f5cba7';
        ctx.beginPath();
        ctx.arc(0, -17, 6, 0, Math.PI * 2);
        ctx.fill();

        // Волосы и медицинская шапочка
        ctx.fillStyle = '#2980b9';
        ctx.beginPath();
        ctx.arc(0, -19, 6.2, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-6, -20, 12, 3);

        // Глаза врача (в зависимости от направления)
        ctx.fillStyle = '#2c3e50';
        if (vetNPC.dir === 'left') {
          ctx.fillRect(-4, -18, 1.5, 2);
        } else if (vetNPC.dir === 'right') {
          ctx.fillRect(2, -18, 1.5, 2);
        } else {
          ctx.fillRect(-3, -18, 1.5, 2);
          ctx.fillRect(1, -18, 1.5, 2);
        }

        // 5. Контекстный интерфейс над ветеринаром
        if (vetNPC.state === 'EXAMINING') {
          const el = vetNPC.currentElephant;
          const elName = el ? el.name : '';
          const p = Math.round(vetNPC.examProgress);

          ctx.fillStyle = 'rgba(15, 22, 30, 0.90)';
          ctx.fillRect(-75, -58, 150, 32);
          ctx.strokeStyle = vetNPC.keeperAssisting ? '#f1c40f' : '#3498db';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(-75, -58, 150, 32);

          ctx.fillStyle = vetNPC.keeperAssisting ? '#f1c40f' : '#ffffff';
          ctx.font = 'bold 9.5px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`🩺 ОСМОТР: ${elName.toUpperCase()} · ${p}%`, 0, -47);

          // Название текущей фазы осмотра
          ctx.font = '8px monospace';
          ctx.fillStyle = '#9fd8a0';
          const phaseLabel = vetNPC.examPhase === 'VISUAL' ? '1. Тонус и дыхание' :
                            (vetNPC.examPhase === 'FEET' ? '2. Осмотр стоп и ногтей' :
                            (vetNPC.examPhase === 'URINE' ? '3. Контроль мочи' : '4. Итоговое заключение'));
          ctx.fillText(phaseLabel, 0, -37);

          // Шкала прогресса осмотра
          ctx.fillStyle = '#141414';
          ctx.fillRect(-68, -32, 136, 3);
          ctx.fillStyle = vetNPC.keeperAssisting ? '#f1c40f' : '#2ecc71';
          ctx.fillRect(-68, -32, 136 * (vetNPC.examProgress / 100), 3);

          // Подсказка киперу о помощи
          const distKeeper = Math.hypot(player.x - el.x, player.y - el.y);
          if (distKeeper < 70) {
            ctx.fillStyle = vetNPC.keeperAssisting ? '#f1c40f' : '#85c1e9';
            ctx.font = 'bold 8.5px monospace';
            ctx.fillText(vetNPC.keeperAssisting ? '⚡ КИПЕР АССИСТИРУЕТ (+СКОРОСТЬ)' : 'УДЕРЖИВАЙТЕ [SPACE] ДЛЯ ПОМОЩИ', 0, -22);
          }
        } else if (vetNPC.state === 'WALKING_TO_ELEPHANT') {
          const el = vetNPC.currentElephant;
          ctx.fillStyle = 'rgba(15, 22, 30, 0.85)';
          ctx.fillRect(-60, -44, 120, 18);
          ctx.strokeStyle = '#3498db';
          ctx.lineWidth = 1;
          ctx.strokeRect(-60, -44, 120, 18);
          ctx.fillStyle = '#85c1e9';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`🩺 ВРАЧ ИДЁТ К ${el ? el.name.toUpperCase() : ''}`, 0, -32);
        } else if (vetNPC.state === 'CONCLUDING') {
          ctx.fillStyle = 'rgba(20, 40, 20, 0.90)';
          ctx.fillRect(-65, -44, 130, 18);
          ctx.strokeStyle = '#2ecc71';
          ctx.lineWidth = 1;
          ctx.strokeRect(-65, -44, 130, 18);
          ctx.fillStyle = '#2ecc71';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🩺 ОСМОТР 3/3 СЛОНИХ ЗАВЕРШЁН ✓', 0, -32);
        }

        ctx.textAlign = 'left';
        ctx.restore();
      }
