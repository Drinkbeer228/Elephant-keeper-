// Профили слоних. Характеры и сигналы — из docs/context.md, разделы 1 и 6.
// Логика игры читает только эти поля и не сравнивает имена.

export type SignalKind = 'frontStomp' | 'fenceStare' | 'none';

export interface ElephantProfile {
  id: string;
  name: string;
  color: number;
  signal: SignalKind;
  signalHint: string; // подсказка первой смены
  signalLead: number; // игровых минут от сигнала до мочи
  bladderPerMinute: number;
  thirstFactor: number;
  boredomFactor: number;
  leftoverChance: number; // шанс оставить половину каши
  stereotypy: boolean; // качается при высокой скуке
  bedtime: number; // игровое время, когда ложится (0 = 08:00)
  trust: number; // стартовое доверие
  start: { x: number; y: number };
  slot: { x: number; y: number }; // куда ставить её таз
}

export const ELEPHANTS: ElephantProfile[] = [
  {
    id: 'pretty',
    name: 'Претти',
    color: 0x8a8f99,
    signal: 'frontStomp',
    signalHint: 'Претти топнула передней ногой — бак, быстро! У неё почти нет запаса времени.',
    signalLead: 5,
    bladderPerMinute: 0.36,
    thirstFactor: 1,
    boredomFactor: 1.3,
    leftoverChance: 0,
    stereotypy: true,
    bedtime: 930, // 23:30
    trust: 40,
    start: { x: 10, y: 3 },
    slot: { x: 14.4, y: 8.5 },
  },
  {
    id: 'margo',
    name: 'Марго',
    color: 0x6f7682,
    signal: 'fenceStare',
    signalHint: 'Марго подошла к ограждению и громко выдыхает — это она просится. Время есть, но не тяни.',
    signalLead: 11,
    bladderPerMinute: 0.3,
    thirstFactor: 1.5,
    boredomFactor: 1,
    leftoverChance: 0,
    stereotypy: false,
    bedtime: 840, // 22:00
    trust: 45,
    start: { x: 6.5, y: 4 },
    slot: { x: 9.6, y: 8.5 },
  },
  {
    id: 'audrey',
    name: 'Одри',
    color: 0x9aa0a8,
    signal: 'none',
    signalHint: 'Одри не подаёт сигнала. Её ловят только «погулять»: бак под неё, когда пузырь полон наполовину и больше (смотри осмотром, F).',
    signalLead: 0,
    bladderPerMinute: 0.33,
    thirstFactor: 1,
    boredomFactor: 0.9,
    leftoverChance: 0.4,
    stereotypy: false,
    bedtime: 780, // 21:00
    trust: 60,
    start: { x: 3.5, y: 5 },
    slot: { x: 4.6, y: 8.5 },
  },
];
