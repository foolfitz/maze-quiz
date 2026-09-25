import { describe, expect, it } from 'vitest';
import { createRng, hashSeed, seedFromText } from './rng';

function sequence(seed: number, count = 20): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.next());
}

describe('createRng', () => {
  it('同一個種子產生同樣的序列', () => {
    expect(sequence(12345)).toEqual(sequence(12345));
  });

  it('不同種子產生不同的序列', () => {
    expect(sequence(1)).not.toEqual(sequence(2));
  });

  it('next() 在 [0, 1) 之間', () => {
    for (const value of sequence(7, 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('int() 在 [0, max) 之間，每個值都會出現', () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const value = rng.int(6);
      expect(Number.isInteger(value)).toBe(true);
      seen.add(value);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('int() 的上限不是正整數時丟錯', () => {
    const rng = createRng(1);
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.int(2.5)).toThrow(RangeError);
  });

  it('chance() 的比例大致正確', () => {
    const rng = createRng(9);
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (rng.chance(0.3)) hits++;
    expect(hits / 10_000).toBeCloseTo(0.3, 1);
    expect(createRng(1).chance(0)).toBe(false);
    expect(createRng(1).chance(1)).toBe(true);
  });

  it('pick() 從陣列挑一個元素，空陣列丟錯', () => {
    const rng = createRng(5);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 20; i++) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('shuffle() 回傳重新排列的新陣列，不改原陣列', () => {
    const rng = createRng(11);
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = rng.shuffle(original);
    expect(original).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(original);
    expect(shuffled).not.toEqual(original);
  });
});

describe('hashSeed', () => {
  it('同樣的輸入得到同樣的結果', () => {
    expect(hashSeed(42, 3, 0)).toBe(hashSeed(42, 3, 0));
  });

  it('任何一個部分不同，結果就不同；順序也有影響', () => {
    const base = hashSeed(42, 3, 0);
    expect(hashSeed(43, 3, 0)).not.toBe(base);
    expect(hashSeed(42, 4, 0)).not.toBe(base);
    expect(hashSeed(42, 3, 1)).not.toBe(base);
    expect(hashSeed(3, 42, 0)).not.toBe(base);
  });

  it('結果是 32 位元無號整數', () => {
    for (let i = 0; i < 100; i++) {
      const value = hashSeed(i, i * 7, i * 13);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });
});

describe('seedFromText', () => {
  it('32 位元範圍內的整數直接使用', () => {
    expect(seedFromText('0')).toBe(0);
    expect(seedFromText('12345')).toBe(12345);
    expect(seedFromText('4294967295')).toBe(4294967295);
  });

  it('其他文字雜湊成固定的數字', () => {
    expect(seedFromText('hello')).toBe(seedFromText('hello'));
    expect(seedFromText('hello')).not.toBe(seedFromText('world'));
    expect(seedFromText('4294967296')).not.toBe(4294967296);
  });
});
