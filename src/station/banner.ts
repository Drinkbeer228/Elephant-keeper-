// Плашка задания стажировки: что сделать, сколько сделано, и (внутри станции) кнопка «На станцию».

import type { ScenarioRun } from './scenarios';

export class TaskBanner {
  private el: HTMLElement;
  private count: HTMLElement;
  private task: HTMLElement;

  constructor(root: HTMLElement, onExit: (() => void) | null) {
    this.el = document.createElement('section');
    this.el.className = 'task-banner';
    this.el.setAttribute('aria-live', 'polite');
    const head = document.createElement('p');
    head.className = 'task-head';
    this.task = document.createElement('p');
    this.task.className = 'task-text';
    this.count = document.createElement('p');
    this.count.className = 'task-count';
    this.el.append(head, this.task, this.count);
    if (onExit) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'task-exit';
      b.textContent = 'На станцию';
      b.addEventListener('click', onExit);
      this.el.append(b);
    }
    root.append(this.el);
  }

  /**
   * Над подсказкой главного действия, а не поверх неё: подсказка внизу экрана и на касаниях ловит нажатия.
   * Вызывается из кадра; положение пересчитывается не чаще раза в 250 мс.
   */
  place(prompt: HTMLElement | null, now: number): void {
    if (now - this.placedAt < 250) return;
    this.placedAt = now;
    const r = prompt?.getBoundingClientRect();
    const gap = 8;
    const bottom = r && r.height > 0 ? window.innerHeight - r.top + gap : 112;
    // Не выше середины экрана: на совсем низком экране лучше накрыть край мира, чем подсказку.
    const px = `${Math.round(Math.min(bottom, window.innerHeight * 0.5))}px`;
    if (this.el.style.bottom !== px) this.el.style.bottom = px;
  }

  private placedAt = -1e9;

  render(run: ScenarioRun): void {
    const s = run.scenario;
    (this.el.firstElementChild as HTMLElement).textContent = `Стажировка · ${s.title}`;
    this.task.textContent = run.complete ? 'Готово! Задание засчитано — можно продолжать смену.' : s.task;
    this.count.textContent = `${Math.min(run.done, s.count)} из ${s.count}`;
    this.el.classList.toggle('done', run.complete);
  }
}
