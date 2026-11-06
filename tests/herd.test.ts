import { describe, expect, it } from 'vitest';
import { generateHerd, clampHerdSize, describeCharacter, characterHints, nameCase, initialLearned, initialBonds } from '../src/sim/herd';
import { TRAIT_KEYS } from '../src/sim/types';
import { CAPACITY } from '../src/data/facility';
import { createState } from '../src/sim';

describe('генерация стада', () => {
  it('один и тот же seed даёт то же стадо, другой — другое', () => {
    const a = generateHerd({ seed: 42, size: 3 });
    const b = generateHerd({ seed: 42, size: 3 });
    const c = generateHerd({ seed: 43, size: 3 });
    expect(a).toEqual(b);
    expect(a.map((p) => p.name)).not.toEqual(c.map((p) => p.name));
  });

  it('размер стада настраивается от 1 до вместимости', () => {
    expect(clampHerdSize(0)).toBe(3);
    expect(clampHerdSize(1)).toBe(1);
    expect(clampHerdSize(99)).toBe(CAPACITY);
    for (const n of [1, 2, 4, 6]) {
      const s = createState({ seed: 5, herdSize: n });
      expect(s.elephants).toHaveLength(n);
      expect(new Set(s.elephants.map((e) => e.id)).size).toBe(n);
    }
  });

  it('черты в допустимых границах, имена не повторяются', () => {
    for (let seed = 1; seed < 40; seed++) {
      const herd = generateHerd({ seed, size: 6 });
      expect(new Set(herd.map((p) => p.name)).size).toBe(6);
      for (const p of herd) {
        for (const k of TRAIT_KEYS) {
          expect(p.traits[k]).toBeGreaterThanOrEqual(0.04);
          expect(p.traits[k]).toBeLessThanOrEqual(0.96);
        }
        expect(p.look.size).toBeGreaterThanOrEqual(0.86);
        expect(p.look.size).toBeLessThanOrEqual(1.14);
        expect(p.age).toBeGreaterThanOrEqual(9);
      }
    }
  });

  it('распределение черт — не равномерный шум: середина встречается чаще краёв', () => {
    const values: number[] = [];
    for (let seed = 1; seed < 120; seed++) for (const p of generateHerd({ seed, size: 3 })) values.push(...TRAIT_KEYS.map((k) => p.traits[k]));
    const middle = values.filter((v) => v > 0.3 && v < 0.7).length / values.length;
    const edges = values.filter((v) => v < 0.15 || v > 0.85).length / values.length;
    expect(middle).toBeGreaterThan(0.55);
    expect(edges).toBeLessThan(0.12);
  });

  it('черты связаны правдоподобно: смелые реже нервничают', () => {
    const pairs: [number, number][] = [];
    for (let seed = 1; seed < 150; seed++) for (const p of generateHerd({ seed, size: 3 })) pairs.push([p.traits.confidence, p.traits.nervousness]);
    const mx = pairs.reduce((a, p) => a + p[0], 0) / pairs.length;
    const my = pairs.reduce((a, p) => a + p[1], 0) / pairs.length;
    const cov = pairs.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
    expect(cov).toBeLessThan(0);
  });

  it('стадо разнообразно: два слона не бывают почти одинаковыми', () => {
    for (let seed = 1; seed < 30; seed++) {
      const herd = generateHerd({ seed, size: 3 });
      for (let i = 0; i < herd.length; i++)
        for (let j = i + 1; j < herd.length; j++) {
          const d = Math.sqrt(TRAIT_KEYS.reduce((a, k) => a + (herd[i].traits[k] - herd[j].traits[k]) ** 2, 0));
          expect(d).toBeGreaterThan(0.25);
        }
    }
  });

  it('описание характера и подсказки строятся из черт', () => {
    const [p] = generateHerd({ seed: 9, size: 1, overrides: [{ playfulness: 0.95, curiosity: 0.93, nervousness: 0.05 }] });
    const d = describeCharacter(p);
    expect(d).toMatch(/игривая|любопытная|невозмутимая/);
    expect(characterHints(p).length).toBeGreaterThan(1);
  });

  it('выученное и отношения стартуют от характера', () => {
    const [calm, nervous] = generateHerd({ seed: 3, size: 2, overrides: [{ nervousness: 0.1 }, { nervousness: 0.9 }] });
    expect(initialLearned(calm).trust).toBeGreaterThan(initialLearned(nervous).trust);
    const bonds = initialBonds([calm, nervous], 3);
    expect(Object.keys(bonds)).toHaveLength(1);
  });

  it('имена склоняются', () => {
    expect(nameCase('Тара', 'acc')).toBe('Тару');
    expect(nameCase('Ганга', 'gen')).toBe('Ганги');
    expect(nameCase('Майя', 'ins')).toBe('Майей');
    expect(nameCase('Ния', 'dat')).toBe('Нии');
    expect(nameCase('Бинду', 'acc')).toBe('Бинду');
  });
});
