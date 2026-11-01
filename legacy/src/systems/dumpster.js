import { state, dumpsterState, garbageTruck, stats, elephants, player, dayNightCycle, particles, addLog, showToast } from '../gameState.js';
import { sfx } from '../sound.js';
import { ctx } from '../canvas.js';

export function updateDumpsterAndTruck(dt) {
        // 1. Таймер ожидания мусоровоза после оформления заявки
        if (dumpsterState.pickupRequested && !garbageTruck.active) {
          dumpsterState.pickupTimer -= dt;
          if (dumpsterState.pickupTimer <= 0) {
            garbageTruck.active = true;
            garbageTruck.state = 'APPROACHING';
            garbageTruck.x = 1060;
            garbageTruck.y = 88;
            garbageTruck.targetX = 880;
            garbageTruck.liftProgress = 0;
            sfx.playTruckHorn();
            addLog('🚛 Мусоровоз коммунальной службы прибыл на территорию слоновника!');
            showToast('🚛 Прибыл мусоровоз коммунальной службы!', '#3498db');
          }
        }

        // 2. Поведение и анимация мусоровоза
        if (garbageTruck.active) {
          garbageTruck.beaconAnim += dt * 6.5;

          switch (garbageTruck.state) {
            case 'APPROACHING': {
              const moveStep = garbageTruck.speed * dt;
              garbageTruck.x -= moveStep;
              if (garbageTruck.x <= garbageTruck.targetX) {
                garbageTruck.x = garbageTruck.targetX;
                garbageTruck.state = 'POSITIONED';
                garbageTruck.timer = 1.0;
                sfx.playHydraulic();
              }
              break;
            }

            case 'POSITIONED': {
              garbageTruck.timer -= dt;
              if (garbageTruck.timer <= 0) {
                garbageTruck.state = 'EMPTYING';
                garbageTruck.timer = 3.6;
                garbageTruck.liftProgress = 0;
                sfx.playHydraulic();
                addLog('🚛 Идёт механизированная выгрузка навоза из контейнера в кузов мусоровоза...');
              }
              break;
            }

            case 'EMPTYING': {
              garbageTruck.timer -= dt;
              const frac = Math.min(1, Math.max(0, 1 - (garbageTruck.timer / 3.6)));
              garbageTruck.liftProgress = frac;

              // Плавное убывание биомассы в контейнере
              dumpsterState.kg = Math.max(0, Math.round(dumpsterState.maxKg * (1 - frac)));

              // Частицы пыли и компоста в воздухе
              if (Math.random() < 0.28) {
                particles.push({
                  x: dumpsterState.x + 35 + Math.random() * 45,
                  y: dumpsterState.y + 15 + Math.random() * 20,
                  vx: -12 + (Math.random() - 0.5) * 16,
                  vy: -15 - Math.random() * 10,
                  life: 0.45,
                  maxLife: 0.45,
                  color: '#4e3629',
                  size: 2.5
                });
              }

              if (garbageTruck.timer <= 0) {
                garbageTruck.state = 'COMPLETED';
                garbageTruck.timer = 1.2;
                dumpsterState.kg = 0;
                dumpsterState.isFull = false;
                dumpsterState.warned80 = false;
                dumpsterState.pickupRequested = false;
                stats.dumpsterPickupsCompleted = (stats.dumpsterPickupsCompleted || 0) + 1;
                stats.totalScore += 60;
                sfx.playSuccess();
                sfx.playTruckHorn();
                addLog('🚛 Вывоз навоза завершён! 500 кг биомассы вывезено на переработку. Контейнер чист (+60 очков).');
                showToast('✅ Контейнер навоза очищен мусоровозом! (+60 очк.)', '#2ecc71');
              }
              break;
            }

            case 'COMPLETED': {
              garbageTruck.timer -= dt;
              garbageTruck.liftProgress = Math.max(0, garbageTruck.timer / 1.2);
              if (garbageTruck.timer <= 0) {
                garbageTruck.state = 'DEPARTING';
                garbageTruck.liftProgress = 0;
                addLog('🚛 Мусоровоз покидает территорию павильона слонов.');
              }
              break;
            }

            case 'DEPARTING': {
              garbageTruck.x += garbageTruck.speed * dt;
              if (garbageTruck.x >= 1070) {
                garbageTruck.active = false;
                garbageTruck.state = 'OFFSITE';
              }
              break;
            }
          }
        }
      }

export function renderGarbageTruck() {
        if (!garbageTruck.active) return;

        ctx.save();
        ctx.translate(garbageTruck.x, garbageTruck.y);

        // Тень под машиной
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 24, 52, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Основное шасси
        ctx.fillStyle = '#212f3d';
        ctx.fillRect(-52, 12, 104, 8);

        // 1. Кабина водителя (слева по ходу движения)
        ctx.fillStyle = '#1e8449';
        ctx.fillRect(-50, -18, 36, 32);
        ctx.fillStyle = '#145a32';
        ctx.fillRect(-50, 10, 36, 4);

        // Ветровое стекло
        ctx.fillStyle = '#85c1e9';
        ctx.fillRect(-48, -14, 18, 16);
        // Силуэт водителя
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath();
        ctx.arc(-39, -6, 5, 0, Math.PI * 2);
        ctx.fill();

        // Фары кабины (жёлтый свет)
        ctx.fillStyle = '#f7dc6f';
        ctx.fillRect(-52, 2, 4, 6);
        if (dayNightCycle.darkness > 0.1) {
          // Световой конус фар в сумерках и ночью
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const beamGrad = ctx.createRadialGradient(-52, 5, 4, -130, 5, 75);
          beamGrad.addColorStop(0, 'rgba(255, 235, 150, 0.45)');
          beamGrad.addColorStop(1, 'rgba(255, 220, 100, 0)');
          ctx.fillStyle = beamGrad;
          ctx.beginPath();
          ctx.arc(-52, 5, 75, Math.PI * 0.75, Math.PI * 1.25);
          ctx.fill();
          ctx.restore();
        }

        // Проблесковый маячок на крыше кабины
        const beaconActive = Math.sin(garbageTruck.beaconAnim) > 0;
        ctx.fillStyle = beaconActive ? '#f39c12' : '#784212';
        ctx.fillRect(-42, -24, 10, 6);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.strokeRect(-42, -24, 10, 6);
        if (beaconActive) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const beaconGrad = ctx.createRadialGradient(-37, -21, 2, -37, -21, 28);
          beaconGrad.addColorStop(0, 'rgba(243, 156, 18, 0.75)');
          beaconGrad.addColorStop(1, 'rgba(243, 156, 18, 0)');
          ctx.fillStyle = beaconGrad;
          ctx.beginPath();
          ctx.arc(-37, -21, 28, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // 2. Кузов-бункер для навоза (сзади)
        ctx.fillStyle = '#229954';
        ctx.fillRect(-14, -22, 64, 36);
        ctx.strokeStyle = '#145a32';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-14, -22, 64, 36);

        // Ребра жесткости кузова
        ctx.fillStyle = '#145a32';
        for (let rx = -6; rx < 45; rx += 12) {
          ctx.fillRect(rx, -20, 2, 32);
        }

        // Экологический символ / значок переработки ♻️
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('♻️', 18, -4);

        // 3. Механизированная гидравлическая стрела подъёма
        if (garbageTruck.liftProgress > 0) {
          ctx.save();
          ctx.strokeStyle = '#f39c12';
          ctx.lineWidth = 3;
          ctx.beginPath();
          const armLiftY = -22 - garbageTruck.liftProgress * 18;
          ctx.moveTo(-10, -10);
          ctx.lineTo(-30, armLiftY);
          ctx.stroke();

          // Опрокидываемый лоток
          ctx.fillStyle = '#7d6608';
          ctx.fillRect(-42, armLiftY - 8, 22, 14);
          ctx.restore();
        }

        // 4. Колеса грузовика (крутятся при движении)
        const wheelY = 16;
        const wheelPositions = [-36, -2, 32];
        wheelPositions.forEach((wx) => {
          ctx.fillStyle = '#17202a';
          ctx.beginPath();
          ctx.arc(wx, wheelY, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#7f8c8d';
          ctx.beginPath();
          ctx.arc(wx, wheelY, 4.5, 0, Math.PI * 2);
          ctx.fill();
          // Спицы / болты
          ctx.strokeStyle = '#17202a';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(wx - 4, wheelY);
          ctx.lineTo(wx + 4, wheelY);
          ctx.moveTo(wx, wheelY - 4);
          ctx.lineTo(wx, wheelY + 4);
          ctx.stroke();
        });

        // 5. Индикатор состояния над мусоровозом
        if (garbageTruck.state === 'EMPTYING') {
          const p = Math.round(garbageTruck.liftProgress * 100);
          ctx.fillStyle = 'rgba(15, 12, 10, 0.85)';
          ctx.fillRect(-65, -48, 130, 22);
          ctx.strokeStyle = '#f1c40f';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(-65, -48, 130, 22);

          ctx.fillStyle = '#f1c40f';
          ctx.font = 'bold 10px monospace';
          ctx.fillText(`🚛 ВЫГРУЗКА (${p}%)`, 0, -37);

          // Прогресс-бар
          ctx.fillStyle = '#222';
          ctx.fillRect(-60, -32, 120, 3);
          ctx.fillStyle = '#2ecc71';
          ctx.fillRect(-60, -32, 120 * garbageTruck.liftProgress, 3);
        } else if (garbageTruck.state === 'POSITIONED') {
          ctx.fillStyle = 'rgba(15, 12, 10, 0.82)';
          ctx.fillRect(-60, -42, 120, 16);
          ctx.strokeStyle = '#3498db';
          ctx.lineWidth = 1;
          ctx.strokeRect(-60, -42, 120, 16);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px sans-serif';
          ctx.fillText('ПОДАЧА К КОНТЕЙНЕРУ', 0, -30);
        }

        ctx.textAlign = 'left';
        ctx.restore();
      }
