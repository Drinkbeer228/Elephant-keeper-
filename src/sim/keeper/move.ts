// Движение кипера: стены и закрытые ворота, слоны рядом, тачка впереди,
// шланг на привязи, тяжёлая ноша. С тюка сыплется, особенно бегом; тачка с тюками,
// налетевшая на угол, рассыпает сено.

import { FLOOR, KEEPER } from '../../data/balance';
import { GATES, gateSolid, hardFloor, zoneAt } from '../../data/facility';
import { bodyCircles } from '../behavior/perceive';
import { log } from '../events';
import { circleHitsRect, keeperIndex } from '../geometry';
import type { State, StepInput } from '../types';
import { addLitter } from '../world';
import { heavy } from './common';
import { hoseFollow } from './hose';

// Стены и закрытые створки (щель кипера в разделительных воротах — проходима). Слон — тоже
// препятствие: сквозь него не пройти, его просят подвинуться или обходят. Шаг, который не
// уменьшает и так возникшее перекрытие (слон сам надвинулся), не запрещаем — выйти можно всегда.
function blocked(s: State, x: number, y: number, r: number): boolean {
  if (keeperIndex.hits(x, y, r)) return true;
  for (const g of GATES) if (!s.world.gates[g.id] && gateSolid(g).some((p) => circleHitsRect(x, y, r, p))) return true;
  const k = s.keeper;
  for (const e of s.elephants) {
    if (Math.abs(e.x - x) > 4 || Math.abs(e.y - y) > 4) continue;
    for (const c of bodyCircles(e)) {
      const now = Math.hypot(x - c.x, y - c.y) - c.r - r;
      if (now >= -0.02) continue;
      const before = Math.hypot(k.x - c.x, k.y - c.y) - c.r - r;
      if (now < before) return true;
    }
  }
  return false;
}

export function moveKeeper(s: State, input: StepInput, dtSec: number): void {
  const k = s.keeper;
  const len = Math.hypot(input.move.x, input.move.y);
  k.running = input.run && len > 0.1;
  k.moving = false;
  // Сбили с ног или оттолкнули — пару секунд приходит в себя
  if (k.stun > 0) {
    k.stun = Math.max(0, k.stun - dtSec);
    return;
  }
  if (len < 0.08) return;
  if (k.prep) {
    k.prep = null;
    log(s, 'info', 'Нарезку отложили — таз остался на столе.', { silent: true });
  }
  if (k.task) {
    log(s, 'info', `Прервано: ${k.task.label.toLowerCase()}.`, { silent: true });
    k.task = null;
  }
  const nx = input.move.x / len;
  const ny = input.move.y / len;
  const want = Math.atan2(ny, nx);
  let df = want - k.facing;
  while (df > Math.PI) df -= Math.PI * 2;
  while (df < -Math.PI) df += Math.PI * 2;
  k.facing += Math.sign(df) * Math.min(Math.abs(df), 12 * dtSec);
  const b = s.world.barrow;
  let speed = KEEPER.speed * Math.min(1, len) * (k.running ? KEEPER.runFactor : 1);
  if (heavy(k.held, s)) speed *= k.held?.kind === 'tub' ? KEEPER.tubFactor : KEEPER.heavyFactor;
  if (b.pushed) speed *= KEEPER.barrowFactor * (1 - 0.15 * (b.load / KEEPER.barrowMax));
  // Ведёшь слониху рядом — идёшь её шагом, а не убегаешь вперёд
  if (s.elephants.some((e) => e.act.kind === 'walkWith')) speed = Math.min(speed, KEEPER.leadSpeed);
  const step = speed * dtSec;
  // Тачка едет впереди; у стены и в дверях она чуть доворачивает, чтобы пройти
  let barrowHeading = b.heading;
  const barrowFits = (x: number, y: number, h: number): number | null => {
    for (const off of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8]) {
      const hh = h + off;
      if (!blocked(s, x + Math.cos(hh) * 0.95, y + Math.sin(hh) * 0.95, 0.36)) return hh;
    }
    return null;
  };
  const tryMove = (x: number, y: number): boolean => {
    if (blocked(s, x, y, KEEPER.radius)) return false;
    if (k.held?.kind === 'hose' && !hoseFollow(s, k, { x, y })) return false;
    if (b.pushed) {
      const h = barrowFits(x, y, Math.atan2(y - k.y, x - k.x));
      if (h === null) return false;
      barrowHeading = h;
    }
    k.x = x;
    k.y = y;
    return true;
  };
  const px = k.x;
  const py = k.y;
  const full = tryMove(k.x + nx * step, k.y + ny * step);
  const moved = full || tryMove(k.x + nx * step, k.y) || tryMove(k.x, k.y + ny * step);
  k.moving = moved;
  if (b.pushed && moved) {
    b.heading = barrowHeading;
    b.x = k.x + Math.cos(b.heading) * 0.95;
    b.y = k.y + Math.sin(b.heading) * 0.95;
  }
  // Тачка с тюками налетела на препятствие с разгона — сено рассыпается
  if (b.pushed && !full && speed > 2.4 && b.cargo.some((c) => c.kind === 'hay' || c.kind === 'straw')) {
    addLitter(s, b.x + Math.cos(b.heading) * 0.4, b.y + Math.sin(b.heading) * 0.4, FLOOR.litterBump, 1.1);
    log(s, 'info', 'Тачка налетела на угол — с тюка рассыпалось сено. Подмети.', { key: 'barrowBump', cooldown: 10, x: b.x, y: b.y });
  }
  // С тюка в руках понемногу сыплется; бегом — заметно
  const carried = k.held && (k.held.kind === 'hay' || k.held.kind === 'straw');
  const rolling = b.pushed && b.cargo.some((c) => c.kind === 'hay' || c.kind === 'straw') && k.running;
  if ((carried || rolling) && moved) {
    k.carried += Math.hypot(k.x - px, k.y - py) * (k.running ? 3 : 1);
    if (k.carried >= 2) {
      const x = rolling ? b.x : k.x;
      const y = rolling ? b.y : k.y;
      if (hardFloor(x, y) || zoneAt(x, y)) addLitter(s, x, y, FLOOR.litterCarry * k.carried, 0.6);
      k.carried = 0;
    }
  }
}
