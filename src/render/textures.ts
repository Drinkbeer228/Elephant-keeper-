import Phaser from 'phaser';
import type { ElephantProfile } from '../sim';
import * as A from './art';
import * as I from './itemsArt';
import * as S from './stationsArt';
import { LOG, BOULDERS, STATIONS, TREES } from '../data/facility';

export const PPM = 32; // пикселей мира на метр
export const ART_SCALE = PPM / A.TEX;

const origins = new Map<string, { ox: number; oy: number }>();

export function addArt(scene: Phaser.Scene, key: string, art: A.Art): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, art.canvas);
  origins.set(key, { ox: art.ox, oy: art.oy });
}

export function placeImage(scene: Phaser.Scene, key: string, xM: number, yM: number, depth = 0): Phaser.GameObjects.Image {
  const o = origins.get(key) ?? { ox: 0.5, oy: 0.5 };
  return scene.add.image(xM * PPM, yM * PPM, key).setOrigin(o.ox, o.oy).setScale(ART_SCALE).setDepth(depth);
}

export function originOf(key: string): { ox: number; oy: number } {
  return origins.get(key) ?? { ox: 0.5, oy: 0.5 };
}

export function loadStaticArt(scene: Phaser.Scene): void {
  addArt(scene, 'keeper-body', A.keeperBody());
  addArt(scene, 'keeper-head', A.keeperHead());
  addArt(scene, 'shadow-keeper', A.softShadow(0.7, 0.55, 0.2));
  addArt(scene, 'item-hay', A.hayBale());
  addArt(scene, 'item-straw', A.strawBale());
  addArt(scene, 'item-ration', A.rationBucket());
  addArt(scene, 'item-browse', A.browseBundle());
  addArt(scene, 'item-shovel', I.shovelTool());
  addArt(scene, 'item-rake', A.rakeTool());
  addArt(scene, 'item-broom', I.broomTool());
  addArt(scene, 'item-mop', I.mopTool());
  addArt(scene, 'item-brush', I.brushTool());
  addArt(scene, 'item-hose', A.hoseNozzle());
  addArt(scene, 'item-sawdust', I.sawdustSack());
  addArt(scene, 'item-tank', I.tankArt('empty'));
  addArt(scene, 'item-tank-full', I.tankArt('full'));
  addArt(scene, 'item-tank-dirty', I.tankArt('dirty'));
  addArt(scene, 'item-washKit', I.washKitArt());
  addArt(scene, 'item-chem', I.chemArt());
  addArt(scene, 'item-porridge', I.porridgeBucket(true));
  addArt(scene, 'item-porridge-empty', I.porridgeBucket(false));
  addArt(scene, 'item-pile', I.pileArt());
  addArt(scene, 'item-bamboo', I.bambooBundle());
  addArt(scene, 'food-bamboo', I.bambooBundle());
  addArt(scene, 'food-bamboo-remains', I.bambooRemains());
  addArt(scene, 'food-straw', I.strawPile());
  addArt(scene, 'apple-fresh', I.appleArt('fresh'));
  addArt(scene, 'apple-ferment', I.appleArt('ferment'));
  addArt(scene, 'apple-rotten', I.appleArt('rotten'));
  addArt(scene, 'hay-tuft', I.hayTuft());
  addArt(scene, 'barrow', A.barrowArt());
  addArt(scene, 'barrow-load', A.barrowLoad());
  addArt(scene, 'shadow-barrow', A.softShadow(1.5, 0.8, 0.18));
  addArt(scene, 'ball', A.ballArt());
  addArt(scene, 'shadow-ball', A.softShadow(1.1, 1.0, 0.2));
  addArt(scene, 'drum', A.drumArt());
  addArt(scene, 'tire', A.tireArt());
  const logLen = Math.hypot(LOG.x1 - LOG.x0, LOG.y1 - LOG.y0);
  addArt(scene, 'log', A.logArt(logLen, LOG.r));
  BOULDERS.forEach((b, i) => addArt(scene, `boulder-${i}`, A.boulderArt(b.r, 30 + i)));
  TREES.forEach((t, i) => {
    addArt(scene, `canopy-${t.id}`, A.canopyArt(t.canopy, 50 + i, i % 2));
    addArt(scene, `canopy-shadow-${t.id}`, A.softShadow(t.canopy * 2, t.canopy * 1.8, 0.2));
  });
  addArt(scene, 'canopy-small-a', A.canopyArt(1.4, 91, 1));
  addArt(scene, 'canopy-small-b', A.canopyArt(1.1, 92, 0));
  addArt(scene, 'canopy-shadow-small', A.softShadow(2.6, 2.3, 0.18));
  for (let i = 0; i < 4; i++) addArt(scene, `dung-${i}`, A.dungArt(100 + i));
  for (let i = 0; i < 4; i++) addArt(scene, `produce-${i}`, A.produceArt(i));
  addArt(scene, 'food-hay', A.hayPile());
  addArt(scene, 'food-browse', A.browseBundle());
  addArt(scene, 'food-remains', A.browseRemains());
  addArt(scene, 'food-mush', A.remainsMush());
  for (const [icon, tint] of [
    ['drop', '#e7c55a'],
    ['door', '#a8bfa9'],
    ['house', '#e4b4a1'],
    ['hay', '#c8b465'],
    ['water', '#86ada7'],
    ['heart', '#c86d51'],
    ['dots', '#f4f1ea'],
  ] as const) {
    addArt(scene, `bubble-${icon}`, A.bubbleArt(icon === 'water' ? 'drop' : icon, tint));
  }
  addArt(scene, 'fx-z', drawZ());
  addArt(scene, 'glow', drawGlow());
  addArt(scene, 'fx-heart', drawHeart());
  addArt(scene, 'fx-dot', drawDot());
  // Оборудование
  addArt(scene, 'st-rack-barn', S.rackArt(4, 0.7));
  addArt(scene, 'st-rack-barn-slats', S.rackSlats(4, 0.7));
  addArt(scene, 'st-rack-paddock', S.rackArt(4, 0.85));
  addArt(scene, 'st-rack-paddock-slats', S.rackSlats(4, 0.85));
  const size = (id: 'barnWaterW' | 'barnWaterE') => {
    const r = STATIONS[id].rect!;
    return [r.x1 - r.x0, r.y1 - r.y0 + 0.1] as const;
  };
  addArt(scene, 'st-trough-barnW', S.troughArt(...size('barnWaterW')));
  addArt(scene, 'st-trough-barnE', S.troughArt(...size('barnWaterE')));
  addArt(scene, 'st-trough-paddock', S.troughArt(3.8, 0.85));
  addArt(scene, 'st-tubrack', S.tubRackArt());
  addArt(scene, 'st-porridge', S.porridgeArt());
  addArt(scene, 'st-sink', S.sinkArt());
  addArt(scene, 'st-cabinet', S.cabinetArt());
  addArt(scene, 'st-bamboo', S.bambooPileArt());
  addArt(scene, 'st-sawdust', S.sawdustPileArt());
  addArt(scene, 'st-drain', S.drainArt());
  addArt(scene, 'st-valve-open', S.valveArt(true));
  addArt(scene, 'st-valve-closed', S.valveArt(false));
  addArt(scene, 'st-reel', S.reelArt());
  addArt(scene, 'st-container', S.containerArt());
  addArt(scene, 'st-toolboard', S.toolBoardArt());
  addArt(scene, 'st-desk', S.deskArt());
  addArt(scene, 'st-shelf', S.shelfArt());
  addArt(scene, 'st-prep', S.prepTableArt());
  addArt(scene, 'st-fridge', S.fridgeArt());
  addArt(scene, 'st-lockers', S.lockersArt());
  addArt(scene, 'st-lamp', S.lampArt());
  addArt(scene, 'st-bench', S.benchArt());
}

export function loadElephantArt(scene: Phaser.Scene, p: ElephantProfile): void {
  addArt(scene, `el-body-${p.id}`, A.elephantBody(p.look));
  addArt(scene, `el-lying-${p.id}`, A.elephantLying(p.look));
  addArt(scene, `el-head-${p.id}`, A.elephantHead(p.look));
  addArt(scene, `el-earL-${p.id}`, A.elephantEar(p.look, -1));
  addArt(scene, `el-earR-${p.id}`, A.elephantEar(p.look, 1));
  const g = A.bodyGeom(p.look);
  addArt(scene, `el-shadow-${p.id}`, A.softShadow(g.a * 2 + 1.0, g.b * 2 + 0.5, 0.24));
  addArt(scene, `el-name-${p.id}`, A.namePill(p.name, p.color));
  addArt(scene, `tub-${p.id}`, I.tubArt(p.color));
  addArt(scene, `shard-${p.id}`, I.shardArt(p.color));
}

function drawZ(): A.Art {
  return A.draw(0.5, 0.5, 0.25, 0.25, (ctx) => {
    ctx.strokeStyle = A.C.ink;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-0.12, -0.12);
    ctx.lineTo(0.12, -0.12);
    ctx.lineTo(-0.12, 0.12);
    ctx.lineTo(0.12, 0.12);
    ctx.stroke();
  });
}

function drawHeart(): A.Art {
  return A.draw(0.5, 0.5, 0.25, 0.25, (ctx) => {
    ctx.scale(0.8, 0.8);
    A.drawIcon(ctx, 'heart', A.C.terracotta);
  });
}

// Тёплое пятно света фонаря: мягкий радиальный спад
function drawGlow(): A.Art {
  return A.draw(4, 4, 2, 2, (ctx) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 2);
    g.addColorStop(0, 'rgba(255,214,140,0.85)');
    g.addColorStop(0.35, 'rgba(255,205,130,0.38)');
    g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-2, -2, 4, 4);
  });
}

function drawDot(): A.Art {
  return A.draw(0.3, 0.3, 0.15, 0.15, (ctx) => {
    ctx.beginPath();
    ctx.arc(0, 0, 0.1, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  });
}
