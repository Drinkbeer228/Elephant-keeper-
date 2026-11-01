import { BALANCE } from '../data/balance';
import { MAP, inBedding, inReachZone, nearStation } from '../data/map';
import { dist, profileOf, treat, walkCommand, bucketUnder } from './elephants';
import { emit, hint } from './events';
import { cellAt, sawdustAbsorbed, setCell } from './floor';
import { MEAL_LABELS, VEG_STAGES, doVegStage, kashaDue, startKasha, vegStageAvailable } from './feeding';
import { ITEM_NAMES, openBagNear } from './items';
import { clockText } from './clock';
import { newItem } from './state';
import type { Elephant, Item, State } from './types';

export interface ActionOption {
  label: string;
  disabled?: boolean; // показать, почему нельзя
  run: (state: State) => void;
}

const REACH = BALANCE.player.reach;

function near(state: State, id: Parameters<typeof nearStation>[0]): boolean {
  return nearStation(id, state.player.x, state.player.y, BALANCE.player.stationReach);
}

function nearestElephant(state: State, maxDist = REACH + BALANCE.elephant.radius): Elephant | undefined {
  return state.elephants
    .filter((e) => dist(e, state.player) <= maxDist)
    .sort((a, b) => dist(a, state.player) - dist(b, state.player))[0];
}

function blocked(label: string, why?: Parameters<typeof emit>[1]['why']): ActionOption {
  return {
    label,
    disabled: true,
    run: (s) => emit(s, { kind: 'info', text: label, why }),
  };
}

function drop(state: State, item: Item, x?: number, y?: number): void {
  const p = state.player;
  item.x = x ?? p.x + p.facing.x * 0.4;
  item.y = y ?? p.y + p.facing.y * 0.4;
  item.droppedAt = state.t;
  state.items.push(item);
  p.held = null;
  if (item.kind !== 'basin' && item.kind !== 'bucket' && (inBedding(item.x, item.y) || inReachZone(item.x, item.y))) {
    hint(state, 'reach', 'Вещь в зоне хобота. Скучающая слониха дотянется и сломает — не оставляй надолго.');
  }
}

function putOnRack(item: Item): { x: number; y: number } | null {
  const spots = MAP.rackSpots as Record<string, { x: number; y: number }>;
  return spots[item.kind] ?? null;
}

function takeFromFloor(state: State): ActionOption | null {
  const p = state.player;
  const item = state.items
    .filter((i) => dist(i, p) <= 1.1)
    .sort((a, b) => dist(a, p) - dist(b, p))[0];
  if (!item) return null;
  return {
    label: `Взять: ${itemLabel(item)}`,
    run: (s) => {
      s.items = s.items.filter((i) => i !== item);
      s.player.held = item;
    },
  };
}

export function itemLabel(item: Item): string {
  if (item.kind === 'basin') return item.food === 'kasha' ? 'таз с кашей' : item.food === 'veg' ? 'таз с овощами' : 'пустой таз';
  if (item.kind === 'bucket' && (item.liters ?? 0) > 0) return `бак (${Math.round(item.liters ?? 0)} л)`;
  if (item.kind === 'bag') return `мешок (${item.fill ?? 0}/${BALANCE.items.bagCapacity})`;
  if (item.charges !== undefined) return `${ITEM_NAMES[item.kind]} (${item.charges})`;
  return ITEM_NAMES[item.kind];
}

export function availableAction(state: State): ActionOption | null {
  if (state.phase === 'report') return null;
  const p = state.player;
  const held = p.held;

  const praised = state.elephants.find((e) => dist(e, p) <= 2.6 && state.t <= e.praiseUntil);
  if (praised) {
    return { label: `Угостить ${profileOf(praised).name} (за бак)`, run: (s) => treat(s, praised) };
  }

  return held ? heldAction(state, held) : emptyHandAction(state);
}

function heldAction(state: State, held: Item): ActionOption {
  const p = state.player;
  const cell = cellAt(state, p.x, p.y);
  const dropOption: ActionOption = { label: `Положить: ${itemLabel(held)}`, run: (s) => drop(s, held) };

  switch (held.kind) {
    case 'bucket': {
      const e = nearestElephant(state);
      if (e && e.state !== 'sleep' && !bucketUnder(state, e)) {
        const name = profileOf(e).name;
        const signaling = e.signalStarted !== undefined;
        return {
          label: signaling ? `Подставить бак под ${name}` : `Бак под ${name}: «Давай гуляй»`,
          run: (s) => {
            drop(s, held, e.x, e.y);
            if (signaling && e.state === 'walk') {
              // Марго шла к ограждению: бак у ног — стоит и ждёт тут
              e.state = 'signal';
              e.timer = profileOf(e).signalLead;
            }
            if (!walkCommand(s, e)) emit(s, { kind: 'info', text: `${name} не хочет: пузырь почти пустой. Проверь осмотром (F).` });
          },
        };
      }
      if (near(state, 'wash') && ((held.liters ?? 0) > 0 || held.dirty)) {
        return {
          label: 'Вылить и вымыть бак',
          run: () => {
            held.liters = 0;
            held.dirty = false;
          },
        };
      }
      break;
    }
    case 'scoop': {
      const pile = state.dung.filter((d) => dist(d, p) <= 1.2).sort((a, b) => dist(a, p) - dist(b, p))[0];
      if (pile) {
        const bag = openBagNear(state, p.x, p.y);
        if (!bag) return blocked('Навоз: нужен открытый мешок рядом (возьми на стойке и поставь)', 'dung');
        return {
          label: 'Убрать навоз в мешок',
          run: (s) => {
            s.dung = s.dung.filter((d) => d !== pile);
            bag.fill = (bag.fill ?? 0) + 1;
            held.dirty = true;
            if (bag.fill >= BALANCE.items.bagCapacity) emit(s, { kind: 'info', text: 'Мешок полон — вынеси на помойку.' });
          },
        };
      }
      if (near(state, 'wash') && held.dirty) {
        return { label: 'Вымыть совок', run: () => (held.dirty = false) };
      }
      break;
    }
    case 'fork':
      if (cell?.cell.kind === 'wet') {
        const bag = openBagNear(state, p.x, p.y);
        if (!bag) return blocked('Мокрая солома: нужен открытый мешок рядом', 'wetFloor');
        return {
          label: 'Убрать мокрую солому в мешок',
          run: (s) => {
            setCell(s, cell.cx, cell.cy, 'bareWet');
            bag.fill = (bag.fill ?? 0) + 1;
          },
        };
      }
      break;
    case 'sawdust':
      if (near(state, 'sawdust') && (held.charges ?? 0) < BALANCE.items.sawdustCharges) {
        return { label: 'Набрать опилок', run: () => (held.charges = BALANCE.items.sawdustCharges) };
      }
      if (cell?.cell.kind === 'wet') return blocked('Сначала убери мокрую солому вилами', 'wetFloor');
      if (cell?.cell.kind === 'bareWet') {
        if ((held.charges ?? 0) <= 0) return blocked('Ведро пустое — набери опилок');
        return {
          label: 'Засыпать опилками',
          run: (s) => {
            setCell(s, cell.cx, cell.cy, 'sawdust');
            held.charges = (held.charges ?? 0) - 1;
          },
        };
      }
      break;
    case 'broom':
      if (cell?.cell.kind === 'sawdust') {
        if (!sawdustAbsorbed(state, cell.cell)) return blocked('Опилки ещё впитывают');
        const bag = openBagNear(state, p.x, p.y);
        if (!bag) return blocked('Вымести: нужен открытый мешок рядом');
        return {
          label: 'Вымести опилки в мешок',
          run: (s) => {
            setCell(s, cell.cx, cell.cy, 'bare');
            bag.fill = (bag.fill ?? 0) + 1;
          },
        };
      }
      break;
    case 'straw':
      if (cell?.cell.kind === 'bareWet') return blocked('Пол мокрый: сначала опилки', 'wetFloor');
      if (cell?.cell.kind === 'bare') {
        return {
          label: 'Постелить солому',
          run: (s) => {
            setCell(s, cell.cx, cell.cy, 'straw');
            held.charges = (held.charges ?? 0) - 1;
            if (held.charges <= 0) s.player.held = null;
          },
        };
      }
      break;
    case 'bag':
      if (near(state, 'dump')) {
        return {
          label: 'Выбросить мешок',
          run: (s) => {
            s.player.held = null;
            if ((held.fill ?? 0) > 0) s.stats.bagsOut++;
          },
        };
      }
      return { label: 'Поставить открытый мешок', run: (s) => drop(s, held) };
    case 'basin':
      if (held.food) {
        const target = state.elephants
          .map((e) => ({ e, slot: profileOf(e).slot }))
          .filter(({ slot }) => dist(slot, p) <= REACH + 0.3)
          .filter(({ e }) => !state.items.some((i) => i.kind === 'basin' && i.owner === e.id && i.food))[0];
        if (target) {
          const name = profileOf(target.e).name;
          return {
            label: `Поставить ${itemLabel(held)} для ${name}`,
            run: (s) => {
              held.owner = target.e.id;
              drop(s, held, target.slot.x, target.slot.y);
              const meal = held.meal!;
              if (s.meals[meal][target.e.id] === null) s.meals[meal][target.e.id] = s.t;
              emit(s, { kind: 'good', text: `${MEAL_LABELS[meal]}: ${name} получила таз в ${clockText(s.t)}.` });
            },
          };
        }
      } else if (near(state, 'wash')) {
        return {
          label: 'Вымыть таз',
          run: (s) => {
            s.player.held = null;
            s.kitchen.cleanBasins++;
          },
        };
      }
      break;
    case 'hay':
      if (dist(MAP.feeder, p) <= 1.8) {
        return {
          label: 'Заложить сено в кормушку',
          run: (s) => {
            s.feederHay = Math.min(100, s.feederHay + BALANCE.food.hayBale);
            s.player.held = null;
          },
        };
      }
      if (inBedding(p.x, p.y)) {
        return {
          label: 'Бросить тюк — задобрить',
          run: (s) => {
            s.elephants.forEach((e) => {
              if (dist(e, p) <= 5) e.boredom = Math.max(0, e.boredom + BALANCE.elephant.hayTossBoredom);
            });
            s.feederHay = Math.min(100, s.feederHay + BALANCE.food.hayBale / 2);
            s.player.held = null;
            emit(s, { kind: 'good', text: 'Свежий тюк — слонихам есть чем занять хобот.' });
          },
        };
      }
      break;
  }

  const rack = putOnRack(held);
  if (rack && near(state, 'rack')) {
    return { label: `Положить на стойку: ${itemLabel(held)}`, run: (s) => drop(s, held, rack.x, rack.y) };
  }
  return dropOption;
}

function emptyHandAction(state: State): ActionOption | null {
  const take = takeFromFloor(state);
  if (take) return take;

  if (near(state, 'kitchen')) return kitchenAction(state);
  if (near(state, 'sawdust')) {
    return { label: 'Взять ведро опилок', run: (s) => (s.player.held = newItem(s, 'sawdust', { charges: BALANCE.items.sawdustCharges })) };
  }
  if (near(state, 'bags')) {
    return { label: 'Взять новый мешок 240 л', run: (s) => (s.player.held = newItem(s, 'bag', { fill: 0 })) };
  }
  if (near(state, 'hay')) return { label: 'Взять тюк сена', run: (s) => (s.player.held = newItem(s, 'hay')) };
  if (near(state, 'straw')) {
    return { label: 'Взять охапку соломы', run: (s) => (s.player.held = newItem(s, 'straw', { charges: BALANCE.items.strawCharges })) };
  }
  if (near(state, 'valve')) {
    return {
      label: state.valveOpen ? 'Закрыть вентиль поилки' : 'Открыть вентиль поилки',
      run: (s) => (s.valveOpen = !s.valveOpen),
    };
  }
  if (near(state, 'fencePanel') && !state.fenceOn) {
    return { label: 'Включить электропастух', run: (s) => (s.fenceOn = true) };
  }
  if (near(state, 'gate') && state.gateOpen) {
    return { label: 'Закрыть задвижку', run: (s) => (s.gateOpen = false) };
  }
  const e = nearestElephant(state);
  if (e) return { label: `Угостить ${profileOf(e).name}`, run: (s) => treat(s, e) };
  return null;
}

function kitchenAction(state: State): ActionOption {
  const k = state.kitchen;
  if (k.kasha.status === 'ready' && k.kasha.portions > 0) {
    if (k.cleanBasins <= 0) return blocked('Каша готова, но чистых тазов нет — вымой на мойке', 'basinCrushed');
    return {
      label: 'Взять таз с кашей',
      run: (s) => {
        s.kitchen.kasha.portions--;
        s.kitchen.cleanBasins--;
        s.player.held = newItem(s, 'basin', { food: 'kasha', meal: s.kitchen.kasha.meal! });
        if (s.kitchen.kasha.portions === 0) s.kitchen.kasha = { status: 'idle', readyAt: 0, portions: 0, meal: null };
      },
    };
  }
  if (k.veg.portions > 0) {
    if (k.cleanBasins <= 0) return blocked('Ужин готов, но чистых тазов нет — вымой на мойке', 'basinCrushed');
    return {
      label: 'Взять таз с овощами',
      run: (s) => {
        s.kitchen.veg.portions--;
        s.kitchen.cleanBasins--;
        s.player.held = newItem(s, 'basin', { food: 'veg', meal: 'dinner' });
      },
    };
  }
  if (k.kasha.status === 'idle' && kashaDue(state)) return { label: 'Запарить кашу (20 мин)', run: (s) => void startKasha(s) };
  if (vegStageAvailable(state)) return { label: `Ужин: ${VEG_STAGES[k.veg.stage]}`, run: (s) => void doVegStage(s) };
  if (k.kasha.status === 'cooking') return blocked(`Каша запаривается, готова к ${clockText(k.kasha.readyAt)}`);
  if (k.veg.stage > 0 && k.veg.stage < VEG_STAGES.length) {
    return blocked(`Ужин: «${VEG_STAGES[k.veg.stage]}» с ${clockText(k.veg.nextAt)}`);
  }
  return blocked('Кормовая: каша в 13:00 и 17:00 (запаривать с 12:00 и 16:00), ужин с 14:00');
}

// Осмотр (F): что видно на ближайшей слонихе или клетке
export function inspect(state: State): string[] {
  const e = nearestElephant(state, 3);
  if (e) return inspectElephant(state, e);
  const cell = cellAt(state, state.player.x, state.player.y);
  if (cell) {
    const k = cell.cell.kind;
    const text =
      k === 'straw'
        ? 'Сухая солома. Так и надо.'
        : k === 'wet'
          ? 'Мокрая солома. Вилами в мешок.'
          : k === 'bareWet'
            ? 'Голый мокрый пол. Засыпать опилками.'
            : k === 'sawdust'
              ? sawdustAbsorbed(state, cell.cell)
                ? 'Опилки впитали. Вымести метлой в мешок.'
                : 'Опилки впитывают.'
              : 'Голый сухой пол. Постелить солому.';
    return [text];
  }
  if (near(state, 'kitchen')) {
    const k = state.kitchen;
    return [
      `Чистых тазов: ${k.cleanBasins}`,
      k.kasha.status === 'cooking' ? `Каша будет готова к ${clockText(k.kasha.readyAt)}` : k.kasha.status === 'ready' ? `Каша готова: ${k.kasha.portions} порции` : 'Каша не запарена',
      k.veg.stage === 0 ? 'Ужин не начат' : k.veg.stage >= VEG_STAGES.length ? `Ужин: ${k.veg.portions} порции` : `Ужин: этап ${k.veg.stage + 1} из 5`,
    ];
  }
  return [`Сено в кормушке: ${Math.round(state.feederHay)}%. Поилка: ${Math.round(state.trough)}%.`];
}

function level(v: number, words: [string, string, string, string]): string {
  return v < 25 ? words[0] : v < 50 ? words[1] : v < 80 ? words[2] : words[3];
}

function inspectElephant(state: State, e: Elephant): string[] {
  const p = profileOf(e);
  const lines = [p.name];
  if (e.state === 'sleep') lines.push('Спит.');
  lines.push(`Сытость: ${level(e.hunger, ['сыта', 'в норме', 'проголодалась', 'голодная'])}`);
  lines.push(`Жажда: ${level(e.thirst, ['напилась', 'в норме', 'хочет пить', 'очень хочет пить'])}`);
  lines.push(`Пузырь: ${level(e.bladder, ['почти пустой', 'меньше половины', 'больше половины — можно «погулять»', 'вот-вот'])}`);
  lines.push(`Настроение: ${level(e.boredom, ['спокойная', 'немного скучает', 'скучает', 'тоскует'])}`);
  lines.push(`Доверие к тебе: ${level(e.trust, ['настороженное', 'так себе', 'хорошее', 'полное'])}`);
  lines.push(
    `Ноги: ${e.limp || e.footDebt >= BALANCE.footDebt.limpThreshold ? 'прихрамывает' : e.footDebt > 25 ? 'подошвы мокнут, следи за полом' : 'в порядке'}`,
  );
  if (e.lyingInWet) lines.push('Лежала в мокром — утром отмывать.');
  void state;
  return lines;
}
