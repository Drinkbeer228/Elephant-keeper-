// Клавиатура и сенсорный джойстик сводятся в один вектор движения и очередь нажатий

export type Press = 'action' | 'inspect' | 'pause';

export class Input {
  private keys = new Set<string>();
  private queue: Press[] = [];
  stick = { x: 0, y: 0 };

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      if (k === 'Space') this.push('action');
      else if (k === 'KeyF') this.push('inspect');
      else if (k === 'KeyP' || k === 'Escape') this.push('pause');
      if (k === 'Space' || k.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  push(p: Press): void {
    this.queue.push(p);
  }

  takePresses(): Press[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  stickBalance = 0; // кнопки ◀ ▶ на телефоне

  // Q / E — выравнивать тюки на тачке
  balance(): -1 | 0 | 1 {
    const k = this.keys;
    const v = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0) || this.stickBalance;
    return v > 0 ? 1 : v < 0 ? -1 : 0;
  }

  move(): { x: number; y: number } {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    if (x === 0 && y === 0) {
      x = this.stick.x;
      y = this.stick.y;
    }
    return { x, y };
  }

  // Джойстик: круг, палец тянет ручку, вектор 0..1
  bindStick(base: HTMLElement, knob: HTMLElement): void {
    let id: number | null = null;
    const radius = () => base.clientWidth / 2;
    const update = (e: PointerEvent) => {
      const r = base.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      const max = radius();
      const k = len > max ? max / len : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      this.stick = len < 6 ? { x: 0, y: 0 } : { x: (dx * k) / max, y: (dy * k) / max };
    };
    const end = () => {
      id = null;
      this.stick = { x: 0, y: 0 };
      knob.style.transform = '';
    };
    base.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      base.setPointerCapture(e.pointerId);
      update(e);
    });
    base.addEventListener('pointermove', (e) => e.pointerId === id && update(e));
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
  }
}
