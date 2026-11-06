// Интерфейс: верхняя строка (время, смена, скорость), карточки стада, контекстное действие,
// уведомления, осмотр слона, журнал, меню, итог смены. Мир остаётся главным — панели компактны.

import {
  characterHints,
  clockText,
  describeCharacter,
  heldLabel,
  minuteOfDay,
  pressingNeed,
  shiftDay,
  signalClarity,
  slotInfo,
  temperature,
  TRAIT_KEYS,
  TRAIT_LABELS,
  wellbeing,
  bond,
  type ActionOption,
  type DayReport,
  type Elephant,
  type NeedKey,
  type SimEvent,
  type SlotId,
  type State,
} from '../sim';
import { CAPACITY } from '../data/facility';
import { KEEPER } from '../data/balance';
import { ICON } from './icons';
import { portrait } from './portrait';

export interface HudHandlers {
  action: (id: string) => void;
  select: (id: string | null) => void;
  focus: (x: number, y: number) => void;
  speed: (v: number) => void;
  pauseToggle: () => void;
  setPaused: (p: boolean) => void;
  newGame: (herd: number, seed: number | null) => void;
  continueGame: () => boolean;
  save: (slot: SlotId) => string;
  load: (slot: SlotId) => string | null;
  exportSave: () => void;
  importSave: (file: File) => void;
  toggleSound: () => boolean;
  soundMuted: () => boolean;
  toggleNames: () => boolean;
  namesOn: () => boolean;
  closeReport: () => void;
  zoom: (k: number) => void;
  overview: () => void;
  legacyCount: () => number;
  clearLegacy: () => void;
}

const NEED_LABELS: Record<NeedKey, string> = {
  hunger: 'Голод',
  thirst: 'Жажда',
  bladder: 'Мочевой пузырь',
  bowel: 'Кишечник',
  fatigue: 'Усталость',
  boredom: 'Скука',
  social: 'Одиночество',
  heat: 'Жара',
  stress: 'Стресс',
};

const NEED_ICON: Partial<Record<NeedKey, string>> = {
  hunger: ICON.hay,
  thirst: ICON.drop,
  bladder: ICON.drop,
  fatigue: ICON.zzz,
  boredom: ICON.target,
  social: ICON.heart,
  heat: ICON.temp,
  stress: ICON.alert,
};

const SIGNAL_ICON: Record<string, string> = {
  toilet: ICON.drop,
  out: ICON.door,
  in: ICON.house,
  food: ICON.hay,
  water: ICON.drop,
  attention: ICON.heart,
};

const SIGNAL_TEXT: Record<string, string> = {
  toilet: 'просится в туалет',
  out: 'просится на выгул',
  in: 'просится в слоновник',
  food: 'просит еды',
  water: 'просит воды',
  attention: 'просит внимания',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function bar(value: number, warn = 70, invert = false): string {
  const v = Math.max(0, Math.min(100, value));
  const level = invert ? (v < 30 ? 'bad' : v < 55 ? 'warn' : 'ok') : v >= warn + 15 ? 'bad' : v >= warn ? 'warn' : 'ok';
  return `<span class="bar ${level}"><i style="width:${v.toFixed(0)}%"></i></span>`;
}

export class Hud {
  private refs: Record<string, HTMLElement> = {};
  private toasts: { el: HTMLElement; until: number }[] = [];
  private cardsKey = '';
  private bannerKey = '__init__';
  private inspectId: string | null = null;
  private inspectKey = '';
  private journalOpen = false;
  private journalKey = '';
  private modal: 'title' | 'menu' | 'report' | null = null;
  private lastSpeed = 1;
  private herdChoice = 3;
  actions: ActionOption[] = [];

  constructor(root: HTMLElement, private h: HudHandlers) {
    root.innerHTML = `
      <header class="top">
        <div class="pill brand"><span class="ico">${ICON.logo}</span><b>ELEPHANT KEEPER</b></div>
        <div class="pill clock" data-r="clock">
          <span class="ico" data-r="dayIcon">${ICON.sun}</span>
          <span data-r="clockText">День 1 · 08:00</span>
          <span class="muted" data-r="temp"></span>
          <span class="shift"><i data-r="shift"></i></span>
        </div>
        <div class="grow"></div>
        <div class="seg" role="group" aria-label="Скорость времени" data-r="speed">
          <button data-speed="0" title="Пауза (P)" aria-label="Пауза">${ICON.pause}</button>
          <button data-speed="1" title="Обычная скорость (T)">1×</button>
          <button data-speed="2" title="Быстрее (T)">2×</button>
          <button data-speed="4" title="Ещё быстрее (T)">4×</button>
        </div>
        <button class="btn icon" data-r="mapBtn" title="Обзор всей территории (Tab)" aria-label="Обзор карты">${ICON.map}</button>
        <button class="btn" data-r="journalBtn" title="Журнал смены (J)"><span class="ico">${ICON.journal}</span><span class="lbl">Журнал</span></button>
        <button class="btn icon" data-r="soundBtn" title="Звук (M)" aria-label="Звук">${ICON.sound}</button>
        <button class="btn icon" data-r="menuBtn" title="Меню и сохранения (Esc)" aria-label="Меню">${ICON.menu}</button>
      </header>
      <div class="toasts" data-r="toasts" aria-live="polite"></div>
      <aside class="herd" data-r="herd" aria-label="Стадо"></aside>
      <aside class="drawer" data-r="inspect" hidden></aside>
      <aside class="drawer right" data-r="journal" hidden></aside>
      <footer class="bottom">
        <div class="pill held" data-r="held"></div>
        <div class="banner" data-r="banner"></div>
        <div class="zoom">
          <button class="btn icon small" data-r="zoomIn" aria-label="Приблизить">${ICON.plus}</button>
          <button class="btn icon small" data-r="zoomOut" aria-label="Отдалить">${ICON.minus}</button>
        </div>
      </footer>
      <div class="touch" data-r="touch">
        <div class="stick" data-r="stick"><div class="knob" data-r="knob"></div></div>
        <div class="touch-btns">
          <button class="btn round small" data-r="tDrop" aria-label="Положить вещь">${ICON.drop2}</button>
          <button class="btn round primary" data-r="tAct" aria-label="Действие">${ICON.hand}</button>
        </div>
      </div>
      <div class="modal-wrap" data-r="modal" hidden></div>
    `;
    root.querySelectorAll<HTMLElement>('[data-r]').forEach((n) => (this.refs[n.dataset.r!] = n));
    this.refs.speed.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.speed) this.h.speed(Number(b.dataset.speed));
    });
    this.refs.journalBtn.addEventListener('click', () => this.toggleJournal());
    this.refs.soundBtn.addEventListener('click', () => this.updateSoundBtn(this.h.toggleSound()));
    this.refs.menuBtn.addEventListener('click', () => this.openMenu());
    this.refs.mapBtn.addEventListener('click', () => this.h.overview());
    this.refs.zoomIn.addEventListener('click', () => this.h.zoom(1.15));
    this.refs.zoomOut.addEventListener('click', () => this.h.zoom(0.87));
    this.refs.herd.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (card) this.h.select(card.dataset.id === this.inspectId ? null : card.dataset.id!);
    });
    this.refs.banner.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (b) this.h.action(b.dataset.action!);
    });
    this.refs.tAct.addEventListener('click', () => {
      const first = this.actions.find((a) => a.enabled);
      if (first) this.h.action(first.id);
    });
    this.refs.tDrop.addEventListener('click', () => {
      const d = this.actions.find((a) => a.ref.verb === 'drop');
      if (d) this.h.action(d.id);
    });
    this.updateSoundBtn(this.h.soundMuted());
  }

  get modalOpen(): boolean {
    return this.modal !== null;
  }

  stickElements(): { base: HTMLElement; knob: HTMLElement } {
    return { base: this.refs.stick, knob: this.refs.knob };
  }

  private updateSoundBtn(muted: boolean): void {
    this.refs.soundBtn.innerHTML = muted ? ICON.mute : ICON.sound;
    this.refs.soundBtn.setAttribute('aria-pressed', String(!muted));
  }

  setSpeed(v: number): void {
    this.lastSpeed = v;
    this.refs.speed.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === v));
  }

  // -------------------------------------------------------------------------
  // Кадр
  // -------------------------------------------------------------------------

  render(s: State, actions: ActionOption[], selected: string | null): void {
    this.actions = actions;
    const m = minuteOfDay(s.t);
    const night = m >= 21 * 60 || m < 5.5 * 60;
    this.refs.dayIcon.innerHTML = night ? ICON.moon : ICON.sun;
    this.refs.clockText.textContent = `День ${shiftDay(s.t)} · ${clockText(s.t)}`;
    this.refs.temp.textContent = `${Math.round(temperature(s.seed, s.t))}°`;
    const progress = ((s.t - s.dayStart) / 1440) * 100;
    this.refs.shift.style.width = `${Math.max(0, Math.min(100, progress)).toFixed(1)}%`;
    this.renderHeld(s);
    this.renderCards(s, selected);
    this.renderBanner(s, actions);
    if (selected !== this.inspectId) {
      this.inspectId = selected;
      this.inspectKey = '';
    }
    this.renderInspect(s);
    if (this.journalOpen) this.renderJournal(s);
    const now = performance.now();
    this.toasts = this.toasts.filter((t) => {
      if (t.until > now) return true;
      t.el.classList.add('out');
      setTimeout(() => t.el.remove(), 300);
      return false;
    });
  }

  private renderHeld(s: State): void {
    const k = s.keeper;
    const b = s.world.barrow;
    const parts = [`<span class="ico">${ICON.hand}</span>${esc(heldLabel(k.held))}`];
    if (b.pushed || b.load > 0) parts.push(`тачка ${b.load}/${KEEPER.barrowMax}`);
    parts.push(`лакомства ${k.pouch}`);
    const html = parts.join('<span class="dot">·</span>');
    if (this.refs.held.innerHTML !== html) this.refs.held.innerHTML = html;
  }

  private renderCards(s: State, selected: string | null): void {
    const key = s.elephants
      .map((e) => {
        const need = pressingNeed(e);
        return `${e.id}:${e.act.note}:${e.signal?.kind ?? ''}:${need?.key ?? ''}:${Math.round(wellbeing(e) / 10)}:${selected === e.id}:${e.lying}`;
      })
      .join('|');
    if (key === this.cardsKey) return;
    this.cardsKey = key;
    this.refs.herd.innerHTML = s.elephants
      .map((e) => {
        const wb = wellbeing(e);
        const need = pressingNeed(e);
        const sig = e.signal;
        const clear = sig ? signalClarity(e) >= 0.5 : false;
        const mood = wb >= 70 ? 'ok' : wb >= 45 ? 'warn' : 'bad';
        return `<button class="card ${selected === e.id ? 'sel' : ''} ${sig ? 'signal' : ''}" data-id="${e.id}" aria-label="${esc(e.profile.name)}: ${esc(e.act.note)}">
          <span class="mood ${mood}" style="--c:${e.profile.color}" title="Самочувствие ${Math.round(wb)}"></span>
          <span class="card-text"><b>${esc(e.profile.name)}</b><small>${esc(e.lying ? 'спит лёжа' : e.act.note)}</small></span>
          ${sig ? `<span class="sig ${clear ? '' : 'faint'}" title="${SIGNAL_TEXT[sig.kind]}">${SIGNAL_ICON[sig.kind]}</span>` : need && NEED_ICON[need.key] ? `<span class="need" title="${NEED_LABELS[need.key]}">${NEED_ICON[need.key]}</span>` : ''}
        </button>`;
      })
      .join('');
  }

  private renderBanner(s: State, actions: ActionOption[]): void {
    const task = s.keeper.task;
    const key = task ? `task:${task.label}:${Math.floor((task.elapsed / task.dur) * 10)}` : actions.map((a) => `${a.id}:${a.enabled}:${a.label}`).join('|');
    if (key === this.bannerKey) return;
    this.bannerKey = key;
    const b = this.refs.banner;
    if (task) {
      b.className = 'banner busy';
      b.innerHTML = `<span class="spin"></span><span>${esc(task.label)}…</span>`;
      return;
    }
    const list = actions.filter((a) => a.ref.verb !== 'drop' || actions.length === 1);
    const drop = actions.find((a) => a.ref.verb === 'drop');
    if (!list.length && !drop) {
      b.className = 'banner idle';
      b.innerHTML = `<span class="muted">Подойди к слону, станции или вещи</span>`;
      return;
    }
    const main = list[0] ?? drop!;
    const rest = list.slice(1, 6);
    b.className = 'banner';
    b.innerHTML = `
      <button class="act main ${main.enabled ? '' : 'off'}" data-action="${main.id}" title="${esc(main.reason)}">
        <kbd>E</kbd><span>${esc(main.label)}</span>${main.enabled ? '' : `<small>${esc(main.reason)}</small>`}
      </button>
      ${rest
        .map(
          (a, i) =>
            `<button class="act ${a.enabled ? '' : 'off'}" data-action="${a.id}" title="${esc(a.reason)}"><kbd>${i + 2}</kbd><span>${esc(a.label)}</span></button>`,
        )
        .join('')}
      ${drop && main !== drop ? `<button class="act ghost" data-action="${drop.id}"><kbd>Q</kbd><span>${esc(drop.label)}</span></button>` : ''}`;
  }

  // Действия по клавишам: E — главное, 2…6 — остальные, Q — положить
  actionForKey(index: number): ActionOption | undefined {
    const list = this.actions.filter((a) => a.ref.verb !== 'drop' || this.actions.length === 1);
    return list[index];
  }

  // -------------------------------------------------------------------------
  // Осмотр слона
  // -------------------------------------------------------------------------

  private renderInspect(s: State): void {
    const box = this.refs.inspect;
    const e = s.elephants.find((x) => x.id === this.inspectId);
    if (!e) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const n = e.needs;
    const key = `${e.id}:${Object.values(n).map((v) => Math.round(v / 4)).join(',')}:${e.act.note}:${e.signal?.kind}:${Math.round(e.learned.trust * 100)}:${Math.round(e.learned.cooperation * 100)}:${Math.round(e.learned.expectation * 100)}`;
    if (key === this.inspectKey) return;
    const first = this.inspectKey === '' || !box.querySelector(`[data-eid="${e.id}"]`);
    this.inspectKey = key;
    const p = e.profile;
    const needs: NeedKey[] = ['hunger', 'thirst', 'bladder', 'bowel', 'fatigue', 'boredom', 'social', 'heat', 'stress'];
    const friends = s.elephants
      .filter((o) => o !== e)
      .map((o) => ({ o, b: bond(s, e.id, o.id) }))
      .sort((a, b) => b.b - a.b);
    const rel = friends
      .map(({ o, b }) => `<li><span class="dotc" style="--c:${o.profile.color}"></span>${esc(o.profile.name)} <span class="muted">${b > 0.4 ? 'подруга' : b > 0.1 ? 'ладят' : b > -0.15 ? 'нейтрально' : 'не ладят'}</span></li>`)
      .join('');
    const body = `
      <div class="ins-head" data-eid="${e.id}">
        <div class="portrait" data-r2="portrait"></div>
        <div>
          <h2>${esc(p.name)}</h2>
          <div class="muted">${p.age} ${plural(p.age, 'год', 'года', 'лет')} · рост ${(2.3 * p.look.size).toFixed(1)} м</div>
          <p class="desc">${esc(describeCharacter(p))}</p>
        </div>
        <button class="btn icon small close" data-close aria-label="Закрыть">${ICON.close}</button>
      </div>
      <div class="now">${e.signal ? `<span class="sig">${SIGNAL_ICON[e.signal.kind]}</span>` : ''}<b>Сейчас:</b> ${esc(e.lying ? 'спит лёжа' : e.act.note)}${e.signal ? ` · <span class="warn-t">${SIGNAL_TEXT[e.signal.kind]}</span>` : ''}</div>
      <div class="grid">
        ${needs.map((k) => `<div class="row"><span>${NEED_LABELS[k]}</span>${bar(n[k], k === 'social' ? 60 : 70)}</div>`).join('')}
      </div>
      <h3>Отношения с кипером</h3>
      <div class="grid">
        <div class="row"><span>Доверие</span>${bar(e.learned.trust * 100, 0, true)}</div>
        <div class="row"><span>Покладистость</span>${bar(e.learned.cooperation * 100, 0, true)}</div>
        <div class="row"><span>Ждёт ответа на сигналы</span>${bar(e.learned.expectation * 100, 0, true)}</div>
      </div>
      <h3>Характер</h3>
      <ul class="hints">${characterHints(p).map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      <details><summary>Черты подробно</summary><div class="grid traits">${TRAIT_KEYS.map((k) => `<div class="row"><span>${TRAIT_LABELS[k]}</span><span class="bar neutral"><i style="width:${(p.traits[k] * 100).toFixed(0)}%"></i></span></div>`).join('')}</div></details>
      ${rel ? `<h3>В стаде</h3><ul class="rel">${rel}</ul>` : ''}
      <div class="ins-actions"><button class="btn" data-focus>${ICON.target}<span>Показать на карте</span></button></div>`;
    const open = box.querySelector('details')?.hasAttribute('open');
    box.innerHTML = body;
    if (open) box.querySelector('details')?.setAttribute('open', '');
    const holder = box.querySelector<HTMLElement>('[data-r2="portrait"]')!;
    holder.appendChild(portrait(p));
    box.querySelector('[data-close]')!.addEventListener('click', () => this.h.select(null));
    box.querySelector('[data-focus]')!.addEventListener('click', () => this.h.focus(e.x, e.y));
    if (first) box.scrollTop = 0;
  }

  // -------------------------------------------------------------------------
  // Журнал
  // -------------------------------------------------------------------------

  toggleJournal(): void {
    this.journalOpen = !this.journalOpen;
    this.refs.journal.hidden = !this.journalOpen;
    this.journalKey = '';
  }

  private renderJournal(s: State): void {
    const key = `${s.journal.length}:${s.journal[s.journal.length - 1]?.id}:${s.alerts.length}:${Math.floor(s.t / 10)}`;
    if (key === this.journalKey) return;
    this.journalKey = key;
    const m = minuteOfDay(s.t);
    const routine = [
      { from: 8 * 60, to: 10 * 60, text: 'Утро: проверь воду, положи сено на выгул, открой ворота' },
      { from: 10 * 60, to: 12 * 60, text: 'Слоны снаружи — закрой ворота и убери слоновник' },
      { from: 12 * 60, to: 14 * 60, text: 'Овощи: в кормушку, с руки или разбросать по выгулу' },
      { from: 14 * 60, to: 17 * 60, text: 'Обогащение: ветки, барабан, душ в жару' },
      { from: 17 * 60, to: 20 * 60, text: 'Сено на ночь в слоновник, открой ворота — пусть заходят' },
      { from: 20 * 60, to: 24 * 60, text: 'Закрой ворота, убери выгул' },
      { from: 0, to: 8 * 60, text: 'Ночь: слоны спят, но могут позвать' },
    ];
    const alerts = s.alerts
      .slice(-6)
      .map((a) => `<li class="${a.severity}">${esc(a.text)}</li>`)
      .join('');
    const entries = s.journal
      .slice(-70)
      .reverse()
      .map((j) => `<li class="${j.severity}"><time>${clockText(j.t)}</time><span>${esc(j.text)}</span></li>`)
      .join('');
    this.refs.journal.innerHTML = `
      <div class="drawer-head"><h2>Журнал смены</h2><button class="btn icon small" data-close aria-label="Закрыть">${ICON.close}</button></div>
      <h3>Распорядок</h3>
      <ul class="routine">${routine.map((r) => `<li class="${m >= r.from && m < r.to ? 'now' : ''}">${esc(r.text)}</li>`).join('')}</ul>
      ${alerts ? `<h3>Требует внимания</h3><ul class="alerts">${alerts}</ul>` : ''}
      <h3>События</h3>
      <ul class="log">${entries || '<li class="muted">Пока тихо</li>'}</ul>`;
    this.refs.journal.querySelector('[data-close]')!.addEventListener('click', () => this.toggleJournal());
  }

  // -------------------------------------------------------------------------
  // Уведомления
  // -------------------------------------------------------------------------

  pushEvents(events: SimEvent[]): void {
    for (const ev of events) {
      if (!ev.text) continue;
      if (ev.severity === 'info' && ev.kind !== 'refuse' && ev.kind !== 'report') continue;
      this.toast(ev.text, ev.severity);
    }
  }

  toast(text: string, severity: string): void {
    if (this.toasts.some((t) => t.el.textContent === text)) return;
    const t = el('div', `toast ${severity}`, esc(text));
    this.refs.toasts.prepend(t);
    this.toasts.push({ el: t, until: performance.now() + (severity === 'bad' ? 7000 : 5200) });
    while (this.toasts.length > 3) {
      const old = this.toasts.shift()!;
      old.el.remove();
    }
  }

  // -------------------------------------------------------------------------
  // Окна: заставка, меню, итог смены
  // -------------------------------------------------------------------------

  private showModal(kind: 'title' | 'menu' | 'report', html: string): HTMLElement {
    this.modal = kind;
    const wrap = this.refs.modal;
    wrap.hidden = false;
    wrap.innerHTML = `<div class="modal ${kind}" role="dialog" aria-modal="true">${html}</div>`;
    return wrap.firstElementChild as HTMLElement;
  }

  closeModal(): void {
    this.modal = null;
    this.refs.modal.hidden = true;
    this.refs.modal.innerHTML = '';
  }

  openTitle(hasContinue: string | null): void {
    const legacy = this.h.legacyCount();
    const m = this.showModal(
      'title',
      `<div class="title-mark">${ICON.logo}</div>
      <h1>Elephant Keeper</h1>
      <p class="lead">Смена смотрителя в небольшом слоновнике. Слоны живут своей жизнью: едят, пьют, играют, спят — и зовут тебя, когда без тебя не обойтись. У каждой свой характер, и каждая запоминает, отвечаешь ли ты.</p>
      ${hasContinue ? `<button class="btn primary wide" data-go="continue">${ICON.play}<span>Продолжить смену</span><small>${esc(hasContinue)}</small></button>` : ''}
      <div class="newgame">
        <span>Новое стадо:</span>
        <div class="seg" data-herd>${Array.from({ length: CAPACITY }, (_, i) => `<button data-n="${i + 1}" class="${i + 1 === this.herdChoice ? 'on' : ''}">${i + 1}</button>`).join('')}</div>
        <button class="btn ${hasContinue ? '' : 'primary'}" data-go="new">Начать</button>
      </div>
      <div class="help">
        <div><kbd>WASD</kbd>/<kbd>стрелки</kbd> — идти, <kbd>Shift</kbd> — бежать (пугает нервных)</div>
        <div><kbd>E</kbd> — действие, <kbd>2</kbd>…<kbd>6</kbd> — другие варианты, <kbd>Q</kbd> — положить</div>
        <div>Клик по слону — осмотр · <kbd>J</kbd> — журнал · <kbd>T</kbd> — скорость · <kbd>Tab</kbd> — карта</div>
      </div>
      ${legacy ? `<p class="legacy">Найдены сохранения старой пиксельной версии (${legacy}) — с новой игрой они несовместимы. <button class="link" data-legacy>Удалить их</button></p>` : ''}`,
    );
    m.querySelector('[data-herd]')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-n]');
      if (!b) return;
      this.herdChoice = Number(b.dataset.n);
      m.querySelectorAll<HTMLElement>('[data-n]').forEach((x) => x.classList.toggle('on', x === b));
    });
    m.querySelector('[data-go="new"]')!.addEventListener('click', () => {
      this.closeModal();
      this.h.newGame(this.herdChoice, null);
    });
    m.querySelector('[data-go="continue"]')?.addEventListener('click', () => {
      if (this.h.continueGame()) this.closeModal();
    });
    m.querySelector('[data-legacy]')?.addEventListener('click', (e) => {
      this.h.clearLegacy();
      (e.target as HTMLElement).closest('.legacy')?.remove();
    });
  }

  openMenu(): void {
    if (this.modal === 'menu') {
      this.closeMenu();
      return;
    }
    if (this.modal) return;
    this.h.setPaused(true);
    const slots: SlotId[] = ['auto', 'slot-1', 'slot-2', 'slot-3'];
    const m = this.showModal(
      'menu',
      `<div class="drawer-head"><h2>Пауза</h2><button class="btn icon small" data-close aria-label="Закрыть">${ICON.close}</button></div>
      <h3>Сохранения</h3>
      <ul class="slots">${slots
        .map((id) => {
          const info = slotInfo(id);
          return `<li><div><b>${esc(info.title)}</b><small class="${info.exists && !info.ok ? 'bad-t' : 'muted'}">${esc(info.text)}</small></div>
            <div class="slot-btns">${id !== 'auto' ? `<button class="btn small" data-save="${id}">Сохранить</button>` : ''}<button class="btn small" data-load="${id}" ${info.ok ? '' : 'disabled'}>Загрузить</button></div></li>`;
        })
        .join('')}</ul>
      <div class="row-btns"><button class="btn small" data-export>Скачать .json</button><label class="btn small">Открыть .json<input type="file" accept="application/json,.json" data-import hidden></label></div>
      <h3>Настройки</h3>
      <div class="row-btns"><button class="btn small" data-names>${this.h.namesOn() ? 'Имена над слонами: вкл' : 'Имена над слонами: выкл'}</button><button class="btn small" data-sound>${this.h.soundMuted() ? 'Звук: выкл' : 'Звук: вкл'}</button></div>
      <h3>Новое стадо</h3>
      <div class="newgame"><div class="seg" data-herd>${Array.from({ length: CAPACITY }, (_, i) => `<button data-n="${i + 1}" class="${i + 1 === this.herdChoice ? 'on' : ''}">${i + 1}</button>`).join('')}</div><button class="btn danger small" data-new>Начать заново</button></div>
      <p class="muted small-p">Текущая смена при этом не сохраняется — сначала сохрани её в слот.</p>
      <button class="btn primary wide" data-close>${ICON.play}<span>Продолжить</span></button>`,
    );
    const status = (text: string) => this.toast(text, 'info');
    m.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.closeMenu()));
    m.querySelectorAll<HTMLElement>('[data-save]').forEach((b) =>
      b.addEventListener('click', () => {
        status(this.h.save(b.dataset.save as SlotId));
        this.closeModal();
        this.openMenu();
      }),
    );
    m.querySelectorAll<HTMLElement>('[data-load]').forEach((b) =>
      b.addEventListener('click', () => {
        const err = this.h.load(b.dataset.load as SlotId);
        if (err) status(err);
        else this.closeMenu();
      }),
    );
    m.querySelector('[data-export]')!.addEventListener('click', () => this.h.exportSave());
    m.querySelector<HTMLInputElement>('[data-import]')!.addEventListener('change', (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) {
        this.h.importSave(f);
        this.closeMenu();
      }
    });
    m.querySelector('[data-names]')!.addEventListener('click', (e) => {
      (e.target as HTMLElement).textContent = this.h.toggleNames() ? 'Имена над слонами: вкл' : 'Имена над слонами: выкл';
    });
    m.querySelector('[data-sound]')!.addEventListener('click', (e) => {
      const muted = this.h.toggleSound();
      this.updateSoundBtn(muted);
      (e.target as HTMLElement).textContent = muted ? 'Звук: выкл' : 'Звук: вкл';
    });
    m.querySelector('[data-herd]')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-n]');
      if (!b) return;
      this.herdChoice = Number(b.dataset.n);
      m.querySelectorAll<HTMLElement>('[data-n]').forEach((x) => x.classList.toggle('on', x === b));
    });
    m.querySelector('[data-new]')!.addEventListener('click', () => {
      this.closeModal();
      this.h.newGame(this.herdChoice, null);
      this.h.setPaused(false);
    });
  }

  closeMenu(): void {
    if (this.modal !== 'menu') return;
    this.closeModal();
    this.h.setPaused(false);
  }

  openReport(r: DayReport): void {
    const rows = r.elephants
      .map(
        (e) => `<tr><td><b>${esc(e.name)}</b><div class="muted small-p">${esc(e.highlights.join(' · ') || '—')}</div></td>
          <td>${bar(e.wellbeing, 0, true)}<small>${e.wellbeing}</small></td>
          <td>${e.sleepHours} ч</td>
          <td>${e.answered}/${e.signals}</td>
          <td class="${e.trustDelta > 0 ? 'good-t' : e.trustDelta < 0 ? 'bad-t' : ''}">${e.trustDelta > 0 ? '+' : ''}${e.trustDelta}</td></tr>`,
      )
      .join('');
    const m = this.showModal(
      'report',
      `<div class="kicker">Сдача смены · день ${r.day}</div>
      <h2>${r.score} <small>из 100</small></h2>
      <p class="lead">${esc(r.verdict)}</p>
      <table class="rep"><thead><tr><th>Слон</th><th>Самочувствие</th><th>Сон</th><th>Ответ на сигналы</th><th>Доверие</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="facts"><span>Слоновник чистый на ${r.barnClean}%</span><span>Выгул — ${r.paddockClean}%</span><span>Ответов на сигналы: ${r.responseRate}%</span><span>Лакомств: ${r.treats}</span></div>
      ${r.notes.length ? `<ul class="notes">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <button class="btn primary wide" data-next>${ICON.play}<span>Следующая смена</span></button>`,
    );
    m.querySelector('[data-next]')!.addEventListener('click', () => {
      this.closeModal();
      this.h.closeReport();
    });
  }

  get speed(): number {
    return this.lastSpeed;
  }
}

function plural(n: number, one: string, few: string, many: string): string {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

export type { Elephant };
