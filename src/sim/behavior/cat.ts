// Слониха и котёнок. Как она к нему относится — от характера: нервная вздрагивает, когда он
// выскакивает внезапно; властная и ревнивая к еде не терпит его рядом и делает выпад, чтобы
// прогнать; любопытная и игривая тянется к нему хоботом; спокойная просто не замечает.
// Чем дольше они живут рядом без происшествий, тем меньше она пугается и тем ближе подпускает.

import { KITTEN } from '../../data/balance';
import { jitter } from '../herd';
import { clamp } from '../rng';
import type { Elephant } from '../types';

export interface CatTemper {
  startle: number; // вздрагивает от внезапного котёнка
  dislike: number; // не терпит рядом: прогоняет
  interest: number; // любопытно: тянется хоботом
}

export function catTemper(e: Elephant): CatTemper {
  const t = e.profile.traits;
  const seed = e.profile.look.seed;
  return {
    startle: clamp(0.1 + 0.7 * t.nervousness + 0.2 * t.sensitivity - 0.25 * t.confidence + 0.3 * jitter(seed, 61)),
    dislike: clamp(0.02 + 0.5 * t.confidence + 0.3 * t.foodDrive - 0.3 * t.cooperation - 0.2 * t.playfulness + 0.45 * jitter(seed, 62)),
    interest: clamp(0.05 + 0.45 * t.curiosity + 0.35 * t.playfulness + 0.1 * t.sociability - 0.25 * t.nervousness + 0.3 * jitter(seed, 63)),
  };
}

// Как близко (от корпуса, м) подпускает котёнка, не прогоняя: у еды — дальше; привыкла — ближе
export function catTolerance(e: Elephant, eating: boolean): number {
  const T = catTemper(e);
  return (0.4 + 2.6 * T.dislike) * (1 - 0.6 * e.learned.cat) + (eating ? 1.1 * T.dislike : 0);
}

// Можно ли ей сейчас отвлечься на котёнка: не спит, не занята просьбой кипера, не мочится
export function canMindKitten(e: Elephant): boolean {
  if (e.lying) return false;
  const a = e.act;
  if (a.forced) return false;
  switch (a.kind) {
    case 'urinate':
    case 'defecate':
    case 'walkWith':
    case 'stay':
    case 'giveWay':
    case 'follow':
    case 'foot':
    case 'backUp':
    case 'forward':
    case 'warn':
    case 'avoid':
    case 'drowsy':
    case 'shoo':
    case 'sniffCat':
    case 'signal':
    case 'sleep': // идёт спать — не до котёнка
    case 'lie':
      return false;
    default:
      return true;
  }
}

// Привыкание за dt минут спокойного соседства
export function getUsedToKitten(e: Elephant, dt: number): void {
  const T = catTemper(e);
  e.learned.cat = clamp(e.learned.cat + KITTEN.familiarity * dt * (0.6 + T.interest));
}

// Что видно киперу со стороны: самая частая реакция — для карточки слонихи
export function catHabitText(e: Elephant): string | null {
  const c = e.mem.seen.cat;
  const total = c.startle + c.shoo + c.sniff + c.calm;
  if (total === 0) return null;
  const used = e.learned.cat > 0.75;
  const top = (['shoo', 'startle', 'sniff', 'calm'] as const).reduce((a, b) => (c[b] > c[a] ? b : a));
  switch (top) {
    case 'shoo':
      return used ? 'Котёнка терпит, но у еды может прогнать.' : 'Котёнка недолюбливает: подойдёт близко — делает резкий выпад, прогоняет.';
    case 'startle':
      return used ? 'Пугалась котёнка, но привыкает к нему.' : 'Вздрагивает, когда котёнок выскакивает внезапно.';
    case 'sniff':
      return 'Котёнок ей интересен — тянется к нему хоботом.';
    default:
      return 'На котёнка почти не обращает внимания.';
  }
}
