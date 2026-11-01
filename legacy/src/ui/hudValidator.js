/**
 * HUD Layout Validator
 * Внутренняя система автоматического контроля наложений элементов интерфейса.
 * Обнаруживает случайные пересечения bounding box'ов, проверяет реестр разрешённых наложений,
 * предоставляет визуальный debug-режим и консольную диагностику.
 */

// Реестр зарегистрированных элементов текущего кадра/компоновки HUD
let registeredElements = [];

// Реестр разрешённых наложений (Allowed Overlaps Registry)
// Каждая запись содержит пару ID и обоснование, почему наложение намеренное
export const ALLOWED_OVERLAPS = [
  // Часы: текст времени и фаза внутри панели часов
  { pair: ['hud_clock_panel', 'hud_clock_time'], reason: 'Текст времени внутри фоновой плашки часов' },
  { pair: ['hud_clock_panel', 'hud_clock_phase'], reason: 'Бейдж фазы суток внутри фоновой плашки часов' },
  { pair: ['hud_clock_time', 'hud_clock_phase'], reason: 'Допустимое соприкосновение строк внутри часов' },

  // Задачи: элементы списка задач внутри карточки задач
  { pair: ['hud_tasks_panel', 'hud_tasks_title'], reason: 'Заголовок внутри панели задач' },
  { pair: ['hud_tasks_panel', 'hud_task_item_0'], reason: 'Строка задачи 1 внутри панели задач' },
  { pair: ['hud_tasks_panel', 'hud_task_item_1'], reason: 'Строка задачи 2 внутри панели задач' },
  { pair: ['hud_tasks_panel', 'hud_task_item_2'], reason: 'Строка задачи 3 внутри панели задач' },
  { pair: ['hud_tasks_panel', 'hud_task_checkbox_0'], reason: 'Чекбокс задачи 1 внутри панели' },
  { pair: ['hud_tasks_panel', 'hud_task_checkbox_1'], reason: 'Чекбокс задачи 2 внутри панели' },
  { pair: ['hud_tasks_panel', 'hud_task_checkbox_2'], reason: 'Чекбокс задачи 3 внутри панели' },
  { pair: ['hud_task_item_0', 'hud_task_checkbox_0'], reason: 'Чекбокс и текст задачи 1' },
  { pair: ['hud_task_item_1', 'hud_task_checkbox_1'], reason: 'Чекбокс и текст задачи 2' },
  { pair: ['hud_task_item_2', 'hud_task_checkbox_2'], reason: 'Чекбокс и текст задачи 3' },

  // Предмет в руках: текст и подпись внутри плашки
  { pair: ['hud_item_panel', 'hud_item_title'], reason: 'Текст предмета внутри плашки экипировки' },
  { pair: ['hud_item_panel', 'hud_item_sub'], reason: 'Подзаголовок предмета внутри плашки экипировки' },
  { pair: ['hud_item_title', 'hud_item_sub'], reason: 'Две строки описания предмета внутри плашки' },

  // Очки: текст очков и зарплаты внутри плашки очков
  { pair: ['hud_score_panel', 'hud_score_text'], reason: 'Счёт очков внутри плашки очков' },
  { pair: ['hud_score_panel', 'hud_score_sub'], reason: 'Текст зарплаты внутри плашки очков' },
  { pair: ['hud_score_text', 'hud_score_sub'], reason: 'Две строки начисления очков внутри плашки' }
];

/**
 * Очистить реестр элементов перед построением HUD
 */
export function clearHUDElements() {
  registeredElements = [];
}

/**
 * Зарегистрировать элемент HUD для проверки
 * @param {Object} el - { id, x, y, w, h, label, category }
 */
export function registerHUDElement(el) {
  if (!el || !el.id) return;
  registeredElements.push({
    id: el.id,
    x: Math.round(el.x),
    y: Math.round(el.y),
    w: Math.round(el.w),
    h: Math.round(el.h),
    label: el.label || el.id,
    category: el.category || 'general'
  });
}

/**
 * Проверить, разрешено ли пересечение двух элементов
 */
function isOverlapAllowed(idA, idB) {
  return ALLOWED_OVERLAPS.some(rule => {
    return (rule.pair[0] === idA && rule.pair[1] === idB) ||
           (rule.pair[0] === idB && rule.pair[1] === idA);
  });
}

/**
 * Провести валидацию взаимного расположения зарегистрированных элементов
 * @param {boolean} isDev - выводить ли подробные предупреждения в консоль
 * @returns {Object} { valid: boolean, conflicts: Array, totalElements: number }
 */
export function validateHUDLayout(isDev = false) {
  const conflicts = [];
  const n = registeredElements.length;

  for (let i = 0; i < n; i++) {
    const a = registeredElements[i];
    for (let j = i + 1; j < n; j++) {
      const b = registeredElements[j];

      // Вычисление области пересечения bounding box
      const overlapLeft = Math.max(a.x, b.x);
      const overlapTop = Math.max(a.y, b.y);
      const overlapRight = Math.min(a.x + a.w, b.x + b.w);
      const overlapBottom = Math.min(a.y + a.h, b.y + b.h);

      const overlapW = Math.max(0, overlapRight - overlapLeft);
      const overlapH = Math.max(0, overlapBottom - overlapTop);
      const overlapArea = overlapW * overlapH;

      // Считаем реальным наложением только если перекрытие больше 1px с обеих сторон (не просто касание границ)
      if (overlapW > 1 && overlapH > 1 && overlapArea > 2) {
        if (!isOverlapAllowed(a.id, b.id)) {
          conflicts.push({
            idA: a.id,
            idB: b.id,
            elemA: a,
            elemB: b,
            x: overlapLeft,
            y: overlapTop,
            w: overlapW,
            h: overlapH,
            area: overlapArea,
            type: 'UNAUTHORIZED_OVERLAP'
          });
        }
      }
    }
  }

  const valid = conflicts.length === 0;

  if (isDev) {
    if (valid) {
      console.log(`[HUD Validator] ✅ Проверка пройдена: ${n} элементов, 0 конфликтов.`);
    } else {
      console.warn(`[HUD Validator] ⚠️ Обнаружено ${conflicts.length} конфликтов наложения:`, conflicts);
    }
  }

  return { valid, conflicts, totalElements: n };
}

/**
 * Отрисовать визуальный оверлей для разработчика на Canvas
 * Подсвечивает границы HUD-элементов и конфликтующие зоны
 * @param {CanvasRenderingContext2D} ctx
 */
export function renderHUDDebugOverlay(ctx) {
  const result = validateHUDLayout(false);

  ctx.save();

  // 1. Отрисовка всех зарегистрированных элементов
  registeredElements.forEach(el => {
    ctx.strokeStyle = 'rgba(46, 204, 113, 0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(el.x, el.y, el.w, el.h);

    ctx.fillStyle = 'rgba(46, 204, 113, 0.9)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${el.id} (${el.w}x${el.h})`, el.x + 2, el.y + 9);
  });

  // 2. Подсветка конфликтующих пересечений
  result.conflicts.forEach(c => {
    ctx.fillStyle = 'rgba(231, 76, 60, 0.55)';
    ctx.fillRect(c.x, c.y, c.w, c.h);

    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(c.x, c.y, c.w, c.h);
    ctx.setLineDash([]);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText(`! КОНФЛИКТ: ${c.idA} & ${c.idB} (${c.area}px²)`, c.x, Math.max(12, c.y - 4));
  });

  // 3. Плашка статуса валидатора в нижнем левом углу
  ctx.fillStyle = result.valid ? 'rgba(39, 174, 96, 0.88)' : 'rgba(192, 57, 43, 0.92)';
  ctx.fillRect(8, 48, 220, 24);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(8, 48, 220, 24);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(result.valid ? `HUD VALID: ${result.totalElements} items, 0 overlaps [F2]` : `HUD CONFLICTS: ${result.conflicts.length} [F2]`, 14, 64);

  ctx.restore();
}

// Привязка к глобальному объекту для быстрого вызова из консоли браузера
if (typeof window !== 'undefined') {
  window.validateHUD = () => validateHUDLayout(true);
  window.toggleHUDDebug = () => {
    if (window.state) {
      window.state.hudDebugMode = !window.state.hudDebugMode;
      console.log(`HUD Debug Mode: ${window.state.hudDebugMode ? 'ON' : 'OFF'}`);
      return window.state.hudDebugMode;
    }
  };
}
