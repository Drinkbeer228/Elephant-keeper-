import { state, dayNightCycle, gameTime, logs, elephants, addLog, showToast } from '../gameState.js';
import { sfx } from '../sound.js';
import { shiftPhases } from '../config.js';

export function getCurrentPhase() {
        const curH = gameTime.hour + gameTime.minute / 60;
        const phase = shiftPhases.find(p => curH >= p.startHour && curH < p.endHour);
        return phase || shiftPhases[shiftPhases.length - 1];
      }

export function updateDayNightCycle(dt) {
        dayNightCycle.cycleTimer = (dayNightCycle.cycleTimer + dt) % dayNightCycle.totalSec;
        const t = dayNightCycle.cycleTimer;

        // Расчёт фазы суток:
        // 0..810с: День (13.5 мин)
        // 810..840с: Закат (30 сек, переход)
        // 840..1170с: Ночь (5.5 мин)
        // 1170..1200с: Рассвет (30 сек, переход)
        let newPhase = 'DAY';
        if (t < 810) {
          newPhase = 'DAY';
          dayNightCycle.darkness = 0.0;
          dayNightCycle.sunsetGlow = 0.0;
          dayNightCycle.sunriseGlow = 0.0;
        } else if (t < 840) {
          newPhase = 'DUSK';
          const duskFrac = (t - 810) / 30; // 0..1
          dayNightCycle.darkness = duskFrac;
          dayNightCycle.sunsetGlow = Math.sin(duskFrac * Math.PI);
          dayNightCycle.sunriseGlow = 0.0;
        } else if (t < 1170) {
          newPhase = 'NIGHT';
          dayNightCycle.darkness = 1.0;
          dayNightCycle.sunsetGlow = 0.0;
          dayNightCycle.sunriseGlow = 0.0;
        } else {
          newPhase = 'DAWN';
          const dawnFrac = (t - 1170) / 30; // 0..1
          dayNightCycle.darkness = 1.0 - dawnFrac;
          dayNightCycle.sunsetGlow = 0.0;
          dayNightCycle.sunriseGlow = Math.sin(dawnFrac * Math.PI);
        }

        // Информирование кипера о смене фаз суток
        if (newPhase !== dayNightCycle.lastPhase) {
          if (newPhase === 'DUSK') {
            showToast('🌅 Закат в зоопарке. Сумерки окутывают слоновник.', '#e67e22');
            addLog('🌅 Наступает закат. Павильон слоновника погружается в вечерние сумерки.');
          } else if (newPhase === 'NIGHT') {
            showToast('🌙 Наступила ночь. Слонихи переходят на ночной распорядок отдыха и кормления.', '#3498db');
            addLog('🌙 Ночь в слоновнике. Слонихи автономно чередуют сон и ночные перекусы.');
          } else if (newPhase === 'DAWN') {
            showToast('🌄 Рассвет. Небо светлеет, слоновник просыпается к утренней смене.', '#f39c12');
            addLog('🌄 Первые лучи восхода освещают вольер. Приближается утренний обход.');
            // Пробуждение слоних ото сна на рассвете к утренней смене
            elephants.forEach(el => {
              if (el.nightRoutine) {
                el.nightRoutine = null;
                if (el.state === 'REST') {
                  el.state = 'IDLE';
                  el.stateTimer = 3.5;
                  el.statusText = 'Просыпается к утренней смене';
                }
              }
            });
          } else if (newPhase === 'DAY') {
            showToast('☀️ Наступил день! Начинается новый суточный цикл.', '#2ecc71');
            addLog('☀️ Утро в зоопарке. Вольер залит естественным дневным светом.');
            dayNightCycle.fullDaysCount++;
          }
          dayNightCycle.lastPhase = newPhase;
        }
        dayNightCycle.phase = newPhase;

        // Синхронизация игрового времени (24 игровых часа за 1200 сек, старт с 08:00 утра)
        const cycleFrac = t / dayNightCycle.totalSec;
        const totalGameMin = (8 * 60 + cycleFrac * 1440) % 1440;
        const oldHour = gameTime.hour;
        gameTime.hour = Math.floor(totalGameMin / 60);
        gameTime.minute = Math.floor(totalGameMin % 60);
        gameTime.secondAccum = (totalGameMin % 1) * 60;

        // Ежечасный рев слонов в дневное время
        if (gameTime.hour !== oldHour && (gameTime.hour >= 8 && gameTime.hour <= 20)) {
          sfx.playElephantTrumpet();
          addLog(`Часы слоновника: ${String(gameTime.hour).padStart(2, '0')}:00.`);
        }
      }
