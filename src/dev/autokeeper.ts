// Автокипер: бот, который играет смену настоящими командами (движение + действия) — так же,
// как игрок с клавиатуры. Нужен для сквозных тестов (всё ли достижимо и работает в связке)
// и для демо (?bot). Распорядок: поилки, сено, ворота на выгул, уборка стойл лопатой с тачкой,
// солома, смена воды в поилках, каша в 13:00 и 17:00, нарезка овощей и тазы к 19:00,
// ворота в слоновник, туалет в бак ночью, уборка выгула.

import { KEEPER } from '../data/balance';
import { BARROW_HOME, STALL_E, STALL_W, STATIONS, TANK_HOME, TROUGH_IDS, areaAt, hardFloor, type AreaId, type FeederId, type StationId, type TroughId } from '../data/facility';
import { PORRIDGE_SOAK_MIN } from '../data/rations';
import { availableActions, bodyDirt, minuteOfDay, type ActionOption, type Elephant, type State, type StepInput, type Vec } from '../sim';
import { keeperNav } from '../sim/keeper';
import { keeperFieldAt, keeperRoute } from '../sim/nav';
import { cellCenter, isBeddingCell } from '../sim/world';

type Step =
  | { kind: 'go'; to: (s: State) => Vec | null; tol: number }
  | { kind: 'act'; pick: (s: State, opts: ActionOption[]) => ActionOption | undefined; optional?: boolean; label: string }
  | { kind: 'wait'; until: (s: State) => boolean; max: number }
  | { kind: 'expand'; make: (s: State) => Step[] };

interface Job {
  name: string;
  steps: Step[];
}

const IDLE: StepInput = { move: { x: 0, y: 0 }, run: false, actions: [], cancel: false };

const go = (to: Vec | ((s: State) => Vec | null), tol = 0.45): Step => ({ kind: 'go', to: typeof to === 'function' ? to : () => to, tol });
const act = (prefix: string | ((s: State) => string), optional = false): Step => ({
  kind: 'act',
  label: typeof prefix === 'string' ? prefix : 'fn',
  optional,
  pick: (s, opts) => {
    const p = typeof prefix === 'function' ? prefix(s) : prefix;
    return opts.find((o) => o.id === p) ?? opts.find((o) => o.id.startsWith(p));
  },
});
const pick = (label: string, f: (s: State, o: ActionOption) => boolean, optional = false): Step => ({
  kind: 'act',
  label,
  optional,
  pick: (s, opts) => opts.find((o) => o.enabled && f(s, o)) ?? opts.find((o) => f(s, o)),
});
const wait = (until: (s: State) => boolean, max: number): Step => ({ kind: 'wait', until, max });
const expand = (make: (s: State) => Step[]): Step => ({ kind: 'expand', make });
const st = (id: StationId): Vec => STATIONS[id].keeper;

// Двери отсеков: точка перед дверью и сразу за ней
const ENTRY: Record<AreaId, { out: Vec; in: Vec }> = {
  stallW: { out: { x: 15.2, y: 31.0 }, in: { x: 15.2, y: 28.8 } },
  stallE: { out: { x: 25.2, y: 31.0 }, in: { x: 25.2, y: 28.8 } },
  paddock: { out: { x: 41.65, y: 21.1 }, in: { x: 41.65, y: 18.6 } },
};
// Где поставить тачку внутри
const INSIDE: Record<AreaId, Vec> = {
  stallW: { x: 15, y: 26 },
  stallE: { x: 25, y: 26 },
  paddock: { x: 40, y: 15 },
};
const STALLS: AreaId[] = ['stallW', 'stallE'];
const RACK: Record<'stallW' | 'stallE', FeederId> = { stallW: 'barnRackW', stallE: 'barnRackE' };
const TROUGH_OF: Record<AreaId, TroughId> = { stallW: 'barnWaterW', stallE: 'barnWaterE', paddock: 'paddockWater' };

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function areaOfE(e: Elephant): AreaId {
  return areaAt(e.x, e.y) ?? (e.y < 20 ? 'paddock' : e.x < 20 ? 'stallW' : 'stallE');
}

function allIn(s: State, areas: AreaId[]): boolean {
  return s.elephants.every((e) => areas.includes(areaOfE(e)));
}

// Точка в проходе напротив слонихи (или у ограды выгула)
function contactPoint(e: Elephant): Vec {
  const a = areaOfE(e);
  if (a === 'stallW') return { x: Math.max(10.9, Math.min(19.1, e.x)), y: 31.0 };
  if (a === 'stallE') return { x: Math.max(20.9, Math.min(29.1, e.x)), y: 31.0 };
  return e.x < 21 ? { x: Math.max(3, Math.min(9.2, e.x)), y: 21.1 } : { x: Math.max(32, Math.min(45, e.x)), y: 21.1 };
}

export class AutoKeeper {
  private job: Job | null = null;
  private route: Vec[] = [];
  private routeFor: Vec | null = null;
  private routeAge = 0;
  private stuck = 0;
  private escape = 0;
  private goTime = 0;
  private escapeDir: Vec = { x: 0, y: 0 };
  private waited = 0;
  private lastPos: Vec = { x: 0, y: 0 };
  private done = new Set<string>();
  private skip = new Map<string, number>();
  private tries = new Map<string, number>();
  private cool = new Map<string, number>();
  private now = 0;
  stats = { jobs: {} as Record<string, number>, failed: {} as Record<string, number> };

  decide(s: State): StepInput {
    this.now = s.t;
    if (s.keeper.task) return IDLE;
    // Нарезка овощей: левая рука — взять / бросить, правая — обрезать
    const p = s.keeper.prep;
    if (p) return { ...IDLE, actions: [p.hand && !p.trimmed ? 'prepTrim:R' : 'prepPick:L'] };
    for (let guard = 0; guard < 8; guard++) {
      if (!this.job) {
        this.job = this.plan(s);
        if (!this.job) return IDLE;
        if (this.cooling(this.job.name, s)) this.job = { name: 'cooldown', steps: [wait(() => false, 3)] };
        this.stats.jobs[this.job.name] = (this.stats.jobs[this.job.name] ?? 0) + 1;
        this.route = [];
        this.stuck = 0;
        this.waited = 0;
        this.goTime = 0;
      }
      const step = this.job.steps[0];
      if (!step) {
        this.job = null;
        continue;
      }
      if (step.kind === 'expand') {
        this.job.steps.splice(0, 1, ...step.make(s));
        continue;
      }
      if (step.kind === 'go') {
        const to = step.to(s);
        if (!to || dist(s.keeper, to) <= step.tol) {
          this.job.steps.shift();
          this.route = [];
          this.goTime = 0;
          continue;
        }
        // Не дойти за минуту реального времени — значит, туда не попасть: бросить задачу
        if (++this.goTime > 30 * 60) {
          this.goTime = 0;
          this.fail('timeout');
          return IDLE;
        }
        return this.moveTo(s, to);
      }
      if (step.kind === 'act') {
        const opt = step.pick(s, availableActions(s));
        this.job.steps.shift();
        if (!opt || !opt.enabled) {
          if (step.optional) continue;
          this.fail(opt ? `off:${opt.id}` : `noaction:${step.label}`);
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
      // Та же задача — не раньше чем через несколько минут: иначе бот застрянет на ней
      this.cool.set(this.job.name, this.now + 6);
    }
    this.job = null;
  }

  private cooling(name: string, s: State): boolean {
    return (this.cool.get(name) ?? -1) > s.t;
  }

  private moveTo(s: State, to: Vec): StepInput {
    const k = s.keeper;
    const nav = keeperNav(s);
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
    // Упёрся в угол (сетка путей грубее, чем стены): отступить туда, где просторнее
    if (this.stuck > 0.4 || this.escape > 0) {
      if (this.escape <= 0) {
        let best = { x: 0, y: 0 };
        let bestV = -1;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const v = keeperFieldAt(k.x + Math.cos(a) * 0.5, k.y + Math.sin(a) * 0.5, nav);
          if (v > bestV) {
            bestV = v;
            best = { x: Math.cos(a), y: Math.sin(a) };
          }
        }
        this.escapeDir = best;
        this.escape = 0.35;
        this.route = [];
      }
      this.escape -= 1 / 30;
      return { ...IDLE, move: this.escapeDir };
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
    const night = m >= 21 * 60 || m < 6 * 60;
    // День бота начинается в 6:30: слонов — на выгул, стойла убрать до сдачи смены в 8:00
    const dayTime = m >= 6.5 * 60 && m < 18 * 60;
    if (w.barrow.pushed) return this.barrowHome(s);
    if (k.held) return this.dispose(s);
    // Тачка, забытая в отсеке, — вывезти прежде всего: иначе ворота не открыть
    const barrowArea = areaAt(w.barrow.x, w.barrow.y);
    if (barrowArea && w.barrow.load === 0 && !w.barrow.cargo.length) return this.barrowOut(barrowArea);
    if (barrowArea) return this.barrowDump(s);

    // Шланг брошен на полу — поднять и смотать
    if (w.hose.state === 'floor' && !this.cooling('hoseHome', s)) return { name: 'hoseHome', steps: [go(w.hose.end, 0.8), act('grabHose', true), go(st('hoseReel'), 0.5), act('reelHose', true)] };

    // Инвентарь, оставшийся в тачке, — на стойку
    const toolIdx = w.barrow.cargo.findIndex((c) => c.kind === 'shovel' || c.kind === 'broom' || c.kind === 'rake' || c.kind === 'mop' || c.kind === 'brush');
    if (toolIdx >= 0 && !barrowArea) {
      const kind = w.barrow.cargo[toolIdx].kind;
      return { name: 'toolsHome', steps: [go((x) => this.barrowSide(x), 0.35), this.unstow(kind), go(st('toolRack')), act(`putBack:${kind}`)] };
    }

    // Краны поилок: закрыть, когда налито
    for (const id of TROUGH_IDS) {
      const t = w.troughs[id];
      if (t.valve && !t.drain && t.level >= 95) return { name: 'valveClose', steps: [go(st(id)), act(`valve:${id}`)] };
    }

    // Сигналы слонов
    for (const e of s.elephants) {
      const sig = e.signal;
      if (!sig) continue;
      const a = areaOfE(e);
      if (sig.kind === 'toilet') {
        if (night && a !== 'paddock') {
          const key = `toilet:${e.id}:${Math.floor(s.t / 30)}`;
          if (!this.done.has(key) && w.items.some((it) => it.kind === 'tank' && dist(it, TANK_HOME) < 1.5)) {
            this.done.add(key);
            return this.toiletTank(e);
          }
        } else if (!w.gates.outer && a !== 'paddock' && !night) return this.gate('outer', true);
      }
      if ((sig.kind === 'out' && !w.gates.outer) || (sig.kind === 'in' && !w.gates.outer && !night)) return this.gate('outer', true);
      if (sig.kind === 'water') {
        const id = TROUGH_OF[a];
        const t = w.troughs[id];
        if (!t.valve && t.stage === 'ok' && !t.drain && t.level < 90) return { name: 'water', steps: [go(st(id)), act(`valve:${id}`)] };
        // Полная, но пить не хочет — в воде сор или средство: сменить воду
        if (!t.valve && t.stage === 'ok' && (t.debris > 0.3 || t.chem > 0.05) && w.supplies.chem > 0 && !this.cooling(`troughChange:${id}`, s)) return this.troughChange(id);
      }
      if (sig.kind === 'food' && w.stock.hay > 0) return this.hay(a === 'paddock' ? 'paddockFeeder' : RACK[a], s);
    }

    // Вода: долить, если мало
    for (const id of TROUGH_IDS) {
      const t = w.troughs[id];
      if (!t.valve && !t.drain && t.stage === 'ok' && t.level < 45) return { name: 'water', steps: [go(st(id)), act(`valve:${id}`)] };
    }
    // Начатую смену воды — довести до конца (пока наливается после промывки — ждать не надо)
    for (const id of TROUGH_IDS) {
      const t = w.troughs[id];
      const filling = t.stage === 'rinsed' && t.valve && !t.drain;
      if ((t.stage !== 'ok' || t.drain) && !filling && !this.cooling(`troughFinish:${id}`, s)) return this.troughFinish(id);
    }
    // Рано утром, пока все в стойлах, — сменить воду на выгуле
    if (m >= 5 * 60 && m < 6.5 * 60 && allIn(s, STALLS) && !w.gates.outer && !w.checks.troughChanged.paddockWater && w.supplies.chem > 0 && !this.cooling('troughChange:paddockWater', s)) return this.troughChange('paddockWater');

    // Сено
    if (w.stock.hay > 0) {
      if ((m >= 15.5 * 60 || m < 6 * 60) && !w.gates.outer) for (const a of ['stallW', 'stallE'] as const) if (w.feeders[RACK[a]].hay < 30) return this.hay(RACK[a], s);
      if (w.feeders.paddockFeeder.hay < 30 && m >= 6 * 60 && m < 16 * 60) return this.hay('paddockFeeder', s);
    }

    // Лакомства в сумке
    if (k.pouch < 3) return { name: 'pouch', steps: [go(st('fridge')), act('refillPouch')] };

    // Каша: замешать за час до 13:00 и 17:00, покормить, когда запарилась
    for (const meal of [13, 17]) {
      const key = `mix:${meal}:${day}`;
      if (m >= (meal - 1) * 60 && m < (meal + 1) * 60 && !this.done.has(key) && !w.items.some((it) => it.kind === 'porridge' && it.load > 0)) {
        this.done.add(key);
        return { name: 'porridgeMix', steps: [go(st('porridgeStation')), ...s.elephants.map((e) => act(`mixPorridge:${e.id}`, true))] };
      }
    }
    if (m >= 13 * 60 && m < 21 * 60) {
      const ready = w.items.find((it) => it.kind === 'porridge' && it.load > 0 && s.t - it.aux >= PORRIDGE_SOAK_MIN && !this.skipped(`porridge:${it.id}`, s));
      const e = ready && s.elephants.find((x) => x.id === ready.owner);
      if (ready && e) return this.porridge(ready.id, e, s);
    }
    // Скоро каша — длинную работу не начинать
    const porridgeDue = w.items.some((it) => it.kind === 'porridge' && it.load > 0 && s.t - it.aux >= PORRIDGE_SOAK_MIN - 20);

    // Тазы: пустые забрать и помыть; к вечеру — нарезка и тазы к 19:00
    const floorTub = w.tubs.find((t) => t.where === 'floor' && (t.broken || Object.values(t.veg).reduce((x, y) => x + y, 0) < 0.5) && !this.skipped(`tub:${t.id}`, s));
    if (floorTub) {
      const a = areaAt(floorTub.x, floorTub.y);
      if (a && (this.inside(s, a) || this.nearLine(floorTub))) return this.collectTub(s, floorTub.id, a);
    }
    if (m >= 14.5 * 60 && m < 19 * 60 && !porridgeDue) {
      const tub = w.tubs.find((t) => t.where === 'rack' && !t.dirty && !t.broken && !this.done.has(`prep:${t.id}:${day}`));
      const onTable = w.tubs.find((t) => t.where === 'prep');
      if (onTable) return { name: 'serveTub', steps: [go(st('prepTable')), act(`takeTub:${onTable.id}`), go((x) => this.tubSpot(x, onTable.owner), 0.5), act('placeTub')] };
      if (tub) {
        this.done.add(`prep:${tub.id}:${day}`);
        return {
          name: 'prepVeg',
          steps: [go(st('tubRack')), act(`takeTub:${tub.id}`), go(st('prepTable')), act(`prepVeg:${tub.id}`), wait((x) => !x.keeper.prep, 5), act(`takeTub:${tub.id}`, true), go((x) => this.tubSpot(x, tub.owner), 0.5), act('placeTub', true)],
        };
      }
    }
    if (m >= 18.75 * 60 && m < 21 * 60) {
      const ready = w.tubs.find((t) => t.where === 'prep');
      if (ready) return { name: 'serveTub', steps: [go(st('prepTable')), act(`takeTub:${ready.id}`), go((x) => this.tubSpot(x, ready.owner), 0.5), act('placeTub')] };
    }

    // Уборка стойл: все на выгуле, ворота закрыты — зайти с тачкой и лопатой
    if (dayTime && allIn(s, ['paddock']) && !porridgeDue) {
      const dirty = STALLS.filter((a) => this.stallDirt(s, a) >= 2 || this.hardLitter(s, a) >= 3);
      if (w.gates.outer && (dirty.length || this.bareBedding(s, 'stallW') + this.bareBedding(s, 'stallE') >= 10)) return this.gate('outer', false);
      if (!w.gates.outer) {
        if (dirty.length && w.barrow.load < KEEPER.barrowMax - 1) return this.cleanArea(dirty[0], s);
        for (const a of STALLS) if (this.bareBedding(s, a) >= 6 && w.stock.straw > 0) return this.straw(s, a);
      }
      // Смена воды раз за смену — пока у поилок никого (поилки у решётки, кипер — в проходе)
      for (const id of ['barnWaterW', 'barnWaterE'] as const) if (!w.checks.troughChanged[id] && w.supplies.chem > 0 && !this.cooling(`troughChange:${id}`, s)) return this.troughChange(id);
    }
    // Грязную слониху — помыть из шланга через ограду выгула
    if (dayTime && !porridgeDue && w.hose.state === 'reel') {
      const dirtyE = s.elephants.find((e) => areaOfE(e) === 'paddock' && bodyDirt(e) > 0.3 && !e.lying && !this.done.has(`wash:${e.id}:${Math.floor(s.t / 120)}`));
      if (dirtyE) {
        this.done.add(`wash:${dirtyE.id}:${Math.floor(s.t / 120)}`);
        return this.wash(dirtyE);
      }
    }
    // Вечером, когда все в стойлах, — уборка выгула и смена воды на выгуле
    if (!dayTime && !night && allIn(s, STALLS) && !w.gates.outer && !porridgeDue) {
      if (this.paddockDirt(s) >= 2 && w.barrow.load < KEEPER.barrowMax - 1) return this.cleanArea('paddock', s);
    }
    // Полная тачка — в контейнер
    if (w.barrow.load >= KEEPER.barrowMax - 1) return this.barrowDump(s);

    // Ветки после обеда
    const browse = `browse:${day}`;
    if (m >= 14.5 * 60 && m < 16 * 60 && !this.done.has(browse) && w.stock.browse > 0 && s.elephants.some((e) => areaOfE(e) === 'paddock')) {
      this.done.add(browse);
      return { name: 'browse', steps: [go(st('browsePile')), act('take:browse'), go({ x: 38, y: 21.1 }, 0.3), act('tossBrowse')] };
    }

    // Ворота по распорядку
    const stallsDirty = STALLS.some((a) => this.stallDirt(s, a) >= 2);
    if (dayTime && !w.gates.outer && !stallsDirty && w.feeders.paddockFeeder.hay > 20 && m < 16 * 60 && !allIn(s, ['paddock'])) return this.gate('outer', true);
    if (!dayTime && !w.gates.outer && !allIn(s, STALLS)) return this.gate('outer', true);
    if (!dayTime && w.gates.outer && allIn(s, STALLS) && !this.nearOuterGate(s)) return this.gate('outer', false);
    if (!w.gates.shift && !night) return this.gate('shift', true);

    // Свободная минута — постоять у решётки, понаблюдать
    const spot = { x: 21.5, y: 31.2 };
    if (dist(k, spot) > 1) return { name: 'idle', steps: [go(spot)] };
    return { name: 'watch', steps: [wait(() => false, 2)] };
  }

  // Куда поставить таз слонихи: напротив неё, если она в стойле, иначе — её место в стойле
  private tubSpot(s: State, owner: string): Vec {
    const e = s.elephants.find((x) => x.id === owner);
    if (e && areaOfE(e) !== 'paddock') return contactPoint(e);
    const i = Math.max(0, s.elephants.findIndex((x) => x.id === owner));
    return [
      { x: 12.4, y: 31 },
      { x: 22.4, y: 31 },
      { x: 19.2, y: 31 },
      { x: 29.2, y: 31 },
    ][i % 4];
  }

  private skipped(key: string, s: State): boolean {
    return (this.skip.get(key) ?? -1) > s.t;
  }

  private inside(s: State, a: AreaId): boolean {
    return s.elephants.every((e) => areaOfE(e) !== a) && (a !== 'paddock' ? !s.world.gates.outer || !s.elephants.some((e) => areaOfE(e) === 'paddock') : !s.world.gates.outer);
  }

  private nearLine(t: Vec): boolean {
    return (t.y > 27.6 && t.y < 30 && t.x > 10.3 && t.x < 29.7) || (t.y > 18 && t.y < 20 && t.x > 30.3 && t.x < 45.7);
  }

  private nearOuterGate(s: State): boolean {
    return s.elephants.some((e) => Math.abs(e.x - 15.5) < 3.6 && Math.abs(e.y - 20) < 2.6);
  }

  private stallDirt(s: State, a: AreaId): number {
    const w = s.world;
    let n = w.dung.filter((d) => areaAt(d.x, d.y) === a).length * 2;
    const c = w.cells;
    for (let i = 0; i < c.wet.length; i++) {
      const p = cellCenter(i);
      if (areaAt(p.x, p.y) !== a) continue;
      if (c.wet[i] > 0.3 || c.soil[i] > 0.35 || c.sawdust[i] > 0.3) n += 0.25;
    }
    return n;
  }

  private paddockDirt(s: State): number {
    return s.world.dung.filter((d) => areaAt(d.x, d.y) === 'paddock').length;
  }

  private bareBedding(s: State, a: AreaId): number {
    const c = s.world.cells;
    let n = 0;
    for (let i = 0; i < c.bedding.length; i++) {
      if (!isBeddingCell(i) || c.bedding[i] >= 0.5 || c.wet[i] > 0.2 || c.soil[i] > 0.2) continue;
      const p = cellCenter(i);
      if (areaAt(p.x, p.y) === a) n++;
    }
    return n;
  }

  private gate(id: 'outer' | 'shift', open: boolean): Job {
    return { name: `${id}:${open ? 'open' : 'close'}`, steps: [go(st('gatePanel'), 0.5), act((s) => (s.world.gates[id] === open ? 'none' : `gate:${id}`), true), wait((s) => s.world.gates[id] === open, 4)] };
  }

  // Сено: тюк в руках (быстро, но с тюка сыплется) или, если тачка свободна, — тюки в тачке
  private hay(id: FeederId, s?: State): Job {
    const b = s?.world.barrow;
    if (s && b && !b.pushed && b.load === 0 && !b.cargo.length && !areaAt(b.x, b.y) && s.world.stock.hay >= 2) {
      const ids: FeederId[] = [id];
      for (const other of ['barnRackW', 'barnRackE', 'paddockFeeder'] as const) {
        if (other === id || ids.length >= 2) continue;
        const m = minuteOfDay(s.t);
        const due = other === 'paddockFeeder' ? m >= 6 * 60 && m < 15 * 60 : m >= 15 * 60 || m < 6 * 60;
        if (due && s.world.feeders[other].hay < 55) ids.push(other);
      }
      const steps: Step[] = [go((x) => this.barrowSide(x), 0.35), act('pushBarrow'), go({ x: 37.8, y: 35.4 }, 0.6), act('parkBarrow')];
      for (let i = 0; i < ids.length; i++) steps.push(go(st('hayStack'), 0.5), act('take:hay'), go((x) => this.barrowSide(x), 0.35), act('stow:barrow'));
      for (const f of ids) steps.push(act('pushBarrow'), go(st(f), 0.6), act('parkBarrow'), go(st(f), 0.5), act(`loadFeeder:${f}:barrowHay`, true));
      steps.push(go((x) => this.barrowSide(x), 0.35), act('pushBarrow'), go({ x: BARROW_HOME.x - 1.2, y: BARROW_HOME.y - 0.9 }, 0.6), act('parkBarrow'));
      return { name: 'hayBarrow', steps };
    }
    return { name: `hay:${id}`, steps: [go(st('hayStack')), act('take:hay'), go(st(id)), act(`loadFeeder:${id}:hay`)] };
  }

  // Туалет в бак у тренировочной стенки: бак — к стенке, позвать, «Давай гуляй», наградить, вылить
  private toiletTank(e: Elephant): Job {
    const id = e.id;
    return {
      name: 'toiletTank',
      steps: [
        go(TANK_HOME, 0.9),
        pick('takeTank', (_s, o) => o.ref.verb === 'pickUp' && o.label.includes('бак')),
        go(st('trainingWall'), 0.4),
        act(`call:${id}:toilet`, true),
        wait((x) => {
          const q = x.elephants.find((z) => z.id === id)!;
          return dist(q, STATIONS.trainingWall.slots![1]) <= 1.1 || (q.act.kind !== 'follow' && !q.signal);
        }, 30),
        act(`tankPlace:${id}`, true),
        act(`toiletCmd:${id}`, true),
        wait((x) => {
          const q = x.elephants.find((z) => z.id === id)!;
          return q.act.kind !== 'urinate';
        }, 6),
        act(`treat:${id}`, true),
        pick('tankTake', (_s, o) => o.ref.verb === 'tankTake', true),
        expand((x) => (x.keeper.held?.kind === 'tank' ? [] : [pick('tankPick', (_s, o) => o.ref.verb === 'pickUp' && o.label.includes('бак'), true)])),
      ],
    };
  }

  // Мытьё из шланга: шланг с катушки, к ограде у слонихи (восточный участок — докуда хватает шланга),
  // позвать, помыть несколько раз, смотать шланг
  private wash(e: Elephant): Job {
    const id = e.id;
    const spot = (x: State) => {
      const q = x.elephants.find((z) => z.id === id) ?? e;
      return { x: Math.max(32, Math.min(42, q.x)), y: 21.1 };
    };
    const touch = (x: State) => availableActions(x).some((o) => o.elephantId === id && o.ref.verb === 'treat');
    return {
      name: 'wash',
      steps: [
        go(st('hoseReel'), 0.5),
        act('takeHose'),
        go(spot, 0.6),
        expand((x) => (touch(x) ? [] : [act(`call:${id}`, true), wait(touch, 25)])),
        act(`hoseWash:${id}`, true),
        act(`hoseWash:${id}`, true),
        act(`hoseWash:${id}`, true),
        go(st('hoseReel'), 0.5),
        act('reelHose', true),
      ],
    };
  }

  private porridge(itemId: number, e: Elephant, s: State): Job {
    const id = e.id;
    const target = (x: State) => contactPoint(x.elephants.find((q) => q.id === id) ?? e);
    const it = s.world.items.find((x) => x.id === itemId);
    const atStation = it && dist(it, st('porridgeStation')) < 2.5;
    return {
      name: 'porridge',
      steps: [
        ...(atStation ? [go(st('porridgeStation')), act(`takePorridge:${itemId}`)] : [go(it ?? st('porridgeStation'), 0.8), act(`pickUp:${itemId}`)]),
        go(target, 0.6),
        expand((s) => (availableActions(s).some((o) => o.id === `feedPorridge:${id}` && o.enabled) ? [] : [act(`call:${id}`, true), wait((x) => availableActions(x).some((o) => o.id === `feedPorridge:${id}`), 25)])),
        act(`feedPorridge:${id}`, true),
      ],
    };
  }

  private collectTub(s: State, tubId: number, a: AreaId): Job {
    if (this.inside(s, a) && a !== 'paddock') {
      const e = ENTRY[a];
      return {
        name: 'collectTub',
        steps: [
          go(e.out, 0.4),
          go(e.in, 0.5),
          go((x) => {
            const t = x.world.tubs.find((q) => q.id === tubId);
            return t && t.where === 'floor' ? this.standNear(x, t, 0.95) : null;
          }, 0.4),
          act(`collectTub:${tubId}`, true),
          expand((x) => {
            if (x.keeper.held?.kind !== 'tub') this.skip.set(`tub:${tubId}`, x.t + 120);
            return [go(e.in, 0.5), go(e.out, 0.5)];
          }),
        ],
      };
    }
    return {
      name: 'collectTubHook',
      steps: [
        go((x) => {
          const t = x.world.tubs.find((q) => q.id === tubId);
          if (!t) return null;
          return t.y < 20 ? { x: Math.max(31, Math.min(45, t.x)), y: 21.1 } : { x: Math.max(10.9, Math.min(29.1, t.x)), y: 31.0 };
        }, 0.4),
        act(`collectTub:${tubId}`, true),
        expand((x) => {
          if (x.keeper.held?.kind !== 'tub') this.skip.set(`tub:${tubId}`, x.t + 120);
          return [];
        }),
      ],
    };
  }

  // Смена воды: слить, средство, ёрш, ополоснуть проточной водой, закрыть слив, налить
  private troughChange(id: TroughId): Job {
    return {
      name: `troughChange:${id}`,
      steps: [go(st('cabinet')), act('take:chem'), go(st(id), 0.4), act(`drainTrough:${id}`), wait((s) => s.world.troughs[id].level <= 1 || s.world.troughs[id].stage === 'drained', 20), expand(() => this.troughFinishSteps(id))],
    };
  }

  private troughFinish(id: TroughId): Job {
    return { name: `troughFinish:${id}`, steps: [go(st(id), 0.4), expand(() => this.troughFinishSteps(id))] };
  }

  private troughFinishSteps(id: TroughId): Step[] {
    return [
      expand((s) => {
        const t = s.world.troughs[id];
        const h = s.keeper.held;
        if (t.stage === 'ok' && !t.drain) return t.level < 60 && !t.valve ? [act(`valve:${id}`)] : [];
        if (t.stage === 'ok' && t.drain && t.level > 1) return [wait((x) => x.world.troughs[id].level <= 1, 20), expand(() => this.troughFinishSteps(id))];
        if ((t.stage === 'drained' || (t.stage === 'ok' && t.drain)) && h?.kind !== 'chem') {
          // Без средства — ополоснуть нечего: закрыть слив и налить (смена будет неполной)
          if (s.world.supplies.chem <= 0) return [act(`drainTrough:${id}`, true), act(`valve:${id}`, true)];
          return [go(st('cabinet')), act('take:chem'), go(st(id), 0.4), expand(() => this.troughFinishSteps(id))];
        }
        if (t.stage === 'drained' || (t.stage === 'ok' && t.drain)) return [act(`chemTrough:${id}`), expand(() => this.troughFinishSteps(id))];
        if (t.stage === 'chem') return [act(`scrubTrough:${id}`), expand(() => this.troughFinishSteps(id))];
        if (t.stage === 'scrubbed') return [...(t.drain ? [] : [act(`drainTrough:${id}`)]), act(`rinseTrough:${id}`), expand(() => this.troughFinishSteps(id))];
        if (t.stage === 'rinsed') return [...(t.drain ? [act(`drainTrough:${id}`)] : []), ...(t.valve ? [] : [act(`valve:${id}`)])];
        return [];
      }),
    ];
  }

  private straw(s: State, a: AreaId): Job {
    const c = s.world.cells;
    let best: Vec | null = null;
    let bestN = 0;
    for (let i = 0; i < c.bedding.length; i++) {
      const p = cellCenter(i);
      if (!isBeddingCell(i) || areaAt(p.x, p.y) !== a || c.bedding[i] >= 0.5 || c.wet[i] > 0.2) continue;
      let n = 0;
      for (let j = 0; j < c.bedding.length; j++) if (isBeddingCell(j) && c.bedding[j] < 0.5 && dist(cellCenter(j), p) < 2.2) n++;
      if (n > bestN) {
        bestN = n;
        best = p;
      }
    }
    if (!best) return { name: 'idle', steps: [] };
    const e = ENTRY[a];
    const b = s.world.barrow;
    const spot = best;
    // Тюк — в тачке: с тюка в руках по дороге сыплется
    if (!b.pushed && b.load === 0 && !b.cargo.length && !areaAt(b.x, b.y))
      return {
        name: 'strawBarrow',
        steps: [
          go((x) => this.barrowSide(x), 0.35),
          act('pushBarrow'),
          go({ x: 42.2, y: 35.3 }, 0.6),
          act('parkBarrow'),
          go(st('strawStack'), 0.5),
          act('take:straw'),
          go((x) => this.barrowSide(x), 0.35),
          act('stow:barrow'),
          act('pushBarrow'),
          go(e.out, 0.35),
          go(e.in, 0.5),
          go(INSIDE[a], 0.8),
          act('parkBarrow'),
          this.unstow('straw'),
          go(spot, 0.5),
          act('spreadStraw', true),
          expand((x) => (x.keeper.held?.kind === 'straw' ? [act('spreadStraw', true)] : [])),
          go((x) => this.barrowSide(x), 0.35),
          act('pushBarrow'),
          go(e.in, 0.5),
          go(e.out, 0.5),
          go({ x: BARROW_HOME.x - 1.2, y: BARROW_HOME.y - 0.9 }, 0.6),
          act('parkBarrow'),
        ],
      };
    return { name: 'straw', steps: [go(st('strawStack')), act('take:straw'), go(e.out, 0.4), go(e.in, 0.5), go(spot, 0.5), act('spreadStraw'), go(e.in, 0.5), go(e.out, 0.5)] };
  }

  // Уборка отсека: лопату (и метлу, если на бетоне сено) — в тачку, тачку — в отсек; метлой сено
  // в кучи, лопатой навоз, мокрое и кучи — в тачку; тачку — в контейнер, инструмент — на стойку
  private cleanArea(a: AreaId, s: State): Job {
    const e = ENTRY[a];
    const tools: ('shovel' | 'broom')[] = a !== 'paddock' && this.hardLitter(s, a) >= 2 ? ['broom', 'shovel'] : ['shovel'];
    const steps: Step[] = [];
    for (const t of tools)
      steps.push(expand((x) => (x.world.tools[t] ? [go(st('toolRack')), act(`take:${t}`), go((y) => this.barrowSide(y), 0.35), act('stow:barrow')] : x.world.barrow.cargo.some((c) => c.kind === t) ? [] : [act(`take:${t}`)])));
    steps.push(act('pushBarrow'), go(e.out, 0.35), go(e.in, 0.5), go(INSIDE[a], 0.8), act('parkBarrow'));
    if (tools.includes('broom')) steps.push(this.unstow('broom'), this.sweepLoop(a, 0), go((x) => this.barrowSide(x), 0.35), act('stow:barrow', true));
    steps.push(
      this.unstow('shovel'),
      this.scoop(a, 0),
      go((x) => this.barrowSide(x), 0.35),
      expand((x) => (x.keeper.held?.kind === 'shovel' && x.keeper.held.load > 0 ? [act('dumpShovel:barrow', true)] : [])),
      act('stow:barrow', true),
      act('pushBarrow'),
      go(e.in, 0.5),
      go(e.out, 0.5),
      go(st('container'), 1.6),
      act('dumpBarrow', true),
      go({ x: BARROW_HOME.x - 1.2, y: BARROW_HOME.y - 0.9 }, 0.6),
      act('parkBarrow'),
    );
    for (const t of tools) steps.push(this.unstow(t, true), go(st('toolRack')), act(`putBack:${t}`, true));
    return { name: `clean:${a}`, steps };
  }

  private unstow(kind: string, optional = false): Step {
    return pick(`unstow:${kind}`, (s, o) => o.ref.verb === 'unstow' && s.world.barrow.cargo[Number(o.ref.target)]?.kind === kind, optional);
  }

  // Сено и солома на бетоне: метлой в кучу (кучу потом — лопатой)
  private sweepLoop(a: AreaId, n: number): Step {
    return expand((s) => {
      if (s.keeper.held?.kind !== 'broom' || n > 30) return [];
      const t = this.nextLitter(s, a);
      if (!t) return [];
      const k = s.keeper;
      const d = dist(k, t.p) || 1;
      const ap = { x: t.p.x + ((k.x - t.p.x) / d) * 0.75, y: t.p.y + ((k.y - t.p.y) / d) * 0.75 };
      return [
        go(ap, 0.3),
        go({ x: ap.x + (t.p.x - ap.x) * 0.2, y: ap.y + (t.p.y - ap.y) * 0.2 }, 0.1),
        pick('sweep', (_x, o) => o.ref.verb === 'sweep', true),
        expand((x) => {
          if (x.world.cells.litter[t.i] > 0.15) this.skip.set(t.key, x.t + 60);
          return [];
        }),
        this.sweepLoop(a, n + 1),
      ];
    });
  }

  private nextLitter(s: State, a: AreaId): { p: Vec; key: string; i: number } | null {
    const c = s.world.cells;
    let best: { p: Vec; key: string; i: number } | null = null;
    let bestD = Infinity;
    for (let i = 0; i < c.litter.length; i++) {
      if (c.litter[i] <= 0.15 || isBeddingCell(i)) continue;
      const p = cellCenter(i);
      if (areaAt(p.x, p.y) !== a || !hardFloor(p.x, p.y)) continue;
      const key = `litter:${i}`;
      if (this.skipped(key, s)) continue;
      const d = dist(s.keeper, p);
      if (d < bestD) {
        bestD = d;
        best = { p, key, i };
      }
    }
    return best;
  }

  private hardLitter(s: State, a: AreaId): number {
    const c = s.world.cells;
    let n = 0;
    for (let i = 0; i < c.litter.length; i++) {
      if (c.litter[i] <= 0.15 || isBeddingCell(i)) continue;
      const p = cellCenter(i);
      if (areaAt(p.x, p.y) === a && hardFloor(p.x, p.y)) n++;
    }
    return n;
  }

  // Одна порция лопатой: ближайшая грязь — подцепить, скинуть в тачку; и так, пока есть что убирать.
  // Далеко от тачки — сначала подкатить её поближе (лопату — в тачку, руки свободны)
  private scoop(a: AreaId, n: number): Step {
    return expand((s) => {
      const h = s.keeper.held;
      if (h?.kind !== 'shovel' || n > 50) return [];
      if (s.world.barrow.load >= KEEPER.barrowMax) return [];
      const t = this.nextDirt(s, a);
      if (!t) return [];
      const k = s.keeper;
      const b = s.world.barrow;
      if (dist(b, t.p) > 6 && h.load <= 0) {
        const near = { x: t.p.x + ((b.x - t.p.x) / (dist(b, t.p) || 1)) * 2.2, y: t.p.y + ((b.y - t.p.y) / (dist(b, t.p) || 1)) * 2.2 };
        return [go((x) => this.barrowSide(x), 0.35), act('stow:barrow'), act('pushBarrow'), go(near, 0.8), act('parkBarrow'), this.unstow('shovel'), this.scoop(a, n + 1)];
      }
      const d = dist(k, t.p) || 1;
      const ap = { x: t.p.x + ((k.x - t.p.x) / d) * 0.55, y: t.p.y + ((k.y - t.p.y) / d) * 0.55 };
      return [
        go(ap, 0.3),
        go(t.p, 0.45),
        pick('shovel', (_x, o) => o.ref.verb === 'shovel', true),
        expand((x) => {
          if (x.keeper.held?.kind === 'shovel' && x.keeper.held.load <= 0) this.skip.set(t.key, x.t + 60);
          return [];
        }),
        expand((x) => (x.keeper.held?.kind === 'shovel' && x.keeper.held.load > 0 ? [go((y) => this.barrowSide(y), 1.2), act('dumpShovel:barrow', true)] : [])),
        this.scoop(a, n + 1),
      ];
    });
  }

  private nextDirt(s: State, a: AreaId): { p: Vec; key: string } | null {
    const k = s.keeper;
    const w = s.world;
    let best: { p: Vec; key: string } | null = null;
    let bestD = Infinity;
    for (const d of w.dung) {
      if (areaAt(d.x, d.y) !== a) continue;
      const key = `dung:${d.id}`;
      if (this.skipped(key, s)) continue;
      const dd = dist(k, d);
      if (dd < bestD) {
        bestD = dd;
        best = { p: { x: d.x, y: d.y }, key };
      }
    }
    if (best) return best;
    for (const it of w.items) {
      if ((it.kind !== 'pile' && it.kind !== 'shard') || areaAt(it.x, it.y) !== a) continue;
      const key = `item:${it.id}`;
      if (this.skipped(key, s)) continue;
      const dd = dist(k, it);
      if (dd < bestD) {
        bestD = dd;
        best = { p: { x: it.x, y: it.y }, key };
      }
    }
    if (best) return best;
    const c = w.cells;
    for (let i = 0; i < c.wet.length; i++) {
      const p = cellCenter(i);
      if (areaAt(p.x, p.y) !== a) continue;
      const v = Math.max(a === 'paddock' ? 0 : c.wet[i], c.soil[i], c.sawdust[i]);
      if (v < 0.3) continue;
      const key = `cell:${i}`;
      if (this.skipped(key, s)) continue;
      const dd = dist(k, p) - v;
      if (dd < bestD) {
        bestD = dd;
        best = { p, key };
      }
    }
    return best;
  }

  // Точка рядом с p, где кипер точно поместится (ближайшая к нему)
  private standNear(s: State, p: Vec, r: number): Vec {
    const nav = keeperNav(s);
    let best: Vec = p;
    let bestD = Infinity;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
      if (keeperFieldAt(q.x, q.y, nav) < 0.45) continue;
      const d = dist(q, s.keeper);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    return best;
  }

  // Встать у тачки: любая свободная сторона, ближайшая к киперу
  private barrowSide(s: State): Vec {
    const b = s.world.barrow;
    const nav = keeperNav(s);
    let best: Vec = { x: b.x - 1.05, y: b.y };
    let bestD = Infinity;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const p = { x: b.x + Math.cos(ang) * 1.05, y: b.y + Math.sin(ang) * 1.05 };
      if (keeperFieldAt(p.x, p.y, nav) < 0.34) continue;
      const d = dist(p, s.keeper);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private barrowOut(a: AreaId): Job {
    const e = ENTRY[a];
    return { name: 'barrowOut', steps: [go((x) => this.barrowSide(x), 0.35), act('pushBarrow'), go(e.in, 0.5), go(e.out, 0.5), go({ x: BARROW_HOME.x - 1.2, y: BARROW_HOME.y - 0.9 }, 0.6), act('parkBarrow')] };
  }

  private barrowDump(s: State): Job {
    const b = s.world.barrow;
    const inside = areaAt(b.x, b.y);
    const steps: Step[] = [go((x) => this.barrowSide(x), 0.35), act('pushBarrow')];
    if (inside) steps.push(go(ENTRY[inside].in, 0.5), go(ENTRY[inside].out, 0.5));
    steps.push(go(st('container'), 1.6), act('dumpBarrow', true), go({ x: BARROW_HOME.x - 1.2, y: BARROW_HOME.y - 0.9 }, 0.6), act('parkBarrow'));
    return { name: 'barrowDump', steps };
  }

  private barrowHome(s: State): Job {
    const b = s.world.barrow;
    const inside = areaAt(b.x, b.y) ?? areaAt(s.keeper.x, s.keeper.y);
    const steps: Step[] = [];
    if (inside) steps.push(go(ENTRY[inside].in, 0.5), go(ENTRY[inside].out, 0.5));
    if (b.load > 0) steps.push(go(st('container'), 1.6), act('dumpBarrow', true));
    steps.push(go({ x: BARROW_HOME.x - 1.2, y: BARROW_HOME.y - 0.9 }, 0.6), act('parkBarrow'));
    return { name: 'barrowHome', steps };
  }

  // Вещь в руках: инструмент — на стойку, корм — по назначению, бак — вылить и на место
  private dispose(s: State): Job {
    const h = s.keeper.held!;
    const here = areaAt(s.keeper.x, s.keeper.y);
    const exit: Step[] = here ? [go(ENTRY[here].in, 0.5), go(ENTRY[here].out, 0.5)] : [];
    switch (h.kind) {
      case 'shovel':
        if (h.load > 0) return { name: 'emptyShovel', steps: [...exit, go(st('container'), 1.6), act('dumpShovel:container')] };
        return { name: 'returnTool', steps: [...exit, go(st('toolRack')), act(`putBack:${h.kind}`)] };
      case 'rake':
      case 'broom':
      case 'mop':
      case 'brush':
        return { name: 'returnTool', steps: [...exit, go(st('toolRack')), act(`putBack:${h.kind}`)] };
      case 'hose':
        return { name: 'returnHose', steps: [go(st('hoseReel'), 0.5), act('reelHose', true), expand((x) => (x.keeper.held?.kind === 'hose' ? [act('drop:held', true)] : []))] };
      case 'hay':
        return { name: 'hayDrop', steps: [...exit, go(st('barnRackW')), act('loadFeeder:barnRackW:hay')] };
      case 'straw':
        return { name: 'strawDrop', steps: [act('spreadStraw', true), act('drop:held', true)] };
      case 'browse':
      case 'bamboo':
        return { name: 'browse', steps: [...exit, go({ x: 38, y: 21.1 }, 0.3), act('tossBrowse')] };
      case 'chem':
      case 'washKit':
        return { name: 'putBack', steps: [...exit, go(st('cabinet')), act(`putBack:${h.kind}`)] };
      case 'tank':
        if (h.load > 0) return { name: 'tankEmpty', steps: [...exit, go(st('washSink')), act('wash:emptyTank'), act('wash:tank', true), go(TANK_HOME, 0.9), act('putBack:tank')] };
        if (h.aux) return { name: 'tankWash', steps: [...exit, go(st('washSink')), act('wash:tank'), go(TANK_HOME, 0.9), act('putBack:tank')] };
        return { name: 'tankHome', steps: [...exit, go(TANK_HOME, 0.9), act('putBack:tank')] };
      case 'porridge':
        if (h.load > 0) {
          const e = s.elephants.find((x) => x.id === h.owner);
          if (!e) return { name: 'porridgeDrop', steps: [act('drop:held')] };
          const tries = (this.tries.get(`porridge:${e.id}`) ?? 0) + 1;
          this.tries.set(`porridge:${e.id}`, tries);
          if (tries <= 4)
            return {
              name: 'porridgeFeed',
              steps: [
                go((x) => contactPoint(x.elephants.find((q) => q.id === e.id) ?? e), 0.6),
                act(`call:${e.id}`, true),
                wait((x) => availableActions(x).some((o) => o.id === `feedPorridge:${e.id}`), 25),
                act(`feedPorridge:${e.id}`, true),
                expand((x) => {
                  if (!x.keeper.held || x.keeper.held.kind !== 'porridge' || x.keeper.held.load <= 0) this.tries.delete(`porridge:${e.id}`);
                  return [];
                }),
              ],
            };
          // Не идёт на зов — отнести кашу обратно на кухню, попробовать позже
          this.tries.delete(`porridge:${e.id}`);
          return { name: 'porridgeBack', steps: [...exit, go(st('porridgeStation')), act('drop:held'), expand((x) => {
            const it = x.world.items.find((q) => q.kind === 'porridge' && q.owner === e.id);
            if (it) this.skip.set(`porridge:${it.id}`, x.t + 20);
            return [];
          })] };
        }
        return { name: 'porridgeWash', steps: [...exit, go(st('kitchenSink')), act('wash:porridge')] };
      case 'tub': {
        const tub = s.world.tubs.find((t) => t.id === h.aux);
        if (!tub) return { name: 'tubDrop', steps: [act('drop:held', true)] };
        if (tub.broken) return { name: 'tubTrash', steps: [...exit, go(st('container'), 1.6), act('wash:tubTrash')] };
        const kg = Object.values(tub.veg).reduce((a, b) => a + b, 0);
        if (kg > 0.3) return { name: 'serveTub', steps: [...exit, go((x) => this.tubSpot(x, tub.owner), 0.5), act('placeTub')] };
        if (tub.dirty) return { name: 'tubWash', steps: [...exit, go(st('kitchenSink')), act('wash:tub'), go(st('tubRack')), act(`rackTub:${tub.id}`)] };
        return { name: 'tubRack', steps: [...exit, go(st('tubRack')), act(`rackTub:${tub.id}`)] };
      }
      case 'ration':
        return { name: 'ration', steps: [go({ x: 38, y: 21.1 }, 0.3), act('scatter', true), act('drop:held', true)] };
      case 'sawdust':
        return { name: 'sawdustBack', steps: [...exit, go(st('sawdustPile')), act('putBack:sawdust', true), act('drop:held', true)] };
      default:
        return { name: 'drop', steps: [act('drop:held', true)] };
    }
  }
}

export const STALL_RECTS = { stallW: STALL_W, stallE: STALL_E };
