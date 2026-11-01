import { state, gameTime, dayNightCycle, stats, qteState, waterTrough, dumpsterState, garbageTruck, vetSchedule, vetNPC, player, wheelbarrow, elephants, feeders, sawdustStorage, logs } from '../gameState.js';
import { ctx } from '../canvas.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT, shiftPhases } from '../config.js';
import { shiftTasks, getTaskTimeRemaining } from '../shift/tasks.js';
import { getElephantObservationOptions } from '../elephants/inspection.js';
import { restartShift } from '../shift/report.js';
import { getCurrentPhase } from '../systems/dayNight.js';

export function drawWrappedText(context, text, x, y, maxWidth, lineHeight) {
        if (!text) return;
        const words = text.split(' ');
        let line = '';
        let curY = y;
        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = context.measureText(testLine);
          if (metrics.width > maxWidth && n > 0) {
            context.fillText(line, x, curY);
            line = words[n] + ' ';
            curY += lineHeight;
          } else {
            line = testLine;
          }
        }
        context.fillText(line, x, curY);
      }

export function renderTitleScreen() {
        ctx.fillStyle = 'rgba(15, 12, 10, 0.88)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Главная плашка
        ctx.fillStyle = '#2a1f18';
        ctx.fillRect(180, 70, 640, 530);
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 4;
        ctx.strokeRect(180, 70, 640, 530);

        // Заголовок
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 26px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('СИМУЛЯТОР ДЕЖУРНОГО КИПЕРА', CANVAS_WIDTH / 2, 125);
        ctx.fillStyle = '#e8d8b8';
        ctx.font = '17px "Segoe UI", sans-serif';
        ctx.fillText('Павильон гигантов зоопарка: Одри, Марго и Претти', CANVAS_WIDTH / 2, 160);

        // Иконки слонов
        ctx.font = '36px sans-serif';
        ctx.fillText('🐘   🐘   🐘', CANVAS_WIDTH / 2, 215);

        // Описание обязанностей кипера
        ctx.fillStyle = '#f5eedb';
        ctx.font = '13px "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        const duties = [
          '🧹 Уборка навоза: собирайте кучи лопатой в тачку и вывозите в контейнер.',
          '🌾 Кормление: разносите тюки сена и тазы с кашей по трем кормушкам.',
          '🧪 Сбор анализов: вовремя подбегайте с ведром, когда слониха хочет писать!',
          '🦶 Педикюр ногтей: зажимайте Space для расчистки отросших ногтей.',
          '🩺 Осмотр (клавиша F): контролируйте состояние ушей, хобота, ног и хвоста.',
          '⏱ Смена длится с 08:00 до 20:00 с итоговым табелем оценки вашей работы.'
        ];
        duties.forEach((d, i) => {
          ctx.fillText(d, 220, 265 + i * 31);
        });

        // Кнопка «Начать смену»
        ctx.fillStyle = '#27ae60';
        ctx.fillRect(380, 480, 240, 55);
        ctx.strokeStyle = '#2ecc71';
        ctx.lineWidth = 2;
        ctx.strokeRect(380, 480, 240, 55);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('НАЧАТЬ СМЕНУ [SPACE]', CANVAS_WIDTH / 2, 515);

        ctx.font = '12px monospace';
        ctx.fillStyle = '#a89f91';
        ctx.fillText('Управление: WASD / Стрелки · Действие: Пробел или E', CANVAS_WIDTH / 2, 570);

        ctx.textAlign = 'left';
      }

export function renderPauseScreen() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        ctx.fillStyle = '#f5eedb';
        ctx.font = 'bold 30px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ПАУЗА ДЕЖУРСТВА', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
        ctx.font = '15px monospace';
        ctx.fillText('Нажмите P, Esc или кликните в HUD для продолжения смены', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 25);
        ctx.textAlign = 'left';
      }

export function renderInspectionModal() {
        if (!state.inspectingElephant) return;
        const el = state.inspectingElephant;
        const feeder = feeders.find(f => f.id === el.id) || { food: 0 };
        const timeStr = `${String(gameTime.hour).padStart(2, '0')}:${String(Math.floor(gameTime.minute)).padStart(2, '0')}`;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Внешний контур и фон карточки
        const modalX = 120;
        const modalY = 32;
        const modalW = 760;
        const modalH = 616;

        ctx.fillStyle = '#fdfaf2';
        ctx.fillRect(modalX, modalY, modalW, modalH);
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 3;
        ctx.strokeRect(modalX, modalY, modalW, modalH);

        // Шапка карточки
        ctx.fillStyle = '#243342';
        ctx.fillRect(modalX, modalY, modalW, 56);
        ctx.fillStyle = '#c5a059';
        ctx.fillRect(modalX, modalY + 54, modalW, 2);

        ctx.fillStyle = '#f4d68a';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`📋 КЛИНИЧЕСКАЯ КАРТОЧКА НАБЛЮДЕНИЙ: ${el.name.toUpperCase()} (${el.age} ЛЕТ)`, modalX + 16, modalY + 26);

        ctx.font = '12px "Segoe UI", sans-serif';
        ctx.fillStyle = '#d5dfe2';
        ctx.fillText(`Роль: ${el.role} · Самочувствие: ${el.health} (${el.mood}) · Действие: ${el.statusText || 'Осматривается'}`, modalX + 16, modalY + 46);

        // Кнопка [✕] в верхнем правом углу шапки
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(modalX + modalW - 46, modalY + 10, 36, 36);
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(modalX + modalW - 46, modalY + 10, 36, 36);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('✕', modalX + modalW - 28, modalY + 34);
        ctx.textAlign = 'left';

        // ================= ЛЕВАЯ КОЛОНКА: ФИЗИОЛОГИЧЕСКИЙ ПРОФИЛЬ =================
        const col1X = modalX + 16;
        const col1Y = modalY + 68;
        const col1W = 356;
        const col1H = 496;

        ctx.fillStyle = '#304252';
        ctx.fillRect(col1X, col1Y, col1W, 24);
        ctx.fillStyle = '#f4d68a';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('ФИЗИОЛОГИЧЕСКИЙ ПРОФИЛЬ ЖИВОТНОГО', col1X + 10, col1Y + 16);

        ctx.fillStyle = '#f7f2e4';
        ctx.fillRect(col1X, col1Y + 24, col1W, col1H - 24);
        ctx.strokeStyle = '#dcd0bc';
        ctx.lineWidth = 1;
        ctx.strokeRect(col1X, col1Y, col1W, col1H);

        // 1. Сытость
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#2c3e50';
        ctx.fillText('Сытость:', col1X + 10, col1Y + 44);
        ctx.fillStyle = '#34495e';
        ctx.fillRect(col1X + 70, col1Y + 35, 160, 10);
        ctx.fillStyle = el.satiety > 40 ? '#27ae60' : '#e67e22';
        ctx.fillRect(col1X + 70, col1Y + 35, Math.max(0, (el.satiety / 100) * 160), 10);
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#2c3e50';
        ctx.fillText(`${Math.round(el.satiety)}% (${feeder.food}%)`, col1X + 236, col1Y + 44);

        // 2. Жажда / Водный баланс
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#2c3e50';
        ctx.fillText('Жажда:', col1X + 10, col1Y + 66);
        ctx.fillStyle = '#34495e';
        ctx.fillRect(col1X + 70, col1Y + 57, 160, 10);
        ctx.fillStyle = el.thirst > 60 ? '#e74c3c' : '#3498db';
        ctx.fillRect(col1X + 70, col1Y + 57, Math.max(0, (el.thirst / 100) * 160), 10);
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#2c3e50';
        ctx.fillText(`${Math.round(el.thirst)}% (поил: ${Math.round(waterTrough.water)}%)`, col1X + 236, col1Y + 66);

        // 3. Бодрость / Тонус
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#2c3e50';
        ctx.fillText('Бодрость:', col1X + 10, col1Y + 88);
        ctx.fillStyle = '#34495e';
        ctx.fillRect(col1X + 70, col1Y + 79, 160, 10);
        ctx.fillStyle = el.energy > 40 ? '#2ecc71' : '#f39c12';
        ctx.fillRect(col1X + 70, col1Y + 79, Math.max(0, (el.energy / 100) * 160), 10);
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#2c3e50';
        ctx.fillText(`${Math.round(el.energy)}%`, col1X + 236, col1Y + 88);

        // Разделительная линия
        ctx.fillStyle = '#e5dcc7';
        ctx.fillRect(col1X + 10, col1Y + 100, col1W - 20, 1);

        // Клинические пункты осмотра
        const statusItems = [
          { label: 'Уши и теплообмен:', val: el.earsStatus },
          { label: 'Хобот и дыхание:', val: el.trunkStatus },
          { label: 'Стопы и подошвы:', val: `${el.feetStatus} · ${getFootDirtStatus(el)} (${Math.round(el.footDirt)}%)` },
          { label: 'Время последнего осмотра:', val: el.lastInspected === 'Не проводился' ? 'Не проводился' : el.lastInspected }
        ];

        statusItems.forEach((item, idx) => {
          const sy = col1Y + 118 + idx * 36;
          ctx.font = 'bold 11px "Segoe UI", sans-serif';
          ctx.fillStyle = '#2c3e50';
          ctx.fillText(item.label, col1X + 10, sy);
          ctx.font = '11px "Segoe UI", sans-serif';
          ctx.fillStyle = '#27ae60';
          ctx.fillText(`✓ ${item.val}`, col1X + 10, sy + 16);
        });

        // Блок динамики с момента прошлого осмотра (Этап 10)
        const dynBoxY = col1Y + 270;
        ctx.fillStyle = '#ede4d0';
        ctx.fillRect(col1X + 10, dynBoxY, col1W - 20, 94);
        ctx.strokeStyle = '#d5cbb3';
        ctx.lineWidth = 1;
        ctx.strokeRect(col1X + 10, dynBoxY, col1W - 20, 94);

        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#7f5a28';
        ctx.fillText('ДИНАМИКА С ПРОШЛОГО НАБЛЮДЕНИЯ:', col1X + 18, dynBoxY + 18);

        if (el.lastInspectionSnapshot) {
          const prev = el.lastInspectionSnapshot;
          const dSat = Math.round(el.satiety) - prev.satiety;
          const dThirst = Math.round(el.thirst) - prev.thirst;
          const dEnergy = Math.round(el.energy) - prev.energy;

          ctx.font = '11px "Segoe UI", sans-serif';
          ctx.fillStyle = '#2c3e50';
          ctx.fillText(`• Базовое наблюдение зафиксировано в ${prev.time || el.lastInspected}`, col1X + 18, dynBoxY + 36);

          // Дельты с цветовой маркировкой
          ctx.font = 'bold 11px monospace';
          const satSign = dSat >= 0 ? '+' : '';
          const thirstSign = dThirst >= 0 ? '+' : '';
          const energySign = dEnergy >= 0 ? '+' : '';

          ctx.fillStyle = dSat >= 0 ? '#27ae60' : '#d35400';
          ctx.fillText(`Сытость: ${satSign}${dSat}%`, col1X + 18, dynBoxY + 54);

          ctx.fillStyle = dThirst <= 0 ? '#2980b9' : '#c0392b';
          ctx.fillText(`Жажда: ${thirstSign}${dThirst}%`, col1X + 130, dynBoxY + 54);

          ctx.fillStyle = dEnergy >= 0 ? '#27ae60' : '#8e44ad';
          ctx.fillText(`Тонус: ${energySign}${dEnergy}%`, col1X + 235, dynBoxY + 54);

          // Пояснение динамики на основе реальных игровых показателей
          ctx.font = '10px "Segoe UI", sans-serif';
          let dynamicSummary = '• Показатели стабильны, поведение соответствует норме';
          if (dSat > 5) dynamicSummary = '• Сытость выросла (+кормление из кормушки)';
          else if (dSat < -8) dynamicSummary = '• Сытость снижается, животному потребуется корм';
          else if (dThirst < -8) dynamicSummary = '• Жажда утолена (животное пило из автопоилки)';
          else if (dThirst > 8) dynamicSummary = '• Жажда нарастает, требуется контроль уровня воды';
          else if (dEnergy > 5) dynamicSummary = '• Тонус восстановился после отдыха на настиле';
          else if (dEnergy < -8) dynamicSummary = '• Умеренное утомление от физической активности';

          ctx.fillStyle = '#2c3e50';
          ctx.fillText(dynamicSummary, col1X + 18, dynBoxY + 76);
        } else {
          ctx.font = 'italic 11px "Segoe UI", sans-serif';
          ctx.fillStyle = '#7f8c8d';
          ctx.fillText('«Предыдущих наблюдений нет (первичный осмотр смены)»', col1X + 18, dynBoxY + 44);
          ctx.font = '10px "Segoe UI", sans-serif';
          ctx.fillStyle = '#555';
          ctx.fillText('Зафиксируйте первое наблюдение кнопкой в блоке справа.', col1X + 18, dynBoxY + 68);
        }

        // Штамп дежурного кипера
        ctx.save();
        ctx.translate(col1X + col1W / 2, col1Y + 420);
        ctx.rotate(-0.06);
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-90, -22, 180, 44);
        ctx.fillStyle = '#c0392b';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ОСМОТРЕНА КИПЕРОМ', 0, -2);
        ctx.font = '10px monospace';
        ctx.fillText(`СМЕНА 08:00 - 20:00 · ${timeStr}`, 0, 14);
        ctx.restore();
        ctx.textAlign = 'left';

        // ================= ПРАВАЯ КОЛОНКА: ПРОЦЕДУРЫ И НАБЛЮДЕНИЯ =================
        const col2X = modalX + 388;
        const col2Y = modalY + 68;
        const col2W = 356;
        const col2H = 496;

        // Блок А: Ветеринарные процедуры (142px)
        ctx.fillStyle = '#304252';
        ctx.fillRect(col2X, col2Y, col2W, 22);
        ctx.fillStyle = '#f4d68a';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('ВЕТЕРИНАРНЫЕ ПРОЦЕДУРЫ РАСПОРЯДКА', col2X + 10, col2Y + 15);

        ctx.fillStyle = '#f7f2e4';
        ctx.fillRect(col2X, col2Y + 22, col2W, 120);
        ctx.strokeStyle = '#dcd0bc';
        ctx.lineWidth = 1;
        ctx.strokeRect(col2X, col2Y, col2W, 142);

        // Процедура 1: Педикюр
        ctx.font = 'bold 11px "Segoe UI", sans-serif';
        ctx.fillStyle = '#2c3e50';
        ctx.fillText('1. Профилактический педикюр стоп:', col2X + 10, col2Y + 42);

        if (el.pedicureDone) {
          ctx.font = 'bold 10px monospace';
          ctx.fillStyle = '#27ae60';
          ctx.fillText('✓ ВЫПОЛНЕНО (стопы обработаны)', col2X + 10, col2Y + 58);
          // Деактивированная кнопка
          ctx.fillStyle = '#bdc3c7';
          ctx.fillRect(col2X + 205, col2Y + 36, 140, 24);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('✓ Расчищено', col2X + 275, col2Y + 52);
          ctx.textAlign = 'left';
        } else if (player.carrying !== 'none') {
          ctx.font = '10px "Segoe UI", sans-serif';
          ctx.fillStyle = '#e67e22';
          ctx.fillText('Руки заняты инвентарём', col2X + 10, col2Y + 58);
          ctx.fillStyle = '#e67e22';
          ctx.fillRect(col2X + 205, col2Y + 36, 140, 24);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Освободите руки', col2X + 275, col2Y + 52);
          ctx.textAlign = 'left';
        } else if (el.state === 'REST') {
          ctx.font = '10px "Segoe UI", sans-serif';
          ctx.fillStyle = '#7f8c8d';
          ctx.fillText('Слониха спит (не тревожить)', col2X + 10, col2Y + 58);
          ctx.fillStyle = '#95a5a6';
          ctx.fillRect(col2X + 205, col2Y + 36, 140, 24);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Слониха спит', col2X + 275, col2Y + 52);
          ctx.textAlign = 'left';
        } else {
          ctx.font = 'bold 10px monospace';
          ctx.fillStyle = '#d35400';
          ctx.fillText('▶ ДОСТУПНО ДЛЯ ПРОВЕДЕНИЯ', col2X + 10, col2Y + 58);
          ctx.fillStyle = '#27ae60';
          ctx.fillRect(col2X + 205, col2Y + 36, 140, 24);
          ctx.strokeStyle = '#2ecc71';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(col2X + 205, col2Y + 36, 140, 24);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('💅 Расчистить стопы', col2X + 275, col2Y + 52);
          ctx.textAlign = 'left';
        }

        // Процедура 2: Отбор пробы мочи
        ctx.font = 'bold 11px "Segoe UI", sans-serif';
        ctx.fillStyle = '#2c3e50';
        ctx.fillText('2. Отбор пробы мочи в лабораторию:', col2X + 10, col2Y + 84);

        if (el.urineSampleDone) {
          ctx.font = 'bold 10px monospace';
          ctx.fillStyle = '#27ae60';
          ctx.fillText('✓ ПРОБА В ЛАБОРАТОРИИ (анализ сдан)', col2X + 10, col2Y + 102);
        } else if (el.isWantingPee) {
          ctx.font = 'bold 10px monospace';
          ctx.fillStyle = '#c0392b';
          ctx.fillText('▶ СРОЧНО! Слониха мочится прямо сейчас!', col2X + 10, col2Y + 100);
          ctx.font = '10px "Segoe UI", sans-serif';
          ctx.fillStyle = '#7f1d1d';
          ctx.fillText('Закройте карточку [F] и подбегите с ведром!', col2X + 10, col2Y + 114);
        } else {
          ctx.font = 'bold 10px monospace';
          ctx.fillStyle = '#7f8c8d';
          ctx.fillText(`⏳ ОЖИДАНИЕ (позыв через ~${Math.max(5, Math.round(el.peeTimer))} с)`, col2X + 10, col2Y + 100);
          ctx.font = '10px "Segoe UI", sans-serif';
          ctx.fillStyle = '#666';
          ctx.fillText('Для забора возьмите ведро на стойке у ворот', col2X + 10, col2Y + 114);
        }

        // Блок Б: Фиксация наблюдения в журнал (176px)
        const b2Y = col2Y + 150;
        ctx.fillStyle = '#304252';
        ctx.fillRect(col2X, b2Y, col2W, 22);
        ctx.fillStyle = '#f4d68a';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('ФИКСАЦИЯ НАБЛЮДЕНИЯ ДЕЖУРНОГО КИПЕРА', col2X + 10, b2Y + 15);

        ctx.fillStyle = '#f7f2e4';
        ctx.fillRect(col2X, b2Y + 22, col2W, 154);
        ctx.strokeStyle = '#dcd0bc';
        ctx.lineWidth = 1;
        ctx.strokeRect(col2X, b2Y, col2W, 176);

        const obsOptions = getElephantObservationOptions(el);
        const catIdx = Math.max(0, Math.min(obsOptions.length - 1, el.selectedObsCategory || 0));
        const currentObs = obsOptions[catIdx] || obsOptions[0];

        // Карусель категорий [◄] Категория [►]
        ctx.fillStyle = '#34495e';
        ctx.fillRect(col2X + 10, b2Y + 30, 34, 24);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('◄', col2X + 27, b2Y + 46);

        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`${currentObs.category} (${catIdx + 1}/${obsOptions.length})`, col2X + col2W / 2, b2Y + 46);

        ctx.fillStyle = '#34495e';
        ctx.fillRect(col2X + col2W - 44, b2Y + 30, 34, 24);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('►', col2X + col2W - 27, b2Y + 46);
        ctx.textAlign = 'left';

        // Текстовое поле превью текущего наблюдения
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(col2X + 10, b2Y + 60, col2W - 20, 56);
        ctx.strokeStyle = '#bdc3c7';
        ctx.lineWidth = 1;
        ctx.strokeRect(col2X + 10, b2Y + 60, col2W - 20, 56);

        ctx.font = '11px "Segoe UI", sans-serif';
        ctx.fillStyle = currentObs.ok ? '#2c3e50' : '#c0392b';
        drawWrappedText(ctx, currentObs.text, col2X + 16, b2Y + 76, col2W - 32, 16);

        // Кнопка записи наблюдения или контрольной проверки ситуации
        const isFollowUpReady = state.activeSituationalEvent && state.activeSituationalEvent.status === 'active' && state.activeSituationalEvent.elephantId === el.id && state.activeSituationalEvent.followUpReady && !state.activeSituationalEvent.followUpDone;

        if (isFollowUpReady) {
          ctx.fillStyle = '#1b6ca8';
          ctx.fillRect(col2X + 10, b2Y + 124, col2W - 20, 32);
          ctx.strokeStyle = '#3498db';
          ctx.lineWidth = 2;
          ctx.strokeRect(col2X + 10, b2Y + 124, col2W - 20, 32);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🔍 ПОДТВЕРДИТЬ КОНТРОЛЬНУЮ ПРОВЕРКУ (+25 ОЧК.)', col2X + col2W / 2, b2Y + 145);
          ctx.textAlign = 'left';
        } else {
          ctx.fillStyle = '#27ae60';
          ctx.fillRect(col2X + 10, b2Y + 124, col2W - 20, 32);
          ctx.strokeStyle = '#2ecc71';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(col2X + 10, b2Y + 124, col2W - 20, 32);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('📝 ВНЕСТИ НАБЛЮДЕНИЕ В ЖУРНАЛ СМЕНЫ', col2X + col2W / 2, b2Y + 145);
          ctx.textAlign = 'left';
        }

        // Блок В: История наблюдений за смену (160px)
        const b3Y = b2Y + 184;
        ctx.fillStyle = '#304252';
        ctx.fillRect(col2X, b3Y, col2W, 22);
        ctx.fillStyle = '#f4d68a';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('ИСТОРИЯ НАБЛЮДЕНИЙ ЗА ТЕКУЩУЮ СМЕНУ', col2X + 10, b3Y + 15);

        ctx.fillStyle = '#f7f2e4';
        ctx.fillRect(col2X, b3Y + 22, col2W, 118);
        ctx.strokeStyle = '#dcd0bc';
        ctx.lineWidth = 1;
        ctx.strokeRect(col2X, b3Y, col2W, 140);

        if (el.observations && el.observations.length > 0) {
          el.observations.slice(0, 3).forEach((obs, i) => {
            const oy = b3Y + 36 + i * 36;
            ctx.font = 'bold 10px monospace';
            ctx.fillStyle = '#7f5a28';
            ctx.fillText(`[${obs.time}] ${obs.category}:`, col2X + 10, oy);
            if (obs.snapshot) {
              ctx.font = '9px monospace';
              ctx.fillStyle = '#2980b9';
              ctx.fillText(`(С:${obs.snapshot.satiety}% Ж:${obs.snapshot.thirst}% Т:${obs.snapshot.energy}%)`, col2X + 215, oy);
            }
            ctx.font = '10px "Segoe UI", sans-serif';
            ctx.fillStyle = '#2c3e50';
            const shortText = obs.text.length > 46 ? obs.text.substring(0, 44) + '...' : obs.text;
            ctx.fillText(shortText, col2X + 10, oy + 14);
          });
        } else {
          ctx.font = 'italic 11px "Segoe UI", sans-serif';
          ctx.fillStyle = '#7f8c8d';
          ctx.fillText('В эту смену наблюдения ещё не вносились.', col2X + 12, b3Y + 48);
          ctx.font = '10px "Segoe UI", sans-serif';
          ctx.fillStyle = '#666';
          ctx.fillText('Используйте стрелки ◄ / ► выше и нажмите кнопку фиксации.', col2X + 12, b3Y + 68);
        }

        // ================= НИЖНЯЯ КНОПКА ЗАКРЫТИЯ =================
        ctx.fillStyle = '#2980b9';
        ctx.fillRect(350, 582, 300, 40);
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 2;
        ctx.strokeRect(350, 582, 300, 40);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ЗАКРЫТЬ КАРТОЧКУ [F / ESC / КЛИК]', 500, 607);
        ctx.textAlign = 'left';
      }

export function renderUrineQTE() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        const el = qteState.elephant;

        // Панель мини-игры
        ctx.fillStyle = '#241d18';
        ctx.fillRect(250, 200, 500, 280);
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 3;
        ctx.strokeRect(250, 200, 500, 280);

        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 20px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🧪 ВЗЯТИЕ АНАЛИЗА МОЧИ В ВЕДРО', CANVAS_WIDTH / 2, 245);

        ctx.fillStyle = '#ecf0f1';
        ctx.font = '13px "Segoe UI", sans-serif';
        ctx.fillText(`Пациент: слониха ${el ? el.name : ''}. Остановите бегунок в ЗЕЛЕНОЙ зоне!`, CANVAS_WIDTH / 2, 280);

        // Шкала ловли
        const barX = 300;
        const barY = 320;
        const barW = 400;
        const barH = 34;

        // Фоновый трек
        ctx.fillStyle = '#34495e';
        ctx.fillRect(barX, barY, barW, barH);

        // Желтая зона (хорошо)
        const targetMinX = barX + (barW * qteState.targetMin) / 100;
        const targetMaxX = barX + (barW * qteState.targetMax) / 100;
        ctx.fillStyle = '#f39c12';
        ctx.fillRect(targetMinX, barY, targetMaxX - targetMinX, barH);

        // Зеленая зона (идеально в центре)
        const perfMinX = barX + (barW * (qteState.targetMin + 5)) / 100;
        const perfMaxX = barX + (barW * (qteState.targetMax - 5)) / 100;
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(perfMinX, barY, perfMaxX - perfMinX, barH);

        // Бегунок
        const sliderX = barX + (barW * qteState.sliderPos) / 100;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sliderX - 4, barY - 6, 8, barH + 12);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(sliderX - 2, barY - 4, 4, barH + 8);

        // Результат
        if (qteState.result === 'perfect') {
          ctx.fillStyle = '#2ecc71';
          ctx.font = 'bold 18px "Segoe UI", sans-serif';
          ctx.fillText('✨ ИДЕАЛЬНО! ЧИСТАЯ ПРОБА ПОЛУЧЕНА (+100 ОЧКОВ)', CANVAS_WIDTH / 2, 410);
        } else if (qteState.result === 'good') {
          ctx.fillStyle = '#f1c40f';
          ctx.font = 'bold 18px "Segoe UI", sans-serif';
          ctx.fillText('👍 ХОРОШО! АНАЛИЗ УСПЕШНО СОБРАН (+50 ОЧКОВ)', CANVAS_WIDTH / 2, 410);
        } else if (qteState.result === 'miss') {
          ctx.fillStyle = '#e74c3c';
          ctx.font = 'bold 18px "Segoe UI", sans-serif';
          ctx.fillText('💦 ПРОМАХ! ПРОБА УТЕРЯНА', CANVAS_WIDTH / 2, 410);
        } else {
          ctx.fillStyle = '#f5eedb';
          ctx.font = 'bold 16px monospace';
          ctx.fillText('НАЖМИТЕ [SPACE] ИЛИ КЛИКНИТЕ', CANVAS_WIDTH / 2, 415);
        }

        ctx.textAlign = 'left';
      }

export function renderShiftTablet() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Корпус планшета
        ctx.fillStyle = '#161e22';
        ctx.fillRect(50, 18, 900, 644);
        ctx.strokeStyle = '#39474e';
        ctx.lineWidth = 2;
        ctx.strokeRect(50, 18, 900, 644);

        // Внутренний обод экрана
        ctx.fillStyle = '#1a2327';
        ctx.fillRect(58, 26, 884, 628);
        ctx.strokeStyle = '#bda162';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(58, 26, 884, 628);

        // Верхняя информационная панель планшета
        ctx.fillStyle = '#222d32';
        ctx.fillRect(66, 32, 868, 56);
        ctx.strokeStyle = '#314147';
        ctx.lineWidth = 1;
        ctx.strokeRect(66, 32, 868, 56);

        ctx.fillStyle = '#f4d68a';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('📋 ПЛАНШЕТ ДЕЖУРНОГО КИПЕРА СЛОНОВНИКА', 78, 52);

        const timeStr = `${String(gameTime.hour).padStart(2, '0')}:${String(Math.floor(gameTime.minute)).padStart(2, '0')}`;
        const curPh = getCurrentPhase();
        const curH = gameTime.hour + gameTime.minute / 60;
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#c8d1d5';
        const phaseModeText = dayNightCycle.phase === 'NIGHT' ? '🌙 НОЧНАЯ СМЕНА' : (dayNightCycle.phase === 'DUSK' ? '🌅 ВЕЧЕРНИЙ ЗАКАТ' : (dayNightCycle.phase === 'DAWN' ? '🌄 УТРЕННИЙ РАССВЕТ' : '☀️ ДНЕВНАЯ СМЕНА'));
        ctx.fillText(`Текущее время: ${timeStr} · ${curPh.title} · ${phaseModeText}`, 78, 72);

        // Сводка баллов в правом верхнем углу шапки
        ctx.textAlign = 'right';
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#f1c40f';
        ctx.fillText(`★ ${stats.totalScore} очков | Наблюдений: ${stats.observationsRecorded || 0} | Задачи: ${stats.tasksCompleted}/${shiftTasks.length}`, 922, 52);

        // Индикатор соблюдения графика смены
        const compliancePct = Math.round((stats.tasksCompleted / Math.max(1, stats.tasksCompleted + stats.tasksMissed)) * 100);
        ctx.font = '11px sans-serif';
        ctx.fillStyle = compliancePct >= 80 ? '#2ecc71' : (compliancePct >= 50 ? '#f1c40f' : '#e74c3c');
        ctx.fillText(`Соблюдение регламента: ${compliancePct}%`, 922, 72);
        ctx.textAlign = 'left';

        // 24-часовая временная шкала суточного цикла смены (08:00 - 08:00 след. утра)
        const barX = 66;
        const barY = 92;
        const barW = 868;
        const barH = 10;
        ctx.fillStyle = '#111719';
        ctx.fillRect(barX, barY, barW, barH);

        // Отрисовка цветных зон фаз суточного цикла (дневные и ночные блоки)
        shiftPhases.forEach((ph) => {
          const phStartOffset = ph.startHour >= 8.0 ? (ph.startHour - 8.0) : (ph.startHour + 16.0);
          const phEndHourNorm = (ph.endHour === 0 ? 24.0 : ph.endHour);
          const phEndOffset = phEndHourNorm >= 8.0 ? (phEndHourNorm - 8.0) : (phEndHourNorm + 16.0);
          const phSpan = (phEndOffset >= phStartOffset) ? (phEndOffset - phStartOffset) : (24.0 - phStartOffset + phEndOffset);

          const startX = barX + (phStartOffset / 24.0) * barW;
          const spanW = (phSpan / 24.0) * barW;
          const isNight = ph.id.startsWith('night') || ph.id === 'dawn_shift';
          const isCurrentPhase = curH >= ph.startHour && (ph.endHour === 24 ? curH < 24 : curH < ph.endHour);

          ctx.fillStyle = isCurrentPhase 
            ? (isNight ? 'rgba(52, 152, 219, 0.55)' : 'rgba(241, 196, 15, 0.55)')
            : (isNight ? 'rgba(26, 42, 68, 0.45)' : 'rgba(52, 73, 94, 0.35)');
          ctx.fillRect(startX, barY, spanW, barH);
          ctx.strokeStyle = '#2c3e50';
          ctx.lineWidth = 1;
          ctx.strokeRect(startX, barY, spanW, barH);
        });

        // Бегунок текущего времени суточного цикла
        const cycleProgress = dayNightCycle.cycleTimer / dayNightCycle.totalSec;
        const progressX = barX + Math.max(0, Math.min(barW, cycleProgress * barW));
        ctx.fillStyle = dayNightCycle.phase === 'NIGHT' ? '#3498db' : '#2ecc71';
        ctx.fillRect(barX, barY, progressX - barX, barH);
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(progressX - 3, barY - 3, 6, barH + 6);

        // --- ЛЕВАЯ КОЛОНКА: РЕГЛАМЕНТНЫЕ ЗАДАЧИ СМЕНЫ ---
        const col1X = 66;
        const col1Y = 108;
        const col1W = 460;
        const col1H = 472;

        ctx.fillStyle = '#222d32';
        ctx.fillRect(col1X, col1Y, col1W, 24);
        ctx.strokeStyle = '#314147';
        ctx.lineWidth = 1;
        ctx.strokeRect(col1X, col1Y, col1W, col1H);

        ctx.fillStyle = '#f4d68a';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('РЕГЛАМЕНТНЫЕ ЗАДАЧИ ДЕЖУРСТВА (08:00 — 20:00)', col1X + 10, col1Y + 16);

        ctx.fillStyle = '#172023';
        ctx.fillRect(col1X, col1Y + 24, col1W, col1H - 24);

        // 16 задач в компактном виде (28px на строку) с приоритетами и дедлайнами (Этап 08)
        shiftTasks.forEach((task, idx) => {
          const rowY = col1Y + 24 + idx * 28;
          if (rowY + 28 > col1Y + col1H) return;

          // Подсветка строки
          if (task.status === 'available') {
            ctx.fillStyle = task.priority === 'urgent' ? 'rgba(231, 76, 60, 0.18)' : 'rgba(241, 196, 15, 0.10)';
            ctx.fillRect(col1X + 1, rowY, col1W - 2, 27);
          } else if (task.status === 'missed') {
            ctx.fillStyle = 'rgba(231, 76, 60, 0.16)';
            ctx.fillRect(col1X + 1, rowY, col1W - 2, 27);
          } else if (task.status === 'recovered') {
            ctx.fillStyle = 'rgba(39, 174, 96, 0.14)';
            ctx.fillRect(col1X + 1, rowY, col1W - 2, 27);
          } else if (task.status === 'completed') {
            ctx.fillStyle = 'rgba(46, 204, 113, 0.05)';
            ctx.fillRect(col1X + 1, rowY, col1W - 2, 27);
          }

          // Бейдж приоритета (Urgent / Scheduled / Secondary)
          ctx.font = 'bold 8.5px monospace';
          if (task.priority === 'urgent') {
            ctx.fillStyle = '#c0392b';
            ctx.fillRect(col1X + 6, rowY + 3, 54, 12);
            ctx.fillStyle = '#ffffff';
            ctx.fillText('🔥 СРОЧНО', col1X + 8, rowY + 12);
          } else if (task.priority === 'scheduled') {
            ctx.fillStyle = '#2980b9';
            ctx.fillRect(col1X + 6, rowY + 3, 48, 12);
            ctx.fillStyle = '#ffffff';
            ctx.fillText('⏳ ПЛАН', col1X + 8, rowY + 12);
          } else {
            ctx.fillStyle = '#27ae60';
            ctx.fillRect(col1X + 6, rowY + 3, 44, 12);
            ctx.fillStyle = '#ffffff';
            ctx.fillText('⭐ ДОП', col1X + 8, rowY + 12);
          }

          // Статус и оставшееся время
          const timeInfo = getTaskTimeRemaining(task);
          ctx.font = 'bold 9.5px monospace';
          ctx.fillStyle = timeInfo.color;
          ctx.fillText(`[${timeInfo.text}]`, col1X + 65, rowY + 12);

          // Временной слот
          ctx.font = '9px monospace';
          ctx.fillStyle = '#7a8c92';
          ctx.fillText(task.timeRange || '', col1X + 215, rowY + 12);

          // Очки
          ctx.textAlign = 'right';
          ctx.font = 'bold 10px monospace';
          if (task.status === 'completed') {
            ctx.fillStyle = '#2ecc71';
            ctx.fillText(`+${task.points}`, col1X + col1W - 8, rowY + 12);
          } else if (task.status === 'recovered') {
            ctx.fillStyle = '#27ae60';
            ctx.fillText(`+${Math.round(task.points * 0.65)} испр.`, col1X + col1W - 8, rowY + 12);
          } else if (task.status === 'missed') {
            ctx.fillStyle = '#e74c3c';
            ctx.fillText('0 очк.', col1X + col1W - 8, rowY + 12);
          } else {
            ctx.fillStyle = '#f39c12';
            ctx.fillText(`+${task.points}`, col1X + col1W - 8, rowY + 12);
          }
          ctx.textAlign = 'left';

          // Название и краткое пояснение
          ctx.font = 'bold 10.5px sans-serif';
          ctx.fillStyle = task.status === 'completed' ? '#7f8c8d' : (task.status === 'missed' ? '#e74c3c' : (task.status === 'recovered' ? '#27ae60' : (task.status === 'available' ? '#ffffff' : '#c8d1d5')));
          ctx.fillText(task.title, col1X + 8, rowY + 23);

          ctx.font = '9.5px sans-serif';
          ctx.fillStyle = '#6d7f85';
          const titleWidth = ctx.measureText(task.title).width;
          let descText = `— ${task.desc}`;
          if (col1X + 14 + titleWidth + ctx.measureText(descText).width > col1X + col1W - 8) {
            while (descText.length > 8 && col1X + 14 + titleWidth + ctx.measureText(descText + '...').width > col1X + col1W - 8) {
              descText = descText.substring(0, descText.length - 2);
            }
            descText += '...';
          }
          ctx.fillText(descText, col1X + 14 + titleWidth, rowY + 23);

          // Разделительная линия
          ctx.fillStyle = '#202a2e';
          ctx.fillRect(col1X + 4, rowY + 27, col1W - 8, 1);
        });

        // --- ПРАВАЯ КОЛОНКА: МОНИТОРИНГ И РЕСУРСЫ ---
        const col2X = 534;
        const col2Y = 108;
        const col2W = 400;
        const col2H = 472;

        // Блок 1: Состояние слоних (180px)
        ctx.fillStyle = '#222d32';
        ctx.fillRect(col2X, col2Y, col2W, 22);
        ctx.strokeStyle = '#314147';
        ctx.lineWidth = 1;
        ctx.strokeRect(col2X, col2Y, col2W, 180);

        ctx.fillStyle = '#f4d68a';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('🐘 МОНИТОРИНГ ПОДОПЕЧНЫХ СЛОНИХ', col2X + 10, col2Y + 15);

        ctx.fillStyle = '#172023';
        ctx.fillRect(col2X, col2Y + 22, col2W, 158);

        elephants.forEach((el, i) => {
          const ey = col2Y + 30 + i * 50;

          // Имя, возраст и действие
          ctx.font = 'bold 12px "Segoe UI", sans-serif';
          ctx.fillStyle = '#f5eedb';
          const actLabel = el.state === 'EAT' ? 'Кормится 🌾' : (el.state === 'DRINK' ? 'Пьет воду 💧' : (el.state === 'REST' ? 'Отдыхает 💤' : 'Бродит 🐾'));
          ctx.fillText(`${el.name} (${el.age} лет) · ${actLabel}`, col2X + 10, ey + 10);

          // Шкала сытости
          ctx.font = '10px monospace';
          ctx.fillStyle = '#bdc3c7';
          ctx.fillText(`Сытость: ${Math.round(el.satiety)}%`, col2X + 10, ey + 24);
          ctx.fillStyle = '#34495e';
          ctx.fillRect(col2X + 90, ey + 16, 80, 8);
          ctx.fillStyle = el.satiety > 50 ? '#27ae60' : '#e67e22';
          ctx.fillRect(col2X + 90, ey + 16, Math.max(0, (el.satiety / 100) * 80), 8);

          // Шкала жажды
          ctx.fillStyle = '#bdc3c7';
          ctx.fillText(`Жажда: ${Math.round(el.thirst)}%`, col2X + 185, ey + 24);
          ctx.fillStyle = '#34495e';
          ctx.fillRect(col2X + 250, ey + 16, 70, 8);
          ctx.fillStyle = el.thirst > 60 ? '#e74c3c' : '#3498db';
          ctx.fillRect(col2X + 250, ey + 16, Math.max(0, (el.thirst / 100) * 70), 8);

          // Осмотр и педикюр
          ctx.font = '10px sans-serif';
          ctx.fillStyle = el.lastInspected === 'Не проводился' ? '#e67e22' : '#2ecc71';
          const obsCount = el.observations ? el.observations.length : 0;
          const inspText = el.lastInspected === 'Не проводился' 
            ? 'Осмотр: [F] не проведен' 
            : `Осмотр: [F] ${el.lastInspected} (${obsCount} зап.)`;
          ctx.fillText(inspText, col2X + 10, ey + 38);

          ctx.fillStyle = el.pedicureDone ? '#2ecc71' : '#f39c12';
          ctx.fillText(el.pedicureDone ? 'Педикюр: норма ✓' : 'Педикюр: требует расчистки ⚠️', col2X + 185, ey + 38);

          // Разделитель
          if (i < 2) {
            ctx.fillStyle = '#243035';
            ctx.fillRect(col2X + 8, ey + 44, col2W - 16, 1);
          }
        });

        // Блок 2: Хозяйство и ресурсы вольера (134px)
        const b2Y = col2Y + 186;
        ctx.fillStyle = '#222d32';
        ctx.fillRect(col2X, b2Y, col2W, 22);
        ctx.strokeStyle = '#314147';
        ctx.lineWidth = 1;
        ctx.strokeRect(col2X, b2Y, col2W, 134);

        ctx.fillStyle = '#f4d68a';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('🚜 ХОЗЯЙСТВО, ОБОРУДОВАНИЕ И РЕСУРСЫ', col2X + 10, b2Y + 15);

        ctx.fillStyle = '#172023';
        ctx.fillRect(col2X, b2Y + 22, col2W, 112);

        // 1. Автопоилка
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#ecf0f1';
        ctx.fillText('Поилка вольера:', col2X + 10, b2Y + 36);
        ctx.fillStyle = '#34495e';
        ctx.fillRect(col2X + 125, b2Y + 28, 90, 8);
        ctx.fillStyle = waterTrough.water < 20 ? '#e74c3c' : '#3498db';
        ctx.fillRect(col2X + 125, b2Y + 28, Math.max(0, (waterTrough.water / 100) * 90), 8);
        ctx.font = 'bold 9.5px monospace';
        ctx.fillText(`${Math.round(waterTrough.water)}% ${waterTrough.water < 20 ? '⚠️' : ''}`, col2X + 220, b2Y + 36);

        // 2. Контейнер утилизации навоза (500 кг)
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#ecf0f1';
        ctx.fillText('Контейнер утиля:', col2X + 10, b2Y + 52);
        ctx.fillStyle = '#34495e';
        ctx.fillRect(col2X + 125, b2Y + 44, 90, 8);
        const dumpPctTab = Math.min(100, Math.round((dumpsterState.kg / dumpsterState.maxKg) * 100));
        ctx.fillStyle = dumpPctTab >= 100 ? '#e74c3c' : (dumpPctTab >= 80 ? '#e67e22' : '#2ecc71');
        ctx.fillRect(col2X + 125, b2Y + 44, (dumpPctTab / 100) * 90, 8);
        ctx.font = 'bold 9.5px monospace';
        const dumpStatusText = dumpsterState.isFull ? (garbageTruck.active ? '🚛 Мусоровоз!' : '🚨 Вывоз!') : (dumpPctTab >= 80 ? '⚠️ 80%' : `${dumpsterState.kg}/500 кг`);
        ctx.fillText(dumpStatusText, col2X + 220, b2Y + 52);

        // 3. Тачка кипера и навоз в вольере
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#ecf0f1';
        ctx.fillText('Тачка / навоз:', col2X + 10, b2Y + 68);
        ctx.fillStyle = '#34495e';
        ctx.fillRect(col2X + 125, b2Y + 60, 90, 8);
        ctx.fillStyle = wheelbarrow.kg >= wheelbarrow.maxKg ? '#e74c3c' : '#f39c12';
        ctx.fillRect(col2X + 125, b2Y + 60, Math.max(0, (wheelbarrow.kg / wheelbarrow.maxKg) * 90), 8);
        ctx.font = 'bold 9.5px monospace';
        ctx.fillText(`${wheelbarrow.kg}/${wheelbarrow.maxKg} кг (${state.dungPiles.length} куч)`, col2X + 220, b2Y + 68);

        // 4. Опилки и чистота пола (лужи мочи)
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#ecf0f1';
        ctx.fillText('Опилки / настил:', col2X + 10, b2Y + 84);
        ctx.font = 'bold 9.5px monospace';
        ctx.fillStyle = sawdustStorage.stock <= 5 ? '#e74c3c' : '#ffd166';
        const unabsorbedCount = state.wetSpots.filter(w => w.state !== 'absorbed').length;
        const absorbedCount = state.wetSpots.filter(w => w.state === 'absorbed').length;
        ctx.fillText(`Склад: ${sawdustStorage.stock}/30 · Сумка: ${player.sawdustStock}/5 · Лужи: ${unabsorbedCount}ж / ${absorbedCount}вп`, col2X + 125, b2Y + 84);

        // 5. Инвентарь в руках
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#ecf0f1';
        let invDesc = player.hasPitchfork ? 'Вилы для настила 🛠️' : 'Рабочая лопата';
        if (player.carrying === 'bucket') invDesc = 'Ведро для мочи 🧪';
        else if (player.carrying === 'hay') invDesc = 'Тюк сена 🌾';
        else if (player.carrying === 'mash') invDesc = 'Таз с кашей 🥣';
        else if (player.carrying === 'treat') invDesc = 'Банан-лакомство 🍌';
        ctx.fillText(`В руках: ${invDesc}`, col2X + 10, b2Y + 100);

        // 6. Статус планового ветеринарного визита
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#ecf0f1';
        ctx.fillText('Ветвизит (10:30):', col2X + 10, b2Y + 116);
        ctx.font = 'bold 9.5px monospace';
        if (stats.vetVisitsCompleted >= 1) {
          ctx.fillStyle = '#2ecc71';
          ctx.fillText('Осмотр 3/3 завершён ✓', col2X + 125, b2Y + 116);
        } else if (vetNPC.active) {
          ctx.fillStyle = '#3498db';
          const curElName = vetNPC.currentElephant ? vetNPC.currentElephant.name : '';
          ctx.fillText(`Осмотр: ${curElName} (${Math.round(vetNPC.examProgress)}%)`, col2X + 125, b2Y + 116);
        } else if (vetSchedule.notified) {
          ctx.fillStyle = '#f1c40f';
          ctx.fillText('Врач прибывает в 10:30!', col2X + 125, b2Y + 116);
        } else {
          ctx.fillStyle = '#7f8c8d';
          ctx.fillText('Ожидается по графику (10:30)', col2X + 125, b2Y + 116);
        }

        // Блок 3: Оперативный журнал событий и оперативная обстановка (146px)
        const b3Y = b2Y + 140;
        ctx.fillStyle = '#222d32';
        ctx.fillRect(col2X, b3Y, col2W, 22);
        ctx.strokeStyle = '#314147';
        ctx.lineWidth = 1;
        ctx.strokeRect(col2X, b3Y, col2W, 150);

        ctx.fillStyle = '#f4d68a';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('⚡ ОПЕРАТИВНАЯ ОБСТАНОВКА И ЖУРНАЛ СМЕНЫ', col2X + 10, b3Y + 15);

        ctx.fillStyle = '#172023';
        ctx.fillRect(col2X, b3Y + 22, col2W, 128);

        if (state.activeSituationalEvent && state.activeSituationalEvent.status === 'active') {
          const ev = state.activeSituationalEvent;
          // Оперативный статус текущей ситуации
          ctx.fillStyle = ev.followUpReady ? '#1b4d3e' : '#3d2e1b';
          ctx.fillRect(col2X + 6, b3Y + 26, col2W - 12, 42);
          ctx.strokeStyle = ev.followUpReady ? '#2ecc71' : '#f39c12';
          ctx.lineWidth = 1;
          ctx.strokeRect(col2X + 6, b3Y + 26, col2W - 12, 42);

          ctx.fillStyle = '#f1c40f';
          ctx.font = 'bold 10px monospace';
          ctx.fillText(`⚡ ${ev.title.toUpperCase()}`, col2X + 12, b3Y + 40);

          ctx.fillStyle = '#ffffff';
          ctx.font = '10px "Segoe UI", sans-serif';
          const step1 = ev.noticed ? '✓ Замечено' : '1.Осмотр...';
          const step2 = ev.actionDone ? '✓ Сделано' : '2.Действие...';
          const step3 = ev.followUpDone ? '✓ Проверено' : (ev.followUpReady ? '▶ 3.КОНТРОЛЬ [F]' : '3.Контроль');
          ctx.fillText(`Цепочка: ${step1}  →  ${step2}  →  ${step3}`, col2X + 12, b3Y + 58);

          // 3 недавние записи журнала
          logs.slice(0, 3).forEach((log, i) => {
            ctx.font = '9.5px sans-serif';
            ctx.fillStyle = '#c5baaa';
            ctx.fillText(`[${log.time}]`, col2X + 8, b3Y + 82 + i * 20);
            ctx.fillStyle = '#e5d7bd';
            let txt = log.text;
            if (txt.length > 46) txt = txt.substring(0, 44) + '...';
            ctx.fillText(txt, col2X + 54, b3Y + 82 + i * 20);
          });
        } else {
          ctx.fillStyle = '#2ecc71';
          ctx.font = 'bold 10px monospace';
          ctx.fillText('✓ ОБСТАНОВКА В СЛОНОВНИКЕ ШТАТНАЯ · ОТКЛОНЕНИЙ НЕТ', col2X + 12, b3Y + 38);

          logs.slice(0, 4).forEach((log, i) => {
            ctx.font = '10px sans-serif';
            ctx.fillStyle = '#c5baaa';
            ctx.fillText(`[${log.time}]`, col2X + 8, b3Y + 56 + i * 21);
            ctx.fillStyle = '#e5d7bd';
            let txt = log.text;
            if (txt.length > 50) txt = txt.substring(0, 48) + '...';
            ctx.fillText(txt, col2X + 60, b3Y + 56 + i * 21);
          });
        }

        // Кнопка закрытия планшета и кнопка досрочной/штатной сдачи смены
        const canSubmitShift = (gameTime.hour >= 20 || dayNightCycle.phase === 'NIGHT' || dayNightCycle.phase === 'DAWN');
        if (canSubmitShift) {
          // Кнопка закрытия планшета (слева)
          ctx.fillStyle = '#27ae60';
          ctx.fillRect(210, 588, 240, 42);
          ctx.strokeStyle = '#2ecc71';
          ctx.lineWidth = 2;
          ctx.strokeRect(210, 588, 240, 42);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 13px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('ЗАКРЫТЬ [TAB / ESC]', 330, 614);

          // Кнопка сдачи смены (справа)
          ctx.fillStyle = '#d35400';
          ctx.fillRect(490, 588, 280, 42);
          ctx.strokeStyle = '#e67e22';
          ctx.lineWidth = 2;
          ctx.strokeRect(490, 588, 280, 42);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 13px "Segoe UI", sans-serif';
          ctx.fillText('🏁 СДАТЬ СМЕНУ И ОТЧЁТ', 630, 614);
          ctx.textAlign = 'left';
        } else {
          ctx.fillStyle = '#27ae60';
          ctx.fillRect(350, 588, 300, 42);
          ctx.strokeStyle = '#2ecc71';
          ctx.lineWidth = 2;
          ctx.strokeRect(350, 588, 300, 42);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('ЗАКРЫТЬ ПЛАНШЕТ [TAB / ESC / КЛИК]', 500, 614);
          ctx.textAlign = 'left';
        }
      }

export function renderShiftReport() {
        ctx.fillStyle = 'rgba(15, 12, 10, 0.92)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Табель
        ctx.fillStyle = '#221914';
        ctx.fillRect(160, 40, 680, 600);
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 4;
        ctx.strokeRect(160, 40, 680, 600);

        // Шапка отчета
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 24px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ИТОГОВЫЙ ТАБЕЛЬ ДЕЖУРНОЙ СМЕНЫ', CANVAS_WIDTH / 2, 85);

        ctx.font = '13px monospace';
        ctx.fillStyle = '#e5d7bd';
        ctx.fillText('Слоновник зоопарка · Дежурство 08:00 - 20:00 успешно завершено', CANVAS_WIDTH / 2, 112);

        // Линия
        ctx.fillStyle = '#5c412e';
        ctx.fillRect(190, 128, 620, 2);

        // Расчет оценки кипера по регламенту, очкам и устранению последствий (Этап 08)
        let grade = 'B';
        let medalTitle = 'Добросовестный дежурный';
        let medalColor = '#cd7f32';

        const obsCount = stats.observationsRecorded || 0;
        const eventsHandled = stats.situationalEventsResolved || 0;
        const unrecoveredMisses = Math.max(0, stats.tasksMissed - stats.tasksRecovered);
        const effectiveScore = stats.tasksCompletedOnTime + stats.tasksRecovered * 0.75;

        if (effectiveScore >= 8 && stats.totalScore >= 520 && obsCount >= 3 && eventsHandled >= 1 && unrecoveredMisses <= 1) {
          grade = 'S';
          medalTitle = 'Легендарный старший кипер';
          medalColor = '#f1c40f';
        } else if (effectiveScore >= 6 && stats.totalScore >= 350) {
          grade = 'A';
          medalTitle = 'Мастер-кипер зоопарка';
          medalColor = '#bdc3c7';
        } else if (effectiveScore >= 4 && stats.totalScore >= 200) {
          grade = 'B';
          medalTitle = 'Дежурный кипер-специалист';
          medalColor = '#cd7f32';
        } else {
          grade = 'C';
          medalTitle = 'Практикант-стажер';
          medalColor = '#7f8c8d';
        }

        const avgSatiety = Math.round((elephants[0].satiety + elephants[1].satiety + elephants[2].satiety) / 3);
        const avgThirst = Math.round((elephants[0].thirst + elephants[1].thirst + elephants[2].thirst) / 3);
        const avgEnergy = Math.round((elephants[0].energy + elephants[1].energy + elephants[2].energy) / 3);

        // Статистические показатели смены
        ctx.textAlign = 'left';
        ctx.font = '11.5px "Segoe UI", sans-serif';
        ctx.fillStyle = '#f5eedb';

        const summaryRows = [
          { label: 'Выполнено задач строго вовремя (в срок):', val: `${stats.tasksCompletedOnTime} из ${shiftTasks.length}`, col: '#2ecc71' },
          { label: 'Исправлено с опозданием (ликвидация задержек):', val: `${stats.tasksRecovered} задач`, col: stats.tasksRecovered > 0 ? '#27ae60' : '#888' },
          { label: 'Упущено задач без исправления (срыв регламента):', val: `${unrecoveredMisses}`, col: unrecoveredMisses > 0 ? '#e74c3c' : '#2ecc71' },
          { label: 'Физиологический тонус стада (сытость/жажда/тонус):', val: `${avgSatiety}% / ${avgThirst}% / ${avgEnergy}%`, col: (avgSatiety >= 55 && avgThirst <= 50) ? '#2ecc71' : '#f39c12' },
          { label: 'Плановый осмотр стада ветврачом:', val: stats.vetVisitsCompleted >= 1 ? '3/3 слоних обследовано ✓' : `${stats.vetProceduresDone}/3 процедур`, col: stats.vetVisitsCompleted >= 1 ? '#2ecc71' : '#f1c40f' },
          { label: 'Санитарное состояние вольера:', val: `${stats.manureCleanedKg} кг навоза · ${stats.puddlesAbsorbed || 0} луж впитано (${stats.sawdustUsed || 0} порц. опилок)`, col: state.dungPiles.length <= 1 && state.wetSpots.length === 0 ? '#2ecc71' : (state.dungPiles.length <= 3 ? '#f1c40f' : '#e74c3c') },
          { label: 'Вывоз навоза мусоровозом (утиль 500 кг):', val: `${stats.dumpsterPickupsCompleted} рейсов (${Math.round(dumpsterState.kg)} кг в баке)`, col: stats.dumpsterPickupsCompleted > 0 ? '#2ecc71' : '#f1c40f' },
          { label: 'Раздано корма (сено и каша):', val: `${stats.foodDelivered} порций`, col: '#f1c40f' },
          { label: 'Собрано проб мочи / расчисток стоп:', val: `${stats.urineSamplesCollected} проб / ${stats.pedicuresDone} раз`, col: '#f1c40f' },
          { label: 'Оперативных ситуаций (замечено/отработано):', val: `${stats.situationalEventsResolved} из ${Math.max(1, stats.situationalEventsOccurred)}`, col: stats.situationalEventsResolved > 0 ? '#2ecc71' : '#f1c40f' },
          { label: 'Зафиксировано записей в меджурнале:', val: `${stats.observationsRecorded || 0} зап.`, col: '#2ecc71' },
          { label: 'Итоговые заработанные баллы смены:', val: `${stats.totalScore} очков`, col: '#f1c40f' }
        ];

        summaryRows.forEach((r, i) => {
          const rowY = 138 + i * 19.5;
          ctx.fillStyle = '#f5eedb';
          ctx.font = '11.5px "Segoe UI", sans-serif';
          ctx.fillText(r.label, 195, rowY);
          ctx.font = 'bold 11.5px monospace';
          ctx.fillStyle = r.col;
          ctx.textAlign = 'right';
          ctx.fillText(r.val, 800, rowY);
          ctx.textAlign = 'left';
        });

        // Наградная медаль и ранг
        ctx.fillStyle = '#18120e';
        ctx.fillRect(190, 395, 620, 145);
        ctx.strokeStyle = medalColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(190, 395, 620, 145);

        // Буква ранга
        ctx.fillStyle = medalColor;
        ctx.font = 'bold 64px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(grade, 270, 495);

        ctx.font = 'bold 20px "Segoe UI", sans-serif';
        ctx.fillText(medalTitle, 530, 442);

        ctx.font = '13px "Segoe UI", sans-serif';
        ctx.fillStyle = '#dcd3be';
        ctx.fillText('Слонихи Одри, Марго и Претти сыты, ухожены и благодарят вас!', 530, 474);
        ctx.font = '11px monospace';
        ctx.fillStyle = '#9c8e7c';
        const totalAccounted = stats.tasksCompletedOnTime + stats.tasksRecovered;
        const totalPossible = Math.max(1, stats.tasksCompletedOnTime + stats.tasksMissed);
        const complianceRate = Math.round((totalAccounted / totalPossible) * 100);
        ctx.fillText(`Индекс ликвидации последствий и регламента: ${complianceRate}%`, 530, 502);

        // Кнопка начать новую смену
        ctx.fillStyle = '#27ae60';
        ctx.fillRect(360, 565, 280, 50);
        ctx.strokeStyle = '#2ecc71';
        ctx.lineWidth = 2;
        ctx.strokeRect(360, 565, 280, 50);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px "Segoe UI", sans-serif';
        ctx.fillText('НАЧАТЬ НОВУЮ СМЕНУ [SPACE]', CANVAS_WIDTH / 2, 596);

        ctx.textAlign = 'left';
      }
