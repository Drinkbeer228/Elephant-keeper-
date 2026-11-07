// Лёгкие эффекты: брызги, пыль, сердечки, кольца звука. Только для глаз — на симуляцию не влияют.

import Phaser from 'phaser';
import type { SimEvent } from '../sim';
import { D } from './ground';
import { C, hex } from './palette';
import { ART_SCALE, PPM } from './textures';

const P = PPM;

interface Particle {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  vz: number; // «высота» для дуги
  z: number;
  life: number;
  max: number;
  grav: number;
  spin: number;
  fade: boolean;
}

interface Ring {
  x: number;
  y: number;
  t: number;
  dur: number;
  r0: number;
  r1: number;
  color: number;
  width: number;
}

export class Fx {
  private pool: Particle[] = [];
  private live: Particle[] = [];
  private rings: Ring[] = [];
  private g: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(D.bubble - 1);
  }

  private spawn(key: string, x: number, y: number, o: Partial<Particle> & { tint?: number; scale?: number } = {}): void {
    let p = this.pool.pop();
    if (!p) {
      p = { img: this.scene.add.image(0, 0, key), vx: 0, vy: 0, vz: 0, z: 0, life: 0, max: 1, grav: 0, spin: 0, fade: true };
    }
    p.img.setTexture(key).setVisible(true).setAlpha(1).setDepth(D.bubble - 2).setScale(ART_SCALE * (o.scale ?? 1)).setRotation(0);
    if (o.tint !== undefined) p.img.setTint(o.tint);
    else p.img.clearTint();
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.vz = o.vz ?? 0;
    p.z = 0;
    p.life = 0;
    p.max = o.max ?? 1;
    p.grav = o.grav ?? 0;
    p.spin = o.spin ?? 0;
    p.fade = o.fade ?? true;
    p.img.setPosition(x * P, y * P);
    (p.img as unknown as { wx: number; wy: number }).wx = x;
    (p.img as unknown as { wx: number; wy: number }).wy = y;
    this.live.push(p);
  }

  private burst(x: number, y: number, n: number, tint: number, speed: number, up: number, max = 0.7, scale = 0.6): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.spawn('fx-dot', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vz: up * (0.5 + Math.random()), grav: 9, max: max * (0.7 + Math.random() * 0.6), tint, scale: scale * (0.6 + Math.random() * 0.6) });
    }
  }

  private ring(x: number, y: number, color: string, r0: number, r1: number, dur: number, width = 0.05): void {
    this.rings.push({ x, y, t: 0, dur, r0, r1, color: hex(color), width });
  }

  handle(ev: SimEvent): void {
    const { x, y } = ev;
    if (ev.kind.startsWith('stomp:')) {
      // Топнула: облачко пыли и глухой круг
      this.burst(x, y + 0.3, 8, hex('#cdb88f'), 1.2, 1.2, 0.6, 0.7);
      this.ring(x, y, C.inkSoft, 0.8, 1.8, 0.45, 0.05);
      return;
    }
    switch (ev.kind) {
      case 'rumbleLow':
        this.ring(x, y, C.inkSoft, 0.8, 1.9, 1.0, 0.035);
        break;
      case 'beg':
        this.ring(x, y, C.terracottaSoft, 0.4, 1.2, 0.6, 0.04);
        break;
      case 'toss':
      case 'hayGrab':
        this.burst(x, y, 10, hex(C.hay), 1.1, 3.0, 0.9, 0.7);
        break;
      case 'shake':
        this.burst(x, y, 6, hex(C.leaf), 1.6, 2.4, 0.9, 0.8);
        break;
      case 'fruitFall':
        this.burst(x, y, 6, hex('#c8463a'), 2.2, 1.6, 0.7, 0.9);
        break;
      case 'chew':
        this.burst(x, y, 3, hex(C.sageMid), 0.6, 1.0, 0.5, 0.5);
        break;
      case 'hoseCut':
        this.burst(x, y, 18, hex(C.waterLight), 2.6, 3.0, 0.9, 0.6);
        this.ring(x, y, C.terracotta, 0.4, 1.6, 0.6, 0.05);
        break;
      case 'tub':
      case 'stumble':
        this.burst(x, y, 4, hex('#cdb88f'), 0.8, 0.8, 0.5, 0.6);
        break;
      case 'crack':
        this.burst(x, y, 12, hex(C.plastic), 2.0, 2.0, 0.7, 0.7);
        this.ring(x, y, C.terracotta, 0.4, 1.4, 0.5, 0.05);
        break;
      case 'kick':
        this.burst(x, y, 10, hex('#cdb88f'), 1.6, 1.6, 0.6, 0.8);
        this.ring(x, y, C.terracotta, 1.0, 3.0, 0.7, 0.06);
        break;
      case 'foam':
        for (let i = 0; i < 6; i++) this.spawn('fx-dot', x + (Math.random() - 0.5) * 1.4, y + (Math.random() - 0.5) * 0.8, { vy: -0.2, vz: 0.6, grav: 0, max: 1.2, scale: 1.2, tint: 0xffffff });
        break;
      case 'brush':
      case 'sweep':
        this.burst(x, y, 6, hex('#d8c48e'), 0.9, 1.0, 0.5, 0.5);
        break;
      case 'mop':
      case 'wring':
      case 'wash':
      case 'pour':
        this.burst(x, y, 6, hex(C.waterLight), 1.0, 1.2, 0.5, 0.5);
        break;
      case 'sawdust':
        this.burst(x, y, 12, hex('#efe0bd'), 1.2, 1.6, 0.7, 0.6);
        break;
      case 'tank':
        this.ring(x, y, '#d8c04e', 0.15, 0.7, 0.7, 0.05);
        break;
      case 'tankPlace':
      case 'tubPlace':
      case 'hook':
      case 'stow':
      case 'reel':
        this.ring(x, y, C.sageMid, 0.2, 0.8, 0.5, 0.04);
        break;
      case 'sniff':
        this.ring(x, y, C.sageMid, 0.4, 1.0, 0.6, 0.04);
        break;
      case 'bamboo':
        this.burst(x, y, 6, hex('#8fae58'), 1.0, 1.4, 0.6, 0.6);
        break;
      case 'urine':
        this.burst(x, y, 10, hex('#e7d27a'), 0.8, 1.2, 0.5, 0.5);
        break;
      case 'drain':
        this.ring(x, y, C.waterLight, 0.2, 0.9, 0.8);
        break;
      case 'dung':
      case 'shovel':
      case 'rake':
        this.burst(x, y, 6, hex(C.dung), 0.9, 1.4, 0.5, 0.6);
        break;
      case 'splash':
        this.burst(x, y, 8, hex(C.waterLight), 1.6, 2.6, 0.7, 0.7);
        break;
      case 'spray':
        this.burst(x, y, 16, hex(C.waterLight), 2.2, 2.2, 0.8, 0.6);
        break;
      case 'dustThrow':
        this.burst(x, y, 7, hex('#dcc89c'), 1.4, 3.2, 0.9, 0.9);
        break;
      case 'hay':
      case 'straw':
        this.burst(x, y, 10, hex(C.hay), 1.2, 1.6, 0.7, 0.6);
        break;
      case 'produce':
      case 'scatter':
        this.burst(x, y, 10, hex(C.produceOrange), 1.6, 2.2, 0.7, 0.6);
        break;
      case 'browse':
        this.burst(x, y, 8, hex(C.leaf), 1.4, 2.0, 0.7, 0.7);
        break;
      case 'treat':
      case 'heart':
        for (let i = 0; i < 3; i++) this.spawn('fx-heart', x + (Math.random() - 0.5) * 0.6, y - 1.6, { vy: -0.6, max: 1.4, scale: 1, vx: (Math.random() - 0.5) * 0.3 });
        break;
      case 'snore':
        this.spawn('fx-z', x + 0.8, y - 0.8, { vy: -0.45, vx: 0.2, max: 2.2, scale: 1.1 });
        break;
      case 'rumble':
        this.ring(x, y, C.inkSoft, 1.0, 2.6, 1.2, 0.04);
        break;
      case 'trumpet':
        this.ring(x, y, C.terracotta, 1.0, 3.6, 1.0, 0.06);
        this.ring(x, y, C.terracotta, 0.8, 2.6, 0.8, 0.04);
        break;
      case 'greet':
      case 'spar':
        this.spawn('fx-heart', x, y - 0.8, { vy: -0.5, max: 1.1, scale: 0.7 });
        break;
      case 'voice':
        // Голос кипера: мягкие круги от него
        this.ring(x, y, C.sage, 0.3, 2.0, 0.8, 0.04);
        this.ring(x, y, C.sage, 0.2, 1.3, 0.6, 0.03);
        break;
      case 'warn':
        // Предупреждает: уши в стороны — короткий тревожный круг
        this.ring(x, y, C.terracotta, 0.8, 2.2, 0.5, 0.05);
        break;
      case 'shove':
        this.burst(x, y, 6, hex('#cdb88f'), 1.0, 1.0, 0.5, 0.6);
        this.ring(x, y, C.terracotta, 0.4, 1.6, 0.5, 0.06);
        break;
      case 'refuse':
        this.ring(x, y, C.inkSoft, 0.6, 1.4, 0.6, 0.04);
        break;
      case 'drink':
        this.ring(x, y, C.waterLight, 0.1, 0.7, 0.8, 0.04);
        break;
      case 'ball':
        this.burst(x, y, 4, hex('#dcc89c'), 0.8, 0.8, 0.5, 0.6);
        break;
      case 'answered':
        this.spawn('fx-heart', x, y - 1.9, { vy: -0.5, max: 1.3, scale: 1 });
        break;
      default:
        break;
    }
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life += dt;
      const w = p.img as unknown as { wx: number; wy: number };
      w.wx += p.vx * dt;
      w.wy += p.vy * dt;
      p.vz -= p.grav * dt;
      p.z = Math.max(0, p.z + p.vz * dt);
      p.img.setPosition(w.wx * P, (w.wy - p.z * 0.4) * P);
      p.img.rotation += p.spin * dt;
      if (p.fade) p.img.setAlpha(Math.max(0, 1 - p.life / p.max));
      if (p.life >= p.max || (p.grav > 0 && p.z <= 0 && p.life > 0.15)) {
        p.img.setVisible(false);
        this.live.splice(i, 1);
        this.pool.push(p);
      }
    }
    this.g.clear();
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        this.rings.splice(i, 1);
        continue;
      }
      this.g.lineStyle(r.width * P, r.color, 0.7 * (1 - k));
      this.g.strokeCircle(r.x * P, r.y * P, (r.r0 + (r.r1 - r.r0) * k) * P);
    }
  }
}
