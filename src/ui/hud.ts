// Интерфейс: верхняя строка (время, смена, скорость), карточки стада, подсказка «цель · главное
// действие» и панель всех действий рядом (Q), уведомления, осмотр слона, журнал смены с рационом,
// меню с настройками, итог смены. Мир остаётся главным — панели компактны.
//
// Подсказка одна и стоит на одном месте: на клавиатуре — внизу по центру, на телефоне — над
// кнопкой-рукой (под пальцем её не видно). Её разметка создаётся один раз и дальше только
// обновляется: кнопка не исчезает из-под пальца между касанием и отпусканием.

import { BARROWS_PER_BUNKER, type Bunker } from '../station/bunker';
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
  catHabitText,
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
  type InteractionTarget,
  type NeedKey,
  type SimEvent,
  type SlotId,
  type State,
} from '../sim';
import { CAPACITY } from '../data/facility';
import { KEEPER } from '../data/balance';
import { MEALS, VEG_LABEL, vegPlan, type VegKind } from '../data/rations';
import { BIND_LABEL, keyName, type BindAction } from '../input';
import type { FocusView } from './focus';
import { ICON } from './icons';
import { portrait } from './portrait';
import { INTERNSHIP_STAGES } from '../station/scenarios';
import { readSummary } from '../station/link';

export interface HudHandlers {
  action: (id: string) => void;
  peek: () => string | null; // что главное действие сделало бы прямо сейчас (id действия)
  primary: (armed?: string | null) => void; // главное действие; armed — запомненное кнопкой при касании
  nextTarget: () => void; // следующая цель
  select: (id: string | null) => void;
  focus: (x: number, y: number) => void;
  speed: (v: number) => void;
  pauseToggle: () => void;
  setPaused: (p: boolean) => void;
  newGame: (herd: number, seed: number | null) => void;
  continueGame: () => boolean;
  startScenario: (id: string) => void;
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
  const cat = catHabitText(e);
  if (cat) out.push(cat);
  return out;
}

function bar(value: number, warn = 70, invert = false): string {
  const v = Math.max(0, Math.min(100, value));
  const level = invert ? (v < 30 ? 'bad' : v < 55 ? 'warn' : 'ok') : v >= warn + 15 ? 'bad' : v >= warn ? 'warn' : 'ok';
  return `<span class="bar ${level}"><i style="width:${v.toFixed(0)}%"></i></span>`;
}

export class Hud {
  /** Уличный бункер станции (station/bunker.ts): сколько тачек в текущей партии. */
  private bunker: Bunker = { loads: 0, fills: 0 };

  setBunker(b: Bunker): void {
    this.bunker = { ...b };
  }

  private refs: Record<string, HTMLElement> = {};
  private toasts: { el: HTMLElement; until: number }[] = [];
  private cardsKey = '';
  private heldHtml = '';
  private promptKey = '__init__';
  private promptSeq = -1;
  private everFocused = false; // пока игрок ни разу не подошёл к цели, показываем, с чего начать
  private panelBuilt: { x: number; y: number; at: number } | null = null; // где и когда собран открытый список
  private panelDirty = false; // из списка выбрали действие — после него собрать заново
  private panelRows = new Map<string, { row: HTMLElement; label: HTMLElement; reason: HTMLElement }>();
  private panelDist = new Map<string, HTMLElement>();
  private panelDown = false; // палец или кнопка мыши на панели — строки не переставляем
  private inspectId: string | null = null;
  private inspectKey = '';
  private journalOpen = false;
  private journalKey = '';
  private panelOpen = false;
  private modal: 'title' | 'menu' | 'report' | null = null;
  private lastSpeed = 1;
  private herdChoice = 3;
  private state: State | null = null;
  private insetsAt = -1e9;
  private insetsCache = { top: 0, bottom: 0 };
  private targets: InteractionTarget[] = [];
  private focus: FocusView = { target: null, main: null, more: 0, others: 0, pinned: false, seq: 0 };
  actions: ActionOption[] = [];
  panelList: ActionOption[] = [];

  constructor(root: HTMLElement, private h: HudHandlers) {
    root.innerHTML = `
      <header class="top" data-r="top">
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
        <div class="prompt none" data-r="prompt">
          <button class="p-target" data-r="pTarget" title="Следующая цель" aria-label="Следующая цель">
            <span class="p-name" data-r="pName"></span>
            <span class="p-next" data-r="pNext">${ICON.swap}<kbd data-r="pNextKey"></kbd></span>
          </button>
          <button class="p-main" data-r="pMain">
            <kbd data-r="pKey"></kbd>
            <span class="p-text"><span class="p-label" data-r="pLabel"></span><small class="p-reason" data-r="pReason"></small></span>
          </button>
          <button class="p-more" data-r="pMore" title="Все действия рядом" aria-label="Все действия рядом"><kbd data-r="pMoreKey"></kbd><span data-r="pMoreText"></span></button>
          <div class="p-busy"><span class="spin"></span><span data-r="pBusyText"></span></div>
          <div class="p-idle muted">Подойди к слонихе, станции или вещи</div>
        </div>
        <div class="zoom">
          <button class="btn icon small" data-r="zoomIn" aria-label="Приблизить">${ICON.plus}</button>
          <button class="btn icon small" data-r="zoomOut" aria-label="Отдалить">${ICON.minus}</button>
        </div>
      </footer>
      <div class="touch" data-r="touch">
        <div class="stick" data-r="stick"><div class="knob" data-r="knob"></div></div>
        <div class="touch-btns" data-r="touchBtns">
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
    // Подсказка и кнопка-рука делают одно и то же: то, что написано в подсказке. Что именно —
    // запоминается в момент касания: пока палец на кнопке, подсказка может смениться, а выполнено
    // должно быть то, на что нажимали. Без касания (Enter на кнопке) — то, что показано сейчас
    for (const b of [this.refs.pMain, this.refs.tAct]) {
      let armed: { id: string | null; at: number } | null = null;
      b.addEventListener('pointerdown', () => (armed = { id: this.h.peek(), at: performance.now() }));
      b.addEventListener('click', () => {
        const a = armed && performance.now() - armed.at < 1500 ? armed : null;
        armed = null;
        if (a) this.h.primary(a.id);
        else this.h.primary();
      });
    }
    this.refs.pTarget.addEventListener('click', () => this.h.nextTarget());
    this.refs.pMore.addEventListener('click', () => this.togglePanel());
    this.refs.panel.addEventListener('click', (e) => {
      this.panelDown = false;
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (b) {
        if (b.classList.contains('gone')) return;
        this.panelDirty = true;
        this.h.action(b.dataset.action!);
        if (window.matchMedia('(max-width: 760px)').matches) this.togglePanel(false);
      } else if ((e.target as HTMLElement).closest('[data-close]')) this.togglePanel(false);
    });
    // Пока палец на панели, строки не переставляем: нажатие должно попасть в то, на что смотрели
    this.refs.panel.addEventListener('pointerdown', () => (this.panelDown = true));
    for (const type of ['pointerup', 'pointercancel'] as const) window.addEventListener(type, () => this.panelDown && setTimeout(() => (this.panelDown = false), 120));
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

  // Сколько экрана сверху и снизу занято интерфейсом над средней колонкой — там, где стоит кипер.
  // Камера держит его в свободной части: на телефоне в портрете подсказка и кнопки занимают
  // нижнюю треть, и у южной стены кипер иначе оказался бы под ними. Под подсказку место
  // считается всегда, даже когда её нет, — чтобы камера не качалась при каждом её появлении
  insets(): { top: number; bottom: number } {
    const now = performance.now();
    if (now - this.insetsAt < 300) return this.insetsCache;
    this.insetsAt = now;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x0 = vw * 0.42;
    const x1 = vw * 0.58;
    const over = (el: HTMLElement): DOMRect | null => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > x0 && r.left < x1 ? r : null;
    };
    let top = 0;
    let bottom = 0;
    for (const el of [this.refs.top, this.refs.herd, this.refs.held]) {
      const r = over(el);
      if (r) top = Math.max(top, r.bottom);
    }
    const touch = document.documentElement.dataset.input === 'touch';
    for (const el of [this.refs.stick, this.refs.touchBtns, this.refs.prompt]) {
      const r = over(el);
      if (!r) continue;
      const edge = el === this.refs.prompt && touch ? r.bottom - Math.max(r.height, 104) : r.top;
      bottom = Math.max(bottom, vh - edge);
    }
    // Свободной должна остаться хотя бы треть высоты — иначе не сдвигаем вовсе
    if (vh - top - bottom < vh / 3) top = bottom = 0;
    return (this.insetsCache = { top, bottom });
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

  render(s: State, actions: ActionOption[], targets: InteractionTarget[], focus: FocusView, selected: string | null): void {
    this.state = s;
    this.actions = actions;
    this.targets = targets;
    this.focus = focus;
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
    this.renderPrompt(s, focus);
    if (this.panelOpen) this.renderPanel();
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
    // Положить вещь — своя клавиша и своя кнопка: показываем её рядом с тем, что в руках
    const drop = this.actions.find((a) => a.ref.verb === 'drop');
    const parts = [`<span class="ico">${ICON.hand}</span>${esc(heldLabel(k.held, s))}${drop ? `<span class="keyhint"><kbd>${esc(this.keyFor('drop'))}</kbd>положить</span>` : ''}`];
    // Ведро под струёй — видно, что ловишь
    if (k.held?.kind === 'tank' && s.elephants.some((e) => e.act.kind === 'urinate' && e.act.phase === 'do' && keeperCatching(s, e))) parts.push('<b>ловишь струю</b>');
    if (b.pushed || b.load > 0 || b.cargo.length) parts.push(`тачка ${b.load}/${KEEPER.barrowMax}${b.cargo.length ? ` +${b.cargo.length}` : ''}`);
    parts.push(`лакомства ${k.pouch}`);
    parts.push(`<span title="Уличный бункер станции: каждая тачка в контейнер — треть, три — партия для Био-лаборатории">бункер ${this.bunker.loads}/${BARROWS_PER_BUNKER}</span>`);
    const html = parts.join('<span class="dot">·</span>');
    if (html !== this.heldHtml) {
      this.heldHtml = html;
      this.refs.held.innerHTML = html;
    }
    this.refs.tDrop.hidden = !drop;
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

  // Подсказка: «цель · главное действие». Разметка постоянная, меняется только текст —
  // поэтому она не прыгает и не исчезает из-под пальца
  private renderPrompt(s: State, f: FocusView): void {
    const p = this.refs.prompt;
    const task = s.keeper.task;
    const t = f.target;
    const main = f.main;
    if (t && main) this.everFocused = true;
    const mode = task ? 'busy' : t && main ? 'focus' : this.everFocused || s.keeper.prep ? 'none' : 'idle';
    const key =
      mode === 'busy'
        ? `busy|${task!.label}`
        : mode === 'focus'
          ? [t!.key, t!.label, main!.id, main!.label, main!.enabled, main!.reason, f.more, f.others, f.pinned, this.keyFor('action'), this.keyFor('target'), this.keyFor('panel')].join('|')
          : mode;
    this.refs.tAct.classList.toggle('idle', mode !== 'focus');
    if (key !== this.promptKey) {
      this.promptKey = key;
      p.className = `prompt ${mode}${mode === 'focus' && f.pinned ? ' pinned' : ''}${mode === 'focus' && !main!.enabled ? ' off' : ''}`;
      if (mode === 'busy') this.refs.pBusyText.textContent = `${task!.label}…`;
      if (mode === 'focus') {
        this.refs.pName.textContent = t!.label;
        this.refs.pNext.hidden = f.others <= 0;
        this.refs.pNextKey.textContent = this.keyFor('target');
        this.refs.pTarget.title = f.others > 0 ? `Следующая цель (рядом ещё ${f.others})` : t!.label;
        this.refs.pKey.textContent = this.keyFor('action');
        this.refs.pLabel.textContent = promptLabel(main!.label, t!.label);
        this.refs.pReason.textContent = main!.enabled ? '' : main!.reason;
        this.refs.pMain.title = main!.enabled ? main!.label : `${main!.label} — ${main!.reason}`;
        this.refs.pMain.setAttribute('aria-label', `${t!.label}: ${main!.label}${main!.enabled ? '' : `. ${main!.reason}`}`);
        this.refs.pMain.setAttribute('aria-disabled', String(!main!.enabled));
        this.refs.pMoreKey.textContent = this.keyFor('panel');
        this.refs.pMoreText.textContent = f.more > 0 ? `ещё ${f.more}` : 'все';
        this.refs.pMore.hidden = f.more <= 0 && f.others <= 0;
      }
    }
    // Цель сменилась — подсказка коротко «появляется», чтобы смену было видно
    if (mode === 'focus' && f.seq !== this.promptSeq) {
      this.promptSeq = f.seq;
      p.classList.remove('pop');
      void p.offsetWidth;
      p.classList.add('pop');
    }
  }

  // Нажатие не сработало, потому что подсказка только что сменилась: коротко привлечь к ней взгляд
  nudge(): void {
    const p = this.refs.prompt;
    p.classList.remove('pop');
    void p.offsetWidth;
    p.classList.add('pop');
  }

  // Быстрый выбор по цифрам — только в открытой панели: там видно, какая цифра что значит
  actionForKey(index: number): ActionOption | undefined {
    if (!this.panelOpen) return undefined;
    const o = this.panelList[index];
    if (!o || this.panelRows.get(o.id)?.row.classList.contains('gone')) return undefined;
    this.panelDirty = true;
    return o;
  }

  // -------------------------------------------------------------------------
  // Панель «все действия рядом» (Q)
  // -------------------------------------------------------------------------

  togglePanel(force?: boolean): void {
    this.panelOpen = force ?? !this.panelOpen;
    this.refs.panel.hidden = !this.panelOpen;
    this.panelBuilt = null;
    this.panelDown = false;
    if (this.panelOpen) this.renderPanel();
  }

  private panelRow(o: ActionOption, n: number): string {
    const num = n <= 9 ? `<kbd>${n}</kbd>` : '<kbd class="blank"></kbd>';
    return `<button class="prow" data-action="${esc(o.id)}">${num}<span><b data-l></b><small data-why></small></span>${o.timed ? `<i class="timed" title="займёт время">${ICON.clock}</i>` : ''}</button>`;
  }

  private panelRegister(root: HTMLElement): void {
    for (const row of root.querySelectorAll<HTMLElement>('.prow')) {
      if (!this.panelRows.has(row.dataset.action!)) this.panelRows.set(row.dataset.action!, { row, label: row.querySelector<HTMLElement>('[data-l]')!, reason: row.querySelector<HTMLElement>('[data-why]')! });
    }
  }

  // Список всего, что можно сделать рядом, по целям. Это меню, а не лента: пока оно открыто и
  // кипер стоит, строки не двигаются — их читают и в них целятся пальцем. Строки стоят в
  // постоянном порядке (уход, затем просьбы — как они собраны); что стало недоступным, сереет
  // на своём месте; что появилось, дописывается в конец. Заново список собирается, когда его
  // открывают, когда кипер отошёл и после выбранного из него действия
  private renderPanel(): void {
    const s = this.state;
    if (!s) return;
    // Пока идёт работа, список не трогаем
    if (s.keeper.task && this.panelBuilt) return;
    const f = this.focus;
    const k = s.keeper;
    const now = performance.now();
    const drop = this.actions.find((a) => a.ref.verb === 'drop');
    const groups = this.targets.map((t) => ({ key: t.key, label: t.label, gap: t.gap, options: t.options.slice().sort((x, y) => x.order - y.order) }));
    if (drop) groups.push({ key: 'hands', label: drop.group || 'В руках', gap: 0, options: [drop] });
    const built = this.panelBuilt;
    const stale = !built || this.panelDirty || (Math.hypot(k.x - built.x, k.y - built.y) > 0.5 && now - built.at > 300);
    if (stale && !this.panelDown) {
      this.panelBuilt = { x: k.x, y: k.y, at: now };
      this.panelDirty = false;
      // Цель — первой; остальные — как их расставила симуляция: ближе к намерению — выше
      const fk = f.target?.key;
      const ordered = [...groups.filter((g) => g.key === fk), ...groups.filter((g) => g.key !== fk)];
      this.panelList = [];
      const html = ordered
        .map((g) => {
          const rows = g.options
            .map((o) => {
              this.panelList.push(o);
              return this.panelRow(o, this.panelList.length);
            })
            .join('');
          return `<div class="pgroup${g.key === fk ? ' focus' : ''}" data-g="${esc(g.key)}"><h4><span>${esc(g.label)}${g.key === fk ? '<em>цель</em>' : ''}</span><small data-d></small></h4>${rows}</div>`;
        })
        .join('');
      this.refs.panel.innerHTML = `
        <div class="panel-head"><h3>Что можно сделать здесь</h3><button class="btn icon small" data-close aria-label="Закрыть">${ICON.close}</button></div>
        <div class="panel-body">${html || '<p class="muted" data-empty>Рядом ничего нет — подойди к слонихе, станции или вещи.</p>'}</div>
        <p class="panel-hint">Действия зависят от того, что в руках, где ты стоишь, кто рядом и в каком они настроении. <span class="keys-only">Цифры — быстрый выбор.</span></p>`;
      this.panelRows.clear();
      this.panelDist.clear();
      this.panelRegister(this.refs.panel);
      for (const g of this.refs.panel.querySelectorAll<HTMLElement>('.pgroup')) this.panelDist.set(g.dataset.g!, g.querySelector<HTMLElement>('[data-d]')!);
    }
    // На месте: подписи, доступность, главное действие, расстояния
    const live = new Set<string>();
    const fresh: ActionOption[] = [];
    for (const g of groups) {
      const d = this.panelDist.get(g.key);
      const dist = g.gap > 0.2 ? `${g.gap.toFixed(1)} м` : '';
      if (d && d.textContent !== dist) d.textContent = dist;
      for (const o of g.options) {
        live.add(o.id);
        const r = this.panelRows.get(o.id);
        if (!r) {
          fresh.push(o);
          continue;
        }
        if (r.label.textContent !== o.label) r.label.textContent = o.label;
        const why = o.enabled ? '' : o.reason;
        if (r.reason.textContent !== why) r.reason.textContent = why;
        r.row.classList.toggle('off', !o.enabled);
        r.row.classList.toggle('main', o.id === f.main?.id);
        r.row.classList.remove('gone');
      }
    }
    // Действия уже нет, а строка на месте: серая, ничего не делает
    for (const [id, r] of this.panelRows) {
      if (live.has(id) || r.row.classList.contains('gone')) continue;
      r.row.classList.add('off', 'gone');
      r.row.classList.remove('main');
      r.reason.textContent = 'сейчас недоступно';
    }
    // Появилось новое — дописываем в конец: строки выше не сдвигаются
    if (fresh.length && !this.panelDown) {
      const body = this.refs.panel.querySelector<HTMLElement>('.panel-body')!;
      body.querySelector('[data-empty]')?.remove();
      let extra = body.querySelector<HTMLElement>('[data-extra]');
      if (!extra) {
        extra = el('div', 'pgroup', '<h4><span>Появилось рядом</span></h4>');
        extra.dataset.extra = '';
        body.appendChild(extra);
      }
      for (const o of fresh) {
        this.panelList.push(o);
        extra.insertAdjacentHTML('beforeend', this.panelRow(o, this.panelList.length));
      }
      this.panelRegister(extra);
      for (const o of fresh) {
        const r = this.panelRows.get(o.id)!;
        r.label.textContent = o.label;
        r.reason.textContent = o.enabled ? '' : o.reason;
        r.row.classList.toggle('off', !o.enabled);
      }
    }
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
    const key = `${e.id}:${seen.signal > 0 ? 1 : 0}:${Math.min(2, seen.wakePee)}:${catHabitText(e) ?? ''}:${Object.values(n).map((v) => Math.round(v / 4)).join(',')}:${doingText(e)}:${e.signal?.kind}:${Math.round(L.trust * 100)}:${Math.round(L.cooperation * 100)}:${Math.round(L.expectation * 100)}:${Math.round(L.toilet * 100)}:${Math.round(L.familiarity * 100)}:${Object.values(L.cues).map((v) => Math.round(v * 20)).join(',')}:${Math.round(gap * 5)}:${mood}:${[b.back, b.side, b.legs, b.head, b.hay, b.soap, e.wet].map((v) => Math.round(v * 10)).join(',')}`;
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
      if (ev.severity === 'info' && !['refuse', 'report', 'welcome', 'tank', 'lie', 'prepDone', 'tipsy', 'wake', 'catStartle', 'catShoo', 'kitten'].includes(ev.kind)) continue;
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
    document.body.dataset.state = kind === 'title' ? 'title' : 'paused';
    const wrap = this.refs.modal;
    wrap.hidden = false;
    wrap.innerHTML = `<div class="modal ${kind}" role="dialog" aria-modal="true">${html}</div>`;
    return wrap.firstElementChild as HTMLElement;
  }

  closeModal(): void {
    this.modal = null;
    document.body.dataset.state = 'playing';
    this.refs.modal.hidden = true;
    this.refs.modal.innerHTML = '';
  }

  private internshipHtml(): string {
    const summary = readSummary();
    const fullDone = summary.items['internship']?.status === 'done';
    const stages = INTERNSHIP_STAGES.map((st, idx) => {
      const done = summary.items[st.id]?.status === 'done';
      return `<button class="stage-btn ${done ? 'done' : ''}" data-scenario="${esc(st.id)}">
        <span><b>Этап ${idx + 1}. ${esc(st.title.replace(/^Этап\s+[IVX]+\.\s*/i, ''))}</b><small>${esc(st.task)}</small></span>
        <span class="stage-badge">${done ? '✓ пройден' : 'начать →'}</span>
      </button>`;
    }).join('');
    return `<div class="internship-box">
      <div class="internship-head">
        <span><b>Кампания стажировки со старшим кипером</b> <small class="muted">${fullDone ? '· допуск получен ✓' : '· 4 этапа допуска'}</small></span>
        <button class="btn small primary" data-scenario="internship">Вся стажировка (I–IV)</button>
      </div>
      <div class="internship-stages">${stages}</div>
    </div>`;
  }

  private bindScenarioButtons(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-scenario]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.scenario!;
        this.closeModal();
        this.h.startScenario(id);
      }),
    );
  }

  private helpHtml(): string {
    const k = (a: BindAction) => `<kbd>${esc(this.keyFor(a))}</kbd>`;
    return `<div class="help">
        <div class="keys-only">${k('up')}${k('left')}${k('down')}${k('right')} / стрелки — идти, ${k('run')} — бежать (пугает нервных)</div>
        <div class="keys-only">${k('action')} — главное действие: оно написано в подсказке внизу и относится к цели — к тому, к чему стоишь лицом и ближе всего. Пока стоишь, цель не меняется</div>
        <div class="keys-only">${k('target')} или клик по объекту — выбрать другую цель · ${k('panel')} — все действия рядом (цифры — выбор) · ${k('drop')} — положить вещь</div>
        <div class="touch-only">Телефон держат вертикально. Стик слева — идти (за край — бегом). Над кнопкой-рукой написано, что она сделает и с кем</div>
        <div class="touch-only">Цель — то, к чему стоишь лицом и ближе всего. Другую выбирают касанием её названия или самого объекта; «⋯» — все действия рядом</div>
        <div>Рядом со слонихой — голосом: окликнуть по имени, «иди сюда», «подвинься», «стоять», «пошли», «ложись», «давай», «молодец». Подходи так, чтобы видела; спящую сначала окликни</div>
        <div class="keys-only">Клик по слону — осмотр · ${k('journal')} — журнал и рацион · ${k('speed')} — скорость · ${k('overview')} — карта</div>
        <div class="touch-only">Касание слона или её карточки — осмотр · два пальца — масштаб · вверху — время, журнал и меню</div>
      </div>`;
  }

  openTitle(hasContinue: string | null): void {
    const legacy = this.h.legacyCount();
    const m = this.showModal(
      'title',
      `<div class="title-mark">${ICON.logo}</div>
      <h1>Elephant Keeper</h1>
      <p class="lead">Смена смотрителя в небольшом слоновнике полного контакта: ты работаешь рядом со слонами, в одном зале с ними. Слоны живут своей жизнью: едят, пьют, играют, спят — и зовут тебя, когда без тебя не обойтись. У каждой свой характер, своё личное место и свои отношения с тобой — доверие, привычка, память о том, отвечаешь ли ты.</p>
      ${hasContinue ? `<button class="btn primary wide" data-go="continue" data-start="true">${ICON.play}<span>Продолжить смену</span><small>${esc(hasContinue)}</small></button>` : ''}
      <div class="newgame">
        <span>Новое стадо:</span>
        <div class="seg" data-herd>${Array.from({ length: CAPACITY }, (_, i) => `<button data-n="${i + 1}" class="${i + 1 === this.herdChoice ? 'on' : ''}">${i + 1}</button>`).join('')}</div>
        <button class="btn ${hasContinue ? '' : 'primary'}" data-go="new" ${hasContinue ? '' : 'data-start="true"'}>Начать</button>
      </div>
      ${this.internshipHtml()}
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
    this.bindScenarioButtons(m);
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
    const order: BindAction[] = ['action', 'target', 'panel', 'drop', 'up', 'down', 'left', 'right', 'run', 'inspect', 'journal', 'pause', 'speed', 'overview', 'recenter', 'zoomIn', 'zoomOut', 'names', 'mute'];
    const m = this.showModal(
      'menu',
      `<div class="drawer-head"><h2>Пауза</h2><button class="btn icon small" data-close aria-label="Закрыть">${ICON.close}</button></div>
      ${this.internshipHtml()}
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
        <div><b>Рука</b> — главное действие: над ней написано, что именно она сделает и с кем. Нажать можно и на саму подсказку.</div>
        <div><b>Цель</b> — то, к чему стоишь лицом и ближе всего; пока стоишь, она не меняется. Другую выбирают касанием названия цели или самого объекта.</div>
        <div><b>⋯</b> — все действия рядом, <b>стрелка вниз</b> — положить вещь (появляется, когда что-то в руках).</div>
        <div><b>Касание слона</b> или карточки — осмотр. <b>Два пальца</b> — приблизить или отдалить.</div>
        <div>Вверху — время, скорость, журнал и это меню. <b>Нарезка овощей</b>: левая половина экрана — взять и бросить, правая — нож.</div>
      </div>
      <div class="key-help">
        <p class="muted small-p">Подсказка внизу показывает цель и главное действие: цель — то, к чему стоишь лицом и ближе всего; пока стоишь, она не меняется. ${esc(this.keyFor('target'))} или клик по объекту — выбрать другую цель, ${esc(this.keyFor('panel'))} — список всего, что можно сделать рядом. Нажми «Изменить», затем нужную клавишу (Esc — отмена).</p>
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
    this.bindScenarioButtons(m);
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
    const careHtml = r.care
      ? `<div class="care-report">
          <div class="care-report-head">
            <b>Полевой рапорт по уходу</b>
            <span class="${r.care.flags.length === 0 ? 'good-t' : 'bad-t'}">${
              r.care.flags.length === 0 ? 'Чистая смена — без пропусков' : `Замечаний по уходу: ${r.care.flags.length}`
            }</span>
          </div>
          <ul class="care-report-list">${r.care.items
            .map(
              (item) =>
                `<li class="${item.ok ? 'care-ok' : 'care-miss'}"><b>${item.ok ? '✓' : '✕'} ${esc(item.label)}:</b> ${esc(item.detail)}</li>`,
            )
            .join('')}</ul>
        </div>`
      : '';
    const m = this.showModal(
      'report',
      `<div class="kicker">Сдача смены · день ${r.day}</div>
      <h2>${r.score} <small>из 100</small></h2>
      <p class="lead">${esc(r.verdict)}</p>
      ${careHtml}
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

// Название цели уже стоит рядом — в подписи действия его не повторяем («Открыть: ворота на выгул»)
function promptLabel(label: string, target: string): string {
  const tail = `: ${target.toLowerCase()}`;
  return label.toLowerCase().endsWith(tail) ? label.slice(0, label.length - tail.length) : label;
}

export type { Elephant };
