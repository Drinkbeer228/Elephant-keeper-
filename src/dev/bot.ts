// Бот-кипер: играет смену по тем же правилам, что человек.
// Ходит с той же скоростью, держит одну вещь, жмёт «Действие» только когда подсказка совпала.
// Видит то же, что игрок с осмотром (пузырь, сено, вода), — то есть играет как опытный кипер.

import { availableAction, tick, walkable, type Command, type State } from '../sim';
import { MAP, inBedding, inReachZone } from '../data/map';
import { BALANCE } from '../data/balance';
import { ELEPHANTS } from '../data/elephants';
import { profileOf, bucketUnder } from '../sim/elephants';
import { kashaDue, mealTime, vegStageAvailable } from '../sim/feeding';
import { sawdustAbsorbed } from '../sim/floor';
import type { Elephant, Item, MealId } from '../sim/types';

type P = { x: number; y: number };

interface Step {
  label: string;
  to: () => P | null; // null — шаг не нужен, пропустить
  expect?: RegExp; // нажать «Действие», когда подсказка совпала
  done?: () => boolean; // проверка после нажатия; не выполнено — нажать ещё
  wait?: () => boolean; // стоять, пока не станет true
  timeout?: number; // тиков
}

const GATE_IN = { x: 7, y: 8.3 };
const GATE_OUT = { x: 7, y: 9.8 };
const CORNER = { x: 14.3, y: 10 };
const PARK_BUCKET = { x: 7.6, y: 10.9 };
const PARK_BAG = { x: 9, y: 11 };
const SAFE = { x: 8.4, y: 12.2 };
const AT = {
  rack: { x: 3.5, y: 10.9 },
  sawdust: { x: 6.6, y: 10.9 },
  bags: { x: 2.4, y: 12.9 },
  wash: { x: 9.8, y: 12.5 },
  kitchen: { x: 16.5, y: 11.2 },
  hay: { x: 18.6, y: 3.5 },
  straw: { x: 18.6, y: 6.2 },
  dump: { x: 13.8, y: 14.2 },
  valve: { x: 14.4, y: 2.4 },
  fencePanel: { x: 14.6, y: 10.6 },
  gate: { x: 7, y: 10.2 },
  feeder: { x: 2.4, y: 2.6 },
};

function d(a: P, b: P): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

type Zone = 'in' | 'bottom' | 'right';
function zone(p: P): Zone {
  if (p.x < MAP.fenceX && p.y < MAP.fenceY) return 'in';
  return p.y >= MAP.fenceY ? 'bottom' : 'right';
}

function clear(a: P, b: P): boolean {
  const n = Math.ceil(d(a, b) / 0.1);
  for (let i = 1; i <= n; i++) {
    if (!walkable(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)) return false;
  }
  return true;
}

function route(from: P, to: P): P[] {
  const a = zone(from);
  const b = zone(to);
  const ways: Record<string, P[]> = {
    'in-bottom': [GATE_IN, GATE_OUT],
    'bottom-in': [GATE_OUT, GATE_IN],
    'bottom-right': [CORNER],
    'right-bottom': [CORNER],
    'in-right': [GATE_IN, GATE_OUT, CORNER],
    'right-in': [CORNER, GATE_OUT, GATE_IN],
  };
  const points = a === b ? [to] : [...ways[`${a}-${b}`], to];
  // Срезать углы: если до следующей точки путь свободен, текущую пропускаем
  while (points.length > 1 && clear(from, points[1])) points.shift();
  return points;
}

function cellCenter(cx: number, cy: number): P {
  return { x: MAP.bedding.x + cx + 0.5, y: MAP.bedding.y + cy + 0.5 };
}

function insideClamp(p: P): P {
  return { x: Math.min(Math.max(p.x, 1.6), 12.5), y: Math.min(Math.max(p.y, 1.6), 8.5) };
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
  stats: BotStats = { ticks: 0, busyTicks: 0, jobs: {}, aborted: {}, jobTicks: {} };

  constructor(private s: State) {}

  // Один кадр: какие команды отдать
  frame(): Command[] {
    const s = this.s;
    this.stats.ticks++;
    if (s.phase === 'acceptance') return this.accept();
    if (s.phase !== 'shift') return [];

    // Сигнал важнее всего: бросить текущее дело (кроме таза с едой в руках)
    if (this.job !== 'toilet' && this.signalTarget() && s.player.held?.food == null) this.abort('preempt');
    if (!this.plan.length) this.choose();
    if (!this.plan.length) return [];
    this.stats.busyTicks++;
    this.stats.jobTicks[this.job] = (this.stats.jobTicks[this.job] ?? 0) + 1;
    return this.run();
  }

  private accept(): Command[] {
    const cmds: Command[] = this.s.checklist.map((c) => ({ type: 'toggleCheck', id: c.id, value: !c.defect }));
    cmds.push({ type: 'acceptShift' });
    return cmds;
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

    if (d(p, target) > 0.25 && !(this.pressed && st.done)) return this.move(target);

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
      this.nudgeDir = { x: Math.random() - 0.5, y: Math.random() - 0.5 };
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

    const basin = s.items.find((i) => i.kind === 'basin' && !i.food);
    if (basin) {
      const all = s.items.filter((i) => i.kind === 'basin' && !i.food);
      const steps: Step[] = [...this.freeHands(), this.take(basin, /Взять: пустой таз/)];
      for (const b of all.filter((x) => x !== basin)) {
        steps.push({ label: 'ещё таз', to: () => (s.items.includes(b) && s.player.held?.kind === 'basin' ? { x: b.x, y: b.y + 0.3 } : null), expect: /Взять ещё пустой таз/, done: () => !s.items.includes(b) });
      }
      steps.push(this.at('мойка', AT.wash, /Вымыть таз/, () => !s.player.held));
      return this.start('basin', steps);
    }

    const loose = s.items.find(
      (i) => i.kind !== 'basin' && (inBedding(i.x, i.y) || inReachZone(i.x, i.y)) && !s.elephants.some((e) => e.signalStarted !== undefined && d(e, i) < 1.2),
    );
    if (loose) return this.start('loose', [...this.freeHands(), this.take(loose), ...this.putAway(() => s.player.held)]);

    if (!s.fenceOn) return this.start('fence', [...this.freeHands(), this.at('пастух', AT.fencePanel, /Включить электропастух/)]);
    if (s.gateOpen) return this.start('gate', [...this.freeHands(), this.at('задвижка', AT.gate, /Закрыть задвижку/)]);
    if (!s.valveOpen && s.trough < 40) return this.start('valveOpen', [...this.freeHands(), this.at('вентиль', AT.valve, /Открыть вентиль/)]);
    if (s.feederHay < 35) {
      return this.start('hay', [...this.freeHands(), this.at('сенник', AT.hay, /Взять тюк сена/), this.at('кормушка', AT.feeder, /Заложить сено/)]);
    }
    if (vegStageAvailable(s)) return this.start('veg', [...this.freeHands(), this.at('кормовая', AT.kitchen, /^(Ужин: |Запарить кашу)/)]);
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
      to: () => (this.s.items.includes(item) ? { x: item.x, y: item.y + (inBedding(item.x, item.y) ? 0 : 0.35) } : null),
      expect: expect ?? /^Взять: /,
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
          { label: 'мойка бак', to: () => ((it.liters ?? 0) > 0 || it.dirty ? AT.wash : null), expect: /Вылить и вымыть бак/, done: () => !it.liters && !it.dirty },
          this.dropAt(PARK_BUCKET),
        ];
      case 'scoop':
        return [
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
      case 'basin':
        return it.food ? [this.dropAt(SAFE)] : [this.at('мойка', AT.wash, /Вымыть таз/, () => !this.s.player.held)];
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
        return b ? { x: b.x, y: b.y + (inBedding(b.x, b.y) ? 0 : 0.35) } : null;
      },
      expect: /Взять: бак/,
      done: () => s.player.held?.kind === 'bucket',
    });
    steps.push({
      label: 'вылить полный бак',
      to: () => ((s.player.held?.liters ?? 0) > 45 ? AT.wash : null),
      expect: /Вылить и вымыть бак/,
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
        const b = s.items.find((i) => i.kind === 'bucket' && d(i, e) < 2.5) ?? s.items.find((i) => i.kind === 'bucket' && inBedding(i.x, i.y));
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
    const deliver = (meal: MealId, re: RegExp): Step[] | null => {
      const target = s.elephants.find(
        (e) => s.meals[meal][e.id] === null && !s.items.some((i) => i.kind === 'basin' && i.owner === e.id && i.food),
      );
      if (!target || k.cleanBasins <= 0) return null;
      const slot = profileOf(target).slot;
      const name = profileOf(target).name;
      void slot;
      void name;
      const steps: Step[] = [...this.freeHands(), this.at('кормовая', AT.kitchen, re, () => s.player.held?.kind === 'basin')];
      for (const e of s.elephants) {
        const sl = profileOf(e).slot;
        const nm = profileOf(e).name;
        steps.push({
          label: `слот ${nm}`,
          to: () => (s.player.held?.food && s.meals[meal][e.id] === null ? { x: sl.x, y: 9.55 } : null),
          expect: new RegExp(`для ${nm}`),
          done: () => s.meals[meal][e.id] !== null,
        });
      }
      return steps;
    };
    if (k.kasha.status === 'ready' && k.kasha.portions > 0 && k.kasha.meal) {
      const job = deliver(k.kasha.meal, /Взять тазы? с кашей/);
      if (job) return job;
    }
    if (k.veg.portions > 0 && s.t >= mealTime('dinner') - 45) {
      const job = deliver("dinner", /Взять тазы? с овощами/);
      if (job) return job;
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
        { label: 'мойка бак', to: () => ((bucket.liters ?? 0) > 0 || bucket.dirty ? AT.wash : null), expect: /Вылить и вымыть бак/, done: () => !bucket.liters && !bucket.dirty },
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
      return ['dung', this.bagged('scoop', s.dung.map((x) => ({ x: x.x, y: x.y })), /Убрать навоз в мешок/)];
    }
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
