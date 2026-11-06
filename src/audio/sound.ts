// Процедурный звук (Web Audio): без файлов, тихо и по делу.

import type { SimEvent } from '../sim';

const KEY = 'elephant-keeper:muted';

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private _muted = false;
  private last = new Map<string, number>();

  constructor() {
    try {
      this._muted = localStorage.getItem(KEY) === '1';
    } catch {
      this._muted = false;
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  toggle(): boolean {
    this._muted = !this._muted;
    try {
      localStorage.setItem(KEY, this._muted ? '1' : '0');
    } catch {
      // хранилище недоступно — настройка живёт до перезагрузки
    }
    if (this.master) this.master.gain.value = this._muted ? 0 : 0.6;
    return this._muted;
  }

  // Браузер разрешает звук только после жеста пользователя
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      return;
    }
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  private throttle(key: string, ms: number): boolean {
    const now = performance.now();
    if ((this.last.get(key) ?? 0) + ms > now) return false;
    this.last.set(key, now);
    return true;
  }

  private tone(freq: number, dur: number, o: { type?: OscillatorType; gain?: number; to?: number; delay?: number; vibrato?: number } = {}): void {
    const ac = this.ctx;
    if (!ac || !this.master || this._muted) return;
    const t0 = ac.currentTime + (o.delay ?? 0);
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    if (o.vibrato) {
      const lfo = ac.createOscillator();
      const lg = ac.createGain();
      lfo.frequency.value = 7;
      lg.gain.value = o.vibrato;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur);
    }
    const peak = o.gain ?? 0.08;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.04, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, o: { gain?: number; freq?: number; type?: BiquadFilterType; delay?: number } = {}): void {
    const ac = this.ctx;
    if (!ac || !this.master || this._muted) return;
    const t0 = ac.currentTime + (o.delay ?? 0);
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = o.type ?? 'lowpass';
    f.frequency.value = o.freq ?? 1200;
    const g = ac.createGain();
    g.gain.value = o.gain ?? 0.06;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  click(): void {
    this.tone(660, 0.06, { type: 'triangle', gain: 0.04 });
  }

  chime(kind: 'good' | 'warn' | 'bad'): void {
    if (!this.throttle(`chime-${kind}`, 900)) return;
    if (kind === 'good') {
      this.tone(784, 0.18, { gain: 0.04 });
      this.tone(1046, 0.22, { gain: 0.035, delay: 0.09 });
    } else if (kind === 'warn') {
      this.tone(523, 0.2, { gain: 0.045, type: 'triangle' });
      this.tone(440, 0.24, { gain: 0.04, type: 'triangle', delay: 0.14 });
    } else {
      this.tone(349, 0.3, { gain: 0.05, type: 'triangle' });
    }
  }

  event(ev: SimEvent, near: boolean): void {
    switch (ev.kind) {
      case 'rumble':
        if (near && this.throttle('rumble', 1400)) this.tone(78, 0.9, { type: 'sawtooth', gain: 0.05, to: 62, vibrato: 3 });
        break;
      case 'trumpet':
        if (this.throttle('trumpet', 2500)) {
          this.tone(420, 0.55, { type: 'sawtooth', gain: 0.05, to: 640, vibrato: 18 });
          this.tone(840, 0.45, { type: 'square', gain: 0.012, to: 1100 });
        }
        break;
      case 'splash':
      case 'spray':
        if (near && this.throttle('splash', 500)) this.noise(0.35, { freq: 2400, type: 'highpass', gain: 0.04 });
        break;
      case 'shovel':
      case 'rake':
        if (this.throttle('shovel', 200)) this.noise(0.18, { freq: 900, gain: 0.07 });
        break;
      case 'gate':
        this.tone(130, 0.9, { type: 'sawtooth', gain: 0.025, to: 110 });
        this.noise(0.8, { freq: 500, gain: 0.03 });
        break;
      case 'valve':
        this.tone(300, 0.08, { type: 'square', gain: 0.02 });
        break;
      case 'munch':
        if (near && this.throttle('munch', 700)) this.noise(0.08, { freq: 700, gain: 0.025 });
        break;
      case 'chop':
        for (let i = 0; i < 4; i++) this.noise(0.05, { freq: 3000, type: 'highpass', gain: 0.04, delay: i * 0.12 });
        break;
      case 'call':
        this.tone(1250, 0.18, { gain: 0.05, to: 1650 });
        this.tone(1650, 0.22, { gain: 0.04, delay: 0.2, to: 1250 });
        break;
      case 'treat':
      case 'heart':
        this.tone(988, 0.12, { gain: 0.03 });
        break;
      case 'dump':
      case 'hay':
      case 'straw':
        if (this.throttle('dump', 300)) this.noise(0.3, { freq: 600, gain: 0.05 });
        break;
      case 'urine':
        if (near) this.noise(0.6, { freq: 1800, type: 'bandpass', gain: 0.03 });
        break;
      default:
        break;
    }
  }
}

export const sound = new Sound();
