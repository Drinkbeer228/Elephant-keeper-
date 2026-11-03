// Бот-кипер: играет смену по тем же правилам, что человек.
// Ходит с той же скоростью, держит одну вещь, жмёт «Действие» только когда подсказка совпала.
// Видит то же, что игрок с осмотром (пузырь, сено, вода), — то есть играет как опытный кипер.

import { availableAction, tick, type Command, type State } from '../sim';
import { route } from '../sim/nav';
import { MAP, inPaddock, inReachZone } from '../data/map';
import { BALANCE } from '../data/balance';
import { ELEPHANTS } from '../data/elephants';
import { profileOf, bucketUnder } from '../sim/elephants';
import { allServedDinner, kashaDue, mealTime } from '../sim/feeding';
import { isDark } from '../sim/clock';
import { sawdustAbsorbed } from '../sim/floor';
import { ITEM_NAMES, basinsOnRack } from '../sim/items';
import { STOCK_LABELS } from '../sim/stock';
import { supplyOpen } from '../sim/truck';
import type { CargoUnit, Elephant, Item } from '../sim/types';

type P = { x: number; y: number };

interface Step {
  label: string;
  to: () => P | null; // null — шаг не нужен, пропустить
  expect?: RegExp; // нажать «Действие», когда подсказка совпала
  done?: () => boolean; // проверка после нажатия; не выполнено — нажать ещё
  wait?: () => boolean; // стоять, пока не станет true
  timeout?: number; // тиков
  act?: () => Command[]; // на месте — отдать свои команды (чистка овощей), пока не done
}

// Бак и мешок паркуются в верхнем коридоре, подальше от станций и тачки
const PARK_BUCKET = { x: 24.0, y: 15.2 };
const PARK_BAG = { x: 26.0, y: 15.2 };
const SAFE = { x: 30.0, y: 15.4 };
// Откуда подходить к станциям: со стороны двери или прохода
const st = MAP.stations;
const AT = {
  rack: { x: st.rack.x + st.rack.w / 2 + 0.6, y: 21.0 },
  // Подход к рохле — с юга: с севера подсказку перебивает «Взять: …» с пола
  jack: { x: MAP.jackStart.x, y: MAP.jackStart.y + 0.4 },
  jackPark: { x: MAP.jackStart.x, y: MAP.jackStart.y + 0.4 },
  unload: { x: st.unload.x, y: st.unload.y - st.unload.h / 2 - 0.5 },
  basinRack: { x: st.basinRack.x + st.basinRack.w / 2 + 0.6, y: st.basinRack.y },
  vegRack: { x: st.vegRack.x - st.vegRack.w / 2 - 0.5, y: st.vegRack.y },
  lightSwitch: { x: st.lightSwitch.x + 0.5, y: st.lightSwitch.y - 0.5 },
  sawdust: { x: st.sawdust.x, y: st.sawdust.y - 0.8 },
  bags: { x: st.bags.x, y: st.bags.y - 0.8 },
  wash: { x: st.wash.x, y: st.wash.y + st.wash.h / 2 + 0.5 },
  kitchen: { x: st.kitchen.x, y: st.kitchen.y - st.kitchen.h / 2 - 0.5 },
  stove: { x: st.stove.x, y: st.stove.y + st.stove.h / 2 + 0.5 },
  hay: { x: st.hay.x, y: st.hay.y - st.hay.h / 2 - 0.5 },
  straw: { x: st.straw.x, y: st.straw.y - st.straw.h / 2 - 0.5 },
  dump: { x: st.dump.x, y: st.dump.y - st.dump.h / 2 - 0.5 },
  drain: { x: st.drain.x, y: st.drain.y - 0.6 },
  valve: { x: st.valve.x, y: st.valve.y + 0.6 },
  gate: { x: st.gate.x, y: MAP.fenceY + 0.9 },
  feeder: { x: MAP.feeder.x + 0.2, y: MAP.feeder.y + 1.0 },
};

function d(a: P, b: P): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export { route } from '../sim/nav';

// Откуда брать вещь: у решётки — с дорожки сквозь прутья, внутри вольера — с места, снаружи — чуть ниже
export function reachPoint(item: P): P {
  if (inPaddock(item.x, item.y) && item.y > MAP.fenceY - 0.6) return { x: item.x, y: MAP.fenceY + 0.35 };
  return { x: item.x, y: item.y + (inPaddock(item.x, item.y) ? 0 : 0.35) };
}

function cellCenter(cx: number, cy: number): P {
  return { x: MAP.floor.x + cx + 0.5, y: MAP.floor.y + cy + 0.5 };
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
  private hornDone = false; // одноразовая реакция на гудок поставки
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
    // Пора запаривать кашу — уборка подождёт
    if (this.job && this.job !== 'toilet' && this.job !== 'meal' && this.kashaUrgent()) this.abort('kasha');
    // Гудок: бросить затянувшуюся уборку — окно поставки ограничено (однократно)
    if (!this.hornDone && s.supply.arrived) {
      this.hornDone = true;
      if (this.job && this.job !== 'toilet' && this.job !== 'meal' && this.job !== 'supply') this.abort('supply');
    }
    // За 40 минут до сдачи выключенный свет важнее любых дел (кроме туалета)
    if (this.job && this.job !== 'toilet' && this.job !== 'light' && s.dutyLight && s.t >= BALANCE.time.shiftEnd - 40) this.abort('light');
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
    const close = st.expect && !st.wait && d(p, target) < 1.0 && !!this.press(st.expect);
    if (d(p, target) > 0.25 && !close && !(this.pressed && st.done)) return this.move(target);

    if (st.wait) {
      return st.wait() ? this.next() : [];
    }
    if (st.act) {
      if (st.done?.()) return this.next();
      return st.act();
    }
    if (st.expect) {
      if (this.pressed && st.done) {
        if (st.done()) return this.next();
        this.pressed = false;
      }
      const cmd = this.press(st.expect);
      if (!cmd) return [];
      if (st.done) {
        this.pressed = true;
        return [cmd];
      }
      this.next();
      return [cmd];
    }
    return this.next();
  }

  // Команда «Действие», если подсказка подходит; в меню — нужный пункт
  private press(expect: RegExp): Command | null {
    const a = availableAction(this.s);
    if (!a) return null;
    if (a.choices) {
      const i = a.choices.findIndex((c) => expect.test(c.label));
      return i >= 0 ? { type: 'action', choice: i } : null;
    }
    return expect.test(a.label) ? { type: 'action' } : null;
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
    const w = route(p, target, supplyOpen(this.s))[0];
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

  // Бот отвечает за верхний загон слоних; нижним занимается Димон
  private signalTarget(): Elephant | undefined {
    return this.s.elephants.find((e) => profileOf(e).paddock === 'upper' && e.signalStarted !== undefined && e.state !== 'walkCommand' && !bucketUnder(this.s, e));
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
      .filter((e) => profileOf(e).paddock === 'upper' && e.state !== 'sleep' && e.signalStarted === undefined && e.bladder >= 62)
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

    // Посторонние вещи в верхнем вольере — сначала забрать (слонихи теряют и ломают), потом поставка
    const stray = s.items.find(
      (i) =>
        i.kind !== 'basin' &&
        i.y < MAP.fenceY + 1.3 &&
        (inPaddock(i.x, i.y) || inReachZone(i.x, i.y)) &&
        !s.elephants.some((e) => e.signalStarted !== undefined && d(e, i) < 1.2),
    );
    if (stray) return this.start('loose', [...this.freeHands(), this.take(stray), ...this.putAway(() => s.player.held)]);

    // Поставка: пока окно открыто и борт не пуст — принять (приоритет после туалета и еды)
    const supply = this.supplyJob();
    if (supply && supply.length) return this.start('supply', supply);

    if (s.gateOpen) return this.start('gate', [...this.freeHands(), this.at('задвижка', AT.gate, /Закрыть задвижку/)]);
    if (!s.valveOpen && s.trough < 40) return this.start('valveOpen', [...this.freeHands(), this.at('вентиль', AT.valve, /Открыть вентиль/)]);
    if (s.feederHay < 35) {
      return this.start('hay', [...this.freeHands(), this.at('сенник', AT.hay, /Взять тюк сена/), this.at('кормушка', AT.feeder, /Заложить сено/)]);
    }
    const dinner = this.dinnerJob();
    if (dinner) return this.start('veg', dinner);
    const c = s.container;
    if (c.truckAt === null && c.fill >= BALANCE.container.capacity * BALANCE.container.callAt) {
      return this.start('truck', [...this.freeHands(), this.at('бак', AT.dump, /Позвонить: вывезти/)]);
    }
    // Ночью убирать в вольере без дежурного света нельзя — сначала свет; утром — выключить
    if (s.dutyLight && !isDark(s)) return this.start('light', [...this.freeHands(), this.at('свет', AT.lightSwitch, /Выключить дежурный свет/)]);
    if (t >= 1370) {
      const tidy = this.tidy();
      if (tidy) return this.start('tidy', tidy);
    }
    const clean = this.cleaning();
    if (clean && isDark(s) && !s.dutyLight) return this.start('light', [...this.freeHands(), this.at('свет', AT.lightSwitch, /Включить дежурный свет/)]);
    if (clean) return this.start(clean[0], clean[1]);
    if (s.litter.length >= 3) return this.start('sweep', this.sweep());
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

  // Освободить руки и тележку: рохлю поставить на место, из рук убрать (бак — на дежурную точку)
  private freeHands(): Step[] {
    const steps: Step[] = [];
    if (this.s.jack.pushed && !this.s.jack.cargo) {
      steps.push({
        label: 'поставить рохлю',
        to: () => (this.s.jack.pushed ? AT.jackPark : null),
        expect: /Поставить рохлю/,
        done: () => !this.s.jack.pushed,
        timeout: 30 * 60,
      });
    }
    return steps.concat(this.s.player.held ? this.putAway(() => this.s.player.held) : []);
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
        // Использованный мешок везём в бак: с сором на земле сменщик не примет
        return (it.fill ?? 0) > 0
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
      case 'sawdust':
        // Ведро — на место в Дежурке; добор опилок — лопатой в Опилочнике, отдельным делом
        return [this.at('ведро на место', { x: MAP.pailSpot.x - 0.5, y: MAP.pailSpot.y }, /Поставить ведро на место/, () => this.s.player.held !== it)];
      default:
        return [this.dropAt(SAFE)];
    }
  }

  private approach(e: Elephant): P {
    return insideClamp({ x: e.x, y: e.y + 1.2 });
  }

  // Поставка: взять рохлю, снять поддоны с борта, развезти по складам
  private supplyJob(): Step[] | null {
    const s = this.s;
    const sp = s.supply;
    const j = s.jack;
    const park = (): Step[] =>
      j.pushed ? [{ label: 'поставить рохлю', to: () => (j.pushed ? AT.jackPark : null), expect: /Поставить рохлю/, done: () => !j.pushed, timeout: 30 * 90 }] : [];
    if (j.cargo) {
      // Рохля с грузом могла остаться стоять («бросить» в туалете): сначала взять её
      const steps: Step[] = [];
      if (!j.pushed) {
        steps.push({
          label: 'взять рохлю с грузом',
          to: () => (j.pushed ? null : { x: j.x, y: j.y + 0.4 }),
          expect: /Везти рохлю/,
          done: () => j.pushed,
          timeout: 30 * 90,
        });
      }
      return [...this.freeHands(), ...steps.concat(this.deliverCargo(j.cargo))];
    }
    if (!sp.arrived || sp.left || !sp.bays.length) {
      // Борт пуст: рохля обязана вернуться в карман у кладовой, где бы её ни бросили.
      // Днём подождёт (срочнее еда и уборка), к вечеру — точно на место
      const home = () => !j.pushed && !j.cargo && Math.hypot(j.x - MAP.jackStart.x, j.y - MAP.jackStart.y) <= 1.5;
      if (home() || (!j.pushed && s.t < 1300)) return park();
      return [
        ...(j.pushed
          ? []
          : [
              {
                label: 'взять рохлю',
                to: () => (j.pushed || home() ? null : { x: j.x, y: j.y + 0.4 }),
                expect: /Везти рохлю/,
                done: () => j.pushed,
                timeout: 30 * 90,
              },
            ]),
        { label: 'поставить рохлю на место', to: () => (j.pushed ? AT.jackPark : null), expect: /Поставить рохлю/, done: () => !j.pushed, timeout: 30 * 90 },
      ];
    }
    const bay = sp.bays[0];
    return [
      // Руки должны быть свободны: с мешком в руках «Везти рохлю» не нажать
      ...this.freeHands(),
      // to() null только когда шаг завершён: иначе шаг пропускается без нажатия
      { label: 'взять рохлю', to: () => (j.pushed ? null : AT.jack), expect: /Везти рохлю/, done: () => j.pushed, timeout: 30 * 90 },
      { label: 'к борту', to: () => (j.cargo ? null : AT.unload), expect: new RegExp(`^${bay.map((u) => STOCK_LABELS[u.kind]).join('.*')} `), done: () => !!j.cargo, timeout: 30 * 120 },
    ];
  }

  // Смешанный поддон сдаётся по частям: цель — точка сдачи первого не сданного вида
  private deliverCargo(cargo: CargoUnit[]): Step[] {
    const j = this.s.jack;
    const dropAt: Record<CargoUnit['kind'], P> = { grain: AT.stove, veg: AT.vegRack, fruit: AT.vegRack, hay: AT.hay, straw: AT.straw, sawdust: AT.sawdust };
    return [
      {
        label: 'к сдаче',
        to: () => {
          if (!j.pushed || !j.cargo?.length) return null;
          const next = cargo.find((u) => j.cargo!.some((v) => v.kind === u.kind));
          return next ? dropAt[next.kind] : null;
        },
        expect: new RegExp(`Сдать груз: (${cargo.map((u) => STOCK_LABELS[u.kind]).join('|')})`),
        done: () => !j.cargo,
        timeout: 30 * 150,
      },
    ];
  }

  private toilet(e: Elephant): Step[] {
    const s = this.s;
    const name = profileOf(e).name;
    const steps: Step[] = [];
    const held = s.player.held;
    if (held || s.jack.pushed) {
      // Бросить где стоишь — некогда (рохлю просто отпустить, с грузом — досдать потом)
      steps.push({
        label: 'бросить',
        to: () => (s.player.held || s.jack.pushed ? s.player : null),
        expect: /^(Положить|Поставить открытый мешок|Заложить сено|Бросить тюк|Поставить рохлю|Сдать груз)/,
        done: () => !s.player.held && !s.jack.pushed,
      });
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
      // Фруктов нет — угощать нечем, ждём не стоим
      to: () => (s.t <= e.praiseUntil && s.stock.fruit > 0 ? this.approach(e) : null),
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
      // С мочой бак не паркуем: и вонь, и смена не примет — сначала слив
      label: 'вылить бак в слив',
      to: () => ((s.player.held?.liters ?? 0) > 0 ? AT.drain : null),
      expect: /Вылить бак в слив/,
      done: () => !s.player.held?.liters,
    });
    steps.push({
      label: 'бак на дежурную точку',
      to: () => (s.player.held?.kind === 'bucket' ? PARK_BUCKET : null),
      expect: /^Положить/,
      done: () => !s.player.held,
    });
    return steps;
  }

  private kashaUrgent(): boolean {
    const due = kashaDue(this.s);
    return !!due && this.s.kitchen.kasha.status === 'idle' && this.s.t >= mealTime(due) - 26;
  }

  private mealJob(): Step[] | null {
    const s = this.s;
    const k = s.kitchen;
    // На стеллаже стоят тазы с едой — разнести по одному тем, кому этого приёма ещё не дали
    const full = basinsOnRack(s).filter((b) => b.food && b.owner && profileOf(s.elephants.find((e) => e.id === b.owner)!).paddock === 'upper');
    const meal = full[0]?.meal;
    if (meal) {
      const hungry = s.elephants.filter(
        (e) => profileOf(e).paddock === 'upper' && s.meals[meal][e.id] === null && full.some((basin) => basin.owner === e.id),
      );
      if (hungry.length) {
        const steps: Step[] = [...this.freeHands()];
        for (const e of hungry) {
          const sl = profileOf(e).slot;
          const nm = profileOf(e).name;
          steps.push({
            label: 'взять таз с едой',
            to: () => {
              if (s.player.held) return null;
              const b = basinsOnRack(s).find((x) => x.food && x.meal === meal && x.owner === e.id);
              return b ? { x: b.x + 0.5, y: b.y } : null;
            },
            expect: new RegExp(`^Взять: таз с .* для ${nm}$`),
            done: () => !!s.player.held?.food && s.player.held.owner === e.id,
          });
          steps.push({
            label: `слот ${nm}`,
            // Таз ставят у решётки: кипер стоит в коридоре, до слота — через прутья
            to: () => (s.player.held?.food && s.meals[meal][e.id] === null ? { x: sl.x, y: MAP.fenceY + 0.4 } : null),
            expect: new RegExp(`для ${nm}`),
            done: () => s.meals[meal][e.id] !== null,
          });
        }
        return steps;
      }
    }
    const clean = basinsOnRack(s).some((b) => !b.food && !b.dirty);
    if (clean && k.kasha.status === 'ready' && k.kasha.portions > 0) {
      return [...this.freeHands(), this.at('котёл', AT.stove, /Разложить кашу по тазам/)];
    }
    if (clean && k.veg.portions > 0 && s.t >= mealTime('dinner') - 45) {
      return [...this.freeHands(), this.at('стол', AT.kitchen, /Разложить ужин по тазам/)];
    }
    const due = kashaDue(s);
    if (due && k.kasha.status === 'idle' && s.t >= mealTime(due) - 26) {
      return [...this.freeHands(), this.at('котёл', AT.stove, /Запарить кашу/)];
    }
    return null;
  }

  // Ужин: корзина → стеллаж → замочить → промыть → почистить → нарезать. Раскладывает по тазам mealJob
  private dinnerJob(): Step[] | null {
    const s = this.s;
    if (s.t < BALANCE.food.vegStartFrom || allServedDinner(s) || s.kitchen.veg.portions > 0) return null;
    if (s.items.some((i) => i.kind === 'basin' && i.food === 'veg')) return null;
    // Овощей нет (поставка не принята) — ужина не будет, ждать нечего
    const basketAnywhere = s.player.held?.kind === 'basket' ? s.player.held : s.items.find((i) => i.kind === 'basket');
    if ((!basketAnywhere || basketAnywhere.veg === undefined) && s.stock.veg < BALANCE.consumption.dinnerVeg) return null;
    const b = s.player.held?.kind === 'basket' ? s.player.held : s.items.find((i) => i.kind === 'basket');
    if (!b) return null;
    const table = st.kitchen;
    const onTable = () => s.items.includes(b) && Math.abs(b.x - table.x) <= table.w / 2 + 0.3 && Math.abs(b.y - table.y) <= table.h / 2 + 0.3;
    if (b.veg === 'soaking' && s.t < (b.soakUntil ?? 0)) return null;
    const hold: Step[] = s.player.held === b || b.veg === 'soaking' || onTable() ? [] : [...this.freeHands(), this.take(b, /Взять: корзина/)];
    const clean: Step[] = [
      { label: 'чистка', to: () => (s.prep ? AT.kitchen : null), act: () => this.cut(), done: () => !s.prep, timeout: 30 * 30 },
      this.at('нарезать', AT.kitchen, /Нарезать ужин/, () => s.kitchen.veg.portions > 0),
    ];
    switch (b.veg) {
      case undefined:
        return [...hold, this.at('стеллаж овощей', AT.vegRack, /Набрать овощей/, () => b.veg === 'raw'), this.at('замочить', AT.wash, /Замочить овощи/, () => b.veg === 'soaking')];
      case 'raw':
        return [...hold, this.at('замочить', AT.wash, /Замочить овощи/, () => b.veg === 'soaking')];
      case 'soaking':
        return [
          ...(s.player.held ? this.freeHands() : []),
          this.at('промыть', AT.wash, /Промыть овощи/, () => b.veg === 'washed'),
          this.at('на стол', AT.kitchen, /Чистить овощи/, () => !!s.prep),
          ...clean,
        ];
      case 'washed':
        return [...hold, this.at('на стол', AT.kitchen, /(Чистить овощи|Продолжить чистку)/, () => !!s.prep?.open), ...clean];
      case 'peeled':
        return [...(s.player.held ? this.freeHands() : []), clean[1]];
    }
  }

  // Срезать первый несрезанный дефект на текущем овоще
  private cut(): Command[] {
    const p = this.s.prep;
    if (!p) return [];
    const i = p.pieces[p.index].spots.findIndex((x) => !x.cut);
    return [{ type: 'prepCut', spot: i }];
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

  // Уборка — только верхний загон: нижним занимается Димон
  private cleaning(): [string, Step[]] | null {
    const s = this.s;
    const cells: { kind: string; p: P }[] = [];
    s.cells.forEach((row, cy) => {
      if (cy < MAP.paddock.y0 || cy >= MAP.fenceY) return; // коридоры и нижний загон — не его дело
      row.forEach((c, cx) => cells.push({ kind: c.kind === 'sawdust' && sawdustAbsorbed(s, c) ? 'absorbed' : c.kind, p: cellCenter(cx, cy) }));
    });
    const awayFromElephants = (p: P) => !s.elephants.some((e) => d(e, p) < 1.0);

    if (s.dung.some((x) => x.y < MAP.fenceY)) {
      const piles = s.dung.filter((x) => x.y < MAP.fenceY).map((x) => ({ x: x.x, y: x.y }));
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
      // Использованный мешок сразу в бак: с сором на полу сменщик не примет
      label: 'мешок прочь',
      to: () => (s.player.held?.kind === 'bag' ? ((s.player.held.fill ?? 0) > 0 ? AT.dump : PARK_BAG) : null),
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
    // Совок — домой: высыпать, вымыть, на стойку. Что в руках, смотрим по ходу, а не при составлении плана
    const scoop = () => (s.player.held?.kind === 'scoop' ? s.player.held : null);
    steps.push(
      { label: 'высыпать совок', to: () => ((scoop()?.load ?? 0) > 0 ? AT.dump : null), expect: /Высыпать совок/, done: () => !scoop()?.load },
      { label: 'мойка совок', to: () => (scoop()?.dirty ? AT.wash : null), expect: /Вымыть совок/, done: () => !scoop()?.dirty },
      { label: 'стойка', to: () => (scoop() ? AT.rack : null), expect: /Положить на стойку/, done: () => !scoop() },
    );
    return steps;
  }

  // Подмести сор с тачки: метлу со стойки, обойти кучки, метлу на место
  private sweep(): Step[] {
    const s = this.s;
    const steps: Step[] = [...this.freeHands(), ...this.toolSteps('broom')];
    for (const l of [...s.litter].sort((a, b) => a.x - b.x)) {
      steps.push({ label: 'подмести', to: () => (s.player.held?.kind === 'broom' && s.litter.includes(l) ? { x: l.x, y: l.y } : null), expect: /Подмести сор/, timeout: 30 * 8 });
    }
    steps.push(...this.putAwayLater('broom'));
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
    // Опилки набирает лопата в Опилочнике: ведро оставляет у ларя, берёт лопату, насыпает
    if (tool === 'sawdust') {
      const shovel = () => s.items.find((i) => i.kind === 'shovel');
      const bucket = () => s.items.find((i) => i.kind === 'sawdust');
      const need = targets.length;
      const lari = { x: st.sawdust.x, y: st.sawdust.y - 1.2 };
      steps.push(
        // Ведро в руках — положить у ларя
        { label: 'ведро к ларю', to: () => (s.player.held?.kind === 'sawdust' ? lari : null), expect: /^Положить/, done: () => !!bucket() && d(bucket()!, lari) < 1.8 },
        // Лопату берём со стены Опилочника
        { label: 'взять лопату', to: () => (shovel() && s.player.held?.kind !== 'shovel' ? { x: shovel()!.x, y: shovel()!.y + 0.35 } : null), expect: /лопата/, done: () => s.player.held?.kind === 'shovel' },
        { label: 'насыпать в ведро', to: () => (s.player.held?.kind === 'shovel' ? AT.sawdust : null), expect: /Насыпать опилок в ведро/, done: () => (bucket()?.charges ?? 0) >= need },
        // Лопату на место, ведро обратно в руки
        { label: 'лопату на место', to: () => (s.player.held?.kind === 'shovel' ? { x: MAP.shovelSpot.x, y: MAP.shovelSpot.y + 0.35 } : null), expect: /^Положить/, done: () => s.player.held?.kind !== 'shovel' },
        { label: 'ведро в руки', to: () => (!s.player.held && bucket() ? { x: bucket()!.x, y: bucket()!.y + 0.35 } : null), expect: /Взять: ведро опилок/, done: () => s.player.held?.kind === 'sawdust' },
      );
    }
    for (const p of targets) {
      steps.push({ label: `${tool} → клетка`, to: () => (s.player.held?.kind === tool ? p : null), expect, timeout: 30 * 6 });
    }
    if (tool === 'sawdust') steps.push(...this.putAway(() => s.player.held));
    else steps.push({ label: 'положить', to: () => (s.player.held?.kind === tool ? SAFE : null), expect: /^Положить/, done: () => !s.player.held });
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
