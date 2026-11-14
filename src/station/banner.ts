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

  render(run: ScenarioRun): void {
    const s = run.scenario;
    (this.el.firstElementChild as HTMLElement).textContent = `Стажировка · ${s.title}`;
    this.task.textContent = run.complete ? 'Готово! Задание засчитано — можно продолжать смену.' : s.task;
    this.count.textContent = `${Math.min(run.done, s.count)} из ${s.count}`;
    this.el.classList.toggle('done', run.complete);
  }
}
