// Интерфейс: верхняя строка (время, смена, скорость), карточки стада, действия рядом (строка и
// панель Q), уведомления, осмотр слона, журнал смены с рационом, меню с настройками, итог смены.
// Мир остаётся главным — панели компактны.

import {
  bodyDirt,
  characterHints,
  clockText,
  describeCharacter,
  dietOf,
  heldLabel,
  minuteOfDay,
  pressingNeed,
  shiftDay,
  signalClarity,
  signalHabitText,
  slotInfo,
  temperature,
  TRAIT_KEYS,
  TRAIT_LABELS,
  tubKg,
  wellbeing,
  bond,
  comfortGap,
  keeperCatching,
  urinatingNearKeeper,
  invited,
  type ActionOption,
  type ActivityKind,
  type DayReport,
  type Elephant,
  type NeedKey,
  type SimEvent,
  type SlotId,
  type State,
} from '../sim';
import { CAPACITY } from '../data/facility';
import { KEEPER } from '../data/balance';
import { MEALS, VEG_LABEL, vegPlan, type VegKind } from '../data/rations';
import { BIND_LABEL, keyName, type BindAction } from '../input';
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
  toggleSound: () => boolean;
  soundMuted: () => boolean;
  volume: () => number;
  setVolume: (v: number) => void;
  toggleNames: () => boolean;
  namesOn: () => boolean;
  closeReport: () => void;
  zoom: (k: number) => void;
  overview: () => void;
  legacyCount: () => number;
  clearLegacy: () => void;
  binds: () => Record<BindAction, string[]>;
  rebind: (a: BindAction, done: () => void) => void;
  resetBinds: () => void;
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

// Пока слон только идёт к цели, подпись говорит о пути, а не о самом занятии.
const GOING: Partial<Record<ActivityKind, string>> = {
  eat: 'идёт к еде',
  drink: 'идёт к воде',
  urinate: 'идёт в туалет',
  sleep: 'идёт спать',
  rest: 'идёт отдохнуть',
  bathe: 'идёт к бассейну',
  dust: 'идёт к песку',
  play: 'идёт играть',
  shake: 'идёт к яблоне',
  manipulate: 'идёт к вещи',
};

function doingText(e: Elephant): string {
  if (e.lying) return e.act.kind === 'lie' ? 'лежит по просьбе' : 'спит лёжа';
  if (e.act.phase === 'go' && !/^(идёт|выходит|уносит)/.test(e.act.note)) return GOING[e.act.kind] ?? e.act.note;
  if (e.tipsy > 0.35) return `${e.act.note} (захмелела)`;
  return e.act.note;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

// Как она сейчас относится к тому, что ты рядом
function moodText(s: State, e: Elephant): string {
  const t = e.mem.tension;
  if (t > 0.6) return 'ей тесно — отойди и заговори спокойно';
  if (t > 0.25) return 'насторожена';
  if (invited(s, e)) return 'подпускает тебя';
  return 'спокойна';
}

// Личное место: на каком расстоянии от неё держаться без приглашения
function spaceText(gap: number): string {
  if (gap < 0.6) return 'подпускает вплотную';
  if (gap < 1.4) return 'держись в шаге-двух, пока сама не подпустит';
  return 'держись подальше и сначала заговори — подойдёшь, когда подпустит';
}

const CUE_LABELS: [keyof Elephant['learned']['cues'], string][] = [
  ['come', '«Иди сюда»'],
  ['stay', '«Стоять»'],
  ['move', '«Подвинься»'],
  ['back', '«En arrière» — назад'],
  ['go', '«Partez» — вперёд'],
  ['follow', '«Пошли»'],
  ['lie', '«Ложись»'],
  ['foot', '«Ногу»'],
  ['no', '«Нельзя»'],
];

// Что кипер узнал о ней сам, наблюдая: манеру просить, ночную привычку
function observed(e: Elephant): string[] {
  const seen = e.mem.seen;
  const out: string[] = [];
  out.push(seen.signal > 0 ? signalHabitText(e.profile) : 'Как она просится, пока не видно — понаблюдай, когда ей что-то нужно.');
  if (seen.wakePee >= 2) out.push('Проснувшись после пары часов сна, вскоре идёт в туалет — держи ведро наготове.');
  else if (seen.wakePee === 1) out.push('Однажды, проснувшись после долгого сна, вскоре пошла в туалет. Привычка или случай — посмотрим.');
  return out;
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
  private panelKey = '';
  private inspectId: string | null = null;
  private inspectKey = '';
  private journalOpen = false;
  private journalKey = '';
  private panelOpen = false;
  private modal: 'title' | 'menu' | 'report' | null = null;
  private lastSpeed = 1;
  private herdChoice = 3;
  private state: State | null = null;
  actions: ActionOption[] = [];
  bannerList: ActionOption[] = [];
  panelList: ActionOption[] = [];

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
          <button data-speed="0" title="Пауза" aria-label="Пауза">${ICON.pause}</button>
          <button data-speed="1" title="Обычная скорость">1×</button>
          <button data-speed="2" title="Быстрее">2×</button>
          <button data-speed="4" title="Ещё быстрее">4×</button>
        </div>
        <button class="btn icon" data-r="mapBtn" title="Обзор всей территории" aria-label="Обзор карты">${ICON.map}</button>
        <button class="btn" data-r="journalBtn" title="Журнал смены и рацион"><span class="ico">${ICON.journal}</span><span class="lbl">Журнал</span></button>
        <button class="btn icon" data-r="soundBtn" title="Звук" aria-label="Звук">${ICON.sound}</button>
        <button class="btn icon" data-r="menuBtn" title="Меню, сохранения и настройки" aria-label="Меню">${ICON.menu}</button>
      </header>
      <div class="toasts" data-r="toasts" aria-live="polite"></div>
      <aside class="herd" data-r="herd" aria-label="Стадо"></aside>
      <aside class="drawer" data-r="inspect" hidden></aside>
      <aside class="drawer right" data-r="journal" hidden></aside>
      <section class="panel" data-r="panel" hidden aria-label="Все действия рядом"></section>
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
          <button class="btn round small" data-r="tMore" aria-label="Все действия рядом">${ICON.dots}</button>
          <button class="btn round small" data-r="tDrop" aria-label="Положить вещь">${ICON.drop2}</button>
          <button class="btn round primary" data-r="tAct" aria-label="Главное действие">${ICON.hand}</button>
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
    this.refs.soundBtn.addEventListener('click', () => this.updateSound(this.h.toggleSound()));
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
      else if ((e.target as HTMLElement).closest('[data-more]')) this.togglePanel();
    });
    this.refs.panel.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (b) {
        this.h.action(b.dataset.action!);
        if (window.matchMedia('(max-width: 760px)').matches) this.togglePanel(false);
      } else if ((e.target as HTMLElement).closest('[data-close]')) this.togglePanel(false);
    });
    this.refs.tAct.addEventListener('click', () => {
      const first = this.actions.find((a) => a.enabled);
      if (first) this.h.action(first.id);
    });
    this.refs.tDrop.addEventListener('click', () => {
      const d = this.actions.find((a) => a.ref.verb === 'drop');
      if (d) this.h.action(d.id);
    });
    this.refs.tMore.addEventListener('click', () => this.togglePanel());
    this.updateSound(this.h.soundMuted());
  }

  get modalOpen(): boolean {
    return this.modal !== null;
  }

  get panelShown(): boolean {
    return this.panelOpen;
  }

  stickElements(): { base: HTMLElement; knob: HTMLElement } {
    return { base: this.refs.stick, knob: this.refs.knob };
  }

  updateSound(muted: boolean): void {
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
    this.state = s;
    this.actions = actions;
    const m = minuteOfDay(s.t);
    const night = m >= 21 * 60 || m < 5.5 * 60;
    this.refs.dayIcon.innerHTML = night ? ICON.moon : ICON.sun;
    // Слониха мочится рядом — время идёт как в жизни
    const live = urinatingNearKeeper(s);
    this.refs.clockText.textContent = `День ${shiftDay(s.t)} · ${clockText(s.t)}${live ? ' · как в жизни' : ''}`;
    this.refs.temp.textContent = `${Math.round(temperature(s.seed, s.t))}°`;
    const progress = ((s.t - s.dayStart) / 1440) * 100;
    this.refs.shift.style.width = `${Math.max(0, Math.min(100, progress)).toFixed(1)}%`;
    this.renderHeld(s);
    this.renderCards(s, selected);
    this.renderBanner(s, actions);
    if (this.panelOpen) this.renderPanel(s, actions);
    if (selected !== this.inspectId) {
      this.inspectId = selected;
      this.inspectKey = '';
      if (selected && this.journalOpen) {
        this.journalOpen = false;
        this.refs.journal.hidden = true;
      }
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
    const parts = [`<span class="ico">${ICON.hand}</span>${esc(heldLabel(k.held, s))}`];
    // Ведро под струёй — видно, что ловишь
    if (k.held?.kind === 'tank' && s.elephants.some((e) => e.act.kind === 'urinate' && e.act.phase === 'do' && keeperCatching(s, e))) parts.push('<b>ловишь струю</b>');
    if (b.pushed || b.load > 0 || b.cargo.length) parts.push(`тачка ${b.load}/${KEEPER.barrowMax}${b.cargo.length ? ` +${b.cargo.length}` : ''}`);
    parts.push(`лакомства ${k.pouch}`);
    const html = parts.join('<span class="dot">·</span>');
    if (this.refs.held.innerHTML !== html) this.refs.held.innerHTML = html;
  }

  private renderCards(s: State, selected: string | null): void {
    const key = s.elephants
      .map((e) => {
        const need = pressingNeed(e);
        return `${e.id}:${doingText(e)}:${e.signal?.kind ?? ''}:${need?.key ?? ''}:${Math.round(wellbeing(e) / 10)}:${selected === e.id}`;
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
        return `<button class="card ${selected === e.id ? 'sel' : ''} ${sig ? 'signal' : ''}" data-id="${e.id}" aria-label="${esc(e.profile.name)}: ${esc(doingText(e))}">
          <span class="mood ${mood}" style="--c:${e.profile.color}" title="Самочувствие ${Math.round(wb)}"></span>
          <span class="card-text"><b>${esc(e.profile.name)}</b><small>${esc(doingText(e))}</small></span>
          ${sig ? `<span class="sig ${clear ? '' : 'faint'}" title="${SIGNAL_TEXT[sig.kind]}">${SIGNAL_ICON[sig.kind]}</span>` : need && NEED_ICON[need.key] ? `<span class="need" title="${NEED_LABELS[need.key]}">${NEED_ICON[need.key]}</span>` : ''}
        </button>`;
      })
      .join('');
  }

  private keyFor(a: BindAction): string {
    const k = this.h.binds()[a][0];
    return k ? keyName(k) : '';
  }

  private renderBanner(s: State, actions: ActionOption[]): void {
    const task = s.keeper.task;
    const list = actions.filter((a) => a.ref.verb !== 'drop' || actions.length === 1);
    const drop = actions.find((a) => a.ref.verb === 'drop');
    const key = task ? `task:${task.label}:${Math.floor((task.elapsed / task.dur) * 10)}` : `${actions.map((a) => `${a.id}:${a.enabled}:${a.label}`).join('|')}:${this.keyFor('action')}`;
    if (key === this.bannerKey) return;
    this.bannerKey = key;
    const b = this.refs.banner;
    if (task) {
      b.className = 'banner busy';
      b.innerHTML = `<span class="spin"></span><span>${esc(task.label)}…</span>`;
      this.bannerList = [];
      return;
    }
    if (!list.length && !drop) {
      b.className = 'banner idle';
      b.innerHTML = `<span class="muted">Подойди к слону, станции или вещи</span>`;
      this.bannerList = [];
      return;
    }
    const main = list[0] ?? drop!;
    const rest = list.slice(1, 6);
    this.bannerList = [main, ...rest];
    const more = list.length + (drop && main !== drop ? 1 : 0) - this.bannerList.length;
    b.className = 'banner';
    b.innerHTML = `
      <button class="act main ${main.enabled ? '' : 'off'}" data-action="${main.id}" title="${esc(main.reason)}">
        <kbd>${esc(this.keyFor('action'))}</kbd><span>${esc(main.label)}</span>${main.enabled ? '' : `<small>${esc(main.reason)}</small>`}
      </button>
      ${rest
        .map((a, i) => `<button class="act ${a.enabled ? '' : 'off'}" data-action="${a.id}" title="${esc(a.reason)}"><kbd>${i + 2}</kbd><span>${esc(a.label)}</span></button>`)
        .join('')}
      ${drop && main !== drop ? `<button class="act ghost" data-action="${drop.id}"><kbd>${esc(this.keyFor('drop'))}</kbd><span>${esc(drop.label)}</span></button>` : ''}
      ${more > 0 ? `<button class="act ghost more" data-more><kbd>${esc(this.keyFor('panel'))}</kbd><span>все действия (${list.length + (drop ? 1 : 0)})</span></button>` : ''}`;
  }

  // Действия по клавишам: главное, 2…6 — остальные в строке; в открытой панели — по номерам панели
  actionForKey(index: number): ActionOption | undefined {
    if (this.panelOpen) return this.panelList[index];
    return this.bannerList[index];
  }

  // -------------------------------------------------------------------------
  // Панель «все действия рядом» (Q)
  // -------------------------------------------------------------------------

  togglePanel(force?: boolean): void {
    this.panelOpen = force ?? !this.panelOpen;
    this.refs.panel.hidden = !this.panelOpen;
    this.panelKey = '';
    if (this.panelOpen && this.state) this.renderPanel(this.state, this.actions);
  }

  private renderPanel(s: State, actions: ActionOption[]): void {
    const key = `${actions.map((a) => `${a.id}:${a.enabled}:${a.label}:${a.reason}`).join('|')}:${s.keeper.task ? 1 : 0}`;
    if (key === this.panelKey) return;
    this.panelKey = key;
    // Группы по цели: ближние — выше; внутри группы — по важности
    const groups = new Map<string, ActionOption[]>();
    for (const a of actions) {
      const g = a.group || 'Рядом';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(a);
    }
    const ordered = [...groups.entries()].sort((a, b) => Math.min(...a[1].map((x) => x.dist)) - Math.min(...b[1].map((x) => x.dist)) || Math.max(...b[1].map((x) => x.priority)) - Math.max(...a[1].map((x) => x.priority)));
    this.panelList = [];
    let n = 0;
    const html = ordered
      .map(([g, list]) => {
        const rows = list
          .sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.priority - a.priority)
          .map((a) => {
            this.panelList.push(a);
            n++;
            const num = n <= 9 ? `<kbd>${n}</kbd>` : '<kbd class="blank"></kbd>';
            return `<button class="prow ${a.enabled ? '' : 'off'}" data-action="${a.id}">${num}<span>${esc(a.label)}${a.enabled ? '' : `<small>${esc(a.reason)}</small>`}</span>${a.timed ? `<i class="timed" title="займёт время">${ICON.clock}</i>` : ''}</button>`;
          })
          .join('');
        const d = Math.min(...list.map((x) => x.dist));
        return `<div class="pgroup"><h4>${esc(g)}<small>${d > 0.2 ? `${d.toFixed(1)} м` : ''}</small></h4>${rows}</div>`;
      })
      .join('');
    this.refs.panel.innerHTML = `
      <div class="panel-head"><h3>Что можно сделать здесь</h3><button class="btn icon small" data-close aria-label="Закрыть">${ICON.close}</button></div>
      <div class="panel-body">${html || '<p class="muted">Рядом ничего нет — подойди к слонихе, станции или вещи.</p>'}</div>
      <p class="panel-hint">Действия зависят от того, что в руках, где ты стоишь, кто рядом и в каком они настроении. Цифры — быстрый выбор.</p>`;
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
    const b = e.body;
    const L = e.learned;
    const gap = comfortGap(s, e);
    const mood = moodText(s, e);
    const seen = e.mem.seen;
    const key = `${e.id}:${seen.signal > 0 ? 1 : 0}:${Math.min(2, seen.wakePee)}:${Object.values(n).map((v) => Math.round(v / 4)).join(',')}:${doingText(e)}:${e.signal?.kind}:${Math.round(L.trust * 100)}:${Math.round(L.cooperation * 100)}:${Math.round(L.expectation * 100)}:${Math.round(L.toilet * 100)}:${Math.round(L.familiarity * 100)}:${Object.values(L.cues).map((v) => Math.round(v * 20)).join(',')}:${Math.round(gap * 5)}:${mood}:${[b.back, b.side, b.legs, b.head, b.hay, b.soap, e.wet].map((v) => Math.round(v * 10)).join(',')}`;
    if (key === this.inspectKey) return;
    const first = this.inspectKey === '' || !box.querySelector(`[data-eid="${e.id}"]`);
    this.inspectKey = key;
    const p = e.profile;
    const needs: NeedKey[] = ['hunger', 'thirst', 'bladder', 'bowel', 'fatigue', 'boredom', 'social', 'heat', 'stress'];
    const friends = s.elephants
      .filter((o) => o !== e)
      .map((o) => ({ o, b: bond(s, e.id, o.id) }))
      .sort((a, c) => c.b - a.b);
    const rel = friends
      .map(({ o, b: bd }) => `<li><span class="dotc" style="--c:${o.profile.color}"></span>${esc(o.profile.name)} <span class="muted">${bd > 0.4 ? 'подруга' : bd > 0.1 ? 'ладят' : bd > -0.15 ? 'нейтрально' : 'не ладят'}</span></li>`)
      .join('');
    const diet = dietOf(p);
    const skinNote = bodyDirt(e) > 0.45 ? 'грязная — помой' : bodyDirt(e) > 0.2 ? 'немного запачкана' : 'чистая';
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
      <div class="now">${e.signal ? `<span class="sig">${SIGNAL_ICON[e.signal.kind]}</span>` : ''}<b>Сейчас:</b> ${esc(doingText(e))}${e.signal ? ` · <span class="warn-t">${SIGNAL_TEXT[e.signal.kind]}</span>` : ''}</div>
      <div class="grid">
        ${needs.map((k) => `<div class="row"><span>${NEED_LABELS[k]}</span>${bar(n[k], k === 'social' ? 60 : 70)}</div>`).join('')}
      </div>
      <h3>Кожа <small class="muted">${esc(skinNote)}${e.wet > 0.3 ? ' · мокрая' : ''}</small></h3>
      <div class="grid">
        <div class="row"><span>Спина</span>${bar(b.back * 100, 30)}</div>
        <div class="row"><span>Бока</span>${bar(b.side * 100, 30)}</div>
        <div class="row"><span>Ноги</span>${bar(b.legs * 100, 40)}</div>
        <div class="row"><span>Сено на спине</span>${bar(b.hay * 100, 50)}</div>
        ${b.soap > 0.05 ? `<div class="row"><span>Пена (смыть!)</span>${bar(b.soap * 100, 10)}</div>` : ''}
      </div>
      <h3>Отношения с тобой <small class="muted">${esc(mood)}</small></h3>
      <div class="grid">
        <div class="row"><span>Доверие</span>${bar(L.trust * 100, 0, true)}</div>
        <div class="row"><span>Ты для неё «свой»</span>${bar(L.familiarity * 100, 0, true)}</div>
        <div class="row"><span>Покладистость</span>${bar(L.cooperation * 100, 0, true)}</div>
        <div class="row"><span>Ждёт ответа на сигналы</span>${bar(L.expectation * 100, 0, true)}</div>
        <div class="row"><span>Приучена к ведру</span>${bar(L.toilet * 100, 0, true)}</div>
      </div>
      <p class="muted small-p">Личное место: ${esc(spaceText(gap))}.</p>
      <details data-d="cues"><summary>Как знает просьбы</summary><div class="grid">${CUE_LABELS.map(([c, label]) => `<div class="row"><span>${label}</span>${bar(L.cues[c] * 100, 0, true)}</div>`).join('')}</div></details>
      <h3>Наблюдения</h3>
      <ul class="hints">${observed(e).map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      <h3>Характер</h3>
      <ul class="hints">${characterHints(p).map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      <h3>Рацион</h3>
      <p class="small-p">Сено ${diet.hayKg} кг в сутки, ветки ${diet.branchesKg} кг. Каша в 13:00 и 17:00 — ${esc(diet.porridge.product)}, ${String(diet.porridge.kg).replace('.', ',')} кг (запарить за час). Овощи в 19:00 — свой таз. <span class="muted">Рацион из SlonVet — тот же, что у слонихи ${esc(diet.source)}.</span></p>
      <details data-d="traits"><summary>Черты подробно</summary><div class="grid traits">${TRAIT_KEYS.map((k) => `<div class="row"><span>${TRAIT_LABELS[k]}</span><span class="bar neutral"><i style="width:${(p.traits[k] * 100).toFixed(0)}%"></i></span></div>`).join('')}</div></details>
      ${rel ? `<h3>В стаде</h3><ul class="rel">${rel}</ul>` : ''}
      <div class="ins-actions"><button class="btn" data-focus>${ICON.target}<span>Показать на карте</span></button></div>`;
    const open = [...box.querySelectorAll<HTMLDetailsElement>('details[data-d]')].filter((d) => d.open).map((d) => d.dataset.d);
    box.innerHTML = body;
    for (const d of box.querySelectorAll<HTMLDetailsElement>('details[data-d]')) if (open.includes(d.dataset.d)) d.open = true;
    const holder = box.querySelector<HTMLElement>('[data-r2="portrait"]')!;
    holder.appendChild(portrait(p));
    box.querySelector('[data-close]')!.addEventListener('click', () => this.h.select(null));
    box.querySelector('[data-focus]')!.addEventListener('click', () => this.h.focus(e.x, e.y));
    if (first) box.scrollTop = 0;
  }

  // -------------------------------------------------------------------------
  // Журнал смены: распорядок, рацион по SlonVet, что требует внимания, события
  // -------------------------------------------------------------------------

  openJournal(): void {
    if (!this.journalOpen) this.toggleJournal();
  }

  toggleJournal(): void {
    this.journalOpen = !this.journalOpen;
    this.refs.journal.hidden = !this.journalOpen;
    this.journalKey = '';
    // Журнал и осмотр занимают одно место — открыт только один
    if (this.journalOpen && this.inspectId) this.h.select(null);
  }

  private renderJournal(s: State): void {
    const key = `${s.journal.length}:${s.journal[s.journal.length - 1]?.id}:${s.alerts.length}:${Math.floor(s.t / 5)}`;
    if (key === this.journalKey) return;
    this.journalKey = key;
    const m = minuteOfDay(s.t);
    const routine = [
      { from: 8 * 60, to: 10 * 60, text: 'Утро: поздоровайся со слонами, поилки, сено на выгул, ворота на выгул (у северной стены зала)' },
      { from: 10 * 60, to: 12 * 60, text: 'Слоны снаружи — закрой ворота, убери зал: лопата, тачка, солома' },
      { from: 12 * 60, to: 13 * 60, text: 'Запарь кашу к 13:00 — за час (кормокухня)' },
      { from: 13 * 60, to: 16 * 60, text: 'Каша, мытьё поилок, ветки и бамбук, душ в жару' },
      { from: 16 * 60, to: 17 * 60 + 30, text: 'Каша к 17:00 — снова запарить за час' },
      { from: 17 * 60 + 30, to: 19 * 60 + 30, text: 'Овощи к 19:00: нарезать по тазу на каждую, сено на ночь' },
      { from: 19 * 60 + 30, to: 24 * 60, text: 'Слоны в слоновнике: собери тазы, убери выгул' },
      { from: 0, to: 8 * 60, text: 'Ночь: спят по паре часов; проснулась — стоит сонная, потом обычно в туалет. Ведро — в инвентарной, вылить — в сток' },
    ];
    const day = shiftDay(s.t);
    const plan = vegPlan(s.seed, day);
    const planKg = Object.values(plan).reduce((a, b) => a + (b ?? 0), 0);
    const planText = (Object.entries(plan) as [VegKind, number][]).map(([v, kg]) => `${VEG_LABEL[v].toLowerCase()} ${kg}`).join(', ');
    const ration = s.elephants
      .map((e) => {
        const d = dietOf(e.profile);
        const porridge = s.world.checks.porridge[e.id] ?? [];
        const tub = s.world.tubs.find((t) => t.owner === e.id);
        const vegKg = Math.max(s.world.checks.vegTub[e.id] ?? 0, tub && tub.where !== 'floor' ? tubKg(tub) : 0);
        const tick = (ok: boolean) => (ok ? '<span class="good-t">✓</span>' : '<span class="muted">○</span>');
        return `<li><b>${esc(e.profile.name)}</b> <span class="muted">· рацион SlonVet, как у ${esc(d.source)}</span>
          <div class="ration">
            <span>${tick(porridge.length >= 1)} 13:00 каша: ${esc(d.porridge.product)} ${String(d.porridge.kg).replace('.', ',')} кг</span>
            <span>${tick(porridge.length >= 2)} 17:00 каша</span>
            <span>${tick(vegKg >= planKg - 1)} 19:00 овощи: ${Math.round(vegKg)}/${planKg} кг</span>
            <span class="muted">Сено ${d.hayKg} кг/сут · ветки ${d.branchesKg} кг · 07:00 зерносмесь: ${d.grain.map((g) => `${g.name.toLowerCase()} ${String(g.qty).replace('.', ',')} ${g.unit}`).join(', ')}</span>
          </div></li>`;
      })
      .join('');
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
      <h3>Рацион на сегодня</h3>
      <p class="muted small-p">${MEALS.map((x) => `${clockText(x.time)} ${x.title.toLowerCase()}`).join(' · ')}. Таз овощей: ${esc(planText)} кг. Данные — SlonVet.</p>
      <ul class="rations">${ration}</ul>
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
      if (ev.kind === 'openJournal') this.openJournal();
      if (!ev.text) continue;
      if (ev.severity === 'info' && !['refuse', 'report', 'welcome', 'tank', 'lie', 'prepDone', 'tipsy', 'wake'].includes(ev.kind)) continue;
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
  // Окна: заставка, меню с настройками, итог смены
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

  private helpHtml(): string {
    const k = (a: BindAction) => `<kbd>${esc(this.keyFor(a))}</kbd>`;
    return `<div class="help">
        <div>${k('up')}${k('left')}${k('down')}${k('right')} / стрелки — идти, ${k('run')} — бежать (пугает нервных)</div>
        <div>${k('action')} — главное действие, <kbd>2</kbd>…<kbd>6</kbd> — другие, ${k('panel')} — все действия рядом, ${k('drop')} — положить</div>
        <div>Рядом со слонихой — голосом: окликнуть по имени, «иди сюда», «подвинься», «стоять», «пошли», «ложись», «давай», «молодец». Подходи так, чтобы видела; спящую сначала окликни</div>
        <div>Клик по слону — осмотр · ${k('journal')} — журнал и рацион · ${k('speed')} — скорость · ${k('overview')} — карта</div>
        <div class="muted">На телефоне: стик, кнопка руки — главное действие, «⋯» — все действия.</div>
      </div>`;
  }

  openTitle(hasContinue: string | null): void {
    const legacy = this.h.legacyCount();
    const m = this.showModal(
      'title',
      `<div class="title-mark">${ICON.logo}</div>
      <h1>Elephant Keeper</h1>
      <p class="lead">Смена смотрителя в небольшом слоновнике полного контакта: ты работаешь рядом со слонами, в одном зале с ними. Слоны живут своей жизнью: едят, пьют, играют, спят — и зовут тебя, когда без тебя не обойтись. У каждой свой характер, своё личное место и свои отношения с тобой — доверие, привычка, память о том, отвечаешь ли ты.</p>
      ${hasContinue ? `<button class="btn primary wide" data-go="continue">${ICON.play}<span>Продолжить смену</span><small>${esc(hasContinue)}</small></button>` : ''}
      <div class="newgame">
        <span>Новое стадо:</span>
        <div class="seg" data-herd>${Array.from({ length: CAPACITY }, (_, i) => `<button data-n="${i + 1}" class="${i + 1 === this.herdChoice ? 'on' : ''}">${i + 1}</button>`).join('')}</div>
        <button class="btn ${hasContinue ? '' : 'primary'}" data-go="new">Начать</button>
      </div>
      ${this.helpHtml()}
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
    const binds = this.h.binds();
    const order: BindAction[] = ['action', 'panel', 'drop', 'up', 'down', 'left', 'right', 'run', 'inspect', 'journal', 'pause', 'speed', 'overview', 'recenter', 'zoomIn', 'zoomOut', 'names', 'mute'];
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
      <p class="muted small-p">Смена сохраняется автоматически раз в минуту и при сворачивании.</p>
      <h3>Настройки</h3>
      <div class="row-btns"><button class="btn small" data-names>${this.h.namesOn() ? 'Имена над слонами: вкл' : 'Имена над слонами: выкл'}</button><button class="btn small" data-sound>${this.h.soundMuted() ? 'Звук: выкл' : 'Звук: вкл'}</button></div>
      <label class="vol">Громкость <input type="range" min="5" max="100" step="5" value="${Math.round(this.h.volume() * 100)}" data-vol></label>
      <h3>Управление</h3>
      <div class="touch-help small-p">
        <div><b>Стик</b> — идти; если тянуть за край — бежать (нервных это пугает).</div>
        <div><b>Рука</b> — главное действие, <b>⋯</b> — все действия рядом, <b>стрелка вниз</b> — положить вещь.</div>
        <div><b>Касание слона</b> или карточки — осмотр. <b>Два пальца</b> — приблизить или отдалить.</div>
        <div>Вверху — время, скорость, журнал и это меню. <b>Нарезка овощей</b>: левая половина экрана — взять и бросить, правая — нож.</div>
      </div>
      <div class="key-help">
        <p class="muted small-p">Действия зависят от того, что в руках, у чего стоишь и в каком состоянии слоны. ${esc(this.keyFor('panel'))} — список всего, что можно сделать рядом. Нажми «Изменить», затем нужную клавишу (Esc — отмена).</p>
        <ul class="binds">${order
          .map((a) => `<li><span>${esc(BIND_LABEL[a])}</span><span class="keys">${binds[a].map((c) => `<kbd>${esc(keyName(c))}</kbd>`).join(' ') || '<span class="muted">—</span>'}</span><button class="btn small" data-bind="${a}">Изменить</button></li>`)
          .join('')}</ul>
        <div class="row-btns"><button class="btn small" data-reset-binds>Сбросить клавиши</button></div>
      </div>
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
    m.querySelector('[data-names]')!.addEventListener('click', (e) => {
      (e.target as HTMLElement).textContent = this.h.toggleNames() ? 'Имена над слонами: вкл' : 'Имена над слонами: выкл';
    });
    m.querySelector('[data-sound]')!.addEventListener('click', (e) => {
      const muted = this.h.toggleSound();
      this.updateSound(muted);
      (e.target as HTMLElement).textContent = muted ? 'Звук: выкл' : 'Звук: вкл';
    });
    m.querySelector<HTMLInputElement>('[data-vol]')!.addEventListener('input', (e) => this.h.setVolume(Number((e.target as HTMLInputElement).value) / 100));
    m.querySelectorAll<HTMLElement>('[data-bind]').forEach((b) =>
      b.addEventListener('click', () => {
        b.textContent = 'Нажми клавишу…';
        this.h.rebind(b.dataset.bind as BindAction, () => {
          this.closeModal();
          this.modal = null;
          this.openMenu();
        });
      }),
    );
    m.querySelector('[data-reset-binds]')!.addEventListener('click', () => {
      this.h.resetBinds();
      this.closeModal();
      this.modal = null;
      this.openMenu();
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
      <div class="facts"><span>Стойла чистые на ${r.barnClean}%</span><span>Выгул — ${r.paddockClean}%</span><span>Ответов на сигналы: ${r.responseRate}%</span><span>Лакомств: ${r.treats}</span></div>
      ${r.notes.length ? `<h3>Замечания сменщика</h3><ul class="notes">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
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
