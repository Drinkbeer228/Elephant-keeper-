// Котёнок со станции: тот же рисунок, что на Research Station — чёрный «смокинг», белая грудка
// и мордочка, белые «варежки» и кончик хвоста, розовый нос и уши изнутри, светлые глаза, усы.
// Позы — из состояния симуляции: идёт, бежит, сидит и смотрит по сторонам, умывается, спит
// клубком, прячется, охотится на соломинки, сидит на ограде или на дереве.

import Phaser from 'phaser';
import type { State } from '../sim';
import { D } from './ground';
import { PPM } from './textures';

const P = PPM;
// Единица рисунка станции (там котёнок ~30 px) → метры этого мира: котёнок ~0,65 м с хвостом
const S = 0.021 * P;

const FUR = 0x1f2324;
const FUR_LINE = 0x121415;
const HEAD = 0x232729;
const EAR = 0x161819;
const EAR_IN = 0xd89a8e;
const WHITE = 0xf7f5f0;
const MITT = 0xf4f1ea;
const NOSE = 0xd98a7c;
const EYE = 0xe8e4da;
const TAIL = 0x181a1b;

type Pose = 'walk' | 'run' | 'sit' | 'groom' | 'nap' | 'hide' | 'sniff' | 'crouch';

function angTo(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class KittenView {
  readonly root: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Graphics;
  private body: Phaser.GameObjects.Graphics;
  private headBox: Phaser.GameObjects.Container;
  private head: Phaser.GameObjects.Graphics;
  private heading = 0;
  private headTurn = 0;
  private cycle = 0;
  private tailPhase = 0;
  private lastX = 0;
  private lastY = 0;
  private headKey = '';

  constructor(scene: Phaser.Scene, s: State) {
    const k = s.kitten;
    this.shadow = scene.add.graphics().setDepth(D.shadow);
    this.body = scene.add.graphics();
    this.head = scene.add.graphics();
    this.headBox = scene.add.container(5.5 * S, 0, [this.head]);
    this.root = scene.add.container(k.x * P, k.y * P, [this.body, this.headBox]);
    this.heading = k.heading;
    this.lastX = k.x;
    this.lastY = k.y;
  }

  update(s: State, time: number, dt: number): void {
    const k = s.kitten;
    const a = k.act;
    const moved = Math.hypot(k.x - this.lastX, k.y - this.lastY);
    this.lastX = k.x;
    this.lastY = k.y;
    const speed = moved / Math.max(dt, 1e-4);
    this.cycle += moved * 18;
    const running = speed > 2 || (a.kind === 'flee' && speed > 0.3);
    const walking = speed > 0.08;
    let pose: Pose = 'sit';
    if (k.hop || running) pose = 'run';
    else if (walking) pose = 'walk';
    else if (a.kind === 'nap' && a.arrived) pose = 'nap';
    else if (a.kind === 'hide') pose = 'hide';
    else if (a.kind === 'groom') pose = 'groom';
    else if (a.kind === 'sniff' && a.arrived) pose = 'sniff';
    else if (a.kind === 'play') pose = 'crouch';
    this.tailPhase += dt * (pose === 'run' ? 14 : pose === 'walk' ? 9 : pose === 'crouch' ? 11 : 4);

    if (pose === 'walk' || pose === 'run') this.heading += angTo(this.heading, k.heading) * Math.min(1, dt * 12);
    else this.heading += angTo(this.heading, k.heading) * Math.min(1, dt * 4);

    // Куда смотрит: на слониху, на кипера рядом, по сторонам — или на ближайшую слониху, как на станции
    let look = 0;
    const her = a.look && a.look !== 'keeper' ? s.elephants.find((e) => e.id === a.look) : null;
    if (pose === 'sit' || pose === 'hide' || pose === 'crouch') {
      if (her) look = angTo(this.heading, Math.atan2(her.y - k.y, her.x - k.x));
      else if (a.look === 'keeper' || Math.hypot(s.keeper.x - k.x, s.keeper.y - k.y) < 2.5) look = angTo(this.heading, Math.atan2(s.keeper.y - k.y, s.keeper.x - k.x));
      else {
        let near = null as null | { x: number; y: number };
        let nd = 8;
        for (const e of s.elephants) {
          const d = Math.hypot(e.x - k.x, e.y - k.y);
          if (d < nd) {
            nd = d;
            near = e;
          }
        }
        look = near ? angTo(this.heading, Math.atan2(near.y - k.y, near.x - k.x)) : Math.floor(time * 0.7) % 2 === 0 ? 0.5 : -0.5;
      }
    } else if (pose === 'walk') look = Math.sin(time * 1.3) * 0.12;
    look = Math.max(-0.62, Math.min(0.62, look));
    // Умывается: голова повёрнута к лапке
    if (pose === 'groom') look = 0.9 + Math.sin(time * 6) * 0.12;
    this.headTurn += (look - this.headTurn) * Math.min(1, dt * 8);

    // Слой: на дереве — в кроне, на ограде и стене — над ней
    const perch = k.perch;
    const depth = perch?.tree ? D.canopy + 1 : perch ? D.wall + 1 + k.y / 100 : D.actor + k.y / 100;
    const scale = k.hop ? 1.12 : perch?.tree ? 0.92 : 1;
    this.root.setPosition(k.x * P, k.y * P).setRotation(this.heading).setDepth(depth).setScale(scale);

    // Тень (на дереве — не видна)
    const sh = this.shadow;
    sh.clear();
    if (!perch?.tree) {
      sh.fillStyle(0x2c302e, k.hop ? 0.12 : 0.2);
      const w = pose === 'nap' ? 15 : pose === 'run' ? 22 : 18;
      sh.fillEllipse((k.x + 0.04) * P, (k.y + 0.07) * P, w * S, 13 * S);
    }
    sh.setDepth(perch ? depth - 0.001 : D.shadow);

    this.drawBody(pose, time);
    this.drawHead(pose);
  }

  private drawBody(pose: Pose, time: number): void {
    const g = this.body;
    g.clear();
    const paw = pose === 'walk' || pose === 'run' ? Math.sin(this.cycle) * (pose === 'run' ? 5 : 4.2) : 0;
    const wag = Math.sin(this.tailPhase) * (pose === 'crouch' ? 0.25 : 0.42);
    const sitting = pose === 'sit' || pose === 'groom' || pose === 'hide';

    // Хвост: изогнутый, с белым кончиком; спит — обвит вокруг; удирает — трубой, распушён
    if (pose === 'nap') {
      this.curve(g, [-7, 1], [-9, 7], [-2, 10], [5, 7], 3.2);
      this.tip(g, 5, 7);
    } else if (pose === 'run') {
      this.curve(g, [-9, 0], [-12, 0.5 * wag], [-15, -0.5 * wag], [-19, 0], 4.6);
      this.tip(g, -19, 0);
    } else {
      const base = sitting ? -6.5 : -9;
      const r = wag + (sitting ? 0.9 : 0);
      const c = Math.cos(r);
      const sn = Math.sin(r);
      const pt = (x: number, y: number): [number, number] => [base + x * c - y * sn, x * sn + y * c];
      const p3 = pt(-10.5, -1.2);
      this.curve(g, pt(0, 0), pt(-4, -3.5), pt(-7.5, 2.5), p3, pose === 'hide' ? 4 : 3.2);
      this.tip(g, p3[0], p3[1]);
    }

    // Белые лапки-«варежки»
    g.fillStyle(MITT, 1);
    g.lineStyle(1.1 * S, FUR_LINE, 1);
    const mitt = (x: number, y: number, w = 3.2, h = 2.1) => {
      g.fillEllipse(x * S, y * S, w * 2 * S, h * 2 * S);
      g.strokeEllipse(x * S, y * S, w * 2 * S, h * 2 * S);
    };
    if (pose === 'nap') {
      mitt(5.2, 2.6, 2.6, 1.8);
    } else if (sitting || pose === 'crouch' || pose === 'sniff') {
      const lift = pose === 'groom' ? 2.2 + Math.sin(time * 6) * 0.6 : 0;
      mitt(6.5 + lift * 0.4, -3.6 + lift, 3.0, 2.1);
      mitt(6.5, 3.6, 3.0, 2.1);
      if (pose === 'crouch' || pose === 'sniff') {
        mitt(-5, -4.1, 3, 2);
        mitt(-5, 4.1, 3, 2);
      }
    } else {
      mitt(5 + paw, -4.4);
      mitt(5 - paw, 4.4);
      mitt(-5 - paw, -4.1, 3, 2);
      mitt(-5 + paw, 4.1, 3, 2);
    }

    // Чёрное тело
    g.fillStyle(FUR, 1);
    g.lineStyle(1.5 * S, FUR_LINE, 1);
    const ell = (x: number, y: number, rx: number, ry: number) => {
      g.fillEllipse(x * S, y * S, rx * 2 * S, ry * 2 * S);
      g.strokeEllipse(x * S, y * S, rx * 2 * S, ry * 2 * S);
    };
    const breathe = pose === 'nap' ? 1 + Math.sin(time * 2) * 0.03 : 1;
    if (pose === 'nap') ell(0, 0, 7.4 * breathe, 7.0 * breathe);
    else if (pose === 'run') ell(-1, 0, 10.2, 5.4);
    else if (pose === 'hide') ell(-1, 0, 8.4, 7.2);
    else if (pose === 'crouch') ell(-1, 0, 9.4, 6.4);
    else if (sitting) ell(-1, 0, 7.6, 6.6);
    else ell(-1, 0, 9, 6);

    // Белая грудка-«манишка»
    if (pose !== 'nap') {
      g.fillStyle(WHITE, 1);
      g.fillEllipse(4.8 * S, 0, 7.2 * S, 8.6 * S);
    }
  }

  private curve(g: Phaser.GameObjects.Graphics, a: [number, number], b: [number, number], c: [number, number], d: [number, number], width: number): void {
    const V = Phaser.Math.Vector2;
    const bez = new Phaser.Curves.CubicBezier(new V(a[0] * S, a[1] * S), new V(b[0] * S, b[1] * S), new V(c[0] * S, c[1] * S), new V(d[0] * S, d[1] * S));
    g.lineStyle(width * S, TAIL, 1);
    g.strokePoints(bez.getPoints(12));
  }

  private tip(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(WHITE, 1);
    g.fillCircle(x * S, y * S, 1.6 * S);
  }

  private drawHead(pose: Pose): void {
    // Голова: спит — поджата к боку и повёрнута назад; прячется — уши прижаты
    if (pose === 'nap') this.headBox.setPosition(2.2 * S, -3.2 * S).setRotation(2.5).setScale(0.92);
    else if (pose === 'sniff') this.headBox.setPosition(7.2 * S, 0).setRotation(this.headTurn).setScale(0.97);
    else if (pose === 'run') this.headBox.setPosition(7 * S, 0).setRotation(this.headTurn * 0.3).setScale(1);
    else this.headBox.setPosition(5.5 * S, 0).setRotation(this.headTurn).setScale(1);
    const key = pose === 'nap' ? 'sleep' : pose === 'hide' || pose === 'run' ? 'flat' : 'open';
    if (key === this.headKey) return;
    this.headKey = key;
    const g = this.head;
    g.clear();
    const flat = key === 'flat';
    // Уши — острые треугольники, розовые изнутри; прижаты — ниже и шире
    const earTip = flat ? 6.4 : 7.8;
    const earBack = flat ? -3.4 : -2.2;
    g.fillStyle(EAR, 1);
    g.lineStyle(1.2 * S, FUR_LINE, 1);
    for (const sg of [-1, 1]) {
      g.fillTriangle(earBack * S, sg * 3.5 * S, (flat ? -1.2 : 1.2) * S, sg * earTip * S, 3.2 * S, sg * 3.2 * S);
      g.strokeTriangle(earBack * S, sg * 3.5 * S, (flat ? -1.2 : 1.2) * S, sg * earTip * S, 3.2 * S, sg * 3.2 * S);
    }
    g.fillStyle(EAR_IN, 1);
    for (const sg of [-1, 1]) g.fillTriangle(-1 * S, sg * 3.8 * S, (flat ? -0.4 : 1) * S, sg * (earTip - 1.4) * S, 2.2 * S, sg * 3.6 * S);
    // Голова
    g.fillStyle(HEAD, 1);
    g.lineStyle(1.4 * S, FUR_LINE, 1);
    g.fillCircle(0.6 * S, 0, 5.5 * S);
    g.strokeCircle(0.6 * S, 0, 5.5 * S);
    // Белая мордочка и розовый нос
    g.fillStyle(WHITE, 1);
    g.fillEllipse(4.8 * S, 0, 4.4 * S, 4.8 * S);
    g.fillStyle(NOSE, 1);
    g.fillCircle(6.4 * S, 0, 1.25 * S);
    // Усы
    g.lineStyle(0.9 * S, MITT, 0.78);
    g.lineBetween(4.6 * S, -2.2 * S, 5.8 * S, -6.2 * S);
    g.lineBetween(3.8 * S, -2.4 * S, 3.6 * S, -6.4 * S);
    g.lineBetween(4.6 * S, 2.2 * S, 5.8 * S, 6.2 * S);
    g.lineBetween(3.8 * S, 2.4 * S, 3.6 * S, 6.4 * S);
    // Глаза: открыты — светлые точки; спит — щёлочки
    if (key === 'sleep') {
      g.lineStyle(0.8 * S, EYE, 0.8);
      g.lineBetween(2.0 * S, -2.9 * S, 2.9 * S, -1.7 * S);
      g.lineBetween(2.0 * S, 2.9 * S, 2.9 * S, 1.7 * S);
    } else {
      g.fillStyle(EYE, 1);
      const r = flat ? 1.45 : 1.2;
      g.fillCircle(2.5 * S, -2.3 * S, r * S);
      g.fillCircle(2.5 * S, 2.3 * S, r * S);
    }
  }

  destroy(): void {
    this.root.destroy();
    this.shadow.destroy();
  }
}
