import { state, qteState, stats, player, elephants, gameTime, addLog, showToast } from '../gameState.js';
import { sfx } from '../sound.js';
import { spawnWetSpot, clearUrineQtEResultTimeout, estimateNextPeeDelay } from './physiology.js';

export function triggerUrineEvent(elephant) {
        elephant.isWantingPee = true;
        // ЭТАП 27: окно реакции зависит от наполнения мочевого пузыря (60..22 сек):
        // чем сильнее позыв, тем меньше времени на подготовку ведра.
        const fillFrac = Math.max(0, Math.min(1, (elephant.bladder - 55) / 45));
        elephant.peeUrgencyTimer = Math.round(60 - 38 * fillFrac);
        sfx.playAlert();
        addLog(`⚠️ Внимание! ${elephant.name} хочет в туалет! Подбегите с ведром для анализа!`);
      }

export function startUrineQTE(elephant) {
        state.gameState = 'QTE_URINE';
        qteState.active = true;
        qteState.elephant = elephant;
        qteState.sliderPos = 10;
        qteState.sliderDir = 1;
        qteState.result = null;
        clearUrineQtEResultTimeout(); // на случай повторного запуска — старый отложенный таймер не нужен
        qteState.endTimer = 0; // экран результата ещё не показывается
        qteState.returnState = 'PLAYING'; // QTE запускается только из режима игры
        sfx.playAlert();
      }

export function closeUrineQTE() {
        clearUrineQtEResultTimeout(); // экран результата закрывается — отложенный таймер больше не нужен
        const targetState = ['PAUSED', 'SHIFT_TABLET', 'INSPECTION_MODAL', 'TITLE', 'SHIFT_REPORT'].includes(qteState.returnState)
          ? qteState.returnState
          : 'PLAYING';
        qteState.active = false;
        qteState.result = null;
        qteState.elephant = null;
        qteState.endTimer = 0;
        qteState.returnState = 'PLAYING';
        if (state.gameState === 'QTE_URINE') state.gameState = targetState;
      }

export function finishUrineQTE() {
        if (!qteState.active || qteState.result !== null) return;
        const pos = qteState.sliderPos;
        const isPerfect = pos >= qteState.targetMin + 5 && pos <= qteState.targetMax - 5;
        const isGood = pos >= qteState.targetMin && pos <= qteState.targetMax;

        if (isPerfect) {
          qteState.result = 'perfect';
          stats.urineSamplesCollected++;
          stats.totalScore += 100;
          qteState.elephant.urineSampleDone = true;
          const timeStr = `${String(gameTime.hour).padStart(2, '0')}:${String(Math.floor(gameTime.minute)).padStart(2, '0')}`;
          const snap = {
            time: timeStr,
            satiety: Math.round(qteState.elephant.satiety),
            thirst: Math.round(qteState.elephant.thirst),
            energy: Math.round(qteState.elephant.energy)
          };
          qteState.elephant.observations.unshift({
            time: timeStr,
            hourRecorded: gameTime.hour,
            category: 'Процедура',
            text: 'Отобрана плановая проба мочи в лабораторию (чистая средняя фракция)',
            keeper: 'Дежурный кипер',
            ok: true,
            snapshot: snap
          });
          qteState.elephant.lastInspectionSnapshot = snap;
          if (qteState.elephant.observations.length > 6) qteState.elephant.observations.pop();
          sfx.playSplash();
          sfx.playSuccess();
          addLog(`✨ Идеально! Взята чистая проба мочи (${qteState.elephant.name}). +100 очков!`);
        } else if (isGood) {
          qteState.result = 'good';
          stats.urineSamplesCollected++;
          stats.totalScore += 50;
          qteState.elephant.urineSampleDone = true;
          const timeStr = `${String(gameTime.hour).padStart(2, '0')}:${String(Math.floor(gameTime.minute)).padStart(2, '0')}`;
          const snap = {
            time: timeStr,
            satiety: Math.round(qteState.elephant.satiety),
            thirst: Math.round(qteState.elephant.thirst),
            energy: Math.round(qteState.elephant.energy)
          };
          qteState.elephant.observations.unshift({
            time: timeStr,
            hourRecorded: gameTime.hour,
            category: 'Процедура',
            text: 'Отобрана проба мочи в лабораторное ведро для биохимического анализа',
            keeper: 'Дежурный кипер',
            ok: true,
            snapshot: snap
          });
          qteState.elephant.lastInspectionSnapshot = snap;
          if (qteState.elephant.observations.length > 6) qteState.elephant.observations.pop();
          sfx.playSplash();
          addLog(`👍 Проба мочи успешно собрана (${qteState.elephant.name}). +50 очков!`);
        } else {
          qteState.result = 'miss';
          stats.missedPeeEvents++;
          spawnWetSpot(qteState.elephant, 14, 'medium');
          sfx.playSplash();
          addLog(`💦 Не успели подставить ведро для ${qteState.elephant.name}. Проба утеряна — на настиле образовалась лужа мочи! Засыпьте опилками.`);
        }

        qteState.elephant.isWantingPee = false;
        qteState.elephant.peeUrgencyTimer = 0; // согласованный сброс таймера предупреждения (успех и промах)
        // ЭТАП 27: успешно собранная проба опорожняет мочевой пузырь; следующий
        // позыв рассчитывается из индивидуального темпа наполнения слонихи.
        qteState.elephant.bladder = 8;
        qteState.elephant.peeTimer = estimateNextPeeDelay(qteState.elephant);

        // Экран результата живёт на реальном времени (wall-clock), чтобы не зависать
        // при паузе/планшете/модалке. По истечении 1.1 сек он закрывается только если
        // игра вернулась в PLAYING; иначе — при следующем возврате в PLAYING (см. update())
        // или через closeUrineQTE() при рестарте смены. state.gameState здесь не меняется.
        qteState.endTimer = performance.now() + 1100;
        clearUrineQtEResultTimeout();
        state.urineQtEResultTimeoutId = setTimeout(() => {
          state.urineQtEResultTimeoutId = null;
          if (state.gameState === 'PLAYING') closeUrineQTE();
        }, 1100);
      }
