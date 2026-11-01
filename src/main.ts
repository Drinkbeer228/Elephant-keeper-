import Phaser from 'phaser';
import { availableAction, createShift, inspect, tick, type Command, type State } from './sim';
import { Input } from './game/input';
import { WorldScene } from './game/world';
import { Hud } from './ui/hud';

let state: State = createShift(Date.now() % 1_000_000);
let paused = false;
const pending: Command[] = [];
const input = new Input();

const hud = new Hud(document.getElementById('hud')!, input, {
  toggleCheck: (id, value) => pending.push({ type: 'toggleCheck', id, value }),
  accept: () => pending.push({ type: 'acceptShift' }),
  restart: () => location.reload(),
  setPaused: (p) => (paused = p),
});

function frame(dt: number): void {
  for (const press of input.takePresses()) {
    if (press === 'pause') hud.togglePause();
    else if (!hud.introOpen && !paused) pending.push({ type: press });
  }
  if (hud.introOpen || paused) {
    hud.render(state, availableAction(state));
    return;
  }
  const move = input.move();
  if (move.x || move.y) hud.hideInspect();
  const commands: Command[] = [{ type: 'move', dx: move.x, dy: move.y }, ...pending.splice(0)];
  const inspected = commands.some((c) => c.type === 'inspect') ? inspect(state).join('\n') : undefined;
  const events = tick(state, dt, commands);
  if (inspected) hud.showInspect(inspected);
  hud.pushEvents(events, inspected);
  hud.render(state, availableAction(state));
}

// WebGL падает на холсте 0×0 (вкладка открыта в фоне) — ждём, пока у окна появится размер
function startGame(): void {
  if (window.innerWidth < 1 || window.innerHeight < 1) {
    setTimeout(startGame, 100);
    return;
  }
  new Phaser.Game({
    // Пока мир — простые фигуры, Canvas надёжнее WebGL (в части браузеров WebGL падает на старте).
    // Со спрайтами можно вернуть Phaser.AUTO.
    type: Phaser.CANVAS,
    parent: 'game',
    backgroundColor: '#1c1916',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    render: { antialias: true },
    scene: new WorldScene(() => state, frame),
  });
}
startGame();

// Для отладки из консоли
Object.assign(window, { keeper: { get state() { return state; }, set state(s: State) { state = s; } } });
