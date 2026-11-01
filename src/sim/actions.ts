import { BALANCE } from '../data/balance';
import { MAP, inBedding, nearStation } from '../data/map';
import { dist, profileOf, treat, walkCommand, bucketUnder } from './elephants';
import { emit } from './events';
import { cellAt, sawdustAbsorbed, setCell } from './floor';
import { MEAL_LABELS, VEG_STAGES, doVegStage, kashaDue, startKasha, vegStageAvailable } from './feeding';
import { ITEM_NAMES, openBagNear } from './items';
import { addToContainer, barrowNear, barrowRoom, callTruck, containerShare, dumpWay, nearContainer } from './barrow';
import { clockText } from './clock';
import { newItem } from './state';
import type { Elephant, Item, State, Tool } from './types';

export interface ActionOption {
  label: string;
  disabled?: boolean; // показать, почему нельзя
  choices?: ActionOption[]; // меню: несколько дел на одном месте
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
}

function nearDrain(state: State): boolean {
  return near(state, 'drain') || near(state, 'drain2');
}

// Куда сбросить убранное: в тачку рядом или в открытый мешок
interface Sink {
  label: string;
  put: (s: State) => void;
}

function sinkNear(state: State): Sink | null | 'full' {
  const p = state.player;
  if (barrowNear(state)) {
    if (barrowRoom(state) <= 0) return 'full';
    return { label: 'в тачку', put: (s) => (s.barrow.waste += 1) };
  }
  const bag = openBagNear(state, p.x, p.y);
  if (bag) return { label: 'в мешок', put: () => (bag.fill = (bag.fill ?? 0) + 1) };
  return null;
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
  if (item.kind === 'basin') {
    const n = item.stack ?? 1;
    const what = item.food === 'kasha' ? 'с кашей' : item.food === 'veg' ? 'с овощами' : 'пуст';
    if (n === 1) return item.food ? `таз ${what}` : 'пустой таз';
    return item.food ? `тазы ${what} (${n})` : `пустые тазы (${n})`;
  }
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

  if (state.barrow.pushed) return pushAction(state);
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
            if (!walkCommand(s, e)) emit(s, { kind: 'info', text: `${name} не хочет: пузырь почти пустой. Проверь осмотром (F).` });
          },
        };
      }
      if (nearDrain(state) && ((held.liters ?? 0) > 0 || held.dirty)) {
        return {
          label: 'Вылить бак в слив',
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
        const sink = sinkNear(state);
        if (sink === 'full') return blocked('Тачка полна — вези к мусорному баку');
        if (!sink) return blocked('Навоз некуда деть: подкати тачку или поставь мешок');
        return {
          label: `Убрать навоз ${sink.label}`,
          run: (s) => {
            s.dung = s.dung.filter((d) => d !== pile);
            sink.put(s);
            held.dirty = true;
          },
        };
      }
      if (cell?.cell.kind === 'dung') {
        const sink = sinkNear(state);
        if (sink === 'full') return blocked('Тачка полна — вези к мусорному баку');
        if (!sink) return blocked('Затоптанное некуда деть: подкати тачку или поставь мешок');
        return {
          label: `Счистить затоптанный навоз ${sink.label}`,
          run: (s) => {
            setCell(s, cell.cx, cell.cy, 'bare');
            sink.put(s);
            sink.put(s);
            held.dirty = true;
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
        const sink = sinkNear(state);
        if (sink === 'full') return blocked('Тачка полна — вези к мусорному баку');
        if (!sink) return blocked('Мокрую солому некуда деть: подкати тачку или поставь мешок', 'wetFloor');
        return {
          label: `Убрать мокрую солому ${sink.label}`,
          run: (s) => {
            setCell(s, cell.cx, cell.cy, 'bareWet');
            sink.put(s);
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
        const sink = sinkNear(state);
        if (sink === 'full') return blocked('Тачка полна — вези к мусорному баку');
        if (!sink) return blocked('Опилки некуда вымести: подкати тачку или поставь мешок');
        return {
          label: `Вымести опилки ${sink.label}`,
          run: (s) => {
            setCell(s, cell.cx, cell.cy, 'bare');
            sink.put(s);
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
      if (nearContainer(state)) {
        if (dumpWay(state) === 'full') return blocked('Мусорный бак полон — вызови мусоровоз');
        return {
          label: 'Выбросить мешок',
          run: (s) => {
            s.player.held = null;
            if ((held.fill ?? 0) > 0) s.stats.bagsOut++;
            addToContainer(s, Math.max(1, held.fill ?? 0));
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
          const food = held.food === 'kasha' ? 'таз с кашей' : 'таз с овощами';
          return {
            label: `Поставить ${food} для ${name}`,
            run: (s) => {
              const n = held.stack ?? 1;
              const one = n > 1 ? newItem(s, 'basin', { food: held.food, meal: held.meal }) : held;
              one.stack = undefined;
              one.owner = target.e.id;
              if (n > 1) held.stack = n - 1;
              drop(s, one, target.slot.x, target.slot.y);
              if (n > 1) s.player.held = held;
              const meal = one.meal!;
              if (s.meals[meal][target.e.id] === null) s.meals[meal][target.e.id] = s.t;
              emit(s, { kind: 'good', text: `${MEAL_LABELS[meal]}: ${name} получила таз в ${clockText(s.t)}.` });
            },
          };
        }
      } else {
        // Пустые тазы собирают стопкой и моют разом
        const another = state.items.find((i) => i.kind === 'basin' && !i.food && dist(i, p) <= 1.1);
        if (another) {
          return {
            label: `Взять ещё пустой таз (будет ${(held.stack ?? 1) + 1})`,
            run: (s) => {
              s.items = s.items.filter((i) => i !== another);
              held.stack = (held.stack ?? 1) + 1;
            },
          };
        }
        if (near(state, 'wash')) {
          const n = held.stack ?? 1;
          return {
            label: n > 1 ? `Вымыть тазы (${n})` : 'Вымыть таз',
            run: (s) => {
              s.player.held = null;
              s.kitchen.cleanBasins += n;
            },
          };
        }
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

  const intoBarrow = putIntoBarrow(state, held);
  if (intoBarrow) return intoBarrow;
  const rack = putOnRack(held);
  if (rack && near(state, 'rack')) {
    return { label: `Положить на стойку: ${itemLabel(held)}`, run: (s) => drop(s, held, rack.x, rack.y) };
  }
  return dropOption;
}

function putIntoBarrow(state: State, held: Item): ActionOption | null {
  if (!barrowNear(state, 1.4)) return null;
  const b = state.barrow;
  const tool = held.kind === 'scoop' || held.kind === 'fork' || held.kind === 'broom' ? (held.kind as Tool) : null;
  if (tool && !b.tools.includes(tool)) {
    return {
      label: `Положить в тачку: ${ITEM_NAMES[tool]}`,
      run: (s) => {
        s.barrow.tools.push(tool);
        s.player.held = null;
      },
    };
  }
  if (held.kind === 'hay' && b.bales < BALANCE.barrow.maxBales) {
    return {
      label: `Положить тюк в тачку (${b.bales + 1})`,
      run: (s) => {
        s.barrow.bales++;
        s.player.held = null;
      },
    };
  }
  if (held.kind === 'sawdust' || held.kind === 'straw') {
    const key = held.kind;
    return {
      label: `Вернуть в тачку: ${itemLabel(held)}`,
      run: (s) => {
        s.barrow[key] += held.charges ?? 0;
        s.player.held = null;
      },
    };
  }
  return null;
}

// Меню стоящей тачки: везти или взять из неё то, что нужно для работы
function barrowMenu(state: State): ActionOption {
  const b = state.barrow;
  const choices: ActionOption[] = [
    {
      label: 'Везти тачку',
      run: (s) => {
        s.barrow.pushed = true;
      },
    },
  ];
  for (const tool of b.tools) {
    choices.push({
      label: `Взять: ${ITEM_NAMES[tool]}`,
      run: (s) => {
        s.barrow.tools = s.barrow.tools.filter((t) => t !== tool);
        s.player.held = newItem(s, tool, { dirty: false });
      },
    });
  }
  if (b.sawdust > 0) {
    choices.push({
      label: `Взять ведро опилок (${b.sawdust})`,
      run: (s) => {
        const n = Math.min(BALANCE.items.sawdustCharges, s.barrow.sawdust);
        s.barrow.sawdust -= n;
        s.player.held = newItem(s, 'sawdust', { charges: n });
      },
    });
  }
  if (b.straw > 0) {
    choices.push({
      label: `Взять охапку соломы (${b.straw})`,
      run: (s) => {
        const n = Math.min(BALANCE.items.strawCharges, s.barrow.straw);
        s.barrow.straw -= n;
        s.player.held = newItem(s, 'straw', { charges: n });
      },
    });
  }
  if (b.bales > 0) {
    choices.push({
      label: 'Взять тюк сена',
      run: (s) => {
        s.barrow.bales--;
        s.player.held = newItem(s, 'hay');
      },
    });
  }
  if (choices.length === 1) return choices[0];
  return { label: `Тачка: ${barrowSummary(state)}`, choices, run: () => undefined };
}

export function barrowSummary(state: State): string {
  const b = state.barrow;
  const parts = [
    ...b.tools.map((t) => ITEM_NAMES[t]),
    b.sawdust ? `опилки ${b.sawdust}` : '',
    b.straw ? `солома ${b.straw}` : '',
    b.bales ? `тюки ${b.bales}` : '',
    b.waste ? `мусор ${b.waste}/${BALANCE.barrow.wasteCapacity}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'пустая';
}

// Везёшь тачку: что можно сделать там, где стоишь (до станции можно дотянуться и тачкой)
function pushAction(state: State): ActionOption {
  const b = state.barrow;
  const p = state.player;
  const near = (id: Parameters<typeof nearStation>[0]) =>
    nearStation(id, p.x, p.y, BALANCE.player.stationReach) || nearStation(id, b.x, b.y, BALANCE.player.stationReach);
  const park: ActionOption = {
    label: 'Поставить тачку',
    run: (s) => {
      s.barrow.pushed = false;
      s.barrow.balance = 0;
      s.barrow.parkedAt = s.t;
    },
  };
  if (nearContainer(state) && b.waste > 0) {
    const way = dumpWay(state);
    if (way === 'full') return blocked('Мусорный бак полон — вызови мусоровоз');
    if (way === 'needDoor') return blocked('Бак наполовину полон: закрой дверцу и ставь трап');
    if (way === 'needRamp') return blocked('Дверца закрыта: поставь трап, чтобы высыпать сверху');
    return {
      label: way === 'driveIn' ? 'Заехать в бак и высыпать тачку' : 'Поднять по трапу и высыпать тачку',
      run: (s) => {
        const put = addToContainer(s, s.barrow.waste);
        s.barrow.waste -= put;
      },
    };
  }
  if (near('rack')) {
    const onRack = state.items.filter(
      (i) => (i.kind === 'scoop' || i.kind === 'fork' || i.kind === 'broom') && nearStation('rack', i.x, i.y, 0.6) && !b.tools.includes(i.kind as Tool),
    );
    if (onRack.length) {
      return {
        label: 'Сложить инвентарь в тачку',
        run: (s) => {
          for (const it of onRack) s.barrow.tools.push(it.kind as Tool);
          s.items = s.items.filter((i) => !onRack.includes(i));
        },
      };
    }
    if (b.tools.length) {
      return {
        label: 'Вернуть инвентарь на стойку',
        run: (s) => {
          for (const tool of s.barrow.tools) {
            const spot = MAP.rackSpots[tool];
            s.items.push({ ...newItem(s, tool, { dirty: false }), x: spot.x, y: spot.y });
          }
          s.barrow.tools = [];
        },
      };
    }
  }
  if (near('sawdust') && b.sawdust < BALANCE.barrow.sawdustLoad) {
    return { label: 'Насыпать опилок в тачку', run: (s) => (s.barrow.sawdust = BALANCE.barrow.sawdustLoad) };
  }
  if (near('straw') && b.straw < BALANCE.barrow.strawLoad) {
    return { label: 'Нагрузить соломы в тачку', run: (s) => (s.barrow.straw = BALANCE.barrow.strawLoad) };
  }
  if (near('hay') && b.bales < BALANCE.barrow.maxBales) {
    return { label: `Положить тюк в тачку (${b.bales + 1}/${BALANCE.barrow.maxBales})`, run: (s) => s.barrow.bales++ };
  }
  if (b.bales > 0 && Math.min(dist(MAP.feeder, p), dist(MAP.feeder, b)) <= 2.2) {
    return {
      label: 'Выгрузить тюк в кормушку',
      run: (s) => {
        s.barrow.bales--;
        s.feederHay = Math.min(100, s.feederHay + BALANCE.food.hayBale);
      },
    };
  }
  return park;
}

// Мусорный бак: дверца, трап, вызов мусоровоза
function containerAction(state: State): ActionOption | null {
  if (!nearContainer(state)) return null;
  const c = state.container;
  const share = containerShare(state);
  if (c.truckAt !== null) return blocked(`Мусоровоз едет, будет к ${clockText(c.truckAt)}`);
  if (share >= BALANCE.container.callAt) return { label: 'Позвонить: вывезти мусорный бак', run: (s) => callTruck(s) };
  if (!c.doorClosed && share >= BALANCE.container.doorAt) return { label: 'Закрыть дверцу бака', run: (s) => (s.container.doorClosed = true) };
  if (c.doorClosed && !c.ramp) return { label: 'Поставить трап к баку', run: (s) => (s.container.ramp = true) };
  return null;
}

function emptyHandAction(state: State): ActionOption | null {
  const take = takeFromFloor(state);
  if (take) return take;
  if (barrowNear(state, 1.4)) return barrowMenu(state);
  const box = containerAction(state);
  if (box) return box;

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
  return null;
}

function kitchenAction(state: State): ActionOption {
  const k = state.kitchen;
  if (k.kasha.status === 'ready' && k.kasha.portions > 0) {
    if (k.cleanBasins <= 0) return blocked('Каша готова, но чистых тазов нет — вымой на мойке', 'basinCrushed');
    const n = Math.min(k.kasha.portions, k.cleanBasins);
    return {
      label: n > 1 ? `Взять тазы с кашей (${n})` : 'Взять таз с кашей',
      run: (s) => {
        s.kitchen.kasha.portions -= n;
        s.kitchen.cleanBasins -= n;
        s.player.held = newItem(s, 'basin', { food: 'kasha', meal: s.kitchen.kasha.meal!, stack: n });
        if (s.kitchen.kasha.portions === 0) s.kitchen.kasha = { status: 'idle', readyAt: 0, portions: 0, meal: null };
      },
    };
  }
  if (k.veg.portions > 0) {
    if (k.cleanBasins <= 0) return blocked('Ужин готов, но чистых тазов нет — вымой на мойке', 'basinCrushed');
    const n = Math.min(k.veg.portions, k.cleanBasins);
    return {
      label: n > 1 ? `Взять тазы с овощами (${n})` : 'Взять таз с овощами',
      run: (s) => {
        s.kitchen.veg.portions -= n;
        s.kitchen.cleanBasins -= n;
        s.player.held = newItem(s, 'basin', { food: 'veg', meal: 'dinner', stack: n });
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
      k === 'dung'
        ? 'Затоптанный навоз. Счистить совком до пола, потом постелить.'
        : k === 'straw'
        ? 'Сухая солома. Так и надо.'
        : k === 'wet'
          ? 'Мокрая солома. Вилами — в тачку или мешок.'
          : k === 'bareWet'
            ? 'Голый мокрый пол. Засыпать опилками.'
            : k === 'sawdust'
              ? sawdustAbsorbed(state, cell.cell)
                ? 'Опилки впитали. Метлой — в тачку или мешок.'
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
    `Ноги: ${e.limp || e.footDebt >= BALANCE.footDebt.limpThreshold ? 'прихрамывает' : e.footDebt - e.footDebtStart > BALANCE.footDebt.limpThreshold / 3 ? 'подошвы мокнут, следи за полом' : 'в порядке'}`,
  );
  if (e.lyingInWet) lines.push('Лежала в мокром — утром отмывать.');
  void state;
  return lines;
}
