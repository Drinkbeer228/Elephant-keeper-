// Процедурный звук (Web Audio): без файлов, тихо и по делу.
//
// iPhone (Safari): звук включается только из обработчика жеста пользователя. Поэтому unlock()
// вызывается прямо в обработчиках касаний, кликов и клавиш (а не в игровом цикле), создаёт и
// возобновляет AudioContext, проигрывает беззвучный буфер и просит режим «воспроизведение»
// (navigator.audioSession, Safari 16.4+) — тогда звук идёт и при выключенном звонке.
// Микрофон не нужен и не запрашивается.

import type { SimEvent } from '../sim';

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

  // Один слог голоса: пила через две полосы-форманты — получается глухой «гласный» звук
  private syllable(f: number, dur: number, o: { delay: number; gain: number; to?: number; vowel: number }): void {
    const ac = this.ctx;
    if (!ac || !this.master || this._muted || ac.state !== 'running') return;
    const t0 = ac.currentTime + o.delay;
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, t0);
    if (o.to) osc.frequency.linearRampToValueAtTime(o.to, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.gain, t0 + Math.min(0.035, dur * 0.3));
    g.gain.setValueAtTime(o.gain, t0 + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const formants: [number, number, number][] = [
      [600 + 180 * o.vowel, 6, 1],
      [1100 + 550 * o.vowel, 9, 0.55],
    ];
    for (const [freq, q, k] of formants) {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = q;
      const fg = ac.createGain();
      fg.gain.value = k;
      osc.connect(bp);
      bp.connect(fg);
      fg.connect(g);
    }
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // Голос кипера: не слова, а их ритм и интонация — слоги имени и просьбы.
  // Окрик — выше и с подъёмом в конце, «нельзя» — коротко и вниз, похвала — тепло, разговор — вполголоса.
  voice(cue: string, name: string): void {
    if (!this.throttle('voice', 300)) return;
    const syl = Math.max(1, Math.min(4, (name.match(/[аеёиоуыэюяaeiouy]/gi) ?? []).length));
    const plan = voicePlan(cue, syl);
    const base = 150;
    let t = 0;
    plan.forEach(([pitch, dur, loud, glide], i) => {
      this.syllable(base * pitch, dur, { delay: t, gain: 0.32 * loud, to: glide ? base * glide : undefined, vowel: (i * 0.37) % 1 });
      t += dur + 0.03;
    });
  }

  event(ev: SimEvent, near: boolean, nameOf?: (id: string) => string | null): void {
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
      case 'voice':
        this.voice(ev.tag ?? 'name', (ev.elephantId && nameOf?.(ev.elephantId)) || 'слон');
        break;
      case 'shove':
        this.noise(0.25, { freq: 160, gain: 0.12 });
        this.tone(70, 0.3, { gain: 0.05, to: 50 });
        break;
      case 'warn':
        if (near && this.throttle(`warn-${ev.elephantId}`, 2500)) {
          this.noise(0.3, { freq: 900, type: 'bandpass', gain: 0.05 });
          this.tone(90, 0.6, { type: 'sawtooth', gain: 0.035, to: 70, vibrato: 4 });
        }
        break;
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

// [высота ×, длительность с, громкость ×, скольжение ×]
type Syl = [number, number, number, number?];

function voicePlan(cue: string, nameSyl: number): Syl[] {
  const name: Syl[] = Array.from({ length: nameSyl }, (_, i): Syl => [i === 0 ? 1.12 : 1, 0.14, i === 0 ? 1 : 0.8]);
  const with2 = (...rest: Syl[]): Syl[] => [...name, ...rest];
  switch (cue) {
    case 'name': {
      const last = name[name.length - 1];
      name[name.length - 1] = [last[0], 0.24, 0.95, 1.32];
      return name;
    }
    case 'come':
      return with2([1.05, 0.12, 0.8], [1.12, 0.22, 0.9, 1.3]);
    case 'stay':
      return with2([1.0, 0.13, 0.95], [1.02, 0.26, 1, 0.86]);
    case 'move':
      return with2([1.0, 0.11, 0.8], [1.06, 0.11, 0.85], [1.0, 0.2, 0.85, 0.9]);
    case 'follow':
      return with2([1.0, 0.12, 0.8], [1.08, 0.24, 0.9, 1.22]);
    case 'lie':
      return with2([1.05, 0.13, 0.85], [1.0, 0.28, 0.9, 0.82]);
    case 'up':
      return with2([1.0, 0.12, 0.85], [1.1, 0.24, 0.95, 1.28]);
    case 'toilet':
      return with2([1.0, 0.12, 0.85], [1.06, 0.22, 0.85, 0.95]);
    case 'no':
      return [[1.3, 0.11, 1.25], [1.18, 0.2, 1.3, 0.85]];
    case 'back':
      // «Ан-на-рьер!» — назад
      return with2([1.05, 0.1, 0.85], [1.0, 0.1, 0.8], [1.15, 0.26, 1.05, 0.88]);
    case 'go':
      // «Пар-те!» — коротко, вверх
      return with2([1.0, 0.11, 0.95], [1.28, 0.2, 1.15, 1.12]);
    case 'foot':
      return with2([1.05, 0.12, 0.9], [1.0, 0.22, 0.95, 0.86]);
    case 'praise':
      return [[1.05, 0.12, 0.75], [1.2, 0.13, 0.85], [1.12, 0.28, 0.85, 0.92]];
    case 'talk':
      return Array.from({ length: 6 }, (_, i): Syl => [0.92 + 0.08 * Math.sin(i * 1.7), 0.13 + 0.03 * (i % 2), 0.45]);
    default:
      return name;
  }
}

export const sound = new Sound();
