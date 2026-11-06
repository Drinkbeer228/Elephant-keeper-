// Детерминированный генератор (mulberry32). Состояние хранится в State, поэтому
// смена с тем же seed и тем же вводом повторяется побитово — в том числе после загрузки.

export interface RngHolder {
  rng: number;
}

export function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function random(s: RngHolder): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function range(s: RngHolder, min: number, max: number): number {
  return min + random(s) * (max - min);
}

export function chance(s: RngHolder, p: number): boolean {
  return random(s) < p;
}

export function pick<T>(s: RngHolder, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(random(s) * list.length))];
}

// Нормальное распределение из генератора-функции (Бокс — Мюллер)
export function gauss(next: () => number): number {
  const u = Math.max(1e-9, next());
  const v = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function clamp(v: number, lo = 0, hi = 1): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

// Стабильный хэш строки — для разнесения решений слонов во времени
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
