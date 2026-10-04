import {
    DIFFICULTIES,
    meta,
    OPTION_LIMITS,
    TIMER_MODES,
    type MazeQuizOptions,
} from './meta';

/** 宿主傳來的設定；每一欄都可能缺少或型別不對 */
export type RawOptions = Partial<Record<keyof MazeQuizOptions, unknown>>;

/**
 * 宿主傳來的設定照理已經依 optionsSchema 驗證過；萬一缺了欄位或值不合法，
 * 該欄改用預設值，遊戲照常進行，不讓設定錯誤造成當機。
 */
export function normalizeOptions(
    raw: RawOptions | null | undefined,
): MazeQuizOptions {
    const defaults = meta.defaultOptions;
    const timerMode = TIMER_MODES.find((mode) => mode === raw?.timerMode);
    const difficulty = DIFFICULTIES.find((level) => level === raw?.difficulty);
    const countDownSeconds = raw?.countDownSeconds;
    const lives = raw?.lives;
    return {
        timerMode: timerMode ?? defaults.timerMode,
        countDownSeconds: inRange(
            countDownSeconds,
            OPTION_LIMITS.countDownSeconds,
        )
            ? countDownSeconds
            : defaults.countDownSeconds,
        lives: inRange(lives, OPTION_LIMITS.lives) ? lives : defaults.lives,
        difficulty: difficulty ?? defaults.difficulty,
    };
}

/** 是範圍內的整數（optionsSchema 的 type 是 integer） */
function inRange(
    value: unknown,
    limits: { readonly min: number; readonly max: number },
): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= limits.min &&
        value <= limits.max
    );
}
