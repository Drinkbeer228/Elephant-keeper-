// Инициализация Canvas и 2D-контекста
export let canvas = typeof document !== 'undefined' ? document.getElementById('gameCanvas') : null;
export let ctx = canvas ? canvas.getContext('2d') : null;

export function updateCanvasContext() {
  if (typeof document !== 'undefined') {
    canvas = document.getElementById('gameCanvas');
    if (canvas) ctx = canvas.getContext('2d');
  }
  return { canvas, ctx };
}
