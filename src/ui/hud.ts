import { WHY } from '../data/why';
import { clockText, dayPart, itemLabel, profileOf, type ActionOption, type ChecklistId, type ShiftEvent, type State } from '../sim';
import type { Input } from '../game/input';
import { renderReport } from './report';

// Интерфейс поверх canvas: часы, подсказка действия, лента событий, чек-лист, кнопки для телефона

export interface HudCallbacks {
  toggleCheck: (id: ChecklistId, value: boolean) => void;
  accept: () => void;
  restart: () => void;
  setPaused: (paused: boolean) => void;
}

interface Toast {
  el: HTMLElement;
  until: number;
}

export class Hud {
  private els: Record<string, HTMLElement> = {};
  private toasts: Toast[] = [];
  private lastChecklist = '';
  private checklistOpen = window.innerWidth > 560;
  private reportShown = false;
  paused = false;
  introOpen = true;

  constructor(root: HTMLElement, input: Input, private cb: HudCallbacks) {
    root.innerHTML = `
      <div class="top">
        <div class="clock"><b data-el="clock">08:00</b><span data-el="part"></span></div>
        <div class="chips" data-el="chips"></div>
        <button class="icon" data-el="pauseBtn" aria-label="Пауза">II</button>
      </div>
      <div class="held" data-el="held"></div>
      <div class="feed" data-el="feed"></div>
      <div class="inspect hidden" data-el="inspect"></div>
      <div class="checklist hidden" data-el="checklist"></div>
      <div class="bottom">
        <div class="stick" data-el="stick"><div class="knob" data-el="knob"></div></div>
        <div class="actionHint" data-el="hint"></div>
        <div class="buttons">
          <button class="btn inspectBtn" data-el="inspectBtn">Осмотр<small>F</small></button>
          <button class="btn actionBtn" data-el="actionBtn">Действие<small>Space</small></button>
        </div>
      </div>
      <div class="overlay" data-el="intro">
        <div class="card">
          <h1>Дежурный кипер</h1>
          <p>Цирк на гастролях. Ты заступаешь на суточное дежурство при трёх слонихах: Претти, Марго и Одри.</p>
          <ul>
            <li><b>Сначала приём смены.</b> Обойди слоновник и отметь 7 пунктов. Косяк сменщика, который ты нашёл, не твой.</li>
            <li><b>Туалет.</b> У каждой свой сигнал. Успей подставить бак — иначе мокрая подстилка и больные ноги.</li>
            <li><b>Пол.</b> Мокрое — вилами в мешок, опилки, метла, сухая солома. Навоз — совком сразу.</li>
            <li><b>Корм.</b> Каша в 13:00 и 17:00, овощной ужин к 19:00. Пустые тазы — забрать.</li>
            <li><b>Утром 08:00</b> сдаёшь смену. Сменщик придирчив.</li>
          </ul>
          <p class="keys">WASD / стрелки — ходить · Space / E — действие · F — осмотр · P — пауза</p>
          <button class="btn primary" data-el="introBtn">К приёму смены</button>
        </div>
      </div>
      <div class="overlay hidden" data-el="pause">
        <div class="card small"><h2>Пауза</h2><button class="btn primary" data-el="resumeBtn">Продолжить</button></div>
      </div>
      <div class="overlay hidden" data-el="report"></div>`;
    root.querySelectorAll<HTMLElement>('[data-el]').forEach((el) => (this.els[el.dataset.el!] = el));

    const tap = (name: string, fn: () => void) =>
      this.els[name].addEventListener('pointerdown', (e) => {
        e.preventDefault();
        fn();
      });
    tap('actionBtn', () => input.push('action'));
    tap('inspectBtn', () => input.push('inspect'));
    tap('pauseBtn', () => input.push('pause'));
    tap('introBtn', () => {
      this.introOpen = false;
      this.els.intro.classList.add('hidden');
    });
    tap('resumeBtn', () => this.togglePause());
    this.els.inspect.addEventListener('pointerdown', () => this.els.inspect.classList.add('hidden'));
    input.bindStick(this.els.stick, this.els.knob);
  }

  togglePause(): void {
    if (this.introOpen || this.reportShown) return;
    this.paused = !this.paused;
    this.els.pause.classList.toggle('hidden', !this.paused);
    this.cb.setPaused(this.paused);
  }

  hideInspect(): void {
    this.els.inspect.classList.add('hidden');
  }

  showInspect(text: string): void {
    const [title, ...rest] = text.split('\n');
    this.els.inspect.innerHTML = `<b>${title}</b>${rest.map((l) => `<div>${l}</div>`).join('')}<small>нажми, чтобы закрыть</small>`;
    this.els.inspect.classList.remove('hidden');
  }

  pushEvents(events: ShiftEvent[], inspectText?: string): void {
    for (const ev of events) {
      if (ev.text === inspectText) continue;
      const el = document.createElement('div');
      el.className = `toast ${ev.kind}`;
      el.textContent = ev.text;
      if (ev.why) {
        const why = WHY[ev.why];
        const btn = document.createElement('button');
        btn.className = 'why';
        btn.textContent = 'почему?';
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          btn.replaceWith(Object.assign(document.createElement('div'), { className: 'whyText', textContent: why }));
          toast.until = performance.now() + 12000;
        });
        el.appendChild(btn);
      }
      const toast = { el, until: performance.now() + (ev.kind === 'hint' ? 11000 : ev.why ? 8000 : 5000) };
      this.els.feed.prepend(el);
      this.toasts.push(toast);
    }
    while (this.toasts.length > 5) this.toasts.shift()!.el.remove();
  }

  render(s: State, action: ActionOption | null): void {
    const now = performance.now();
    this.toasts = this.toasts.filter((t) => (t.until > now ? true : (t.el.remove(), false)));

    this.els.clock.textContent = clockText(s.t);
    const part = dayPart(s.t);
    this.els.part.textContent =
      s.phase === 'acceptance' ? 'приём смены' : part === 'day' ? 'день' : part === 'night' ? 'ночь' : 'утро, скоро сдача';
    this.els.chips.innerHTML = s.elephants
      .map((e) => {
        const p = profileOf(e);
        const alarm = e.signalStarted !== undefined;
        const icon = alarm ? '!' : e.state === 'sleep' ? 'z' : e.state === 'sway' ? '~' : '';
        return `<span class="chip ${alarm ? 'alarm' : ''}">${p.name}${icon ? ` <i>${icon}</i>` : ''}</span>`;
      })
      .join('');
    this.els.held.textContent = s.player.held ? `В руках: ${itemLabel(s.player.held)}` : 'Руки свободны';
    this.els.hint.textContent = action?.label ?? '';
    this.els.hint.classList.toggle('disabled', !!action?.disabled);
    this.els.actionBtn.classList.toggle('ready', !!action && !action.disabled);

    this.renderChecklist(s);
    if (s.phase === 'report' && s.report && !this.reportShown) {
      this.reportShown = true;
      this.els.report.innerHTML = renderReport(s.report);
      this.els.report.classList.remove('hidden');
      this.els.report.querySelector('[data-restart]')!.addEventListener('click', () => this.cb.restart());
    }
  }

  private renderChecklist(s: State): void {
    const el = this.els.checklist;
    if (s.phase !== 'acceptance') {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const key = JSON.stringify([this.checklistOpen, s.checklist.map((c) => c.mark)]);
    if (key === this.lastChecklist) return;
    this.lastChecklist = key;
    const allMarked = s.checklist.every((c) => c.mark !== null);
    const marked = s.checklist.filter((c) => c.mark !== null).length;
    el.classList.toggle('collapsed', !this.checklistOpen);
    if (!this.checklistOpen) {
      el.innerHTML = `<button class="btn" data-toggle>Чек-лист приёма ${marked}/7</button>`;
      el.querySelector('[data-toggle]')!.addEventListener('click', () => (this.checklistOpen = true));
      return;
    }
    el.innerHTML = `
      <div class="head"><b>Приём смены</b><button class="btn" data-toggle>Свернуть</button></div>
      <small>Обойди и проверь. ✗ — если не в порядке.</small>
      ${s.checklist
        .map(
          (c) => `<div class="row"><span>${c.label}</span>
            <button data-id="${c.id}" data-v="1" class="${c.mark === true ? 'on ok' : ''}">✓</button>
            <button data-id="${c.id}" data-v="0" class="${c.mark === false ? 'on bad' : ''}">✗</button></div>`,
        )
        .join('')}
      <button class="btn primary" data-accept ${allMarked ? '' : 'disabled'}>Принять смену</button>`;
    el.querySelectorAll<HTMLButtonElement>('button[data-id]').forEach((b) =>
      b.addEventListener('click', () => this.cb.toggleCheck(b.dataset.id as ChecklistId, b.dataset.v === '1')),
    );
    el.querySelector('[data-accept]')!.addEventListener('click', () => this.cb.accept());
    el.querySelector('[data-toggle]')!.addEventListener('click', () => (this.checklistOpen = false));
  }
}
