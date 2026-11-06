// Рационы и кормление — из проекта SlonVet (github.com/Drinkbeer228/slonovet):
//   src/domain/seed.ts — рационы трёх слоних (сено, ветки, зерносмесь, каши, овощи);
//   supabase/migrations/006_data_from_keepers.sql — «со слов слоноводов»: кашу запаривают
//     за ~60 минут, вес гарца (совка) по видам зерна;
//   supabase/migrations/013_produce.sql — овощи: картофель, морковь, свёкла по 20 кг каждой
//     слонихе + сезонное 10–15 кг; веса мешков и сеток.
// Ни одного числа здесь не придумано: всё перенесено из этих файлов. В игре стадо
// генерируется, поэтому каждой слонихе назначается один из трёх рационов SlonVet целиком.

export type DietId = 'formamax' | 'optiform' | 'monograss';
export type GrainId = 'hercules' | 'bran' | 'oats' | 'corn' | 'seeds';

export interface GrainPortion {
  item: GrainId;
  name: string;
  qty: number;
  unit: 'гарец' | 'г';
}

export interface Diet {
  id: DietId;
  source: string; // чей это рацион в SlonVet
  hayKg: number;
  branchesKg: number;
  grain: GrainPortion[]; // 07:00
  porridge: { product: string; kg: number }; // 13:00 и 17:00
}

export const DIETS: Record<DietId, Diet> = {
  formamax: {
    id: 'formamax',
    source: 'Претти',
    hayKg: 60,
    branchesKg: 10,
    grain: [
      { item: 'hercules', name: 'Геркулес', qty: 2, unit: 'гарец' },
      { item: 'bran', name: 'Отруби', qty: 2, unit: 'гарец' },
      { item: 'oats', name: 'Овёс', qty: 1, unit: 'гарец' },
      { item: 'corn', name: 'Кукуруза', qty: 0.5, unit: 'гарец' },
      { item: 'seeds', name: 'Семечки', qty: 300, unit: 'г' },
    ],
    porridge: { product: 'ФормаМакс', kg: 2 },
  },
  optiform: {
    id: 'optiform',
    source: 'Марго',
    hayKg: 55,
    branchesKg: 10,
    grain: [
      { item: 'hercules', name: 'Геркулес', qty: 1, unit: 'гарец' },
      { item: 'bran', name: 'Отруби', qty: 1, unit: 'гарец' },
      { item: 'oats', name: 'Овёс', qty: 0.5, unit: 'гарец' },
      { item: 'corn', name: 'Кукуруза', qty: 300, unit: 'г' },
      { item: 'seeds', name: 'Семечки', qty: 200, unit: 'г' },
    ],
    porridge: { product: 'ОптиФорм Микс (Юниор)', kg: 1.5 },
  },
  monograss: {
    id: 'monograss',
    source: 'Одри',
    hayKg: 50,
    branchesKg: 10,
    grain: [
      { item: 'hercules', name: 'Геркулес', qty: 1, unit: 'гарец' },
      { item: 'bran', name: 'Отруби', qty: 1, unit: 'гарец' },
      { item: 'oats', name: 'Овёс', qty: 0.5, unit: 'гарец' },
      { item: 'seeds', name: 'Семечки', qty: 200, unit: 'г' },
    ],
    porridge: { product: 'Mono Grass', kg: 1.5 },
  },
};

export const DIET_IDS: DietId[] = ['formamax', 'optiform', 'monograss'];

// Вес гарца (совка), кг — migration 006
export const GARETS_KG: Record<GrainId, number> = { hercules: 1.5, bran: 1.1, oats: 2, corn: 3.2, seeds: 1.9 };

// Мешок сухой каши — 20 кг (seed.ts: sack_kg)
export const PORRIDGE_SACK_KG = 20;

// Распорядок кормлений (seed.ts)
export type MealId = 'grain' | 'porridge13' | 'porridge17' | 'veg';

export interface MealDef {
  id: MealId;
  time: number; // минута суток
  title: string;
  prep: string;
}

export const MEALS: MealDef[] = [
  { id: 'grain', time: 7 * 60, title: 'Зерносмесь', prep: '' },
  { id: 'porridge13', time: 13 * 60, title: 'Каша', prep: 'запарить за 60 мин' },
  { id: 'porridge17', time: 17 * 60, title: 'Каша', prep: 'запарить за 60 мин' },
  { id: 'veg', time: 19 * 60, title: 'Овощи', prep: 'мыть, крупная нарезка · таз на каждую' },
];

// Кашу запаривают за ~60 минут (migration 006: «запарить за 60 мин»)
export const PORRIDGE_SOAK_MIN = 60;

// Овощи (migration 013): картофель, морковь, свёкла по 20 кг + сезонное 10–15 кг
export type VegKind = 'potato' | 'carrot' | 'beet' | 'pumpkin' | 'zucchini' | 'cabbage' | 'pepper' | 'eggplant' | 'apple';
export const VEG_KINDS: VegKind[] = ['potato', 'carrot', 'beet', 'pumpkin', 'zucchini', 'cabbage', 'pepper', 'eggplant', 'apple'];
export const VEG_MAIN: VegKind[] = ['potato', 'carrot', 'beet'];
export const VEG_MAIN_KG = 20;
export const VEG_SEASONAL: VegKind[] = ['pumpkin', 'zucchini', 'cabbage', 'pepper', 'eggplant', 'apple'];
export const VEG_SEASONAL_KG: [number, number] = [10, 15];
// Для мини-игры нарезки: один овощ ≈ 1 кг (упрощение для игры, не данные SlonVet)
export const VEG_PIECE_KG = 1;

// Мешки и ящики склада (migration 013: sack_kg)
export const VEG_PACK_KG: Record<VegKind, number> = {
  potato: 40,
  carrot: 40,
  beet: 40,
  cabbage: 30,
  apple: 20,
  pumpkin: 20,
  zucchini: 20,
  pepper: 20,
  eggplant: 20,
};

export const VEG_LABEL: Record<VegKind, string> = {
  potato: 'Картофель',
  carrot: 'Морковь',
  beet: 'Свёкла',
  pumpkin: 'Тыква',
  zucchini: 'Кабачки',
  cabbage: 'Капуста',
  pepper: 'Перец',
  eggplant: 'Баклажаны',
  apple: 'Яблоки',
};

// Сколько сезонного кладут сегодня: середина диапазона 10–15 кг
export const VEG_SEASONAL_TODAY = 12;

// Какое сезонное овощное блюдо сегодня (меняется по дням)
export function seasonalFor(seed: number, day: number): VegKind {
  return VEG_SEASONAL[Math.abs((seed % 997) + day * 5) % VEG_SEASONAL.length];
}

// Полный таз для одной слонихи: сколько кг каждого вида
export function vegPlan(seed: number, day: number): Partial<Record<VegKind, number>> {
  return { potato: VEG_MAIN_KG, carrot: VEG_MAIN_KG, beet: VEG_MAIN_KG, [seasonalFor(seed, day)]: VEG_SEASONAL_TODAY };
}

export function emptyVeg(): Record<VegKind, number> {
  return { potato: 0, carrot: 0, beet: 0, pumpkin: 0, zucchini: 0, cabbage: 0, pepper: 0, eggplant: 0, apple: 0 };
}

export function vegTotal(v: Record<VegKind, number>): number {
  let s = 0;
  for (const k of VEG_KINDS) s += v[k];
  return s;
}
