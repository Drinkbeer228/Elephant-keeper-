import { MAP } from '../data/map';
import { profileOf, dist } from './elephants';
import { chance, randomRange } from './rng';
import { walkable } from './nav';
import type { State, Tire } from './types';

const KNOCKDOWN_SECONDS = 2;
const TIRE_FLIGHT_SECONDS = 0.9;

export function updateToys(state: State, dt: number, dtReal: number): void {
  state.player.knockdownTimer = Math.max(0, state.player.knockdownTimer - dtReal);
  state.partner.knockdownTimer = Math.max(0, state.partner.knockdownTimer - dtReal);

  for (const tire of state.tires) {
    tire.cooldown = Math.max(0, tire.cooldown - dt);
    if (tire.flightLeft > 0) {
      const step = Math.min(dtReal, tire.flightLeft);
      tire.x += tire.vx * step;
      tire.y += tire.vy * step;
      tire.flightLeft -= step;
      keepInsidePaddock(tire);
      if (!tire.hit && dist(tire, state.player) < 0.9) {
        tire.hit = true;
        knockDownPlayer(state, tire.vx, tire.vy);
      } else if (!tire.hit && dist(tire, state.partner) < 0.9) {
        tire.hit = true;
        knockDownPartner(state, tire.vx, tire.vy);
      }
      if (tire.flightLeft <= 0) {
        tire.vx = 0;
        tire.vy = 0;
        tire.cooldown = 4;
      }
      continue;
    }

    if (tire.cooldown > 0) continue;
    const players = state.elephants
      .filter((e) => profileOf(e).paddock === tire.paddock && (e.state === 'play' || e.state === 'sway' || e.boredom >= 80))
      .filter((e) => dist(e, tire) <= 2)
      .sort((a, b) => dist(a, tire) - dist(b, tire));
    const elephant = players[0];
    if (elephant && chance(state, dt * (elephant.state === 'play' || elephant.state === 'sway' ? 0.2 : 0.035) * elephant.traits.aggression)) {
      throwTire(state, tire);
    }
  }
}

export function throwTire(state: State, tire: Tire): void {
  const angle = randomRange(state, 0, Math.PI * 2);
  const distance = randomRange(state, 4, 7);
  const speed = distance / TIRE_FLIGHT_SECONDS;
  tire.vx = Math.cos(angle) * speed;
  tire.vy = Math.sin(angle) * speed;
  tire.flightDuration = TIRE_FLIGHT_SECONDS;
  tire.flightLeft = TIRE_FLIGHT_SECONDS;
  tire.hit = false;
}

function keepInsidePaddock(tire: Tire): void {
  const bounds = tire.paddock === 'female' ? MAP.paddock : MAP.paddock2;
  const x = Math.min(bounds.x1 - 0.5, Math.max(bounds.x0 + 0.5, tire.x));
  const y = Math.min(bounds.y1 - 0.5, Math.max(bounds.y0 + 0.5, tire.y));
  if (x !== tire.x || y !== tire.y) {
    tire.x = x;
    tire.y = y;
    tire.flightLeft = 0;
  }
}

function knockDownPlayer(state: State, vx: number, vy: number): void {
  const p = state.player;
  const direction = Math.hypot(vx, vy) || 1;
  moveBack(state, p, -vx / direction, -vy / direction);
  p.knockdownTimer = KNOCKDOWN_SECONDS;
  if (p.held) {
    const item = p.held;
    p.held = null;
    item.x = p.x + 0.4;
    item.y = p.y;
    item.droppedAt = state.t;
    state.items.push(item);
    for (const [i, nested] of (item.nested ?? []).entries()) {
      nested.x = item.x + (i + 1) * 0.45;
      nested.y = item.y;
      nested.droppedAt = state.t;
      state.items.push(nested);
    }
    item.nested = undefined;
  }
}

function knockDownPartner(state: State, vx: number, vy: number): void {
  const p = state.partner;
  const direction = Math.hypot(vx, vy) || 1;
  moveBack(state, p, -vx / direction, -vy / direction);
  p.knockdownTimer = KNOCKDOWN_SECONDS;
  p.mode = 'recovering';
  const basin = p.foodBasin === null ? undefined : state.items.find((i) => i.id === p.foodBasin);
  if (basin) {
    basin.x = p.x + 0.4;
    basin.y = p.y;
    basin.droppedAt = state.t;
    p.foodBasin = null;
  }
}

function moveBack(state: State, target: { x: number; y: number }, dx: number, dy: number): void {
  const origin = { x: target.x, y: target.y };
  for (let distance = 1.8; distance >= 0.2; distance -= 0.2) {
    const x = origin.x + dx * distance;
    const y = origin.y + dy * distance;
    if (walkable(x, y, { gates: state.gates }) && !MAP.pools.some((_, i) => {
      const p = MAP.pools[i];
      return ((x - p.x) / p.rx) ** 2 + ((y - p.y) / p.ry) ** 2 < 1;
    })) {
      target.x = x;
      target.y = y;
      return;
    }
  }
}
