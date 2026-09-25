/** 可設種子的亂數產生器。core 裡所有的隨機性都要透過它，不可以用 Math.random()。 */
export interface Rng {
  /** [0, 1) 之間的浮點數 */
  next(): number;
  /** [0, maxExclusive) 之間的整數 */
  int(maxExclusive: number): number;
  /** 以 probability 的機率回傳 true */
  chance(probability: number): boolean;
  /** 隨機挑一個元素；陣列不可以是空的，元素不可以是 undefined */
  pick<T>(items: readonly T[]): T;
  /** 回傳打亂順序的新陣列，不修改原陣列 */
  shuffle<T>(items: readonly T[]): T[];
}

/** mulberry32：狀態只有 32 位元，速度快，對遊戲來說品質足夠 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };

  const int = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`int() 的上限必須是正整數，收到 ${maxExclusive}`);
    }
    return Math.floor(next() * maxExclusive);
  };

  return {
    next,
    int,
    chance: (probability) => next() < probability,
    pick<T>(items: readonly T[]): T {
      // noUncheckedIndexedAccess 讓 items[i] 的型別是 T | undefined，檢查過才能當成 T 回傳
      const item = items[int(items.length)];
      if (item === undefined) throw new RangeError('pick() 的陣列元素不可以是 undefined');
      return item;
    },
    shuffle<T>(items: readonly T[]): T[] {
      // 每次從剩下的元素裡隨機抽一個放到結果後面；splice 回傳的是 T[]，不會出現 undefined
      const pool = [...items];
      const result: T[] = [];
      while (pool.length > 0) result.push(...pool.splice(int(pool.length), 1));
      return result;
    },
  };
}

/** murmur3 的 finalizer：把 32 位元整數的位元充分打散 */
function mix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * 把幾個整數合成一個種子，例如 levelSeed = hashSeed(seed, levelIndex, attempt)（§6.1）。
 * 同樣的輸入永遠得到同樣的結果；順序不同結果也不同。
 */
export function hashSeed(...parts: readonly number[]): number {
  let h = 0x9e3779b9;
  for (const part of parts) {
    h = mix32(Math.imul(h ^ mix32(part), 0x27d4eb2d) + 0x165667b1);
  }
  return h;
}

/** 32 位元無號整數的上限（不含） */
const UINT32_LIMIT = 0x1_0000_0000;

/**
 * 把網址參數 seed 轉成數字種子：0–4294967295 的整數直接使用，
 * 其他文字（例如 "hello"）用 FNV-1a 雜湊成數字，一樣可以重現。
 */
export function seedFromText(text: string): number {
  if (/^\d+$/.test(text)) {
    const value = Number(text);
    if (value < UINT32_LIMIT) return value;
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}
