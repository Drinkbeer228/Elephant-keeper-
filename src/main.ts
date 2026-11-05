import Phaser from 'phaser';
import { AUTOSAVE_SLOT, availableAction, createShift, inspect, saveToSlot, tick, type Command, type LoadContext, type State } from './sim';
import { MAP, MAP_ID } from './data/map';
import { Input } from './game/input';
import { WorldScene, type FrameResult } from './game/world';
import { OverlayScene } from './game/overlay';
import { sound } from './game/sound';
import '@fontsource/press-start-2p';
import { Hud } from './ui/hud';
import { setSpriteSources } from './ui/icons';
import { barrowUrl, itemUrl, portraitUrl, vegUrl } from './game/textures';

// Спрайты для интерфейса подставляет игровой слой — UI не импортирует textures напрямую
setSpriteSources({ itemUrl, portraitUrl, vegUrl, barrowUrl });

const loadCtx = (): LoadContext => ({ mapId: MAP_ID, cols: MAP.floor.cols, rows: MAP.floor.rows });

const params = new URLSearchParams(location.search);
let state: State = createShift(Number(params.get('seed')) || Date.now() % 1_000_000);
// ?bot — смену играет бот (для проверки и демо), ?speed=N — ускорение
const speed = Math.min(20, Math.max(1, Number(params.get('speed')) || 1));
let bot: { frame(): Command[] } | null = null;
if (params.has('bot')) void import('./dev/bot').then((m) => (bot = new m.Bot(state)));
let paused = false;
const pending: Command[] = [];
const input = new Input();
let worldScene: WorldScene | null = null;
let autosaveAccum = 0;

const hud = new Hud(document.getElementById('hud')!, input, {
  restart: () => location.reload(),
  prepCut: (spot) => pending.push({ type: 'prepCut', spot }),
  prepClose: () => pending.push({ type: 'prepClose' }),
  setPaused: (p) => (paused = p),
  getState: () => state,
  loadState: (next) => {
    state = next;
    if (params.has('bot')) void import('./dev/bot').then((m) => (bot = new m.Bot(state)));
  },
  focusPoint: (x, y) => {
    worldScene?.focusWorldPoint(x, y);
  },
  toggleOverview: () => worldScene?.toggleOverview() ?? false,
  isOverview: () => worldScene?.isOverview() ?? false,
});

if (params.has('bot') || params.get('autostart') === '1') {
  hud.closeIntro();
}

// Телефон свернул игру или погас экран — по возвращении ждёт пауза и автосохранение
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !paused && !hud.introOpen) hud.togglePause();
});

function frame(dt: number): FrameResult {
  const before = availableAction(state);
  for (const press of input.takePresses()) {
    if (press === 'mute') {
      hud.toggleMute();
      continue;
    }
    if (press === 'schedule') {
      hud.toggleSchedule();
      continue;
    }
    // Окно чистки: Space и кнопка действия режут выбранный дефект, Esc — отойти от стола
    if (state.prep?.open && !hud.introOpen && !paused) {
      if (press === 'action') {
        sound.vegCut();
        pending.push({ type: 'prepCut', spot: hud.prepSelected });
      } else if (press === 'pause') {
        pending.push({ type: 'prepClose' });
      }
      continue;
    }
    if (press === 'pause') {
      if (hud.menuOpen) hud.closeMenu();
      else hud.togglePause();
    } else if (hud.introOpen || paused) {
      continue;
    } else if (press === 'inspect') {
      sound.uiOpen();
      hud.toggleInspect();
    } else if (typeof press === 'number') {
      // Пункт меню: команда уйдёт с номером, симуляция сама найдёт то же меню
      if (hud.menuOpen && before?.choices?.[press]) {
        const choiceOpt = before.choices[press];
        if (!choiceOpt.disabled) sound.actionByLabel(choiceOpt.label);
        pending.push({ type: 'action', choice: press });
        hud.closeMenu();
      }
    } else if (press === 'action' || press === 'interact') {
      if (press === 'interact' && state.barrow.pushed) continue;
      if (hud.menuOpen) {
        hud.closeMenu();
      } else if (before?.choices) {
        sound.uiOpen();
        hud.openMenu(before);
      } else {
        if (before && !before.disabled) sound.actionByLabel(before.label);
        pending.push({ type: 'action' });
      }
    } else {
      pending.push({ type: press });
    }
  }
  if (hud.introOpen || paused) {
    hud.render(state, availableAction(state));
    return { actionReady: false };
  }
  // У стола с овощами кипер стоит на месте: стрелки выбирают дефект
  const move = state.prep?.open ? { x: 0, y: 0 } : input.move();
  if (move.x || move.y) {
    hud.closeMenu();
  }
  let commands: Command[] = [{ type: 'move', dx: move.x, dy: move.y, sprint: input.sprint() }, ...pending.splice(0)];
  const lean = input.balance();
  if (lean) commands.push({ type: 'balance', dir: lean });
  const inspected = commands.some((c) => c.type === 'inspect') ? inspect(state).join('\n') : undefined;
  let events = tick(state, dt, commands);
  if (bot) {
    // Бот делает несколько кадров по 1/30 с за кадр экрана — так ускорение не ломает его ходьбу
    const steps = Math.round(dt * 30 * speed);
    for (let i = 0; i < steps && state.phase !== 'report'; i++) {
      commands = bot.frame();
      events = events.concat(tick(state, 1 / 30, commands));
    }
  }
  if (inspected) hud.showInspect(inspected);
  sound.syncEvents(events);
  hud.pushEvents(events, inspected);

  // Автосохранение каждые 30 секунд реального времени во время смены
  autosaveAccum += dt;
  if (autosaveAccum >= 30 && state.phase === 'shift') {
    autosaveAccum = 0;
    saveToSlot(state, loadCtx(), AUTOSAVE_SLOT);
  }

  const action = availableAction(state);
  hud.syncMenu(action);
  hud.render(state, action);
  return { actionReady: !!action && !action.disabled };
}

let game: Phaser.Game | null = null;

// WebGL падает на холсте 0×0 (вкладка открыта в фоне) — ждём, пока у окна появится размер
function startGame(): void {
  if (window.innerWidth < 1 || window.innerHeight < 1) {
    setTimeout(startGame, 100);
    return;
  }
  worldScene = new WorldScene(() => state, frame);
  game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: 'game',
    backgroundColor: '#1c1916',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    pixelArt: true,
    scene: [worldScene, new OverlayScene(() => state)],
  });
}
startGame();

// Для отладки из консоли
Object.assign(window, {
  keeper: {
    get state() {
      return state;
    },
    set state(s: State) {
      state = s;
    },
    get game() {
      return game;
    },
  },
});
