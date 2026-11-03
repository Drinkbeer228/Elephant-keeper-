// Профили слонов. Характеры и сигналы — из docs/context.md, разделы 1 и 6.
// Логика игры читает только эти поля и не сравнивает имена.
// Этап 3: три слонихи и три самца в независимых комплексах.
import { MAP } from './map';

export type SignalKind = 'frontStomp' | 'fenceStare' | 'none';
export type Paddock = 'female' | 'male';

export interface ElephantProfile {
  id: string;
  name: string;
  color: number;
  paddock: Paddock;
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

const point = (legacy: { x: number; y: number }, modern: { x: number; y: number }) =>
  MAP.w === 64 ? legacy : modern;

export const ELEPHANTS: ElephantProfile[] = [
  {
    id: 'pretty',
    name: 'Претти',
    color: 0x8a8f99,
    paddock: 'female',
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
    start: point({ x: 30, y: 4 }, { x: 22, y: 25 }),
    slot: point({ x: 21, y: 12.35 }, { x: 22, y: 32.5 }),
  },
  {
    id: 'margo',
    name: 'Марго',
    color: 0x6f7682,
    paddock: 'female',
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
    start: point({ x: 24, y: 6 }, { x: 32, y: 29 }),
    slot: point({ x: 15, y: 12.35 }, { x: 31, y: 32.5 }),
  },
  {
    id: 'audrey',
    name: 'Одри',
    color: 0x9aa0a8,
    paddock: 'female',
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
    start: point({ x: 18, y: 4 }, { x: 42, y: 25 }),
    slot: point({ x: 9, y: 12.35 }, { x: 40, y: 32.5 }),
  },
  {
    id: 'radja',
    name: 'Раджа',
    color: 0x5c5850,
    paddock: 'male',
    signal: 'frontStomp',
    signalHint: 'Раджа, вожак, топнул ногой — самцы ждут не ждать. Бак под него!',
    signalLead: 6,
    bladderPerMinute: 0.34,
    thirstFactor: 1.2,
    boredomFactor: 1,
    leftoverChance: 0,
    stereotypy: false,
    bedtime: 900, // 23:00
    trust: 35,
    start: point({ x: 30, y: 32 }, { x: 68, y: 25 }),
    slot: point({ x: 21, y: 28.65 }, { x: 68, y: 32.5 }),
  },
  {
    id: 'baron',
    name: 'Барон',
    color: 0x4c4a48,
    paddock: 'male',
    signal: 'fenceStare',
    signalHint: 'Барон молча застыл у решётки и смотрит на тебя — тяжеловес просится по-своему.',
    signalLead: 12,
    bladderPerMinute: 0.28,
    thirstFactor: 1.3,
    boredomFactor: 0.8,
    leftoverChance: 0,
    stereotypy: false,
    bedtime: 870, // 22:30
    trust: 50,
    start: point({ x: 25, y: 34 }, { x: 78, y: 29 }),
    slot: point({ x: 15, y: 28.65 }, { x: 78, y: 32.5 }),
  },
  {
    id: 'caesar',
    name: 'Цезарь',
    color: 0x84826c,
    paddock: 'male',
    signal: 'none',
    signalHint: 'Цезарь — молодой задира: вечно в бассейне. Сигнала не подаёт, ловится «погулять».',
    signalLead: 0,
    bladderPerMinute: 0.32,
    thirstFactor: 1,
    boredomFactor: 1.4,
    leftoverChance: 0,
    stereotypy: false,
    bedtime: 810, // 21:30
    trust: 55,
    start: point({ x: 38, y: 40 }, { x: 88, y: 25 }),
    slot: point({ x: 9, y: 28.65 }, { x: 88, y: 32.5 }),
  },
];

// Хобот дотягивается до вещей только в своём загоне
export function paddockOfProfile(p: ElephantProfile): Paddock {
  return p.paddock;
}
