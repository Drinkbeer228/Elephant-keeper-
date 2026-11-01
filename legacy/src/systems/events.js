import { state, stats, player, elephants, feeders, particles, waterTrough, gameTime, virtualKeys, keys, situationalEvents, addLog, showToast } from '../gameState.js';
import { sfx } from '../sound.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT, washZone } from '../config.js';
import { canElephantMoveTo } from '../world.js';

export function startSituationalEvent(ev) {
        state.activeSituationalEvent = ev;
        situationalEvents.push(ev);
        stats.situationalEventsOccurred++;

        const el = elephants.find(e => e.id === ev.elephantId);
        if (el) {
          if (ev.type === 'trough_low_thirst') {
            el.statusText = 'Ждёт воду у пустой поилки';
            sfx.playAlert();
          } else if (ev.type === 'pretty_low_activity') {
            el.statusText = 'Долгий отдых, вялый аппетит';
          } else if (ev.type === 'margo_distracted') {
            el.statusText = 'Чешет бок о брус ограды';
          } else if (ev.type === 'sanitation_cluster') {
            el.statusText = 'Обходит грязную зону вольера';
          } else if (ev.type === 'tool_misplaced') {
            el.statusText = 'Разглядывает ведро на проходе';
            state.misplacedTool = { active: true, x: 490, y: 320, name: 'Лабораторное ведро' };
          } else if (ev.type === 'scattered_hay') {
            el.statusText = 'Ковыряется в сене у кормушки';
            state.scatteredHay = { active: true, x: 740, y: 310, kg: 8 };
          } else if (ev.type === 'feeder_crust') {
            el.statusText = 'Принюхивается к засохшей кормушке';
            state.feederCrust = { active: true, feederId: 'audrey', progress: 0 };
          } else if (ev.type === 'vet_followup_check') {
            el.statusText = 'Ждёт повторного осмотра [F]';
          }
        }

        addLog(`⚡ [Событие смены] ${ev.title}: ${ev.desc}`);
        showToast(`⚡ Ситуация: «${ev.title}»! Подробности в планшете [Tab]`, '#f39c12');
      }

export function checkAndTriggerSituationalEvents(dt) {
        if (state.eventCooldownTimer > 0) {
          state.eventCooldownTimer -= dt;
          return;
        }

        if (state.activeSituationalEvent && state.activeSituationalEvent.status === 'active') {
          return;
        }

        const curH = gameTime.hour + gameTime.minute / 60;

        // 1. Событие: «Забытый/смещённый инвентарь на проходе вольера» (08:35 - 10:45)
        if (curH >= 8.55 && curH < 10.75 && !situationalEvents.some(e => e.type === 'tool_misplaced')) {
          startSituationalEvent({
            id: 'event_tool_misplaced_' + Math.floor(curH),
            type: 'tool_misplaced',
            title: 'Смещённый инвентарь на проходе',
            desc: 'Лабораторное ведро забыто на полу в вольере. Верните его на стойку [Space/E] или завершите срочные дела.',
            elephantId: 'margo',
            startHour: curH,
            expireHour: curH + 2.2,
            status: 'active',
            noticed: false,
            actionDone: false,
            followUpReady: false,
            followUpDone: false,
            pointsAwarded: 0
          });
          state.eventCooldownTimer = 75;
          return;
        }

        // 2. Событие: «Низкий уровень воды и жажда Одри» (09:15 - 12:00)
        if (curH >= 9.25 && curH < 12.0 && !situationalEvents.some(e => e.type === 'trough_low_thirst')) {
          if (waterTrough.water < 45) {
            startSituationalEvent({
              id: 'event_trough_' + Math.floor(curH),
              type: 'trough_low_thirst',
              title: 'Низкий уровень воды в поилке',
              desc: 'Одри томится у автопоилки: уровень воды упал ниже 45%. Требуется долив из крана.',
              elephantId: 'audrey',
              startHour: curH,
              expireHour: curH + 2.2,
              status: 'active',
              noticed: false,
              actionDone: false,
              followUpReady: false,
              followUpDone: false,
              pointsAwarded: 0
            });
            state.eventCooldownTimer = 75;
            return;
          }
        }

        // 3. Событие: «Рассыпанный фураж у кормушки Претти» (10:15 - 13:00)
        if (curH >= 10.25 && curH < 13.0 && !situationalEvents.some(e => e.type === 'scattered_hay')) {
          startSituationalEvent({
            id: 'event_scattered_hay_' + Math.floor(curH),
            type: 'scattered_hay',
            title: 'Рассыпанный фураж у кормушки',
            desc: 'Претти вытащила пучок сена из кормушки на настил вольера. Соберите его лопатой/руками [Space/E].',
            elephantId: 'pretty',
            startHour: curH,
            expireHour: curH + 2.2,
            status: 'active',
            noticed: false,
            actionDone: false,
            followUpReady: false,
            followUpDone: false,
            pointsAwarded: 0
          });
          state.eventCooldownTimer = 75;
          return;
        }

        // 4. Событие: «Снижение активности и аппетита Претти» (11:30 - 15:00)
        if (curH >= 11.5 && curH < 15.0 && !situationalEvents.some(e => e.type === 'pretty_low_activity')) {
          const pretty = elephants.find(e => e.id === 'pretty');
          if (pretty && (pretty.state === 'REST' || pretty.energy < 75)) {
            startSituationalEvent({
              id: 'event_pretty_activity_' + Math.floor(curH),
              type: 'pretty_low_activity',
              title: 'Снижение тонуса и аппетита Претти',
              desc: 'Претти долго отдыхает в углу вольера и пропускает кормление. Требуется осмотр [F] и порция каши.',
              elephantId: 'pretty',
              startHour: curH,
              expireHour: curH + 2.5,
              status: 'active',
              noticed: false,
              actionDone: false,
              followUpReady: false,
              followUpDone: false,
              pointsAwarded: 0
            });
            state.eventCooldownTimer = 80;
            return;
          }
        }

        // 5. Событие: «Очистка бортика кормушки от засохшей каши» (13:15 - 16:15)
        if (curH >= 13.25 && curH < 16.25 && !situationalEvents.some(e => e.type === 'feeder_crust')) {
          startSituationalEvent({
            id: 'event_feeder_crust_' + Math.floor(curH),
            type: 'feeder_crust',
            title: 'Очистка бортика кормушки',
            desc: 'На бортике кормушки Одри засохли остатки влажной каши. Проведите зачистку [удерживать Space/E].',
            elephantId: 'audrey',
            startHour: curH,
            expireHour: curH + 2.2,
            status: 'active',
            noticed: false,
            actionDone: false,
            followUpReady: false,
            followUpDone: false,
            pointsAwarded: 0
          });
          state.eventCooldownTimer = 75;
          return;
        }

        // 6. Событие: «Марго меняет планы и отвлеклась от корма» (14:30 - 17:30)
        if (curH >= 14.5 && curH < 17.5 && !situationalEvents.some(e => e.type === 'margo_distracted')) {
          startSituationalEvent({
            id: 'event_margo_distracted_' + Math.floor(curH),
            type: 'margo_distracted',
            title: 'Марго отвлеклась от кормления',
            desc: 'Марго передумала идти к кормушке, чешет бок о брус и пропускает рацион. Рекомендуется проверить или поднести сено.',
            elephantId: 'margo',
            startHour: curH,
            expireHour: curH + 2.0,
            status: 'active',
            noticed: false,
            actionDone: false,
            followUpReady: false,
            followUpDone: false,
            pointsAwarded: 0
          });
          state.eventCooldownTimer = 75;
          return;
        }

        // 7. Событие: «Повторный ветеринарный контроль состояния» (15:30 - 18:00)
        if (curH >= 15.5 && curH < 18.0 && !situationalEvents.some(e => e.type === 'vet_followup_check')) {
          startSituationalEvent({
            id: 'event_vet_followup_' + Math.floor(curH),
            type: 'vet_followup_check',
            title: 'Повторный клинический контроль',
            desc: 'Ветеринарная служба запросила повторный осмотр [F] дыхания и стоп Марго после дневной активности.',
            elephantId: 'margo',
            startHour: curH,
            expireHour: curH + 2.2,
            status: 'active',
            noticed: false,
            actionDone: false,
            followUpReady: false,
            followUpDone: false,
            pointsAwarded: 0
          });
          state.eventCooldownTimer = 80;
          return;
        }

        // 8. Событие: «Одри обнаружила загрязнение зоны отдыха» (17:00 - 19:30)
        if (curH >= 17.0 && curH < 19.5 && !situationalEvents.some(e => e.type === 'sanitation_cluster')) {
          if (state.dungPiles.length >= 2) {
            startSituationalEvent({
              id: 'event_sanitation_' + Math.floor(curH),
              type: 'sanitation_cluster',
              title: 'Загрязнение зоны отдыха вольера',
              desc: 'Одри настороженно обходит скопление навоза. Требуется санитарная уборка перед сдачей смены.',
              elephantId: 'audrey',
              startHour: curH,
              expireHour: curH + 2.0,
              status: 'active',
              noticed: false,
              actionDone: false,
              followUpReady: false,
              followUpDone: false,
              pointsAwarded: 0
            });
            state.eventCooldownTimer = 85;
            return;
          }
        }
      }

export function updateSituationalEvents(dt) {
        checkAndTriggerSituationalEvents(dt);

        if (!state.activeSituationalEvent || state.activeSituationalEvent.status !== 'active') return;

        const ev = state.activeSituationalEvent;
        const curH = gameTime.hour + gameTime.minute / 60;
        const el = elephants.find(e => e.id === ev.elephantId);

        // 1. Проверка обнаружения кипером (Notice)
        if (!ev.noticed) {
          let keeperIsClose = false;
          if (el) {
            keeperIsClose = Math.hypot(player.x - el.x, player.y - el.y) < el.radius + 60;
          }
          if (ev.type === 'trough_low_thirst') {
            keeperIsClose = keeperIsClose || Math.hypot(player.x - waterTrough.valveX, player.y - waterTrough.valveY) < 70;
          } else if (ev.type === 'tool_misplaced' && state.misplacedTool) {
            keeperIsClose = keeperIsClose || Math.hypot(player.x - state.misplacedTool.x, player.y - state.misplacedTool.y) < 65;
          } else if (ev.type === 'scattered_hay' && state.scatteredHay) {
            keeperIsClose = keeperIsClose || Math.hypot(player.x - state.scatteredHay.x, player.y - state.scatteredHay.y) < 65;
          } else if (ev.type === 'feeder_crust') {
            const f = feeders.find(fd => fd.id === 'audrey');
            if (f) keeperIsClose = keeperIsClose || Math.hypot(player.x - (f.x + f.w / 2), player.y - (f.y + f.h / 2)) < 70;
          }

          if (keeperIsClose || (state.inspectingElephant && state.inspectingElephant.id === ev.elephantId)) {
            ev.noticed = true;
            stats.situationalEventsNoticed++;
            stats.totalScore += 15;
            ev.pointsAwarded += 15;
            sfx.playSuccess();
            showToast(`👁️ Ситуация «${ev.title}» замечена кипером! (+15 очк.)`, '#3498db');
            addLog(`Кипер обратил внимание на ситуацию: «${ev.title}». Требуется действие.`);
          }
        }

        // 2. Проверка действия кипера (Action Done)
        if (!ev.actionDone) {
          if (ev.type === 'trough_low_thirst') {
            if (waterTrough.water >= 70) {
              ev.actionDone = true;
              ev.followUpReady = true;
              stats.totalScore += 25;
              ev.pointsAwarded += 25;
              sfx.playSuccess();
              if (el) {
                el.statusText = 'С удовольствием пьет чистую воду';
                el.thirst = Math.max(0, el.thirst - 30);
              }
              showToast(`💧 Поилка наполнена! Проведите контрольную проверку [F] (+25 очк.)`, '#2ecc71');
              addLog(`Водный баланс восстановлен. Одри утоляет жажду. Доступна контрольная проверка.`);
            }
          } else if (ev.type === 'pretty_low_activity') {
            const myFeeder = feeders.find(f => f.id === 'pretty');
            const hasObservation = el && el.observations.some(obs => obs.hourRecorded === Math.floor(curH) && (obs.category === 'Тонус и активность' || obs.category === 'Аппетит и питание'));
            const hasFood = myFeeder && myFeeder.food >= 25;

            if (hasObservation || hasFood) {
              ev.actionDone = true;
              ev.followUpReady = true;
              stats.totalScore += 25;
              ev.pointsAwarded += 25;
              sfx.playSuccess();
              if (el) {
                el.energy = Math.min(100, el.energy + 20);
                el.statusText = 'Тонус восстановился, готова к корму';
              }
              showToast(`🥕 Претти получила внимание! Проведите контрольную проверку [F] (+25 очк.)`, '#2ecc71');
              addLog(`Кипер оказал внимание Претти. Состояние нормализовалось. Проведите повторный осмотр.`);
            }
          } else if (ev.type === 'margo_distracted') {
            const mFeeder = feeders.find(f => f.id === 'margo');
            const hasFood = mFeeder && mFeeder.food >= 25;
            const dist = el ? Math.hypot(player.x - el.x, player.y - el.y) : 999;

            if (hasFood || (dist < el.radius + 45 && (keys['Space'] || virtualKeys.action))) {
              ev.actionDone = true;
              ev.followUpReady = true;
              stats.totalScore += 20;
              ev.pointsAwarded += 20;
              sfx.playSuccess();
              if (el) {
                el.statusText = 'Охотно направляется к кормушке';
                el.targetX = mFeeder ? mFeeder.x + mFeeder.w / 2 : el.x;
                el.targetY = mFeeder ? mFeeder.y + 70 : el.y;
                el.state = 'WANDER';
              }
              showToast(`🌾 Марго вернулась к кормушке! Проведите контрольную проверку [F] (+20 очк.)`, '#2ecc71');
              addLog(`Марго вернулась к кормлению. Проведите контрольный осмотр.`);
            }
          } else if (ev.type === 'sanitation_cluster') {
            if (state.dungPiles.length <= 1) {
              ev.actionDone = true;
              ev.followUpReady = true;
              stats.totalScore += 25;
              ev.pointsAwarded += 25;
              sfx.playSuccess();
              if (el) {
                el.statusText = 'Спокойно обходит чистый вольер';
              }
              showToast(`🧹 Сектор очищен! Проведите контрольную проверку вольера (+25 очк.)`, '#2ecc71');
              addLog(`Загрязнение устранено. Одри свободно гуляет по вольеру. Доступна контрольная проверка.`);
            }
          } else if (ev.type === 'tool_misplaced') {
            if (!state.misplacedTool || !state.misplacedTool.active) {
              ev.actionDone = true;
              ev.followUpReady = true;
              if (el) el.statusText = 'Свободно гуляет по чистому проходу';
            }
          } else if (ev.type === 'scattered_hay') {
            if (!state.scatteredHay || !state.scatteredHay.active) {
              ev.actionDone = true;
              ev.followUpReady = true;
              if (el) el.statusText = 'Спокойно жуёт сено из кормушки';
            }
          } else if (ev.type === 'feeder_crust') {
            if (!state.feederCrust || !state.feederCrust.active) {
              ev.actionDone = true;
              ev.followUpReady = true;
              if (el) el.statusText = 'С аппетитом ест из чистой кормушки';
            }
          } else if (ev.type === 'vet_followup_check') {
            const hasFollowupObs = el && el.observations.some(obs => obs.hourRecorded === Math.floor(curH));
            if (hasFollowupObs) {
              ev.actionDone = true;
              ev.followUpReady = true;
              stats.totalScore += 25;
              ev.pointsAwarded += 25;
              sfx.playSuccess();
              if (el) el.statusText = 'Повторный осмотр завершен, стабильна';
              showToast(`📝 Повторный осмотр зафиксирован! Проведите контроль [F] (+25 очк.)`, '#2ecc71');
              addLog(`Повторный ветеринарный контроль ${el.name} успешно внесен в карту.`);
            }
          }
        }

        // 3. Проверка дедлайна ситуации (с защитой от вечной блокировки активного события)
        if (curH >= ev.expireHour) {
          if (!ev.actionDone) {
            ev.status = 'expired';
            state.activeSituationalEvent = null;
            if (state.misplacedTool && state.misplacedTool.active) state.misplacedTool.active = false;
            if (state.scatteredHay && state.scatteredHay.active) state.scatteredHay.active = false;
            if (state.feederCrust && state.feederCrust.active) state.feederCrust.active = false;
            addLog(`⚠️ Время реакции на ситуацию «${ev.title}» истекло. Животные справились своими силами.`);
            if (el) {
              el.statusText = 'Осматривается';
              if (ev.type === 'trough_low_thirst') el.thirst = Math.min(100, el.thirst + 20);
              if (ev.type === 'pretty_low_activity') el.energy = Math.max(15, el.energy - 15);
            }
          } else if (!ev.followUpDone) {
            // Первичное действие выполнено успешно, автозакрытие при переходе к следующему этапу дня
            ev.status = 'resolved';
            state.activeSituationalEvent = null;
            addLog(`Ситуация «${ev.title}» завершена по истечении времени окна.`);
          }
        }
      }

export function completeSituationalEventFollowUp(ev) {
        if (!ev || ev.followUpDone || !ev.followUpReady) return;

        ev.followUpDone = true;
        ev.status = 'resolved';
        stats.situationalEventsResolved++;
        stats.followUpChecksDone++;

        const bonusScore = 25;
        stats.totalScore += bonusScore;
        ev.pointsAwarded += bonusScore;

        const timeStr = `${String(gameTime.hour).padStart(2, '0')}:${String(Math.floor(gameTime.minute)).padStart(2, '0')}`;
        const el = elephants.find(e => e.id === ev.elephantId);
        if (el) {
          el.observations.unshift({
            time: timeStr,
            hourRecorded: gameTime.hour,
            category: 'Контроль ситуации',
            text: `Контрольная проверка успешна: ситуация «${ev.title}» полностью разрешена`,
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
          el.statusText = 'Состояние стабильное, ухожена';
        }

        sfx.playSuccess();
        showToast(`🔍 Контрольная проверка завершена! Ситуация закрыта (+${bonusScore} очк.)`, '#2ecc71');
        addLog(`[Контроль] Ситуация «${ev.title}» успешно закрыта и занесена в протокол (+${bonusScore} очков).`);
        state.activeSituationalEvent = null;
      }
