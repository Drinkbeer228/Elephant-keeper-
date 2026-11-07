// Точка входа: фиксированный шаг симуляции, рендер Phaser и DOM-интерфейс.

import Phaser from 'phaser';
import { TIME } from './data/balance';
import { sound } from './audio/sound';
import { Input } from './input';
import { WorldScene } from './render/WorldScene';
import {
  actionTarget,
  kittenDoing,
  availableActions,
  clearLegacy,
  createState,
  LOAD_FAILURE_TEXT,
  legacyKeys,
  loadSlot,
  saveSlot,
  slotInfo,
  step,
  type SimEvent,
  type State,
  type StepInput,
} from './sim';
import { Hud } from './ui/hud';
import { PrepView } from './ui/prep';
import './ui/styles.css';

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
const herdParam = Number(params.get('herd'));

let state: State = createState({ seed: seedParam || Math.floor(Math.random() * 1e9), herdSize: herdParam || 3 });
let paused = true;
let speed = Math.max(0, Math.min(4, Number(params.get('speed')) || 1));
let selected: string | null = null;
let showNames = true;
let acc = 0;
let autosaveAt = performance.now() + 60_000;
let bot: { decide(s: State): StepInput } | null = null;
let scene: WorldScene | null = null;
const pending: string[] = [];
const input = new Input();
// Нарезка овощей: пока открыт крупный план, время идёт медленнее, чем на территории
const PREP_PACE = 0.4;

// iPhone и другие браузеры включают звук только из обработчика жеста. Ловим любые касания,
// клики и клавиши на этапе перехвата — до того, как их обработает игра.
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const)
  window.addEventListener(type, () => sound.unlock(), { capture: true, passive: true });
input.onGesture = () => sound.unlock();

const hudRoot = document.getElementById('hud')!;
const hud = new Hud(hudRoot, {
  action: (id) => {
    sound.unlock();
    sound.click();
    pending.push(id);
  },
  select: (id) => (selected = id),
  focus: (x, y) => scene?.focus(x, y),
  speed: (v) => setSpeed(v),
  pauseToggle: () => setSpeed(speed === 0 ? 1 : 0),
  setPaused: (p) => (paused = p),
  newGame: (herd, seed) => {
    state = createState({ seed: seed ?? (seedParam || Math.floor(Math.random() * 1e9)), herdSize: herd });
    selected = null;
    paused = false;
    sound.unlock();
    saveSlot(state, 'auto');
  },
  continueGame: () => {
    const res = loadSlot('auto');
    if (!res || !res.ok) {
      hud.toast(res && !res.ok ? LOAD_FAILURE_TEXT[res.reason] : 'Автосохранения нет.', 'warn');
      return false;
    }
    state = res.state;
    paused = false;
    sound.unlock();
    return true;
  },
  save: (slot) => {
    const r = saveSlot(state, slot);
    return r.ok ? 'Смена сохранена.' : `Не удалось сохранить: ${r.error}`;
  },
  load: (slot) => {
    const res = loadSlot(slot);
    if (!res) return 'Слот пуст.';
    if (!res.ok) return LOAD_FAILURE_TEXT[res.reason];
    state = res.state;
    selected = null;
    return null;
  },
  toggleSound: () => {
    sound.unlock();
    return sound.toggle();
  },
  soundMuted: () => sound.muted,
  volume: () => sound.volume,
  setVolume: (v) => {
    sound.setVolume(v);
    sound.click();
  },
  toggleNames: () => (showNames = !showNames),
  namesOn: () => showNames,
  closeReport: () => {
    state.pendingReport = null;
    paused = false;
  },
  zoom: (k) => scene?.zoomBy(k),
  overview: () => scene?.toggleOverview(),
  legacyCount: () => legacyKeys().length,
  clearLegacy: () => clearLegacy(),
  binds: () => input.binds,
  rebind: (a, done) =>
    input.captureNext((code) => {
      // Esc — отменить переназначение
      if (code !== 'Escape') input.rebind(a, code);
      done();
    }),
  resetBinds: () => input.resetBinds(),
});

const prep = new PrepView(hudRoot, {
  act: (side) => pending.push(side === 'L' ? 'prepPick:L' : 'prepTrim:R'),
  exit: () => pending.push('prepExit:exit'),
});

function setSpeed(v: number): void {
  speed = v;
  hud.setSpeed(v);
}
setSpeed(speed);

const stick = hud.stickElements();
input.bindStick(stick.base, stick.knob);

function nameOf(id: string): string | null {
  return state.elephants.find((e) => e.id === id)?.profile.name ?? null;
}

function nearestElephant(): string | null {
  let best: string | null = null;
  let bestD = 7;
  for (const e of state.elephants) {
    const d = Math.hypot(e.x - state.keeper.x, e.y - state.keeper.y);
    if (d < bestD) {
      bestD = d;
      best = e.id;
    }
  }
  return best;
}

function handlePresses(): void {
  for (const p of input.take()) {
    if (p.kind === 'pause') {
      if (hud.modalOpen) hud.closeMenu();
      else if (state.keeper.prep) pending.push('prepExit:exit');
      else if (hud.panelShown) hud.togglePanel(false);
      else hud.openMenu();
      continue;
    }
    if (hud.modalOpen) continue;
    switch (p.kind) {
      case 'prep':
        if (state.keeper.prep) pending.push(p.side === 'L' ? 'prepPick:L' : 'prepTrim:R');
        break;
      case 'panel':
        hud.togglePanel();
        break;
      case 'action': {
        const a = hud.actionForKey(0);
        if (a) pending.push(a.id);
        break;
      }
      case 'choice': {
        const a = hud.actionForKey(p.index);
        if (a) pending.push(a.id);
        break;
      }
      case 'drop': {
        const d = hud.actions.find((a) => a.ref.verb === 'drop');
        if (d) pending.push(d.id);
        break;
      }
      case 'inspect':
        selected = selected ? null : nearestElephant();
        break;
      case 'journal':
        hud.toggleJournal();
        break;
      case 'mute':
        hud.updateSound(sound.toggle());
        break;
      case 'speed':
        setSpeed(speed === 0 ? 1 : speed === 1 ? 2 : speed === 2 ? 4 : 1);
        break;
      case 'zoom':
        scene?.zoomBy(p.dir > 0 ? 1.15 : 0.87);
        break;
      case 'overview':
        scene?.toggleOverview();
        break;
      case 'recenter':
        scene?.recenter();
        break;
      case 'names':
        showNames = !showNames;
        break;
    }
  }
}

const perf = { frameMs: 0, simMs: 0, hudMs: 0, steps: 0, frames: 0, dtSum: 0 };

function frame(dt: number): SimEvent[] {
  const f0 = performance.now();
  perf.frames++;
  perf.dtSum += dt;
  input.prepMode = state.keeper.prep !== null && !hud.modalOpen;
  handlePresses();
  const events: SimEvent[] = [];
  const pace = state.keeper.prep ? Math.min(speed, PREP_PACE) : speed;
  const running = !paused && !hud.modalOpen && pace > 0 && state.pendingReport === null;
  if (running) {
    acc += dt * pace;
    let steps = 0;
    const move = input.move();
    while (acc >= TIME.step && steps < 12 * Math.max(1, speed)) {
      acc -= TIME.step;
      const inp: StepInput = bot ? bot.decide(state) : { move, run: input.running(), actions: steps === 0 ? pending.splice(0) : [], cancel: false };
      events.push(...step(state, inp));
      steps++;
      perf.steps++;
      if (state.pendingReport !== null) break;
    }
    if (acc > TIME.step * 4) acc = 0;
    perf.simMs = perf.simMs * 0.9 + (performance.now() - f0) * 0.1;
  } else {
    acc = 0;
    pending.length = 0;
  }
  if (events.length) {
    hud.pushEvents(events);
    for (const ev of events) {
      const near = Math.hypot(ev.x - state.keeper.x, ev.y - state.keeper.y) < 14 || ev.x === 0;
      sound.event(ev, near, nameOf);
      if (ev.text && (ev.severity === 'warn' || ev.severity === 'bad')) sound.chime(ev.severity);
    }
  }
  prep.update(state, events, dt);
  if (state.pendingReport !== null && !hud.modalOpen) {
    const r = state.reports[state.pendingReport];
    if (r) hud.openReport(r);
    saveSlot(state, 'auto');
  }
  const h0 = performance.now();
  hud.render(state, availableActions(state), selected);
  perf.hudMs = perf.hudMs * 0.9 + (performance.now() - h0) * 0.1;
  perf.frameMs = perf.frameMs * 0.9 + (performance.now() - f0) * 0.1;
  if (performance.now() > autosaveAt && running) {
    autosaveAt = performance.now() + 60_000;
    saveSlot(state, 'auto');
  }
  return events;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (!hud.modalOpen && !paused) saveSlot(state, 'auto');
    if (!hud.modalOpen && !paused) hud.openMenu();
  }
});

// Высокая плотность пикселей: холст в физических пикселях, CSS-масштаб 1/dpr
const dpr = Math.min(2, window.devicePixelRatio || 1);

function start(): void {
  if (window.innerWidth < 2 || window.innerHeight < 2) {
    setTimeout(start, 100);
    return;
  }
  scene = new WorldScene({
    getState: () => state,
    frame,
    onSelect: (id) => (selected = id),
    onKitten: () => hud.toast(`Котёнок со станции ${kittenDoing(state)}. Живёт сам по себе — заботиться о нём не нужно.`, 'info'),
    selected: () => selected,
    showNames: () => showNames,
    marker: () => {
      if (state.keeper.task) return null;
      const a = hud.actions.find((x) => x.enabled);
      return a ? actionTarget(state, a) : null;
    },
    dpr,
  });
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#e8e4da',
    scale: { mode: Phaser.Scale.NONE, width: Math.round(window.innerWidth * dpr), height: Math.round(window.innerHeight * dpr), zoom: 1 / dpr },
    render: { antialias: true, antialiasGL: true, roundPixels: false, powerPreference: 'high-performance' },
    scene: [scene],
    banner: false,
  });
  window.addEventListener('resize', () => {
    game.scale.resize(Math.round(window.innerWidth * dpr), Math.round(window.innerHeight * dpr));
    game.scale.setZoom(1 / dpr);
  });
  Object.assign(window, {
    keeper: {
      get state() {
        return state;
      },
      set state(v: State) {
        state = v;
      },
      game,
      perf,
      sound,
    },
  });
}
start();

const auto = slotInfo('auto');
if (params.get('autostart') === '1' || params.has('bot')) {
  paused = false;
  if (params.has('bot')) {
    void import('./dev/autokeeper').then((m) => {
      bot = new m.AutoKeeper();
    });
  }
} else {
  hud.openTitle(auto.ok ? auto.text : null);
}
