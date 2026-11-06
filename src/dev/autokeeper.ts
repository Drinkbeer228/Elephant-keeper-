// Автокипер: бот, который играет смену настоящими командами (движение + действия) — так же,
// как игрок с клавиатуры. Нужен для сквозных тестов (всё ли достижимо и работает в связке)
// и для демо (?bot). Полный контакт: работает в одном зале со слонами — окликает ту, что его
// не видит, заговаривает с той, кому тесно, просит подвинуться стоящую на пути, зовёт по имени,
// чтобы покормить, и ведёт рядом с собой на бетон, чтобы подставить бак.
// Распорядок: поилки, сено, ворота на выгул, уборка зала лопатой с тачкой, солома, смена воды
// в поилках, каша в 13:00 и 17:00, нарезка овощей и тазы к 19:00, ворота в слоновник, туалет
// в бак ночью, уборка выгула.

import { CONTACT, KEEPER } from '../data/balance';
import { BARROW_HOME, STALL_E, STALL_W, STATIONS, TANK_HOME, TOILET_STANCE, TROUGH_IDS, areaAt, hardFloor, type AreaId, type FeederId, type StationId, type TroughId } from '../data/facility';
import { PORRIDGE_SOAK_MIN } from '../data/rations';
import { availableActions, bodyDirt, minuteOfDay, type ActionOption, type Elephant, type State, type StepInput, type Vec } from '../sim';
import { comfortGap, invited } from '../sim/behavior/contact';
import { bodyCircles, gapToBody, headPos, keeperCanTouch, rearPos } from '../sim/behavior/perceive';
import { keeperNav } from '../sim/keeper';
import { keeperFieldAt, keeperRoute, keeperRouteAround, type Obstacle } from '../sim/nav';
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

// С тачкой: в зал — через дверь инвентарной (в западную половину — дальше через открытые
// разделительные ворота), на выгул — через дверь из двора. Точка перед дверью и сразу за ней
const ENTRY: Record<AreaId, { out: Vec; in: Vec }> = {
  stallW: { out: { x: 25.9, y: 34.6 }, in: { x: 25.9, y: 31.3 } },
  stallE: { out: { x: 25.9, y: 34.6 }, in: { x: 25.9, y: 31.3 } },
  paddock: { out: { x: 41.65, y: 21.1 }, in: { x: 41.65, y: 18.6 } },
};
// Бетон у южной стены, куда отвести слониху, чтобы подставить бак (между кормушками и поилками)
// (кипер встаёт у самой стены — тогда идущая следом остановится на бетоне, а не на соломе)
const CONCRETE: Vec[] = [
  { x: 15.6, y: 31.5 },
  { x: 12.4, y: 31.5 },
  { x: 19.6, y: 31.5 },
  { x: 25.9, y: 31.5 },
  { x: 22.4, y: 31.5 },
  { x: 28.4, y: 31.4 },
];
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

function her(s: State, id: string): Elephant {
  return s.elephants.find((z) => z.id === id)!;
}

// Где встать, чтобы она видела и могла подойти: в зале — в паре метров перед ней (можно чуть
// сбоку), не вплотную к другим; на выгуле — у ограды со стороны двора
function meetPoint(s: State, e: Elephant): Vec {
  const a = areaOfE(e);
  if (a === 'paddock') return e.x < 21 ? { x: Math.max(3, Math.min(9.2, e.x)), y: 21.1 } : { x: Math.max(32, Math.min(45, e.x)), y: 21.1 };
  const nav = keeperNav(s);
  let best: Vec | null = null;
  let bestV = -Infinity;
  for (const r of [3.0, 3.8, 2.4]) {
    for (const turn of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.2, -2.2]) {
      const ang = e.heading + turn;
      const q = { x: e.x + Math.cos(ang) * r, y: e.y + Math.sin(ang) * r };
      if (areaAt(q.x, q.y) !== a || keeperFieldAt(q.x, q.y, nav) < 0.45) continue;
      if (!invited(s, e) && gapToBody(e, q) - KEEPER.radius < comfortGap(s, e) + 0.2) continue;
      if (s.elephants.some((o) => o !== e && gapToBody(o, q) < 1.4)) continue;
      const v = -Math.abs(turn) - 0.12 * dist(q, s.keeper) - (r === 3.0 ? 0 : 0.3);
      if (v > bestV) {
        bestV = v;
        best = q;
      }
    }
  }
  return best ?? { x: Math.max(10.8, Math.min(29.2, e.x)), y: Math.max(20.8, Math.min(31.6, e.y + 2.6)) };
}

// Куда встать, чтобы дотянуться до неё и не влезть в её личное место: у головы, спереди или
// сбоку — там, где она видит; не вплотную к другим слонам. null — такого места нет
function reachPoint(s: State, e: Elephant): Vec | null {
  const nav = keeperNav(s);
  const head = headPos(e, 1.7);
  const room = invited(s, e) ? 0.15 : comfortGap(s, e) + 0.1;
  let best: Vec | null = null;
  let bestV = -Infinity;
  for (const r of [1.5, 2.0, 2.5]) {
    for (let i = 0; i < 16; i++) {
      const turn = ((i - 8) / 8) * Math.PI;
      const ang = e.heading + turn;
      const q = { x: head.x + Math.cos(ang) * r, y: head.y + Math.sin(ang) * r };
      if (!areaAt(q.x, q.y) || keeperFieldAt(q.x, q.y, nav) < 0.45) continue;
      if (gapToBody(e, q) - KEEPER.radius < room) continue;
      const seen = Math.abs(Math.atan2(Math.sin(Math.atan2(q.y - e.y, q.x - e.x) - e.heading), Math.cos(Math.atan2(q.y - e.y, q.x - e.x) - e.heading)));
      if (seen > CONTACT.viewHalfAngle - 0.2) continue;
      if (s.elephants.some((o) => o !== e && gapToBody(o, q) - KEEPER.radius < Math.max(0.6, comfortGap(s, o)))) continue;
      const v = -0.12 * dist(q, s.keeper) - 0.35 * seen - 0.2 * r;
      if (v > bestV) {
        bestV = v;
        best = q;
      }
    }
  }
  return best;
}

// Ближайшее к ней место на бетоне, где никто не стоит
function concreteSpot(s: State, e: Elephant): Vec {
  const a = areaOfE(e);
  const ok = CONCRETE.filter((p) => (s.world.gates.shift || areaAt(p.x, p.y) === a) && !s.elephants.some((o) => o !== e && gapToBody(o, p) < 1.6));
  const list = ok.length ? ok : CONCRETE;
  return list.reduce((b, p) => (dist(p, e) < dist(b, e) ? p : b));
}

function onConcrete(e: Elephant): boolean {
  const r = rearPos(e);
  return hardFloor(r.x, r.y) && hardFloor(e.x, e.y) && !e.lying;
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
  private voiceCool = new Map<string, number>();
  stats = { jobs: {} as Record<string, number>, failed: {} as Record<string, number>, voice: {} as Record<string, number> };

  decide(s: State): StepInput {
    this.now = s.t;
    // Занят делом, а рядом кто-то предупреждает — бросить дело и отступить
    if (s.keeper.task) {
      const back = this.courtesy(s);
      return back && (back.move.x || back.move.y) ? back : IDLE;
    }
    // Нарезка овощей: левая рука — взять / бросить, правая — обрезать
    const p = s.keeper.prep;
    if (p) return { ...IDLE, actions: [p.hand && !p.trimmed ? 'prepTrim:R' : 'prepPick:L'] };
    if (s.keeper.stun > 0) return IDLE;
    const polite = this.courtesy(s);
    if (polite) return polite;
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

  // Среди слонов: окликнуть ту, что тебя не видит (спит, стоит спиной), прежде чем подойти;
  // заговорить спокойно с той, кому тесно
  private courtesy(s: State): StepInput | null {
    const k = s.keeper;
    for (const e of s.elephants) {
      const d = dist(e, k);
      if (d > 5.5) continue;
      // Предупреждает — отступить, дать ей место (в любую свободную сторону, не к другим слонам);
      // отступать совсем некуда — попросить её подвинуться
      if ((e.act.kind === 'warn' || e.mem.tension > 0.4) && gapToBody(e, k) - KEEPER.radius < comfortGap(s, e) + 0.3) {
        const away = Math.atan2(k.y - e.y, k.x - e.x);
        const nav = keeperNav(s);
        for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
          const ux = Math.cos(away + turn);
          const uy = Math.sin(away + turn);
          const p = { x: k.x + ux * 0.6, y: k.y + uy * 0.6 };
          if (keeperFieldAt(p.x, p.y, nav) < 0.34) continue;
          if (s.elephants.some((o) => gapToBody(o, p) < KEEPER.radius + 0.15)) continue;
          return { ...IDLE, move: { x: ux, y: uy } };
        }
        const key = `cornered:${e.id}`;
        if ((this.voiceCool.get(key) ?? -1) < s.t) {
          this.voiceCool.set(key, s.t + 3);
          const id = this.say(s, `voice:${e.id}:move`);
          if (id) return { ...IDLE, actions: [id] };
        }
      }
      const key = `${e.id}`;
      if ((this.voiceCool.get(key) ?? -1) > s.t) continue;
      // Окликнуть, если она не знает, что ты рядом, а ты у неё за спиной или она спит
      const behind = Math.abs(Math.atan2(Math.sin(Math.atan2(k.y - e.y, k.x - e.x) - e.heading), Math.cos(Math.atan2(k.y - e.y, k.x - e.x) - e.heading))) > CONTACT.viewHalfAngle;
      if (s.t - e.mem.aware > 1 && d < 4.5 && (behind || (e.lying && e.act.kind === 'sleep'))) {
        this.voiceCool.set(key, s.t + 1.5);
        const id = this.say(s, `voice:${e.id}:name`);
        if (id) return { ...IDLE, actions: [id] };
      }
      // Заговорить, когда стоишь за её границей (вплотную разговором не поможешь — сначала отступить)
      if (e.mem.tension > 0.25 && d < 5 && !e.lying && gapToBody(e, k) - KEEPER.radius >= comfortGap(s, e)) {
        this.voiceCool.set(key, s.t + 4);
        const id = this.say(s, `voice:${e.id}:talk`);
        if (id) return { ...IDLE, actions: [id] };
      }
    }
    return null;
  }

  // Слоны для маршрута: корпус и её личное место (у той, что подпустила, — почти без запаса)
  private bodies(s: State): Obstacle[] {
    const out: Obstacle[] = [];
    for (const e of s.elephants) {
      if (dist(e, s.keeper) > 30) continue;
      const soft = invited(s, e) ? 0.1 : Math.max(0.3, Math.min(1.6, comfortGap(s, e)));
      for (const c of bodyCircles(e)) out.push({ x: c.x, y: c.y, r: c.r, soft });
    }
    return out;
  }

  private say(s: State, id: string): string | null {
    const o = availableActions(s).find((x) => x.id === id);
    if (!o || !o.enabled) return null;
    const cue = id.split(':')[2];
    this.stats.voice[cue] = (this.stats.voice[cue] ?? 0) + 1;
    return id;
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
      // В обход слонов; если обойти некуда (прижат у стены) — напрямую: упрётся — попросит подвинуться
      const r = keeperRouteAround(k, to, nav, this.bodies(s)) ?? keeperRoute(k, to, nav);
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
    // Упёрся в слониху: попросить подвинуться
    if (this.stuck > 0.3) {
      const e = s.elephants.find((q) => gapToBody(q, k) < KEEPER.radius + 0.6 && !q.lying);
      const key = e ? `move:${e.id}` : '';
      if (e && (this.voiceCool.get(key) ?? -1) < s.t) {
        this.voiceCool.set(key, s.t + 8);
        const ask = this.say(s, `voice:${e.id}:move`);
        if (ask) {
          this.stuck = 0;
          return { ...IDLE, actions: [ask] };
        }
      }
    }
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
    // День бота начинается в 6:30: слонов — на выгул, зал убрать до сдачи смены в 8:00
    const dayTime = m >= 6.5 * 60 && m < 18 * 60;
    if (w.barrow.pushed) return this.barrowHome(s);
    if (k.held) return this.dispose(s);
    // Тачка, забытая в отсеке, — вывезти прежде всего: иначе ворота не открыть
    const barrowArea = areaAt(w.barrow.x, w.barrow.y);
    // Из западной половины тачку вывозят через разделительные ворота
    if (barrowArea === 'stallW' && !w.gates.shift) return this.gate('shift', true);
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
          if (!this.done.has(key)) {
            // Бак дома — с баком; бак занят — к стоку (если до него можно дойти)
            if (w.items.some((it) => it.kind === 'tank' && dist(it, TANK_HOME) < 1.5) && !k.held) {
              this.done.add(key);
              return this.toiletWalk(e);
            }
            if (!k.held && (a === 'stallE' || w.gates.shift)) {
              this.done.add(key);
              return this.drainWalk(e);
            }
          }
        } else if (!w.gates.outer && a !== 'paddock' && !night) return this.gate('outer', true);
      }
      if ((sig.kind === 'out' && !w.gates.outer && !night) || (sig.kind === 'in' && !w.gates.outer)) return this.gate('outer', true);
      if (sig.kind === 'water') {
        const id = TROUGH_OF[a];
        const t = w.troughs[id];
        if (!t.valve && t.stage === 'ok' && !t.drain && t.level < 90) return { name: 'water', steps: [go(st(id)), act(`valve:${id}`)] };
        // Полная, но пить не хочет — в воде сор или средство: сменить воду
        if (!t.valve && t.stage === 'ok' && (t.debris > 0.3 || t.chem > 0.05) && w.supplies.chem > 0 && !this.cooling(`troughChange:${id}`, s)) return this.troughChange(id);
      }
      if (sig.kind === 'food' && w.stock.hay > 0) return this.hay(a === 'paddock' ? 'paddockFeeder' : RACK[a], s);
      // Просит внимания — подойти, поговорить, почесать
      if (sig.kind === 'attention' && !this.cooling(`attention:${e.id}`, s)) {
        this.cool.set(`attention:${e.id}`, s.t + 20);
        return { name: 'attention', steps: [...this.reach(e.id), act(`voice:${e.id}:talk`, true), act(`scratch:${e.id}`, true)] };
      }
    }

    // Вечером — впустить всех в слоновник, прежде чем браться за долгую работу
    if (!dayTime && !w.gates.outer && !allIn(s, STALLS)) return this.gate('outer', true);

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
    // Рано утром, пока все в слоновнике, — сменить воду на выгуле
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
      if (a && (a !== 'paddock' || this.inside(s, a) || this.nearLine(floorTub))) return this.collectTub(s, floorTub.id, a);
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

    // Уборка зала: все на выгуле, ворота закрыты — зайти с тачкой и лопатой
    if (dayTime && allIn(s, ['paddock']) && !porridgeDue) {
      const dirty = STALLS.filter((a) => this.stallDirt(s, a) >= 2 || this.hardLitter(s, a) >= 3);
      if (w.gates.outer && (dirty.length || this.bareBedding(s, 'stallW') + this.bareBedding(s, 'stallE') >= 10)) return this.gate('outer', false);
      if (!w.gates.outer) {
        if (dirty.includes('stallW') && !w.gates.shift) return this.gate('shift', true);
        if (dirty.length && w.barrow.load < KEEPER.barrowMax - 1) return this.cleanArea(dirty[0], s);
        for (const a of STALLS) if (this.bareBedding(s, a) >= 6 && w.stock.straw > 0) return a === 'stallW' && !w.gates.shift ? this.gate('shift', true) : this.straw(s, a);
      }
      // Смена воды раз за смену — пока у поилок никого (все на выгуле)
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
    // Вечером, когда все в слоновнике, — уборка выгула и смена воды на выгуле
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

    // Свободная минута — побыть рядом со слонами: поговорить, почесать, угостить
    const visit = this.visit(s);
    if (visit) return visit;
    // Остальное время — у двери инвентарной: видно зал, и никому не мешаешь у кормушек
    const spot = { x: 25.9, y: 34.3 };
    if (dist(k, spot) > 1) return { name: 'idle', steps: [go(spot)] };
    return { name: 'watch', steps: [wait(() => false, 2)] };
  }

  // Куда поставить таз слонихи: перед ней (в зале) или к ограде напротив (на выгуле)
  private tubSpot(s: State, owner: string): Vec {
    const e = s.elephants.find((x) => x.id === owner);
    if (e) return meetPoint(s, e);
    return { x: 15.6, y: 29.5 };
  }

  // Подойти самому так, чтобы она видела и было до неё дотянуться; если подойти некуда —
  // встать перед ней и позвать «иди сюда»
  private reach(id: string): Step[] {
    const touch = (x: State) => keeperCanTouch(x, her(x, id));
    return [
      // Сначала заговорить с ней издалека — тогда подпустит ближе
      this.greet(id),
      go((x) => (touch(x) ? null : (reachPoint(x, her(x, id)) ?? meetPoint(x, her(x, id)))), 0.4),
      expand((x) => (touch(x) ? [] : [act(`voice:${id}:come`, true), wait(touch, 12)])),
    ];
  }

  // Подойти на её расстояние и спокойно заговорить, если она ещё не подпустила
  private greet(id: string): Step {
    return expand((x) => (keeperCanTouch(x, her(x, id)) || invited(x, her(x, id)) ? [] : [go((y) => meetPoint(y, her(y, id)), 0.7), act(`voice:${id}:talk`, true)]));
  }

  // Встать у её бока, ближе к задним ногам (для бака): с той стороны, где есть место
  private flank(s: State, e: Elephant): Vec {
    const nav = keeperNav(s);
    const L = e.profile.look;
    const half = 1.05 * L.size * L.length;
    const girth = 0.95 * L.size * L.girth;
    const c = Math.cos(e.heading);
    const sn = Math.sin(e.heading);
    let best: Vec | null = null;
    let bestD = Infinity;
    for (const along of [-0.35, 0, -0.65]) {
      for (const side of [1, -1]) {
        const bx = e.x + c * along * half;
        const by = e.y + sn * along * half;
        const q = { x: bx - sn * side * (girth + 0.5), y: by + c * side * (girth + 0.5) };
        if (keeperFieldAt(q.x, q.y, nav) < 0.34) continue;
        if (s.elephants.some((o) => o !== e && gapToBody(o, q) < 0.8)) continue;
        const d = dist(q, s.keeper);
        if (d < bestD) {
          bestD = d;
          best = q;
        }
      }
    }
    return best ?? { x: e.x - sn * (girth + 0.5), y: e.y + c * (girth + 0.5) };
  }

  // Свободная минута: к той, с кем давно не были рядом — поговорить, почесать, угостить
  private visit(s: State): Job | null {
    const m = minuteOfDay(s.t);
    if (m >= 21 * 60 || m < 6 * 60) return null;
    const slot = Math.floor(s.t / 90);
    const e = s.elephants.find((q) => !q.lying && !this.done.has(`visit:${q.id}:${slot}`) && areaOfE(q) !== 'paddock' && q.act.kind !== 'eat');
    if (!e) return null;
    this.done.add(`visit:${e.id}:${slot}`);
    const id = e.id;
    return {
      name: 'visit',
      steps: [...this.reach(id), act(`voice:${id}:talk`, true), act(`scratch:${id}`, true), act(`voice:${id}:praise`, true)],
    };
  }

  private skipped(key: string, s: State): boolean {
    return (this.skip.get(key) ?? -1) > s.t;
  }

  private inside(s: State, a: AreaId): boolean {
    return s.elephants.every((e) => areaOfE(e) !== a) && (a !== 'paddock' ? !s.world.gates.outer || !s.elephants.some((e) => areaOfE(e) === 'paddock') : !s.world.gates.outer);
  }

  private nearLine(t: Vec): boolean {
    return t.y > 18 && t.y < 20 && t.x > 30.3 && t.x < 45.7;
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

  // Ворота открывают и закрывают руками, стоя у створки: на выгул — изнутри зала, сбоку от
  // проёма; разделительные — со своей стороны, у середины зала
  private gate(id: 'outer' | 'shift', open: boolean): Job {
    // Встать у створки там, где никто не стоит: с той стороны, где просторнее
    const spots: Vec[] =
      id === 'outer'
        ? [
            { x: 13.2, y: 20.9 },
            { x: 17.8, y: 20.9 },
            { x: 13.2, y: 19.1 },
            { x: 17.8, y: 19.1 },
          ]
        : [23, 25, 27, 31].flatMap((y) => [
            { x: 19.1, y },
            { x: 20.9, y },
          ]);
    const spot = (s: State): Vec => {
      const room = (p: Vec) => Math.min(...s.elephants.map((e) => gapToBody(e, p) - comfortGap(s, e))) - 0.08 * dist(p, s.keeper);
      return spots.reduce((b, p) => (room(p) > room(b) ? p : b));
    };
    return { name: `${id}:${open ? 'open' : 'close'}`, steps: [go(spot, 0.3), act((s) => (s.world.gates[id] === open ? 'none' : `gate:${id}`), true), wait((s) => s.world.gates[id] === open, 4)] };
  }

  // Сено: тюк в руках (быстро, но с тюка сыплется) или, если тачка свободна, — тюки в тачке
  private hay(id: FeederId, s?: State): Job {
    const b = s?.world.barrow;
    if (s && b && !b.pushed && b.load === 0 && !b.cargo.length && !areaAt(b.x, b.y) && s.world.stock.hay >= 2 && (id !== 'barnRackW' || s.world.gates.shift)) {
      const ids: FeederId[] = [id];
      for (const other of ['barnRackW', 'barnRackE', 'paddockFeeder'] as const) {
        if (other === id || ids.length >= 2) continue;
        if (other === 'barnRackW' && !s.world.gates.shift) continue;
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

  // Ночной туалет: взять бак, подойти так, чтобы видела, «пошли» — довести рядом с собой до
  // бетона, «стоять», подставить бак у её бока, «давай», наградить и забрать бак (вылить — потом).
  // Не пошла — не повторять сразу: поговорить, подождать и попросить снова. Бак не подставить
  // (стоит на соломе) — «давай» не говорить: на подстилку пусть не учится.
  private toiletWalk(e: Elephant): Job {
    const id = e.id;
    const tankUnderHer = (x: State) => x.world.items.some((it) => it.kind === 'tank' && dist(it, rearPos(her(x, id))) < 1.35);
    return {
      name: 'toiletWalk',
      steps: [
        go(TANK_HOME, 0.9),
        pick('takeTank', (_s, o) => o.ref.verb === 'pickUp' && o.label.includes('бак')),
        go((x) => meetPoint(x, her(x, id)), 0.7),
        this.greet(id),
        this.lead(id, 0),
        expand((x) =>
          onConcrete(her(x, id))
            ? [
                ...(her(x, id).act.kind === 'stay' ? [] : [act(`voice:${id}:stay`, true)]),
                go((y) => this.flank(y, her(y, id)), 0.35),
                wait((y) => her(y, id).speed < 0.25, 3),
                act(`tankPlace:${id}`, true),
              ]
            : [],
        ),
        expand((x) => (tankUnderHer(x) ? [act(`voice:${id}:toilet`, true), wait((y) => her(y, id).act.kind !== 'urinate', 6), act(`treat:${id}`, true)] : [])),
        go((x) => {
          const t = x.world.items.find((it) => it.kind === 'tank');
          return t && !x.keeper.held ? this.standNear(x, t, 0.9) : null;
        }, 0.35),
        pick('tankTake', (_s, o) => o.ref.verb === 'tankTake', true),
        expand((x) => (x.keeper.held?.kind === 'tank' ? [] : [pick('tankPick', (_s, o) => o.ref.verb === 'pickUp' && o.label.includes('бак'), true)])),
      ],
    };
  }

  // К стоку: подойти, заговорить, «пошли» — довести до стока, «давай» — встанет над решёткой
  private drainWalk(e: Elephant): Job {
    const id = e.id;
    const near = (x: State) => dist(her(x, id), TOILET_STANCE) < 3.5 && hardFloor(her(x, id).x, her(x, id).y);
    return {
      name: 'drainWalk',
      steps: [
        go((x) => meetPoint(x, her(x, id)), 0.7),
        this.greet(id),
        this.lead(id, 0, () => ({ x: 26.7, y: 30.6 }), near),
        expand((x) => (near(x) ? [act(`voice:${id}:toilet`, true), wait((y) => her(y, id).act.kind !== 'follow' && her(y, id).act.kind !== 'urinate', 8), act(`treat:${id}`, true)] : [])),
      ],
    };
  }

  // Довести её рядом с собой туда, куда нужно (по умолчанию — на ближайший бетон)
  private lead(id: string, n: number, spot: (s: State) => Vec = (y) => concreteSpot(y, her(y, id)), there: (s: State) => boolean = (y) => onConcrete(her(y, id))): Step {
    return expand((x) => {
      const e = her(x, id);
      if (there(x) || n >= 3) return [];
      if (e.act.kind === 'walkWith')
        return [go(spot, 0.5), wait((y) => her(y, id).speed < 0.2 || her(y, id).act.kind !== 'walkWith', 10), act(`voice:${id}:stay`, true)];
      return [
        ...(n > 0 ? [act(`voice:${id}:talk`, true), wait(() => false, 1.7)] : []),
        act(`voice:${id}:follow`, true),
        wait((y) => her(y, id).act.kind === 'walkWith', 2),
        this.lead(id, n + 1, spot, there),
      ];
    });
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
        expand((x) => (touch(x) ? [] : [act(`voice:${id}:come`, true), wait(touch, 25)])),
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
    const it = s.world.items.find((x) => x.id === itemId);
    const atStation = it && dist(it, st('porridgeStation')) < 2.5;
    return {
      name: 'porridge',
      steps: [...(atStation ? [go(st('porridgeStation')), act(`takePorridge:${itemId}`)] : [go(it ?? st('porridgeStation'), 0.8), act(`pickUp:${itemId}`)]), ...this.reach(id), act(`feedPorridge:${id}`, true)],
    };
  }

  // Пустой таз: подойти и поднять (среди слонов — рядом с ним), на выгуле — крюком через ограду
  private collectTub(s: State, tubId: number, a: AreaId): Job {
    const hook = a === 'paddock' && !this.inside(s, a);
    return {
      name: hook ? 'collectTubHook' : 'collectTub',
      steps: [
        go((x) => {
          const t = x.world.tubs.find((q) => q.id === tubId);
          if (!t || t.where !== 'floor') return null;
          return hook ? { x: Math.max(31, Math.min(45, t.x)), y: 21.1 } : this.standNear(x, t, 0.95);
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
      if (s.elephants.some((o) => gapToBody(o, q) < KEEPER.radius + 0.15)) continue;
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
    const exit: Step[] = [];
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
                ...this.reach(e.id),
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
