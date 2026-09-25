import { STRINGS } from './ui/strings';

/** 網址參數（§4.3） */
export interface UrlParams {
  readonly quizId: string;
  readonly seed: string | null; // null 表示隨機；M1 再轉成數字種子
  readonly debug: boolean;
}

export type UrlParamsResult =
  | { readonly ok: true; readonly params: UrlParams }
  | { readonly ok: false; readonly errors: readonly string[] };

export const DEFAULT_QUIZ_ID = 'zoo-animals';

// quiz 會拼進檔案路徑，限制字元以免出現 ../ 之類的路徑
const QUIZ_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function parseUrlParams(search: URLSearchParams): UrlParamsResult {
  const quizId = search.get('quiz') ?? DEFAULT_QUIZ_ID;
  if (!QUIZ_ID_PATTERN.test(quizId)) {
    return { ok: false, errors: [STRINGS.invalidQuizParam(quizId)] };
  }
  const seed = search.get('seed');
  return {
    ok: true,
    params: {
      quizId,
      seed: seed === null || seed.trim() === '' ? null : seed.trim(),
      debug: search.get('debug') === '1',
    },
  };
}

/** 題組檔案相對於網頁的路徑 */
export function quizJsonPath(quizId: string): string {
  return `quizzes/${quizId}/quiz.json`;
}
