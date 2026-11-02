import { BALANCE } from '../data/balance';
import { MAP } from '../data/map';
import { emit } from './events';
import type { State } from './types';

const S = BALANCE.supply;

// Продуктовый грузовик стоит у дороги (зона разгрузки справа), пока не уехал
export function supplyOpen(state: State): boolean {
  return state.supply.arrived && !state.supply.left;
}

// Общий кадр машин: мусоровоз живёт в updateContainer, поставка — здесь.
// Приехала → «гудок» и поддоны в борту; водитель ждёт у борта; в конце окна уехала
export function updateTrucks(state: State): void {
  const sp = state.supply;
  if (!sp.arrived && state.t >= S.arriveAt) {
    sp.arrived = true;
    sp.bays = BALANCE.supplyPallets.map((pallet) => pallet.map((unit) => ({ ...unit })));
    emit(state, { kind: 'info', text: 'Гудок! Продуктовый грузовик у дороги: прими поставку на рохлю.', why: 'supplyHorn' });
  }
  if (sp.arrived && !sp.left && state.t >= S.leaveAt) {
    sp.left = true;
    if (sp.bays.length) {
      sp.missed = true;
      sp.bays = [];
      emit(state, { kind: 'bad', text: 'Грузовик уехал — водитель не дождался, груз уехал с ним.', why: 'supplyMissed' });
    } else {
      emit(state, { kind: 'info', text: 'Борт пуст, грузовик уехал.' });
    }
  }
  updateDriver(state);
}

// Водитель выходит из кабины и встаёт у заднего борта — и стоит на месте.
// Экспедитор не бегает за кипером по слоновнику: он ждёт приёмки и изредка окликает.
// Точку подхода к рохле и борт игроку показывают маркеры и «ГУДОК!»
const BOARD = { x: MAP.stations.unload.x - 1.1, y: MAP.stations.unload.y }; // у заднего борта
const BABBLE = [
  'Водитель: «Принимай давай, мне ещё два рейса сегодня».',
  'Водитель: «Тут разворотиться — полдня. Жду, не тороплю.»',
  'Водитель: «Накладную подпишешь — и я поехал.»',
  'Водитель: (смотрит в накладную и на часы)',
];

function updateDriver(state: State): void {
  const d = state.supply.driver;
  if (!supplyOpen(state)) return;

  // Идёт из кабины к борту (пешком, по двору) — и всё, дальше стоит
  if (d.wp === 0) {
    const dist = Math.hypot(BOARD.x - d.x, BOARD.y - d.y);
    if (dist < 0.2) {
      d.x = BOARD.x;
      d.y = BOARD.y;
      d.wp = 1;
      d.babbleAt = state.t + 8;
      emit(state, { kind: 'info', text: BABBLE[0] });
      d.said = true;
      return;
    }
    const step = S.driverSpeed * Math.min(dist, 1);
    d.x += ((BOARD.x - d.x) / dist) * step;
    d.y += ((BOARD.y - d.y) / dist) * step;
    return;
  }

  // Стоит у борта: раз в несколько минут напоминает о себе бабблом
  if (state.t >= d.babbleAt) {
    d.babbleAt = state.t + 25 + (state.seed % 15);
    const line = BABBLE[1 + (Math.floor(state.t) % (BABBLE.length - 1))];
    emit(state, { kind: 'info', text: line });
  }
}
