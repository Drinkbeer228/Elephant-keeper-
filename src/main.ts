import Phaser from 'phaser';
import { availableAction, createShift, inspect, tick, type Command, type State } from './sim';
import { Input } from './game/input';
import { WorldScene, type FrameResult } from './game/world';
import { OverlayScene } from './game/overlay';
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
  prepCut: (spot) => pending.push({ type: 'prepCut', spot }),
  prepClose: () => pending.push({ type: 'prepClose' }),
  setPaused: (p) => (paused = p),
});
if (params.has('bot')) hud.closeIntro();
// Телефон свернул игру или погас экран — по возвращении ждёт пауза
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !paused && !hud.introOpen) hud.togglePause();
});

function frame(dt: number): FrameResult {
  const before = availableAction(state);
  for (const press of input.takePresses()) {
    // Окно чистки: Space и кнопка действия режут выбранный дефект, Esc — отойти от стола
    if (state.prep?.open && !hud.introOpen && !paused) {
      if (press === 'action') pending.push({ type: 'prepCut', spot: hud.prepSelected });
      else if (press === 'pause') pending.push({ type: 'prepClose' });
      continue;
    }
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
    } else if (press === 'action' || press === 'interact') {
      if (press === 'interact' && state.barrow.pushed) continue;
      if (hud.menuOpen) hud.closeMenu();
      else if (before?.choices) hud.openMenu(before);
      else pending.push({ type: 'action' });
    } else pending.push({ type: press });
  }
  if (hud.introOpen || paused) {
    hud.render(state, availableAction(state));
    return { actionReady: false };
  }
  // У стола с овощами кипер стоит на месте: стрелки выбирают дефект
  const move = state.prep?.open ? { x: 0, y: 0 } : input.move();
  if (move.x || move.y) {
    hud.hideInspect();
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
    // Мир и отдельная сцена-оверлей (закадровые маркеры): обе читают один state
    scene: [new WorldScene(() => state, frame), new OverlayScene(() => state)],
  });
}
startGame();

// Для отладки из консоли
Object.assign(window, { keeper: { get state() { return state; }, set state(s: State) { state = s; }, get game() { return game; } } });
