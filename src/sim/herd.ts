// Генерация стада: личность — это сочетание числовых черт, а не класс.
// Черты строятся из трёх скрытых факторов (смелость, энергия, дружелюбие) и
// индивидуального шума, поэтому сочетания правдоподобны: смелые реже нервничают,
// энергичные чаще играют, но двух одинаковых слонов не бывает.

import { CAPACITY } from '../data/facility';
import { DIETS, type DietId } from '../data/rations';
import { clamp, gauss, mulberry } from './rng';
import { TRAIT_KEYS, type ElephantProfile, type FoodKind, type Foot, type Habits, type Learned, type Look, type SignalStyle, type TraitKey, type Traits } from './types';

export const NAMES = [
  'Тара',
  'Майя',
  'Лакшми',
  'Сита',
  'Ганга',
  'Рани',
  'Ида',
  'Нора',
  'Лила',
  'Мира',
  'Зара',
  'Пури',
  'Бинду',
  'Амала',
  'Шанти',
  'Падма',
  'Ния',
  'Камала',
  'Ума',
  'Дхара',
  'Вера',
  'Сона',
  'Чанда',
  'Аша',
  'Ками',
  'Дея',
  'Рева',
  'Тина',
];

// Неяркие метки для интерфейса — по одной на слона
const MARK_COLORS = ['#c86d51', '#5f8a6e', '#c49a45', '#5c7a99', '#8f6a8c', '#4f8f8c'];

// Оттенки кожи: от тёплого коричнево-серого до холодного графита
const SKINS = ['#8d8580', '#857f7c', '#928a82', '#7d7a79', '#8a817a', '#8f8987', '#7f7772'];

function z2t(z: number): number {
  return clamp(0.5 + 0.19 * z, 0.04, 0.96);
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// Черты, из которых строится профиль; «шкодливость» добавляется отдельным потоком случайных чисел,
// чтобы стада прежних версий с тем же seed остались теми же слонихами
const BASE_TRAITS: TraitKey[] = TRAIT_KEYS.filter((k) => k !== 'mischief');

function makeTraits(next: () => number, age: number): Traits {
  const bold = gauss(next);
  const energy = gauss(next);
  const kind = gauss(next);
  const n = () => gauss(next);
  const youth = clamp((24 - age) / 18, -1, 1); // молодые подвижнее и игривее
  const t: Traits = {
    nervousness: z2t(-0.85 * bold + 0.55 * n() - 0.2 * (1 - youth)),
    confidence: z2t(0.9 * bold + 0.45 * n() + 0.15 * (1 - youth)),
    activity: z2t(0.85 * energy + 0.45 * n() + 0.35 * youth),
    curiosity: z2t(0.45 * bold + 0.45 * energy + 0.6 * n()),
    playfulness: z2t(0.75 * energy + 0.5 * n() + 0.45 * youth),
    sociability: z2t(0.75 * kind + 0.6 * n()),
    foodDrive: z2t(0.8 * n() + 0.2 * bold),
    cooperation: z2t(0.65 * kind - 0.25 * bold + 0.6 * n()),
    persistence: z2t(0.4 * bold - 0.3 * kind + 0.75 * n()),
    expressiveness: z2t(0.4 * energy + 0.35 * bold + 0.65 * n()),
    sensitivity: z2t(-0.35 * bold + 0.85 * n()),
    mischief: 0.5,
  };
  for (const k of TRAIT_KEYS) t[k] = round3(t[k]);
  return t;
}

function makeLook(next: () => number, age: number): Look {
  const grown = clamp((age - 6) / 18, 0, 1);
  const pickSkin = SKINS[Math.floor(next() * SKINS.length)];
  return {
    size: round3(clamp(0.9 + 0.12 * grown + 0.055 * gauss(next), 0.86, 1.14)),
    length: round3(clamp(1 + 0.045 * gauss(next), 0.92, 1.1)),
    girth: round3(clamp(1 + 0.05 * gauss(next), 0.9, 1.12)),
    head: round3(clamp(1 + 0.05 * gauss(next), 0.9, 1.1)),
    ear: round3(clamp(1 + 0.08 * gauss(next), 0.85, 1.18)),
    earShape: round3(next()),
    notch: next() < 0.35 ? round3(0.2 + next() * 0.6) : -1,
    notchSide: next() < 0.5 ? -1 : 1,
    skin: pickSkin,
    freckles: round3(clamp(next() * 0.9 + (age > 25 ? 0.15 : 0), 0, 1)),
    tail: round3(0.85 + next() * 0.3),
    tuft: round3(0.4 + next() * 0.6),
    wrinkles: round3(0.4 + next() * 0.6),
    seed: Math.floor(next() * 1e9),
  };
}

function traitDistance(a: Traits, b: Traits): number {
  let d = 0;
  for (const k of BASE_TRAITS) d += (a[k] - b[k]) ** 2;
  return Math.sqrt(d);
}

// Дополнительный поток для каждой слонихи: шкодливость и манера просить
export interface ProfileExtra {
  mischief: number;
  signal: SignalStyle;
  foot: Foot;
}

export function extraProfile(seed: number, index: number, p: { age: number; traits: Traits }): ProfileExtra {
  const next = mulberry(((seed ^ 0x7f4a7c15) + index * 0x9e3779b1) >>> 0);
  const t = p.traits;
  const youth = clamp((24 - p.age) / 18, -1, 1);
  const mischief = round3(z2t(2 * (t.playfulness - 0.5) + 1.4 * (t.curiosity - 0.5) - 1.2 * (t.cooperation - 0.5) + 0.3 * youth + 0.75 * gauss(next)));
  // Манера сигнала: у каждой своя, по характеру и с долей случайности
  const w: Record<SignalStyle, number> = {
    stomp: 0.6 + 1.2 * t.activity + 0.6 * t.expressiveness,
    rumble: 0.4 + 2.8 * t.expressiveness * t.sociability,
    stare: 0.5 + 1.3 * (1 - t.expressiveness),
    gate: 0.4 + 1.0 * t.persistence + 0.6 * (1 - t.expressiveness),
    beg: t.foodDrive > 0.55 && t.cooperation < 0.55 ? 2.2 * t.foodDrive : 0.15,
  };
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let roll = next() * total;
  let signal: SignalStyle = 'stomp';
  for (const k of Object.keys(w) as SignalStyle[]) {
    roll -= w[k];
    if (roll <= 0) {
      signal = k;
      break;
    }
  }
  const feet: Foot[] = ['FL', 'FR', 'HL', 'HR'];
  const foot = feet[Math.floor(next() * 4)];
  return { mischief, signal, foot };
}

export function makeHabits(herd: { extra: ProfileExtra }[], diets: DietId[]): Habits[] {
  return herd.map(({ extra }, i) => ({ signal: extra.signal, foot: extra.foot, diet: diets[i] }));
}

// Рацион из SlonVet: самой молодой — смесь «Юниор», самой крупной — ФормаМакс, остальным — Mono Grass
export function assignDiets(herd: { age: number; look: Look }[]): DietId[] {
  const out: DietId[] = herd.map(() => 'monograss');
  if (!herd.length) return out;
  const byAge = herd.map((p, i) => ({ i, age: p.age, size: p.look.size })).sort((a, b) => a.age - b.age || a.i - b.i);
  const young = byAge[0];
  out[young.i] = 'optiform';
  const rest = byAge.filter((x) => x !== young).sort((a, b) => b.size - a.size || a.i - b.i);
  if (rest.length) out[rest[0].i] = 'formamax';
  for (const x of rest.slice(1)) out[x.i] = x.age < 16 ? 'optiform' : x.size > 1.03 ? 'formamax' : 'monograss';
  return out;
}

export function dietOf(p: ElephantProfile) {
  return DIETS[p.habits.diet];
}

export interface HerdOptions {
  seed: number;
  size: number;
  overrides?: Partial<Traits>[]; // для тестов: подправить черты конкретных слонов
}

export function clampHerdSize(n: number): number {
  return Math.max(1, Math.min(CAPACITY, Math.round(n) || 3));
}

export function generateHerd(opts: HerdOptions): ElephantProfile[] {
  const next = mulberry((opts.seed ^ 0x51ed270b) >>> 0);
  const size = clampHerdSize(opts.size);
  const names = [...NAMES];
  // Перемешиваем имена тем же генератором
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const colors = [...MARK_COLORS];
  const herd: ElephantProfile[] = [];
  const extras: { extra: ProfileExtra }[] = [];
  for (let i = 0; i < size; i++) {
    // Из нескольких кандидатов берём самого непохожего на уже выбранных:
    // стадо получается разнообразным, а не шестью «средними» слонами
    let best: { age: number; traits: Traits } | null = null;
    let bestScore = -1;
    for (let c = 0; c < 6; c++) {
      const age = Math.round(9 + next() * 34);
      const traits = makeTraits(next, age);
      const score = herd.length ? Math.min(...herd.map((h) => traitDistance(h.traits, traits))) : 1;
      if (score > bestScore) {
        best = { age, traits };
        bestScore = score;
      }
    }
    const { age, traits } = best!;
    const foodRoll = next();
    const favoriteFood: FoodKind = foodRoll < 0.5 ? 'produce' : foodRoll < 0.8 ? 'browse' : 'hay';
    const look = makeLook(next, age);
    const extra = extraProfile(opts.seed, i, { age, traits });
    traits.mischief = extra.mischief;
    Object.assign(traits, opts.overrides?.[i] ?? {});
    extras.push({ extra });
    herd.push({
      id: `e${i + 1}`,
      name: names[i % names.length],
      age,
      traits,
      look,
      favoriteFood,
      color: colors[i % colors.length],
      habits: { signal: extra.signal, foot: extra.foot, diet: 'monograss' },
    });
  }
  const habits = makeHabits(extras, assignDiets(herd));
  herd.forEach((p, i) => (p.habits = habits[i]));
  return herd;
}

// Детерминированный разброс по слонихе: у каждой что-то выучено лучше, что-то хуже
export function jitter(seed: number, k: number): number {
  const v = Math.sin((seed + k * 97.13) * 12.9898) * 43758.5453;
  return v - Math.floor(v) - 0.5;
}

// С чем она приходит к новому киперу: доверие — от характера, привычки к нему пока немного,
// голосовые просьбы знает от прежних киперов — старшие и покладистые лучше
export function initialLearned(p: ElephantProfile): Learned {
  const t = p.traits;
  const trained = clamp(0.35 + 0.4 * t.cooperation + 0.12 * clamp((p.age - 10) / 25, 0, 1), 0.2, 0.9);
  const seed = p.look.seed;
  const cue = (shift: number, k: number) => round3(clamp(trained + shift + 0.3 * jitter(seed, k), 0.12, 0.95));
  return {
    trust: round3(clamp(0.25 + 0.35 * (1 - t.nervousness) + 0.15 * t.sociability, 0.1, 0.85)),
    familiarity: round3(clamp(0.22 + 0.18 * t.sociability + 0.1 * (1 - t.nervousness), 0.15, 0.55)),
    cooperation: round3(clamp(0.15 + 0.6 * t.cooperation, 0.1, 0.85)),
    expectation: round3(clamp(0.3 + 0.4 * t.expressiveness, 0.15, 0.85)),
    toilet: round3(clamp(0.15 + 0.3 * t.cooperation + 0.1 * t.expressiveness, 0.1, 0.6)),
    // «En arrière» и «Partez» — привычные команды из её прошлого; «ногу» — для осмотра стоп
    cues: { come: cue(0.1, 1), stay: cue(-0.05, 2), move: cue(0.05, 3), lie: cue(-0.15, 4), follow: cue(0, 5), no: cue(0.05, 6), back: cue(0.05, 7), go: cue(0.08, 8), foot: cue(-0.08, 9) },
  };
}

export function bondKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function initialBonds(herd: ElephantProfile[], seed: number): Record<string, number> {
  const next = mulberry((seed ^ 0x2c1b3c6d) >>> 0);
  const bonds: Record<string, number> = {};
  for (let i = 0; i < herd.length; i++) {
    for (let j = i + 1; j < herd.length; j++) {
      const a = herd[i].traits;
      const b = herd[j].traits;
      const rivalry = Math.max(0, Math.min(a.confidence, b.confidence) - 0.55) * 1.6;
      const v = 0.12 + 0.5 * ((a.sociability + b.sociability) / 2) - rivalry + 0.18 * gauss(next);
      bonds[bondKey(herd[i].id, herd[j].id)] = round3(clamp(v, -0.7, 0.9));
    }
  }
  return bonds;
}

// Ранг в стаде: уверенность, размер и возраст
export function rankScore(p: ElephantProfile): number {
  return 0.6 * p.traits.confidence + 0.25 * ((p.look.size - 0.86) / 0.28) + 0.15 * Math.min(1, p.age / 40);
}

// ---------------------------------------------------------------------------
// Описание характера словами (женский род: в стаде слонихи)
// ---------------------------------------------------------------------------

const TRAIT_WORDS: Record<TraitKey, [string, string]> = {
  nervousness: ['невозмутимая', 'пугливая'],
  confidence: ['робкая', 'властная'],
  activity: ['неторопливая', 'энергичная'],
  curiosity: ['равнодушная к новому', 'любопытная'],
  playfulness: ['серьёзная', 'игривая'],
  sociability: ['самостоятельная', 'общительная'],
  foodDrive: ['разборчивая в еде', 'прожорливая'],
  cooperation: ['своенравная', 'покладистая'],
  persistence: ['переменчивая', 'упрямая'],
  expressiveness: ['молчаливая', 'разговорчивая'],
  sensitivity: ['неприхотливая', 'чувствительная'],
  mischief: ['бережная к вещам', 'шкодливая'],
};

export const TRAIT_LABELS: Record<TraitKey, string> = {
  nervousness: 'Нервозность',
  confidence: 'Уверенность',
  activity: 'Активность',
  curiosity: 'Любопытство',
  playfulness: 'Игривость',
  sociability: 'Общительность',
  foodDrive: 'Пищевая мотивация',
  cooperation: 'Покладистость',
  persistence: 'Упрямство',
  expressiveness: 'Выразительность сигналов',
  sensitivity: 'Чувствительность',
  mischief: 'Шкодливость',
};

export function salientTraits(t: Traits, count = 3): { key: TraitKey; high: boolean; strength: number }[] {
  return TRAIT_KEYS.map((key) => ({ key, high: t[key] >= 0.5, strength: Math.abs(t[key] - 0.5) }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, count)
    .filter((x) => x.strength >= 0.08);
}

export function describeCharacter(p: ElephantProfile): string {
  const words = salientTraits(p.traits, 3).map((s) => TRAIT_WORDS[s.key][s.high ? 1 : 0]);
  if (!words.length) return 'Уравновешенная, без ярких крайностей.';
  const text = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} и ${words[words.length - 1]}`;
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

// Подсказки киперу: что из характера видно в поведении
export function characterHints(p: ElephantProfile): string[] {
  const t = p.traits;
  const out: string[] = [];
  if (t.expressiveness < 0.38) out.push('Сигналы подаёт тихо и редко — следи за ней внимательнее.');
  if (t.expressiveness > 0.62) out.push('Громко и ясно сообщает, что ей нужно.');
  if (t.nervousness > 0.62) out.push('Не любит, когда рядом бегают или шумят.');
  if (t.confidence > 0.64 && t.foodDrive > 0.5) out.push('Может оттеснять других от кормушки.');
  if (t.confidence < 0.36) out.push('Уступает место у еды — проверяй, наелась ли.');
  if (t.playfulness > 0.62) out.push('Любит мяч, воду и возню с подругами.');
  if (t.curiosity > 0.62) out.push('Исследует всё новое: ветки, разбросанный корм, оставленные вещи.');
  if (t.sociability > 0.64) out.push('Скучает одна — держится рядом с подругами.');
  if (t.sociability < 0.36) out.push('Держит дистанцию с другими слонами.');
  if (t.sensitivity > 0.62) out.push('Не ляжет на мокрое и не любит грязь.');
  if (t.persistence > 0.64 && t.cooperation < 0.45) out.push('Упряма: не всегда идёт на зов.');
  if (t.cooperation > 0.64) out.push('Охотно откликается на зов, если за это хвалят.');
  if (t.activity < 0.36) out.push('Много отдыхает, двигается неспешно.');
  if (t.activity > 0.64) out.push('Почти не стоит на месте.');
  if (t.mischief > 0.62) out.push('Тянет и грызёт всё, до чего дотянется; пустой таз или брошенный шланг может испортить.');
  if (t.mischief < 0.36) out.push('Бережно обращается с вещами.');
  const food = p.favoriteFood === 'produce' ? 'овощи и фрукты' : p.favoriteFood === 'browse' ? 'свежие ветки' : 'сено';
  out.push(`Любимая еда — ${food}.`);
  return out;
}

// ---------------------------------------------------------------------------
// Склонение имён (женские имена на -а/-я склоняются, на -и/-у и согласную — нет)
// ---------------------------------------------------------------------------

const FOOT_TEXT: Record<Foot, string> = { FL: 'левой передней', FR: 'правой передней', HL: 'левой задней', HR: 'правой задней' };

export function footText(f: Foot): string {
  return FOOT_TEXT[f];
}

// Как она просится — подсказка в осмотре
export function signalHabitText(p: ElephantProfile): string {
  const h = p.habits;
  switch (h.signal) {
    case 'stomp':
      return `Просится, топая ${FOOT_TEXT[h.foot]} ногой.`;
    case 'rumble':
      return 'Просится голосом: урчит и встряхивает хоботом.';
    case 'stare':
      return 'Просится молча: подходит к киперу и пристально смотрит на него.';
    case 'gate':
      return 'Просится, подолгу стоя у ворот.';
    case 'beg':
      return 'Торгуется: тянет хобот за лакомством и без него слушается неохотно.';
  }
}

export type NameCase = 'acc' | 'gen' | 'dat' | 'ins';

export function nameCase(name: string, c: NameCase): string {
  const last = name.slice(-1);
  const stem = name.slice(0, -1);
  const prev = stem.slice(-1);
  const hush = 'гкхжшщч'.includes(prev);
  if (last === 'а') {
    if (c === 'acc') return `${stem}у`;
    if (c === 'gen') return `${stem}${hush ? 'и' : 'ы'}`;
    if (c === 'dat') return `${stem}е`;
    return `${stem}${'жшщчц'.includes(prev) ? 'ей' : 'ой'}`;
  }
  if (last === 'я') {
    if (c === 'acc') return `${stem}ю`;
    if (c === 'gen') return `${stem}и`;
    if (c === 'dat') return prev === 'и' ? `${stem}и` : `${stem}е`;
    return `${stem}ей`;
  }
  return name;
}
