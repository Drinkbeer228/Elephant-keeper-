import Phaser from 'phaser';
import { MAP } from '../data/map';
import type { State } from '../sim';
import type { WorldScene } from './world';

export const TILE = 48;

const FONT = '"Press Start 2P", monospace';
const MARGIN = 16; // отступ маркера от краёв экрана
const TOP_MARGIN = 60; // под панелью часов и ресурсов

interface Marker {
  box: Phaser.GameObjects.Container;
  arrow: Phaser.GameObjects.Graphics;
  target: () => { x: number; y: number } | null;
}

// Отдельная сцена поверх мира со своей камерой (без зума и скролла):
// закадровые индикаторы не уезжают вместе с камерой и не масштабируются зумом.
// DOM-HUD и так зафиксирован относительно экрана, канвас-индикаторы — здесь
export class OverlayScene extends Phaser.Scene {
  private getState: () => State;
  private markers: Marker[] = [];

  constructor(getState: () => State) {
    super('overlay');
    this.getState = getState;
  }

  create(): void {
    const s = this.getState();
    const mk = (text: string, color: string, target: Marker['target']): Marker => {
      const label = this.add
        .text(0, 0, text, { fontFamily: FONT, fontSize: '8px', color: '#fcfcfc', backgroundColor: color, padding: { x: 3, y: 2 } })
        .setOrigin(0.5);
      const arrow = this.add.graphics({ fillStyle: { color: 0xfcfcfc } });
      arrow.fillTriangle(14, -5, 14, 5, 22, 0); // остриё вправо, поворот — по направлению к цели
      const box = this.add.container(0, 0, [label, arrow]).setVisible(false).setDepth(100);
      void s;
      return { box, arrow, target };
    };
    // Гудок поставки: к борту грузовика, пока тот стоит и не принят весь
    this.markers.push(
      mk('🚚 ГУДОК!', '#d82800', () => {
        const st = this.getState();
        return st.supply.arrived && !st.supply.left ? { x: MAP.stations.unload.x * TILE, y: MAP.stations.unload.y * TILE } : null;
      }),
    );
    // Тревога: слониха просится или качается
    this.markers.push(
      mk('🐘 !', '#d82800', () => {
        const e = this.getState().elephants.find((el) => el.signalStarted !== undefined || el.state === 'sway');
        return e ? { x: e.x * TILE, y: e.y * TILE } : null;
      }),
    );
  }

  update(time: number): void {
    const world = this.scene.get('world') as WorldScene | undefined;
    const cam = world?.cameras?.main;
    if (!cam) return;
    const mid = cam.midPoint;
    const hw = cam.width / (2 * cam.zoom);
    const hh = cam.height / (2 * cam.zoom);
    const blink = Math.floor(time / 280) % 2 === 0;
    for (const m of this.markers) {
      const target = m.target();
      if (!target) {
        m.box.setVisible(false);
        continue;
      }
      // Цель в кадре? Мировой вид: mid ± (полширины, полвысоты) / zoom
      if (Math.abs(target.x - mid.x) < hw && Math.abs(target.y - mid.y) < hh) {
        m.box.setVisible(false);
        continue;
      }
      // Экранная точка цели и её прижим к рамке экрана
      const sx = ((target.x - mid.x) / hw) * (cam.width / 2) + cam.width / 2;
      const sy = ((target.y - mid.y) / hh) * (cam.height / 2) + cam.height / 2;
      const cx = Math.min(cam.width - MARGIN, Math.max(MARGIN, sx));
      const cy = Math.min(cam.height - MARGIN, Math.max(TOP_MARGIN, sy));
      m.box.setPosition(Math.round(cx), Math.round(cy));
      m.arrow.setRotation(Math.atan2(sy - cy, sx - cx));
      m.box.setVisible(blink);
    }
  }
}
