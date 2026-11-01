// Бот-кипер: играет смену по тем же правилам, что человек.
// Ходит с той же скоростью, держит одну вещь, жмёт «Действие» только когда подсказка совпала.
// Видит то же, что игрок с осмотром (пузырь, сено, вода), — то есть играет как опытный кипер.

import { availableAction, tick, walkable, type Command, type State } from '../sim';
import { MAP, inPaddock, inReachZone } from '../data/map';
import { BALANCE } from '../data/balance';
import { ELEPHANTS } from '../data/elephants';
import { profileOf, bucketUnder } from '../sim/elephants';
import { kashaDue, mealTime, vegStageAvailable } from '../sim/feeding';
import { sawdustAbsorbed } from '../sim/floor';
import { ITEM_NAMES, basinsOnRack } from '../sim/items';
import type { Elephant, Item } from '../sim/types';

type P = { x: number; y: number };

interface Step {
  label: string;
  to: () => P | null; // null — шаг не нужен, пропустить
  expect?: RegExp; // нажать «Действие», когда подсказка совпала
  done?: () => boolean; // проверка после нажатия; не выполнено — нажать ещё
  wait?: () => boolean; // стоять, пока не станет true
  timeout?: number; // тиков
}

// Бак и мешок паркуются на дорожке за полосой, до которой дотягивается хобот
const PARK_BUCKET = { x: 16.0, y: 10.6 };
const PARK_BAG = { x: 17.4, y: 10.6 };
const SAFE = { x: 14.0, y: 10.8 }; // на дорожке, подальше от тачки, стойки и станций
// Откуда подходить к станциям: со стороны двери или прохода
const st = MAP.stations;
const AT = {
  rack: { x: st.rack.x + st.rack.w / 2 + 0.6, y: 13.0 },
  basinRack: { x: st.basinRack.x + st.basinRack.w / 2 + 0.6, y: st.basinRack.y },
  sawdust: { x: st.sawdust.x, y: st.sawdust.y - 0.8 },
  bags: { x: st.bags.x, y: st.bags.y - 0.8 },
  wash: { x: st.wash.x, y: st.wash.y + st.wash.h / 2 + 0.5 },
  kitchen: { x: st.kitchen.x, y: st.kitchen.y - st.kitchen.h / 2 - 0.5 },
  hay: { x: st.hay.x, y: st.hay.y - st.hay.h / 2 - 0.5 },
  straw: { x: st.straw.x, y: st.straw.y - st.straw.h / 2 - 0.5 },
  dump: { x: st.dump.x, y: st.dump.y - st.dump.h / 2 - 0.5 },
  drain: { x: st.drain.x, y: st.drain.y - 0.6 },
  valve: { x: st.valve.x, y: st.valve.y + 0.6 },
  gate: { x: st.gate.x, y: 10.0 },
  feeder: { x: MAP.feeder.x + 0.2, y: MAP.feeder.y + 1.0 },
};

function d(a: P, b: P): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clear(a: P, b: P): boolean {
  const n = Math.ceil(d(a, b) / 0.1);
  for (let i = 1; i <= n; i++) {
    if (!walkable(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)) return false;
  }
  return true;
}

// Поиск пути по сетке 0.5 клетки (стены, ограждение, двери)
const G = 0.5;
const GW = Math.round(MAP.w / G);
const GH = Math.round(MAP.h / G);
const open: boolean[] = [];
for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) open.push(walkable((gx + 0.5) * G, (gy + 0.5) * G));

function node(p: P): number {
  const gx = Math.max(0, Math.min(GW - 1, Math.floor(p.x / G)));
  const gy = Math.max(0, Math.min(GH - 1, Math.floor(p.y / G)));
  return gy * GW + gx;
}

function astar(from: P, to: P): P[] {
  const start = node(from);
  const goal = node(to);
  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const frontier: [number, number][] = [[0, start]];
  const h = (n: number) => Math.hypot((n % GW) - (goal % GW), Math.floor(n / GW) - Math.floor(goal / GW));
  while (frontier.length) {
    frontier.sort((a, b) => a[0] - b[0]);
    const [, cur] = frontier.shift()!;
    if (cur === goal) break;
    const cx = cur % GW;
    const cy = Math.floor(cur / GW);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const n = ny * GW + nx;
        if (!open[n] && n !== goal) continue;
        if (dx && dy && (!open[cy * GW + nx] || !open[ny * GW + cx])) continue;
        const cost = (g.get(cur) ?? 0) + (dx && dy ? 1.414 : 1);
        if (cost < (g.get(n) ?? Infinity)) {
          g.set(n, cost);
          came.set(n, cur);
          frontier.push([cost + h(n), n]);
        }
      }
  }
  const path: P[] = [to];
  let n = goal;
  while (came.has(n)) {
    n = came.get(n)!;
    if (n !== start) path.unshift({ x: ((n % GW) + 0.5) * G, y: (Math.floor(n / GW) + 0.5) * G });
  }
  return path;
}

const routes = new Map<string, P[]>();
export function route(from: P, to: P): P[] {
  if (clear(from, to)) return [to];
  const key = `${node(from)}-${node(to)}`;
  // В кэше — только промежуточные клетки: точная цель у каждого запроса своя
  let path = routes.get(key);
  if (!path) {
    path = astar(from, to).slice(0, -1);
    if (routes.size > 2000) routes.clear();
    routes.set(key, path);
  }
  const pts = [...path, to];
  while (pts.length > 1 && clear(from, pts[1])) pts.shift();
  return pts;
}

// Откуда брать вещь: у решётки — с дорожки сквозь прутья, внутри вольера — с места, снаружи — чуть ниже
export function reachPoint(item: P): P {
  if (inPaddock(item.x, item.y) && item.y > MAP.fenceY - 0.6) return { x: item.x, y: MAP.fenceY + 0.35 };
  return { x: item.x, y: item.y + (inPaddock(item.x, item.y) ? 0 : 0.35) };
}

function cellCenter(cx: number, cy: number): P {
  return { x: MAP.bedding.x + cx + 0.5, y: MAP.bedding.y + cy + 0.5 };
}

function insideClamp(p: P): P {
  const k = MAP.paddock;
  return { x: Math.min(Math.max(p.x, k.x0 + 0.6), k.x1 - 0.6), y: Math.min(Math.max(p.y, k.y0 + 0.6), k.y1 - 0.5) };
}

export interface BotStats {
  ticks: number;
  busyTicks: number;
  jobs: Record<string, number>;
  aborted: Record<string, number>;
  jobTicks: Record<string, number>;
}

export class Bot {
  plan: Step[] = [];
  job = '';
  private stepTicks = 0;
  private pressed = false;
  private lastPos: P = { x: 0, y: 0 };
  private stillTicks = 0;
  private nudge = 0;
  private nudgeDir = { x: 0, y: 0 };
  // Свой генератор от seed: бот не трогает случайности смены, а смена повторяется
  private rng: number;
  stats: BotStats = { ticks: 0, busyTicks: 0, jobs: {}, aborted: {}, jobTicks: {} };

  constructor(private s: State) {
    this.rng = s.seed ^ 0x5bd1e995;
  }

  // mulberry32, как в src/sim/rng.ts
  private random(): number {
    this.rng = (this.rng + 0x6d2b79f5) | 0;
    let t = this.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Один кадр: какие команды отдать
  frame(): Command[] {
    const s = this.s;
    this.stats.ticks++;
    if (s.phase !== 'shift') return [];

    // Сигнал важнее всего: бросить текущее дело (кроме таза с едой в руках)
    if (this.job !== 'toilet' && this.signalTarget() && s.player.held?.food == null) this.abort('preempt');
    if (!this.plan.length) this.choose();
    if (!this.plan.length) return [];
    this.stats.busyTicks++;
    this.stats.jobTicks[this.job] = (this.stats.jobTicks[this.job] ?? 0) + 1;
    return this.run();
  }

  private abort(reason: string): void {
    if (this.job) this.stats.aborted[`${this.job}:${reason}`] = (this.stats.aborted[`${this.job}:${reason}`] ?? 0) + 1;
    this.plan = [];
    this.job = '';
    this.pressed = false;
    this.stepTicks = 0;
  }

  private run(): Command[] {
    const s = this.s;
    const st = this.plan[0];
    const target = st.to();
    if (!target) return this.next();
    const p = s.player;
    this.stepTicks++;
    if (this.stepTicks > (st.timeout ?? 30 * 40)) {
      this.abort(`timeout:${st.label}`);
      return [];
    }

    // Подсказка уже нужная и цель рядом — жмём, не дожидаясь точного места (как человек)
    const close = st.expect && !st.wait && d(p, target) < 1.0 && st.expect.test(availableAction(s)?.label ?? '');
    if (d(p, target) > 0.25 && !close && !(this.pressed && st.done)) return this.move(target);

    if (st.wait) {
      return st.wait() ? this.next() : [];
    }
    if (st.expect) {
      if (this.pressed && st.done) {
        if (st.done()) return this.next();
        this.pressed = false;
      }
      const label = availableAction(s)?.label ?? '';
      if (!st.expect.test(label)) return [];
      if (st.done) {
        this.pressed = true;
        return [{ type: 'action' }];
      }
      this.next();
      return [{ type: 'action' }];
    }
    return this.next();
  }

  private next(): Command[] {
    this.plan.shift();
    this.pressed = false;
    this.stepTicks = 0;
    if (!this.plan.length) this.job = '';
    return [];
  }

  private move(target: P): Command[] {
    const p = this.s.player;
    if (d(p, this.lastPos) < 0.002) this.stillTicks++;
    else this.stillTicks = 0;
    this.lastPos = { x: p.x, y: p.y };
    if (this.stillTicks > 20 && this.nudge === 0) {
      this.nudge = 12;
      this.nudgeDir = { x: this.random() - 0.5, y: this.random() - 0.5 };
    }
    if (this.nudge > 0) {
      this.nudge--;
      return [{ type: 'move', dx: this.nudgeDir.x, dy: this.nudgeDir.y }];
    }
    const w = route(p, target)[0];
    return [{ type: 'move', dx: w.x - p.x, dy: w.y - p.y }];
  }

  private start(job: string, steps: Step[]): void {
    this.job = job;
    this.plan = steps;
    this.stepTicks = 0;
    this.pressed = false;
    this.stats.jobs[job] = (this.stats.jobs[job] ?? 0) + 1;
  }

  // ——— выбор дела ———

  private signalTarget(): Elephant | undefined {
    return this.s.elephants.find((e) => e.signalStarted !== undefined && e.state !== 'walkCommand' && !bucketUnder(this.s, e));
  }

  private choose(): void {
    const s = this.s;
    const held = s.player.held;
    const t = s.t;

    const sig = this.signalTarget();
    if (sig) return this.start('toilet', this.toilet(sig));

    if (s.valveOpen && s.trough >= 88) return this.start('valveClose', [...this.freeHands(), this.at('вентиль', AT.valve, /Закрыть вентиль/)]);

    const meal = this.mealJob();
    if (meal) return this.start('meal', meal);

    const full = s.elephants
      .filter((e) => e.state !== 'sleep' && e.signalStarted === undefined && e.bladder >= 62)
      .sort((a, b) => b.bladder - a.bladder)[0];
    if (full) return this.start('toilet', this.toilet(full));

    // Пустые тазы — собрать стопкой, вымыть, поставить на стеллаж
    const onRack = basinsOnRack(s);
    const loose = (i: Item) => i.kind === 'basin' && !i.food && !onRack.includes(i);
    const basin = s.items.find(loose);
    if (basin) {
      const all = s.items.filter(loose);
      const steps: Step[] = [...this.freeHands(), this.take(basin, /Взять: (грязный|чистый) таз/)];
      for (const b of all.filter((x) => x !== basin)) {
        steps.push({ label: 'ещё таз', to: () => (s.items.includes(b) && s.player.held?.kind === 'basin' ? reachPoint(b) : null), expect: /Взять ещё пустой таз/, done: () => !s.items.includes(b) });
      }
      steps.push(...this.putAway(() => s.player.held));
      return this.start('basin', steps);
    }

    const stray = s.items.find(
      (i) => i.kind !== 'basin' && (inPaddock(i.x, i.y) || inReachZone(i.x, i.y)) && !s.elephants.some((e) => e.signalStarted !== undefined && d(e, i) < 1.2),
    );
    if (stray) return this.start('loose', [...this.freeHands(), this.take(stray), ...this.putAway(() => s.player.held)]);

    if (s.gateOpen) return this.start('gate', [...this.freeHands(), this.at('задвижка', AT.gate, /Закрыть задвижку/)]);
    if (!s.valveOpen && s.trough < 40) return this.start('valveOpen', [...this.freeHands(), this.at('вентиль', AT.valve, /Открыть вентиль/)]);
    if (s.feederHay < 35) {
      return this.start('hay', [...this.freeHands(), this.at('сенник', AT.hay, /Взять тюк сена/), this.at('кормушка', AT.feeder, /Заложить сено/)]);
    }
    if (vegStageAvailable(s)) return this.start('veg', [...this.freeHands(), this.at('кормовая', AT.kitchen, /^(Ужин: |Запарить кашу)/)]);
    const c = s.container;
    if (c.truckAt === null && c.fill >= BALANCE.container.capacity * BALANCE.container.callAt) {
      return this.start('truck', [...this.freeHands(), this.at('бак', AT.dump, /Позвонить: вывезти/)]);
    }
    if (t >= 1370) {
      const tidy = this.tidy();
      if (tidy) return this.start('tidy', tidy);
    }
    const clean = this.cleaning();
    if (clean) return this.start(clean[0], clean[1]);
    if (held) return this.start('putAway', this.putAway(() => s.player.held));
  }

  // ——— шаги ———

  private at(label: string, p: P, expect: RegExp, done?: () => boolean): Step {
    return { label, to: () => p, expect, done };
  }

  private take(item: Item, expect?: RegExp): Step {
    return {
      label: `взять ${item.kind}`,
      to: () => (this.s.items.includes(item) ? reachPoint(item) : null),
      // Берём именно этот предмет: рядом может лежать другой, и «Взять» достанется ему
      expect: expect ?? new RegExp(`^Взять: ${ITEM_NAMES[item.kind].split(' ')[0]}`),
      done: () => this.s.player.held === item,
    };
  }

  // Освободить руки: убрать то, что держишь (бак — на дежурную точку)
  private freeHands(): Step[] {
    return this.s.player.held ? this.putAway(() => this.s.player.held) : [];
  }

  private dropAt(p: P, expect = /^(Положить|Поставить открытый мешок)/): Step {
    return { label: 'положить', to: () => (this.s.player.held ? p : null), expect, done: () => !this.s.player.held };
  }

  private putAway(item: () => Item | null): Step[] {
    const it = item();
    if (!it) return [];
    switch (it.kind) {
      case 'bucket':
        return [
          { label: 'слив', to: () => ((it.liters ?? 0) > 0 || it.dirty ? AT.drain : null), expect: /Вылить бак в слив/, done: () => !it.liters && !it.dirty },
          this.dropAt(PARK_BUCKET),
        ];
      case 'scoop':
        return [
          { label: 'высыпать совок', to: () => ((it.load ?? 0) > 0 ? AT.dump : null), expect: /Высыпать совок/, done: () => !it.load },
          { label: 'мойка совок', to: () => (it.dirty ? AT.wash : null), expect: /Вымыть совок/, done: () => !it.dirty },
          this.at('стойка', AT.rack, /Положить на стойку/, () => !this.s.player.held),
        ];
      case 'fork':
      case 'broom':
        return [this.at('стойка', AT.rack, /Положить на стойку/, () => !this.s.player.held)];
      case 'bag':
        return (it.fill ?? 0) >= 3
          ? [this.at('помойка', AT.dump, /Выбросить мешок/, () => !this.s.player.held)]
          : [this.dropAt(PARK_BAG, /Поставить открытый мешок/)];
      case 'basin': {
        if (it.food) return [this.dropAt(SAFE)];
        const dirty = () => [it, ...(it.nested ?? [])].some((b) => b.dirty);
        return [
          { label: 'мойка', to: () => (this.s.player.held === it && dirty() ? AT.wash : null), expect: /Вымыть таз/, done: () => !dirty() },
          this.at('стеллаж', AT.basinRack, /Поставить тазы? на стеллаж/, () => this.s.player.held !== it),
        ];
      }
      case 'hay':
        return [this.at('кормушка', AT.feeder, /Заложить сено/, () => !this.s.player.held)];
      default:
        return [this.dropAt(SAFE)];
    }
  }

  private approach(e: Elephant): P {
    return insideClamp({ x: e.x, y: e.y + 1.2 });
  }

  private toilet(e: Elephant): Step[] {
    const s = this.s;
    const name = profileOf(e).name;
    const steps: Step[] = [];
    const held = s.player.held;
    if (held && held.kind !== 'bucket') {
      // Бросить где стоишь — некогда
      steps.push({ label: 'бросить', to: () => (s.player.held ? s.player : null), expect: /^(Положить|Поставить открытый мешок|Заложить сено|Бросить тюк)/, done: () => !s.player.held });
    }
    const bucket = () =>
      s.player.held?.kind === 'bucket'
        ? s.player.held
        : s.items.filter((i) => i.kind === 'bucket').sort((a, b) => d(a, s.player) - d(b, s.player))[0];
    steps.push({
      label: 'взять бак',
      to: () => {
        if (s.player.held?.kind === 'bucket') return null;
        const b = bucket();
        return b ? { x: b.x, y: b.y + (inPaddock(b.x, b.y) ? 0 : 0.35) } : null;
      },
      expect: /Взять: бак/,
      done: () => s.player.held?.kind === 'bucket',
    });
    steps.push({
      label: 'вылить полный бак',
      to: () => ((s.player.held?.liters ?? 0) > 45 ? AT.drain : null),
      expect: /Вылить бак в слив/,
      done: () => !s.player.held?.liters,
    });
    steps.push({
      label: `бак под ${name}`,
      to: () => (s.player.held?.kind === 'bucket' ? this.approach(e) : null),
      expect: new RegExp(`(Подставить бак под|Бак под) ${name}`),
      done: () => !!bucketUnder(s, e),
      timeout: 30 * 25,
    });
    steps.push({ label: 'ждать', to: () => s.player, wait: () => e.signalStarted === undefined, timeout: 30 * 30 });
    steps.push({
      label: 'угостить',
      to: () => (s.t <= e.praiseUntil ? this.approach(e) : null),
      expect: /за бак/,
      done: () => e.praiseUntil < 0,
      timeout: 30 * 8,
    });
    steps.push({
      label: 'забрать бак',
      to: () => {
        const b = s.items.find((i) => i.kind === 'bucket' && d(i, e) < 2.5) ?? s.items.find((i) => i.kind === 'bucket' && inPaddock(i.x, i.y));
        return b ? { x: b.x, y: b.y } : null;
      },
      expect: /Взять: бак/,
      done: () => s.player.held?.kind === 'bucket',
    });
    steps.push({
      label: 'бак на дежурную точку',
      to: () => (s.player.held?.kind === 'bucket' && (s.player.held.liters ?? 0) <= 45 ? PARK_BUCKET : null),
      expect: /^Положить/,
      done: () => !s.player.held,
    });
    return steps;
  }

  private mealJob(): Step[] | null {
    const s = this.s;
    const k = s.kitchen;
    // На стеллаже стоят тазы с едой — разнести по одному тем, кому этого приёма ещё не дали
    const full = basinsOnRack(s).filter((b) => b.food);
    const meal = full[0]?.meal;
    if (meal) {
      const hungry = s.elephants.filter((e) => s.meals[meal][e.id] === null && !s.items.some((i) => i.kind === 'basin' && i.owner === e.id && i.food));
      if (hungry.length) {
        const steps: Step[] = [...this.freeHands()];
        for (const e of hungry.slice(0, full.length)) {
          const sl = profileOf(e).slot;
          const nm = profileOf(e).name;
          steps.push({
            label: 'взять таз с едой',
            to: () => {
              if (s.player.held) return null;
              const b = basinsOnRack(s).find((x) => x.food);
              return b ? { x: b.x + 0.5, y: b.y } : null;
            },
            expect: /^Взять: таз с /,
            done: () => !!s.player.held?.food,
          });
          steps.push({
            label: `слот ${nm}`,
            to: () => (s.player.held?.food && s.meals[meal][e.id] === null ? { x: sl.x, y: 9.55 } : null),
            expect: new RegExp(`для ${nm}`),
            done: () => s.meals[meal][e.id] !== null,
          });
        }
        return steps;
      }
    }
    const clean = basinsOnRack(s).some((b) => !b.food && !b.dirty);
    if (clean && k.kasha.status === 'ready' && k.kasha.portions > 0) {
      return [...this.freeHands(), this.at('кормовая', AT.kitchen, /Разложить кашу по тазам/)];
    }
    if (clean && k.veg.portions > 0 && s.t >= mealTime('dinner') - 45) {
      return [...this.freeHands(), this.at('кормовая', AT.kitchen, /Разложить ужин по тазам/)];
    }
    const due = kashaDue(s);
    if (due && k.kasha.status === 'idle' && s.t >= mealTime(due) - 26) {
      return [...this.freeHands(), this.at('кормовая', AT.kitchen, /Запарить кашу/)];
    }
    return null;
  }

  private tidy(): Step[] | null {
    const s = this.s;
    const onRack = (i: Item) => d(i, MAP.rackSpots[i.kind as 'bucket' | 'scoop'] ?? i) < 0.5;
    const bucket = s.items.find((i) => i.kind === 'bucket' && !(onRack(i) && !i.liters && !i.dirty));
    if (bucket && !s.elephants.some((e) => e.signalStarted !== undefined)) {
      return [
        ...this.freeHands(),
        this.take(bucket),
        { label: 'слив', to: () => ((bucket.liters ?? 0) > 0 || bucket.dirty ? AT.drain : null), expect: /Вылить бак в слив/, done: () => !bucket.liters && !bucket.dirty },
        this.at('стойка бак', AT.rack, /Положить на стойку/, () => !s.player.held),
      ];
    }
    const scoop = s.items.find((i) => i.kind === 'scoop' && !(onRack(i) && !i.dirty));
    if (scoop) return [...this.freeHands(), this.take(scoop), ...this.putAway(() => scoop)];
    const bag = s.items.find((i) => i.kind === 'bag' && (i.fill ?? 0) > 0);
    if (bag) return [...this.freeHands(), this.take(bag), this.at('помойка', AT.dump, /Выбросить мешок/, () => !s.player.held)];
    return null;
  }

  // ——— уборка ———

  private cleaning(): [string, Step[]] | null {
    const s = this.s;
    const cells: { kind: string; p: P }[] = [];
    s.cells.forEach((row, cy) => row.forEach((c, cx) => cells.push({ kind: c.kind === 'sawdust' && sawdustAbsorbed(s, c) ? 'absorbed' : c.kind, p: cellCenter(cx, cy) })));
    const awayFromElephants = (p: P) => !s.elephants.some((e) => d(e, p) < 1.0);

    if (s.dung.length) {
      const piles = s.dung.map((x) => ({ x: x.x, y: x.y }));
      // Немного куч — набегом с совком: в отсек, потом высыпать в контейнер. Много — с мешком
      if (piles.length <= BALANCE.items.scoopCapacity) return ['dung', this.scooped(piles)];
      return ['dung', this.bagged('scoop', piles, /Убрать навоз в мешок/)];
    }
    const trampled = cells.filter((c) => c.kind === 'dung' && awayFromElephants(c.p)).map((c) => c.p);
    if (trampled.length) return ['trampled', this.bagged('scoop', trampled, /Счистить затоптанный навоз/)];
    const wet = cells.filter((c) => c.kind === 'wet' && awayFromElephants(c.p)).map((c) => c.p);
    if (wet.length) return ['wet', this.bagged('fork', wet, /Убрать мокрую солому/)];
    const bareWet = cells.filter((c) => c.kind === 'bareWet' && awayFromElephants(c.p)).map((c) => c.p);
    if (bareWet.length) return ['sawdust', this.unbagged('sawdust', bareWet.slice(0, 6), /Засыпать опилками/)];
    const absorbed = cells.filter((c) => c.kind === 'absorbed' && awayFromElephants(c.p)).map((c) => c.p);
    if (absorbed.length) return ['broom', this.bagged('broom', absorbed, /Вымести опилки/)];
    const bare = cells.filter((c) => c.kind === 'bare' && awayFromElephants(c.p)).map((c) => c.p);
    if (bare.length) return ['straw', this.unbagged('straw', bare.slice(0, 3), /Постелить солому/)];
    return null;
  }

  private toolSteps(kind: Item['kind']): Step[] {
    const s = this.s;
    if (s.player.held?.kind === kind) return [];
    const onFloor = s.items.filter((i) => i.kind === kind).sort((a, b) => d(a, s.player) - d(b, s.player))[0];
    if (onFloor) return [this.take(onFloor)];
    if (kind === 'sawdust') return [this.at('опилки', AT.sawdust, /Взять ведро опилок/, () => s.player.held?.kind === 'sawdust')];
    if (kind === 'straw') return [this.at('солома', AT.straw, /Взять охапку соломы/, () => s.player.held?.kind === 'straw')];
    return [];
  }

  private bagged(tool: Item['kind'], targets: P[], expect: RegExp): Step[] {
    const s = this.s;
    const first = insideClamp(targets.sort((a, b) => d(a, s.player) - d(b, s.player))[0]);
    const cap = BALANCE.items.bagCapacity;
    const bagSpot = insideClamp({ x: first.x + 0.6, y: first.y + 0.6 });
    const reach = BALANCE.items.bagReach - 0.3;
    const near = targets.filter((p) => d(p, bagSpot) <= reach);
    const existing = s.items.find((i) => i.kind === 'bag' && (i.fill ?? 0) < cap);
    const steps: Step[] = [...this.freeHands()];
    let bag: () => Item | undefined;
    if (existing && d(existing, bagSpot) <= reach) {
      bag = () => (s.items.includes(existing) ? existing : undefined);
    } else {
      if (existing) steps.push(this.take(existing));
      else steps.push(this.at('мешки', AT.bags, /Взять новый мешок/, () => s.player.held?.kind === 'bag'));
      steps.push({ label: 'поставить мешок', to: () => (s.player.held?.kind === 'bag' ? bagSpot : null), expect: /Поставить открытый мешок/, done: () => !s.player.held });
      bag = () => s.items.find((i) => i.kind === 'bag' && d(i, bagSpot) < 1);
    }
    steps.push(...this.toolSteps(tool));
    const room = cap - (existing && d(existing, bagSpot) <= reach ? existing.fill ?? 0 : 0);
    for (const p of near.slice(0, room)) {
      steps.push({ label: `${tool} → мешок`, to: () => (s.player.held?.kind === tool ? p : null), expect, timeout: 30 * 6 });
    }
    steps.push(...this.putAwayLater(tool));
    steps.push({
      label: 'забрать мешок',
      to: () => {
        const b = bag();
        return b && !s.player.held ? { x: b.x, y: b.y } : null;
      },
      expect: /Взять: мешок/,
      done: () => s.player.held?.kind === 'bag',
    });
    steps.push({
      label: 'мешок прочь',
      to: () => (s.player.held?.kind === 'bag' ? ((s.player.held.fill ?? 0) >= 3 ? AT.dump : PARK_BAG) : null),
      expect: /^(Выбросить мешок|Поставить открытый мешок)/,
      done: () => !s.player.held,
    });
    return steps;
  }

  private scooped(targets: P[]): Step[] {
    const s = this.s;
    const steps: Step[] = [...this.freeHands(), ...this.toolSteps('scoop')];
    for (const p of targets.sort((a, b) => a.x - b.x)) {
      steps.push({ label: 'совок → отсек', to: () => (s.player.held?.kind === 'scoop' && s.dung.some((d) => d.x === p.x && d.y === p.y) ? p : null), expect: /Убрать навоз в (совок|тачку|мешок)/, timeout: 30 * 6 });
    }
    steps.push(...this.putAway(() => s.player.held));
    return steps;
  }

  private putAwayLater(tool: Item['kind']): Step[] {
    const s = this.s;
    const rack = MAP.rackSpots[tool as 'scoop' | 'fork' | 'broom'];
    if (!rack) return [this.dropAt(SAFE)];
    return [
      { label: 'на стойку', to: () => (s.player.held?.kind === tool ? AT.rack : null), expect: /Положить на стойку/, done: () => !s.player.held },
    ];
  }

  private unbagged(tool: Item['kind'], targets: P[], expect: RegExp): Step[] {
    const s = this.s;
    const steps: Step[] = [...this.freeHands(), ...this.toolSteps(tool)];
    if (tool === 'sawdust') {
      steps.push({ label: 'набрать опилок', to: () => ((s.player.held?.charges ?? 0) < targets.length && s.player.held?.kind === 'sawdust' ? AT.sawdust : null), expect: /Набрать опилок/ });
    }
    for (const p of targets) {
      steps.push({ label: `${tool} → клетка`, to: () => (s.player.held?.kind === tool ? p : null), expect, timeout: 30 * 6 });
    }
    steps.push({ label: 'положить', to: () => (s.player.held?.kind === tool ? SAFE : null), expect: /^Положить/, done: () => !s.player.held });
    return steps;
  }
}

// Сыграть смену целиком: dt — реальные секунды на кадр
export function playShift(s: State, fps = 30): Bot {
  const bot = new Bot(s);
  let guard = 0;
  while (s.phase !== 'report' && guard++ < fps * 60 * 40) {
    tick(s, 1 / fps, bot.frame());
  }
  return bot;
}

export const SLOT_NAMES = ELEPHANTS.map((e) => e.name);
