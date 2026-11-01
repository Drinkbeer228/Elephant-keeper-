import { getCurrentPhase } from '../systems/dayNight.js';
import { sfx } from '../sound.js';
import { state, waterTrough, player, wheelbarrow, feeders, elephants, sawdustStorage, dumpsterState, garbageTruck, vetSchedule, vetNPC, gameTime, dayNightCycle, stats, notificationToast, logs } from '../gameState.js';
import { ctx } from '../canvas.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT, shiftPhases } from '../config.js';
import { shiftTasks, getCurrentActiveTask, getTaskTimeRemaining, isTaskBlockedByEvent } from '../shift/tasks.js';
import { clearHUDElements, registerHUDElement, validateHUDLayout, renderHUDDebugOverlay } from './hudValidator.js';

export function drawInteractIcon(x, y) {
  const bob = Math.sin(state.worldAnimTime * 4) * 2;
  ctx.save();
  ctx.fillStyle = 'rgba(15, 12, 10, 0.78)';
  ctx.beginPath();
  ctx.arc(x, y + bob, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y + bob, 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#f5eedb';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('✋', x, y + bob + 4);
  ctx.textAlign = 'left';
  ctx.restore();
}

export function getActiveAlerts() {
  const alerts = [];
  if (waterTrough.water <= 15) alerts.push({ icon: '💧', text: 'Критический дефицит воды в поилке (<15%). Откройте кран и держите действие.', color: '#e74c3c', critical: true });
  else if (waterTrough.water < 30) alerts.push({ icon: '💧', text: 'Уровень воды в поилке ниже 30%. Требуется долив.', color: '#f39c12', critical: false });
  if (wheelbarrow.kg >= wheelbarrow.maxKg) alerts.push({ icon: '🛒', text: 'Тачка полна (60 кг). Выгрузите содержимое в контейнер утилизации.', color: '#e67e22', critical: false });
  if (state.dungPiles.length >= 4) alerts.push({ icon: '🟤', text: `В вольере ${state.dungPiles.length} куч навоза — требуется уборка.`, color: '#f39c12', critical: false });
  for (const f of feeders) {
    if (f.food <= 10) alerts.push({ icon: '🌾', text: `${f.name}: кормушка почти пуста (${Math.round(f.food)}%).`, color: '#e67e22', critical: false });
  }
  for (const el of elephants) {
    if (el.satiety < 25) alerts.push({ icon: '🌾', text: `${el.name}: сильный голод (${Math.round(el.satiety)}%). Наполните кормушку.`, color: '#e74c3c', critical: true });
    if (el.thirst > 75) alerts.push({ icon: '💧', text: `${el.name}: сильная жажда. Наполните поилку свежей водой.`, color: '#f39c12', critical: false });
    if (el.isWantingPee) alerts.push({ icon: '🧪', text: `${el.name}: позыв к мочеиспусканию (${Math.ceil(el.peeUrgencyTimer)} c). Ведро на стойке.`, color: '#f1c40f', critical: false });
    if (el.isWantingPedicure && !el.pedicureDone) alerts.push({ icon: '🦶', text: `${el.name}: требуется расчистка ногтей.`, color: '#e056fd', critical: false });
    if (el.footDirt >= 60) alerts.push({ icon: '🦶', text: `${el.name}: сильное загрязнение ног (${Math.round(el.footDirt)}%).`, color: '#e67e22', critical: false });
  }
  if (state.wetSpots.length > 0) {
    const liquidPuddles = state.wetSpots.filter(w => w.state !== 'absorbed').length;
    const absorbedPuddles = state.wetSpots.filter(w => w.state === 'absorbed').length;
    if (liquidPuddles > 0 && absorbedPuddles > 0) {
      alerts.push({ icon: '🪵', text: `Загрязнения: ${liquidPuddles} луж и ${absorbedPuddles} впитавших куч.`, color: '#e67e22', critical: false });
    } else if (liquidPuddles > 0) {
      alerts.push({ icon: '⚠️', text: `В вольере ${liquidPuddles} луж(а) мочи. Засыпьте опилками.`, color: '#f39c12', critical: false });
    } else if (absorbedPuddles > 0) {
      alerts.push({ icon: '🧹', text: `Впитавшие опилки: ${absorbedPuddles} куч(и). Соберите вилами в тачку.`, color: '#3498db', critical: false });
    }
  }
  if (sawdustStorage.stock === 0 && state.wetSpots.some(w => w.state !== 'absorbed')) {
    alerts.push({ icon: '🪵', text: 'Запас чистых опилок исчерпан! Убирайте вилами.', color: '#e74c3c', critical: false });
  }
  if (state.activeSituationalEvent && state.activeSituationalEvent.status === 'active') {
    alerts.push({ icon: '⚡', text: `Ситуация «${state.activeSituationalEvent.title}» [F].`, color: '#f39c12', critical: true });
  }
  if (dumpsterState.isFull) {
    alerts.push({ icon: '🚛', text: `Контейнер навоза переполнен (500 кг)! ${garbageTruck.active ? 'Мусоровоз прибыл.' : 'Ожидание вывоза.'}`, color: '#e74c3c', critical: true });
  }
  if (vetNPC.active) {
    const elName = vetNPC.currentElephant ? vetNPC.currentElephant.name : 'подопечных';
    alerts.push({ icon: '🩺', text: `Ветврач осматривает: ${elName} (${Math.round(vetNPC.examProgress)}%). Помощь [Space]`, color: '#3498db', critical: true });
  }
  return alerts;
}

/**
 * Получить список активных задач для отображения в компактном блоке HUD
 */
export function getActiveShiftTasksForHUD() {
  const curHour = gameTime.hour + gameTime.minute / 60;
  // Задачи текущей фазы смены или срочные/доступные
  const matched = shiftTasks.filter(t => {
    return (t.startHour <= curHour && t.endHour >= curHour) ||
           (t.status === 'in_progress') ||
           (t.status === 'available' && t.startHour <= curHour + 0.5);
  });

  // Приоритет сортировки: сначала невыполненные, затем выполненные
  matched.sort((a, b) => {
    const aDone = a.status === 'completed';
    const bDone = b.status === 'completed';
    if (aDone && !bDone) return 1;
    if (!aDone && bDone) return -1;
    return a.startHour - b.startHour;
  });

  return matched.slice(0, 2);
}

/**
 * Главный рендерер HUD (пользовательский интерфейс)
 * Строго соответствует ТЗ:
 * 1. Игровые часы
 * 2. Список актуальных задач смены с чекбоксами выполнения
 * 3. Предмет в руках (тачка не отображается постоянно)
 * 4. Очки дежурного
 */
export function renderHUD() {
  clearHUDElements();

  // Базовая плашка верхней информационной панели
  ctx.fillStyle = '#181310';
  ctx.fillRect(0, 0, CANVAS_WIDTH, 44);
  ctx.fillStyle = '#3c2b1e';
  ctx.fillRect(0, 42, CANVAS_WIDTH, 2);

  // ==========================================
  // 1. ИГРОВЫЕ ЧАСЫ (x: 10, y: 6, w: 125, h: 32)
  // ==========================================
  const clockX = 10;
  const clockY = 6;
  const clockW = 125;
  const clockH = 32;

  ctx.fillStyle = '#221a15';
  ctx.fillRect(clockX, clockY, clockW, clockH);
  ctx.strokeStyle = '#4a382b';
  ctx.lineWidth = 1;
  ctx.strokeRect(clockX, clockY, clockW, clockH);

  registerHUDElement({ id: 'hud_clock_panel', x: clockX, y: clockY, w: clockW, h: clockH, label: 'Панель часов' });

  const timeStr = `${String(gameTime.hour).padStart(2, '0')}:${String(Math.floor(gameTime.minute)).padStart(2, '0')}`;
  ctx.fillStyle = '#f1c40f';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(`⏰ ${timeStr}`, clockX + 8, clockY + 15);
  registerHUDElement({ id: 'hud_clock_time', x: clockX + 8, y: clockY + 3, w: 75, h: 14, label: 'Время' });

  let phaseBadge = '☀️ ДЕНЬ';
  let phaseColor = '#f39c12';
  if (dayNightCycle.phase === 'DUSK') {
    phaseBadge = '🌅 ЗАКАТ';
    phaseColor = '#e67e22';
  } else if (dayNightCycle.phase === 'NIGHT') {
    phaseBadge = '🌙 НОЧЬ';
    phaseColor = '#5dade2';
  } else if (dayNightCycle.phase === 'DAWN') {
    phaseBadge = '🌄 РАССВЕТ';
    phaseColor = '#f5b041';
  }

  ctx.font = 'bold 9px sans-serif';
  ctx.fillStyle = phaseColor;
  ctx.fillText(phaseBadge, clockX + 8, clockY + 27);
  registerHUDElement({ id: 'hud_clock_phase', x: clockX + 8, y: clockY + 17, w: 75, h: 12, label: 'Фаза суток' });

  // Мини-индикатор прогресса 24ч цикла
  const cycleProgress = dayNightCycle.cycleTimer / dayNightCycle.totalSec;
  ctx.fillStyle = '#140f0c';
  ctx.fillRect(clockX + 80, clockY + 14, 38, 4);
  ctx.fillStyle = phaseColor;
  ctx.fillRect(clockX + 80, clockY + 14, Math.max(2, 38 * cycleProgress), 4);

  // ==========================================
  // 2. СПИСОК ЗАДАЧ СМЕНЫ (x: 145, y: 6, w: 430, h: 32)
  // ==========================================
  const tasksX = 145;
  const tasksY = 6;
  const tasksW = 430;
  const tasksH = 32;

  ctx.fillStyle = '#221a15';
  ctx.fillRect(tasksX, tasksY, tasksW, tasksH);
  ctx.strokeStyle = '#3c2b1e';
  ctx.lineWidth = 1;
  ctx.strokeRect(tasksX, tasksY, tasksW, tasksH);

  registerHUDElement({ id: 'hud_tasks_panel', x: tasksX, y: tasksY, w: tasksW, h: tasksH, label: 'Панель задач смены' });

  const activeTasks = getActiveShiftTasksForHUD();

  if (activeTasks.length === 0) {
    ctx.fillStyle = '#2ecc71';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('✓ Все текущие задачи выполнены! Свободный обход слоновника', tasksX + 10, tasksY + 20);
    registerHUDElement({ id: 'hud_tasks_title', x: tasksX + 10, y: tasksY + 8, w: 410, h: 16, label: 'Все задачи выполнены' });
  } else {
    activeTasks.forEach((task, idx) => {
      const isCompleted = task.status === 'completed';
      const itemY = tasksY + 13 + idx * 14;

      // Чекбокс [✓] или [ ]
      ctx.fillStyle = isCompleted ? '#2ecc71' : '#7f8c8d';
      ctx.font = 'bold 11px monospace';
      const checkSymbol = isCompleted ? '☑' : '☐';
      ctx.fillText(checkSymbol, tasksX + 8, itemY);
      registerHUDElement({ id: `hud_task_checkbox_${idx}`, x: tasksX + 8, y: itemY - 10, w: 14, h: 12, label: `Чекбокс ${idx}` });

      // Название задачи
      ctx.font = isCompleted ? 'italic 10px sans-serif' : 'bold 10.5px sans-serif';
      ctx.fillStyle = isCompleted ? '#95a5a6' : '#f5eedb';

      let taskText = task.title;
      if (task.timeRange) {
        taskText += ` (${task.timeRange})`;
      }
      // Ограничение длины текста
      if (taskText.length > 55) {
        taskText = taskText.slice(0, 52) + '…';
      }
      ctx.fillText(taskText, tasksX + 24, itemY);
      registerHUDElement({ id: `hud_task_item_${idx}`, x: tasksX + 24, y: itemY - 10, w: 395, h: 12, label: `Задача ${idx}` });
    });
  }

  // ==========================================
  // 3. ПРЕДМЕТ В РУКАХ (x: 585, y: 6, w: 235, h: 32)
  // ==========================================
  const itemX = 585;
  const itemY = 6;
  const itemW = 235;
  const itemH = 32;

  let itemTitle = '✋ В РУКАХ: Пусто';
  let itemSub = 'подойдите к объекту';
  let itemColor = '#9e9182';
  let itemBg = '#221a15';
  let itemBorder = '#3c2b1e';

  if (wheelbarrow.inHands) {
    const isFull = wheelbarrow.kg >= wheelbarrow.maxKg;
    itemTitle = `🛒 ТАЧКА: ${wheelbarrow.kg}/${wheelbarrow.maxKg} кг`;
    itemSub = isFull ? 'ПОЛНАЯ! [Space] разгрузить' : '[E] поставить тачку';
    itemColor = isFull ? '#e74c3c' : (wheelbarrow.kg > 0 ? '#f39c12' : '#2ecc71');
    itemBg = isFull ? '#2e1414' : '#221a15';
    itemBorder = isFull ? '#e74c3c' : '#5a4533';
  } else if (player.carrying === 'bucket') {
    itemTitle = '🧪 Лабораторное ведро';
    itemSub = 'для пробы мочи [Space]';
    itemColor = '#68c5ff';
    itemBg = '#142533';
    itemBorder = '#3498db';
  } else if (player.carrying === 'hay') {
    itemTitle = '🌾 Тюк свежего сена';
    itemSub = 'в кормушку [Space]';
    itemColor = '#f9e79f';
    itemBg = '#2c2513';
    itemBorder = '#f39c12';
  } else if (player.carrying === 'mash') {
    itemTitle = '🥕 Таз с овощной кашей';
    itemSub = 'в кормушку [Space]';
    itemColor = '#f5b041';
    itemBg = '#2d1b11';
    itemBorder = '#e67e22';
  } else if (player.carrying === 'treat') {
    itemTitle = '🍌 Банан (лакомство)';
    itemSub = 'вести слониху за собой';
    itemColor = '#f1c40f';
    itemBg = '#2c2513';
    itemBorder = '#f1c40f';
  } else if (player.hasPitchfork) {
    itemTitle = '🍴 Вилы для уборки';
    itemSub = 'уборка мокрого настила';
    itemColor = '#d5cbbd';
    itemBg = '#221a15';
    itemBorder = '#7f8c8d';
  } else if (player.sawdustStock > 0) {
    itemTitle = `🪵 Чистые опилки (${player.sawdustStock}/5)`;
    itemSub = 'засыпать лужу [Space]';
    itemColor = '#f39c12';
    itemBg = '#221a15';
    itemBorder = '#e67e22';
  }

  ctx.fillStyle = itemBg;
  ctx.fillRect(itemX, itemY, itemW, itemH);
  ctx.strokeStyle = itemBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(itemX, itemY, itemW, itemH);

  registerHUDElement({ id: 'hud_item_panel', x: itemX, y: itemY, w: itemW, h: itemH, label: 'Панель предмета в руках' });

  ctx.fillStyle = itemColor;
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(itemTitle, itemX + 8, itemY + 15);
  registerHUDElement({ id: 'hud_item_title', x: itemX + 8, y: itemY + 3, w: 215, h: 14, label: 'Название предмета' });

  ctx.fillStyle = '#8c7e6f';
  ctx.font = '9px monospace';
  ctx.fillText(itemSub, itemX + 8, itemY + 27);
  registerHUDElement({ id: 'hud_item_sub', x: itemX + 8, y: itemY + 17, w: 215, h: 12, label: 'Действие предмета' });

  // ==========================================
  // 4. ОЧКИ И ЗАРПЛАТА (x: 830, y: 6, w: 160, h: 32)
  // ==========================================
  const scoreX = 830;
  const scoreY = 6;
  const scoreW = 160;
  const scoreH = 32;

  ctx.fillStyle = '#221a15';
  ctx.fillRect(scoreX, scoreY, scoreW, scoreH);
  ctx.strokeStyle = '#3c2b1e';
  ctx.lineWidth = 1;
  ctx.strokeRect(scoreX, scoreY, scoreW, scoreH);

  registerHUDElement({ id: 'hud_score_panel', x: scoreX, y: scoreY, w: scoreW, h: scoreH, label: 'Панель очков и зарплаты' });

  ctx.fillStyle = '#f1c40f';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`★ ${stats.totalScore} очк.`, scoreX + 8, scoreY + 15);
  registerHUDElement({ id: 'hud_score_text', x: scoreX + 8, y: scoreY + 3, w: 144, h: 14, label: 'Текст очков' });

  const salaryRub = stats.totalScore * 10;
  ctx.fillStyle = '#2ecc71';
  ctx.font = '9.5px monospace';
  ctx.fillText(`Зарплата: ${salaryRub} ₽`, scoreX + 8, scoreY + 27);
  registerHUDElement({ id: 'hud_score_sub', x: scoreX + 8, y: scoreY + 17, w: 144, h: 12, label: 'Зарплата' });

  // ==========================================
  // ГЛОБАЛЬНЫЙ БАННЕР ТОСТ-УВЕДОМЛЕНИЙ (ЕСЛИ ЕСТЬ)
  // ==========================================
  if (notificationToast.timer > 0) {
    ctx.fillStyle = notificationToast.color || '#27ae60';
    ctx.fillRect(10, 48, 980, 20);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 48, 980, 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(notificationToast.text, 500, 62);
    ctx.textAlign = 'left';
  }

  // Раскрытая панель журнала событий (клавиша J)
  if (state.journalOpen) renderJournalPanel();

  // Визуальный оверлей валидатора в debug-режиме (F2)
  if (state.hudDebugMode) {
    renderHUDDebugOverlay(ctx);
  }
}

export function renderJournalPanel() {
  const panelW = 420;
  const panelH = 330;
  const px = CANVAS_WIDTH - panelW - 12;
  const py = 52;
  ctx.fillStyle = 'rgba(18, 14, 12, 0.95)';
  ctx.fillRect(px, py, panelW, panelH);
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, panelW, panelH);

  ctx.fillStyle = '#f1c40f';
  ctx.font = 'bold 13px "Segoe UI", sans-serif';
  ctx.fillText('📋 ЖУРНАЛ ДЕЖУРНОГО', px + 14, py + 24);
  ctx.fillStyle = '#9c8e7c';
  ctx.font = '10px monospace';
  ctx.fillText('[J] — закрыть', px + panelW - 100, py + 24);

  // Активные тревоги
  const alerts = getActiveAlerts();
  let yy = py + 46;
  ctx.fillStyle = alerts.length ? '#e67e22' : '#2ecc71';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(alerts.length ? `⚠ АКТИВНЫЕ ПРОБЛЕМЫ (${alerts.length}):` : '✓ АКТИВНЫХ ПРОБЛЕМ НЕТ', px + 14, yy);
  yy += 18;
  ctx.font = '10px "Segoe UI", sans-serif';
  for (const a of alerts.slice(0, 5)) {
    ctx.fillStyle = a.critical ? '#ff6b6b' : a.color;
    ctx.fillText(`${a.icon} ${a.text}`, px + 18, yy);
    yy += 15;
  }
  if (alerts.length > 5) {
    ctx.fillStyle = '#9c8e7c';
    ctx.fillText(`… и ещё ${alerts.length - 5}`, px + 18, yy);
    yy += 15;
  }

  // История событий
  yy += 8;
  ctx.fillStyle = '#c5baaa';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('ИСТОРИЯ СМЕНЫ:', px + 14, yy);
  yy += 18;
  ctx.font = '10px "Segoe UI", sans-serif';
  for (const log of logs) {
    const rep = (log.count && log.count > 1) ? ` ×${log.count}` : '';
    ctx.fillStyle = log.text.startsWith('⚠') || log.text.startsWith('💧') || log.text.startsWith('⚡') ? '#f1c40f' : '#e0d6c3';
    ctx.fillText(`[${log.time}] ${log.text}${rep}`, px + 18, yy);
    yy += 16;
    if (yy > py + panelH - 12) break;
  }
}
