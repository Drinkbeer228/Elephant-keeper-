// Клавиатура и экранный стик сводятся в вектор движения и очередь команд.

export type Press =
  | { kind: 'action' }
  | { kind: 'choice'; index: number }
  | { kind: 'drop' }
  | { kind: 'inspect' }
  | { kind: 'journal' }
  | { kind: 'pause' }
  | { kind: 'mute' }
  | { kind: 'speed' }
  | { kind: 'zoom'; dir: 1 | -1 }
  | { kind: 'overview' }
  | { kind: 'recenter' }
  | { kind: 'names' };

export class Input {
  private keys = new Set<string>();
  private queue: Press[] = [];
  stick = { x: 0, y: 0 };
  stickRun = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      this.keys.add(e.code);
      if (e.repeat) return;
      const map: Record<string, Press> = {
        Space: { kind: 'action' },
        KeyE: { kind: 'action' },
        Enter: { kind: 'action' },
        KeyQ: { kind: 'drop' },
        KeyI: { kind: 'inspect' },
        KeyJ: { kind: 'journal' },
        KeyP: { kind: 'pause' },
        Escape: { kind: 'pause' },
        KeyM: { kind: 'mute' },
        KeyT: { kind: 'speed' },
        Equal: { kind: 'zoom', dir: 1 },
        NumpadAdd: { kind: 'zoom', dir: 1 },
        Minus: { kind: 'zoom', dir: -1 },
        NumpadSubtract: { kind: 'zoom', dir: -1 },
        Tab: { kind: 'overview' },
        KeyC: { kind: 'recenter' },
        KeyN: { kind: 'names' },
      };
      const p = map[e.code];
      if (p) this.queue.push(p);
      const digit = /^(Digit|Numpad)([1-6])$/.exec(e.code);
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

  move(): { x: number; y: number } {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    if (x || y) return { x, y };
    return { ...this.stick };
  }

  running(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.stickRun;
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
