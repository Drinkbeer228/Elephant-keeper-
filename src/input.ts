// Клавиатура и экранный стик сводятся в вектор движения и очередь команд.
// Раскладка настраивается в меню паузы и хранится в браузере игрока.

export type BindAction =
  | 'action'
  | 'panel'
  | 'drop'
  | 'inspect'
  | 'journal'
  | 'pause'
  | 'mute'
  | 'speed'
  | 'zoomIn'
  | 'zoomOut'
  | 'overview'
  | 'recenter'
  | 'names'
  | 'run'
  | 'up'
  | 'down'
  | 'left'
  | 'right';

export type Press =
  | { kind: 'action' }
  | { kind: 'choice'; index: number }
  | { kind: 'panel' }
  | { kind: 'drop' }
  | { kind: 'inspect' }
  | { kind: 'journal' }
  | { kind: 'pause' }
  | { kind: 'mute' }
  | { kind: 'speed' }
  | { kind: 'zoom'; dir: 1 | -1 }
  | { kind: 'overview' }
  | { kind: 'recenter' }
  | { kind: 'names' }
  | { kind: 'prep'; side: 'L' | 'R' };

export const BIND_LABEL: Record<BindAction, string> = {
  action: 'Главное действие',
  panel: 'Все действия рядом',
  drop: 'Положить вещь',
  inspect: 'Осмотр ближайшего слона',
  journal: 'Журнал смены',
  pause: 'Пауза и меню',
  mute: 'Звук вкл/выкл',
  speed: 'Скорость времени',
  zoomIn: 'Приблизить',
  zoomOut: 'Отдалить',
  overview: 'Обзор территории',
  recenter: 'Камера к киперу',
  names: 'Имена над слонами',
  run: 'Бежать (держать)',
  up: 'Идти вверх',
  down: 'Идти вниз',
  left: 'Идти влево',
  right: 'Идти вправо',
};

export const DEFAULT_BINDS: Record<BindAction, string[]> = {
  action: ['KeyE', 'Space', 'Enter'],
  panel: ['KeyQ'],
  drop: ['KeyG'],
  inspect: ['KeyI'],
  journal: ['KeyJ'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
  speed: ['KeyT'],
  zoomIn: ['Equal', 'NumpadAdd'],
  zoomOut: ['Minus', 'NumpadSubtract'],
  overview: ['Tab'],
  recenter: ['KeyC'],
  names: ['KeyN'],
  run: ['ShiftLeft', 'ShiftRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

const KEY = 'elephant-keeper:keys';

export function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'Пробел',
    Enter: 'Enter',
    Escape: 'Esc',
    Tab: 'Tab',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Equal: '+',
    Minus: '−',
    NumpadAdd: 'Num +',
    NumpadSubtract: 'Num −',
  };
  return map[code] ?? code;
}

export class Input {
  private keys = new Set<string>();
  private queue: Press[] = [];
  stick = { x: 0, y: 0 };
  stickRun = false;
  binds: Record<BindAction, string[]> = loadBinds();
  // Пока открыта нарезка, стрелки и A/D — левая и правая рука
  prepMode = false;
  // Перехват следующей клавиши для переназначения
  private capture: ((code: string) => void) | null = null;
  // Вызывается прямо в обработчике нажатия: браузер разрешает звук только в нём
  onGesture: () => void = () => undefined;

  constructor() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      this.onGesture();
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture;
        this.capture = null;
        cb(e.code);
        return;
      }
      this.keys.add(e.code);
      if (e.repeat) return;
      const is = (a: BindAction) => this.binds[a].includes(e.code);
      if (this.prepMode) {
        if (is('left') || e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'Space') this.queue.push({ kind: 'prep', side: 'L' });
        else if (is('right') || e.code === 'KeyD' || e.code === 'ArrowRight') this.queue.push({ kind: 'prep', side: 'R' });
        else if (is('pause')) this.queue.push({ kind: 'pause' });
        e.preventDefault();
        return;
      }
      if (is('action')) this.queue.push({ kind: 'action' });
      else if (is('panel')) this.queue.push({ kind: 'panel' });
      else if (is('drop')) this.queue.push({ kind: 'drop' });
      else if (is('inspect')) this.queue.push({ kind: 'inspect' });
      else if (is('journal')) this.queue.push({ kind: 'journal' });
      else if (is('pause')) this.queue.push({ kind: 'pause' });
      else if (is('mute')) this.queue.push({ kind: 'mute' });
      else if (is('speed')) this.queue.push({ kind: 'speed' });
      else if (is('zoomIn')) this.queue.push({ kind: 'zoom', dir: 1 });
      else if (is('zoomOut')) this.queue.push({ kind: 'zoom', dir: -1 });
      else if (is('overview')) this.queue.push({ kind: 'overview' });
      else if (is('recenter')) this.queue.push({ kind: 'recenter' });
      else if (is('names')) this.queue.push({ kind: 'names' });
      const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
      if (digit) this.queue.push({ kind: 'choice', index: Number(digit[2]) - 1 });
      if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  push(p: Press): void {
    this.queue.push(p);
  }

  take(): Press[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  // Ждать следующую клавишу (для переназначения в настройках)
  captureNext(cb: (code: string) => void): void {
    this.capture = cb;
  }

  rebind(action: BindAction, code: string): void {
    // Одна клавиша — одно действие: у прежнего владельца её снимаем
    for (const a of Object.keys(this.binds) as BindAction[]) this.binds[a] = this.binds[a].filter((c) => c !== code);
    this.binds[action] = [code, ...this.binds[action].filter((c) => c !== code)].slice(0, 2);
    saveBinds(this.binds);
  }

  resetBinds(): void {
    this.binds = structuredClone(DEFAULT_BINDS);
    saveBinds(this.binds);
  }

  move(): { x: number; y: number } {
    if (this.prepMode) return { x: 0, y: 0 };
    const k = this.keys;
    const has = (a: BindAction) => this.binds[a].some((c) => k.has(c));
    const x = (has('right') ? 1 : 0) - (has('left') ? 1 : 0);
    const y = (has('down') ? 1 : 0) - (has('up') ? 1 : 0);
    if (x || y) return { x, y };
    return { ...this.stick };
  }

  running(): boolean {
    return this.binds.run.some((c) => this.keys.has(c)) || this.stickRun;
  }

  bindStick(base: HTMLElement, knob: HTMLElement): void {
    let id: number | null = null;
    const update = (e: PointerEvent) => {
      const r = base.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const max = r.width / 2;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      this.stick = len < 8 ? { x: 0, y: 0 } : { x: (dx * k) / max, y: (dy * k) / max };
      this.stickRun = len > max * 1.15;
    };
    const end = () => {
      id = null;
      this.stick = { x: 0, y: 0 };
      this.stickRun = false;
      knob.style.transform = '';
    };
    base.addEventListener('pointerdown', (e) => {
      this.onGesture();
      id = e.pointerId;
      base.setPointerCapture(e.pointerId);
      update(e);
    });
    base.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) update(e);
    });
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
  }
}

function loadBinds(): Record<BindAction, string[]> {
  const out = structuredClone(DEFAULT_BINDS);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return out;
    const saved = JSON.parse(raw) as Partial<Record<BindAction, string[]>>;
    for (const a of Object.keys(out) as BindAction[]) {
      const v = saved[a];
      if (Array.isArray(v) && v.every((c) => typeof c === 'string')) out[a] = v.slice(0, 3);
    }
  } catch {
    // настройки недоступны — стандартная раскладка
  }
  return out;
}

function saveBinds(b: Record<BindAction, string[]>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    // хранилище недоступно — раскладка живёт до перезагрузки
  }
}
