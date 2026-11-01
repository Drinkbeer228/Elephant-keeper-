import { state, elephants, waterTrough, stats, player, wheelbarrow, situationalEvents, gameTime, addLog, showToast } from '../gameState.js';
import { sfx } from '../sound.js';
import { shiftPhases } from '../config.js';

export const shiftTasks = [
        // 08:00 - 09:00: Утренний осмотр и подготовка
        {
          id: 'inspect_audrey_morn',
          phaseId: 'morning_prep',
          priority: 'scheduled',
          timeRange: '08:00–09:00',
          title: 'Осмотр матриарха Одри',
          desc: 'Подойти к Одри и провести осмотр [F]',
          startHour: 8.0,
          endHour: 9.0,
          strict: true,
          points: 40,
          status: 'available',
          check: () => elephants.find(e => e.id === 'audrey').lastInspected !== 'Не проводился'
        },
        {
          id: 'inspect_margo_morn',
          phaseId: 'morning_prep',
          priority: 'scheduled',
          timeRange: '08:00–09:00',
          title: 'Осмотр слонихи Марго',
          desc: 'Подойти к Марго и провести осмотр [F]',
          startHour: 8.0,
          endHour: 9.0,
          strict: true,
          points: 40,
          status: 'available',
          check: () => elephants.find(e => e.id === 'margo').lastInspected !== 'Не проводился'
        },
        {
          id: 'inspect_pretty_morn',
          phaseId: 'morning_prep',
          priority: 'scheduled',
          timeRange: '08:00–09:00',
          title: 'Осмотр непоседы Претти',
          desc: 'Подойти к Претти и провести осмотр [F]',
          startHour: 8.0,
          endHour: 9.0,
          strict: true,
          points: 40,
          status: 'available',
          check: () => elephants.find(e => e.id === 'pretty').lastInspected !== 'Не проводился'
        },
        {
          id: 'water_morn',
          phaseId: 'morning_prep',
          priority: 'urgent',
          timeRange: '08:00–09:30',
          title: 'Проверить воду в поилке',
          desc: 'Наполнить автопоилку вентилем не менее 75%',
          startHour: 8.0,
          endHour: 9.5,
          strict: true,
          points: 30,
          status: 'available',
          check: () => waterTrough.water >= 75
        },

        // 09:00 - 11:00: Утренний уход и кормление
        {
          id: 'feed_morning',
          phaseId: 'morning_care',
          priority: 'urgent',
          timeRange: '09:00–11:00',
          title: 'Утренняя раздача корма',
          desc: 'Принести сено и кашу в кормушки (хотя бы 2 порции)',
          startHour: 9.0,
          endHour: 11.0,
          strict: true,
          points: 50,
          status: 'pending',
          check: () => stats.foodDelivered >= 2
        },
        {
          id: 'clean_dung_morning',
          phaseId: 'morning_care',
          priority: 'scheduled',
          timeRange: '09:00–11:00',
          title: 'Уборка ночного навоза',
          desc: 'Собрать навоз лопатой в тачку (остаток <= 1 кучи)',
          startHour: 9.0,
          endHour: 11.0,
          strict: true,
          points: 50,
          status: 'pending',
          check: () => state.dungPiles.length <= 1 && stats.manureCleanedKg >= 15
        },
        {
          id: 'water_morning',
          phaseId: 'morning_care',
          priority: 'urgent',
          timeRange: '09:00–11:00',
          title: 'Контроль чистоты и воды',
          desc: 'Наполнить автопоилку до 85%+',
          startHour: 9.0,
          endHour: 11.0,
          strict: true,
          points: 35,
          status: 'pending',
          check: () => waterTrough.water >= 85
        },

        // 11:00 - 13:00: Дневная активность и санитария
        {
          id: 'urine_sample_noon',
          phaseId: 'day_prep',
          priority: 'secondary',
          timeRange: '11:00–13:30',
          title: 'Сбор анализа мочи в ведро',
          desc: 'Взять ведро на стойке и поймать пробу слонихи [QTE]',
          startHour: 11.0,
          endHour: 13.5,
          strict: true,
          points: 60,
          status: 'pending',
          check: () => stats.urineSamplesCollected >= 1
        },
        {
          id: 'dumpster_clear',
          phaseId: 'day_prep',
          priority: 'secondary',
          timeRange: '11:00–13:00',
          title: 'Вывоз навоза в контейнер',
          desc: 'Разгрузить тачку кипера у зеленого бака утиля или вывезти мусоровозом',
          startHour: 11.0,
          endHour: 13.0,
          strict: true,
          points: 40,
          status: 'pending',
          check: () => stats.dumpsterPickupsCompleted >= 1 || (stats.manureCleanedKg >= 25 && wheelbarrow.kg === 0)
        },
        {
          id: 'vet_routine_visit',
          phaseId: 'day_prep',
          priority: 'urgent',
          timeRange: '10:00–12:30',
          title: 'Плановый ветеринарный визит',
          desc: 'Ассистировать ветврачу при осмотре Одри, Марго и Претти',
          startHour: 10.0,
          endHour: 12.5,
          strict: true,
          points: 75,
          status: 'pending',
          check: () => stats.vetVisitsCompleted >= 1 || stats.vetProceduresDone >= 3
        },

        // 13:00 - 16:00: Дневное дежурство и процедуры
        {
          id: 'pedicure_duty',
          phaseId: 'day_shift',
          priority: 'scheduled',
          timeRange: '13:00–16:00',
          title: 'Процедура расчистки стоп',
          desc: 'Выполнить педикюр слонихе с отросшими ногтями',
          startHour: 13.0,
          endHour: 16.0,
          strict: true,
          points: 60,
          status: 'pending',
          check: () => stats.pedicuresDone >= 1
        },
        {
          id: 'day_inspection',
          phaseId: 'day_shift',
          priority: 'scheduled',
          timeRange: '13:00–16:00',
          title: 'Дневной контрольный осмотр',
          desc: 'Провести ветеринарные осмотры подопечных (всего >= 4)',
          startHour: 13.0,
          endHour: 16.0,
          strict: true,
          points: 45,
          status: 'pending',
          check: () => stats.inspectionsDone >= 4
        },
        {
          id: 'day_water',
          phaseId: 'day_shift',
          priority: 'urgent',
          timeRange: '13:00–16:00',
          title: 'Дневное пополнение поилки',
          desc: 'Открыть вентиль и наполнить поилку до 85%+',
          startHour: 13.0,
          endHour: 16.0,
          strict: true,
          points: 35,
          status: 'pending',
          check: () => waterTrough.water >= 85
        },

        // 16:00 - 18:00: Вечерний уход и кормление
        {
          id: 'evening_feed',
          phaseId: 'evening_care',
          priority: 'urgent',
          timeRange: '16:00–18:00',
          title: 'Вечерняя раздача фуража',
          desc: 'Доставить ещё порции сена и каши в кормушки (всего >= 4)',
          startHour: 16.0,
          endHour: 18.0,
          strict: true,
          points: 50,
          status: 'pending',
          check: () => stats.foodDelivered >= 4
        },
        {
          id: 'evening_dung',
          phaseId: 'evening_care',
          priority: 'scheduled',
          timeRange: '16:00–18:00',
          title: 'Вечерняя уборка навоза',
          desc: 'Очистить загон перед сдачей смены (остаток <= 1 кучи)',
          startHour: 16.0,
          endHour: 18.0,
          strict: true,
          points: 50,
          status: 'pending',
          check: () => state.dungPiles.length <= 1 && stats.manureCleanedKg >= 40
        },

        // 18:00 - 20:00: Завершение смены и сдача поста
        {
          id: 'final_inspection',
          phaseId: 'shift_end',
          priority: 'scheduled',
          timeRange: '18:00–20:00',
          title: 'Итоговый вечерний обход',
          desc: 'Провести контрольные осмотры подопечных слоних (всего >= 6)',
          startHour: 18.0,
          endHour: 20.0,
          strict: true,
          points: 50,
          status: 'pending',
          check: () => stats.inspectionsDone >= 6
        },
        {
          id: 'clean_handover',
          phaseId: 'shift_end',
          priority: 'secondary',
          timeRange: '18:00–20:00',
          title: 'Сдать чистый вольер и поилку',
          desc: 'На полу <= 1 кучи навоза, пустая тачка и вода в поилке >= 80%',
          startHour: 18.0,
          endHour: 20.0,
          strict: true,
          points: 55,
          status: 'pending',
          check: () => state.dungPiles.length <= 1 && wheelbarrow.kg === 0 && waterTrough.water >= 80
        }
      ];

export function getCurrentActiveTask() {
        const curH = gameTime.hour + gameTime.minute / 60;
        // 1. Срочная доступная задача
        const urgentAvail = shiftTasks.find(t => t.status === 'available' && t.priority === 'urgent' && curH >= t.startHour);
        if (urgentAvail) return urgentAvail;
        // 2. Просроченная задача, требующая скорейшего восстановления
        const missedToRecover = shiftTasks.find(t => t.status === 'missed');
        if (missedToRecover) return missedToRecover;
        // 3. Доступная задача текущей фазы
        const currentPhaseTasks = shiftTasks.filter(t => t.status === 'available' && curH >= t.startHour && curH < t.endHour);
        if (currentPhaseTasks.length > 0) return currentPhaseTasks[0];
        // 4. Любая доступная активная задача
        const anyAvail = shiftTasks.find(t => t.status === 'available');
        if (anyAvail) return anyAvail;
        // 5. Следующая ожидающая задача
        const nextPending = shiftTasks.find(t => t.status === 'pending');
        if (nextPending) return nextPending;
        return null;
      }

export function getTaskTimeRemaining(task) {
        const curH = gameTime.hour + gameTime.minute / 60;
        if (task.status === 'completed') {
          return { text: 'вовремя', color: '#2ecc71', state: 'done' };
        }
        if (task.status === 'recovered') {
          return { text: 'исправлено', color: '#27ae60', state: 'recovered' };
        }
        if (task.status === 'missed') {
          return { text: 'исправить!', color: '#e67e22', state: 'missed' };
        }
        if (curH < task.startHour) {
          const minsToStart = Math.round((task.startHour - curH) * 60);
          const hrs = Math.floor(minsToStart / 60);
          const mins = minsToStart % 60;
          const str = hrs > 0 ? `${hrs}ч ${mins}м` : `${mins}м`;
          return { text: `через ${str}`, color: '#7f8c8d', state: 'pending' };
        }
        // Задача активна
        const minsLeft = Math.max(0, Math.round((task.endHour - curH) * 60));
        const hrs = Math.floor(minsLeft / 60);
        const mins = minsLeft % 60;
        const str = hrs > 0 ? `${hrs}ч ${mins}м` : `${mins}м`;

        if (minsLeft <= 15) {
          return { text: `срок: ${str}!`, color: '#e74c3c', state: 'urgent' };
        } else if (minsLeft <= 35) {
          return { text: `ост. ${str}`, color: '#f39c12', state: 'warning' };
        }
        return { text: `ост. ${str}`, color: '#83959b', state: 'normal' };
      }

export function isTaskBlockedByEvent(task) {
        if (!state.activeSituationalEvent || state.activeSituationalEvent.status !== 'active') return false;
        // Поломка/критический уровень поилки блокирует плановое пополнение водой
        if (state.activeSituationalEvent.type === 'trough_low_thirst' && (task.id === 'water_morn' || task.id === 'water_morning' || task.id === 'day_water')) {
          return true;
        }
        // Засохшая кормушка или рассыпанный фураж блокирует кормление
        if ((state.activeSituationalEvent.type === 'feeder_crust' || state.activeSituationalEvent.type === 'scattered_hay') && (task.id === 'feed_morning' || task.id === 'evening_feed')) {
          return true;
        }
        // Смещенный инвентарь или скопление навоза блокирует плановую уборку
        if ((state.activeSituationalEvent.type === 'sanitation_cluster' || state.activeSituationalEvent.type === 'tool_misplaced') && (task.id === 'clean_dung_morning' || task.id === 'evening_dung')) {
          return true;
        }
        // Внеплановые клинические проверки блокируют дежурные осмотры
        if (state.activeSituationalEvent.type === 'vet_followup_check' && (task.id === 'day_inspection' || task.id === 'final_inspection')) {
          return true;
        }
        return false;
      }

export function updateShiftTasks() {
        const curH = gameTime.hour + gameTime.minute / 60;

        for (const task of shiftTasks) {
          if (task.status === 'completed' || task.status === 'recovered') continue;

          // 1. Активация задачи по наступлению времени
          if (task.status === 'pending') {
            if (curH >= task.startHour) {
              task.status = 'available';
            }
          }

          // 2. Проверка выполнения фактическими действиями игрока (в срок)
          if (task.status === 'available') {
            if (task.check()) {
              task.status = 'completed';
              stats.tasksCompleted++;
              stats.tasksCompletedOnTime++;
              stats.totalScore += task.points;
              sfx.playSuccess();
              const tag = task.priority === 'urgent' ? '🔥 СРОЧНАЯ' : (task.priority === 'scheduled' ? '⏳ ПЛАНОВАЯ' : '⭐ ДОПОЛНИТЕЛЬНАЯ');
              showToast(`✅ [${tag}] «${task.title}» выполнена вовремя! (+${task.points} очк.)`, '#2ecc71');
              addLog(`Выполнена регламентная задача [${tag}]: «${task.title}» вовремя. +${task.points} очков.`);
              continue;
            }
          }

          // 3. Проверка наступления дедлайна (срыв планового срока)
          if (task.status === 'available' && curH >= task.endHour && task.strict) {
            // Защита от штрафа, если задача заблокирована оперативным событием
            if (isTaskBlockedByEvent(task)) {
              continue; // Не штрафуем, пока активно блокирующее событие
            }
            task.status = 'missed';
            stats.tasksMissed++;
            sfx.playAlert();
            const tag = task.priority === 'urgent' ? '🔥 СРОЧНОЙ' : (task.priority === 'scheduled' ? 'плановой' : 'дополнительной');
            addLog(`⚠️ Пропущен регламентный срок ${tag} задачи: «${task.title}». Требуется ликвидация последствий!`);
            showToast(`⚠️ Пропущен срок: «${task.title}». Задача требует скорейшего исправления!`, '#e67e22');
            continue;
          }

          // 4. МЕХАНИКА ВОССТАНОВЛЕНИЯ (RECOVERY & REDEMPTION):
          // Опоздание не блокирует исправление ситуации. Кипер может ликвидировать последствия!
          if (task.status === 'missed') {
            if (task.check()) {
              task.status = 'recovered';
              stats.tasksRecovered++;
              const recoveryPoints = Math.round(task.points * 0.65);
              stats.totalScore += recoveryPoints;
              sfx.playSuccess();
              showToast(`✓ Ликвидация задержки: «${task.title}» (+${recoveryPoints} очк.)`, '#27ae60');
              addLog(`[Восстановление] Кипер исправил упущение: «${task.title}». Последствия устранены! (+${recoveryPoints} очков).`);

              // Положительный отклик у подопечных слоних
              elephants.forEach(el => {
                el.energy = Math.min(100, el.energy + 8);
                if (el.mood !== 'Спокойная' && Math.random() < 0.6) {
                  el.mood = 'Спокойная';
                }
              });
            }
          }
        }
      }
