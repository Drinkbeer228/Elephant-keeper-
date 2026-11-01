// Аудиосинтезатор на чистом Web Audio API
export class SoundFX {
        constructor() {
          this.ctx = null;
          this.muted = false;
        }

        init() {
          if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
              this.ctx = new AudioCtx();
            }
          }
          if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
          }
        }

        toggleMute() {
          this.muted = !this.muted;
          return this.muted;
        }

        // Шаг кипера по соломе/бетону
        playStep() {
          if (this.muted || !this.ctx) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const filter = this.ctx.createBiquadFilter();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(80, this.ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.08);

          filter.type = 'lowpass';
          filter.frequency.value = 350;

          gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start();
          osc.stop(this.ctx.currentTime + 0.08);
        }

        // Скрежет лопаты по полу
        playShovel() {
          if (this.muted || !this.ctx) return;
          const now = this.ctx.currentTime;
          // Белый шум для шороха
          const bufferSize = this.ctx.sampleRate * 0.2;
          const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
          }
          const noise = this.ctx.createBufferSource();
          noise.buffer = buffer;

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(1400, now);
          filter.Q.value = 3.0;

          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

          noise.connect(filter);
          filter.connect(gain);
          gain.connect(this.ctx.destination);

          noise.start(now);
        }

        // Разгрузка тачки / падение тюка сена
        playThud() {
          if (this.muted || !this.ctx) return;
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(140, now);
          osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);

          gain.gain.setValueAtTime(0.25, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(now);
          osc.stop(now + 0.25);
        }

        // Бульканье / всплеск ведра с анализом
        playSplash() {
          if (this.muted || !this.ctx) return;
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(450, now);
          osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
          osc.frequency.exponentialRampToValueAtTime(300, now + 0.25);

          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(now);
          osc.stop(now + 0.25);
        }

        // Трубный звук слона (FM-модуляция для богатого живого рева)
        playElephantTrumpet() {
          if (this.muted || !this.ctx) return;
          const now = this.ctx.currentTime;

          const carrier = this.ctx.createOscillator();
          const modulator = this.ctx.createOscillator();
          const modGain = this.ctx.createGain();
          const mainGain = this.ctx.createGain();
          const filter = this.ctx.createBiquadFilter();

          carrier.type = 'sawtooth';
          modulator.type = 'sine';

          carrier.frequency.setValueAtTime(160, now);
          carrier.frequency.linearRampToValueAtTime(380, now + 0.3);
          carrier.frequency.linearRampToValueAtTime(440, now + 0.6);
          carrier.frequency.exponentialRampToValueAtTime(180, now + 1.1);

          modulator.frequency.setValueAtTime(35, now);
          modGain.gain.setValueAtTime(180, now);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(900, now);
          filter.frequency.linearRampToValueAtTime(2200, now + 0.4);
          filter.frequency.exponentialRampToValueAtTime(400, now + 1.1);

          mainGain.gain.setValueAtTime(0.001, now);
          mainGain.gain.linearRampToValueAtTime(0.3, now + 0.15);
          mainGain.gain.setValueAtTime(0.3, now + 0.7);
          mainGain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);

          modulator.connect(carrier.frequency);
          carrier.connect(filter);
          filter.connect(mainGain);
          mainGain.connect(this.ctx.destination);

          modulator.start(now);
          carrier.start(now);
          modulator.stop(now + 1.15);
          carrier.stop(now + 1.15);
        }

        // Победный аккорд / успешное действие
        playSuccess() {
          if (this.muted || !this.ctx) return;
          const now = this.ctx.currentTime;
          const notes = [440, 554, 659, 880];
          notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.12, now + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.3);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.35);
          });
        }

        // Сигнал тревоги/внимания (нужен анализ мочи)
        playAlert() {
          if (this.muted || !this.ctx) return;
          const now = this.ctx.currentTime;
          [660, 880].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.15, now + idx * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.2);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.15);
            osc.stop(now + idx * 0.15 + 0.25);
          });
        }

        // Звук струи воды и питья
        playWaterFlow() {
          if (this.muted || !this.ctx) return;
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const filter = this.ctx.createBiquadFilter();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(260 + Math.random() * 80, now);
          osc.frequency.linearRampToValueAtTime(190 + Math.random() * 60, now + 0.14);

          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(550, now);
          filter.Q.setValueAtTime(3.5, now);

          gain.gain.setValueAtTime(0.09, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(now);
          osc.stop(now + 0.15);
        }

        // Клаксон грузовика / мусоровоза
        playTruckHorn() {
          if (this.muted || !this.ctx) return;
          const now = this.ctx.currentTime;
          const osc1 = this.ctx.createOscillator();
          const osc2 = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc1.type = 'sawtooth';
          osc2.type = 'sawtooth';
          osc1.frequency.setValueAtTime(220, now);
          osc2.frequency.setValueAtTime(277, now);
          gain.gain.setValueAtTime(0.18, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(this.ctx.destination);
          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.45);
          osc2.stop(now + 0.45);
        }

        // Гидравлический привод мусоровоза
        playHydraulic() {
          if (this.muted || !this.ctx) return;
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(95, now);
          osc.frequency.linearRampToValueAtTime(145, now + 0.45);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.45);
        }

        // Шелест рассыпания древесных опилок при засыпке лужи
        playSawdust() {
          if (this.muted || !this.ctx) return;
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const filter = this.ctx.createBiquadFilter();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(320 + Math.random() * 120, now);
          osc.frequency.exponentialRampToValueAtTime(160, now + 0.12);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(750, now);

          gain.gain.setValueAtTime(0.07, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(now);
          osc.stop(now + 0.12);
        }

        // Взмах / поднятие инвентаря / свист воздуха
        playWhoosh() {
          if (this.muted || !this.ctx) return;
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const filter = this.ctx.createBiquadFilter();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(240, now);
          osc.frequency.exponentialRampToValueAtTime(100, now + 0.14);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(600, now);

          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(now);
          osc.stop(now + 0.14);
        }
      }

export const sfx = new SoundFX();
