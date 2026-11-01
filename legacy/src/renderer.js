import { updateTouchControlsUI } from './input.js';
import { state, waterTrough, feeders, sawdustStorage, player, wheelbarrow, elephants, particles, dayNightCycle, dumpsterState, garbageTruck, vetNPC, keeperState } from './gameState.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT, washZone, treatTable, forkRack, wheelbarrowStation, ELEPHANT_SLEEP_SPOTS } from './config.js';
import { drawInteractIcon, renderHUD, renderJournalPanel } from './ui/hud.js';
import { renderTitleScreen, renderPauseScreen, renderInspectionModal, renderUrineQTE, renderShiftTablet, renderShiftReport } from './ui/modals.js';
import { renderGarbageTruck } from './systems/dumpster.js';
import { renderVetNPC } from './systems/vet.js';
import { ctx } from './canvas.js';

export function renderFloor() {
  // 1. Верхний коридор кипера (деревянные доски)
  ctx.fillStyle = '#654321';
  ctx.fillRect(0, 0, CANVAS_WIDTH, 195);

  // Рисуем текстуру досок
  ctx.fillStyle = '#543618';
  for (let y = 10; y < 195; y += 22) {
    ctx.fillRect(0, y, CANVAS_WIDTH, 2);
  }
  ctx.fillStyle = '#7a5229';
  for (let x = 60; x < CANVAS_WIDTH; x += 110) {
    ctx.fillRect(x, 0, 2, 195);
  }

  // 2. Основная зона слоновника: единое теплое песчано-соломенное покрытие до самых стен
  // Без серых выбивающихся полос по краям!
  ctx.fillStyle = '#dfc87a';
  ctx.fillRect(20, 195, CANVAS_WIDTH - 40, CANVAS_HEIGHT - 215);

  // Естественные мягкие участки настила вокруг индивидуальных мест отдыха Одри, Марго и Претти
  // Без жестких прямоугольных рамок — гармоничные плавные круги с золотистыми соломинками
  const sleepSpots = [
    { x: ELEPHANT_SLEEP_SPOTS.audrey.x, y: ELEPHANT_SLEEP_SPOTS.audrey.y, r: 85, color: '#f7e7a5' },
    { x: ELEPHANT_SLEEP_SPOTS.margo.x, y: ELEPHANT_SLEEP_SPOTS.margo.y, r: 80, color: '#faeaae' },
    { x: ELEPHANT_SLEEP_SPOTS.pretty.x, y: ELEPHANT_SLEEP_SPOTS.pretty.y, r: 95, color: '#faeaae' }
  ];

  sleepSpots.forEach(spot => {
    ctx.fillStyle = 'rgba(252, 240, 185, 0.40)';
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, spot.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 247, 210, 0.55)';
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, spot.r * 0.65, 0, Math.PI * 2);
    ctx.fill();

    // Прорисовка мягкой золотистой соломы в зоне отдыха
    ctx.fillStyle = '#fae99e';
    for (let j = 0; j < 18; j++) {
      const bx = spot.x - spot.r * 0.65 + ((j * 37) % (spot.r * 1.3));
      const by = spot.y - spot.r * 0.65 + ((j * 53) % (spot.r * 1.3));
      ctx.fillRect(bx, by, 8, 2);
      ctx.fillRect(bx + 3, by - 2, 2, 6);
    }
  });

  // Прорисовка мелких травинок и соломинок по всему слоновнику
  ctx.fillStyle = '#d4bc6c';
  for (let i = 0; i < 95; i++) {
    const sx = 25 + ((i * 127) % (CANVAS_WIDTH - 65));
    const sy = 205 + ((i * 331) % (CANVAS_HEIGHT - 235));
    ctx.fillRect(sx, sy, 6, 2);
    ctx.fillRect(sx + 2, sy - 2, 2, 5);
  }
}

export function renderEnvironmentObjects() {
        // --- 1. Склад сена (тюки) ---
        ctx.fillStyle = '#3e2717';
        ctx.fillRect(35, 55, 90, 70);
        // Тюки сена
        ctx.fillStyle = '#e6c86e';
        ctx.fillRect(40, 60, 38, 28);
        ctx.fillRect(82, 60, 38, 28);
        ctx.fillRect(58, 92, 42, 28);
        // Веревки на тюках
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(52, 60, 3, 28);
        ctx.fillRect(94, 60, 3, 28);
        ctx.fillRect(72, 92, 3, 28);

        // UX-рефакторинг: постоянная подпись убрана; подсказка появляется
        // только когда кипер в радиусе взаимодействия (см. getKeeperContextAction).
        if (Math.hypot(player.x - 80, player.y - 90) < 65) drawInteractIcon(80, 44);

        // --- 2. Склад каши и сочных овощей ---
        ctx.fillStyle = '#3e2717';
        ctx.fillRect(145, 55, 90, 70);
        // Тазы с кашей
        ctx.fillStyle = '#3a6b88';
        ctx.beginPath();
        ctx.arc(170, 80, 18, 0, Math.PI * 2);
        ctx.arc(210, 100, 16, 0, Math.PI * 2);
        ctx.fill();
        // Каша внутри
        ctx.fillStyle = '#d89b4b';
        ctx.beginPath();
        ctx.arc(170, 80, 14, 0, Math.PI * 2);
        ctx.arc(210, 100, 12, 0, Math.PI * 2);
        ctx.fill();
        // Морковки
        ctx.fillStyle = '#e86a24';
        ctx.fillRect(166, 75, 8, 3);
        ctx.fillRect(206, 96, 7, 3);

        // UX-рефакторинг: постоянная подпись убрана, только иконка в радиусе действия.
        if (Math.hypot(player.x - 190, player.y - 90) < 65) drawInteractIcon(190, 48);

        // --- 3. Стол зоны отдыха кипера ---
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(300, 65, 100, 65);
        ctx.fillStyle = '#7a4e2d';
        ctx.fillRect(304, 69, 92, 57);
        // Журнал дежурств на столе
        ctx.fillStyle = '#f5f0db';
        ctx.fillRect(315, 78, 26, 32);
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(320, 84, 16, 2);
        ctx.fillRect(320, 90, 16, 2);
        ctx.fillRect(320, 96, 12, 2);
        // Настольная лампа
        ctx.fillStyle = '#27ae60';
        ctx.beginPath();
        ctx.arc(375, 85, 10, 0, Math.PI * 2);
        ctx.fill();
        // Кружка чая
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(355, 100, 10, 12);

        // --- 3А. Стойка лабораторных ведер для анализов ---
        ctx.fillStyle = '#422817';
        ctx.fillRect(735, 60, 68, 65);
        ctx.fillStyle = '#654022';
        ctx.fillRect(738, 63, 62, 59);
        // Полки стойки
        ctx.fillStyle = '#311a0c';
        ctx.fillRect(735, 92, 68, 4);

        // Ведра на стойке (если кипер не взял ведро - оба на полках; если взял - одно отсутствует)
        const bucketsOnRack = player.carrying === 'bucket' ? 1 : 2;
        for (let bi = 0; bi < bucketsOnRack; bi++) {
          const bx = 750 + bi * 24;
          const by = 80;
          // Корпус ведра (серебристо-голубой металл)
          ctx.fillStyle = '#a6b8c7';
          ctx.beginPath();
          ctx.moveTo(bx - 6, by - 7);
          ctx.lineTo(bx + 6, by - 7);
          ctx.lineTo(bx + 4.5, by + 7);
          ctx.lineTo(bx - 4.5, by + 7);
          ctx.closePath();
          ctx.fill();
          // Ободок и ручка
          ctx.strokeStyle = '#2980b9';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          // Синяя полоса лаборатории
          ctx.fillStyle = '#3498db';
          ctx.fillRect(bx - 5, by - 2, 10, 3);
        }

        // UX-рефакторинг: постоянная подпись «СТОЙКА [SPACE]» убрана.
        // Иконка взаимодействия появляется только в радиусе действия;
        // текстовая подсказка — тоже только рядом со стойкой.
        const distToRack = Math.hypot(player.x - 768, player.y - 120);
        if (distToRack < 55) {
          drawInteractIcon(768, 96);
          ctx.fillStyle = player.carrying === 'bucket' ? '#f39c12' : (player.carrying === 'none' ? '#3498db' : '#e74c3c');
          ctx.font = 'bold 10px monospace';
          const rackHint = player.carrying === 'bucket' ? 'ВЕРНУТЬ [SPACE]' : (player.carrying === 'none' ? 'ВЗЯТЬ [SPACE]' : 'РУКИ ЗАНЯТЫ');
          ctx.fillText(rackHint, 730, 142);
        }

        // --- 4. Контейнер утилизации навоза (500 кг с индикатором заполнения) ---
        ctx.fillStyle = '#1e4d2b';
        ctx.fillRect(825, 55, 130, 65);
        ctx.fillStyle = '#2a693b';
        ctx.fillRect(829, 59, 122, 57);
        // Ребра жесткости контейнера
        ctx.fillStyle = '#163820';
        for (let rx = 848; rx < 945; rx += 24) {
          ctx.fillRect(rx, 59, 3, 57);
        }

        // Визуальная шкала заполнения контейнера (0..500 кг)
        const dumpPct = Math.min(100, Math.round((dumpsterState.kg / dumpsterState.maxKg) * 100));
        const barW = 110;
        const barH = 7;
        const bx = 835;
        const by = 104;

        ctx.fillStyle = '#0f2415';
        ctx.fillRect(bx, by, barW, barH);
        ctx.strokeStyle = '#396d47';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, barW, barH);

        // Цвет индикатора: зеленый <60%, желтый 60-79%, оранжевый 80-99%, мигающий красный 100%
        let dumpColor = '#2ecc71';
        if (dumpPct >= 100) {
          dumpColor = Math.sin(state.worldAnimTime * 8) > 0 ? '#e74c3c' : '#c0392b';
        } else if (dumpPct >= 80) {
          dumpColor = '#e67e22';
        } else if (dumpPct >= 60) {
          dumpColor = '#f1c40f';
        }

        const fillWidth = Math.max(0, Math.min(barW, (dumpsterState.kg / dumpsterState.maxKg) * barW));
        ctx.fillStyle = dumpColor;
        ctx.fillRect(bx, by, fillWidth, barH);

        // Текстовая плашка над шкалой прямо на корпусе контейнера
        ctx.font = 'bold 8.5px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(`УТИЛЬ: ${Math.round(dumpsterState.kg)}/500 кг (${dumpPct}%)`, bx, by - 3);

        // Предупреждающий флаг при заполнении >=80%
        if (dumpPct >= 100) {
          ctx.fillStyle = '#e74c3c';
          ctx.fillRect(bx, 62, barW, 13);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          const alertMsg = garbageTruck.active ? '🚛 МУСОРОВОЗ НА МЕСТЕ' : '🚨 ПЕРЕПОЛНЕН! ВЫЗОВ В ПУТИ';
          ctx.fillText(alertMsg, bx + barW / 2, 72);
          ctx.textAlign = 'left';
        } else if (dumpPct >= 80) {
          ctx.fillStyle = '#e67e22';
          ctx.fillRect(bx, 62, barW, 12);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('⚠️ ЗАПОЛНЕН НА 80%', bx + barW / 2, 71);
          ctx.textAlign = 'left';
        }

        const nearDumpster = player.x >= 780 && player.x <= 975 && player.y >= 50 && player.y <= 175;
        if (nearDumpster) {
          drawInteractIcon(885, 115);
          ctx.font = 'bold 10px monospace';
          if (dumpsterState.kg >= dumpsterState.maxKg) {
            ctx.fillStyle = '#e74c3c';
            ctx.fillText('⛔ БАК ПЕРЕПОЛНЕН (500 кг)', 805, 150);
          } else if (player.wheelbarrowKg > 0) {
            ctx.fillStyle = '#2ecc71';
            ctx.fillText(`ВЫГРУЗИТЬ (${player.wheelbarrowKg} кг) [SPACE]`, 810, 150);
          } else {
            ctx.fillStyle = '#bbb';
            ctx.fillText('ТАЧКА ПУСТА', 855, 150);
          }
        }

        // --- 5. Поилка для слонов внизу с водяным вентилем ---
        // Бетонная чаша поилки (координаты waterTrough)
        ctx.fillStyle = '#474747';
        ctx.fillRect(waterTrough.x, waterTrough.y, waterTrough.w, waterTrough.h);
        ctx.fillStyle = '#5c5c5c';
        ctx.fillRect(waterTrough.x + 3, waterTrough.y + 3, waterTrough.w - 6, waterTrough.h - 6);

        // Внутреннее дно поилки (сухое дно при отсутствии воды)
        ctx.fillStyle = '#383533';
        ctx.fillRect(waterTrough.x + 6, waterTrough.y + 6, waterTrough.w - 12, waterTrough.h - 12);

        // Вода внутри (уровень зависит от waterTrough.water 0..100%)
        const waterHeight = ((waterTrough.h - 14) * Math.max(0, Math.min(100, waterTrough.water))) / 100;
        if (waterHeight > 0) {
          const waterY = waterTrough.y + waterTrough.h - 7 - waterHeight;
          ctx.fillStyle = waterTrough.water > 30 ? '#2980b9' : '#1f5377';
          ctx.fillRect(waterTrough.x + 7, waterY, waterTrough.w - 14, waterHeight);

          // Светлая верхняя кромка воды
          ctx.fillStyle = '#5dade2';
          ctx.fillRect(waterTrough.x + 7, waterY, waterTrough.w - 14, 2.5);

          // Блики и волны
          ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
          const wave = Math.sin(state.worldAnimTime * 3.5) * 5;
          ctx.fillRect(waterTrough.x + 12 + wave, waterY + 4, 22, 2);
          ctx.fillRect(waterTrough.x + 42 - wave, waterY + 12, 18, 2);
        }

        // Водопроводная труба и вентиль слева от поилки
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(waterTrough.valveX - 4, waterTrough.y + 12, 8, 42); // Вертикальная труба
        ctx.fillRect(waterTrough.valveX - 4, waterTrough.y + 24, 20, 7); // Излив трубы в поилку

        // Красный вентиль подачи воды (маховик)
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.arc(waterTrough.valveX, waterTrough.valveY, 8.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(waterTrough.valveX - 6, waterTrough.valveY - 1.5, 12, 3);
        ctx.fillRect(waterTrough.valveX - 1.5, waterTrough.valveY - 6, 3, 12);

        // Струя воды при пополнении
        if (waterTrough.isRefilling) {
          ctx.strokeStyle = '#68c5ff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(waterTrough.valveX + 16, waterTrough.y + 27);
          ctx.quadraticCurveTo(waterTrough.x + 20, waterTrough.y + 20, waterTrough.x + 35, waterTrough.y + 35);
          ctx.stroke();
        }

        // Индикатор уровня воды и подсказка управления для кипера
        const distToValve = Math.hypot(player.x - waterTrough.valveX, player.y - waterTrough.valveY);
        const nearWaterZone = distToValve < 60 || (player.x >= 420 && player.x <= 560 && player.y >= 540 && player.y <= 650);

        // UX-рефакторинг: постоянный процент поилки с поля убран (доступен в
        // журнале тревог и при приближении). Рядом с кипером — компактная
        // полоска уровня воды вместо длинной надписи.
        if (nearWaterZone) {
          drawInteractIcon(waterTrough.valveX, waterTrough.valveY - 26);
          if (waterTrough.isRefilling) {
            ctx.fillStyle = '#3498db';
            ctx.font = 'bold 11px monospace';
            ctx.fillText(`💧 НАПОЛНЕНИЕ: ${Math.round(waterTrough.water)}%`, waterTrough.x - 25, waterTrough.y - 12);
          } else if (waterTrough.water >= 100) {
            ctx.fillStyle = '#2ecc71';
            ctx.font = 'bold 10px monospace';
            ctx.fillText('💧 100%', waterTrough.x - 8, waterTrough.y - 12);
          } else {
            ctx.fillStyle = '#f39c12';
            ctx.font = 'bold 10px monospace';
            ctx.fillText('💧 ДЕРЖАТЬ SPACE', waterTrough.x - 32, waterTrough.y - 12);
            // Компактная полоска уровня воды
            ctx.fillStyle = '#120e0c';
            ctx.fillRect(waterTrough.x - 32, waterTrough.y - 8, 64, 5);
            ctx.fillStyle = waterTrough.water < 30 ? '#e74c3c' : '#3498db';
            ctx.fillRect(waterTrough.x - 31, waterTrough.y - 7, 62 * Math.max(0, waterTrough.water) / 100, 3);
          }
        } else if (waterTrough.water <= 15) {
          // Вне радиуса остаётся только минимальный критический маркер —
          // он не текст-подпись на поле, а маленький значок у самой поилки.
          ctx.fillStyle = '#e74c3c';
          ctx.beginPath();
          ctx.arc(waterTrough.x + 44, waterTrough.y - 8, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // --- 6. Бревно-чесалка и предмет обогащения среды для слоних (Этап 10) ---
        ctx.fillStyle = '#5c3a21';
        ctx.beginPath();
        ctx.arc(280, 460, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7a4e2d';
        ctx.beginPath();
        ctx.arc(280, 460, 11, 0, Math.PI * 2);
        ctx.fill();
        // Джутовая обмотка для чесания
        ctx.strokeStyle = '#c2a677';
        ctx.lineWidth = 3;
        ctx.stroke();
        // Подвешенное канатное кольцо обогащения
        ctx.strokeStyle = '#8b6f47';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(280, 477, 8, 0, Math.PI * 2);
        ctx.stroke();
      }

export function renderFeeders() {
        feeders.forEach(f => {
          // Корпус кормушки (деревянно-металлический лоток)
          ctx.fillStyle = '#4a3319';
          ctx.fillRect(f.x, f.y, f.w, f.h);
          ctx.fillStyle = '#694925';
          ctx.fillRect(f.x + 3, f.y + 3, f.w - 6, f.h - 6);

          // Сено/еда внутри кормушки
          if (f.food > 0) {
            const foodH = (f.h - 8) * (f.food / f.maxFood);
            ctx.fillStyle = '#d4b34e';
            ctx.fillRect(f.x + 5, f.y + f.h - 4 - foodH, f.w - 10, foodH);
            // Фрагменты овощей
            ctx.fillStyle = '#e67e22';
            ctx.fillRect(f.x + 12, f.y + f.h - 12, 6, 4);
            ctx.fillRect(f.x + 40, f.y + f.h - 16, 7, 5);
          }

          // Решетка кормушки
          ctx.fillStyle = '#2b2b2b';
          for (let gx = f.x + 12; gx < f.x + f.w; gx += 16) {
            ctx.fillRect(gx, f.y, 3, f.h);
          }

          // UX-рефакторинг: постоянный текст названия и процента убран с игрового поля.
          // Уровень корма виден визуально по высоте сена в лотке; подсказка и точный процент
          // появляются только при приближении дежурного к кормушке.
          const distToFeeder = Math.hypot(player.x - (f.x + f.w / 2), player.y - (f.y + f.h / 2));
          if (distToFeeder < 65) {
            drawInteractIcon(f.x + f.w / 2, f.y - 20);
            ctx.fillStyle = '#f5eedb';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            if (player.carrying === 'hay' || player.carrying === 'mash') {
              ctx.fillText(`ПОПОЛНИТЬ [SPACE] (${Math.round(f.food)}%)`, f.x + f.w / 2, f.y - 6);
            } else {
              ctx.fillText(`${f.name}: ${Math.round(f.food)}%`, f.x + f.w / 2, f.y - 6);
            }
            ctx.textAlign = 'left';
          }
        });
      }

export function renderWetSpots() {
        for (const w of state.wetSpots) {
          const frac = Math.max(0.15, Math.min(1, w.amount / (w.maxAmount || 14)));
          ctx.save();
          ctx.translate(w.x, w.y);

          if (w.state === 'absorbed') {
            // --- СОСТОЯНИЕ 3: ВПИТАВШИЕ ОПИЛКИ (ТЕМНАЯ ВЛАЖНАЯ НАСЫПЬ) ---
            // Тень и влажный ореол основания
            ctx.fillStyle = 'rgba(40, 26, 12, 0.35)';
            ctx.beginPath();
            ctx.ellipse(0, 3, w.r * 0.95, w.r * 0.58, 0, 0, Math.PI * 2);
            ctx.fill();

            // Внешнее кольцо влажных опилок
            ctx.fillStyle = '#9b7642';
            ctx.beginPath();
            ctx.ellipse(0, 0, w.r * 0.88, w.r * 0.52, 0.1, 0, Math.PI * 2);
            ctx.fill();

            // Основная масса пропитанных мочой опилок (потемневший насыщенный древесный бугор)
            ctx.fillStyle = '#6e4f25';
            ctx.beginPath();
            ctx.ellipse(-2, -1, w.r * 0.68, w.r * 0.40, -0.15, 0, Math.PI * 2);
            ctx.ellipse(3, 1, w.r * 0.55, w.r * 0.35, 0.2, 0, Math.PI * 2);
            ctx.fill();

            // Верхний гребень насыпи
            ctx.fillStyle = '#543b19';
            ctx.beginPath();
            ctx.ellipse(0, -2, w.r * 0.42, w.r * 0.24, 0, 0, Math.PI * 2);
            ctx.fill();

            // Текстурные стружки и древесные волокна
            ctx.fillStyle = '#cbb07a';
            const seed = (w.id * 17) % 100;
            for (let i = 0; i < 9; i++) {
              const ang = ((seed + i * 37) % 360) * Math.PI / 180;
              const dist = (0.25 + ((seed + i * 23) % 50) / 100) * w.r * 0.7;
              const ox = Math.cos(ang) * dist;
              const oy = Math.sin(ang) * dist * 0.55;
              ctx.fillRect(ox, oy, 2.5, 1.5);
            }
            ctx.fillStyle = '#3a240c';
            for (let i = 0; i < 5; i++) {
              const ang = ((seed + i * 49 + 15) % 360) * Math.PI / 180;
              const dist = (0.2 + ((seed + i * 19) % 40) / 100) * w.r * 0.6;
              ctx.fillRect(Math.cos(ang) * dist, Math.sin(ang) * dist * 0.5, 2, 1);
            }

            // Компактный бейдж над насыпью
            ctx.fillStyle = 'rgba(28, 20, 14, 0.85)';
            ctx.beginPath();
            ctx.roundRect(-28, -w.r * 0.6 - 12, 56, 14, 4);
            ctx.fill();
            ctx.strokeStyle = '#cbb07a';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#f5eedb';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('🪵 ВПИТАНО', 0, -w.r * 0.6 - 2);
            ctx.textAlign = 'left';

          } else {
            // --- СОСТОЯНИЕ 1 & 2: ЖИДКАЯ ЯНТАРНАЯ ЛУЖА МОЧИ (ИЛИ ПРОЦЕСС ВПИТЫВАНИЯ) ---
            // Темное влажное пятно под лужей на настиле
            ctx.fillStyle = `rgba(80, 55, 20, ${0.30 + 0.25 * frac})`;
            ctx.beginPath();
            ctx.ellipse(0, 2, w.r * 1.05, w.r * 0.64, 0.1, 0, Math.PI * 2);
            ctx.fill();

            // Основное янтарно-желтое тело лужи мочи (органическая форма по вариантам)
            const v = w.variant || 0;
            ctx.fillStyle = `rgba(212, 155, 38, ${0.65 + 0.20 * frac})`;
            ctx.beginPath();
            if (v === 1) {
              ctx.ellipse(-w.r * 0.15, -w.r * 0.05, w.r * 0.75, w.r * 0.48, -0.2, 0, Math.PI * 2);
              ctx.ellipse(w.r * 0.25, w.r * 0.1, w.r * 0.60, w.r * 0.40, 0.35, 0, Math.PI * 2);
            } else if (v === 2) {
              ctx.ellipse(0, 0, w.r * 0.85, w.r * 0.55, 0.05, 0, Math.PI * 2);
              ctx.ellipse(-w.r * 0.3, w.r * 0.12, w.r * 0.45, w.r * 0.32, -0.4, 0, Math.PI * 2);
              ctx.ellipse(w.r * 0.35, -w.r * 0.08, w.r * 0.40, w.r * 0.28, 0.3, 0, Math.PI * 2);
            } else {
              ctx.ellipse(0, 0, w.r * 0.90, w.r * 0.52, 0.15, 0, Math.PI * 2);
              ctx.ellipse(-w.r * 0.2, w.r * 0.08, w.r * 0.50, w.r * 0.30, -0.25, 0, Math.PI * 2);
            }
            ctx.fill();

            // Более темное янтарное ядро жидкости (глубина)
            ctx.fillStyle = `rgba(170, 110, 18, ${0.45 + 0.25 * frac})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, w.r * 0.55, w.r * 0.32, 0.1, 0, Math.PI * 2);
            ctx.fill();

            // Глянцевый блик на поверхности жидкости
            ctx.strokeStyle = 'rgba(255, 245, 205, 0.65)';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.ellipse(0, -w.r * 0.12, w.r * 0.62, w.r * 0.30, 0.15, 0.7, 2.1);
            ctx.stroke();

            // Если лужа частично засыпана опилками (state === 'absorbing' или sawdustApplied > 0)
            if (w.sawdustApplied > 0) {
              const absorbRatio = Math.min(1, w.sawdustApplied / w.sawdustNeeded);
              ctx.fillStyle = 'rgba(218, 178, 118, 0.85)';
              ctx.beginPath();
              ctx.ellipse(0, 0, w.r * (0.4 + 0.5 * absorbRatio), w.r * 0.55 * (0.4 + 0.5 * absorbRatio), 0, 0, Math.PI * 2);
              ctx.fill();

              // Стружка поверх засыпанной области
              ctx.fillStyle = '#5c3a17';
              for (let i = 0; i < 7; i++) {
                const ox = (Math.sin(w.id * 11 + i * 3) * w.r * 0.4);
                const oy = (Math.cos(w.id * 7 + i * 5) * w.r * 0.22);
                ctx.fillRect(ox, oy, 2.5, 1.5);
              }
            }
          }
          ctx.restore();

          // Интерактивные подсказки киперу при приближении
          const dist = Math.hypot(player.x - w.x, player.y - w.y);
          if (dist < w.r + 42) {
            ctx.textAlign = 'center';

            if (w.state === 'absorbed') {
              // Впитавшие опилки: убираются вилами в тачку
              if (player.wheelbarrowKg >= player.wheelbarrowMaxKg) {
                ctx.fillStyle = '#e74c3c';
                ctx.font = 'bold 10px monospace';
                ctx.fillText('⚠️ ТАЧКА ПОЛНА (60 кг)', w.x, w.y - w.r * 0.8);
              } else if (player.hasPitchfork) {
                drawInteractIcon(w.x, w.y - w.r * 0.85);
                ctx.fillStyle = '#7bed9f';
                ctx.font = 'bold 10px monospace';
                ctx.fillText('УБРАТЬ ВИЛАМИ [SPACE]', w.x, w.y - w.r * 0.68);

                // Круговой индикатор прогресса уборки вилами
                if (player.forkProgress > 0) {
                  ctx.strokeStyle = '#2ed573';
                  ctx.lineWidth = 4;
                  ctx.beginPath();
                  ctx.arc(w.x, w.y, w.r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * player.forkProgress);
                  ctx.stroke();
                }
              } else {
                ctx.fillStyle = '#f1c40f';
                ctx.font = 'bold 10px monospace';
                ctx.fillText('🛠️ НУЖНЫ ВИЛЫ (СТОЙКА У ВХОДА)', w.x, w.y - w.r * 0.7);
              }

            } else {
              // Жидкая лужа: приоритет засыпать опилками, альтернатива — вилы
              if (player.sawdustStock > 0) {
                drawInteractIcon(w.x, w.y - w.r * 0.85);
                ctx.fillStyle = '#ffd166';
                ctx.font = 'bold 10px monospace';
                const applied = w.sawdustApplied || 0;
                const needed = w.sawdustNeeded || 2;
                ctx.fillText(`ЗАСЫПАТЬ ОПИЛКАМИ [SPACE] (${applied}/${needed})`, w.x, w.y - w.r * 0.68);

                // Круговой индикатор засыпки опилками
                if (w.pourProgress > 0) {
                  ctx.strokeStyle = '#f39c12';
                  ctx.lineWidth = 4;
                  ctx.beginPath();
                  ctx.arc(w.x, w.y, w.r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * w.pourProgress);
                  ctx.stroke();
                }
              } else if (player.hasPitchfork) {
                if (player.wheelbarrowKg >= player.wheelbarrowMaxKg) {
                  ctx.fillStyle = '#e74c3c';
                  ctx.font = 'bold 10px monospace';
                  ctx.fillText('⚠️ ТАЧКА ПОЛНА (60 кг)', w.x, w.y - w.r * 0.8);
                } else {
                  drawInteractIcon(w.x, w.y - w.r * 0.85);
                  ctx.fillStyle = '#7fd0ff';
                  ctx.font = 'bold 10px monospace';
                  ctx.fillText(`УБРАТЬ ВИЛАМИ [SPACE] · ${Math.round(w.amount)} кг`, w.x, w.y - w.r * 0.68);

                  if (player.forkProgress > 0) {
                    ctx.strokeStyle = '#3498db';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(w.x, w.y, w.r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * player.forkProgress);
                    ctx.stroke();
                  }
                }
              } else {
                ctx.fillStyle = '#f1c40f';
                ctx.font = 'bold 10px monospace';
                ctx.fillText('🪵 НУЖНЫ ОПИЛКИ ИЛИ ВИЛЫ', w.x, w.y - w.r * 0.7);
              }
            }
            ctx.textAlign = 'left';
          }
        }
      }

export function renderCareStations() {
        // --- Зона мойки (юго-западный угол): мокрый бетонный круг со сливом ---
        ctx.save();
        ctx.fillStyle = 'rgba(52, 152, 219, 0.16)';
        ctx.beginPath();
        ctx.arc(washZone.x, washZone.y, washZone.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(washZone.x, washZone.y, washZone.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // Штанга с душевой лейкой над зоной
        ctx.strokeStyle = '#7f8c8d';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(washZone.x - washZone.r + 8, washZone.y - washZone.r - 6);
        ctx.lineTo(washZone.x - washZone.r + 8, washZone.y - washZone.r - 46);
        ctx.lineTo(washZone.x - 10, washZone.y - washZone.r - 46);
        ctx.stroke();
        ctx.fillStyle = '#95a5a6';
        ctx.beginPath();
        ctx.arc(washZone.x - 10, washZone.y - washZone.r - 40, 7, 0, Math.PI * 2);
        ctx.fill();
        // Капли воды из лейки (анимация по state.worldAnimTime — замирает на паузе)
        ctx.fillStyle = 'rgba(104, 197, 255, 0.7)';
        for (let i = 0; i < 5; i++) {
          const dropY = ((state.worldAnimTime * 40 + i * 17) % 60);
          ctx.beginPath();
          ctx.arc(washZone.x - 16 + i * 3.5, washZone.y - washZone.r - 33 + dropY, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        // UX-рефакторинг: постоянная текстовая подпись «ЗОНА МОЙКИ» убрана —
        // синяя пунктирная зона и лейка читаются визуально; значок мойки и
        // короткая подсказка появляются только при подведении грязного слона.
        const washEl = elephants.find(e => Math.hypot(e.x - washZone.x, e.y - washZone.y) < washZone.r && e.footDirt >= 25);
        if (washEl && player.carrying === 'none' && !player.isShoveling && !player.isDoingPedicure && !keeperState.washingElephant) {
          drawInteractIcon(washZone.x, washZone.y - washZone.r - 8);
          ctx.fillStyle = '#bfe3ff';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('🚿 ДЕРЖАТЬ [SPACE]', washZone.x, washZone.y + 6);
          ctx.textAlign = 'left';
        }
        ctx.restore();

        // Активная мойка — кольцо прогресса вокруг промываемой слонихи
        if (keeperState.washingElephant) {
          const wel = keeperState.washingElephant;
          ctx.strokeStyle = '#3498db';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(wel.x, wel.y, wel.radius + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * keeperState.washProgress);
          ctx.stroke();
          ctx.textAlign = 'center';
          ctx.fillStyle = '#7fd0ff';
          ctx.font = 'bold 10px monospace';
          ctx.fillText(`МОЙКА ${Math.round(keeperState.washProgress * 100)}% — ДЕРЖИТЕ [SPACE]`, wel.x, wel.y - wel.radius - 44);
          ctx.textAlign = 'left';
        }

        // --- Стол с лакомствами (в коридоре дежурного) ---
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(treatTable.x - 26, treatTable.y - 14, 52, 28);
        ctx.strokeStyle = '#5d3a1a';
        ctx.lineWidth = 2;
        ctx.strokeRect(treatTable.x - 26, treatTable.y - 14, 52, 28);
        // Бананы по числу запаса на столе
        for (let i = 0; i < keeperState.treatsStock; i++) {
          ctx.fillStyle = '#f5d76e';
          ctx.beginPath();
          ctx.ellipse(treatTable.x - 12 + i * 12, treatTable.y - 2, 6, 3.4, -0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#c8a412';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        // UX-рефакторинг: постоянная подпись «СТОЛ ЛАКОМСТВ [SPACE]» убрана —
        // только бананы на столе; подсказка появляется в радиусе действия.
        if (Math.hypot(player.x - treatTable.x, player.y - treatTable.y) < 55 &&
            !player.isShoveling && !player.isDoingPedicure && !player.isWashing) {
          drawInteractIcon(treatTable.x, treatTable.y - 26);
          ctx.fillStyle = '#f5d76e';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(player.carrying === 'treat' ? 'ВЕРНУТЬ [SPACE]' : (keeperState.treatsStock > 0 && player.carrying === 'none' ? 'ВЗЯТЬ [SPACE]' : ''), treatTable.x, treatTable.y + 26);
          ctx.textAlign = 'left';
        }

        // --- Стойка садового инвентаря (вилы) ---
        ctx.strokeStyle = '#5d4a2f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(forkRack.x - 12, forkRack.y + 14);
        ctx.lineTo(forkRack.x - 12, forkRack.y - 22);
        ctx.lineTo(forkRack.x + 12, forkRack.y - 22);
        ctx.lineTo(forkRack.x + 12, forkRack.y + 14);
        ctx.stroke();
        if (!player.hasPitchfork) {
          // Вилы на месте — рисуем древко с рожками
          ctx.strokeStyle = '#8b5a2b';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(forkRack.x, forkRack.y + 10);
          ctx.lineTo(forkRack.x, forkRack.y - 18);
          ctx.stroke();
          ctx.strokeStyle = '#95a5a6';
          ctx.lineWidth = 2;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(forkRack.x + i * 4, forkRack.y - 18);
            ctx.lineTo(forkRack.x + i * 4, forkRack.y - 28);
            ctx.stroke();
          }
        }
        // UX-рефакторинг: постоянная подпись стойки вил убрана; иконка и
        // короткая подсказка — только в радиусе взаимодействия.
        if (Math.hypot(player.x - forkRack.x, player.y - forkRack.y) < 55 &&
            !player.isShoveling && !player.isDoingPedicure && !player.isWashing) {
          drawInteractIcon(forkRack.x, forkRack.y - 38);
          ctx.fillStyle = '#cbb894';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(player.hasPitchfork ? 'ВИЛЫ У ВАС · ВЕРНУТЬ [SPACE]' : 'ВЗЯТЬ ВИЛЫ [SPACE]', forkRack.x, forkRack.y + 30);
          ctx.textAlign = 'left';
        } else if (player.hasPitchfork) {
          // Вне радиуса ничего не рисуем: статус «вилы у вас» виден по
          // иконке инструмента над головой кипера (renderPlayer).
        }

        // --- Склад чистых опилок (коридор персонала: x: 242, y: 55, w: 48, h: 58) ---
        // Деревянный ларь-накопитель и холщовые мешки со стружкой
        ctx.save();
        // Тень ларя на полу
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.fillRect(sawdustStorage.x - 3, sawdustStorage.y + sawdustStorage.h - 5, sawdustStorage.w + 6, 9);

        // Холщовый мешок с опилками, прислоненный сбоку
        ctx.fillStyle = '#9e7e56';
        ctx.beginPath();
        ctx.ellipse(sawdustStorage.x - 5, sawdustStorage.y + sawdustStorage.h - 16, 9, 15, -0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7a5e3c';
        ctx.fillRect(sawdustStorage.x - 7, sawdustStorage.y + sawdustStorage.h - 26, 4, 3);
        // Стружка, выступающая из горловины мешка
        ctx.fillStyle = '#fae1a7';
        ctx.fillRect(sawdustStorage.x - 8, sawdustStorage.y + sawdustStorage.h - 29, 6, 4);

        // Деревянный короб (ларь)
        ctx.fillStyle = '#634423';
        ctx.fillRect(sawdustStorage.x, sawdustStorage.y, sawdustStorage.w, sawdustStorage.h);

        // Горизонтальные деревянные планки ларя
        ctx.fillStyle = '#78532c';
        for (let py = sawdustStorage.y + 12; py < sawdustStorage.y + sawdustStorage.h - 4; py += 14) {
          ctx.fillRect(sawdustStorage.x + 2, py, sawdustStorage.w - 4, 11);
        }

        // Металлическая оковка углов
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(sawdustStorage.x, sawdustStorage.y, 4, sawdustStorage.h);
        ctx.fillRect(sawdustStorage.x + sawdustStorage.w - 4, sawdustStorage.y, 4, sawdustStorage.h);
        ctx.fillRect(sawdustStorage.x, sawdustStorage.y + sawdustStorage.h - 4, sawdustStorage.w, 4);

        // Шапка чистых золотистых опилок внутри открытого ларя
        if (sawdustStorage.stock > 0) {
          const fillRatio = Math.max(0.3, sawdustStorage.stock / sawdustStorage.maxStock);
          ctx.fillStyle = '#f3dd9b';
          ctx.beginPath();
          ctx.ellipse(sawdustStorage.x + sawdustStorage.w / 2, sawdustStorage.y + 7, (sawdustStorage.w - 8) / 2 * fillRatio, 6 * fillRatio, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#dfbe75';
          ctx.fillRect(sawdustStorage.x + 10, sawdustStorage.y + 4, sawdustStorage.w - 20, 4);
        }

        // Табличка на ларе
        ctx.fillStyle = '#1c1b18';
        ctx.fillRect(sawdustStorage.x + 4, sawdustStorage.y + 16, sawdustStorage.w - 8, 14);
        ctx.strokeStyle = '#dfbe75';
        ctx.lineWidth = 1;
        ctx.strokeRect(sawdustStorage.x + 4, sawdustStorage.y + 16, sawdustStorage.w - 8, 14);
        ctx.fillStyle = '#f5eedb';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🪵 ОПИЛКИ', sawdustStorage.x + sawdustStorage.w / 2, sawdustStorage.y + 26);

        // Индикатор остатка на складе
        ctx.fillStyle = sawdustStorage.stock <= 5 ? '#e74c3c' : (sawdustStorage.stock <= 15 ? '#f39c12' : '#2ecc71');
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`${sawdustStorage.stock}/${sawdustStorage.maxStock}`, sawdustStorage.x + sawdustStorage.w / 2, sawdustStorage.y + 46);
        ctx.restore();

        // Подсказка при приближении кипера
        const distToSawdust = Math.hypot(
          player.x - (sawdustStorage.x + sawdustStorage.w / 2),
          player.y - (sawdustStorage.y + sawdustStorage.h / 2)
        );
        if (distToSawdust < 58 && !player.isShoveling && !player.isDoingPedicure && !player.isWashing) {
          drawInteractIcon(sawdustStorage.x + sawdustStorage.w / 2, sawdustStorage.y - 14);
          ctx.font = 'bold 9.5px monospace';
          ctx.textAlign = 'center';
          if (sawdustStorage.stock === 0) {
            ctx.fillStyle = '#e74c3c';
            ctx.fillText('⚠️ ЗАПАС ОПИЛОК ИСЧЕРПАН (0/30)', sawdustStorage.x + sawdustStorage.w / 2, sawdustStorage.y + sawdustStorage.h + 15);
          } else if (player.sawdustStock >= player.sawdustMaxStock) {
            ctx.fillStyle = '#f1c40f';
            ctx.fillText(`СУМКА ПОЛНА (${player.sawdustStock}/${player.sawdustMaxStock})`, sawdustStorage.x + sawdustStorage.w / 2, sawdustStorage.y + sawdustStorage.h + 15);
          } else {
            ctx.fillStyle = '#ffd166';
            ctx.fillText(`ВЗЯТЬ ОПИЛКИ [SPACE] (${player.sawdustStock}/${player.sawdustMaxStock})`, sawdustStorage.x + sawdustStorage.w / 2, sawdustStorage.y + sawdustStorage.h + 15);
          }
          ctx.textAlign = 'left';
        }
      }

export function renderDungPiles() {
        state.dungPiles.forEach(p => {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);

          // Масштаб кучи пропорционален массе (10..20 кг базовые, при частичном заборе уменьшается)
          const pileScale = Math.max(0.48, Math.min(1.25, p.kg / 16));
          ctx.scale(pileScale, pileScale);

          // Тень кучи
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.ellipse(2, 4, 18, 12, 0, 0, Math.PI * 2);
          ctx.fill();

          // Несколько округлых бугорков навоза
          ctx.fillStyle = '#5c3a17';
          ctx.beginPath();
          ctx.arc(-6, 0, 10, 0, Math.PI * 2);
          ctx.arc(6, -2, 11, 0, Math.PI * 2);
          ctx.arc(0, -6, 9, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#7a4e21';
          ctx.beginPath();
          ctx.arc(-4, -2, 7, 0, Math.PI * 2);
          ctx.arc(4, -4, 8, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();

          // Если игрок рядом, рисуем подсказку «SPACE - Убрать» или «ТАЧКА ПЕРЕПОЛНЕНА»
          const dist = Math.hypot(player.x - p.x, player.y - p.y);
          if (dist < 46) {
            const isFull = player.wheelbarrowKg >= player.wheelbarrowMaxKg;
            ctx.fillStyle = isFull ? '#c0392b' : '#2c3e50';
            ctx.font = 'bold 10px monospace';
            const label = isFull ? `ТАЧКА ПОЛНАЯ! (${p.kg} кг)` : `УБОРКА [SPACE] (${p.kg} кг)`;
            ctx.fillText(label, p.x - 55, p.y - 20);

            // Индикатор прогресса уборки
            if (player.isShoveling && player.shovelProgress > 0) {
              ctx.strokeStyle = '#27ae60';
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * player.shovelProgress);
              ctx.stroke();
            }
          }
        });
      }

export function renderSituationalObjects() {
        // 1. Забытое лабораторное ведро на полу вольера
        if (state.misplacedTool && state.misplacedTool.active) {
          const tx = state.misplacedTool.x;
          const ty = state.misplacedTool.y;

          // Мягкая тень
          ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
          ctx.beginPath();
          ctx.ellipse(tx + 2, ty + 6, 11, 5.5, 0, 0, Math.PI * 2);
          ctx.fill();

          // Корпус ведра (слегка наклоненное серебристое ведро)
          ctx.fillStyle = '#a6b8c7';
          ctx.beginPath();
          ctx.moveTo(tx - 7, ty - 6);
          ctx.lineTo(tx + 7, ty - 6);
          ctx.lineTo(tx + 5.5, ty + 8);
          ctx.lineTo(tx - 5.5, ty + 8);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#2980b9';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Синяя полоска лаборатории
          ctx.fillStyle = '#3498db';
          ctx.fillRect(tx - 6, ty - 1, 12, 3);

          // Контекстная подсказка только при приближении
          const dist = Math.hypot(player.x - tx, player.y - ty);
          if (dist < 48) {
            drawInteractIcon(tx, ty - 26);
            ctx.fillStyle = '#f39c12';
            ctx.font = 'bold 10px monospace';
            ctx.fillText('УБРАТЬ ВЕДРО [SPACE]', tx - 55, ty - 14);
          }
        }

        // 2. Рассыпанное сено у кормушки
        if (state.scatteredHay && state.scatteredHay.active) {
          const sx = state.scatteredHay.x;
          const sy = state.scatteredHay.y;

          // Пятно рассыпанной соломы
          ctx.fillStyle = '#d4bc6c';
          ctx.beginPath();
          ctx.ellipse(sx, sy, 18, 12, 0.2, 0, Math.PI * 2);
          ctx.fill();

          // Отдельные соломинки
          ctx.fillStyle = '#e6c86e';
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            const lx = sx + Math.cos(ang) * (10 + (i % 3) * 3);
            const ly = sy + Math.sin(ang) * (7 + (i % 2) * 2);
            ctx.fillRect(lx, ly, 5, 2);
          }

          const dist = Math.hypot(player.x - sx, player.y - sy);
          if (dist < 48) {
            drawInteractIcon(sx, sy - 26);
            ctx.fillStyle = '#27ae60';
            ctx.font = 'bold 10px monospace';
            ctx.fillText('СОБРАТЬ [SPACE]', sx - 38, sy - 10);
          }
          // UX-рефакторинг: постоянная подпись «РАССЫПАНО СЕНО» вне радиуса
          // убрана — сам пучок сена виден на поле, подсказка появляется при
          // приближении кипера.
        }

        // 3. Засохший бортик кормушки
        if (state.feederCrust && state.feederCrust.active) {
          const f = feeders.find(fd => fd.id === state.feederCrust.feederId);
          if (f) {
            const fx = f.x + f.w / 2;
            const fy = f.y + 4;

            // Пятна засохшей каши на бортике
            ctx.fillStyle = '#b7793b';
            ctx.fillRect(f.x + 8, f.y, 22, 5);
            ctx.fillRect(f.x + 40, f.y, 18, 4);

            const dist = Math.hypot(player.x - fx, player.y - (f.y + f.h / 2));
            if (dist < 55) {
              ctx.fillStyle = '#3498db';
              ctx.font = 'bold 10px monospace';
              ctx.fillText('ОЧИСТИТЬ БОРТИК [ДЕРЖАТЬ SPACE]', f.x - 45, f.y - 18);

              // Индикатор прогресса очистки
              if (state.feederCrust.progress > 0) {
                ctx.strokeStyle = '#3498db';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(fx, fy - 6, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * state.feederCrust.progress);
                ctx.stroke();
              }
            }
          }
        }
      }

export function renderSleepingElephant(el) {
        const bw = el.radius * 1.35;   // полуширина лежащего туловища
        const bh = el.radius * 0.55;   // полуввысота (сильно уплощено)
        const breathe = Math.sin(state.worldAnimTime * 1.6 + el.age) * 0.04;

        // 1. Мягкая тень-подстилка под телом
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.beginPath();
        ctx.ellipse(0, bh * 0.75, bw * 1.05, bh * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Туловище — приплюснутый бок слонихи (без стоек на ногах)
        ctx.save();
        ctx.scale(1, 1 + breathe);
        ctx.fillStyle = el.color;
        ctx.beginPath();
        ctx.ellipse(-bw * 0.12, 0, bw, bh, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = el.darkColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Склад кожи на боку — лёгкая штриховка
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)';
        ctx.lineWidth = 2;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.arc(-bw * 0.12 + i * bw * 0.35, bh * 0.1, bh * 0.75, -0.9, 0.9);
          ctx.stroke();
        }

        // 3. Прижатое к телу ухо
        ctx.fillStyle = el.darkColor;
        ctx.beginPath();
        ctx.ellipse(-bw * 0.55, -bh * 0.35, el.radius * 0.34, el.radius * 0.22, -0.35, 0, Math.PI * 2);
        ctx.fill();

        // 4. Хобот, свёрнутый на подстилке перед головой
        ctx.strokeStyle = el.color;
        ctx.lineWidth = el.radius * 0.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bw * 0.62, bh * 0.1);
        ctx.quadraticCurveTo(bw * 1.05, bh * 0.35, bw * 0.85, bh * 0.72);
        ctx.quadraticCurveTo(bw * 0.62, bh * 0.95, bw * 0.45, bh * 0.7);
        ctx.stroke();
        ctx.strokeStyle = el.darkColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineCap = 'butt';

        // 5. Голова, опущенная на настил
        ctx.fillStyle = el.color;
        ctx.beginPath();
        ctx.ellipse(bw * 0.62, bh * 0.05, el.radius * 0.42, el.radius * 0.34, 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = el.darkColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // 6. Закрытые глаза (спокойные дуги вместо зрачков)
        ctx.strokeStyle = '#1e2022';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bw * 0.58, -el.radius * 0.12, 3.6, 0.15, Math.PI - 0.15);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bw * 0.82, -el.radius * 0.08, 3.2, 0.15, Math.PI - 0.15);
        ctx.stroke();

        // 7. Короткий хвост с кисточкой, прижатый к настилу
        ctx.strokeStyle = el.darkColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-bw * 0.95, bh * 0.25);
        ctx.quadraticCurveTo(-bw * 1.15, bh * 0.5, -bw * 1.05, bh * 0.75);
        ctx.stroke();
        ctx.fillStyle = '#2c3036';
        ctx.beginPath();
        ctx.arc(-bw * 1.05, bh * 0.78, 3, 0, Math.PI * 2);
        ctx.fill();

        // 8. Индикатор сна: «сонные» дуги над головой
        const sleepBob = Math.sin(state.worldAnimTime * 2.2) * 3;
        ctx.fillStyle = '#bfe3ff';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('💤', bw * 0.7, -el.radius * 0.95 + sleepBob);

        // 9. Компактный бейдж имени и мини-полоска сытости (без лишних процентов и слов)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(-45, -el.radius * 1.15, 90, 18);
        ctx.fillStyle = '#f5eedb';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(el.name, 0, -el.radius * 1.15 + 10);

        // Индикатор сытости
        const satWidth = 76;
        ctx.fillStyle = '#222';
        ctx.fillRect(-satWidth / 2, -el.radius * 1.15 + 13, satWidth, 3);
        ctx.fillStyle = el.satiety > 65 ? '#2ecc71' : (el.satiety > 35 ? '#f39c12' : '#e74c3c');
        ctx.fillRect(-satWidth / 2, -el.radius * 1.15 + 13, satWidth * (el.satiety / 100), 3);

        // Контекстная подсказка осмотра — только при приближении дежурного
        const distToPlayer = Math.hypot(player.x - el.x, player.y - el.y);
        if (distToPlayer < el.radius + 55) {
          ctx.fillStyle = '#9fd8a0';
          ctx.font = 'bold 9px monospace';
          ctx.fillText('ОСМОТР [F]', 0, el.radius * 0.95);
        }
        ctx.textAlign = 'left';
      }

export function renderFeedingElephantRear(el) {
  ctx.save();
  ctx.translate(el.x, el.y);

  // Дыхание и легкое жевание
  const chewBob = Math.sin(state.worldAnimTime * 6) * 1.5;
  const chewSide = Math.cos(state.worldAnimTime * 6) * 1.2;

  // 1. Мягкая тень под слоном
  ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
  ctx.beginPath();
  ctx.ellipse(0, 10, el.radius * 1.05, el.radius * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Две массивные задние ноги со стопами и ногтями
  ctx.fillStyle = el.darkColor;
  // Левая задняя нога
  ctx.fillRect(-el.radius * 0.55, el.radius * 0.1, 18, 22);
  // Правая задняя нога
  ctx.fillRect(el.radius * 0.55 - 18, el.radius * 0.1, 18, 22);

  // Ногти на задних лапах (3 светлых полукружия на каждой)
  ctx.fillStyle = '#e8ecef';
  for (let ni = 0; ni < 3; ni++) {
    ctx.fillRect(-el.radius * 0.53 + ni * 5, el.radius * 0.1 + 18, 4, 4);
    ctx.fillRect(el.radius * 0.55 - 16 + ni * 5, el.radius * 0.1 + 18, 4, 4);
  }

  // 3. Передние ноги, слегка видимые в перспективе спереди
  ctx.fillStyle = '#3a4046';
  ctx.fillRect(-el.radius * 0.42, -el.radius * 0.55, 14, 20);
  ctx.fillRect(el.radius * 0.42 - 14, -el.radius * 0.55, 14, 20);

  // 4. Округлое массивное туловище сзади (круп, спина)
  ctx.fillStyle = el.color;
  ctx.beginPath();
  ctx.ellipse(0, -el.radius * 0.05 + chewBob, el.radius * 0.95, el.radius * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();

  // Затенение и складки крупа
  ctx.strokeStyle = el.darkColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  // Позвоночная линия
  ctx.moveTo(0, -el.radius * 0.5 + chewBob);
  ctx.lineTo(0, el.radius * 0.35 + chewBob);
  // Складки бедер
  ctx.arc(-el.radius * 0.35, el.radius * 0.1 + chewBob, el.radius * 0.35, -0.4, 0.8);
  ctx.arc(el.radius * 0.35, el.radius * 0.1 + chewBob, el.radius * 0.35, Math.PI - 0.8, Math.PI + 0.4);
  ctx.stroke();

  // 5. Голова, опущенная вперед и вниз к кормушке
  ctx.fillStyle = el.darkColor;
  ctx.beginPath();
  ctx.ellipse(chewSide * 0.5, -el.radius * 0.6 + chewBob, el.radius * 0.46, el.radius * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();

  // 6. Задняя сторона больших ушей (видны со спины, покачиваются при жевании)
  const earFlap = Math.sin(state.worldAnimTime * 3) * 0.08;
  // Левое ухо сзади
  ctx.save();
  ctx.translate(-el.radius * 0.5, -el.radius * 0.65 + chewBob);
  ctx.rotate(-0.2 - earFlap);
  ctx.fillStyle = el.color;
  ctx.beginPath();
  ctx.ellipse(-12, 0, 16, 24, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = el.darkColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Правое ухо сзади
  ctx.save();
  ctx.translate(el.radius * 0.5, -el.radius * 0.65 + chewBob);
  ctx.rotate(0.2 + earFlap);
  ctx.fillStyle = el.color;
  ctx.beginPath();
  ctx.ellipse(12, 0, 16, 24, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = el.darkColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // 7. Хвост с кисточкой, свисающий между бедер и мягко покачивающийся
  const tailSway = Math.sin(state.worldAnimTime * 3.5) * 8;
  ctx.strokeStyle = el.darkColor;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(0, el.radius * 0.25 + chewBob);
  ctx.quadraticCurveTo(tailSway * 0.5, el.radius * 0.6, tailSway, el.radius * 0.85);
  ctx.stroke();
  // Кисточка на кончике хвоста
  ctx.fillStyle = '#22252a';
  ctx.fillRect(tailSway - 3, el.radius * 0.82, 6, 7);

  // 8. Частицы падающих крошек и сена из кормушки при жевании
  if (Math.random() < 0.35) {
    const crumbX = (Math.random() - 0.5) * 20;
    ctx.fillStyle = '#e6c86e';
    ctx.fillRect(crumbX, -el.radius * 0.75 - Math.random() * 6, 2.5, 2);
  }

  ctx.restore();
}

export function renderElephant(el) {
        // ЭТАП 27R: поза лёжа — слониха отдыхает на мягком настиле. Рисуем
        // приплюснутое туловище без ног и компактно убираем стандартную отрисовку.
        if (el.state === 'REST') {
          ctx.save();
          ctx.translate(el.x, el.y);
          renderSleepingElephant(el);
          ctx.restore();
          return;
        }

        // РЕДИЗАЙН: поза кормления со спины у кормушки
        if (el.state === 'EAT' && el.y < 320) {
          renderFeedingElephantRear(el);
        } else {
          ctx.save();
          ctx.translate(el.x, el.y);

          // 1. Большая мягкая тень под слоном
          ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
          ctx.beginPath();
          ctx.ellipse(0, 12, el.radius * 1.05, el.radius * 0.75, 0, 0, Math.PI * 2);
          ctx.fill();

        // 2. Хвост с кисточкой
        ctx.save();
        ctx.rotate(el.tailWiggle);
        ctx.strokeStyle = el.darkColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, el.radius * 0.6);
        ctx.quadraticCurveTo(8, el.radius * 0.9, 4, el.radius * 1.15);
        ctx.stroke();
        // Кисточка
        ctx.fillStyle = '#2c3036';
        ctx.fillRect(1, el.radius * 1.12, 6, 6);
        ctx.restore();

        // 3. Задние и передние толстые ноги
        const legOffset = Math.sin(el.walkCycle) * 6;
        ctx.fillStyle = el.darkColor;
        // Задние ноги
        ctx.fillRect(-el.radius * 0.65, el.radius * 0.2 + legOffset, 16, 20);
        ctx.fillRect(el.radius * 0.35, el.radius * 0.2 - legOffset, 16, 20);
        // Передние ноги
        ctx.fillRect(-el.radius * 0.75, -el.radius * 0.3 - legOffset, 16, 20);
        ctx.fillRect(el.radius * 0.45, -el.radius * 0.3 + legOffset, 16, 20);

        // Ногти (белые полукружия)
        ctx.fillStyle = '#e8ecef';
        ctx.fillRect(-el.radius * 0.63, el.radius * 0.2 + legOffset + 16, 4, 4);
        ctx.fillRect(-el.radius * 0.55, el.radius * 0.2 + legOffset + 16, 4, 4);
        ctx.fillRect(el.radius * 0.37, el.radius * 0.2 - legOffset + 16, 4, 4);
        ctx.fillRect(el.radius * 0.45, el.radius * 0.2 - legOffset + 16, 4, 4);

        // 4. Массивное туловище
        ctx.fillStyle = el.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, el.radius, el.radius * 0.82, 0, 0, Math.PI * 2);
        ctx.fill();

        // Морщины и складки кожи
        ctx.strokeStyle = el.darkColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(-10, -5, el.radius * 0.5, 0.4, 1.2);
        ctx.arc(8, 6, el.radius * 0.45, 0.6, 1.5);
        ctx.stroke();

        // 5. Голова слонихи
        ctx.fillStyle = el.color;
        ctx.beginPath();
        ctx.arc(0, -el.radius * 0.5, el.radius * 0.52, 0, Math.PI * 2);
        ctx.fill();

        // 6. Большие уши, покачивающиеся в такт
        // Левое ухо
        ctx.save();
        ctx.translate(-el.radius * 0.45, -el.radius * 0.6);
        ctx.rotate(-el.earAngle);
        ctx.fillStyle = el.color;
        ctx.beginPath();
        ctx.ellipse(-14, 0, 18, 26, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = el.earColor;
        ctx.beginPath();
        ctx.ellipse(-14, 0, 12, 18, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Правое ухо
        ctx.save();
        ctx.translate(el.radius * 0.45, -el.radius * 0.6);
        ctx.rotate(el.earAngle);
        ctx.fillStyle = el.color;
        ctx.beginPath();
        ctx.ellipse(14, 0, 18, 26, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = el.earColor;
        ctx.beginPath();
        ctx.ellipse(14, 0, 12, 18, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 7. Глаза (при отдыхе REST - полуприкрытые сонные веки)
        if (el.state === 'REST') {
          ctx.strokeStyle = '#1e2022';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(-12, -el.radius * 0.55, 3.5, 0.2, Math.PI - 0.2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(12, -el.radius * 0.55, 3.5, 0.2, Math.PI - 0.2);
          ctx.stroke();
        } else {
          ctx.fillStyle = '#1e2022';
          ctx.beginPath();
          ctx.arc(-12, -el.radius * 0.55, 3.5, 0, Math.PI * 2);
          ctx.arc(12, -el.radius * 0.55, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-13, -el.radius * 0.57, 1.5, 1.5);
          ctx.fillRect(11, -el.radius * 0.57, 1.5, 1.5);
        }

        // 8. Аккуратные бивни (бивники)
        ctx.fillStyle = '#fffdf5';
        ctx.fillRect(-10, -el.radius * 0.35, 4, 10);
        ctx.fillRect(6, -el.radius * 0.35, 4, 10);

        // 9. Хобот с подвижным кончиком и позой в зависимости от действия
        ctx.save();
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -el.radius * 0.35);

        let trunkEndOffset = Math.sin(el.trunkAngle) * 16;
        let trunkEndY = el.radius * 0.2;
        let trunkMidY = -el.radius * 0.05;

        if (el.state === 'DRINK') {
          // Хобот опущен глубоко к поилке
          trunkEndOffset = Math.sin(state.worldAnimTime * 5) * 5;
          trunkMidY = el.radius * 0.1;
          trunkEndY = el.radius * 0.38;
        } else if (el.state === 'EAT') {
          // Хобот поднимает корм ко рту
          trunkEndOffset = Math.sin(state.worldAnimTime * 4) * 8;
          trunkMidY = -el.radius * 0.25;
          trunkEndY = -el.radius * 0.1;
        }

        ctx.quadraticCurveTo(trunkEndOffset * 0.6, trunkMidY, trunkEndOffset, trunkEndY);
        ctx.stroke();

        ctx.strokeStyle = el.darkColor;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(0, -el.radius * 0.35);
        ctx.quadraticCurveTo(trunkEndOffset * 0.6, trunkMidY, trunkEndOffset, trunkEndY);
        ctx.stroke();

        // Кольца на хоботе
        ctx.strokeStyle = '#474e55';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(trunkEndOffset * 0.3, trunkMidY, 6, 0.2, 1.2);
        ctx.stroke();
        ctx.restore();

        ctx.restore();
      }

        // --- 10. Статусный бейдж над головой слонихи (компактный UX) ---
        const distToPlayer = Math.hypot(player.x - el.x, player.y - el.y);

        // 1. Компактная плашка имени и шкала сытости
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(el.x - 45, el.y - el.radius - 38, 90, 24);
        ctx.fillStyle = '#f5eedb';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(el.name, el.x, el.y - el.radius - 24);

        // Шкала сытости (зеленый / желтый / красный)
        const satWidth = 80;
        ctx.fillStyle = '#222';
        ctx.fillRect(el.x - satWidth / 2, el.y - el.radius - 20, satWidth, 4);
        ctx.fillStyle = el.satiety > 65 ? '#2ecc71' : (el.satiety > 35 ? '#f39c12' : '#e74c3c');
        ctx.fillRect(el.x - satWidth / 2, el.y - el.radius - 20, satWidth * (el.satiety / 100), 4);

        // 2. Сгруппированные лаконичные значки состояния над плашкой имени
        // (анализ мочи, педикюр, чистота стоп, жажда, кормление, лакомство)
        if (el.isWantingPee) {
          const pulse = Math.sin(state.worldAnimTime * 8) * 3;
          const hasBucket = player.carrying === 'bucket';
          ctx.fillStyle = hasBucket ? '#27ae60' : '#e74c3c';
          ctx.beginPath();
          ctx.arc(el.x, el.y - el.radius - 54 + pulse, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText('🧪', el.x, el.y - el.radius - 50 + pulse);
          ctx.font = 'bold 9px monospace';
          ctx.fillText(`${Math.max(0, Math.ceil(el.peeUrgencyTimer))}с`, el.x, el.y - el.radius - 38 + pulse);
        } else if (el.isWantingPedicure) {
          const pulse = Math.sin(state.worldAnimTime * 8) * 3;
          ctx.fillStyle = '#8e44ad';
          ctx.beginPath();
          ctx.arc(el.x, el.y - el.radius - 54 + pulse, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText('🦶', el.x, el.y - el.radius - 50 + pulse);
          ctx.font = 'bold 9px monospace';
          ctx.fillText(`${Math.max(0, Math.ceil(el.pedicureUrgencyTimer))}с`, el.x, el.y - el.radius - 38 + pulse);
        } else {
          // Компактный ряд статусных иконок над именем
          const badges = [];
          if (el.state === 'FOLLOW') badges.push('🍌');
          if (el.footDirt >= 25) badges.push(el.footDirt >= 60 ? '🦶🔴' : '🦶');
          if (el.state === 'DRINK' || el.thirst > 65) badges.push('💧');
          if (el.state === 'EAT') badges.push('🌾');

          if (badges.length > 0) {
            const startBx = el.x - (badges.length - 1) * 11;
            badges.forEach((b, bi) => {
              const bx = startBx + bi * 22;
              const by = el.y - el.radius - 48;
              ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
              ctx.beginPath();
              ctx.arc(bx, by, 9, 0, Math.PI * 2);
              ctx.fill();
              ctx.font = '10px sans-serif';
              ctx.fillText(b.replace('🔴', ''), bx, by + 3.5);
              if (b.includes('🔴')) {
                ctx.strokeStyle = '#e74c3c';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(bx, by, 9, 0, Math.PI * 2);
                ctx.stroke();
              }
            });
          }
        }

        // 3. Динамическая контекстная подсказка взаимодействия (только при приближении кипера)
        if (distToPlayer < el.radius + 50) {
          drawInteractIcon(el.x, el.y + el.radius + 12);
          ctx.fillStyle = '#f5eedb';
          ctx.font = 'bold 10px monospace';

          if (el.isWantingPee) {
            const hasBucket = player.carrying === 'bucket';
            ctx.fillStyle = hasBucket ? '#2ecc71' : '#e74c3c';
            ctx.fillText(hasBucket ? 'ВЗЯТЬ АНАЛИЗ [SPACE]' : 'НУЖНО ВЕДРО СО СТОЙКИ!', el.x, el.y + el.radius + 32);
          } else if (el.isWantingPedicure) {
            ctx.fillStyle = '#e056fd';
            ctx.fillText('РАСЧИСТИТЬ НОГТИ [ЗАЖАТЬ SPACE]', el.x, el.y + el.radius + 32);
            if (player.isDoingPedicure && player.pedicureProgress > 0) {
              ctx.strokeStyle = '#9b59b6';
              ctx.lineWidth = 5;
              ctx.beginPath();
              ctx.arc(el.x, el.y, el.radius + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * player.pedicureProgress);
              ctx.stroke();
            }
          } else if (el.state === 'FOLLOW') {
            ctx.fillStyle = '#f1c40f';
            ctx.fillText('ВЕДЁТСЯ ЗА ЛАКОМСТВОМ', el.x, el.y + el.radius + 32);
          } else {
            ctx.fillStyle = '#f5eedb';
            ctx.fillText('ОСМОТР [F]', el.x, el.y + el.radius + 32);
          }
        }

        ctx.textAlign = 'left';
      }

export function renderPlayer() {
        ctx.save();
        ctx.translate(player.x, player.y);

        // Тень кипера
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.beginPath();
        ctx.ellipse(0, 10, 14, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Анимация ног при ходьбе
        const legSwing = Math.sin(player.walkAnim) * 5;

        // Ноги и сапоги
        ctx.fillStyle = '#2d4030'; // Штаны комбинезона
        ctx.fillRect(-7, 2 + legSwing, 5, 8);
        ctx.fillRect(2, 2 - legSwing, 5, 8);

        ctx.fillStyle = '#1c1b18'; // Кожаные сапоги
        ctx.fillRect(-8, 9 + legSwing, 6, 4);
        ctx.fillRect(2, 9 - legSwing, 6, 4);

        // Тело в киперской униформе (песочно-зеленый жакет)
        ctx.fillStyle = '#3a5a40';
        ctx.fillRect(-9, -10, 18, 14);

        // Желтый бейдж зоопарка на груди
        ctx.fillStyle = '#f4a261';
        ctx.fillRect(1, -7, 5, 4);

        // Голова и киперская фуражка
        ctx.fillStyle = '#f8c291'; // Кожа лица
        ctx.beginPath();
        ctx.arc(0, -14, 7, 0, Math.PI * 2);
        ctx.fill();

        // Глаза в зависимости от направления
        ctx.fillStyle = '#2c3e50';
        if (player.dir === 'down') {
          ctx.fillRect(-3, -15, 2, 2);
          ctx.fillRect(1, -15, 2, 2);
        } else if (player.dir === 'left') {
          ctx.fillRect(-5, -15, 2, 2);
        } else if (player.dir === 'right') {
          ctx.fillRect(3, -15, 2, 2);
        }

        // Зеленая кепка с козырьком
        ctx.fillStyle = '#283618';
        ctx.beginPath();
        ctx.arc(0, -17, 8, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#1f2b13';
        if (player.dir === 'down') ctx.fillRect(-7, -17, 14, 3);
        else if (player.dir === 'left') ctx.fillRect(-9, -17, 11, 3);
        else if (player.dir === 'right') ctx.fillRect(-2, -17, 11, 3);

        // Переносимый предмет
        if (player.carrying === 'hay') {
          // Тюк сена в руках
          ctx.fillStyle = '#e6c86e';
          ctx.fillRect(-12, -4, 24, 14);
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(-3, -4, 3, 14);
        } else if (player.carrying === 'mash') {
          // Таз с кашей
          ctx.fillStyle = '#3a6b88';
          ctx.beginPath();
          ctx.arc(0, 2, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#d89b4b';
          ctx.beginPath();
          ctx.arc(0, 2, 7, 0, Math.PI * 2);
          ctx.fill();
        } else if (player.carrying === 'bucket') {
          // Лабораторное металлическое ведро в руках
          ctx.fillStyle = '#a6b8c7';
          ctx.beginPath();
          ctx.moveTo(-6, -2);
          ctx.lineTo(6, -2);
          ctx.lineTo(4.5, 9);
          ctx.lineTo(-4.5, 9);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#2980b9';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          // Ободок и ручка
          ctx.fillStyle = '#3498db';
          ctx.fillRect(-5, 2, 10, 2.5);
        } else if (player.carrying === 'treat') {
          // ЭТАП 27R: банан-лакомство в руке кипера
          ctx.strokeStyle = '#f1c40f';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(9, 0, 6, -Math.PI * 0.85, -Math.PI * 0.1);
          ctx.stroke();
          ctx.lineCap = 'butt';
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(6.5, -5.5, 2, 2.5);
          ctx.fillRect(12, -2.5, 2, 2.5);
        } else if (player.hasPitchfork) {
          // UX-рефакторинг: компактный визуальный маркер — вилы взяты со
          // стойки (замена постоянной подписи «ВИЛЫ У ВАС» у стойки).
          ctx.strokeStyle = '#8b5a2b';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(9, 6);
          ctx.lineTo(9, -13);
          ctx.stroke();
          ctx.strokeStyle = '#95a5a6';
          ctx.lineWidth = 2;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(9 + i * 3, -13);
            ctx.lineTo(9 + i * 3, -19);
            ctx.stroke();
          }
        } else if (player.carrying === 'none') {
          // Рабочая лопата дежурного кипера
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(8, -12, 2.5, 18);
          ctx.fillStyle = '#7f8c8d';
          ctx.fillRect(7, 5, 5, 6);
        }

        // Визуализация тачки кипера рядом с ним (только если она взята в руки)
        if (wheelbarrow.inHands) {
          ctx.save();
          ctx.translate(player.dir === 'left' ? -22 : 22, 2);
          // Колесо тачки
          ctx.fillStyle = '#111';
          ctx.beginPath();
          ctx.arc(0, 6, 5, 0, Math.PI * 2);
          ctx.fill();
          // Металлический кузов тачки
          ctx.fillStyle = '#5c6f84';
          ctx.beginPath();
          ctx.moveTo(-10, 2);
          ctx.lineTo(10, 2);
          ctx.lineTo(7, -8);
          ctx.lineTo(-7, -8);
          ctx.closePath();
          ctx.fill();

          // Заполнение тачки навозом
          if (wheelbarrow.kg > 0) {
            const fillFrac = wheelbarrow.kg / wheelbarrow.maxKg;
            ctx.fillStyle = '#6e451b';
            ctx.beginPath();
            ctx.arc(0, -6 - fillFrac * 4, 7 * fillFrac, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // Сумка с опилками на поясе кипера
        if (player.sawdustStock > 0) {
          ctx.fillStyle = '#bfa780';
          ctx.beginPath();
          ctx.roundRect(-12, -4, 6, 8, 2);
          ctx.fill();
          ctx.strokeStyle = '#6e4f25';
          ctx.lineWidth = 1;
          ctx.stroke();
          // Золотистые стружки, виднеющиеся из сумки
          ctx.fillStyle = '#fae1a7';
          ctx.fillRect(-11, -6, 4, 3);
        }

        // Анимация стружки при засыпке опилок
        if (player.isPouringSawdust) {
          ctx.fillStyle = '#fae1a7';
          const flutter = Math.sin(state.worldAnimTime * 25) * 3;
          ctx.fillRect(-2 + flutter, 2, 3, 2);
          ctx.fillRect(2 - flutter, 6, 2.5, 2);
          ctx.fillRect(flutter, 10, 3, 2);
        }

        // Компактный индикатор запаса опилок над головой кипера
        if (player.sawdustStock > 0) {
          ctx.save();
          ctx.fillStyle = 'rgba(28, 20, 14, 0.88)';
          ctx.beginPath();
          ctx.roundRect(-19, -32, 38, 12, 3);
          ctx.fill();
          ctx.strokeStyle = '#cbb07a';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = '#ffd166';
          ctx.font = 'bold 8.5px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`🪵 ${player.sawdustStock}/5`, 0, -23);
          ctx.restore();
        }

        ctx.restore();
      }

export function renderFencesAndForewalls() {
        // Ограждение слоновника
        ctx.fillStyle = '#4a2f1b';
        ctx.fillRect(20, 185, 595, 12);
        ctx.fillRect(715, 185, 265, 12);

        // Столбы ограждения
        ctx.fillStyle = '#301c0d';
        for (let x = 20; x <= 615; x += 45) {
          ctx.fillRect(x, 175, 10, 26);
        }
        for (let x = 715; x <= 980; x += 45) {
          ctx.fillRect(x, 175, 10, 26);
        }

        // Проход / Ворота (x: 620..710)
        ctx.fillStyle = '#8e795c';
        ctx.fillRect(618, 182, 98, 16);
        // UX-рефакторинг: постоянная подпись «ПРОХОД К СЛОНАМ» убрана —
        // светлый проход между секциями сам указывает на себя.
      }

export function renderParticles() {
        particles.forEach(p => {
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, p.size, p.size);
        });
      }

export function renderAmbientLighting() {
        const d = dayNightCycle.darkness; // 0..1
        const sunset = dayNightCycle.sunsetGlow;
        const sunrise = dayNightCycle.sunriseGlow;

        if (d <= 0.02 && sunset <= 0.02 && sunrise <= 0.02) {
          // Чистый день: мягкий естественный теплый солнечный свет
          ctx.fillStyle = 'rgba(255, 245, 225, 0.03)';
          ctx.fillRect(0, 44, CANVAS_WIDTH, CANVAS_HEIGHT - 44);
          return;
        }

        // 1. Закатные золотисто-янтарные сумерки (DUSK)
        if (sunset > 0.02) {
          ctx.fillStyle = `rgba(235, 120, 30, ${0.28 * sunset})`;
          ctx.fillRect(0, 44, CANVAS_WIDTH, CANVAS_HEIGHT - 44);
        }

        // 2. Рассветные нежные розово-золотистые лучи (DAWN)
        if (sunrise > 0.02) {
          ctx.fillStyle = `rgba(245, 150, 90, ${0.22 * sunrise})`;
          ctx.fillRect(0, 44, CANVAS_WIDTH, CANVAS_HEIGHT - 44);
        }

        // 3. Ночная темнота и атмосферные источники освещения
        if (d > 0.02) {
          const nightAlpha = 0.44 * d; // глубокая прохладная синева с сохранением отличной читаемости поля

          ctx.save();

          // Базовая ночная вуаль слоновника (только игровое поле, без HUD)
          ctx.fillStyle = `rgba(10, 18, 42, ${nightAlpha})`;
          ctx.fillRect(0, 44, CANVAS_WIDTH, CANVAS_HEIGHT - 44);

          // Локальные источники света ночью через режим наложения 'lighter'
          ctx.globalCompositeOperation = 'lighter';

          // А) Переносной фонарь дежурного кипера (мягкий золотистый луч/ореол)
          const lanternGrad = ctx.createRadialGradient(player.x, player.y, 10, player.x, player.y, 95);
          lanternGrad.addColorStop(0, `rgba(255, 220, 140, ${0.38 * d})`);
          lanternGrad.addColorStop(0.5, `rgba(255, 200, 100, ${0.18 * d})`);
          lanternGrad.addColorStop(1, 'rgba(255, 180, 80, 0)');
          ctx.fillStyle = lanternGrad;
          ctx.beginPath();
          ctx.arc(player.x, player.y, 95, 0, Math.PI * 2);
          ctx.fill();

          // Б) Настенный светильник в служебной зоне (над столом лакомств и инвентарём)
          const lampGrad = ctx.createRadialGradient(150, 120, 8, 150, 120, 85);
          lampGrad.addColorStop(0, `rgba(255, 230, 150, ${0.34 * d})`);
          lampGrad.addColorStop(0.6, `rgba(255, 190, 90, ${0.14 * d})`);
          lampGrad.addColorStop(1, 'rgba(255, 160, 60, 0)');
          ctx.fillStyle = lampGrad;
          ctx.beginPath();
          ctx.arc(150, 120, 85, 0, Math.PI * 2);
          ctx.fill();

          // В) Контрольный дежурный свет автопоилки
          const troughLight = ctx.createRadialGradient(waterTrough.x + 35, waterTrough.y + 20, 5, waterTrough.x + 35, waterTrough.y + 20, 55);
          troughLight.addColorStop(0, `rgba(100, 200, 255, ${0.24 * d})`);
          troughLight.addColorStop(1, 'rgba(80, 180, 255, 0)');
          ctx.fillStyle = troughLight;
          ctx.beginPath();
          ctx.arc(waterTrough.x + 35, waterTrough.y + 20, 55, 0, Math.PI * 2);
          ctx.fill();

          // Г) Сигнальные дежурные маячки над кормушками
          for (const f of feeders) {
            const fx = f.x + f.w / 2;
            const fy = f.y + 15;
            const fLight = ctx.createRadialGradient(fx, fy, 4, fx, fy, 45);
            fLight.addColorStop(0, `rgba(255, 215, 120, ${0.20 * d})`);
            fLight.addColorStop(1, 'rgba(255, 200, 80, 0)');
            ctx.fillStyle = fLight;
            ctx.beginPath();
            ctx.arc(fx, fy, 45, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }
      }

export function renderDroppedWheelbarrow() {
  if (wheelbarrow.inHands) return;

  ctx.save();
  ctx.translate(wheelbarrow.x, wheelbarrow.y);

  if (wheelbarrow.isDamaged) {
    // 1. Поврежденная слоном тачка (опрокинута, погнута, колесо отвалилось)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 20, 10, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.rotate(-0.35);
    // Погнутые ручки
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-16, 7);
    ctx.lineTo(2, 3);
    ctx.moveTo(-15, -7);
    ctx.lineTo(1, -3);
    ctx.stroke();

    // Помятый кузов
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(-9, 7);
    ctx.lineTo(13, 9);
    ctx.lineTo(16, -5);
    ctx.lineTo(-5, -7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Трещины и вмятины
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(1, 3);
    ctx.lineTo(6, -2);
    ctx.lineTo(9, 5);
    ctx.stroke();
    ctx.restore();

    // Отлетевшее погнутое колесо
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(14, 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7f8c8d';
    ctx.beginPath();
    ctx.arc(14, 8, 2, 0, Math.PI * 2);
    ctx.fill();

    // Значок ⚠️ и надпись над сломанной тачкой
    const bounce = Math.sin(state.worldAnimTime * 5) * 3;
    ctx.fillStyle = 'rgba(28, 20, 14, 0.92)';
    ctx.fillRect(-38, -26 + bounce, 76, 16);
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-38, -26 + bounce, 76, 16);

    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('💥 СЛОМАНА', 0, -14 + bounce);
    ctx.textAlign = 'left';

  } else {
    // 2. Исправная тачка, оставленная в игровом мире
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 7, 16, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Опорные ножки
    ctx.strokeStyle = '#34495e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-8, 2);
    ctx.lineTo(-8, 9);
    ctx.moveTo(8, 2);
    ctx.lineTo(8, 9);
    ctx.stroke();

    // Ручки тачки
    ctx.strokeStyle = '#4a5b6d';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-16, -4);
    ctx.lineTo(-4, 2);
    ctx.moveTo(16, -4);
    ctx.lineTo(4, 2);
    ctx.stroke();

    // Колесо
    ctx.fillStyle = '#1c1c1c';
    ctx.beginPath();
    ctx.arc(0, 8, 5, 0, Math.PI * 2);
    ctx.fill();

    // Металлический кузов
    ctx.fillStyle = '#5c6f84';
    ctx.beginPath();
    ctx.moveTo(-12, 3);
    ctx.lineTo(12, 3);
    ctx.lineTo(9, -9);
    ctx.lineTo(-9, -9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#34495e';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Заполнение навозом
    if (wheelbarrow.kg > 0) {
      const frac = Math.min(1, wheelbarrow.kg / wheelbarrow.maxKg);
      ctx.fillStyle = '#6e451b';
      ctx.beginPath();
      ctx.arc(0, -6 - frac * 4, 7 * frac, 0, Math.PI * 2);
      ctx.fill();
    }

    // Если тачка оставлена внутри слоновника без присмотра — мягкая пульсация риска
    if (wheelbarrow.y > 195) {
      const cautionPulse = (Math.sin(state.worldAnimTime * 4) + 1) * 0.5;
      ctx.strokeStyle = `rgba(243, 156, 18, ${0.4 + 0.45 * cautionPulse})`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-16, -13, 32, 25);
    }

    // Подсказка взаимодействия при приближении
    const dist = Math.hypot(player.x - wheelbarrow.x, player.y - wheelbarrow.y);
    if (dist < 50) {
      drawInteractIcon(wheelbarrow.x, wheelbarrow.y - 20);
    }
  }

  ctx.restore();
}

export function renderWheelbarrowReplacementStation() {
  const dist = Math.hypot(player.x - wheelbarrowStation.x, player.y - wheelbarrowStation.y);
  if (wheelbarrow.isDamaged) {
    ctx.save();
    ctx.fillStyle = 'rgba(28, 20, 14, 0.92)';
    ctx.fillRect(wheelbarrowStation.x - 62, wheelbarrowStation.y - 28, 124, 24);
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(wheelbarrowStation.x - 62, wheelbarrowStation.y - 28, 124, 24);

    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 9.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🛒 КУПИТЬ ТАЧКУ (40 очк)', wheelbarrowStation.x, wheelbarrowStation.y - 12);
    ctx.restore();

    if (dist < 55) {
      drawInteractIcon(wheelbarrowStation.x, wheelbarrowStation.y - 38);
    }
  }
}

export function renderWorldToasts() {
  if (!state.worldToasts || state.worldToasts.length === 0) return;

  ctx.save();
  state.worldToasts.forEach(t => {
    let alpha = 1.0;
    if (t.timer < 0.5) {
      alpha = t.timer / 0.5;
    } else if (t.maxTimer - t.timer < 0.25) {
      alpha = (t.maxTimer - t.timer) / 0.25;
    }
    alpha = Math.max(0, Math.min(1, alpha));

    ctx.font = 'bold 11px sans-serif';
    const label = `${t.icon ? t.icon + ' ' : ''}${t.text}`;
    const textMetrics = ctx.measureText(label);
    const boxW = textMetrics.width + 16;
    const boxH = 22;
    const boxX = t.x - boxW / 2;
    const boxY = t.y - boxH;

    // Плашка уведомления в мире
    ctx.fillStyle = `rgba(20, 16, 14, ${0.92 * alpha})`;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 4);
    ctx.fill();

    ctx.strokeStyle = t.color || '#f1c40f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 4);
    ctx.stroke();

    // Треугольный указатель вниз
    ctx.fillStyle = t.color || '#f1c40f';
    ctx.beginPath();
    ctx.moveTo(t.x - 4, boxY + boxH);
    ctx.lineTo(t.x + 4, boxY + boxH);
    ctx.lineTo(t.x, boxY + boxH + 4);
    ctx.closePath();
    ctx.fill();

    // Текст
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.textAlign = 'center';
    ctx.fillText(label, t.x, boxY + 15);
    ctx.textAlign = 'left';
  });
  ctx.restore();
}

export function render() {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // А) Пол слоновника
  renderFloor();

  // Б) Разметка зон и оборудование
  renderEnvironmentObjects();

  // В) Кучи навоза
  renderDungPiles();

  // В0) ЭТАП 27R.2: мокрые участки настила, зона мойки, стол лакомств и стойка вил
  renderWetSpots();
  renderCareStations();

  // Станция покупки новой тачки взамен сломанной
  renderWheelbarrowReplacementStation();

  // Оставленная тачка (если не в руках кипера)
  renderDroppedWheelbarrow();

  // В1) Внеплановые интерактивные объекты вольера
  renderSituationalObjects();

  // Г) Кормушки и поилка
  renderFeeders();

  // Ж) Ограждения и передние элементы (для создания глубины)
  // РЕДИЗАЙН: Ограда отрисовывается ДО персонажей и ветеринара,
  // чтобы прутья не перекрывали игрока, врача и всплывающие облачка!
  renderFencesAndForewalls();

  // Д) Три слонихи
  elephants.forEach(el => renderElephant(el));

  // Е) Кипер (Игрок)
  renderPlayer();

  // Е1) Приглашённый ветеринарный врач и коммунальный мусоровоз
  renderVetNPC();
  renderGarbageTruck();

  // Всплывающие уведомления непосредственно в игровом мире
  renderWorldToasts();

  // З) Частицы
  renderParticles();

  // И) Освещение времени суток
  renderAmbientLighting();

  // К) HUD (Верхний интерфейс)
  renderHUD();

  // Л) Модальные окна поверх канваса
  if (state.gameState === 'TITLE') {
    renderTitleScreen();
  } else if (state.gameState === 'INSPECTION_MODAL') {
    renderInspectionModal();
  } else if (state.gameState === 'SHIFT_TABLET') {
    renderShiftTablet();
  } else if (state.gameState === 'QTE_URINE') {
    renderUrineQTE();
  } else if (state.gameState === 'PAUSED') {
    renderPauseScreen();
  } else if (state.gameState === 'SHIFT_REPORT') {
    renderShiftReport();
  }

  // Синхронизация наэкранного сенсорного слоя мобильных устройств
  updateTouchControlsUI();
}

