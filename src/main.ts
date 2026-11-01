import Phaser from 'phaser';
import { availableAction, createShift, inspect, tick, type Command, type State } from './sim';
import { Input } from './game/input';
import { WorldScene, type FrameResult } from './game/world';
import '@fontsource/press-start-2p';
import { Hud } from './ui/hud';

const params = new URLSearchParams(location.search);
let state: State = createShift(Number(params.get('seed')) || Date.now() % 1_000_000);
// ?bot — смену играет бот (для проверки и демо), ?speed=N — ускорение
const speed = Math.min(20, Math.max(1, Number(params.get('speed')) || 1));
let bot: { frame(): Command[] } | null = null;
if (params.has('bot')) void import('./dev/bot').then((m) => (bot = new m.Bot(state)));
let paused = false;
const pending: Command[] = [];
const input = new Input();

const hud = new Hud(document.getElementById('hud')!, input, {
  restart: () => location.reload(),
  setPaused: (p) => (paused = p),
});
if (params.has('bot')) hud.closeIntro();

function frame(dt: number): FrameResult {
  const before = availableAction(state);
  for (const press of input.takePresses()) {
    if (press === 'pause') {
      if (hud.menuOpen) hud.closeMenu();
      else hud.togglePause();
    } else if (hud.introOpen || paused) continue;
    else if (typeof press === 'number') {
      // Пункт меню: команда уйдёт с номером, симуляция сама найдёт то же меню
      if (hud.menuOpen && before?.choices?.[press]) {
        pending.push({ type: 'action', choice: press });
        hud.closeMenu();
      }
    } else if (press === 'action') {
      if (hud.menuOpen) hud.closeMenu();
      else if (before?.choices) hud.openMenu(before);
      else pending.push({ type: 'action' });
    } else pending.push({ type: press });
  }
  if (hud.introOpen || paused) {
    hud.render(state, availableAction(state));
    return { actionReady: false };
  }
  const move = input.move();
  if (move.x || move.y) {
    hud.hideInspect();
    hud.closeMenu();
  }
  let commands: Command[] = [{ type: 'move', dx: move.x, dy: move.y }, ...pending.splice(0)];
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
  hud.pushEvents(events, inspected);
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
  game = new Phaser.Game({
    // Пока мир — простые фигуры, Canvas надёжнее WebGL (в части браузеров WebGL падает на старте).
    // Со спрайтами можно вернуть Phaser.AUTO.
    type: Phaser.CANVAS,
    parent: 'game',
    backgroundColor: '#1c1916',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    pixelArt: true,
    scene: new WorldScene(() => state, frame),
  });
}
startGame();

// Для отладки из консоли
Object.assign(window, { keeper: { get state() { return state; }, set state(s: State) { state = s; }, get game() { return game; } } });
