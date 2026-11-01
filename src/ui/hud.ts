import { WHY } from '../data/why';
import { BALANCE } from '../data/balance';
import { ELEPHANTS } from '../data/elephants';
import { barrowSummary, clockText, dayPart, itemLabel, profileOf, type ActionOption, type ChecklistId, type ShiftEvent, type State } from '../sim';
import type { Input } from '../game/input';
import { renderReport } from './report';
import { ICON, itemIcon, portraitIcon } from './icons';
import { barrowUrl } from '../game/textures';

// Интерфейс поверх canvas: часы, слонихи, ресурсы, подсказка действия, лента событий, чек-лист, кнопки

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
  private lastChips = '';
  private lastHeld: string | null = null;
  private checklistOpen = window.innerWidth > 560;
  private reportShown = false;
  paused = false;
  introOpen = true;

  constructor(root: HTMLElement, input: Input, private cb: HudCallbacks) {
    const portraits = ELEPHANTS.map((p) => `<img src="${portraitIcon(p.id)}" alt="${p.name}">`).join('');
    root.innerHTML = `
      <div class="top">
        <div class="clock panel">
          <span class="dayIcon" data-el="dayIcon">${ICON.sun}</span>
          <div><b data-el="clock">08:00</b><span data-el="part"></span></div>
          <div class="dayBar"><i data-el="dayBar"></i></div>
        </div>
        <div class="chips" data-el="chips"></div>
        <div class="res panel" data-el="res"></div>
        <button class="icon panel" data-el="pauseBtn" aria-label="Пауза">${ICON.pause}</button>
      </div>
      <div class="held panel" data-el="held"></div>
      <div class="balance panel hidden" data-el="balance">
        <span>БАЛАНС</span>
        <div class="bar"><i data-el="needle"></i></div>
        <div class="lean">
          <button class="btn ghost" data-el="leanL">&lt; Q</button>
          <button class="btn ghost" data-el="leanR">E &gt;</button>
        </div>
      </div>
      <div class="feed" data-el="feed"></div>
      <div class="inspect panel hidden" data-el="inspect"></div>
      <div class="checklist hidden" data-el="checklist"></div>
      <div class="bottom">
        <div class="stick" data-el="stick"><div class="knob" data-el="knob"></div></div>
        <div class="actionHint panel" data-el="hint"></div>
        <div class="buttons">
          <button class="btn round inspectBtn" data-el="inspectBtn" aria-label="Осмотр">${ICON.eye}<small>F</small></button>
          <button class="btn round actionBtn" data-el="actionBtn" aria-label="Действие">${ICON.hand}<small>Space</small></button>
        </div>
      </div>
      <div class="overlay" data-el="intro">
        <div class="card poster">
          <div class="marquee"></div>
          <p class="kicker">Цирк на гастролях · суточное дежурство</p>
          <h1>Дежурный кипер</h1>
          <div class="portraits">${portraits}</div>
          <p>Ты заступаешь на сутки при трёх слонихах — <b>Претти</b>, <b>Марго</b> и <b>Одри</b>. Утром сменщик примет у тебя слоновник и будет придираться.</p>
          <ol class="rules">
            <li><b>Приём смены.</b> Обойди слоновник и отметь 7 пунктов. Найденный косяк сменщика — не твой.</li>
            <li><b>Туалет.</b> У каждой свой сигнал. Успей подставить бак — иначе мокрая подстилка и больные ноги. Угости за бак, бак вылей в решётку слива. Одри не предупреждает: веди её «погулять».</li>
            <li><b>Пол.</b> Мокрое — вилами, потом опилки, метла, солома. Навоз — совком, сразу.</li>
            <li><b>Корм.</b> Каша в 13:00 и 17:00, овощной ужин к 19:00. Пустые тазы — собрать и вымыть.</li>
            <li><b>Тачка.</b> Возит инвентарь, опилки, солому, тюки и мусор. Поставь рядом — и убирай. Три тюка и больше качаются: держи равновесие Q / E.</li>
          </ol>
          <p class="keys"><kbd>WASD</kbd> ходить · <kbd>Space</kbd> действие · <kbd>F</kbd> осмотр · <kbd>P</kbd> пауза</p>
          <button class="btn primary big" data-el="introBtn">Заступить на смену</button>
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
    tap('introBtn', () => this.closeIntro());
    tap('resumeBtn', () => this.togglePause());
    this.els.inspect.addEventListener('pointerdown', () => this.els.inspect.classList.add('hidden'));
    // Кнопки равновесия держат нажатыми
    const hold = (name: string, dir: -1 | 1) => {
      const el = this.els[name];
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        input.stickBalance = dir;
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => (input.stickBalance = 0));
    };
    hold('leanL', -1);
    hold('leanR', 1);
    input.bindStick(this.els.stick, this.els.knob);
  }

  closeIntro(): void {
    this.introOpen = false;
    this.els.intro.classList.add('hidden');
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
      el.innerHTML = `<span class="ti">${ICON[ev.kind]}</span><span class="tt"></span>`;
      el.querySelector('.tt')!.textContent = ev.text;
      const toast = { el, until: performance.now() + (ev.kind === 'hint' ? 11000 : ev.why ? 8000 : 5000) };
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
        el.querySelector('.tt')!.appendChild(btn);
      }
      this.els.feed.appendChild(el);
      this.toasts.push(toast);
    }
    while (this.toasts.length > 4) this.toasts.shift()!.el.remove();
  }

  render(s: State, action: ActionOption | null): void {
    const now = performance.now();
    this.toasts = this.toasts.filter((t) => (t.until > now ? true : (t.el.remove(), false)));

    this.els.clock.textContent = clockText(s.t);
    const part = dayPart(s.t);
    this.els.part.textContent =
      s.phase === 'acceptance' ? 'приём смены' : part === 'day' ? 'день' : part === 'night' ? 'ночь' : 'утро, скоро сдача';
    this.els.dayIcon.innerHTML = part === 'night' || s.t > 690 ? ICON.moon : ICON.sun;
    this.els.dayBar.style.width = `${Math.min(100, (s.t / BALANCE.time.shiftEnd) * 100)}%`;

    const chips = s.elephants
      .map((e) => {
        const p = profileOf(e);
        const alarm = e.signalStarted !== undefined;
        const state = alarm ? 'alarm' : e.state === 'sleep' ? 'sleep' : e.state === 'sway' ? 'sad' : s.t <= e.praiseUntil ? 'praise' : '';
        const badge = alarm ? '!' : e.state === 'sleep' ? 'z' : e.state === 'sway' ? '~' : s.t <= e.praiseUntil ? '♥' : '';
        return `<span class="chip panel ${state}"><img src="${portraitIcon(p.id)}" alt=""><span>${p.name}</span>${badge ? `<i>${badge}</i>` : ''}</span>`;
      })
      .join('');
    if (chips !== this.lastChips) {
      this.lastChips = chips;
      this.els.chips.innerHTML = chips;
    }
    const low = (v: number, min: number) => (v < min ? ' low' : '');
    this.els.res.innerHTML = `
      <span class="r${low(s.trough, BALANCE.handover.troughMin)}" title="Вода в поилке">${ICON.drop}${Math.round(s.trough)}%</span>
      <span class="r${low(s.feederHay, BALANCE.handover.hayMin)}" title="Сено в кормушке">${ICON.hay}${Math.round(s.feederHay)}%</span>
      <span class="r${s.kitchen.cleanBasins === 0 ? ' low' : ''}" title="Чистых тазов">${ICON.bowl}${s.kitchen.cleanBasins}</span>`;

    const heldKey = s.barrow.pushed ? `barrow-${barrowSummary(s)}` : s.player.held ? `${s.player.held.kind}-${itemLabel(s.player.held)}` : '';
    if (heldKey !== this.lastHeld) {
      this.lastHeld = heldKey;
      this.els.held.innerHTML = s.barrow.pushed
        ? `<img src="${barrowUrl()}" alt=""><span>Тачка: <b>${barrowSummary(s)}</b></span>`
        : s.player.held
          ? `<img src="${itemIcon(s.player.held)}" alt=""><span>В руках: <b>${itemLabel(s.player.held)}</b></span>`
          : `<span class="muted">Руки свободны</span>`;
    }
    const balancing = s.barrow.pushed && s.barrow.bales > BALANCE.barrow.stableBales;
    this.els.balance.classList.toggle('hidden', !balancing);
    if (balancing) {
      this.els.needle.style.left = `${50 + s.barrow.balance * 50}%`;
      this.els.balance.classList.toggle('danger', Math.abs(s.barrow.balance) > 0.65);
    }
    this.els.hint.innerHTML = action ? `${action.disabled ? ICON.info : ICON.hand}<span>${action.label}</span>` : '';
    this.els.hint.classList.toggle('disabled', !!action?.disabled);
    this.els.hint.classList.toggle('empty', !action);
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
      el.innerHTML = `<button class="btn primary" data-toggle>Чек-лист приёма ${marked}/7</button>`;
      el.querySelector('[data-toggle]')!.addEventListener('click', () => (this.checklistOpen = true));
      return;
    }
    el.innerHTML = `
      <div class="head"><b>Приём смены</b><button class="btn ghost" data-toggle>Свернуть</button></div>
      <small>Обойди слоновник. Не в порядке — жми <span class="cross">${ICON.cross}</span></small>
      ${s.checklist
        .map(
          (c) => `<div class="row ${c.mark === true ? 'isok' : c.mark === false ? 'isbad' : ''}"><span>${c.label}</span>
            <button data-id="${c.id}" data-v="1" class="${c.mark === true ? 'on ok' : ''}" aria-label="в порядке">${ICON.check}</button>
            <button data-id="${c.id}" data-v="0" class="${c.mark === false ? 'on bad' : ''}" aria-label="не в порядке">${ICON.cross}</button></div>`,
        )
        .join('')}
      <button class="btn primary" data-accept ${allMarked ? '' : 'disabled'}>Принять смену${allMarked ? '' : ` · ${marked}/7`}</button>`;
    el.querySelectorAll<HTMLButtonElement>('button[data-id]').forEach((b) =>
      b.addEventListener('click', () => this.cb.toggleCheck(b.dataset.id as ChecklistId, b.dataset.v === '1')),
    );
    el.querySelector('[data-accept]')!.addEventListener('click', () => this.cb.accept());
    el.querySelector('[data-toggle]')!.addEventListener('click', () => (this.checklistOpen = false));
  }
}
