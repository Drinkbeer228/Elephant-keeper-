// Автокипер: бот, который играет смену настоящими командами (движение + действия).
// Нужен для сквозных тестов (всё ли достижимо и работает в связке) и для демо (?bot).

import { DOORS, STATIONS, TOOL_SLOTS, BARROW_HOME, zoneAt, type StationId, type ZoneId } from '../data/facility';
import { availableActions, minuteOfDay, zoneEmpty, type ActionOption, type State, type StepInput, type Vec } from '../sim';
import { keeperFieldAt, keeperRoute } from '../sim/nav';
import { isBeddingCell, cellCenter } from '../sim/world';

type Step =
  | { kind: 'go'; to: (s: State) => Vec | null; tol: number }
  | { kind: 'act'; pick: (s: State, opts: ActionOption[]) => ActionOption | undefined; optional?: boolean; label?: string }
  | { kind: 'wait'; until: (s: State) => boolean; max: number };

interface Job {
  name: string;
  steps: Step[];
}

const IDLE: StepInput = { move: { x: 0, y: 0 }, run: false, actions: [], cancel: false };

const go = (to: Vec | ((s: State) => Vec | null), tol = 0.45): Step => ({ kind: 'go', to: typeof to === 'function' ? to : () => to, tol });
const act = (prefix: string | ((s: State) => string)): Step => ({
  kind: 'act',
  label: typeof prefix === 'string' ? prefix : 'fn',
  pick: (s, opts) => {
    const p = typeof prefix === 'function' ? prefix(s) : prefix;
    return opts.find((o) => o.id === p) ?? opts.find((o) => o.id.startsWith(p));
  },
});
const wait = (until: (s: State) => boolean, max: number): Step => ({ kind: 'wait', until, max });
const st = (id: StationId): Vec => STATIONS[id].keeper;
const optional = (step: Step): Step => (step.kind === 'act' ? { ...step, optional: true } : step);

const OUTSIDE_BARN_DOOR = { x: 31.2, y: 27.6 };
const INSIDE_BARN_DOOR = { x: 28.6, y: 27.6 };
const OUTSIDE_PADDOCK_DOOR = { x: 41.6, y: 21.2 };
const INSIDE_PADDOCK_DOOR = { x: 41.6, y: 18.6 };

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function allIn(s: State, zone: ZoneId): boolean {
  return s.elephants.every((e) => zoneAt(e.x, e.y) === zone);
}

export class AutoKeeper {
  private job: Job | null = null;
  private route: Vec[] = [];
  private routeFor: Vec | null = null;
  private routeAge = 0;
  private stuck = 0;
  private waited = 0;
  private lastPos: Vec = { x: 0, y: 0 };
  private done = new Set<string>();
  stats = { jobs: {} as Record<string, number>, failed: {} as Record<string, number> };

  decide(s: State): StepInput {
    if (s.keeper.task) return IDLE;
    for (let guard = 0; guard < 4; guard++) {
      if (!this.job) {
        this.job = this.plan(s);
        if (!this.job) return IDLE;
        this.stats.jobs[this.job.name] = (this.stats.jobs[this.job.name] ?? 0) + 1;
        this.route = [];
        this.stuck = 0;
        this.waited = 0;
      }
      const step = this.job.steps[0];
      if (!step) {
        this.job = null;
        continue;
      }
      if (step.kind === 'go') {
        const to = step.to(s);
        if (!to) {
          this.job.steps.shift();
          continue;
        }
        if (dist(s.keeper, to) <= step.tol) {
          this.job.steps.shift();
          continue;
        }
        return this.moveTo(s, to);
      }
      if (step.kind === 'act') {
        const opt = step.pick(s, availableActions(s));
        this.job.steps.shift();
        if (!opt || !opt.enabled) {
          if (step.optional) continue;
          this.fail(opt ? `off:${opt.id}` : `noaction:${step.label ?? '?'}`);
          return IDLE;
        }
        return { ...IDLE, actions: [opt.id] };
      }
      this.waited += 1 / 30;
      if (step.until(s) || this.waited > step.max) {
        this.waited = 0;
        this.job.steps.shift();
        continue;
      }
      return IDLE;
    }
    return IDLE;
  }

  private fail(why = ''): void {
    if (this.job) {
      const key = why ? `${this.job.name}/${why}` : this.job.name;
      this.stats.failed[key] = (this.stats.failed[key] ?? 0) + 1;
    }
    this.job = null;
  }

  private moveTo(s: State, to: Vec): StepInput {
    const k = s.keeper;
    const nav = { gateOpen: s.world.gateOpen, barnDoor: zoneEmpty(s, 'barn'), paddockDoor: zoneEmpty(s, 'paddock') };
    this.routeAge -= 1 / 30;
    if (!this.routeFor || dist(this.routeFor, to) > 0.2 || this.routeAge <= 0 || !this.route.length) {
      const r = keeperRoute(k, to, nav);
      if (!r) {
        this.fail('noroute');
        return IDLE;
      }
      this.route = r;
      this.routeFor = to;
      this.routeAge = 1.5;
    }
    while (this.route.length > 1 && dist(k, this.route[0]) < 0.3) this.route.shift();
    const wp = this.route[0];
    if (!wp) {
      this.fail('noroute');
      return IDLE;
    }
    const dx = wp.x - k.x;
    const dy = wp.y - k.y;
    const len = Math.hypot(dx, dy) || 1;
    if (dist(k, this.lastPos) < 0.01) this.stuck += 1 / 30;
    else this.stuck = 0;
    this.lastPos = { x: k.x, y: k.y };
    if (this.stuck > 3) {
      this.fail('stuck');
      return IDLE;
    }
    const slow = Math.min(1, len / 0.4);
    return { ...IDLE, move: { x: (dx / len) * slow, y: (dy / len) * slow } };
  }

  // -------------------------------------------------------------------------
  // Что делать дальше
  // -------------------------------------------------------------------------

  private plan(s: State): Job | null {
    const w = s.world;
    const k = s.keeper;
    const m = minuteOfDay(s.t);
    const day = Math.floor((s.t - 480) / 1440);
    if (w.barrow.pushed) return this.barrowHome();
    if (k.held) return this.dispose(s);
    // Тачку, забытую в вольере, — вывезти прежде всего: иначе ворота не открыть
    if (zoneAt(w.barrow.x, w.barrow.y)) return this.barrowDump(s);

    // Открытые краны — закрыть, когда налито
    for (const id of ['barnWater', 'paddockWater'] as const) {
      const wp = w.water[id];
      if (wp.valve && wp.level >= 92) return { name: 'valveClose', steps: [go(st(id)), act(`valve:${id}`)] };
      if (wp.valve) return { name: 'valveWait', steps: [go(st(id)), wait((x) => x.world.water[id].level >= 92, 40)] };
    }

    // Сигналы слонов
    for (const e of s.elephants) {
      const sig = e.signal;
      if (!sig) continue;
      const night = m >= 21 * 60 || m < 6 * 60;
      if ((sig.kind === 'toilet' || sig.kind === 'out') && !w.gateOpen) {
        if (night && sig.kind === 'toilet') return { name: 'drainCall', steps: [go(st('trainingWall')), act(`call:${e.id}`), wait((x) => { const q = x.elephants.find((z) => z.id === e.id)!; return q.act.kind !== 'follow' || (q.mem.call?.arrivedAt ?? -1) >= 0; }, 25), optional(act(`treat:${e.id}`))] };
        if (!night) return this.gate(true);
      }
      if (sig.kind === 'in' && !w.gateOpen) return this.gate(true);
      if (sig.kind === 'water') return { name: 'water', steps: [go(st(zoneAt(e.x, e.y) === 'barn' ? 'barnWater' : 'paddockWater')), act(`valve:${zoneAt(e.x, e.y) === 'barn' ? 'barnWater' : 'paddockWater'}`)] };
      if (sig.kind === 'food') return this.hay(zoneAt(e.x, e.y) === 'barn' ? 'barnRack' : 'paddockFeeder');
    }

    // Вода и сено
    for (const id of ['barnWater', 'paddockWater'] as const) if (w.water[id].level < 40) return { name: 'water', steps: [go(st(id)), act(`valve:${id}`)] };
    if (w.hay.barnRack < 35 && (m >= 15 * 60 || m < 7 * 60) && w.stock.hay > 0) return this.hay('barnRack');
    if (w.hay.paddockFeeder < 30 && m >= 7.5 * 60 && m < 16 * 60 && w.stock.hay > 0) return this.hay('paddockFeeder');

    // Лакомства в сумке
    if (k.pouch < 3) return { name: 'pouch', steps: [go(st('fridge')), act('refillPouch')] };

    // Уборка слоновника: все снаружи — закрыть ворота и убрать
    const dayTime = m >= 8.5 * 60 && m < 18 * 60;
    const barnDung = w.dung.filter((d) => d.zone === 'barn');
    const wetBarn = w.cells.wet.reduce((n, v, i) => n + (v > 0.15 && zoneAt(cellCenter(i).x, cellCenter(i).y) === 'barn' ? 1 : 0), 0);
    const bareBedding = w.cells.bedding.reduce((n, v, i) => n + (isBeddingCell(i) && v < 0.6 && w.cells.wet[i] < 0.2 ? 1 : 0), 0);
    if (dayTime && allIn(s, 'paddock')) {
      if (w.gateOpen && (barnDung.length >= 1 || wetBarn >= 3 || bareBedding >= 8)) return this.gate(false);
      if (!w.gateOpen) {
        if (barnDung.length) return this.clean(s, 'barn', 'fork');
        if (wetBarn >= 1) return this.clean(s, 'barn', 'rake');
        if (bareBedding >= 6 && w.stock.straw > 0) return this.straw(s);
      }
    }
    // Вечером — уборка выгула, когда все внутри
    const paddockDung = w.dung.filter((d) => d.zone === 'paddock');
    if (!dayTime && allIn(s, 'barn') && !w.gateOpen && paddockDung.length >= 2) return this.clean(s, 'paddock', 'fork');

    // Тачка: полную — в контейнер; оставленную в вольере — вывезти
    if (w.barrow.load >= 6 || zoneAt(w.barrow.x, w.barrow.y)) return this.barrowDump(s);

    // Овощи в полдень и вечером
    const meal = m >= 12 * 60 && m < 14 * 60 ? `meal1:${day}` : m >= 17 * 60 && m < 18.5 * 60 ? `meal2:${day}` : null;
    if (meal && !this.done.has(meal) && w.stock.produce > 0) {
      this.done.add(meal);
      const inBarn = s.elephants.some((e) => zoneAt(e.x, e.y) === 'barn') || w.gateOpen;
      return {
        name: 'meal',
        steps: [go(st('prepTable')), act('prepRation'), ...(inBarn ? [go(st('barnTrough')), act('fillTrough')] : [go({ x: 35, y: 21.0 }, 0.25), act('scatter:paddock')])],
      };
    }
    // Ветки после обеда
    const browse = `browse:${day}`;
    if (m >= 14.5 * 60 && m < 16 * 60 && !this.done.has(browse) && w.stock.browse > 0) {
      this.done.add(browse);
      return { name: 'browse', steps: [go(st('browsePile')), act('takeBrowse'), go({ x: 38, y: 21.0 }, 0.25), act('tossBrowse:paddock')] };
    }

    // Ворота по распорядку
    if (dayTime && !w.gateOpen && barnDung.length === 0 && wetBarn < 3) return this.gate(true);
    if (!dayTime && !w.gateOpen && !allIn(s, 'barn')) return this.gate(true);
    if (!dayTime && w.gateOpen && allIn(s, 'barn') && !s.elephants.some((e) => Math.abs(e.x - 20) < 3.4 && Math.abs(e.y - 20) < 2.4)) return this.gate(false);

    // Свободная минута — постоять у решётки, понаблюдать
    const spot = { x: 21.5, y: 31.2 };
    if (dist(k, spot) > 1) return { name: 'idle', steps: [go(spot)] };
    return { name: 'watch', steps: [wait(() => false, 2)] };
  }

  private gate(open: boolean): Job {
    return { name: open ? 'gateOpen' : 'gateClose', steps: [go(st('gateControl')), act((s) => (s.world.gateOpen === open ? 'none' : 'gate:gate'))] };
  }

  private hay(id: 'barnRack' | 'paddockFeeder'): Job {
    return { name: `hay:${id}`, steps: [go(st('hayStack')), act('takeHay'), go(st(id)), act(`loadHay:${id}`)] };
  }

  private straw(s: State): Job {
    const c = s.world.cells;
    let best: Vec | null = null;
    let bestN = 0;
    for (let i = 0; i < c.bedding.length; i++) {
      if (!isBeddingCell(i) || c.bedding[i] >= 0.6 || c.wet[i] > 0.2) continue;
      const p = cellCenter(i);
      let n = 0;
      for (let j = 0; j < c.bedding.length; j++) if (isBeddingCell(j) && c.bedding[j] < 0.6 && dist(cellCenter(j), p) < 2.2) n++;
      if (n > bestN) {
        bestN = n;
        best = p;
      }
    }
    if (!best) return { name: 'idle', steps: [] };
    return { name: 'straw', steps: [go(st('strawStack')), act('takeStraw'), go(OUTSIDE_BARN_DOOR), go(INSIDE_BARN_DOOR), go(best, 0.4), act('spreadStraw'), go(INSIDE_BARN_DOOR), go(OUTSIDE_BARN_DOOR)] };
  }

  // Уборка вилами или граблями: взять инструмент, подкатить тачку, пройти по грязи
  private clean(s: State, zone: ZoneId, tool: 'fork' | 'rake'): Job {
    const doorOut = zone === 'barn' ? OUTSIDE_BARN_DOOR : OUTSIDE_PADDOCK_DOOR;
    const doorIn = zone === 'barn' ? INSIDE_BARN_DOOR : INSIDE_PADDOCK_DOOR;
    const steps: Step[] = [];
    steps.push(go({ x: 26.6, y: 38.5 }), act(`takeTool:${tool}`));
    steps.push(go((x) => this.barrowSide(x), 0.3), act('pushBarrow'), go(doorOut), go(doorIn, 0.6), act('parkBarrow'));
    const targets: Vec[] = [];
    if (tool === 'fork') for (const d of s.world.dung.filter((x) => x.zone === zone)) targets.push({ x: d.x, y: d.y });
    else {
      const c = s.world.cells;
      for (let i = 0; i < c.wet.length; i++) {
        const p = cellCenter(i);
        if (zoneAt(p.x, p.y) === zone && c.wet[i] + c.soil[i] > 0.15 && !targets.some((t) => dist(t, p) < 1.6)) targets.push(p);
      }
    }
    for (const t of targets.slice(0, 10)) {
      steps.push(go({ x: t.x + 0.6, y: t.y + 0.5 }, 0.5));
      steps.push({
        kind: 'act',
        optional: true,
        pick: (_x, opts) => opts.find((o) => o.enabled && (o.ref.verb === 'fork' || o.ref.verb === 'rake')),
      });
      steps.push({
        kind: 'act',
        optional: true,
        pick: (x, opts) => (x.keeper.held && 'load' in x.keeper.held && x.keeper.held.load >= 2 ? opts.find((o) => o.id === 'emptyTool:barrow') : undefined),
      });
    }
    steps.push(go((x) => this.barrowSide(x), 0.3), act('pushBarrow'), go(doorIn, 0.6), go(doorOut), go(st('container'), 1.6), optional(act('dumpBarrow')));
    return { name: `clean:${zone}:${tool}`, steps };
  }

  // Встать у ручек тачки: любая свободная сторона, ближайшая к киперу
  private barrowSide(s: State): Vec {
    const b = s.world.barrow;
    const nav = { gateOpen: s.world.gateOpen, barnDoor: zoneEmpty(s, 'barn'), paddockDoor: zoneEmpty(s, 'paddock') };
    let best: Vec = { x: b.x - 1.05, y: b.y };
    let bestD = Infinity;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = { x: b.x + Math.cos(a) * 1.05, y: b.y + Math.sin(a) * 1.05 };
      if (keeperFieldAt(p.x, p.y, nav) < 0.34) continue;
      const d = dist(p, s.keeper);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private barrowDump(s: State): Job {
    const b = s.world.barrow;
    const inside = zoneAt(b.x, b.y);
    const steps: Step[] = [go((x) => this.barrowSide(x), 0.3), act('pushBarrow')];
    if (inside === 'barn') steps.push(go(INSIDE_BARN_DOOR, 0.6), go(OUTSIDE_BARN_DOOR));
    if (inside === 'paddock') steps.push(go(INSIDE_PADDOCK_DOOR, 0.6), go(OUTSIDE_PADDOCK_DOOR));
    if (b.load > 0) steps.push(go(st('container'), 1.6), act('dumpBarrow'));
    return { name: 'barrowDump', steps };
  }

  private barrowHome(): Job {
    return { name: 'barrowHome', steps: [go({ x: BARROW_HOME.x - 1.0, y: BARROW_HOME.y - 1.0 }, 0.6), act('parkBarrow')] };
  }

  // Вещь в руках: инструмент — на стойку, шланг — на катушку, корм — по назначению
  private dispose(s: State): Job {
    const h = s.keeper.held!;
    switch (h.kind) {
      case 'fork':
      case 'rake':
        if (h.load > 0) return { name: 'emptyTool', steps: [go(st('container'), 1.6), act('emptyTool:container')] };
        return { name: 'returnTool', steps: [go({ x: h.kind === 'fork' ? TOOL_SLOTS.fork.x + 0.6 : TOOL_SLOTS.rake.x - 0.6, y: 38.5 }), act(`returnTool:${h.kind}`)] };
      case 'hose':
        return { name: 'returnHose', steps: [go(st('hoseReel')), act('returnHose')] };
      case 'hay':
        return this.hayDrop(s);
      case 'straw':
        return { name: 'strawDrop', steps: [act('drop:held')] };
      case 'ration':
        return { name: 'ration', steps: [go(st('barnTrough')), act('fillTrough')] };
      case 'browse':
        return { name: 'browse', steps: [go({ x: 38, y: 21.0 }, 0.25), act('tossBrowse:paddock')] };
    }
  }

  private hayDrop(s: State): Job {
    const id = s.world.hay.barnRack <= s.world.hay.paddockFeeder ? 'barnRack' : 'paddockFeeder';
    return { name: 'hayDrop', steps: [go(st(id)), act(`loadHay:${id}`)] };
  }
}

export const DOOR_IDS = DOORS.map((d) => d.id);
