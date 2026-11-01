import { state, player, elephants, keeperState, stats, sawdustStorage, gameTime, addWorldToast, addLog, showToast } from '../gameState.js';
import { sfx } from '../sound.js';
import { CANVAS_WIDTH, washZone } from '../config.js';

export function clearUrineQtEResultTimeout() {
        if (state.urineQtEResultTimeoutId !== null) {
          clearTimeout(state.urineQtEResultTimeoutId);
          state.urineQtEResultTimeoutId = null;
        }
      }

export function estimateNextPeeDelay(el) {
        const rate = el.bladderRate || 0.5;
        return Math.max(12, (92 - el.bladder) / rate) + Math.random() * 15;
      }

export function spawnWetSpot(el, amount, sizeOverride) {
        // Размеры лужи: маленькая (1 порция опилок), средняя (2 порции), большая (3 порции)
        let size = sizeOverride;
        if (!size) {
          if (amount <= 10) size = 'small';
          else if (amount <= 17) size = 'medium';
          else size = 'large';
        }
        const r = size === 'small' ? 20 : (size === 'medium' ? 28 : 38);
        const sawdustNeeded = size === 'small' ? 1 : (size === 'medium' ? 2 : 3);
        const actualAmount = amount || (size === 'small' ? 9 : (size === 'medium' ? 15 : 22));

        const newPuddle = {
          id: state.nextWetSpotId++,
          x: Math.max(80, Math.min(CANVAS_WIDTH - 80, el.x + (Math.random() - 0.5) * 45)),
          y: Math.max(250, Math.min(580, el.y + 25 + Math.random() * 20)),
          r: r,
          size: size,
          amount: actualAmount,
          maxAmount: actualAmount,
          elephantId: el.id,
          rot: Math.random() * Math.PI * 2,
          puddleVariant: Math.floor(Math.random() * 3),
          sawdustNeeded: sawdustNeeded,
          sawdustApplied: 0,
          state: 'puddle', // 'puddle' | 'absorbing' | 'absorbed'
          pourProgress: 0
        };
        state.wetSpots.push(newPuddle);
        addWorldToast(newPuddle.x, newPuddle.y - 12, 'Новая лужа!', '💦', '#f1c40f', 2.8);
        return newPuddle;
      }

export function performSleepUrination(el) {
        el.isWantingPee = false;
        el.peeUrgencyTimer = 0;
        el.bladder = 5;
        el.peeTimer = estimateNextPeeDelay(el);
        stats.missedPeeEvents++;
        const pSize = Math.random() < 0.45 ? 'large' : 'medium';
        const pKg = pSize === 'large' ? (20 + Math.floor(Math.random() * 4)) : (14 + Math.floor(Math.random() * 4));
        spawnWetSpot(el, pKg, pSize);
        sfx.playSplash();
        addLog(`💧 ${el.name} намочила мягкий настил во сне (${pSize === 'large' ? 'крупная лужа' : 'лужа мочи'}). Засыпьте опилками со склада!`);
      }

export function getFootDirtStatus(el) {
        if (el.footDirt < 25) return 'Чистые';
        if (el.footDirt < 60) return 'Загрязнены';
        return 'Требуют мойки';
      }

export function cancelLeading(reason) {
        if (!keeperState.leadingElephantId) return;
        const el = elephants.find(e => e.id === keeperState.leadingElephantId);
        keeperState.leadingElephantId = null;
        if (el) {
          el.state = 'IDLE';
          el.stateTimer = 2.5 + Math.random() * 2;
          el.statusText = 'Вернулась к обычным делам';
        }
        if (reason) addLog(reason);
      }

export function stopWashing(silent) {
        if (!keeperState.washingElephant) return;
        const el = keeperState.washingElephant;
        keeperState.washingElephant = null;
        keeperState.washProgress = 0;
        if (!silent) {
          el.statusText = 'Покинула зону мойки';
          addLog(`🚿 Мойка прервана: ${el.name} ушла из зоны мойки.`);
        }
      }

export function abortActiveProcedures() {
        if (keeperState.leadingElephantId) cancelLeading('Ведение слона отменено из-за другого действия.');
        stopWashing(true);
      }

export function performPedicureProcedure(el) {
        if (!el) return;
        if (el.pedicureDone) {
          showToast(`ℹ️ Стопы слонихи ${el.name} уже расчищены, повторный уход не требуется.`, '#3498db');
          return;
        }
        if (player.carrying !== 'none') {
          showToast('⚠️ Сначала освободите руки от переносимого инвентаря на стойке!', '#e67e22');
          sfx.playAlert();
          return;
        }
        if (el.state === 'REST') {
          showToast(`⚠️ Слониха ${el.name} сейчас спит! Не тревожьте животное во время глубокого отдыха.`, '#f39c12');
          sfx.playAlert();
          return;
        }

        const timeStr = `${String(gameTime.hour).padStart(2, '0')}:${String(Math.floor(gameTime.minute)).padStart(2, '0')}`;
        el.pedicureDone = true;
        el.isWantingPedicure = false;
        el.feetStatus = 'Отлично (расчищены)';
        stats.pedicuresDone++;
        stats.totalScore += 80;
        sfx.playSuccess();

        el.observations.unshift({
          time: timeStr,
          hourRecorded: gameTime.hour,
          category: 'Процедура',
          text: 'Выполнена ветеринарная расчистка стоп и подошв (педикюр)',
          keeper: 'Дежурный кипер',
          ok: true,
          snapshot: {
            time: timeStr,
            satiety: Math.round(el.satiety),
            thirst: Math.round(el.thirst),
            energy: Math.round(el.energy)
          }
        });
        if (el.observations.length > 6) el.observations.pop();

        addLog(`💅 Проведен педикюр слонихе ${el.name}! Стопы обработаны. +80 очков.`);
        showToast(`💅 Педикюр для ${el.name} успешно завершён! (+80 очк.)`, '#2ecc71');
      }
