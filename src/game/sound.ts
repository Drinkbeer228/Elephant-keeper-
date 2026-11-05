// ============================================================================
// Процедурный звуковой движок (Web Audio API).
// Без внешних аудиофайлов: тактильные звуки инвентаря, воды, шагов, топота слонов,
// гудка утренней поставки, мусоровоза и интерфейса. Безопасен в headless-браузере.
// ============================================================================

import type { ShiftEvent } from '../sim';

const MUTE_STORAGE_KEY = 'keeper-sim:muted';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private _muted = false;

  constructor() {
    try {
      if (typeof localStorage !== 'undefined') {
        this._muted = localStorage.getItem(MUTE_STORAGE_KEY) === '1';
      }
    } catch {
      this._muted = false;
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  setMuted(m: boolean): void {
    this._muted = m;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(MUTE_STORAGE_KEY, m ? '1' : '0');
      }
    } catch {
      // ignore
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this._muted);
    if (!this._muted) this.uiClick();
    return this._muted;
  }

  private ac(): AudioContext | null {
    if (this._muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private tone(
    freq: number,
    duration: number,
    opts: {
      type?: OscillatorType;
      gain?: number;
      freqEnd?: number;
      delay?: number;
    } = {},
  ): void {
    const ac = this.ac();
    if (!ac) return;
    try {
      const t0 = ac.currentTime + (opts.delay ?? 0);
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = opts.type ?? 'triangle';
      osc.frequency.setValueAtTime(freq, t0);
      if (opts.freqEnd !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), t0 + duration);
      }
      const peak = Math.max(0.001, Math.min(0.35, opts.gain ?? 0.08));
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.015, duration * 0.25));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.01);
    } catch {
      // ignore audio context errors
    }
  }

  private noise(
    duration: number,
    opts: {
      gain?: number;
      filterFreq?: number;
      filterType?: BiquadFilterType;
      delay?: number;
    } = {},
  ): void {
    const ac = this.ac();
    if (!ac) return;
    try {
      const t0 = ac.currentTime + (opts.delay ?? 0);
      const frames = Math.max(1, Math.floor(ac.sampleRate * duration));
      const buf = ac.createBuffer(1, frames, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < frames; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const src = ac.createBufferSource();
      src.buffer = buf;

      const filter = ac.createBiquadFilter();
      filter.type = opts.filterType ?? 'bandpass';
      filter.frequency.setValueAtTime(opts.filterFreq ?? 900, t0);

      const g = ac.createGain();
      const peak = Math.max(0.001, Math.min(0.3, opts.gain ?? 0.06));
      g.gain.setValueAtTime(peak, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

      src.connect(filter);
      filter.connect(g);
      g.connect(ac.destination);
      src.start(t0);
      src.stop(t0 + duration + 0.01);
    } catch {
      // ignore
    }
  }

  uiClick(): void {
    this.tone(580, 0.045, { type: 'square', gain: 0.04, freqEnd: 420 });
  }

  uiOpen(): void {
    this.tone(440, 0.06, { type: 'triangle', gain: 0.05, freqEnd: 660 });
  }

  vegCut(): void {
    this.noise(0.065, { gain: 0.08, filterFreq: 1400, filterType: 'bandpass' });
    this.tone(240, 0.045, { type: 'triangle', gain: 0.06, freqEnd: 120 });
  }

  stomp(distanceTiles = 3): void {
    const atten = Math.max(0.12, Math.min(1, 1 - distanceTiles / 28));
    this.tone(78, 0.14, { type: 'sine', gain: 0.14 * atten, freqEnd: 34 });
    this.noise(0.07, { gain: 0.04 * atten, filterFreq: 180, filterType: 'lowpass' });
  }

  signalAlert(): void {
    // Выразительный низкий трубный зов слонихи
    this.tone(165, 0.18, { type: 'sawtooth', gain: 0.055, freqEnd: 220 });
    this.tone(220, 0.22, { type: 'triangle', gain: 0.065, freqEnd: 155, delay: 0.16 });
  }

  peeBucket(): void {
    // Звон струи о стенку металлического бака + радостный аккорд
    this.noise(0.22, { gain: 0.06, filterFreq: 1800, filterType: 'bandpass' });
    this.tone(523.25, 0.1, { type: 'triangle', gain: 0.07, delay: 0.08 });
    this.tone(659.25, 0.14, { type: 'triangle', gain: 0.08, delay: 0.17 });
  }

  peeMissed(): void {
    // Глухой плеск на солому
    this.noise(0.24, { gain: 0.07, filterFreq: 650, filterType: 'lowpass' });
    this.tone(190, 0.18, { type: 'sawtooth', gain: 0.05, freqEnd: 110 });
  }

  supplyHorn(): void {
    // Двухтональный гудок грузовика поставки
    this.tone(277.18, 0.26, { type: 'sawtooth', gain: 0.075 });
    this.tone(349.23, 0.26, { type: 'sawtooth', gain: 0.065 });
    this.tone(277.18, 0.36, { type: 'sawtooth', gain: 0.08, delay: 0.32 });
    this.tone(349.23, 0.36, { type: 'sawtooth', gain: 0.07, delay: 0.32 });
  }

  garbageTruck(): void {
    this.noise(0.35, { gain: 0.06, filterFreq: 260, filterType: 'lowpass' });
    this.tone(110, 0.28, { type: 'sawtooth', gain: 0.05, freqEnd: 165, delay: 0.08 });
  }

  musthAlert(): void {
    this.tone(130, 0.22, { type: 'sawtooth', gain: 0.09, freqEnd: 95 });
    this.tone(125, 0.26, { type: 'sawtooth', gain: 0.09, freqEnd: 85, delay: 0.24 });
  }

  shiftComplete(stars: number): void {
    const notes = stars >= 4 ? [392, 493.88, 587.33, 783.99] : stars >= 2 ? [349.23, 440, 523.25] : [293.66, 261.63];
    notes.forEach((n, i) => {
      this.tone(n, 0.2, { type: 'triangle', gain: 0.08, delay: i * 0.12 });
    });
  }

  actionByLabel(label: string): void {
    const l = label.toLowerCase();
    if (l.includes('вылить') || l.includes('промыть') || l.includes('вымыть') || l.includes('замочить') || l.includes('вентиль')) {
      this.noise(0.18, { gain: 0.07, filterFreq: 1200, filterType: 'bandpass' });
      this.tone(340, 0.1, { type: 'sine', gain: 0.05, freqEnd: 480 });
    } else if (l.includes('угостить') || l.includes('лакомство')) {
      this.tone(587.33, 0.09, { type: 'triangle', gain: 0.07 });
      this.tone(880, 0.13, { type: 'triangle', gain: 0.07, delay: 0.08 });
    } else if (l.includes('гуляй')) {
      this.tone(620, 0.1, { type: 'sine', gain: 0.06, freqEnd: 780 });
      this.tone(740, 0.12, { type: 'sine', gain: 0.06, delay: 0.11, freqEnd: 640 });
    } else if (l.includes('солом') || l.includes('сено') || l.includes('опил') || l.includes('вымести') || l.includes('подмести')) {
      this.noise(0.12, { gain: 0.065, filterFreq: 1600, filterType: 'highpass' });
    } else if (l.includes('ворота') || l.includes('свет') || l.includes('позвонить')) {
      this.tone(320, 0.06, { type: 'square', gain: 0.06, freqEnd: 180 });
    } else if (l.includes('кашу') || l.includes('таз') || l.includes('бак')) {
      this.tone(280, 0.07, { type: 'triangle', gain: 0.07, freqEnd: 190 });
    } else {
      this.tone(420, 0.05, { type: 'triangle', gain: 0.05, freqEnd: 310 });
    }
  }

  syncEvents(events: ShiftEvent[]): void {
    for (const ev of events) {
      if (ev.text.includes('просится')) this.signalAlert();
      else if (ev.text.includes('в бак!')) this.peeBucket();
      else if (ev.text.includes('мимо бака') || ev.text.includes('бак полон — мимо')) this.peeMissed();
      else if (ev.text.includes('поставка прибыла')) this.supplyHorn();
      else if (ev.text.includes('Мусоровоз вывез')) this.garbageTruck();
      else if (ev.text.includes('впал в муст')) this.musthAlert();
    }
  }
}

export const sound = new SoundEngine();
