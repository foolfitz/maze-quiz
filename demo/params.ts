import {
    DIFFICULTIES,
    OPTION_LIMITS,
    TIMER_MODES,
    type MazeQuizOptions,
} from '../src/meta';

/** 示範頁的網址參數（見 README.md） */
export interface DemoParams {
    /** 罐頭題組的名稱，也就是 demo/sets/ 底下的目錄 */
    readonly set: string;
    /** 固定題目順序、選項與迷宮；null 表示每次隨機 */
    readonly seed: number | null;
    /** 顯示除錯畫面，並啟用快捷鍵 N、K、I */
    readonly debug: boolean;
    /** 只放網址上有給的遊戲設定，其他照遊戲的預設值 */
    readonly options: Partial<MazeQuizOptions>;
}

export type ParamsResult =
    | { readonly ok: true; readonly params: DemoParams }
    | { readonly ok: false; readonly errors: readonly string[] };

const UINT32_MAX = 0xffff_ffff;

/** 範圍內的整數；小數、負號或其他文字一律不接受 */
function integerIn(text: string, min: number, max: number): number | null {
    if (!/^\d+$/.test(text)) return null;
    const value = Number(text);
    return value >= min && value <= max ? value : null;
}

export function parseParams(
    search: URLSearchParams,
    defaultSet: string,
): ParamsResult {
    const errors: string[] = [];

    /** 讀一個選填的參數：沒給或空白時是 undefined；給了但不合法時記一筆錯誤 */
    const optional = <T>(
        name: string,
        parse: (text: string) => T | null,
        expected: string,
    ): T | undefined => {
        const text = search.get(name)?.trim() ?? '';
        if (text === '') return undefined;
        const value = parse(text);
        if (value === null)
            errors.push(`${name} 要是${expected}（收到「${text}」）`);
        return value ?? undefined;
    };

    const limits = OPTION_LIMITS;
    const difficulty = optional(
        'difficulty',
        (text) => DIFFICULTIES.find((level) => String(level) === text) ?? null,
        ` ${DIFFICULTIES.join('、')} 其中之一`,
    );
    const lives = optional(
        'lives',
        (text) => integerIn(text, limits.lives.min, limits.lives.max),
        ` ${limits.lives.min} 到 ${limits.lives.max} 的整數`,
    );
    const timerMode = optional(
        'timer',
        (text) => TIMER_MODES.find((mode) => mode === text) ?? null,
        ` ${TIMER_MODES.join('、')} 其中之一`,
    );
    const { min, max } = limits.countDownSeconds;
    const countDownSeconds = optional(
        'seconds',
        (text) => integerIn(text, min, max),
        ` ${min} 到 ${max} 的整數`,
    );
    const seed = optional(
        'seed',
        (text) => integerIn(text, 0, UINT32_MAX),
        ` 0 到 ${UINT32_MAX} 的整數`,
    );

    if (errors.length > 0) return { ok: false, errors };
    return {
        ok: true,
        params: {
            set: search.get('set')?.trim() || defaultSet,
            seed: seed ?? null,
            debug: search.get('debug') === '1',
            // 只放有給的欄位，展開到預設設定上時才不會用 undefined 蓋掉預設值
            options: {
                ...(difficulty === undefined ? {} : { difficulty }),
                ...(lives === undefined ? {} : { lives }),
                ...(timerMode === undefined ? {} : { timerMode }),
                ...(countDownSeconds === undefined ? {} : { countDownSeconds }),
            },
        },
    };
}
