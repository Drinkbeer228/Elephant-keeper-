import { WHY } from '../data/why';
import { BALANCE } from '../data/balance';
import { ELEPHANTS } from '../data/elephants';
import { barrowSummary, basinsOnRack, clockText, dayPart, itemLabel, profileOf, type ActionOption, type ShiftEvent, type State } from '../sim';
import type { Input } from '../game/input';
import { renderReport } from './report';
import { ICON, barrowIcon, itemIcon, portraitIcon, vegIcon } from './icons';

// Интерфейс поверх canvas: часы, слонихи, ресурсы, подсказка действия, лента событий, чек-лист, кнопки

export interface HudCallbacks {
  restart: () => void;
  setPaused: (paused: boolean) => void;
  prepCut: (spot: number) => void;
  prepClose: () => void;
}

const VEG_TITLES: Record<string, string> = { carrot: 'морковь', potato: 'картофель', beet: 'свёкла' };
const SPOT_NAMES: Record<string, string> = { top: 'ботва', tail: 'хвостик', rot: 'гниль', eye: 'глазок' };

interface Toast {
  el: HTMLElement;
  until: number;
}

export class Hud {
  private els: Record<string, HTMLElement> = {};
  private toasts: Toast[] = [];
  private lastChips = '';
  private lastHeld: string | null = null;
  private menuKey: string | null = null;
  private prepKey = '';
  private prepSel = 0;
  private uncut: number[] = [];
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
      <section class="schedule panel" data-el="schedule">
        <button class="schedule-toggle" data-el="scheduleToggle" aria-expanded="true">📋 Распорядок смены <span>J</span></button>
        <div class="schedule-rows" data-el="scheduleRows"></div>
      </section>
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
      <div class="menu panel hidden" data-el="menu"></div>
      <div class="prep panel hidden" data-el="prep">
        <b data-el="prepTitle"></b>
        <div class="board"><img data-el="prepImg" alt=""><div class="spots" data-el="prepSpots"></div></div>
        <small>Нажми на дефект или выбери стрелками и срежь (Space) · Esc — отойти</small>
        <button class="btn ghost" data-el="prepClose">Отойти от стола</button>
      </div>
      <div class="bottom">
        <div class="stick" data-el="stick"><div class="knob" data-el="knob"></div></div>
        <div class="actionHint panel" data-el="hint"></div>
        <div class="buttons">
          <button class="btn round inspectBtn" data-el="inspectBtn" aria-label="Осмотр">${ICON.eye}<small>F</small></button>
          <button class="btn round actionBtn" data-el="actionBtn" aria-label="Действие">${ICON.hand}<small>Space / E</small></button>
        </div>
      </div>
      <div class="overlay" data-el="intro">
        <div class="card poster">
          <div class="marquee"></div>
          <p class="kicker">Цирк на гастролях · суточное дежурство</p>
          <h1>Дежурный кипер</h1>
          <div class="intro-body">
            <div class="portraits">${portraits}</div>
            <p>Ты заступаешь на сутки в двух комплексах: женском — <b>Претти</b>, <b>Марго</b>, <b>Одри</b> — и мужском — <b>Раджа</b>, <b>Барон</b>, <b>Цезарь</b>. Димон помогает обслуживать самцов.</p>
            <ol class="rules">
            <li><b>Смена идёт сразу.</b> Утром сменщик примет вольер по чек-листу: ворота, вода, сено, инвентарь на стойке, тачка и рохля на местах, тазы, чистота.</li>
            <li><b>Запасы не бесконечны.</b> Зерно, овощи, фрукты, сено, солома и опилки расходуются — следи за строкой сверху. Утром (с 09:15) грузовик подаёт к зоне разгрузки: разгрузи паллеты на рохлю или на площадку и развези по складам. Не успел к 11:30 — груз уехал.</li>
            <li><b>Туалет.</b> Смотри на животных: у каждой слонихи свой знак — топот, стойка у решётки. Димон следит за самцами. Успей подставить бак — иначе мокрая подстилка и больные ноги. Угости за бак (это тратит фрукты!), бак вылей в решётку слива. Одри не предупреждает: веди её «погулять».</li>
            <li><b>Пол.</b> Мокрое — вилами, потом опилки (ведро — у кучи под навесом); впитали — метлой до пола, сверху солома. Навоз — совком, сразу: в его отсек, в тачку или мешок. Сор с тачки на дорожке — метлой.</li>
            <li><b>Корм.</b> Каша в 13:00 и 17:00 (по шесть тазов на кормление). Ужин к 19:00: с 14:00 овощи со стеллажа в корзину, замочить и промыть на мойке, почистить и нарезать у стола. Разложи по тазам на стеллаже, носи по одному; Димон помогает самцам. Пустые тазы — стопкой на мойку и обратно.</li>
            <li><b>Ночь.</b> В вольере темно: включи дежурный свет у двери дежурки, утром выключи.</li>
            <li><b>Тачка и рохля.</b> Тачка возит инвентарь, опилки, солому, тюки и мусор (три тюка и больше качаются: Q / E). Рохля — только по твёрдому полу: дорожка, комнаты, асфальт. С тяжёлым в руках идёшь медленнее — катай тележку.</li>
            </ol>
            <p class="keys"><kbd>WASD</kbd> ходить · <kbd>Space</kbd>/<kbd>E</kbd> действие · <kbd>F</kbd> осмотр · <kbd>Q</kbd>/<kbd>E</kbd> равновесие тачки · <kbd>P</kbd> пауза · <kbd>J</kbd> распорядок</p>
          </div>
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
    tap('scheduleToggle', () => this.toggleSchedule());
    tap('resumeBtn', () => this.togglePause());
    this.els.inspect.addEventListener('pointerdown', () => this.els.inspect.classList.add('hidden'));
    // Чистка овощей: дефект нажимают пальцем или мышью; стрелки выбирают, Space режет (через main)
    this.els.prepSpots.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-spot]');
      if (!b) return;
      e.preventDefault();
      this.cb.prepCut(Number(b.dataset.spot));
    });
    tap('prepClose', () => this.cb.prepClose());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyJ' && !e.repeat) {
        e.preventDefault();
        this.toggleSchedule();
      }
      if (this.els.prep.classList.contains('hidden')) return;
      const dir = e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : e.code === 'ArrowRight' || e.code === 'KeyD' ? 1 : 0;
      if (dir) this.moveSel(dir);
    });
    this.els.menu.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-choice]');
      if (!b) return;
      e.preventDefault();
      input.push(Number(b.dataset.choice));
    });
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

  // Меню действия: несколько дел на одном месте (тачка). Клавиши 1–9 или тап по пункту
  get menuOpen(): boolean {
    return this.menuKey !== null;
  }

  private static menuKeyOf(a: ActionOption | null): string | null {
    return a?.choices ? a.choices.map((c) => c.label).join('|') : null;
  }

  openMenu(a: ActionOption): void {
    this.menuKey = Hud.menuKeyOf(a);
    const items = a.choices!.map(
      (c, i) => `<button class="btn ghost" data-choice="${i}" ${c.disabled ? 'disabled' : ''}><kbd>${i + 1}</kbd><span></span></button>`,
    );
    this.els.menu.innerHTML = `<b></b>${items.join('')}<small>Space или Esc — закрыть</small>`;
    this.els.menu.querySelector('b')!.textContent = a.label;
    this.els.menu.querySelectorAll('[data-choice] span').forEach((el, i) => (el.textContent = a.choices![i].label));
    this.els.menu.classList.remove('hidden');
  }

  closeMenu(): void {
    this.menuKey = null;
    this.els.menu.classList.add('hidden');
  }

  // Отошёл или содержимое изменилось — меню устарело
  syncMenu(a: ActionOption | null): void {
    if (this.menuKey !== null && Hud.menuKeyOf(a) !== this.menuKey) this.closeMenu();
  }

  // Выбранный дефект — для Space и кнопки действия на телефоне
  get prepSelected(): number {
    return this.prepSel;
  }

  private moveSel(dir: -1 | 1): void {
    if (!this.uncut.length) return;
    const i = this.uncut.indexOf(this.prepSel);
    this.prepSel = this.uncut[(i + dir + this.uncut.length) % this.uncut.length];
    this.prepKey = '';
  }

  private renderPrep(s: State): void {
    const prep = s.prep;
    this.els.prep.classList.toggle('hidden', !prep?.open);
    if (!prep?.open) return;
    const piece = prep.pieces[prep.index];
    this.uncut = piece.spots.map((p, i) => (p.cut ? -1 : i)).filter((i) => i >= 0);
    if (!this.uncut.includes(this.prepSel)) this.prepSel = this.uncut[0] ?? 0;
    const key = JSON.stringify([prep.index, piece.spots.map((p) => p.cut), this.prepSel]);
    if (key === this.prepKey) return;
    this.prepKey = key;
    this.els.prepTitle.textContent = `Чистка: ${VEG_TITLES[piece.kind]} (${prep.index + 1}/3) · осталось ${this.uncut.length}`;
    (this.els.prepImg as HTMLImageElement).src = vegIcon(piece);
    this.els.prepSpots.innerHTML = piece.spots
      .map((p, i) =>
        p.cut
          ? ''
          : `<button class="spot${i === this.prepSel ? ' sel' : ''}" data-spot="${i}" style="left:${p.x * 100}%;top:${p.y * 100}%" aria-label="${SPOT_NAMES[p.kind]}"><span>${SPOT_NAMES[p.kind]}</span></button>`,
      )
      .join('');
  }

  private scheduleCollapsed = false;
  private lastScheduleMinute = -1;

  private toggleSchedule(): void {
    this.scheduleCollapsed = !this.scheduleCollapsed;
    this.els.schedule.classList.toggle('collapsed', this.scheduleCollapsed);
    this.els.scheduleToggle.setAttribute('aria-expanded', String(!this.scheduleCollapsed));
  }

  private renderSchedule(t: number): void {
    const minute = Math.floor(t);
    if (minute === this.lastScheduleMinute) return;
    this.lastScheduleMinute = minute;
    const rows = [
      { start: 0, end: 75, time: '08:00–09:15', text: 'Проверить поилку, убрать ночной навоз, насыпать сено' },
      { start: 75, end: 210, time: '09:15–11:30', text: 'Снять 4 паллеты у ворот и развезти на склады' },
      { start: 300, end: 360, time: '13:00', text: 'Запарить зерно в котле, раздать 6 тазов слонам' },
      { start: 360, end: 510, time: '14:00–16:30', text: 'Набрать, помыть, нарезать овощи; убрать подстилку и почистить бассейн' },
      { start: 540, end: 600, time: '17:00', text: 'Вечерняя каша' },
      { start: 660, end: 720, time: '19:00', text: 'Овощной ужин: раздать тазы' },
      { start: 720, end: 780, time: '20:00', text: 'Включить дежурный свет' },
      { start: 1320, end: 1440, time: '06:00–08:00', text: 'Выключить свет, вернуть инвентарь, тачку и рохлю, вывезти мусор' },
    ];
    this.els.scheduleRows.innerHTML = rows
      .map((row) => {
        const done = minute >= row.end;
        const active = minute >= row.start && minute < row.end;
        return `<div class="schedule-row${done ? ' done' : active ? ' active' : ''}"><b>${done ? '✓' : active ? '●' : '○'}</b><span><strong>${row.time}</strong>${row.text}</span></div>`;
      })
      .join('');
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
      part === 'day' ? 'день' : part === 'night' ? 'ночь' : 'утро, скоро сдача';
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
    const clean = basinsOnRack(s).filter((b) => !b.dirty && !b.food).length;
    const stock = (v: number, icon: string, title: string) =>
      `<span class="r${v <= 0 ? ' low' : ''}" title="${title}: ${v}">${icon}${v}</span>`;
    this.els.res.innerHTML = `
      <span class="r${low(s.trough, BALANCE.handover.troughMin)}" title="Вода в поилке">${ICON.drop}${Math.round(s.trough)}%</span>
      <span class="r${low(s.feederHay, BALANCE.handover.hayMin)}" title="Сено в кормушке">${ICON.hay}${Math.round(s.feederHay)}%</span>
      <span class="r${clean < 3 ? ' low' : ''}" title="Чистых тазов на стеллаже">${ICON.bowl}${clean}</span>
      <span class="sep">|</span>
      ${stock(s.stock.grain, ICON.sack, 'Зерно в кладовой')}
      ${stock(s.stock.veg, ICON.carrot, 'Овощи на стеллаже')}
      ${stock(s.stock.fruit, ICON.apple, 'Фрукты в кладовой')}
      <span class="r${s.player.pocketTreats <= 0 ? ' low' : ''}" title="Лакомства в поясной сумке (до ${BALANCE.player.pocketMax})">${ICON.apple}×${s.player.pocketTreats}</span>
      ${stock(s.stock.hay, ICON.bale, 'Тюки сена под навесом')}
      ${stock(s.stock.straw, ICON.straw, 'Охапки соломы под навесом')}
      ${stock(s.stock.sawdust, ICON.saw, 'Опилки у ларя')}
      `;

    const heldKey = s.jack.pushed
      ? `jack-${s.jack.cargo?.map((u) => u.kind).join('+') ?? 'пусто'}`
      : s.barrow.pushed
        ? `barrow-${barrowSummary(s)}`
        : s.player.held
          ? `${s.player.held.kind}-${itemLabel(s.player.held)}`
          : '';
    if (heldKey !== this.lastHeld) {
      this.lastHeld = heldKey;
      this.els.held.innerHTML = s.jack.pushed
        ? `<span>Рохля: <b>${s.jack.cargo ? 'поддон с грузом' : 'пустая'}</b></span>`
        : s.barrow.pushed
          ? `<img src="${barrowIcon()}" alt=""><span>Тачка: <b>${barrowSummary(s)}</b></span>`
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
    // Во время чистки подсказка говорит, что срежет кнопка действия
    const prepSpot = s.prep?.open ? s.prep.pieces[s.prep.index].spots[this.prepSel] : undefined;
    this.els.hint.innerHTML = prepSpot
      ? `${ICON.hand}<span>Срезать: ${SPOT_NAMES[prepSpot.kind]}</span>`
      : action
        ? `${action.disabled ? ICON.info : ICON.hand}<span>${action.label}${action.choices ? ' <em>· выбор</em>' : ''}</span>`
        : '';
    this.els.hint.classList.toggle('disabled', !!action?.disabled);
    this.els.hint.classList.toggle('empty', !action);
    this.els.actionBtn.classList.toggle('ready', !!action && !action.disabled);
    this.renderPrep(s);
    this.renderSchedule(s.t);

    if (s.phase === 'report' && s.report && !this.reportShown) {
      this.reportShown = true;
      this.els.report.innerHTML = renderReport(s.report);
      this.els.report.classList.remove('hidden');
      this.els.report.querySelector('[data-restart]')!.addEventListener('click', () => this.cb.restart());
    }
  }
}
