// Процедурный звук (Web Audio): без файлов, тихо и по делу.
//
// iPhone (Safari): звук включается только из обработчика жеста пользователя. Поэтому unlock()
// вызывается прямо в обработчиках касаний, кликов и клавиш (а не в игровом цикле), создаёт и
// возобновляет AudioContext, проигрывает беззвучный буфер и просит режим «воспроизведение»
// (navigator.audioSession, Safari 16.4+) — тогда звук идёт и при выключенном звонке.
// Микрофон не нужен и не запрашивается.

import type { SimEvent, Whistle } from '../sim';

const KEY = 'elephant-keeper:muted';
const VOL = 'elephant-keeper:volume';

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private _muted = false;
  private _volume = 0.8;
  private primed = false;
  private last = new Map<string, number>();

  constructor() {
    try {
      this._muted = localStorage.getItem(KEY) === '1';
      const v = Number(localStorage.getItem(VOL));
      if (Number.isFinite(v) && v > 0 && v <= 1) this._volume = v;
    } catch {
      this._muted = false;
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  get volume(): number {
    return this._volume;
  }

  get state(): string {
    return this.ctx ? this.ctx.state : 'none';
  }

  private applyGain(): void {
    if (this.master) this.master.gain.value = this._muted ? 0 : 0.75 * this._volume;
  }

  toggle(): boolean {
    this._muted = !this._muted;
    try {
      localStorage.setItem(KEY, this._muted ? '1' : '0');
    } catch {
      // хранилище недоступно — настройка живёт до перезагрузки
    }
    this.applyGain();
    return this._muted;
  }

  setVolume(v: number): void {
    this._volume = Math.max(0.05, Math.min(1, v));
    try {
      localStorage.setItem(VOL, String(this._volume));
    } catch {
      // без хранилища — до перезагрузки
    }
    this.applyGain();
  }

  // Браузер разрешает звук только после жеста пользователя — вызывать из обработчика события
  unlock(): void {
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession && nav.audioSession.type !== 'playback') nav.audioSession.type = 'playback';
    } catch {
      // старый Safari — без audioSession
    }
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.applyGain();
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
        return;
      }
    }
    const ac = this.ctx;
    // 'interrupted' — iOS после звонка или сворачивания
    if (ac.state !== 'running') void ac.resume().catch(() => undefined);
    if (!this.primed) {
      try {
        const buf = ac.createBuffer(1, 1, 22050);
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.connect(ac.destination);
        src.start(0);
        this.primed = true;
      } catch {
        // попробуем на следующем жесте
      }
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
    if (!ac || !this.master || this._muted || ac.state !== 'running') return;
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
    if (!ac || !this.master || this._muted || ac.state !== 'running') return;
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

  // Свисток кипера для конкретной слонихи: у каждой своя высота, интервал и ритм
  whistle(w: Whistle): void {
    for (let i = 0; i < w.notes; i++) {
      const up = i % 2 === 0;
      const from = up ? w.f0 : w.f1;
      const to = up ? w.f1 : w.f0;
      this.tone(from, 0.16, { type: w.wave, gain: 0.05, to, delay: i * (0.16 + w.gap) });
    }
  }

  event(ev: SimEvent, near: boolean, whistleOf?: (id: string) => Whistle | null): void {
    if (ev.kind.startsWith('stomp:')) {
      if (near && this.throttle(`stomp-${ev.elephantId}`, 500)) {
        this.noise(0.22, { freq: 180, gain: 0.12 });
        this.tone(58, 0.25, { gain: 0.06, to: 42 });
      }
      return;
    }
    switch (ev.kind) {
      case 'rumble':
        if (near && this.throttle('rumble', 1400)) this.tone(78, 0.9, { type: 'sawtooth', gain: 0.05, to: 62, vibrato: 3 });
        break;
      case 'rumbleLow':
        if (near && this.throttle('rumble', 1600)) this.tone(66, 0.7, { type: 'sawtooth', gain: 0.03, to: 58, vibrato: 2 });
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
      case 'sweep':
        if (this.throttle('shovel', 200)) this.noise(0.18, { freq: 900, gain: 0.07 });
        break;
      case 'mop':
      case 'wring':
      case 'wash':
      case 'pour':
      case 'tank':
        if (this.throttle('water', 300)) this.noise(0.4, { freq: 1600, type: 'bandpass', gain: 0.045 });
        break;
      case 'gate':
        this.tone(130, 0.9, { type: 'sawtooth', gain: 0.025, to: 110 });
        this.noise(0.8, { freq: 500, gain: 0.03 });
        break;
      case 'valve':
      case 'drain':
        this.tone(300, 0.08, { type: 'square', gain: 0.02 });
        break;
      case 'munch':
      case 'chew':
        if (near && this.throttle('munch', 700)) this.noise(0.08, { freq: 700, gain: 0.025 });
        break;
      case 'chop':
        if (this.throttle('chop', 60)) this.noise(0.06, { freq: 3000, type: 'highpass', gain: 0.06 });
        break;
      case 'vegPick':
        this.tone(520, 0.05, { type: 'triangle', gain: 0.025 });
        break;
      case 'vegToss':
        this.noise(0.09, { freq: 400, gain: 0.07 });
        this.tone(180, 0.08, { gain: 0.03 });
        break;
      case 'prepMiss':
        this.tone(160, 0.12, { type: 'triangle', gain: 0.03 });
        break;
      case 'call': {
        const w = ev.elephantId && whistleOf ? whistleOf(ev.elephantId) : null;
        if (w) this.whistle(w);
        else {
          this.tone(1250, 0.18, { gain: 0.05, to: 1650 });
          this.tone(1650, 0.22, { gain: 0.04, delay: 0.2, to: 1250 });
        }
        break;
      }
      case 'treat':
      case 'heart':
        this.tone(988, 0.12, { gain: 0.03 });
        break;
      case 'dump':
      case 'hay':
      case 'straw':
      case 'stow':
        if (this.throttle('dump', 300)) this.noise(0.3, { freq: 600, gain: 0.05 });
        break;
      case 'crack':
        this.noise(0.12, { freq: 3500, type: 'highpass', gain: 0.08 });
        this.noise(0.2, { freq: 900, gain: 0.05, delay: 0.05 });
        break;
      case 'kick':
        this.noise(0.18, { freq: 220, gain: 0.1 });
        break;
      case 'hoseCut':
        this.noise(0.9, { freq: 3000, type: 'highpass', gain: 0.04 });
        break;
      case 'shake':
        if (near && this.throttle('shake', 600)) this.noise(0.45, { freq: 2200, type: 'bandpass', gain: 0.04 });
        break;
      case 'fruitFall':
        for (let i = 0; i < 3; i++) this.noise(0.05, { freq: 300, gain: 0.05, delay: i * 0.11 });
        break;
      case 'tub':
        if (near && this.throttle('tub', 400)) this.tone(240, 0.09, { type: 'triangle', gain: 0.03, to: 200 });
        break;
      case 'openJournal':
        this.noise(0.15, { freq: 2600, type: 'bandpass', gain: 0.03 });
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
