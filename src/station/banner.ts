// Плашка стажировки со старшим кипером: этап и шаг, реплика наставника, что сделать, прогресс,
// обработка ошибок/провала («Повторить этап»), переход к следующему этапу («Следующий этап →»)
// и (внутри станции) кнопка «На станцию».

import type { ScenarioRun } from './scenarios';

export interface BannerCallbacks {
  onRetry?: () => void;
  onNextStage?: (nextId: string) => void;
}

export class TaskBanner {
  private el: HTMLElement;
  private head: HTMLElement;
  private mentor: HTMLElement;
  private task: HTMLElement;
  private count: HTMLElement;
  private actions: HTMLElement;
  private retryBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private currentNextId: string | null = null;

  constructor(root: HTMLElement, onExit: (() => void) | null, callbacks: BannerCallbacks = {}) {
    this.el = document.createElement('section');
    this.el.className = 'task-banner';
    this.el.setAttribute('aria-live', 'polite');
    this.el.setAttribute('aria-label', 'Задание стажировки');

    this.head = document.createElement('p');
    this.head.className = 'task-head';

    this.mentor = document.createElement('p');
    this.mentor.className = 'task-mentor';

    this.task = document.createElement('p');
    this.task.className = 'task-text';

    this.count = document.createElement('p');
    this.count.className = 'task-count';

    this.actions = document.createElement('div');
    this.actions.className = 'task-actions';

    this.retryBtn = document.createElement('button');
    this.retryBtn.type = 'button';
    this.retryBtn.className = 'task-btn danger';
    this.retryBtn.textContent = 'Повторить этап';
    this.retryBtn.hidden = true;
    this.retryBtn.addEventListener('click', () => callbacks.onRetry?.());

    this.nextBtn = document.createElement('button');
    this.nextBtn.type = 'button';
    this.nextBtn.className = 'task-btn primary';
    this.nextBtn.textContent = 'Следующий этап →';
    this.nextBtn.hidden = true;
    this.nextBtn.addEventListener('click', () => {
      if (this.currentNextId) callbacks.onNextStage?.(this.currentNextId);
    });

    this.actions.append(this.retryBtn, this.nextBtn);

    if (onExit) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'task-exit';
      b.textContent = 'На станцию';
      b.addEventListener('click', onExit);
      this.actions.append(b);
    }

    this.el.append(this.head, this.mentor, this.task, this.count, this.actions);
    root.append(this.el);
  }

  show(visible: boolean): void {
    this.el.hidden = !visible;
  }

  /**
   * Над подсказкой главного действия, а не поверх неё: подсказка внизу экрана и на касаниях ловит нажатия.
   * Вызывается из кадра; положение пересчитывается не чаще раза в 250 мс.
   */
  place(prompt: HTMLElement | null, now: number): void {
    if (this.el.hidden || now - this.placedAt < 250) return;
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
    this.el.hidden = false;
    this.head.textContent = run.headerText;
    this.mentor.textContent = run.mentorText;
    this.mentor.dataset.tone = run.mentorTone;
    this.task.textContent = run.taskText;
    this.count.textContent = run.countText;

    this.el.classList.toggle('done', run.complete);
    this.el.classList.toggle('failed', run.failed);
    this.el.classList.toggle('warned', !run.failed && !run.complete && run.mentorTone === 'warn');

    this.retryBtn.hidden = !run.failed;
    const nextId = run.complete ? (run.scenario.nextStageId ?? null) : null;
    this.currentNextId = nextId;
    this.nextBtn.hidden = !nextId;
  }
}
