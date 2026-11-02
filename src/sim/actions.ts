import { BALANCE } from '../data/balance';
import { MAP, inPaddock, nearStation, poolEdgeDist, stationDist, type StationId } from '../data/map';
import { dist, pocketTreat, profileOf, treat, walkCommand, bucketUnder } from './elephants';
import { emit } from './events';
import { cellAt, cleared, sawdustAbsorbed, setCell } from './floor';
import { MEAL_LABELS, allServedDinner, kashaDue, startKasha, startPrep } from './feeding';
import { ITEM_NAMES, basinsOnRack, freeBasinSpot, openBagNear } from './items';
import { addToContainer, barrowNear, barrowRoom, callTruck, containerShare, dumpWay, nearContainer, spoilBarrow } from './barrow';
import { clockText, isDark } from './clock';
import { newItem } from './state';
import { giveStock, STOCK_LABELS, takeStock, takeStockUpTo } from './stock';
import { supplyOpen } from './truck';
import type { CargoKind, Elephant, Item, State, Tool } from './types';

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
  // Стопку тазов ставят рядом друг с другом: каждый таз — отдельная вещь
  (item.nested ?? []).forEach((b, i) => {
    b.x = item.x + (i + 1) * 0.5;
    b.y = item.y;
    b.droppedAt = state.t;
    state.items.push(b);
  });
  item.nested = undefined;
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
    return {
      label: 'в тачку',
      put: (s) => {
        s.barrow.waste += 1;
        // Мусор к опилкам/соломе — груз испорчен, на пол уже не сыплется
        spoilBarrow(s);
      },
    };
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
  const near = state.items.filter((i) => dist(i, p) <= 1.1).sort((a, b) => dist(a, p) - dist(b, p));
  if (!near.length) return null;
  const take = (item: Item): ActionOption => ({
    label: `Взять: ${itemLabel(item)}`,
    run: (s) => {
      s.items = s.items.filter((i) => i !== item);
      s.player.held = item;
    },
  });
  // Вещи лежат почти в одной точке — не угадывать, а дать выбрать
  const close = near.filter((i) => dist(i, p) - dist(near[0], p) < 0.25);
  if (close.length > 1) return { label: 'Взять…', choices: close.slice(0, 5).map(take), run: () => undefined };
  return take(near[0]);
}

export function itemLabel(item: Item): string {
  if (item.kind === 'basin') {
    if (item.food) return item.food === 'kasha' ? 'таз с кашей' : 'таз с овощами';
    const n = 1 + (item.nested?.length ?? 0);
    const dirty = item.dirty || item.nested?.some((b) => b.dirty);
    if (n === 1) return dirty ? 'грязный таз' : 'чистый таз';
    return `${dirty ? 'грязные' : 'чистые'} тазы ×${n}`;
  }
  if (item.kind === 'bucket' && (item.liters ?? 0) > 0) return `бак (${Math.round(item.liters ?? 0)} л)`;
  if (item.kind === 'bag') return `мешок (${item.fill ?? 0}/${BALANCE.items.bagCapacity})`;
  if (item.kind === 'scoop' && (item.load ?? 0) > 0) return `${ITEM_NAMES.scoop} (${item.load}/${BALANCE.items.scoopCapacity})`;
  if (item.kind === 'sawdust' && !item.charges) return 'ведро для опилок (пустое)';
  if (item.charges !== undefined) return `${ITEM_NAMES[item.kind]} (${item.charges})`;
  return ITEM_NAMES[item.kind];
}

export function availableAction(state: State): ActionOption | null {
  if (state.phase === 'report') return null;
  const p = state.player;
  const held = p.held;

  const praised = state.elephants.find((e) => dist(e, p) <= 2.6 && state.t <= e.praiseUntil);
  // Фруктов нет — угощать нечем, пункта не показываем
  if (praised && state.stock.fruit > 0) {
    return { label: `Угостить ${profileOf(praised).name} (за бак)`, run: (s) => treat(s, praised) };
  }

  if (state.barrow.pushed) return pushAction(state);
  if (state.jack.pushed) return jackPushAction(state);
  return held ? heldAction(state, held) : emptyHandAction(state);
}

// Высыпать отсек совка: в тачку или открытый мешок рядом, в контейнер — пока он не полон
function scoopDump(state: State, load: number): ActionOption | null {
  const held = state.player.held!;
  const p = state.player;
  if (barrowNear(state, 1.4)) {
    const room = barrowRoom(state);
    if (room <= 0) return blocked('Тачка полна — вези к мусорному баку');
    return {
      label: 'Высыпать совок в тачку',
      run: (s) => {
        const put = Math.min(load, barrowRoom(s));
        s.barrow.waste += put;
        held.load = load - put;
        spoilBarrow(s);
      },
    };
  }
  const bag = state.items.find((i) => i.kind === 'bag' && (i.fill ?? 0) < BALANCE.items.bagCapacity && dist(i, p) <= 1.4);
  if (bag) {
    return {
      label: 'Высыпать совок в мешок',
      run: () => {
        const put = Math.min(load, BALANCE.items.bagCapacity - (bag.fill ?? 0));
        bag.fill = (bag.fill ?? 0) + put;
        held.load = load - put;
      },
    };
  }
  if (nearContainer(state)) {
    if (dumpWay(state) === 'full') return blocked('Мусорный бак полон — вызови мусоровоз');
    return { label: 'Высыпать совок в контейнер', run: (s) => (held.load = load - addToContainer(s, load)) };
  }
  return null;
}

// Ночью без дежурного света в вольере не видно ни навоза, ни мокрого
const DARK = 'Темно — не видно, что убирать. Включи дежурный свет у двери дежурки';
function tooDark(state: State): boolean {
  return isDark(state) && !state.dutyLight && inPaddock(state.player.x, state.player.y);
}

function heldAction(state: State, held: Item): ActionOption {
  const p = state.player;
  const cell = cellAt(state, p.x, p.y);
  const dark = tooDark(state);
  const dropOption: ActionOption = { label: `Положить: ${itemLabel(held)}`, run: (s) => drop(s, held) };

  switch (held.kind) {
    case 'bucket': {
      const e = nearestElephant(state);
      if (e && e.state !== 'sleep' && !bucketUnder(state, e)) {
        const name = profileOf(e).name;
        const signaling = e.signalStarted !== undefined;
        // Скучает, а пузырь почти пуст: «Давай гуляй» бесполезно — предложи лакомство из кармана
        const pocket = signaling || e.bladder >= BALANCE.elephant.walkCommandMinBladder ? null : pocketTreatAction(state);
        if (pocket) return pocket;
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
      const load = held.load ?? 0;
      const cap = BALANCE.items.scoopCapacity;
      // Навоз — в тачку или мешок рядом; если их нет — в накопительный отсек совка
      const collect = (units: number, into: string, take: (s: State) => void): ActionOption => {
        const sink = sinkNear(state);
        if (sink && sink !== 'full') {
          return {
            label: `${into} ${sink.label}`,
            run: (s) => {
              take(s);
              sink.put(s);
              if (units > 1) sink.put(s);
              held.dirty = true;
            },
          };
        }
        if (load + units > cap) {
          if (sink === 'full') return blocked('Тачка полна — вези к мусорному баку');
          return blocked('Совок полон — высыпи в тачку, мешок или контейнер');
        }
        return {
          label: `${into} в совок (${load + units}/${cap})`,
          run: (s) => {
            take(s);
            held.load = load + units;
            held.dirty = true;
          },
        };
      };
      const pile = state.dung.filter((d) => dist(d, p) <= 1.2).sort((a, b) => dist(a, p) - dist(b, p))[0];
      if (dark && (pile || cell?.cell.kind === 'dung')) return blocked(DARK);
      if (pile) return collect(1, 'Убрать навоз', (s) => (s.dung = s.dung.filter((d) => d !== pile)));
      if (cell?.cell.kind === 'dung') return collect(2, 'Счистить затоптанный навоз', (s) => setCell(s, cell.cx, cell.cy, cleared(cell.cx, cell.cy)));
      if (load > 0) {
        const dump = scoopDump(state, load);
        if (dump) return dump;
      }
      if (near(state, 'wash') && held.dirty) {
        if (load > 0) return blocked('Сначала высыпи совок: в тачку, мешок или контейнер');
        return { label: 'Вымыть совок', run: () => (held.dirty = false) };
      }
      break;
    }
    case 'fork':
      if (cell?.cell.kind === 'wet') {
        if (dark) return blocked(DARK);
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
      // Опилки набирает лопата (она лежит в Опилочнике) — ведро просто засыпает и ставится
      if (dist(MAP.pailSpot, p) <= 1.0) {
        return { label: 'Поставить ведро на место', run: (s) => drop(s, held, MAP.pailSpot.x, MAP.pailSpot.y) };
      }
      if (cell?.cell.kind === 'wet') return blocked('Сначала убери мокрую солому вилами', 'wetFloor');
      if (cell?.cell.kind === 'bareWet') {
        if (dark) return blocked(DARK);
        if ((held.charges ?? 0) <= 0) return blocked('Ведро пустое — набери опилок лопатой в Опилочнике');
        return {
          label: 'Засыпать опилками',
          run: (s) => {
            setCell(s, cell.cx, cell.cy, 'sawdust');
            held.charges = (held.charges ?? 0) - 1;
          },
        };
      }
      break;
    case 'shovel': {
      // Лопата набирает опилки из ларя: в ведро рядом или прямо в тачку
      if (near(state, 'sawdust')) {
        const empty = state.stock.sawdust <= 0;
        const bucket = state.items.find((i) => i.kind === 'sawdust' && dist(i, p) <= 1.4 && (i.charges ?? 0) < BALANCE.items.sawdustCharges);
        const barrow = barrowNear(state, 1.4) && barrowRoom(state) > 0;
        if (!bucket && !barrow) return blocked('Поставь рядом ведро для опилок или подкати тачку');
        const fillBucket: ActionOption = {
          label: empty ? 'Опилки кончились — прими поставку' : 'Насыпать опилок в ведро',
          disabled: empty,
          run: (s) => {
            const b = s.items.find((i) => i.kind === 'sawdust' && dist(i, s.player) <= 1.4 && (i.charges ?? 0) < BALANCE.items.sawdustCharges);
            if (b) b.charges = (b.charges ?? 0) + takeStockUpTo(s, 'sawdust', BALANCE.items.sawdustCharges - (b.charges ?? 0));
          },
        };
        const fillBarrow: ActionOption = {
          label: empty ? 'Опилки кончились — прими поставку' : 'Насыпать опилок в тачку',
          disabled: empty,
          run: (s) => (s.barrow.sawdust += takeStockUpTo(s, 'sawdust', BALANCE.barrow.sawdustLoad - s.barrow.sawdust)),
        };
        if (bucket && barrow) {
          return { label: 'Насыпать опилок…', choices: [fillBucket, fillBarrow], run: () => undefined };
        }
        return bucket ? fillBucket : fillBarrow;
      }
      break;
    }
    case 'net': {
      // Длинный сачок достаёт до кромки бассейна: вылавливает плавающий навоз
      const pool = poolWithFloats(state, p);
      if (pool >= 0) {
        if (barrowNear(state, 1.4)) {
          if (barrowRoom(state) <= 0) return blocked('Тачка полна — вези к мусорному баку');
          return {
            label: 'Выловить навоз из бассейна (в тачку)',
            run: (s) => {
              removePoolWaste(s, pool);
              s.barrow.waste += 1;
              spoilBarrow(s);
            },
          };
        }
        const bag = state.items.find((i) => i.kind === 'bag' && (i.fill ?? 0) < BALANCE.items.bagCapacity && dist(i, p) <= BALANCE.items.bagReach);
        if (bag) {
          return {
            label: 'Выловить навоз из бассейна (в мешок)',
            run: (s) => {
              removePoolWaste(s, pool);
              bag.fill = (bag.fill ?? 0) + 1;
            },
          };
        }
        return blocked('Некуда вылавливать: подкати тачку или поставь открытый мешок');
      }
      break;
    }
    case 'broom': {
      // Сор с тачки на твёрдом полу — подмести всё в радиусе
      const litter = state.litter.filter((l) => dist(l, p) <= 1.2);
      if (litter.length) {
        return {
          label: `Подмести сор (${litter.length})`,
          run: (s) => (s.litter = s.litter.filter((l) => !litter.includes(l))),
        };
      }
      if (cell?.cell.kind === 'sawdust') {
        if (dark) return blocked(DARK);
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
    }
    case 'straw':
      if (cell?.cell.kind === 'bareWet') return blocked('Пол мокрый: сначала опилки', 'wetFloor');
      if (cell?.cell.kind === 'bare') {
        if (dark) return blocked(DARK);
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
              held.owner = target.e.id;
              drop(s, held, target.slot.x, target.slot.y);
              const meal = held.meal!;
              if (s.meals[meal][target.e.id] === null) s.meals[meal][target.e.id] = s.t;
              emit(s, { kind: 'good', text: `${MEAL_LABELS[meal]}: ${name} получила таз в ${clockText(s.t)}.` });
            },
          };
        }
      } else {
        const stack = [held, ...(held.nested ?? [])];
        const n = stack.length;
        const dirty = stack.some((b) => b.dirty);
        // Пустые тазы вкладывают друг в друга; со стеллажа так не берут — там свои действия
        const onRack = basinsOnRack(state);
        const another = state.items.find((i) => i.kind === 'basin' && !i.food && !onRack.includes(i) && dist(i, p) <= 1.1);
        if (another) {
          return {
            label: `Взять ещё пустой таз (будет ${n + 1})`,
            run: (s) => {
              s.items = s.items.filter((i) => i !== another);
              held.nested = [...(held.nested ?? []), another, ...(another.nested ?? [])];
              another.nested = undefined;
            },
          };
        }
        if (near(state, 'wash') && dirty) {
          return {
            label: n > 1 ? `Вымыть тазы (${n})` : 'Вымыть таз',
            run: () => stack.forEach((b) => (b.dirty = false)),
          };
        }
        if (near(state, 'basinRack')) {
          if (dirty) return blocked('Грязные тазы на стеллаж не ставят — сначала вымой на мойке');
          const free = MAP.basinSpots.filter((sp) => !state.items.some((i) => i.kind === 'basin' && dist(i, sp) <= 0.3)).length;
          if (free > 0) {
            return {
              label: n > 1 ? `Поставить тазы на стеллаж (${Math.min(n, free)})` : 'Поставить таз на стеллаж',
              run: (s) => {
                const rest = [...stack];
                s.player.held = null;
                for (const b of [...rest]) {
                  const spot = freeBasinSpot(s);
                  if (!spot) break;
                  rest.shift();
                  Object.assign(b, { x: spot.x, y: spot.y, nested: undefined, owner: undefined, eatenAt: undefined, droppedAt: s.t });
                  s.items.push(b);
                }
                if (rest.length) s.player.held = Object.assign(rest[0], { nested: rest.slice(1) });
              },
            };
          }
        }
      }
      break;
    case 'basket':
      if (!held.veg && near(state, 'vegRack')) {
        if (allServedDinner(state)) return { label: 'Поставить корзину на место', run: (s) => drop(s, held, MAP.basketSpot.x, MAP.basketSpot.y) };
        if (state.t < BALANCE.food.vegStartFrom) return blocked('Овощи для ужина берут с 14:00');
        if (state.stock.veg < BALANCE.consumption.dinnerVeg) return blocked('Овощи кончились — прими поставку');
        return {
          label: 'Набрать овощей: морковь, картофель, свёкла',
          run: (s) => {
            if (takeStock(s, 'veg', BALANCE.consumption.dinnerVeg)) held.veg = 'raw';
          },
        };
      }
      if (held.veg === 'raw' && near(state, 'wash')) {
        const w = MAP.stations.wash;
        return {
          label: `Замочить овощи (${BALANCE.food.vegSoak} мин)`,
          run: (s) => {
            held.veg = 'soaking';
            held.soakUntil = s.t + BALANCE.food.vegSoak;
            drop(s, held, w.x, w.y);
          },
        };
      }
      if (held.veg === 'washed' && near(state, 'kitchen')) {
        const t = MAP.stations.kitchen;
        return {
          label: 'Чистить овощи',
          run: (s) => {
            drop(s, held, t.x + 0.6, t.y);
            startPrep(s);
          },
        };
      }
      break;
    case 'hay':
      // Кормушки обоих загонов: у слоних — верхняя, у самцов — нижняя
      if (dist(MAP.feeder, p) <= 1.8 || dist(MAP.feeder2, p) <= 1.8) {
        return {
          label: 'Заложить сено в кормушку',
          run: (s) => {
            const lower = dist(MAP.feeder, p) > 1.8;
            if (lower) s.feederHay2 = Math.min(100, s.feederHay2 + BALANCE.food.hayBale);
            else s.feederHay = Math.min(100, s.feederHay + BALANCE.food.hayBale);
            s.player.held = null;
          },
        };
      }
      if (inPaddock(p.x, p.y)) {
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

  // Лакомство из кармана: слониха тоскует или качается — руки заняты не помеха
  const pocket = pocketTreatAction(state);
  if (pocket) return pocket;

  const intoBarrow = putIntoBarrow(state, held);
  if (intoBarrow) return intoBarrow;
  const rack = putOnRack(held);
  if (rack && near(state, 'rack')) {
    return { label: `Положить на стойку: ${itemLabel(held)}`, run: (s) => drop(s, held, rack.x, rack.y) };
  }
  // Рохля рядом, руки заняты — сказать прямо, а не молчать (причина «почему нельзя»)
  if (jackNear(state) && !barrowNear(state, 1.4)) return blocked('Освободите руки, чтобы везти рохлю');
  return dropOption;
}

// Бассейн рядом с кипером, в котором плавает навоз; -1 — рядом такого нет
function poolWithFloats(state: State, p: { x: number; y: number }): number {
  return MAP.pools.findIndex((_, i) => poolEdgeDist(i, p.x, p.y) <= BALANCE.pool.netReach && state.pools[i].floats.length > 0);
}

function removePoolWaste(state: State, pool: number): void {
  const water = state.pools[pool];
  if (water.floats.length) water.floats.shift();
  water.dirty = Math.max(0, water.dirty - BALANCE.pool.poopDirt);
}

// Лакомство из поясной сумки: слониха рядом, тоскует или уже качается.
// Не перекрывает похвалу «за бак», подстановку бака и другие конкретные дела
function pocketTreatAction(state: State): ActionOption | null {
  if (state.player.pocketTreats <= 0) return null;
  const e = nearestElephant(state);
  if (!e || e.state === 'sleep' || e.signalStarted !== undefined || e.state === 'walkCommand') return null;
  if (e.boredom < 50 && e.state !== 'sway') return null;
  return { label: `Дать лакомство ${profileOf(e).name} (из кармана)`, run: (s) => void pocketTreat(s, e) };
}

function putIntoBarrow(state: State, held: Item): ActionOption | null {
  if (!barrowNear(state, 1.4)) return null;
  const b = state.barrow;
  const tool = held.kind === 'scoop' || held.kind === 'fork' || held.kind === 'broom' ? (held.kind as Tool) : null;
  if (tool && !b.tools.includes(tool)) {
    // Совок с навозом в отсеке: навоз высыпается в тачку, а не пропадает вместе с совком
    const load = held.load ?? 0;
    if (load > barrowRoom(state)) return blocked('Тачка полна — вези к мусорному баку');
    return {
      label: `Положить в тачку: ${ITEM_NAMES[tool]}`,
      run: (s) => {
        s.barrow.waste += load;
        s.barrow.tools.push(tool);
        s.player.held = null;
        spoilBarrow(s);
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
    if (b.spoiled) return blocked('В тачке смесь с навозом — на пол нельзя, только вывозить в бак');
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
    choices.push(
      b.spoiled
        ? blocked('Смесь с навозом — на пол нельзя, только вывалить в бак')
        : {
            label: `Взять ведро опилок (${b.sawdust})`,
            run: (s) => {
              const n = Math.min(BALANCE.items.sawdustCharges, s.barrow.sawdust);
              s.barrow.sawdust -= n;
              s.player.held = newItem(s, 'sawdust', { charges: n });
              unspoilIfEmpty(s);
            },
          },
    );
  }
  if (b.straw > 0) {
    choices.push(
      b.spoiled
        ? blocked('Смесь с навозом — на пол нельзя, только вывалить в бак')
        : {
            label: `Взять охапку соломы (${b.straw})`,
            run: (s) => {
              const n = Math.min(BALANCE.items.strawCharges, s.barrow.straw);
              s.barrow.straw -= n;
              s.player.held = newItem(s, 'straw', { charges: n });
              unspoilIfEmpty(s);
            },
          },
    );
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

// Тачка снова пуста — смесь с навозом больше не портит груз
function unspoilIfEmpty(s: State): void {
  const b = s.barrow;
  if (!b.waste && !b.sawdust && !b.straw) b.spoiled = false;
}

export function barrowSummary(state: State): string {
  const b = state.barrow;
  const parts = [
    ...b.tools.map((t) => ITEM_NAMES[t]),
    b.spoiled && (b.sawdust || b.straw) ? 'Использованная подстилка / мусор' : '',
    !b.spoiled && b.sawdust ? `опилки ${b.sawdust}` : '',
    !b.spoiled && b.straw ? `солома ${b.straw}` : '',
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
  const spoiledBedding = b.spoiled ? b.sawdust + b.straw : 0;
  const discardable = b.waste + spoiledBedding;
  if (nearContainer(state) && discardable > 0) {
    const way = dumpWay(state);
    if (way === 'full') return blocked('Мусорный бак полон — вызови мусоровоз');
    if (way === 'needDoor') return blocked('Бак наполовину полон: закрой дверцу и ставь трап');
    if (way === 'needRamp') return blocked('Дверца закрыта: поставь трап, чтобы высыпать сверху');
    return {
      label: way === 'driveIn' ? 'Заехать в бак и высыпать тачку' : 'Поднять по трапу и высыпать тачку',
      run: (s) => {
        const put = addToContainer(s, s.barrow.waste + (s.barrow.spoiled ? s.barrow.sawdust + s.barrow.straw : 0));
        const wastePut = Math.min(s.barrow.waste, put);
        s.barrow.waste -= wastePut;
        let beddingPut = put - wastePut;
        const sawdustPut = Math.min(s.barrow.sawdust, beddingPut);
        s.barrow.sawdust -= sawdustPut;
        beddingPut -= sawdustPut;
        s.barrow.straw -= Math.min(s.barrow.straw, beddingPut);
        unspoilIfEmpty(s);
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
  if (near('straw') && b.straw < BALANCE.barrow.strawLoad) {
    const empty = state.stock.straw <= 0;
    return {
      label: empty ? 'Солома кончилась — прими поставку' : 'Нагрузить соломы в тачку',
      disabled: empty,
      run: (s) => {
        // Тачка вмещает strawLoad зарядов; охапка = strawCharges зарядов = 1 единица запаса
        const need = Math.ceil((BALANCE.barrow.strawLoad - s.barrow.straw) / BALANCE.items.strawCharges);
        if (takeStockUpTo(s, 'straw', need) > 0) s.barrow.straw = BALANCE.barrow.strawLoad;
      },
    };
  }
  if (near('hay') && b.bales < BALANCE.barrow.maxBales) {
    const empty = state.stock.hay <= 0;
    return {
      label: empty ? 'Сено кончилось — прими поставку' : `Положить тюк в тачку (${b.bales + 1}/${BALANCE.barrow.maxBales})`,
      disabled: empty,
      run: (s) => {
        if (takeStock(s, 'hay')) s.barrow.bales++;
      },
    };
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

// Рохля: тележка под поддон (этап 2). Стоит рядом — можно взять; у борта — снять груз
function jackNear(state: State): boolean {
  return !state.jack.pushed && dist(state.jack, state.player) <= BALANCE.jack.reach;
}

function jackMenu(): ActionOption {
  return { label: 'Везти рохлю', run: (s) => (s.jack.pushed = true) };
}

// Куда сдаётся каждый вид груза
const DROP: Record<CargoKind, StationId> = {
  grain: 'stove', // мешки зерна — к котлу каши
  veg: 'vegRack',
  fruit: 'vegRack', // фрукты — на овощной стеллаж
  hay: 'hay',
  straw: 'straw',
  sawdust: 'sawdust',
};

// Везёшь рохлю: у точки сдачи очередного вида — сдать, у борта — снять поддон, иначе просто поставить
function jackPushAction(state: State): ActionOption {
  const cargo = state.jack.cargo;
  // Смешанный поддон сдаётся по частям: у точки каждого вида своя сдача
  if (cargo?.length) {
    const next = cargo.find((u) => near(state, DROP[u.kind]));
    if (next) {
      return {
        label: `Сдать груз: ${STOCK_LABELS[next.kind]} (${next.qty})`,
        run: (s) => {
          s.jack.cargo = (s.jack.cargo ?? []).filter((u) => u !== next);
          if (!s.jack.cargo.length) s.jack.cargo = null;
          giveStock(s, next.kind, next.qty);
          emit(s, { kind: 'good', text: `Груз на складе: ${STOCK_LABELS[next.kind].toLowerCase()} теперь ${s.stock[next.kind]}.` });
        },
      };
    }
  } else {
    // Толкаешь пустую рохлю у борта: снять поддон или оставить рохлю — одним меню
    const unload = unloadMenu(state);
    if (unload?.choices) {
      return {
        label: 'Рохля у борта…',
        choices: [...unload.choices, { label: 'Поставить рохлю', run: (s) => (s.jack.pushed = false) }],
        run: () => undefined,
      };
    }
  }
  return {
    label: cargo?.length ? `Поставить рохлю (${cargo.map((u) => STOCK_LABELS[u.kind]).join(' + ')})` : 'Поставить рохлю',
    run: (s) => {
      s.jack.pushed = false;
    },
  };
}

// У борта грузовика: снять поддон на пустую рохлю, стоящую рядом
function unloadMenu(state: State): ActionOption | null {
  if (!supplyOpen(state) || !near(state, 'unload')) return null;
  const j = state.jack;
  if (j.cargo?.length) return blocked('Сначала сдай этот груз — рохля одна');
  if (dist(j, state.player) > BALANCE.jack.reach) return null;
  if (!state.supply.bays.length) return blocked('Борт пуст — всё принято');
  return {
    label: 'Снять на рохлю…',
    choices: state.supply.bays.map((bay) => ({
      label: bay.map((u) => `${STOCK_LABELS[u.kind]} ${u.qty}`).join(' + '),
      run: (s) => {
        s.supply.bays = s.supply.bays.filter((b) => b !== bay);
        s.jack.cargo = bay.map((u) => ({ ...u }));
        const names = bay.map((u) => STOCK_LABELS[u.kind].toLowerCase()).join(' и ');
        emit(s, { kind: 'info', text: `Поддон на рохле: ${names}.` });
      },
    })),
    run: () => undefined,
  };
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
  const pocket = pocketTreatAction(state);
  if (pocket) return pocket;
  const basket = basketAction(state);
  if (basket) return basket;
  const take = takeFromFloor(state);
  if (take) return take;
  if (barrowNear(state, 1.4)) return barrowMenu(state);
  // У борта пустая рохля рядом: и взять её, и снять поддон — одним меню.
  // Блокировки («борт пуст», «сначала сдай») не перекрывают действия с рохлей
  const jack = jackNear(state);
  const unload = unloadMenu(state);
  if (jack && unload?.choices) {
    return { label: 'Рохля у борта…', choices: [jackMenu(), ...unload.choices], run: () => undefined };
  }
  if (!jack && unload) return unload;
  if (jack) return jackMenu();
  const box = containerAction(state);
  if (box) return box;

  // Станции рядом: действует ближайшая; комнаты просторные, но котёл и стол раздельные
  const stations: [StationId, () => ActionOption | null][] = [
    ['stove', () => stoveAction(state)],
    ['kitchen', () => tableAction(state)],
    ['vegRack', () => pocketRefill(state)],
    ['sawdust', () => blocked('Опилки набирают лопатой — она здесь же, в Опилочнике')],
    ['bags', () => ({ label: 'Взять новый мешок 240 л', run: (s) => (s.player.held = newItem(s, 'bag', { fill: 0 })) })],
    [
      'hay',
      () =>
        state.stock.hay > 0
          ? {
              label: 'Взять тюк сена',
              run: (s) => {
                if (takeStock(s, 'hay')) s.player.held = newItem(s, 'hay');
              },
            }
          : blocked('Сено кончилось — прими поставку'),
    ],
    [
      'straw',
      () =>
        state.stock.straw > 0
          ? {
              label: 'Взять охапку соломы',
              run: (s) => {
                // Охапка — одна единица запаса, в ней strawCharges зарядов постелить
                if (takeStock(s, 'straw')) s.player.held = newItem(s, 'straw', { charges: BALANCE.items.strawCharges });
              },
            }
          : blocked('Солома кончилась — прими поставку'),
    ],
    [
      'valve',
      () => ({ label: state.valveOpen ? 'Закрыть вентиль поилки' : 'Открыть вентиль поилки', run: (s) => (s.valveOpen = !s.valveOpen) }),
    ],
    ['gate', () => (state.gateOpen ? { label: 'Закрыть задвижку', run: (s) => (s.gateOpen = false) } : null)],
    [
      'lightSwitch',
      () => ({ label: state.dutyLight ? 'Выключить дежурный свет' : 'Включить дежурный свет', run: (s) => (s.dutyLight = !s.dutyLight) }),
    ],
  ];
  const p = state.player;
  for (const [, make] of stations
    .filter(([id]) => near(state, id))
    .sort(([a], [b]) => stationDist(a, p.x, p.y) - stationDist(b, p.x, p.y))) {
    const option = make();
    if (option) return option;
  }
  return null;
}

// Раскладка по чистым тазам на стеллаже: сколько порций, столько тазов — если чистых хватает
function fillBasins(state: State, food: 'kasha' | 'veg'): ActionOption {
  const k = state.kitchen;
  const portions = food === 'kasha' ? k.kasha.portions : k.veg.portions;
  const clean = basinsOnRack(state).filter((b) => !b.food && !b.dirty);
  const what = food === 'kasha' ? 'Каша' : 'Ужин';
  if (!clean.length) return blocked(`${what} готов${food === 'kasha' ? 'а' : ''}, но чистых тазов на стеллаже нет — вымой и поставь`, 'basinCrushed');
  const n = Math.min(portions, clean.length);
  return {
    label: `Разложить ${food === 'kasha' ? 'кашу' : 'ужин'} по тазам (${n})`,
    run: (s) => {
      const meal = food === 'kasha' ? s.kitchen.kasha.meal! : 'dinner';
      clean.slice(0, n).forEach((b) => Object.assign(b, { food, meal }));
      if (food === 'kasha') {
        s.kitchen.kasha.portions -= n;
        if (s.kitchen.kasha.portions === 0) s.kitchen.kasha = { status: 'idle', readyAt: 0, portions: 0, meal: null };
      } else s.kitchen.veg.portions -= n;
    },
  };
}

// Котёл каши: запаривание и разложение по тазам
function stoveAction(state: State): ActionOption {
  const k = state.kitchen;
  if (k.kasha.status === 'ready' && k.kasha.portions > 0) return fillBasins(state, 'kasha');
  if (k.kasha.status === 'idle' && kashaDue(state)) {
    if (state.stock.grain < BALANCE.consumption.kashaGrain) return blocked('Зерна не хватает на кашу — прими поставку');
    return { label: 'Запарить кашу (20 мин)', run: (s) => void startKasha(s) };
  }
  if (k.kasha.status === 'cooking') return blocked(`Каша запаривается, готова к ${clockText(k.kasha.readyAt)}`);
  return blocked('Котёл: каша в 13:00 и 17:00 (запаривать с 12:00 и 16:00)');
}

// Стол нарезки: ужин из овощей — промытые чистят, почищенные нарезают
function tableAction(state: State): ActionOption {
  const k = state.kitchen;
  if (k.veg.portions > 0) return fillBasins(state, 'veg');
  const table = tableBasket(state);
  if (table?.veg === 'washed') {
    const prep = state.prep;
    return { label: prep ? `Продолжить чистку (${prep.index + 1}/3)` : 'Чистить овощи', run: (s) => startPrep(s) };
  }
  if (table?.veg === 'peeled') {
    return {
      label: 'Нарезать ужин',
      run: (s) => {
        s.kitchen.veg.portions = 3;
        table.veg = undefined;
        emit(s, { kind: 'good', text: 'Ужин нарезан: три порции — разложи по тазам.' });
      },
    };
  }
  return blocked('Стол нарезки: ужин с 14:00 — овощи со стеллажа, на мойке отмочить, здесь почистить');
}

// Поясная сумка: пополнить лакомства про запас у овощного стеллажа — руки не занимает
function pocketRefill(state: State): ActionOption | null {
  if (state.player.pocketTreats >= BALANCE.player.pocketMax || state.stock.fruit <= 0) return null;
  const room = BALANCE.player.pocketMax - state.player.pocketTreats;
  return {
    label: `Набрать фруктов в карман (${state.player.pocketTreats}→${Math.min(BALANCE.player.pocketMax, state.player.pocketTreats + state.stock.fruit)})`,
    run: (s) => {
      s.player.pocketTreats += takeStockUpTo(s, 'fruit', room);
    },
  };
}

// Корзина с овощами на столе кормовой
function tableBasket(state: State): Item | undefined {
  return state.items.find((i) => i.kind === 'basket' && stationDist('kitchen', i.x, i.y) <= 0.3);
}

// Пустые руки у корзины, с которой идёт работа: в раковине отмокает или на столе ждёт чистки.
// Раньше «Взять», иначе корзину просто подберёшь
function basketAction(state: State): ActionOption | null {
  const p = state.player;
  const soaking = state.items.find((i) => i.kind === 'basket' && i.veg === 'soaking');
  if (soaking && near(state, 'wash') && dist(soaking, p) <= 1.6) {
    if (state.t < (soaking.soakUntil ?? 0)) return blocked(`Овощи отмокают до ${clockText(soaking.soakUntil ?? 0)}`);
    return {
      label: 'Промыть овощи щёткой',
      run: (s) => {
        s.items = s.items.filter((i) => i !== soaking);
        soaking.veg = 'washed';
        s.player.held = soaking;
      },
    };
  }
  const table = tableBasket(state);
  if (table && (table.veg === 'washed' || table.veg === 'peeled') && near(state, 'kitchen')) return tableAction(state);
  return null;
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
  if (near(state, 'stove')) {
    const k = state.kitchen;
    return [
      `Чистых тазов на стеллаже: ${basinsOnRack(state).filter((b) => !b.dirty && !b.food).length}`,
      k.kasha.status === 'cooking' ? `Каша будет готова к ${clockText(k.kasha.readyAt)}` : k.kasha.status === 'ready' ? `Каша готова: ${k.kasha.portions} порции` : 'Каша не запарена',
      `Вода: верхняя поилка ${Math.round(state.trough)}%, нижняя ${Math.round(state.trough2)}%.`,
    ];
  }
  if (near(state, 'kitchen')) {
    const k = state.kitchen;
    return [
      k.veg.portions ? `Ужин нарезан: ${k.veg.portions} порции` : allServedDinner(state) ? 'Ужин роздан' : 'Ужин — с 14:00: овощи со стеллажа',
      `Сено: верхняя кормушка ${Math.round(state.feederHay)}%, нижняя ${Math.round(state.feederHay2)}%.`,
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
