import { WHY, type WhyKey } from '../data/why';
import { BALANCE } from '../data/balance';
import { ELEPHANTS } from '../data/elephants';
import { MAP, MAP_ID } from '../data/map';
import {
  AUTOSAVE_SLOT,
  HANDOVER_CHECKS,
  SAVE_REASON_LABELS,
  STATE_LABELS,
  barrowSummary,
  basinsOnRack,
  clockText,
  dayPart,
  deleteSlot,
  displayTemperamentOf,
  exportSaveJson,
  importSaveJson,
  itemLabel,
  listAllSlotMetas,
  loadFromSlot,
  profileOf,
  saveToSlot,
  type ActionOption,
  type LoadContext,
  type SaveSlotId,
  type ShiftEvent,
  type State,
} from '../sim';
import type { Input } from '../game/input';
import { sound } from '../game/sound';
import { renderReport } from './report';
import { ICON, barrowIcon, itemIcon, portraitIcon, vegIcon } from './icons';

export interface HudCallbacks {
  restart: () => void;
  setPaused: (paused: boolean) => void;
  prepCut: (spot: number) => void;
  prepClose: () => void;
  loadState: (next: State) => void;
  getState: () => State;
  focusPoint: (x: number, y: number) => void;
  toggleOverview: () => boolean;
  isOverview: () => boolean;
}

const VEG_TITLES: Record<string, string> = { carrot: 'морковь', potato: 'картофель', beet: 'свёкла' };
const SPOT_NAMES: Record<string, string> = { top: 'ботва', tail: 'хвостик', rot: 'гниль', eye: 'глазок' };

const TEMPERAMENT_DESCRIPTIONS: Record<string, string> = {
  calm: 'Ровный и уравновешенный нрав: медленнее копит скуку, хорошо отзывается на лакомство.',
  capricious: 'Требовательный характер: быстрее начинает скучать и раньше идёт к кормушке.',
  playful: 'Подвижный и любопытный нрав: обожает бассейн и игры с покрышкой на выгуле.',
  dominant: 'Вожак стада: высокий аппетит и уверенное поведение в загоне.',
  shy: 'Застенчивый нрав: не подаёт громкого сигнала к туалету — ловится командой «погулять».',
  neutral: 'Сбалансированный характер.',
};

interface Toast {
  el: HTMLElement;
  until: number;
}

function getLoadCtx(): LoadContext {
  return { mapId: MAP_ID, cols: MAP.floor.cols, rows: MAP.floor.rows };
}

export class Hud {
  private els: Record<string, HTMLElement> = {};
  private toasts: Toast[] = [];
  private lastChipsKey = '';
  private lastResKey = '';
  private lastHeld = '__init__';
  private menuKey: string | null = null;
  private prepKey = '';
  private prepSel = 0;
  private uncut: number[] = [];
  private reportShown = false;
  private inspectOpen = false;
  private inspectTab = 'pretty';
  private scheduleOpen = false;
  private lastScheduleKey = '';
  paused = false;
  introOpen = true;

  constructor(root: HTMLElement, input: Input, private cb: HudCallbacks) {
    const mapIsModern = MAP_ID === 'modern';
    const rosterHtml = ELEPHANTS.map((p) => {
      const temp = displayTemperamentOf(p.id);
      const zoneLabel = p.paddock === 'female' ? 'Верхний комплекс (Твой сектор)' : 'Нижний комплекс (Сектор Димона)';
      return `
        <div class="roster-card ${p.paddock}">
          <img src="${portraitIcon(p.id)}" alt="${p.name}">
          <div class="roster-card-body">
            <div class="roster-card-title">${p.name} · <span class="badge">${temp.name}</span></div>
            <div style="font-size:10px;color:#988b7a;margin-bottom:2px">${zoneLabel}</div>
            <div class="roster-card-note">${p.signalHint}</div>
          </div>
        </div>`;
    }).join('');

    root.innerHTML = `
      <header class="hud-header">
        <div class="hud-top-row">
          <div class="hud-clock-cluster frame">
            <div class="clock-Badge" data-el="clockBadge">
              <span data-el="dayIcon">${ICON.sun}</span>
              <b data-el="clock">08:00</b>
            </div>
            <span class="daypart-pill" data-el="part">ДЕНЬ</span>
            <div class="shift-progress-wrap" title="Прогресс 24-часового дежурства (08:00–08:00)">
              <div class="shift-progress-label"><span>Смена 24ч</span><span data-el="checkCounter">0/10</span></div>
              <div class="shift-progress-bar"><div class="shift-progress-fill" data-el="dayBar" style="width:0%"></div></div>
            </div>
          </div>

          <div class="hud-gauges frame" data-el="res"></div>

          <div class="hud-toolbar">
            <button data-el="scheduleBtn" title="Почасовой регламент смены и чек-лист приёмки (J)">
              ${ICON.clipboard}<span>Регламент</span><span class="kbd">J</span>
            </button>
            <button data-el="inspectTopBtn" title="Ветеринарное досье слонов и сводка по секторам (F)">
              ${ICON.eye}<span>Досье</span><span class="kbd">F</span>
            </button>
            <button data-el="overviewBtn" title="Переключить обзор всей карты (Tab / Z)">
              ${ICON.compass}<span>Карта</span><span class="kbd">Tab</span>
            </button>
            <button data-el="muteBtn" aria-label="Звук (M)" title="Включить/выключить звук (M)">
              ${sound.muted ? ICON.mute : ICON.speaker}
            </button>
            <button data-el="pauseBtn" aria-label="Пауза и сохранения (P)" title="Пауза, слоты сохранений и экспорт/импорт (P / Esc)">
              ${ICON.pause}
            </button>
          </div>
        </div>

        <div class="hud-elephants-row" data-el="chips"></div>
      </header>

      <div class="hud-mid-area">
        <aside class="hud-drawer frame" data-el="inspect" style="display:none">
          <div class="drawer-header">
            <h3 class="drawer-title">Ветеринарное досье и осмотр [F]</h3>
            <button data-el="inspectClose" style="padding:3px 7px;font-size:11px">Закрыть</button>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px" data-el="inspectTabs"></div>
          <div data-el="inspectBody"></div>
        </aside>

        <aside class="hud-drawer frame" data-el="schedule" style="display:none;margin-left:auto">
          <div class="drawer-header">
            <h3 class="drawer-title">Журнал смены и чек-лист [J]</h3>
            <button data-el="scheduleClose" style="padding:3px 7px;font-size:11px">Свернуть</button>
          </div>
          <div style="font-size:11px;color:#988b7a;margin-bottom:4px">Почасовой распорядок суток</div>
          <div class="schedule-timeline" data-el="scheduleRows"></div>
          <div style="font-size:11px;color:#988b7a;margin-bottom:4px">Чек-лист приёмки сменщиком к 08:00</div>
          <ul class="checklist-list" data-el="checklistRows"></ul>
        </aside>
      </div>

      <div class="hud-touch">
        <div class="stick" data-el="stick"><div class="stick-knob" data-el="knob"></div></div>
        <div class="touch-balance">
          <button data-el="inspectBtn" aria-label="Осмотр">${ICON.eye}</button>
          <button class="primary" data-el="actionBtn" aria-label="Действие">${ICON.hand}</button>
        </div>
      </div>

      <footer class="hud-bottom">
        <div class="hud-held-card frame">
          <div class="held-row" data-el="held"></div>
          <div class="barrow-tilt" data-el="balance" style="display:none">
            <button data-el="leanL" style="padding:2px 6px">&lt; Q</button>
            <div class="tilt-track">
              <div class="tilt-center"></div>
              <div class="tilt-dot" data-el="needle" style="left:50%"></div>
            </div>
            <button data-el="leanR" style="padding:2px 6px">E &gt;</button>
          </div>
        </div>

        <div class="hud-action-dock">
          <div class="choices-list" data-el="menu" style="display:none"></div>
          <button class="action-main-btn idle" data-el="hintBtn">
            <span data-el="hint">Подойди к объекту или слону для действия</span>
            <span class="kbd">Space / E</span>
          </button>
        </div>

        <div class="hud-log" data-el="feed"></div>
      </footer>

      <div class="modal-overlay" data-el="prep" style="display:none">
        <div class="modal-card" style="max-width:440px;text-align:center">
          <div class="modal-header">
            <div style="text-align:left">
              <div class="modal-kicker">Кормокухня · подготовка ужина к 19:00</div>
              <h3 class="modal-title" data-el="prepTitle" style="font-size:13px">Чистка овощей</h3>
            </div>
            <button data-el="prepClose">Отойти <span class="kbd">Esc</span></button>
          </div>
          <div class="prep-stage">
            <img data-el="prepImg" alt="">
            <div data-el="prepSpots"></div>
          </div>
          <p style="font-size:12px;color:#d4c8b8;margin:8px 0 0">
            Нажми на дефект мышью/пальцем или выбери <span class="kbd">A</span> / <span class="kbd">D</span> и срежь <span class="kbd">Space</span>
          </p>
        </div>
      </div>

      <div class="modal-overlay" data-el="intro">
        <div class="modal-card wide">
          <div class="modal-header">
            <div>
              <div class="modal-kicker">Производственный симулятор · Суточное дежурство 08:00–08:00</div>
              <h1 class="modal-title">Дежурный кипер слоновника</h1>
              <p class="modal-subtitle">Шесть слонов в двух секторах, напарник Димон, утренняя поставка, туалетный рефлекс, кормокухня и сдача смены по 10 пунктам.</p>
            </div>
          </div>

          <div class="title-mode-bar">
            <div>
              <b style="color:#fcf8f2">Планировка комплекса:</b>
              <span style="color:#988b7a;font-size:12px;margin-left:6px">
                ${mapIsModern ? 'Полный комплекс 120×100 (с буфером разгрузки и 2 лугами)' : 'Камерный комплекс 64×48 (классическая планировка)'}
              </span>
            </div>
            <div style="display:flex;gap:6px">
              <a href="?map=legacy" style="text-decoration:none">
                <button type="button" class="${!mapIsModern ? 'active-toggle' : ''}">Камерная (64×48)</button>
              </a>
              <a href="?map=new" style="text-decoration:none">
                <button type="button" class="${mapIsModern ? 'active-toggle' : ''}">Полный комплекс (120×100)</button>
              </a>
            </div>
          </div>

          <div style="font-size:11px;color:#fce0a8;font-weight:700;text-transform:uppercase;margin-top:8px">
            Поголовье на смене (клик по карточке в игре открывает досье [F])
          </div>
          <div class="title-roster-grid">${rosterHtml}</div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;font-size:12px;color:#d4c8b8;margin-top:10px">
            <div class="frame" style="padding:8px 10px">
              <b style="color:#f8b800">1. Туалет и трёхфазная уборка</b>
              <p style="margin:4px 0 0">Лови сигнал слоних баком и хвали яблоком из сумки. Мокрую солому — вилами, на лужу — опилки, пропитанные опилки — метлой, сверху свежую солому. Навоз — совком.</p>
            </div>
            <div class="frame" style="padding:8px 10px">
              <b style="color:#f8b800">2. Поставка (09:15) и рацион</b>
              <p style="margin:4px 0 0">Разгрузи 4 паллеты у ворот до 11:30. Запарь кашу в котле к 13:00 и 17:00. К 19:00 намой и почисти овощи на столе. В 20:00 включи ночной свет, утром выключи.</p>
            </div>
          </div>

          <div class="title-cta-row">
            <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:11px;color:#988b7a">
              <span><span class="kbd">WASD</span> ход</span>
              <span><span class="kbd">Space</span>/<span class="kbd">E</span> действие</span>
              <span><span class="kbd">F</span> досье</span>
              <span><span class="kbd">J</span> регламент</span>
              <span><span class="kbd">Tab</span> карта</span>
              <span><span class="kbd">M</span> звук</span>
              <span><span class="kbd">P</span> пауза/сейвы</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button data-el="continueBtn" style="display:none">${ICON.save}<span data-el="continueLabel">Продолжить смену</span></button>
              <button class="primary cta-big" data-el="introBtn" data-start="true">Заступить на новую смену</button>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-overlay" data-el="pause" style="display:none">
        <div class="modal-card wide">
          <div class="modal-header">
            <div>
              <div class="modal-kicker">Архив дежурств и настройки</div>
              <h2 class="modal-title">Пауза · Сохранение и загрузка</h2>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button data-el="pauseMuteBtn">${sound.muted ? '🔇 Звук выкл' : '🔊 Звук вкл'}</button>
              <button class="primary" data-el="resumeBtn">Продолжить смену <span class="kbd">Esc</span></button>
            </div>
          </div>

          <div class="log-entry" data-el="saveFeedback" style="display:none;margin-bottom:10px"></div>

          <div class="slots-grid" data-el="saveSlots"></div>

          <div class="title-cta-row">
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button data-el="exportJsonBtn">⬇ Экспорт смены в .JSON</button>
              <label style="cursor:pointer">
                <span class="frame" style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;font-weight:700;font-size:12px;background:#221d19;border:2px solid #6e5f4f">
                  ⬆ Импорт смены из .JSON
                </span>
                <input type="file" accept=".json,application/json" data-el="importJsonInput" hidden>
              </label>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <a href="${mapIsModern ? '?map=legacy' : '?map=new'}" style="text-decoration:none">
                <button type="button">Сменить карту (${mapIsModern ? 'на 64×48' : 'на 120×100'})</button>
              </a>
              <button class="danger" data-el="pauseRestartBtn">Начать смену заново</button>
            </div>
          </div>
        </div>
      </div>

      <div data-el="report" style="display:none"></div>
    `;

    root.querySelectorAll<HTMLElement>('[data-el]').forEach((el) => (this.els[el.dataset.el!] = el));

    const tap = (name: string, fn: () => void) =>
      this.els[name]?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sound.uiClick();
        fn();
      });

    tap('actionBtn', () => input.push('action'));
    tap('hintBtn', () => input.push('action'));
    tap('inspectBtn', () => this.toggleInspect());
    tap('inspectTopBtn', () => this.toggleInspect());
    tap('inspectClose', () => this.hideInspect());
    tap('scheduleBtn', () => this.toggleSchedule());
    tap('scheduleClose', () => this.toggleSchedule());
    tap('overviewBtn', () => {
      const active = this.cb.toggleOverview();
      this.els.overviewBtn.classList.toggle('active-toggle', active);
    });
    tap('muteBtn', () => this.toggleMute());
    tap('pauseMuteBtn', () => this.toggleMute());
    tap('pauseBtn', () => this.togglePause());
    tap('introBtn', () => this.closeIntro());
    tap('resumeBtn', () => this.togglePause());
    tap('pauseRestartBtn', () => this.cb.restart());
    tap('exportJsonBtn', () => this.handleExportJson());

    this.els.continueBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sound.uiClick();
      this.handleContinueLatest();
    });

    this.els.importJsonInput.addEventListener('change', (e) => {
      const inputEl = e.target as HTMLInputElement;
      const file = inputEl.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result ?? '');
        const ctx = getLoadCtx();
        const res = importSaveJson(raw, ctx);
        if (!res.ok) {
          this.showSaveFeedback(`Ошибка импорта: ${SAVE_REASON_LABELS[res.reason]}`, true);
        } else {
          this.cb.loadState(res.state);
          saveToSlot(res.state, ctx, AUTOSAVE_SLOT);
          this.showSaveFeedback(`Смена загружена из файла (${clockText(res.state.t)})`, false);
          this.renderSaveSlots();
        }
        inputEl.value = '';
      };
      reader.readAsText(file);
    });

    this.els.chips.addEventListener('pointerdown', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-elephant]');
      if (!chip) return;
      e.preventDefault();
      sound.uiOpen();
      this.openElephantDossier(chip.dataset.elephant!);
    });

    this.els.inspectTabs.addEventListener('pointerdown', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (!btn) return;
      e.preventDefault();
      sound.uiClick();
      this.inspectTab = btn.dataset.tab!;
      this.renderDossier(this.cb.getState());
    });

    this.els.inspectBody.addEventListener('pointerdown', (e) => {
      const focusBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-focus-elephant]');
      if (!focusBtn) return;
      e.preventDefault();
      sound.uiClick();
      const id = focusBtn.dataset.focusElephant!;
      const el = this.cb.getState().elephants.find((x) => x.id === id);
      if (el) {
        this.cb.focusPoint(el.x, el.y);
      }
    });

    this.els.saveSlots.addEventListener('pointerdown', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-slot-action]');
      if (!btn) return;
      e.preventDefault();
      sound.uiClick();
      const slot = btn.dataset.slot as SaveSlotId;
      const act = btn.dataset.slotAction;
      const ctx = getLoadCtx();
      if (act === 'save') {
        const res = saveToSlot(this.cb.getState(), ctx, slot);
        if (res.ok) {
          this.showSaveFeedback(`Сохранено в «${slot === AUTOSAVE_SLOT ? 'Автосохранение' : slot}» (${clockText(this.cb.getState().t)})`, false);
        } else {
          this.showSaveFeedback(res.error, true);
        }
        this.renderSaveSlots();
        this.refreshContinueButton();
      } else if (act === 'load') {
        const res = loadFromSlot(ctx, slot);
        if (!res) {
          this.showSaveFeedback('Слот пуст.', true);
        } else if (res.ok) {
          this.cb.loadState(res.state);
          this.showSaveFeedback(`Загружена смена на ${clockText(res.state.t)}`, false);
          this.togglePause();
        } else {
          this.showSaveFeedback(SAVE_REASON_LABELS[res.reason], true);
        }
      } else if (act === 'delete') {
        deleteSlot(ctx, slot);
        this.showSaveFeedback('Слот очищен.', false);
        this.renderSaveSlots();
        this.refreshContinueButton();
      }
    });

    this.els.prepSpots.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-spot]');
      if (!b) return;
      e.preventDefault();
      sound.vegCut();
      this.cb.prepCut(Number(b.dataset.spot));
    });
    tap('prepClose', () => this.cb.prepClose());

    window.addEventListener('keydown', (e) => {
      if (this.introOpen && (e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag !== 'A' && tag !== 'INPUT' && tag !== 'BUTTON') {
          e.preventDefault();
          sound.uiClick();
          this.closeIntro();
          return;
        }
      }
      if (this.els.prep.style.display === 'none') return;
      const dir = e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : e.code === 'ArrowRight' || e.code === 'KeyD' ? 1 : 0;
      if (dir) this.moveSel(dir);
    });

    this.els.menu.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-choice]');
      if (!b) return;
      e.preventDefault();
      sound.uiClick();
      input.push(Number(b.dataset.choice));
    });

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

    this.refreshContinueButton();
    this.syncBodyState();
  }

  private syncBodyState(): void {
    if (this.reportShown) {
      document.body.dataset.state = 'gameover';
    } else if (this.introOpen) {
      document.body.dataset.state = 'title';
    } else if (this.paused) {
      document.body.dataset.state = 'paused';
    } else {
      document.body.dataset.state = 'playing';
    }
  }

  private findLatestCompatibleSlot(): { slot: SaveSlotId; clock: string; savedAt: number } | null {
    const metas = listAllSlotMetas(getLoadCtx())
      .filter((m) => m.exists && m.compatible && m.savedAt !== undefined)
      .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
    if (!metas.length) return null;
    const latest = metas[0];
    return { slot: latest.slot, clock: latest.clock ?? '08:00', savedAt: latest.savedAt! };
  }

  refreshContinueButton(): void {
    const latest = this.findLatestCompatibleSlot();
    if (!latest) {
      this.els.continueBtn.style.display = 'none';
      return;
    }
    this.els.continueBtn.style.display = 'inline-flex';
    this.els.continueLabel.textContent = `Продолжить смену (${latest.clock})`;
  }

  private handleContinueLatest(): void {
    const latest = this.findLatestCompatibleSlot();
    if (!latest) return;
    const res = loadFromSlot(getLoadCtx(), latest.slot);
    if (res && res.ok) {
      this.cb.loadState(res.state);
      this.closeIntro();
      this.pushEvents([{ kind: 'good', text: `Смена восстановлена на ${clockText(res.state.t)}.` }]);
    }
  }

  closeIntro(): void {
    this.introOpen = false;
    this.els.intro.style.display = 'none';
    this.syncBodyState();
  }

  toggleMute(): void {
    const muted = sound.toggleMute();
    this.els.muteBtn.innerHTML = muted ? ICON.mute : ICON.speaker;
    this.els.pauseMuteBtn.textContent = muted ? '🔇 Звук выкл' : '🔊 Звук вкл';
  }

  togglePause(): void {
    if (this.introOpen || this.reportShown) return;
    this.paused = !this.paused;
    if (this.paused) {
      saveToSlot(this.cb.getState(), getLoadCtx(), AUTOSAVE_SLOT);
      this.els.saveFeedback.style.display = 'none';
      this.renderSaveSlots();
    }
    this.els.pause.style.display = this.paused ? 'flex' : 'none';
    this.cb.setPaused(this.paused);
    this.syncBodyState();
  }

  private showSaveFeedback(msg: string, isError: boolean): void {
    this.els.saveFeedback.textContent = msg;
    this.els.saveFeedback.className = `log-entry ${isError ? 'bad' : 'good'}`;
    this.els.saveFeedback.style.display = 'flex';
  }

  private renderSaveSlots(): void {
    const metas = listAllSlotMetas(getLoadCtx());
    this.els.saveSlots.innerHTML = metas
      .map((m) => {
        const cls = !m.exists ? '' : m.compatible ? 'compatible' : 'incompatible';
        let metaHtml = '<div class="slot-meta">Слот свободен</div>';
        if (m.exists) {
          if (m.compatible) {
            const dt = m.savedAt ? new Date(m.savedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
            metaHtml = `<div class="slot-meta">Время смены: <b>${m.clock}</b> (${m.dayPartLabel ?? ''})${dt ? ` · сохранено в ${dt}` : ''}</div>`;
          } else {
            metaHtml = `<div class="slot-meta" style="color:#f85840">${m.reasonText ?? 'Несовместимое сохранение'}</div>`;
          }
        }
        const canLoad = m.exists && m.compatible;
        return `
          <div class="slot-card ${cls}">
            <div class="slot-head">
              <span>${m.title}</span>
              ${m.slot === AUTOSAVE_SLOT ? '<span class="badge">АВТО</span>' : ''}
            </div>
            ${metaHtml}
            <div class="slot-actions">
              <button data-slot="${m.slot}" data-slot-action="save">Сохранить</button>
              <button class="primary" data-slot="${m.slot}" data-slot-action="load" ${canLoad ? '' : 'disabled'}>Загрузить</button>
              ${m.exists ? `<button class="danger" data-slot="${m.slot}" data-slot-action="delete" title="Очистить слот">✕</button>` : ''}
            </div>
          </div>`;
      })
      .join('');
  }

  private handleExportJson(): void {
    const json = exportSaveJson(this.cb.getState(), getLoadCtx());
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keeper-shift-${clockText(this.cb.getState().t).replace(':', '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this.showSaveFeedback('Файл сохранения (.json) выгружен.', false);
  }

  get menuOpen(): boolean {
    return this.menuKey !== null;
  }

  private static menuKeyOf(a: ActionOption | null): string | null {
    return a?.choices ? a.choices.map((c) => c.label).join('|') : null;
  }

  openMenu(a: ActionOption): void {
    this.menuKey = Hud.menuKeyOf(a);
    const items = a.choices!.map(
      (c, i) => `<button class="choice-btn" data-choice="${i}" ${c.disabled ? 'disabled' : ''}><span class="kbd">${i + 1}</span><span></span></button>`,
    );
    this.els.menu.innerHTML = `<div style="font-size:11px;color:#f8b800;font-weight:700;padding:2px 4px"></div>${items.join('')}`;
    this.els.menu.querySelector('div')!.textContent = a.label;
    this.els.menu.querySelectorAll('[data-choice] span:last-child').forEach((el, i) => (el.textContent = a.choices![i].label));
    this.els.menu.style.display = 'flex';
  }

  closeMenu(): void {
    this.menuKey = null;
    this.els.menu.style.display = 'none';
  }

  syncMenu(a: ActionOption | null): void {
    if (this.menuKey !== null && Hud.menuKeyOf(a) !== this.menuKey) this.closeMenu();
  }

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
    this.els.prep.style.display = prep?.open ? 'flex' : 'none';
    if (!prep?.open) return;
    const piece = prep.pieces[prep.index];
    this.uncut = piece.spots.map((p, i) => (p.cut ? -1 : i)).filter((i) => i >= 0);
    if (!this.uncut.includes(this.prepSel)) this.prepSel = this.uncut[0] ?? 0;
    const key = JSON.stringify([prep.index, piece.spots.map((p) => p.cut), this.prepSel]);
    if (key === this.prepKey) return;
    this.prepKey = key;
    this.els.prepTitle.textContent = `Чистка: ${VEG_TITLES[piece.kind]} (${prep.index + 1}/3) · дефектов: ${this.uncut.length}`;
    (this.els.prepImg as HTMLImageElement).src = vegIcon(piece);
    this.els.prepSpots.innerHTML = piece.spots
      .map((p, i) =>
        p.cut
          ? ''
          : `<button class="spot" data-spot="${i}" style="left:${p.x * 100}%;top:${p.y * 100}%;border-color:${i === this.prepSel ? '#f8b800' : '#f85840'}" aria-label="${SPOT_NAMES[p.kind]}" title="${SPOT_NAMES[p.kind]}">✂</button>`,
      )
      .join('');
  }

  toggleSchedule(): void {
    this.scheduleOpen = !this.scheduleOpen;
    this.els.schedule.style.display = this.scheduleOpen ? 'block' : 'none';
    this.els.scheduleBtn.classList.toggle('active-toggle', this.scheduleOpen);
  }

  private renderScheduleAndChecklist(s: State): void {
    const minute = Math.floor(s.t);
    const checkStates = HANDOVER_CHECKS.map((c) => c.ok(s));
    const passedCount = checkStates.filter(Boolean).length;
    const key = `${minute}-${checkStates.map((b) => (b ? '1' : '0')).join('')}`;
    if (key === this.lastScheduleKey) return;
    this.lastScheduleKey = key;

    this.els.checkCounter.textContent = `Чек-лист: ${passedCount}/${HANDOVER_CHECKS.length}`;

    const rows = [
      { start: 0, end: 75, time: '08:00–09:15', text: 'Проверить поилку, убрать ночной навоз, добавить сено' },
      { start: 75, end: 210, time: '09:15–11:30', text: 'Разгрузить 4 паллеты у ворот по складам' },
      { start: 300, end: 360, time: '13:00', text: 'Запарить зерно в котле, раздать 6 тазов каши' },
      { start: 360, end: 510, time: '14:00–16:30', text: 'Помыть и нарезать овощи; почистить подстилку и бассейн' },
      { start: 540, end: 600, time: '17:00', text: 'Вечерняя каша (6 тазов)' },
      { start: 660, end: 720, time: '19:00', text: 'Овощной ужин: раздать тазы' },
      { start: 720, end: 780, time: '20:00', text: 'Включить дежурный ночной свет' },
      { start: 1320, end: 1440, time: '06:00–08:00', text: 'Выключить свет, вернуть инвентарь, вывезти мусор' },
    ];
    this.els.scheduleRows.innerHTML = rows
      .map((row) => {
        const done = minute >= row.end;
        const active = minute >= row.start && minute < row.end;
        return `<div class="sched-row${active ? ' now' : ''}" style="opacity:${done ? '0.6' : '1'}">
          <span class="sched-time">${done ? '✓ ' : active ? '● ' : ''}${row.time}</span>
          <span style="flex:1;text-align:right">${row.text}</span>
        </div>`;
      })
      .join('');

    this.els.checklistRows.innerHTML = HANDOVER_CHECKS.map((c, idx) => {
      const ok = checkStates[idx];
      return `<li class="checklist-item ${ok ? 'ok' : 'fail'}">
        <span class="ico">${ok ? ICON.check : ICON.cross}</span>
        <span>${c.label}</span>
      </li>`;
    }).join('');
  }

  openElephantDossier(id: string): void {
    this.inspectTab = id;
    this.inspectOpen = true;
    this.els.inspect.style.display = 'block';
    this.els.inspectTopBtn.classList.add('active-toggle');
    this.renderDossier(this.cb.getState());
  }

  toggleInspect(): void {
    if (this.inspectOpen) {
      this.hideInspect();
    } else {
      this.inspectOpen = true;
      this.els.inspect.style.display = 'block';
      this.els.inspectTopBtn.classList.add('active-toggle');
      this.renderDossier(this.cb.getState());
    }
  }

  hideInspect(): void {
    this.inspectOpen = false;
    this.els.inspect.style.display = 'none';
    this.els.inspectTopBtn.classList.remove('active-toggle');
  }

  showInspect(_text?: string): void {
    this.inspectOpen = true;
    this.els.inspect.style.display = 'block';
    this.els.inspectTopBtn.classList.add('active-toggle');
    this.renderDossier(this.cb.getState());
  }

  private renderDossier(s: State): void {
    if (!this.inspectOpen) return;
    this.els.inspectTabs.innerHTML = [
      ...s.elephants.map((e) => {
        const p = profileOf(e);
        const active = this.inspectTab === e.id ? 'active-toggle' : '';
        const warn = e.signalStarted !== undefined || e.state === 'sway' || e.musthTimer > 0 ? 'danger' : '';
        return `<button class="${active || warn}" data-tab="${e.id}" style="padding:3px 7px;font-size:11px">
          ${p.name}
        </button>`;
      }),
      `<button class="${this.inspectTab === 'summary' ? 'active-toggle' : ''}" data-tab="summary" style="padding:3px 7px;font-size:11px">Сводка</button>`,
    ].join('');

    if (this.inspectTab === 'summary') {
      const flatCells = s.cells.flat();
      const wetCount = flatCells.filter((c) => c.kind === 'wet' || c.kind === 'bareWet' || c.kind === 'puddle').length;
      const dungCount = s.dung.length + flatCells.filter((c) => c.kind === 'dung').length;
      const strawCount = flatCells.filter((c) => c.kind === 'straw').length;
      const kasha = s.kitchen.kasha;
      const kashaText =
        kasha.status === 'ready'
          ? `готова (${kasha.portions} порций)`
          : kasha.status === 'cooking'
            ? 'варится в котле'
            : 'котёл пуст';
      const dirtyPools = s.pools.filter((p) => p.dirty > 35 || p.floats.length > 0).length;

      this.els.inspectBody.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
          <div class="frame" style="padding:8px 10px">
            <b style="color:#f8b800">Состояние секторов и подстилки</b>
            <div>Сухая солома: <b>${strawCount} кл.</b> · Мокрых клеток: <b>${wetCount}</b> · Навоз: <b>${dungCount}</b></div>
            <div>Верхняя поилка: <b>${Math.round(s.trough)}%</b> · Нижняя поилка: <b>${Math.round(s.trough2)}%</b></div>
            <div>Верхняя кормушка: <b>${Math.round(s.feederHay)}%</b> · Нижняя кормушка: <b>${Math.round(s.feederHay2)}%</b></div>
            <div>Уличный контейнер: <b>${s.container.fill}/${BALANCE.container.capacity}</b> · Бассейны: <b>${dirtyPools ? `загрязнено (${dirtyPools})` : 'чистые'}</b></div>
          </div>
          <div class="frame" style="padding:8px 10px">
            <b style="color:#f8b800">Кормокухня и склады</b>
            <div>Котёл каши: <b>${kashaText}</b> · Овощной ужин: <b>${s.kitchen.veg.portions} порций</b></div>
            <div>Напарник Димон: <b>${s.partner.mode || 'обходит нижний сектор'}</b></div>
          </div>
        </div>
      `;
      return;
    }

    const e = s.elephants.find((x) => x.id === this.inspectTab) ?? s.elephants[0];
    const p = profileOf(e);
    const temp = displayTemperamentOf(e.id);
    const stateLabel = STATE_LABELS[e.state] ?? e.state;
    const fullness = Math.max(0, Math.min(100, Math.round(100 - e.hunger)));
    const hydration = Math.max(0, Math.min(100, Math.round(100 - e.thirst)));
    const bladderPct = Math.max(0, Math.min(100, Math.round(e.bladder)));
    const moodPct = Math.max(0, Math.min(100, Math.round(100 - e.boredom)));
    const k1Done = s.meals.kasha1[e.id] !== null;
    const k2Done = s.meals.kasha2[e.id] !== null;
    const dnDone = s.meals.dinner[e.id] !== null;

    const bar = (label: string, val: number, color: string) => `
      <div class="stat-row">
        <div class="stat-label"><span>${label}</span><b>${val}%</b></div>
        <div class="stat-track"><div class="stat-fill" style="width:${val}%;background:${color}"></div></div>
      </div>
    `;

    this.els.inspectBody.innerHTML = `
      <div class="dossier-head">
        <img class="dossier-portrait" src="${portraitIcon(e.id)}" alt="${p.name}">
        <div class="dossier-meta" style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
            <h4>${p.name}</h4>
            <button data-focus-elephant="${e.id}" style="padding:3px 7px;font-size:11px">На карте</button>
          </div>
          <div class="dossier-badges">
            <span class="badge">${temp.name}</span>
            <span class="badge">${p.paddock === 'female' ? 'Верхний сектор' : 'Нижний сектор (Димон)'}</span>
            <span class="badge" style="color:#58d854">${stateLabel}</span>
          </div>
        </div>
      </div>

      <div style="font-size:11.5px;color:#d4c8b8;margin-bottom:8px">
        <div><b>Сигнал:</b> ${p.signalHint}</div>
        <div style="color:#988b7a;margin-top:2px">${TEMPERAMENT_DESCRIPTIONS[temp.id] ?? ''}</div>
      </div>

      <div class="stat-grid">
        ${bar('Сытость', fullness, fullness < 40 ? '#f85840' : '#58d854')}
        ${bar('Гидратация', hydration, hydration < 40 ? '#f85840' : '#3cbcfc')}
        ${bar('Мочевой пузырь', bladderPct, bladderPct > 80 ? '#f85840' : '#f8b800')}
        ${bar('Настроение', moodPct, moodPct < 45 ? '#f85840' : '#58d854')}
      </div>

      <div class="frame" style="padding:7px 9px;font-size:11.5px;display:grid;grid-template-columns:1fr 1fr;gap:4px 10px">
        <div>В бак / мимо: <b>${e.tally.inBucket} / ${e.tally.missed}</b></div>
        <div>Куч навоза: <b>${e.tally.dung}</b></div>
        <div>Каша 13:00 / 17:00: <b>${k1Done ? '✓' : '—'} / ${k2Done ? '✓' : '—'}</b></div>
        <div>Овощной ужин: <b>${dnDone ? '✓ выдан' : 'ожидает'}</b></div>
        <div>Доверие киперу: <b>${Math.round(e.trust)}%</b></div>
        <div>Нагрузка ног: <b>+${Math.round(e.footDebt - e.footDebtStart)}</b></div>
      </div>
    `;
  }

  pushEvents(events: ShiftEvent[], inspectText?: string): void {
    for (const ev of events) {
      if (ev.text === inspectText) continue;
      const el = document.createElement('div');
      el.className = `log-entry ${ev.kind}`;
      el.innerHTML = `<span style="display:flex;align-items:center;gap:6px"><span class="ico">${ICON[ev.kind]}</span><span class="tt"></span></span>`;
      el.querySelector('.tt')!.textContent = ev.text;
      const toast = { el, until: performance.now() + (ev.kind === 'hint' ? 11000 : ev.why ? 8500 : 5500) };
      if (ev.why) {
        const why = WHY[ev.why];
        const btn = document.createElement('button');
        btn.className = 'why-btn';
        btn.textContent = 'почему?';
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          sound.uiClick();
          const box = document.createElement('div');
          box.style.cssText = 'font-size:11px;color:#fce0a8;margin-top:4px';
          box.textContent = why;
          btn.replaceWith(box);
          toast.until = performance.now() + 13000;
        });
        el.appendChild(btn);
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
      part === 'day' ? 'ДЕНЬ' : part === 'night' ? 'НОЧЬ' : 'УТРО · СДАЧА';
    this.els.clockBadge.classList.toggle('night', part === 'night' || s.t > 690);
    this.els.dayIcon.innerHTML = part === 'night' || s.t > 690 ? ICON.moon : ICON.sun;
    this.els.dayBar.style.width = `${Math.min(100, (s.t / BALANCE.time.shiftEnd) * 100)}%`;

    const renderChip = (e: State['elephants'][number]) => {
      const p = profileOf(e);
      const alarm = e.signalStarted !== undefined || e.musthTimer > 0 || e.state === 'sway';
      const praise = s.t <= e.praiseUntil;
      const isMale = p.paddock === 'male';
      const stateCls = `${isMale ? 'male-chip' : ''} ${alarm ? 'alert' : praise ? 'praise' : ''} ${this.inspectOpen && this.inspectTab === e.id ? 'selected' : ''}`;
      const stLabel = e.musthTimer > 0 ? 'В мусте!' : (STATE_LABELS[e.state] ?? e.state);
      const fullness = Math.max(0, Math.min(100, Math.round(100 - e.hunger)));
      const bladder = Math.max(0, Math.min(100, Math.round(e.bladder)));
      const mood = Math.max(0, Math.min(100, Math.round(100 - e.boredom)));
      return `
        <button class="el-chip ${stateCls}" data-elephant="${e.id}" title="${p.name}: ${stLabel} (нажми для открытия досье)">
          <img class="el-chip-avatar" src="${portraitIcon(p.id)}" alt="">
          <div class="el-chip-body">
            <div class="el-chip-top">
              <span class="el-chip-name">${p.name}</span>
              <span class="el-chip-state">${stLabel}</span>
            </div>
            <div class="el-mini-bars">
              <div class="mini-meter hunger" title="Сытость: ${fullness}%"><span style="width:${fullness}%"></span></div>
              <div class="mini-meter bladder" title="Пузырь: ${bladder}%"><span style="width:${bladder}%"></span></div>
              <div class="mini-meter mood" title="Комфорт: ${mood}%"><span style="width:${mood}%"></span></div>
            </div>
          </div>
        </button>`;
    };

    const females = s.elephants.filter((e) => profileOf(e).paddock === 'female');
    const males = s.elephants.filter((e) => profileOf(e).paddock === 'male');
    const chipsHtml = `
      <div class="elephant-group">
        <span class="group-tag female">Твой сектор</span>
        ${females.map(renderChip).join('')}
      </div>
      <div class="elephant-group">
        <span class="group-tag male">Димон</span>
        ${males.map(renderChip).join('')}
      </div>
    `;
    if (chipsHtml !== this.lastChipsKey) {
      this.lastChipsKey = chipsHtml;
      this.els.chips.innerHTML = chipsHtml;
    }

    const totalBasins = s.items.filter((i) => i.kind === 'basin').length || 6;
    const clean = basinsOnRack(s).filter((b) => !b.dirty && !b.food).length;
    const gauge = (content: string, title: string, tone: '' | 'warn' | 'bad' | 'ok' = '') =>
      `<span class="gauge-item ${tone}" title="${title}">${content}</span>`;

    const resHtml = [
      gauge(`${ICON.drop}Вода <b>${Math.round(s.trough)}%</b>`, 'Автопоилка в верхнем вольере', s.trough < BALANCE.handover.troughMin ? 'bad' : 'ok'),
      gauge(`${ICON.hay}Сено <b>${Math.round(s.feederHay)}%</b>`, 'Сено в кормушке', s.feederHay < BALANCE.handover.hayMin ? 'bad' : 'ok'),
      gauge(`${ICON.bowl}Тазы <b>${clean}/${totalBasins}</b>`, 'Чистые тазы на стеллаже кормокухни', clean < 3 ? 'warn' : ''),
      gauge(`Бак <b>${s.container.fill}/${BALANCE.container.capacity}</b>`, 'Уличный мусорный контейнер', s.container.fill >= BALANCE.container.capacity ? 'bad' : ''),
      gauge(`${ICON.apple}Сумка <b>×${s.player.pocketTreats}</b>`, `Лакомства в поясной сумке (до ${BALANCE.player.pocketMax})`, s.player.pocketTreats <= 0 ? 'warn' : ''),
      gauge(`${ICON.sack}<b>${s.stock.grain}</b>`, 'Мешки зерна в кладовой', s.stock.grain <= 0 ? 'warn' : ''),
      gauge(`${ICON.carrot}<b>${s.stock.veg}</b>`, 'Овощи на стеллаже', s.stock.veg <= 0 ? 'warn' : ''),
      gauge(`${ICON.apple}<b>${s.stock.fruit}</b>`, 'Фрукты в кладовой', s.stock.fruit <= 0 ? 'warn' : ''),
      gauge(`${ICON.bale}<b>${s.stock.hay}</b>`, 'Тюки сена под навесом', s.stock.hay <= 0 ? 'warn' : ''),
      gauge(`${ICON.straw}<b>${s.stock.straw}</b>`, 'Тюки соломы под навесом', s.stock.straw <= 0 ? 'warn' : ''),
      gauge(`${ICON.saw}<b>${s.stock.sawdust}</b>`, 'Опилки у ларя', s.stock.sawdust <= 0 ? 'warn' : ''),
    ].join('');

    if (resHtml !== this.lastResKey) {
      this.lastResKey = resHtml;
      this.els.res.innerHTML = resHtml;
    }

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
        ? `<div class="held-slot-box">${ICON.save}</div><div class="held-info"><span class="held-caption">Транспорт</span><span class="held-title">Рохля: ${s.jack.cargo ? 'поддон с грузом' : 'пустая'}</span></div>`
        : s.barrow.pushed
          ? `<div class="held-slot-box"><img class="px-ico" src="${barrowIcon()}" alt=""></div><div class="held-info"><span class="held-caption">Тачка в руках</span><span class="held-title">${barrowSummary(s)}</span></div>`
          : s.player.held
            ? `<div class="held-slot-box"><img class="px-ico" src="${itemIcon(s.player.held)}" alt=""></div><div class="held-info"><span class="held-caption">В руках</span><span class="held-title">${itemLabel(s.player.held)}</span></div>`
            : `<div class="held-slot-box">${ICON.hand}</div><div class="held-info"><span class="held-caption">Инвентарь</span><span class="held-title" style="color:#988b7a">Руки свободны</span></div>`;
    }

    const balancing = s.barrow.pushed && s.barrow.bales > BALANCE.barrow.stableBales;
    this.els.balance.style.display = balancing ? 'flex' : 'none';
    if (balancing) {
      this.els.needle.style.left = `${50 + s.barrow.balance * 50}%`;
      this.els.needle.classList.toggle('danger', Math.abs(s.barrow.balance) > 0.65);
    }

    const prepSpot = s.prep?.open ? s.prep.pieces[s.prep.index].spots[this.prepSel] : undefined;
    const hintBtn = this.els.hintBtn as HTMLButtonElement;
    if (prepSpot) {
      this.els.hint.textContent = `Срезать дефект: ${SPOT_NAMES[prepSpot.kind]}`;
      hintBtn.classList.remove('idle');
      hintBtn.disabled = false;
    } else if (action) {
      this.els.hint.textContent = `${action.label}${action.choices ? ' · выбор (1–9)' : ''}`;
      hintBtn.classList.toggle('idle', !!action.disabled);
      hintBtn.disabled = !!action.disabled;
    } else {
      this.els.hint.textContent = 'Подойди к объекту или слону для действия';
      hintBtn.classList.add('idle');
      hintBtn.disabled = true;
    }

    this.renderPrep(s);
    this.renderScheduleAndChecklist(s);
    if (this.inspectOpen) {
      this.renderDossier(s);
    }

    if (s.phase === 'report' && s.report && !this.reportShown) {
      this.reportShown = true;
      sound.shiftComplete(s.report.stars);
      this.els.report.style.display = 'block';
      renderReport(
        this.els.report,
        s,
        () => {
          sound.uiClick();
          this.cb.restart();
        },
        (whyKey: WhyKey) => {
          this.pushEvents([{ kind: 'info', text: WHY[whyKey] }]);
        },
      );
      this.syncBodyState();
    }
  }
}
