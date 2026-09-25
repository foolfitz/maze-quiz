import { DIFFICULTIES, QUIZ_LIMITS, TIMER_MODES, type GameOptions } from './core/quiz';
import { STRINGS } from './ui/strings';

/** 測試用：網址參數可以蓋過題組的這幾項設定（規格外，見 DECISIONS.md） */
export type OptionOverrides = Partial<Pick<GameOptions, 'difficulty' | 'lives' | 'timerMode' | 'countDownSeconds'>>;

/** 網址參數（§4.3） */
export interface UrlParams {
  readonly quizId: string;
  readonly seed: string | null; // null 表示隨機；M1 再轉成數字種子
  readonly debug: boolean;
  /** difficulty、lives、timer、seconds；沒給的照題組設定 */
  readonly overrides: OptionOverrides;
}

export type UrlParamsResult =
  | { readonly ok: true; readonly params: UrlParams }
  | { readonly ok: false; readonly errors: readonly string[] };

export const DEFAULT_QUIZ_ID = 'zoo-animals';

// quiz 會拼進檔案路徑，限制字元以免出現 ../ 之類的路徑
const QUIZ_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** 範圍內的整數；其他寫法（小數、負號、空白以外的文字）一律不接受 */
function integerIn(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value >= min && value <= max ? value : null;
}

export function parseUrlParams(search: URLSearchParams): UrlParamsResult {
  const errors: string[] = [];
  const quizId = search.get('quiz') ?? DEFAULT_QUIZ_ID;
  if (!QUIZ_ID_PATTERN.test(quizId)) errors.push(STRINGS.invalidQuizParam(quizId));

  /** 讀一個選填的參數：沒給或空白時是 undefined；給了但不合法時記一筆錯誤 */
  const optional = <T>(
    name: string,
    parse: (text: string) => T | null,
    message: (text: string) => string,
  ): T | undefined => {
    const text = search.get(name)?.trim() ?? '';
    if (text === '') return undefined;
    const value = parse(text);
    if (value === null) errors.push(message(text));
    return value ?? undefined;
  };

  // 從合法值清單裡找，找到的值型別就是 Difficulty／TimerMode，不需要型別斷言
  const difficulty = optional(
    'difficulty',
    (t) => DIFFICULTIES.find((d) => String(d) === t) ?? null,
    STRINGS.invalidDifficultyParam,
  );
  const timerMode = optional('timer', (t) => TIMER_MODES.find((mode) => mode === t) ?? null, STRINGS.invalidTimerParam);
  const { lives: livesLimit, countDownSeconds: secondsLimit } = QUIZ_LIMITS;
  const lives = optional('lives', (t) => integerIn(t, livesLimit.min, livesLimit.max), STRINGS.invalidLivesParam);
  const countDownSeconds = optional(
    'seconds',
    (t) => integerIn(t, secondsLimit.min, secondsLimit.max),
    STRINGS.invalidSecondsParam,
  );

  if (errors.length > 0) return { ok: false, errors };
  const seed = search.get('seed');
  return {
    ok: true,
    params: {
      quizId,
      seed: seed === null || seed.trim() === '' ? null : seed.trim(),
      debug: search.get('debug') === '1',
      // 只放有給的欄位，展開到題組設定上時才不會用 undefined 蓋掉原本的值
      overrides: {
        ...(difficulty === undefined ? {} : { difficulty }),
        ...(timerMode === undefined ? {} : { timerMode }),
        ...(lives === undefined ? {} : { lives }),
        ...(countDownSeconds === undefined ? {} : { countDownSeconds }),
      },
    },
  };
}

/** 題組檔案相對於網頁的路徑 */
export function quizJsonPath(quizId: string): string {
  return `quizzes/${quizId}/quiz.json`;
}
