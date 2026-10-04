// 迷宮問答的中繼資料：老師端的設定表單與伺服器端的清單只需要這些，不必載入整個遊戲。
// 這個檔案不可以 import 遊戲本體、CSS 或字型，只能 import 型別。

import type { GameModule } from '@kancil-quiz/games-sdk';

/** 計時方式：不計時、正計時、倒數 */
export const TIMER_MODES = ['none', 'countUp', 'countDown'] as const;
export type TimerMode = (typeof TIMER_MODES)[number];

/** 難度 1–3，只差在敵人的速度 */
export const DIFFICULTIES = [1, 2, 3] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** 設定值的範圍；optionsSchema 與 normalizeOptions() 都用這裡的值 */
export const OPTION_LIMITS = {
    lives: { min: 1, max: 9 },
    countDownSeconds: { min: 30, max: 3600 },
} as const;

/** 老師可以調整的遊戲設定 */
export interface MazeQuizOptions {
    readonly timerMode: TimerMode;
    /** 只在 timerMode 為 countDown 時使用 */
    readonly countDownSeconds: number;
    readonly lives: number;
    readonly difficulty: Difficulty;
}

const defaultOptions: MazeQuizOptions = {
    timerMode: 'countUp',
    countDownSeconds: 300,
    lives: 3,
    difficulty: 2,
};

const TIMER_MODE_TITLES: Readonly<Record<TimerMode, string>> = {
    none: '不計時',
    countUp: '正計時',
    countDown: '倒數',
};

const DIFFICULTY_TITLES: Readonly<Record<Difficulty, string>> = {
    1: '1（敵人最慢）',
    2: '2',
    3: '3（敵人最快）',
};

/**
 * JSON Schema（draft 2020-12）。列舉值用 oneOf + const + title 寫出中文名稱，
 * 老師端的表單產生器可以直接拿來當選項文字。
 */
const optionsSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: '迷宮問答的設定',
    type: 'object',
    additionalProperties: false,
    required: ['timerMode', 'countDownSeconds', 'lives', 'difficulty'],
    properties: {
        timerMode: {
            title: '計時方式',
            type: 'string',
            oneOf: TIMER_MODES.map((mode) => ({
                const: mode,
                title: TIMER_MODE_TITLES[mode],
            })),
            default: defaultOptions.timerMode,
        },
        countDownSeconds: {
            title: '倒數秒數',
            description: '計時方式選「倒數」時才有作用；時間到就結束遊戲。',
            type: 'integer',
            minimum: OPTION_LIMITS.countDownSeconds.min,
            maximum: OPTION_LIMITS.countDownSeconds.max,
            default: defaultOptions.countDownSeconds,
        },
        lives: {
            title: '生命數',
            description: '被敵人碰到就少一條命，命用完遊戲就結束。',
            type: 'integer',
            minimum: OPTION_LIMITS.lives.min,
            maximum: OPTION_LIMITS.lives.max,
            default: defaultOptions.lives,
        },
        difficulty: {
            title: '難度',
            description: '難度只影響敵人移動的速度。',
            type: 'integer',
            oneOf: DIFFICULTIES.map((level) => ({
                const: level,
                title: DIFFICULTY_TITLES[level],
            })),
            default: defaultOptions.difficulty,
        },
    },
};

export const meta = {
    id: 'maze-quiz',
    version: '0.1.0',
    title: { 'zh-TW': '迷宮問答' },
    requires: {
        shape: 'mcq',
        minRounds: 1,
        optionCount: { min: 2, max: 6 },
        renders: {
            prompt: ['text', 'image', 'audio'],
            option: ['text', 'image'],
        },
        scored: true,
    },
    optionsSchema,
    defaultOptions,
} satisfies Omit<GameModule<MazeQuizOptions>, 'mount'>;
