import { state } from './gameState.js';
if (typeof window !== 'undefined') { window.state = state; }
import { updateCanvasContext } from './canvas.js';
import { sfx } from './sound.js';
import { initTouchControls, applyOrientationLayout, initKeyboard } from './input.js';
import { gameLoop } from './gameLoop.js';

// Инициализация при загрузке документа
export function init() {
  updateCanvasContext();
  applyOrientationLayout();
  initTouchControls();
  initKeyboard();

  // Сброс таймера при возврате на вкладку, исключая скачки координат
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      state.lastTime = performance.now();
    }
  });
  window.addEventListener('focus', () => {
    state.lastTime = performance.now();
  });

  requestAnimationFrame(gameLoop);
  console.log('🐘 Симулятор дежурного кипера слоновника 2.0 успешно запущен через модульную архитектуру!');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
