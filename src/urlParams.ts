import { DIFFICULTIES, type Difficulty } from './core/quiz';
import { STRINGS } from './ui/strings';

/** 網址參數（§4.3） */
export interface UrlParams {
  readonly quizId: string;
  readonly seed: string | null; // null 表示隨機；M1 再轉成數字種子
  readonly debug: boolean;
  /** 測試用：覆蓋題組的難度（規格外，見 DECISIONS.md）；null 表示照題組設定 */
  readonly difficulty: Difficulty | null;
}

export type UrlParamsResult =
  | { readonly ok: true; readonly params: UrlParams }
  | { readonly ok: false; readonly errors: readonly string[] };

export const DEFAULT_QUIZ_ID = 'zoo-animals';

// quiz 會拼進檔案路徑，限制字元以免出現 ../ 之類的路徑
const QUIZ_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function parseUrlParams(search: URLSearchParams): UrlParamsResult {
  const errors: string[] = [];
  const quizId = search.get('quiz') ?? DEFAULT_QUIZ_ID;
  if (!QUIZ_ID_PATTERN.test(quizId)) errors.push(STRINGS.invalidQuizParam(quizId));

  const difficultyText = search.get('difficulty')?.trim() ?? '';
  // 從合法值清單裡找，找到的值型別就是 Difficulty，不需要型別斷言
  const difficulty = DIFFICULTIES.find((d) => String(d) === difficultyText) ?? null;
  if (difficultyText !== '' && difficulty === null) errors.push(STRINGS.invalidDifficultyParam(difficultyText));

  if (errors.length > 0) return { ok: false, errors };
  const seed = search.get('seed');
  return {
    ok: true,
    params: {
      quizId,
      seed: seed === null || seed.trim() === '' ? null : seed.trim(),
      debug: search.get('debug') === '1',
      difficulty,
    },
  };
}

/** 題組檔案相對於網頁的路徑 */
export function quizJsonPath(quizId: string): string {
  return `quizzes/${quizId}/quiz.json`;
}
