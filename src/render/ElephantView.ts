// Слон на экране: корпус, голова и уши — текстуры; хобот, хвост и ноги рисуются каждый кадр.
// Поза и анимация читаются из состояния симуляции — сама отрисовка ничего не решает.

import Phaser from 'phaser';
import { labelScale } from './labels';
import { headPos, signalClarity, type Elephant, type State } from '../sim';
import { STATIONS, TIRE, DRUM } from '../data/facility';
import { bodyGeom, ELEPHANT_INK, rnd } from './art';
import { D } from './ground';
import { C, hex, mix, shade } from './palette';
import { ART_SCALE, originOf, PPM } from './textures';

const P = PPM;

interface TrunkPose {
  reach: number; // длина видимой части, м
  side: number; // поворот от оси головы, рад
  curl: number; // изгиб
  raise: number; // поднят вверх-назад, 0..1
}

const BUBBLE: Record<string, string> = {
  toilet: 'bubble-drop',
  out: 'bubble-door',
  in: 'bubble-house',
  food: 'bubble-hay',
  water: 'bubble-water',
  attention: 'bubble-heart',
};

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function angLerp(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export class ElephantView {
  readonly root: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Image;
  private feet: Phaser.GameObjects.Graphics;
  private tail: Phaser.GameObjects.Graphics;
  private body: Phaser.GameObjects.Image;
  private dustCoat: Phaser.GameObjects.Image;
  private lyingBody: Phaser.GameObjects.Image;
  private headGroup: Phaser.GameObjects.Container;
  private headImg: Phaser.GameObjects.Image;
  private earL: Phaser.GameObjects.Image;
  private earR: Phaser.GameObjects.Image;
  private trunk: Phaser.GameObjects.Graphics;
  private ripple: Phaser.GameObjects.Graphics;
  private skinFx: Phaser.GameObjects.Graphics;
  private headFx: Phaser.GameObjects.Graphics;
  private tuft: Phaser.GameObjects.Image;
  private stompFoot = -1;
  private stompT = 0;
  private skinKey = '';
  readonly name: Phaser.GameObjects.Image;
  private bubble: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Graphics;
  private geom: ReturnType<typeof bodyGeom>;
  private walkPhase = 0;
  private lastX = 0;
  private lastY = 0;
  private heading = 0;
  private lieK = 0; // 0 — стоит, 1 — лежит
  private pose: TrunkPose = { reach: 0.5, side: 0, curl: 0.3, raise: 0 };
  private ears = 0.3; // 0 — прижаты, 1 — растопырены
  private headTurn = 0;
  private seed: number;
  private skin: string;
  selected = false;

  constructor(scene: Phaser.Scene, e: Elephant) {
    const id = e.id;
    this.geom = bodyGeom(e.profile.look);
    this.seed = (e.profile.look.seed % 1000) / 100;
    this.skin = e.profile.look.skin;
    const img = (key: string) => {
      const o = originOf(key);
      return scene.add.image(0, 0, key).setOrigin(o.ox, o.oy).setScale(ART_SCALE);
    };
    this.ring = scene.add.graphics().setDepth(D.shadow - 1);
    this.shadow = img(`el-shadow-${id}`).setDepth(D.shadow);
    this.ripple = scene.add.graphics();
    this.feet = scene.add.graphics();
    this.tail = scene.add.graphics();
    this.body = img(`el-body-${id}`);
    this.dustCoat = img(`el-body-${id}`).setTintFill(hex('#e8d5aa')).setAlpha(0);
    this.lyingBody = img(`el-lying-${id}`).setVisible(false);
    this.earL = img(`el-earL-${id}`);
    this.earR = img(`el-earR-${id}`);
    this.headImg = img(`el-head-${id}`);
    this.trunk = scene.add.graphics();
    this.skinFx = scene.add.graphics();
    this.headFx = scene.add.graphics();
    this.tuft = img('hay-tuft').setVisible(false);
    const R = this.geom.headR;
    this.earL.setPosition(-R * 0.05 * P, -R * 0.78 * P);
    this.earR.setPosition(-R * 0.05 * P, R * 0.78 * P);
    this.headGroup = scene.add.container(this.geom.headX * P, 0, [this.earL, this.earR, this.headImg, this.headFx, this.trunk, this.tuft]);
    this.root = scene.add.container(e.x * P, e.y * P, [this.ripple, this.feet, this.tail, this.body, this.dustCoat, this.lyingBody, this.skinFx, this.headGroup]);
    this.name = img(`el-name-${id}`).setDepth(D.label).setScale(ART_SCALE * 0.85);
    this.bubble = img('bubble-dots').setDepth(D.bubble).setVisible(false);
    this.heading = e.heading;
    this.lastX = e.x;
    this.lastY = e.y;
  }

  // Сигнал «топаю ногой»: какая нога — личная привычка
  stomp(foot: string): void {
    this.stompFoot = foot === 'FR' ? 0 : foot === 'FL' ? 1 : foot === 'HR' ? 2 : 3;
    this.stompT = 0.6;
  }

  update(e: Elephant, s: State, time: number, dt: number, showNames: boolean): void {
    const t = time + this.seed;
    this.stompT = Math.max(0, this.stompT - dt);
    const a = e.act;
    const moved = Math.hypot(e.x - this.lastX, e.y - this.lastY);
    this.lastX = e.x;
    this.lastY = e.y;
    this.walkPhase += moved * 3.2 / e.profile.look.size;
    this.heading = angLerp(this.heading, e.heading, Math.min(1, dt * 12));
    // Захмелевшую слегка покачивает
    const sway = e.tipsy > 0.05 ? Math.sin(t * 2.1) * 0.07 * e.tipsy : 0;
    this.root.setPosition(e.x * P, e.y * P).setRotation(this.heading + sway).setDepth(D.actor + e.y / 100);
    this.lieK = lerp(this.lieK, e.lying ? 1 : 0, Math.min(1, dt * 2.5));
    const lying = this.lieK > 0.5;
    this.body.setVisible(!lying);
    this.dustCoat.setVisible(!lying);
    this.lyingBody.setVisible(lying);
    this.feet.setVisible(!lying);

    // --- цели позы по занятию -------------------------------------------
    const walking = moved > 0.002;
    let want: TrunkPose = { reach: 0.95 + Math.sin(t * 0.7) * 0.06, side: Math.sin(t * 0.5) * 0.22, curl: 0.45, raise: 0 };
    let ears = 0.25 + Math.max(0, Math.sin(t * 0.9)) * 0.15;
    let headTurn = Math.sin(t * 0.31) * 0.12;
    let tailSwing = Math.sin(t * 1.6) * 0.35;
    let tailRaise = 0;
    let bob = 0;
    const local = (p: { x: number; y: number }) => {
      // Точка мира → направление от головы в системе головы
      const hp = headPos(e, 1.25);
      const ang = Math.atan2(p.y - hp.y, p.x - hp.x) - this.heading;
      const d = Math.hypot(p.x - hp.x, p.y - hp.y);
      return { ang: Math.atan2(Math.sin(ang), Math.cos(ang)), d };
    };
    if (walking) {
      want = { reach: 1.0, side: Math.sin(this.walkPhase * 0.5) * 0.3, curl: 0.35, raise: 0 };
      ears = 0.3 + Math.abs(Math.sin(this.walkPhase * 0.5)) * 0.25;
      tailSwing = Math.sin(this.walkPhase * 0.5) * 0.5;
      bob = Math.sin(this.walkPhase) * 0.012;
      headTurn *= 0.4;
    }
    if (a.phase === 'do' && !walking) {
      switch (a.kind) {
        case 'eat': {
          const target = foodPoint(s, e);
          const cyc = (Math.sin(t * 2.2) + 1) / 2;
          if (target) {
            const l = local(target);
            want = { reach: lerp(0.45, Math.min(1.7, l.d + 0.2), cyc), side: l.ang * (0.4 + 0.6 * cyc), curl: lerp(0.9, 0.15, cyc), raise: 0 };
            headTurn = Math.max(-0.4, Math.min(0.4, l.ang * 0.5));
          } else want = { reach: lerp(0.5, 1.2, cyc), side: Math.sin(t) * 0.4, curl: 0.5, raise: 0 };
          ears = 0.2 + cyc * 0.15;
          break;
        }
        case 'drink': {
          const cyc = (Math.sin(t * 1.4) + 1) / 2;
          want = cyc > 0.5 ? { reach: 1.3, side: 0, curl: 0.1, raise: 0 } : { reach: 0.5, side: 0.2, curl: 0.8, raise: 0.6 * (0.5 - cyc) * 2 };
          ears = 0.25;
          break;
        }
        case 'signal': {
          if (e.profile.habits.signal === 'beg' && (a.signal === 'attention' || a.signal === 'food')) {
            const l = local(s.keeper);
            want = { reach: 1.6 + Math.sin(t * 5) * 0.15, side: l.ang * 0.8, curl: Math.sin(t * 4) * 0.5, raise: 0 };
            ears = 0.8;
          } else if (a.signal === 'attention') {
            const l = local(s.keeper);
            want = { reach: 1.5 + Math.sin(t * 3) * 0.1, side: l.ang * 0.8, curl: 0.1 + Math.sin(t * 2) * 0.15, raise: 0 };
            ears = 0.75;
          } else {
            const pump = (Math.sin(t * 2.4) + 1) / 2;
            want = { reach: 0.7, side: Math.sin(t * 1.3) * 0.3, curl: 0.4, raise: 0.4 + pump * 0.5 * signalClarity(e) };
            ears = 0.55 + 0.4 * signalClarity(e) * (0.6 + 0.4 * Math.sin(t * 4));
            headTurn = Math.sin(t * 1.2) * 0.18;
            if (a.signal === 'toilet') tailRaise = 0.5;
          }
          break;
        }
        case 'play': {
          want = { reach: 1.0 + Math.sin(t * 3.4) * 0.4, side: Math.sin(t * 2.6) * 0.8, curl: Math.sin(t * 2) * 0.7, raise: Math.max(0, Math.sin(t * 1.7)) * 0.5 };
          ears = 0.5 + Math.abs(Math.sin(t * 5)) * 0.45;
          tailSwing = Math.sin(t * 6) * 0.7;
          headTurn = Math.sin(t * 2.1) * 0.25;
          break;
        }
        case 'bathe': {
          const spray = (Math.sin(t * 0.9) + 1) / 2;
          want = { reach: 0.8, side: Math.sin(t * 0.7) * 0.6, curl: 0.6, raise: spray > 0.6 ? 0.9 : 0.1 };
          ears = 0.6 + Math.sin(t * 3) * 0.3;
          break;
        }
        case 'dust': {
          const cyc = (Math.sin(t * 3) + 1) / 2;
          want = { reach: 0.7, side: cyc > 0.5 ? 1.3 : 0.2, curl: 0.9, raise: cyc };
          ears = 0.45;
          break;
        }
        case 'warn': {
          // Предупреждает: уши растопырены, голова к киперу, мотает ею, хобот свёрнут
          const l = local(s.keeper);
          want = { reach: 0.6, side: Math.max(-1, Math.min(1, l.ang)) * 0.5, curl: 0.85, raise: 0.25 };
          ears = 1;
          headTurn = Math.max(-0.4, Math.min(0.4, l.ang * 0.5)) + Math.sin(t * 7) * 0.22;
          tailSwing = Math.sin(t * 5) * 0.6;
          tailRaise = 0.4;
          break;
        }
        case 'stay':
        case 'walkWith': {
          // Стоит или идёт рядом по просьбе: внимание на кипере, спокойна
          const l = local(s.keeper);
          want = { reach: 0.85, side: Math.max(-1, Math.min(1, l.ang)) * 0.6, curl: 0.4, raise: 0 };
          ears = 0.35;
          headTurn = Math.max(-0.3, Math.min(0.3, l.ang * 0.4));
          break;
        }
        case 'socialize':
        case 'follow':
        case 'seekKeeper': {
          const other = a.kind === 'socialize' && a.target?.t === 'el' ? s.elephants.find((o) => o.id === (a.target as { id: string }).id) : null;
          const p = other ? headPos(other, 1.6) : s.keeper;
          const l = local(p);
          want = { reach: Math.min(1.7, Math.max(0.6, l.d)), side: Math.max(-1, Math.min(1, l.ang)), curl: 0.25 + Math.sin(t * 2.5) * 0.2, raise: 0 };
          ears = 0.5;
          headTurn = Math.max(-0.35, Math.min(0.35, l.ang * 0.4));
          break;
        }
        case 'explore': {
          want = { reach: 1.2 + Math.sin(t * 2.3) * 0.25, side: Math.sin(t * 1.1) * 0.55, curl: Math.sin(t * 3.7) * 0.4, raise: 0 };
          ears = 0.45;
          headTurn = Math.sin(t * 0.9) * 0.3;
          break;
        }
        case 'rest':
          want = { reach: 0.5, side: 0.1, curl: 0.55, raise: 0 };
          ears = 0.08 + Math.max(0, Math.sin(t * 0.4)) * 0.08;
          headTurn = 0;
          tailSwing *= 0.3;
          break;
        case 'sleep':
          want = { reach: 0.9, side: 0.6, curl: 1.0, raise: 0 };
          ears = 0;
          headTurn = 0.25;
          tailSwing = 0;
          break;
        case 'urinate':
        case 'defecate':
          tailRaise = 1;
          want = { reach: 0.55, side: 0.1, curl: 0.4, raise: 0 };
          ears = 0.35;
          break;
        case 'toss': {
          const cyc = (Math.sin(t * 2.6) + 1) / 2;
          want = cyc > 0.55 ? { reach: 0.6, side: 0.4, curl: 0.8, raise: 1 } : { reach: 1.3, side: Math.sin(t) * 0.5, curl: 0.2, raise: 0 };
          ears = 0.45;
          break;
        }
        case 'shake': {
          want = { reach: 1.55, side: Math.sin(t * 9) * 0.18, curl: 0.1, raise: 0.25 + Math.abs(Math.sin(t * 9)) * 0.2 };
          ears = 0.7 + Math.sin(t * 7) * 0.2;
          headTurn = Math.sin(t * 9) * 0.12;
          break;
        }
        case 'manipulate': {
          want = { reach: 1.25 + Math.sin(t * 4) * 0.25, side: Math.sin(t * 3.2) * 0.45, curl: 0.5 + Math.sin(t * 5) * 0.3, raise: 0 };
          ears = 0.55;
          headTurn = Math.sin(t * 2.5) * 0.25;
          break;
        }
        case 'lie':
          want = { reach: 1.0, side: 0.35, curl: 0.6, raise: 0 };
          ears = 0.3;
          headTurn = 0.2;
          tailSwing *= 0.4;
          break;
        case 'pace':
          headTurn = Math.sin(t * 2.4) * 0.35;
          break;
        default:
          break;
      }
    }
    if (a.kind === 'avoid' || (a.kind === 'signal' && a.phase === 'go')) ears = 0.7;
    if (a.kind === 'signal' && a.phase === 'do' && e.profile.habits.signal === 'stare') {
      // Молча смотрит на кипера: уши вперёд, хобот опущен
      const l = local(s.keeper);
      headTurn = Math.max(-0.45, Math.min(0.45, l.ang * 0.6));
      want = { reach: 0.6, side: 0, curl: 0.3, raise: 0 };
      ears = 0.95;
    }
    if (e.trunk.kind) want = { reach: 0.7, side: 0.25, curl: 0.9, raise: 0.15 };
    const k = Math.min(1, dt * 5);
    this.pose = {
      reach: lerp(this.pose.reach, want.reach, k),
      side: lerp(this.pose.side, want.side, k),
      curl: lerp(this.pose.curl, want.curl, k),
      raise: lerp(this.pose.raise, want.raise, k),
    };
    this.ears = lerp(this.ears, ears, Math.min(1, dt * 6));
    this.headTurn = lerp(this.headTurn, headTurn, Math.min(1, dt * 3));

    // --- корпус, уши, голова ---------------------------------------------
    const breath = 1 + Math.sin(t * (lying ? 1.1 : 1.6)) * (lying ? 0.018 : 0.008) + bob;
    this.body.setScale(ART_SCALE * breath, ART_SCALE * (1 + bob * 0.5));
    this.dustCoat.setScale(this.body.scaleX, this.body.scaleY).setAlpha(Math.min(0.55, e.dust * 0.55));
    this.lyingBody.setScale(ART_SCALE * breath);
    const R = this.geom.headR;
    if (lying) {
      this.headGroup.setPosition(this.geom.headX * P * 0.98, 0.32 * P).setRotation(0.38);
      this.earR.setVisible(false);
      this.earL.setVisible(true).setRotation(-0.6).setPosition(-R * 0.15 * P, -R * 0.45 * P);
    } else {
      this.headGroup.setPosition((this.geom.headX + (a.kind === 'eat' && a.phase === 'do' ? 0.06 : 0)) * P, 0).setRotation(this.headTurn);
      this.earR.setVisible(true).setPosition(-R * 0.05 * P, R * 0.78 * P);
      this.earL.setPosition(-R * 0.05 * P, -R * 0.78 * P);
      const fold = lerp(0.18, -0.85, this.ears);
      this.earR.setRotation(fold);
      this.earL.setRotation(-fold);
    }
    // Мокрая кожа заметно темнее; пыль на мокром не держится
    const wet = Math.min(1, e.wet);
    const tint = wet > 0.02 ? Phaser.Display.Color.GetColor(Math.round(255 - 112 * wet), Math.round(255 - 106 * wet), Math.round(255 - 92 * wet)) : 0xffffff;
    for (const im of [this.body, this.lyingBody, this.headImg, this.earL, this.earR]) im.setTint(tint);
    this.dustCoat.setAlpha(Math.min(0.55, e.dust * 0.55) * (1 - wet));
    this.drawSkin(e, lying, t);
    this.tuft.setVisible(!!e.trunk.kind && !lying);

    this.drawFeet(e, walking);
    this.drawTail(tailSwing, tailRaise, lying);
    this.drawTrunk(lying);
    this.drawRipple(e, t);

    // Тень лежит в мировой системе — со сдвигом от солнца
    this.shadow
      .setPosition((e.x + 0.3) * P, (e.y + 0.42) * P)
      .setRotation(this.heading)
      .setScale(ART_SCALE * (lying ? 1.15 : 1), ART_SCALE * (lying ? 1.35 : 1));

    // Подпись и пузырь сигнала
    const top = e.y - 2.35 * e.profile.look.size;
    this.name.setPosition(e.x * P, top * P).setScale(ART_SCALE * 0.85 * labelScale()).setVisible(showNames || this.selected);
    const sig = e.signal;
    if (sig) {
      const clarity = signalClarity(e);
      const near = Math.hypot(s.keeper.x - e.x, s.keeper.y - e.y) < 11;
      const key = clarity >= 0.5 || near ? BUBBLE[sig.kind] : 'bubble-dots';
      const visible = clarity >= 0.5 || near || Math.sin(t * 2) > 0;
      this.bubble
        .setTexture(key)
        .setVisible(visible)
        .setPosition(e.x * P, (top - 0.35 + Math.sin(t * 3) * 0.08) * P)
        .setAlpha(0.6 + 0.4 * clarity)
        .setScale(ART_SCALE * (0.75 + 0.35 * clarity));
    } else this.bubble.setVisible(false);

    this.ring.clear();
    if (this.selected) {
      this.ring.lineStyle(0.07 * P, hex(C.terracotta), 0.9);
      this.ring.strokeEllipse(e.x * P, e.y * P, (this.geom.a * 2 + 1.1) * P, (this.geom.a * 2 + 1.1) * P * 0.62);
      this.ring.setRotation(0);
    }
  }

  private drawFeet(e: Elephant, walking: boolean): void {
    const g = this.feet;
    g.clear();
    if (!this.feet.visible) return;
    const { a, b, cx } = this.geom;
    const s = e.profile.look.size;
    const stride = walking ? 0.22 * s : 0;
    // Порядок: передняя правая (+y), передняя левая, задняя правая, задняя левая
    const feet = [
      { x: cx + a * 0.52, y: b * 0.74, ph: 0 },
      { x: cx + a * 0.52, y: -b * 0.74, ph: Math.PI },
      { x: cx - a * 0.6, y: b * 0.72, ph: Math.PI },
      { x: cx - a * 0.6, y: -b * 0.72, ph: 0 },
    ];
    const mud = Math.min(1, e.body.legs);
    const footColor = mix(shade(this.skin, -0.22), '#6b5439', mud * 0.7);
    feet.forEach((f, i) => {
      let off = Math.sin(this.walkPhase + f.ph) * stride;
      let lift = 1;
      if (i === this.stompFoot && this.stompT > 0) {
        // Подняла и с силой опустила
        const k = this.stompT / 0.6;
        lift = 1 + 0.35 * Math.sin(k * Math.PI);
        off += 0.12 * Math.sin(k * Math.PI);
      }
      g.fillStyle(hex(footColor), 1);
      g.fillEllipse((f.x + off) * P, f.y * P, 0.42 * s * lift * P, 0.36 * s * lift * P);
      g.lineStyle(0.04 * P, hex(ELEPHANT_INK), 1);
      g.strokeEllipse((f.x + off) * P, f.y * P, 0.42 * s * lift * P, 0.36 * s * lift * P);
    });
  }

  // Состояние кожи: блеск мокрой, грязь на боках и спине, сено на спине, мыльная пена
  private drawSkin(e: Elephant, lying: boolean, t: number): void {
    const b = e.body;
    const key = `${lying ? 1 : 0}:${Math.round(e.wet * 10)}:${Math.round(b.side * 10)}:${Math.round(b.back * 10)}:${Math.round(b.head * 10)}:${Math.round(b.hay * 10)}:${Math.round(b.soap * 10)}`;
    if (key === this.skinKey && e.wet < 0.02) return;
    this.skinKey = key;
    const g = this.skinFx;
    const hg = this.headFx;
    g.clear();
    hg.clear();
    const { a, b: bb, cx } = this.geom;
    const r = rnd(e.profile.look.seed % 9973);
    const yScale = lying ? 1.2 : 1;
    // Грязь: бурые пятна по бокам, по хребту — со спины
    const mud = (amount: number, side: number, n: number) => {
      if (amount < 0.06) return;
      for (let i = 0; i < n; i++) {
        const x = cx + (r() - 0.5) * a * 1.5;
        const y = side === 0 ? (r() - 0.5) * bb * 0.4 : side * bb * (0.35 + r() * 0.45) * yScale;
        g.fillStyle(hex(i % 2 ? '#6d5a42' : '#7c6648'), Math.min(0.8, amount * 0.9));
        g.fillEllipse(x * P, y * P, (0.25 + r() * 0.35) * P, (0.14 + r() * 0.2) * P, 14);
      }
    };
    mud(b.side, 1, 6);
    mud(b.side, -1, 6);
    mud(b.back, 0, 5);
    // Сено на спине
    if (b.hay > 0.05) {
      g.lineStyle(0.03 * P, hex(C.hay), Math.min(1, b.hay + 0.2));
      for (let i = 0; i < Math.round(4 + b.hay * 12); i++) {
        const x = cx + (r() - 0.5) * a * 1.4;
        const y = (r() - 0.5) * bb * 0.9;
        const ang = r() * Math.PI;
        g.lineBetween(x * P, y * P, (x + Math.cos(ang) * 0.28) * P, (y + Math.sin(ang) * 0.28) * P);
      }
    }
    // Пена
    if (b.soap > 0.05) {
      for (let i = 0; i < 12; i++) {
        g.fillStyle(0xffffff, 0.75 * b.soap);
        g.fillCircle((cx + (r() - 0.5) * a * 1.5) * P, ((r() - 0.5) * bb * 1.4) * P, (0.07 + r() * 0.08) * P);
      }
    }
    // Мокрая кожа блестит
    if (e.wet > 0.05) {
      g.lineStyle(0.05 * P, 0xffffff, 0.28 * e.wet);
      g.beginPath();
      g.arc((cx - 0.1) * P, 0, a * 0.7 * P, -2.2, -1.1);
      g.strokePath();
      g.lineStyle(0.03 * P, 0xffffff, 0.22 * e.wet);
      g.beginPath();
      g.arc((cx + 0.2) * P, 0.05 * P, a * 0.5 * P, -2.0, -1.3);
      g.strokePath();
      void t;
    }
    if (b.head > 0.06) {
      const R = this.geom.headR;
      hg.fillStyle(hex('#6d5a42'), Math.min(0.7, b.head));
      hg.fillEllipse(-R * 0.2 * P, R * 0.3 * P, R * 0.6 * P, R * 0.35 * P, 12);
    }
  }

  private drawTail(swing: number, raise: number, lying: boolean): void {
    const g = this.tail;
    g.clear();
    const x0 = this.geom.tailX * 0.96;
    const len = (lying ? 0.7 : 0.75) * (1 - raise * 0.45);
    const ang = Math.PI + swing * 0.5 + (lying ? 0.5 : 0);
    const x1 = x0 + Math.cos(ang) * len;
    const y1 = Math.sin(ang) * len + (lying ? 0.2 : 0);
    g.lineStyle(0.09 * P, hex(ELEPHANT_INK), 1);
    g.lineBetween(x0 * P, 0, x1 * P, y1 * P);
    g.lineStyle(0.05 * P, hex(shade(this.skin, -0.1)), 1);
    g.lineBetween(x0 * P, 0, x1 * P, y1 * P);
    g.fillStyle(hex('#2f2a27'), 1);
    g.fillEllipse(x1 * P, y1 * P, 0.16 * P, 0.11 * P);
  }

  // Хобот: сужающаяся трубка вдоль квадратичной кривой
  private drawTrunk(lying: boolean): void {
    const g = this.trunk;
    g.clear();
    const R = this.geom.headR;
    const s = R / 0.58;
    const p = this.pose;
    const bx = R * 1.02;
    let cx: number;
    let cy: number;
    let tx: number;
    let ty: number;
    if (p.raise > 0.05 && !lying) {
      const k = Math.min(1, p.raise);
      const tipFwd = lerp(p.reach, -0.25 * s, k);
      tx = bx + tipFwd;
      ty = Math.sin(p.side) * 0.45 * s;
      cx = bx + lerp(p.reach * 0.6, 0.55 * s, k);
      cy = ty * 0.4 + p.curl * 0.2;
    } else {
      const reach = Math.max(0.25, p.reach) * s;
      tx = bx + Math.cos(p.side) * reach;
      ty = Math.sin(p.side) * reach;
      const ca = p.side + p.curl * 0.9;
      cx = bx + Math.cos(ca) * reach * 0.55;
      cy = Math.sin(ca) * reach * 0.55;
    }
    const n = 12;
    const left: { x: number; y: number }[] = [];
    const right: { x: number; y: number }[] = [];
    const w0 = 0.23 * s;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = (1 - u) * (1 - u) * bx + 2 * (1 - u) * u * cx + u * u * tx;
      const y = 2 * (1 - u) * u * cy + u * u * ty;
      const dx = 2 * (1 - u) * (cx - bx) + 2 * u * (tx - cx);
      const dy = 2 * (1 - u) * cy + 2 * u * (ty - cy);
      const len = Math.hypot(dx, dy) || 1;
      const w = w0 * (1 - 0.5 * u);
      left.push({ x: x - (dy / len) * w, y: y + (dx / len) * w });
      right.push({ x: x + (dy / len) * w, y: y - (dx / len) * w });
    }
    this.tuft.setPosition(tx * P, ty * P);
    const pts = [...left, ...right.reverse()].map((q) => new Phaser.Math.Vector2(q.x * P, q.y * P));
    g.fillStyle(hex(this.skin), 1);
    g.fillPoints(pts, true);
    g.lineStyle(0.045 * P, hex(ELEPHANT_INK), 1);
    g.strokePoints(pts, true, true);
    // Кольцевые складки
    g.lineStyle(0.02 * P, hex(shade(this.skin, -0.3)), 0.8);
    for (const u of [0.25, 0.42, 0.58, 0.72]) {
      const i = Math.round(u * n);
      const l = left[i];
      const r = right[n - i];
      g.lineBetween(l.x * P, l.y * P, r.x * P, r.y * P);
    }
    g.fillStyle(hex(shade(this.skin, -0.32)), 1);
    g.fillEllipse(tx * P, ty * P, 0.13 * s * P, 0.1 * s * P);
  }

  private drawRipple(e: Elephant, t: number): void {
    const g = this.ripple;
    g.clear();
    if (e.act.kind !== 'bathe' || e.act.phase !== 'do') return;
    const { a, b } = this.geom;
    for (let i = 0; i < 2; i++) {
      const k = ((t * 0.6 + i * 0.5) % 1);
      g.lineStyle(0.05 * P, hex(C.waterLight), 0.8 * (1 - k));
      g.strokeEllipse(0, 0, (a * 2 + 0.6 + k * 1.2) * P, (b * 2 + 0.5 + k * 1.0) * P);
    }
  }

  destroy(): void {
    this.root.destroy();
    this.shadow.destroy();
    this.name.destroy();
    this.bubble.destroy();
    this.ring.destroy();
  }
}

// Куда тянется хобот во время еды
function foodPoint(s: State, e: Elephant): { x: number; y: number } | null {
  const t = e.act.target;
  if (!t) return null;
  if (t.t === 'slot') return STATIONS[t.station].reach ?? null;
  if (t.t === 'food') return s.world.food.find((f) => f.id === t.id) ?? null;
  if (t.t === 'tub') return s.world.tubs.find((x) => x.id === t.id) ?? null;
  if (t.t === 'obj' && t.id === 'drum') return DRUM;
  if (t.t === 'obj' && t.id === 'tire') return TIRE;
  return null;
}
