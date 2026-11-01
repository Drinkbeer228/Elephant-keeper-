import { state, player, wheelbarrow, touchControls, virtualKeys, keys, keeperState, stats, sawdustStorage, waterTrough, feeders, elephants, dayNightCycle, gameTime, qteState, addLog } from './gameState.js';
import { sfx } from './sound.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT, washZone, forkRack, treatTable, wheelbarrowStation } from './config.js';
import { tryInspectElephant, recordObservationForElephant } from './elephants/inspection.js';
import { performPedicureProcedure } from './elephants/physiology.js';
import { getActiveAlerts } from './ui/hud.js';
import { finishUrineQTE } from './elephants/qte.js';
import { restartShift } from './shift/report.js';
import { completeSituationalEventFollowUp } from './systems/events.js';
import { canvas } from './canvas.js';
import { shiftTasks } from './shift/tasks.js';

export function isTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

export function applyOrientationLayout() {
        const isPortrait = window.innerHeight > window.innerWidth;
        document.body.classList.toggle('portrait-layout', isPortrait);
        const touchLayer = document.getElementById('touch-controls-layer');
        if (touchLayer && !isTouchDevice()) {
          touchLayer.style.display = 'none';
        }
        // Сброс клавиш/джойстика при смене ориентации, чтобы персонаж
        // не «ехал» и удержание действия не залипало между раскладками
        keys['ArrowUp'] = false;
        keys['ArrowDown'] = false;
        keys['ArrowLeft'] = false;
        keys['ArrowRight'] = false;
        keys['KeyW'] = false;
        keys['KeyS'] = false;
        keys['KeyA'] = false;
        keys['KeyD'] = false;
        keys['Space'] = false;
        keys['KeyE'] = false;
        player.actionQueued = false;
        virtualKeys.up = false;
        virtualKeys.down = false;
        virtualKeys.left = false;
        virtualKeys.right = false;
        virtualKeys.action = false;
      }

export function getKeeperContextAction() {
        if (state.gameState === 'QTE_URINE') {
          return { label: 'ПОЙМАТЬ!', icon: '🧪', color: '#f1c40f', hold: false };
        }
        if (state.gameState === 'TITLE') {
          return { label: 'СТАРТ', icon: '▶️', color: '#27ae60', hold: false };
        }
        if (state.gameState === 'SHIFT_REPORT') {
          return { label: 'СМЕНА', icon: '🔄', color: '#27ae60', hold: false };
        }

        // 1. Слонихи поблизости
        for (const el of elephants) {
          const dist = Math.hypot(player.x - el.x, player.y - el.y);
          if (dist < el.radius + 38) {
            if (state.activeSituationalEvent && state.activeSituationalEvent.status === 'active' && state.activeSituationalEvent.elephantId === el.id && state.activeSituationalEvent.followUpReady && !state.activeSituationalEvent.followUpDone) {
              return { label: 'КОНТРОЛЬ', icon: '🔍', color: '#3498db', hold: false, elephant: el };
            }
            if (el.isWantingPee && player.carrying === 'bucket') {
              return { label: 'МОЧА', icon: '🧪', color: '#f1c40f', hold: false, elephant: el };
            }
            // ЭТАП 27R.2: контекст для цикла ухода за лакомством (ведение слона)
            if (player.carrying === 'treat') {
              if (keeperState.leadingElephantId === el.id) {
                return { label: 'ДАТЬ', icon: '🍌', color: '#f1c40f', hold: false, elephant: el };
              }
              return { label: 'ВЕСТИ', icon: '🍌', color: '#f1c40f', hold: false, elephant: el };
            }
            if (player.carrying === 'hay' || player.carrying === 'mash') {
              return { label: 'КОРМ', icon: '🌾', color: '#27ae60', hold: false, elephant: el };
            }
            if (el.isWantingPedicure || !el.pedicureDone) {
              return { label: 'ПЕДИКЮР', icon: '🦶', color: '#e67e22', hold: true, elephant: el };
            }
            return { label: 'ОСМОТР', icon: '👁️', color: '#3498db', hold: false, elephant: el };
          }
        }

        // 1А. Интерактивные внеплановые объекты вольера (Этап 09)
        if (state.misplacedTool && state.misplacedTool.active) {
          const dist = Math.hypot(player.x - state.misplacedTool.x, player.y - state.misplacedTool.y);
          if (dist < 50) {
            return { label: 'ПОДНЯТЬ', icon: '🪣', color: '#f39c12', hold: false };
          }
        }
        if (state.scatteredHay && state.scatteredHay.active) {
          const dist = Math.hypot(player.x - state.scatteredHay.x, player.y - state.scatteredHay.y);
          if (dist < 50) {
            return { label: 'СОБРАТЬ', icon: '🌾', color: '#27ae60', hold: false };
          }
        }
        if (state.feederCrust && state.feederCrust.active) {
          const f = feeders.find(fd => fd.id === state.feederCrust.feederId);
          if (f) {
            const dist = Math.hypot(player.x - (f.x + f.w / 2), player.y - (f.y + f.h / 2));
            if (dist < 55) {
              return { label: 'ОЧИСТИТЬ', icon: '🧼', color: '#3498db', hold: true };
            }
          }
        }

        // 1Б. Взаимодействие со станцией покупки тачки
        const distToWbStation = Math.hypot(player.x - wheelbarrowStation.x, player.y - wheelbarrowStation.y);
        if (distToWbStation < 55) {
          if (wheelbarrow.isDamaged) {
            return { label: `КУПИТЬ ТАЧКУ (${wheelbarrow.price})`, icon: '🛒', color: stats.totalScore >= wheelbarrow.price ? '#27ae60' : '#e74c3c', hold: false };
          }
        }

        // 1В. Взаимодействие с тачкой на полу
        if (!wheelbarrow.inHands) {
          const distToWb = Math.hypot(player.x - wheelbarrow.x, player.y - wheelbarrow.y);
          if (distToWb < 48) {
            if (wheelbarrow.isDamaged) {
              return { label: 'ТАЧКА СЛОМАНА', icon: '💥', color: '#e74c3c', hold: false };
            }
            return { label: 'ВЗЯТЬ ТАЧКУ', icon: '🛒', color: '#f39c12', hold: false };
          }
        }

        // 2. Навоз
        for (const pile of state.dungPiles) {
          const dist = Math.hypot(player.x - pile.x, player.y - pile.y);
          if (dist < 48) {
            if (!wheelbarrow.inHands) {
              return { label: 'НУЖНА ТАЧКА', icon: '🛒', color: '#e74c3c', hold: false };
            }
            if (wheelbarrow.kg >= wheelbarrow.maxKg) {
              return { label: 'ТАЧКА ПОЛНА', icon: '⚠️', color: '#e74c3c', hold: false };
            }
            // ЭТАП 28 FIX: уборка лопатой теперь непрерывная — подсказка
            // отражает удержание кнопки (ранее «ЛОПАТА» вводило в заблуждение).
            return { label: 'ДЕРЖИТЕ: ЛОПАТА', icon: '🧹', color: '#d35400', hold: true };
          }
        }

        // 2А. Лужи мочи и опилки (Этап 30)
        for (const w of state.wetSpots) {
          if (Math.hypot(player.x - w.x, player.y - w.y) < w.r + 38) {
            if (w.state === 'absorbed') {
              if (player.hasPitchfork) {
                if (!wheelbarrow.inHands) return { label: 'НУЖНА ТАЧКА', icon: '🛒', color: '#e74c3c', hold: false };
                if (wheelbarrow.kg >= wheelbarrow.maxKg) return { label: 'ТАЧКА ПОЛНА', icon: '⚠️', color: '#e74c3c', hold: false };
                return { label: 'УБРАТЬ ВИЛАМИ', icon: '🍀', color: '#27ae60', hold: true };
              }
              return { label: 'НУЖНЫ ВИЛЫ', icon: '🛠️', color: '#e67e22', hold: false };
            } else {
              if (player.sawdustStock > 0) {
                return { label: 'ЗАСЫПАТЬ ОПИЛКАМИ', icon: '🪵', color: '#f39c12', hold: true };
              }
              if (player.hasPitchfork) {
                if (!wheelbarrow.inHands) return { label: 'НУЖНА ТАЧКА', icon: '🛒', color: '#e74c3c', hold: false };
                if (wheelbarrow.kg >= wheelbarrow.maxKg) return { label: 'ТАЧКА ПОЛНА', icon: '⚠️', color: '#e74c3c', hold: false };
                return { label: 'ВИЛЫ', icon: '🍀', color: '#2980b9', hold: true };
              }
              return { label: 'НУЖНЫ ОПИЛКИ', icon: '🪵', color: '#888888', hold: false };
            }
          }
        }

        // 2А-b. Склад чистых опилок (Этап 30)
        const distSawdustCrate = Math.hypot(player.x - (sawdustStorage.x + sawdustStorage.w / 2), player.y - (sawdustStorage.y + sawdustStorage.h / 2));
        if (distSawdustCrate < 55 && !player.isShoveling && !player.isDoingPedicure && !player.isWashing) {
          if (sawdustStorage.stock <= 0) return { label: 'ПУСТО', icon: '🪵', color: '#e74c3c', hold: false };
          if (player.sawdustStock >= player.sawdustMaxStock) return { label: 'ЗАПАС ПОЛОН', icon: '🪵', color: '#f1c40f', hold: false };
          return { label: 'ОПИЛКИ', icon: '🪵', color: '#2ecc71', hold: false };
        }

        // 2Б. Стол лакомств и стойка вил (ЭТАП 27R.2)
        if (Math.hypot(player.x - treatTable.x, player.y - treatTable.y) < 55 && !player.isShoveling && !player.isDoingPedicure && !player.isWashing) {
          if (player.carrying === 'treat') {
            return { label: 'ВЕРНУТЬ', icon: '🍌', color: '#f1c40f', hold: false };
          }
          if (keeperState.treatsStock > 0 && player.carrying === 'none') {
            return { label: 'ЛАКОМСТВО', icon: '🍌', color: '#f1c40f', hold: false };
          }
        }
        if (Math.hypot(player.x - forkRack.x, player.y - forkRack.y) < 55 && !player.isShoveling && !player.isDoingPedicure && !player.isWashing) {
          return { label: player.hasPitchfork ? 'ВЕРНУТЬ ВИЛЫ' : 'ВЗЯТЬ ВИЛЫ', icon: '🛠️', color: '#2980b9', hold: false };
        }

        // 2В. Зона мойки — удержание действия (ЭТАП 27R.2)
        if (Math.hypot(player.x - washZone.x, player.y - washZone.y) < washZone.r + 45 &&
            elephants.some(e => Math.hypot(e.x - washZone.x, e.y - washZone.y) < washZone.r && e.footDirt >= 25) &&
            player.carrying === 'none' && !player.isShoveling && !player.isDoingPedicure) {
          return { label: 'МОЙКА', icon: '🚿', color: '#3498db', hold: true };
        }

        // 3. Вентиль поилки
        const distToValve = Math.hypot(player.x - waterTrough.valveX, player.y - waterTrough.valveY);
        if (distToValve < 60 || (player.x >= 420 && player.x <= 560 && player.y >= 540 && player.y <= 650)) {
          if (state.activeSituationalEvent && state.activeSituationalEvent.type === 'trough_low_thirst' && !state.activeSituationalEvent.actionDone) {
            return { label: 'ДОЛИВ!', icon: '💧', color: '#f39c12', hold: true };
          }
          if (waterTrough.water >= 100) {
            return { label: 'ПОЛНА 100%', icon: '💧', color: '#2ecc71', hold: false };
          }
          return { label: 'ВЕНТИЛЬ', icon: '💧', color: '#3498db', hold: true };
        }

        // 4. Кормушки
        for (const f of feeders) {
          const dist = Math.hypot(player.x - (f.x + f.w / 2), player.y - (f.y + f.h / 2));
          if (dist < 55) {
            if (player.carrying === 'hay' || player.carrying === 'mash') {
              return { label: 'КОРМУШКА', icon: '🥣', color: '#2ecc71', hold: false };
            }
          }
        }

        // 5. Контейнер навоза
        const nearDumpster = player.x >= 780 && player.x <= 975 && player.y >= 50 && player.y <= 175;
        if (nearDumpster) {
          if (wheelbarrow.inHands && wheelbarrow.kg > 0) {
            return { label: 'ВЫГРУЗИТЬ', icon: '♻️', color: '#27ae60', hold: false };
          }
          if (player.wheelbarrowKg > 0) {
            return { label: 'ВЫГРУЗИТЬ', icon: '♻️', color: '#27ae60', hold: false };
          }
          return { label: 'ПУСТА', icon: '🚜', color: '#7f8c8d', hold: false };
        }

        // 6. Стойка лабораторных ведер
        const distToRack = Math.hypot(player.x - 768, player.y - 120);
        if (distToRack < 55) {
          if (player.carrying === 'bucket') {
            return { label: 'ВЕДРО', icon: '🧪', color: '#f39c12', hold: false };
          }
          if (player.carrying === 'none') {
            return { label: 'ВЕДРО', icon: '🧪', color: '#3498db', hold: false };
          }
        }

        // 7. Склад сена
        const distToHay = Math.hypot(player.x - 80, player.y - 90);
        if (distToHay < 65) {
          if (player.carrying === 'hay') {
            return { label: 'СЕНО', icon: '🌾', color: '#f39c12', hold: false };
          }
          if (player.carrying === 'none') {
            return { label: 'СЕНО', icon: '🌾', color: '#27ae60', hold: false };
          }
        }

        // 8. Склад каши
        const distToMash = Math.hypot(player.x - 190, player.y - 90);
        if (distToMash < 65) {
          if (player.carrying === 'mash') {
            return { label: 'КАША', icon: '🥣', color: '#f39c12', hold: false };
          }
          if (player.carrying === 'none') {
            return { label: 'КАША', icon: '🥣', color: '#27ae60', hold: false };
          }
        }

        if (player.carrying !== 'none') {
          return { label: 'БРОСИТЬ', icon: '📦', color: '#7f8c8d', hold: false };
        }

        if (wheelbarrow.inHands) {
          return { label: 'ПОСТАВИТЬ [E]', icon: '🛒', color: '#7f8c8d', hold: false };
        }

        return { label: 'SPACE', icon: '🔨', color: '#2ecc71', hold: false };
      }

export function updateTouchControlsUI() {
        const touchLayer = document.getElementById('touch-controls-layer');
        if (!touchLayer) return;

        // На настольных устройствах с мышью/клавиатурой слой мобильного управления полностью скрыт
        if (!isTouchDevice()) {
          touchLayer.style.display = 'none';
          return;
        }

        // Если открыто модальное окно, скрываем сенсорные кнопки, чтобы они не мешали взаимодействию с карточками
        const isModalOpen = (state.gameState === 'SHIFT_TABLET' || state.gameState === 'INSPECTION_MODAL' || state.gameState === 'SHIFT_REPORT' || state.gameState === 'PAUSED' || state.gameState === 'TITLE');
        if (isModalOpen) {
          touchLayer.style.display = 'none';
          return;
        } else {
          touchLayer.style.display = 'block';
        }

        // Обновляем бейдж невыполненных доступных задач на кнопке планшета
        const availCount = shiftTasks.filter(t => t.status === 'available').length;
        const badge = document.getElementById('touch-tasks-badge');
        if (badge) {
          if (availCount > 0) {
            badge.style.display = 'flex';
            badge.textContent = String(availCount);
          } else {
            badge.style.display = 'none';
          }
        }

        // Обновляем бейдж тревог и проблем на кнопке журнала
        const alertsList = getActiveAlerts();
        const alertBadge = document.getElementById('touch-alerts-badge');
        if (alertBadge) {
          if (alertsList.length > 0) {
            alertBadge.style.display = 'flex';
            alertBadge.textContent = String(alertsList.length);
            const hasCrit = alertsList.some(a => a.critical);
            alertBadge.style.background = hasCrit ? '#e74c3c' : '#f39c12';
          } else {
            alertBadge.style.display = 'none';
          }
        }

        // Контекстное действие для кнопки SPACE
        const actionBtn = document.getElementById('touch-btn-action');
        const actionIcon = document.getElementById('touch-action-icon');
        const actionLabel = document.getElementById('touch-action-label');
        const inspectBtn = document.getElementById('touch-btn-inspect');

        const act = getKeeperContextAction();
        if (actionIcon && actionLabel) {
          actionIcon.textContent = act.icon;
          actionLabel.textContent = act.label;
        }
        if (actionBtn && act.color) {
          actionBtn.style.borderColor = act.color;
        }

        // Подсветка кнопки осмотра рядом со слонихой
        let nearElephant = false;
        for (const el of elephants) {
          const dist = Math.hypot(player.x - el.x, player.y - el.y);
          if (dist < el.radius + 45) {
            nearElephant = true;
            break;
          }
        }
        if (inspectBtn) {
          if (nearElephant) {
            inspectBtn.classList.add('highlighted');
          } else {
            inspectBtn.classList.remove('highlighted');
          }
        }
      }

export function getCanvasCoords(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return { x: 0, y: 0 };
        const scaleX = CANVAS_WIDTH / rect.width;
        const scaleY = CANVAS_HEIGHT / rect.height;
        return {
          x: Math.max(0, Math.min(CANVAS_WIDTH, (clientX - rect.left) * scaleX)),
          y: Math.max(0, Math.min(CANVAS_HEIGHT, (clientY - rect.top) * scaleY))
        };
      }

export function processTouchPoints(pointList, isStart) {
        sfx.init();

        for (let i = 0; i < pointList.length; i++) {
          const pt = pointList[i];

          // 1. Проверка интерактивных экранов (Start, Pause, Tablet, Reset, QTE, Modals, Sound)
          if (isStart) {
            // Кнопка звука в HUD (x: 935..985, y: 8..40)
            if (pt.x >= 935 && pt.x <= 985 && pt.y >= 8 && pt.y <= 40) {
              sfx.toggleMute();
              addLog(sfx.muted ? 'Звук выключен' : 'Звук включен');
              continue;
            }

            // Кнопка паузы в HUD (x: 880..930, y: 8..40)
            if (pt.x >= 880 && pt.x <= 930 && pt.y >= 8 && pt.y <= 40) {
              if (state.gameState === 'QTE_URINE') {
                // Пауза доступна и на экране результата QTE — возврат после паузы в PLAYING
                qteState.returnState = 'PLAYING';
                state.gameState = 'PAUSED';
              } else {
                state.gameState = state.gameState === 'PLAYING' ? 'PAUSED' : 'PLAYING';
              }
              continue;
            }

            // Проверка взаимодействия с раскрытой панелью журнала
            if (state.journalOpen) {
              const panelW = 420;
              const panelH = 330;
              const px = CANVAS_WIDTH - panelW - 12;
              const py = 68;
              // Клик по кнопке [J] закрыть в шапке панели
              if (pt.x >= px + panelW - 110 && pt.x <= px + panelW && pt.y >= py && pt.y <= py + 36) {
                state.journalOpen = false;
                sfx.playStep();
                continue;
              }
              // Клик за пределами панели (кроме кнопок вызова) закрывает её
              if (pt.x < px || pt.x > px + panelW || pt.y < py || pt.y > py + panelH) {
                if (!(pt.x >= 710 && pt.x <= 820 && pt.y >= 38 && pt.y <= 65) &&
                    !(pt.x >= 180 && pt.x <= 750 && pt.y >= CANVAS_HEIGHT - 82 && pt.y <= CANVAS_HEIGHT - 10)) {
                  state.journalOpen = false;
                }
              }
            }

            // Индикатор тревог в верхней панели HUD (x: 710..820, y: 38..65)
            if (pt.x >= 710 && pt.x <= 820 && pt.y >= 38 && pt.y <= 65) {
              state.journalOpen = !state.journalOpen;
              sfx.playStep();
              continue;
            }

            // Клик по нижнему журналу дежурного (x: 180..750, y: CANVAS_HEIGHT - 82..CANVAS_HEIGHT - 10)
            if (pt.x >= 180 && pt.x <= 750 && pt.y >= CANVAS_HEIGHT - 82 && pt.y <= CANVAS_HEIGHT - 10) {
              state.journalOpen = !state.journalOpen;
              sfx.playStep();
              continue;
            }

            // Кнопка планшета в HUD (x: 825..875, y: 8..40)
            if (pt.x >= 825 && pt.x <= 875 && pt.y >= 8 && pt.y <= 40) {
              if (state.gameState === 'PLAYING') {
                state.gameState = 'SHIFT_TABLET';
                sfx.playStep();
              } else if (state.gameState === 'SHIFT_TABLET') {
                state.gameState = 'PLAYING';
                sfx.playStep();
              } else if (state.gameState === 'QTE_URINE' && qteState.result !== null) {
                // Планшет поверх экрана результата QTE: возврат в PLAYING после закрытия
                qteState.returnState = 'PLAYING';
                state.gameState = 'SHIFT_TABLET';
                sfx.playStep();
              }
              continue;
            }

            if (state.gameState === 'TITLE') {
              if (pt.x >= 380 && pt.x <= 620 && pt.y >= 480 && pt.y <= 540) {
                state.gameState = 'PLAYING';
                sfx.playSuccess();
                sfx.playElephantTrumpet();
                addLog('Кипер заступил на пост. Удачи на смене!');
              }
              continue;
            }

            if (state.gameState === 'SHIFT_REPORT') {
              if (pt.x >= 380 && pt.x <= 620 && pt.y >= 565 && pt.y <= 625) {
                restartShift();
              }
              continue;
            }

            if (state.gameState === 'INSPECTION_MODAL') {
              const el = state.inspectingElephant;
              // 1. Стрелочка [◄] влево переключения категории наблюдения (x: 512..555, y: 270..305)
              if (el && pt.x >= 512 && pt.x <= 555 && pt.y >= 270 && pt.y <= 305) {
                el.selectedObsCategory = ((el.selectedObsCategory || 0) + 4) % 5;
                sfx.playStep();
                continue;
              }
              // 2. Стрелочка [►] вправо переключения категории наблюдения (x: 815..858, y: 270..305)
              if (el && pt.x >= 815 && pt.x <= 858 && pt.y >= 270 && pt.y <= 305) {
                el.selectedObsCategory = ((el.selectedObsCategory || 0) + 1) % 5;
                sfx.playStep();
                continue;
              }
              // 3. Кнопка «Внести наблюдение в журнал» или «Подтвердить контрольную проверку» (x: 515..855, y: 365..405)
              if (el && pt.x >= 515 && pt.x <= 855 && pt.y >= 365 && pt.y <= 405) {
                if (state.activeSituationalEvent && state.activeSituationalEvent.status === 'active' && state.activeSituationalEvent.elephantId === el.id && state.activeSituationalEvent.followUpReady && !state.activeSituationalEvent.followUpDone) {
                  completeSituationalEventFollowUp(state.activeSituationalEvent);
                } else {
                  recordObservationForElephant(el);
                }
                continue;
              }
              // 4. Кнопка «Провести педикюр» (x: 695..855, y: 128..162)
              if (el && pt.x >= 695 && pt.x <= 855 && pt.y >= 128 && pt.y <= 162) {
                performPedicureProcedure(el);
                continue;
              }
              // 5. Закрытие карточки по кнопке [✕] в шапке (820..875, 35..85), по нижней кнопке (340..660, 575..630),
              // либо клику вне окна (x < 115 || x > 885 || y < 30 || y > 650)
              if ((pt.x >= 820 && pt.x <= 875 && pt.y >= 35 && pt.y <= 85) ||
                  (pt.x >= 340 && pt.x <= 660 && pt.y >= 575 && pt.y <= 630) ||
                  (pt.x < 115 || pt.x > 885 || pt.y < 30 || pt.y > 650)) {
                state.gameState = 'PLAYING';
                state.inspectingElephant = null;
                sfx.playSuccess();
              }
              continue;
            }

            if (state.gameState === 'SHIFT_TABLET') {
              const canSubmitShift = (gameTime.hour >= 20 || dayNightCycle.phase === 'NIGHT' || dayNightCycle.phase === 'DAWN');
              // Сдача смены и отчёта по кнопке
              if (canSubmitShift && pt.x >= 485 && pt.x <= 775 && pt.y >= 585 && pt.y <= 635) {
                gameTime.isShiftEnded = true;
                state.gameState = 'SHIFT_REPORT';
                sfx.playSuccess();
                sfx.playElephantTrumpet();
                addLog('Дежурный кипер сдал смену и заполнил суточный рапорт.');
                continue;
              }
              // Закрытие планшета по кнопке закрытия или клику вне планшета
              const closeHit = canSubmitShift
                ? (pt.x >= 205 && pt.x <= 455 && pt.y >= 585 && pt.y <= 635)
                : (pt.x >= 340 && pt.x <= 660 && pt.y >= 585 && pt.y <= 645);
              if (closeHit || (pt.x < 50 || pt.x > 950 || pt.y < 20 || pt.y > 660)) {
                state.gameState = 'PLAYING';
                sfx.playSuccess();
              }
              continue;
            }

            if (state.gameState === 'QTE_URINE') {
              // Любой тап по экрану QTE: повторный клик во время показа результата игнорируется
              if (qteState.result === null) finishUrineQTE();
              continue;
            }

            if (state.gameState === 'PAUSED') {
              state.gameState = 'PLAYING';
              continue;
            }
          }
        }
      }

export function initTouchControls() {
        const joystickBase = document.getElementById('touch-joystick-base');
        const joystickKnob = document.getElementById('touch-joystick-knob');
        let joystickPointerId = null;
        let joystickActive = false;
        let jCenterX = 0;
        let jCenterY = 0;
        const jMaxRadius = 34;

        if (joystickBase) {
          joystickBase.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            sfx.init();
            joystickPointerId = e.pointerId;
            joystickActive = true;
            try {
              joystickBase.setPointerCapture(e.pointerId);
            } catch (err) {}
            const rect = joystickBase.getBoundingClientRect();
            jCenterX = rect.left + rect.width / 2;
            jCenterY = rect.top + rect.height / 2;
            handleJoystickPointer(e);
          });

          joystickBase.addEventListener('pointermove', (e) => {
            if (!joystickActive || e.pointerId !== joystickPointerId) return;
            e.preventDefault();
            handleJoystickPointer(e);
          });

          function handleJoystickPointer(e) {
            const dx = e.clientX - jCenterX;
            const dy = e.clientY - jCenterY;
            const dist = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            const clampedDist = Math.min(dist, jMaxRadius);
            const kx = Math.cos(angle) * clampedDist;
            const ky = Math.sin(angle) * clampedDist;

            if (joystickKnob) {
              joystickKnob.style.transform = `translate(${kx}px, ${ky}px)`;
            }

            const deadzone = 8;
            virtualKeys.up = dy < -deadzone;
            virtualKeys.down = dy > deadzone;
            virtualKeys.left = dx < -deadzone;
            virtualKeys.right = dx > deadzone;
          }

          function resetJoystick(e) {
            if (e && e.pointerId !== undefined && joystickPointerId !== null && e.pointerId !== joystickPointerId) return;
            joystickActive = false;
            joystickPointerId = null;
            if (joystickKnob) {
              joystickKnob.style.transform = 'translate(0px, 0px)';
            }
            virtualKeys.up = false;
            virtualKeys.down = false;
            virtualKeys.left = false;
            virtualKeys.right = false;
          }

          joystickBase.addEventListener('pointerup', resetJoystick);
          joystickBase.addEventListener('pointercancel', resetJoystick);
          joystickBase.addEventListener('lostpointercapture', resetJoystick);
        }

        // Кнопка действия (SPACE / удержание)
        const actBtn = document.getElementById('touch-btn-action');
        if (actBtn) {
          actBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            sfx.init();
            try {
              actBtn.setPointerCapture(e.pointerId);
            } catch (err) {}
            virtualKeys.action = true;
            actBtn.classList.add('holding');

            // ЭТАП 27R: одиночное «нажатие» действия для update() на сенсорном вводе
            if (state.gameState === 'PLAYING') player.actionQueued = true;

            if (state.gameState === 'QTE_URINE') {
              finishUrineQTE(); // защита от повторного начисления внутри самой функции (result !== null)
              return;
            }
            if (state.gameState === 'TITLE') {
              state.gameState = 'PLAYING';
              sfx.playSuccess();
              sfx.playElephantTrumpet();
              addLog('Кипер заступил на пост. Чистота и сытость слонов в ваших руках!');
              return;
            }
            if (state.gameState === 'SHIFT_REPORT') {
              restartShift();
              return;
            }
          });

          function releaseAction() {
            virtualKeys.action = false;
            if (actBtn) actBtn.classList.remove('holding');
          }

          actBtn.addEventListener('pointerup', releaseAction);
          actBtn.addEventListener('pointercancel', releaseAction);
          actBtn.addEventListener('lostpointercapture', releaseAction);
        }

        // Кнопка осмотра (F)
        const inspBtn = document.getElementById('touch-btn-inspect');
        if (inspBtn) {
          inspBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            sfx.init();
            if (state.gameState === 'PLAYING') {
              tryInspectElephant();
            }
          });
        }

        // Кнопка журнала и активных тревог (J)
        const journalBtn = document.getElementById('touch-btn-journal');
        if (journalBtn) {
          journalBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            sfx.init();
            state.journalOpen = !state.journalOpen;
            sfx.playStep();
          });
        }

        // Кнопка планшета (Tab)
        const tabBtn = document.getElementById('touch-btn-tablet');
        if (tabBtn) {
          tabBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            sfx.init();
            if (state.gameState === 'PLAYING') {
              state.gameState = 'SHIFT_TABLET';
              sfx.playStep();
            } else if (state.gameState === 'SHIFT_TABLET') {
              state.gameState = 'PLAYING';
              sfx.playStep();
            }
          });
        }

        // Кнопка паузы (P)
        const pauseBtn = document.getElementById('touch-btn-pause');
        if (pauseBtn) {
          pauseBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            sfx.init();
            if (state.gameState === 'PLAYING') {
              state.gameState = 'PAUSED';
            } else if (state.gameState === 'PAUSED') {
              state.gameState = 'PLAYING';
            }
          });
        }

        // Кнопка звука (M)
        const sndBtn = document.getElementById('touch-btn-sound');
        if (sndBtn) {
          sndBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            sfx.init();
            sfx.toggleMute();
            sndBtn.textContent = sfx.muted ? '🔇' : '🔊';
            addLog(sfx.muted ? 'Звук выключен' : 'Звук включен');
          });
        }

        // Сброс виртуального ввода при потере фокуса окна браузера
        window.addEventListener('blur', () => {
          virtualKeys.up = false;
          virtualKeys.down = false;
          virtualKeys.left = false;
          virtualKeys.right = false;
          virtualKeys.action = false;
          if (joystickKnob) joystickKnob.style.transform = 'translate(0px, 0px)';
          if (actBtn) actBtn.classList.remove('holding');
        });
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            virtualKeys.up = false;
            virtualKeys.down = false;
            virtualKeys.left = false;
            virtualKeys.right = false;
            virtualKeys.action = false;
            if (joystickKnob) joystickKnob.style.transform = 'translate(0px, 0px)';
            if (actBtn) actBtn.classList.remove('holding');
          }
        });
      }

export function initKeyboard() {
  window.addEventListener('keydown', (e) => {
    sfx.init();

    // 0. Если открыт итоговый отчет смены: Space / Enter перезапускает смену
    if (state.gameState === 'SHIFT_REPORT') {
      if (e.code === 'Space' || e.code === 'Enter') {
        restartShift();
        return;
      }
    }

    // 1. Старт игры с экрана заставки
    if (state.gameState === 'TITLE') {
      if (e.code === 'Space' || e.code === 'Enter') {
        state.gameState = 'PLAYING';
        sfx.playSuccess();
        return;
      }
    }

    // 2. Управление модальным окном подробного осмотра слонихи
    if (state.gameState === 'INSPECTION_MODAL') {
      const el = state.inspectingElephant;
      if (!el) {
        state.gameState = 'PLAYING';
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyF') {
        state.gameState = 'PLAYING';
        state.inspectingElephant = null;
        sfx.playThud();
        return;
      }

      // Переключение вкладок осмотра (1..4 или стрелки влево/вправо)
      if (e.code === 'Digit1') el.selectedObsCategory = 0;
      if (e.code === 'Digit2') el.selectedObsCategory = 1;
      if (e.code === 'Digit3') el.selectedObsCategory = 2;
      if (e.code === 'Digit4') el.selectedObsCategory = 3;

      if (e.code === 'ArrowLeft') {
        el.selectedObsCategory = (el.selectedObsCategory + 3) % 4;
        sfx.playStep();
      }
      if (e.code === 'ArrowRight') {
        el.selectedObsCategory = (el.selectedObsCategory + 1) % 4;
        sfx.playStep();
      }

      // Выбор наблюдения (клавиши A, B, C)
      if (e.code === 'KeyA') recordObservationForElephant(el, 0);
      if (e.code === 'KeyB') recordObservationForElephant(el, 1);
      if (e.code === 'KeyC') recordObservationForElephant(el, 2);

      return;
    }

    // 3. Пауза игры (клавиша P)
    if (e.code === 'KeyP') {
      if (state.gameState === 'PLAYING') {
        state.gameState = 'PAUSED';
        sfx.playThud();
      } else if (state.gameState === 'PAUSED') {
        state.gameState = 'PLAYING';
        sfx.playThud();
      }
      return;
    }

    if (e.code === 'Escape') {
      if (state.gameState === 'PLAYING') {
        state.gameState = 'PAUSED';
        sfx.playThud();
        return;
      } else if (state.gameState === 'PAUSED') {
        state.gameState = 'PLAYING';
        sfx.playThud();
        return;
      }
    }

    // 4. Отключение/включение звука (клавиша M)
    if (e.code === 'KeyM') {
      sfx.toggleMute();
      return;
    }

    // 5. Журнал событий и тревог (клавиша J)
    if (e.code === 'KeyJ') {
      if (state.gameState === 'PLAYING' || state.gameState === 'PAUSED') {
        state.journalOpen = !state.journalOpen;
        sfx.playThud();
        return;
      }
    }

    // 6. Планшет задач смены (клавиша Tab)
    if (e.code === 'Tab') {
      e.preventDefault();
      if (state.gameState === 'PLAYING') {
        state.gameState = 'SHIFT_TABLET';
        sfx.playThud();
        return;
      } else if (state.gameState === 'SHIFT_TABLET') {
        state.gameState = 'PLAYING';
        sfx.playThud();
        return;
      }
    }

    // 6А. Режим отладки верстки HUD (F2)
    if (e.code === 'F2') {
      e.preventDefault();
      if (typeof window.toggleHUDDebug === 'function') {
        window.toggleHUDDebug();
      } else {
        state.hudDebugMode = !state.hudDebugMode;
      }
      return;
    }

    // Управление передвижением и взаимодействиями
    keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'KeyE') {
      player.actionQueued = true;
    }

    // 7. Вызов осмотра слонихи (F) во время игры
    if (e.code === 'KeyF' && state.gameState === 'PLAYING') {
      tryInspectElephant();
      return;
    }

    // 8. Фиксация анализа мочи во время QTE
    if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') && state.gameState === 'QTE_URINE') {
      if (qteState.result === null) finishUrineQTE();
      return;
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });
}
