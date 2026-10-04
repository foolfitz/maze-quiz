/**
 * 可設種子的亂數產生器。core 裡所有的隨機性都要透過它，不可以用 Math.random()。
 *
 * 唯一的亂數來源是宿主給的 ctx.rng（GameContext.rng）。開局時從它取一個 32 位元的基礎種子
 * （seedFromSource），之後每一關的迷宮與敵人各自用 hashSeed(基礎種子, 關卡, …) 衍生出獨立的序列。
 * 不在遊戲進行中直接呼叫 ctx.rng：那樣第 2 關的迷宮會受到第 1 關敵人走了幾步影響，
 * 同一個種子就重現不出同樣的迷宮。
 */
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

/** 32 位元無號整數的上限（不含） */
const UINT32_LIMIT = 0x1_0000_0000;

/**
 * 從宿主的亂數來源（回傳 [0, 1) 的函式）取一個 32 位元無號整數，當作整局的基礎種子。
 * 來源不合規（例如回傳 1 或 NaN）時也保證得到合法的種子。
 */
export function seedFromSource(source: () => number): number {
    const value = source();
    if (!Number.isFinite(value)) return 0;
    return Math.floor(Math.abs(value) * UINT32_LIMIT) >>> 0;
}

/** 把 [0, 1) 的亂數來源包裝成 Rng；createRng() 就是以 mulberry32 當來源 */
export function rngFromSource(source: () => number): Rng {
    const next = (): number => {
        const value = source();
        // 來源萬一回傳 1 或超出範圍，夾回 [0, 1)，int() 與 pick() 才不會超出陣列
        return Number.isFinite(value)
            ? Math.min(Math.max(value, 0), 1 - Number.EPSILON)
            : 0;
    };

    const int = (maxExclusive: number): number => {
        if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
            throw new RangeError(
                `int() 的上限必須是正整數，收到 ${maxExclusive}`,
            );
        }
        return Math.floor(next() * maxExclusive);
    };

    return {
        next,
        int,
        chance: (probability) => next() < probability,
        pick<T>(items: readonly T[]): T {
            const item: T | undefined = items[int(items.length)];
            if (item === undefined)
                throw new RangeError('pick() 的陣列元素不可以是 undefined');
            return item;
        },
        shuffle<T>(items: readonly T[]): T[] {
            // 每次從剩下的元素裡隨機抽一個放到結果後面；splice 回傳的是 T[]，不會出現 undefined
            const pool = [...items];
            const result: T[] = [];
            while (pool.length > 0)
                result.push(...pool.splice(int(pool.length), 1));
            return result;
        },
    };
}

/** mulberry32：狀態只有 32 位元，速度快，對遊戲來說品質足夠 */
export function createRng(seed: number): Rng {
    let state = seed >>> 0;
    return rngFromSource(() => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / UINT32_LIMIT;
    });
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
 * 把幾個整數合成一個種子，例如 levelSeed = hashSeed(seed, levelIndex, attempt)。
 * 同樣的輸入永遠得到同樣的結果；順序不同結果也不同。
 */
export function hashSeed(...parts: readonly number[]): number {
    let h = 0x9e3779b9;
    for (const part of parts) {
        h = mix32(Math.imul(h ^ mix32(part), 0x27d4eb2d) + 0x165667b1);
    }
    return h;
}
