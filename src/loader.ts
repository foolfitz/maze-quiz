import { resolveOptions, validateQuiz, type GameOptions, type QuizFile } from './core/quiz';
import { STRINGS } from './ui/strings';

/** 載入題組並預先載入所有圖片（§4.3） */

export interface LoadedQuiz {
  readonly quiz: QuizFile;
  readonly options: GameOptions;
  /** 只包含載入成功的圖片；查不到的 key 就改用純文字顯示 */
  readonly images: ReadonlyMap<string, HTMLImageElement>;
  readonly warnings: readonly string[];
}

export type LoadResult =
  | { readonly ok: true; readonly data: LoadedQuiz }
  | { readonly ok: false; readonly errors: readonly string[] };

/** progress 介於 0–1 */
export type ProgressCallback = (progress: number) => void;

export async function loadQuiz(quizUrl: URL, onProgress: ProgressCallback): Promise<LoadResult> {
  onProgress(0);

  const raw = await fetchJson(quizUrl);
  if (!raw.ok) return raw;

  const validation = validateQuiz(raw.value);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  const { quiz } = validation;

  // 進度的分母：題組檔案算 1 步，每張圖各算 1 步
  const entries = Object.entries(quiz.images);
  const totalSteps = 1 + entries.length;
  let doneSteps = 1;
  onProgress(doneSteps / totalSteps);

  const warnings = [...validation.warnings];
  const images = new Map<string, HTMLImageElement>();

  await Promise.all(
    entries.map(async ([key, asset]) => {
      // 圖片路徑相對於 quiz.json 所在的資料夾
      const url = new URL(asset.src, quizUrl);
      try {
        images.set(key, await loadImage(url, asset.alt));
      } catch {
        warnings.push(STRINGS.imageLoadFailed(key, url.pathname));
      }
      doneSteps += 1;
      onProgress(doneSteps / totalSteps);
    }),
  );

  return {
    ok: true,
    data: { quiz, options: resolveOptions(quiz.options), images, warnings },
  };
}

type FetchJsonResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly errors: readonly string[] };

async function fetchJson(url: URL): Promise<FetchJsonResult> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-cache' });
  } catch (error) {
    return { ok: false, errors: [STRINGS.quizFetchFailed(url.pathname, errorMessage(error))] };
  }
  if (!response.ok) {
    return { ok: false, errors: [STRINGS.quizNotFound(url.pathname, response.status)] };
  }

  const text = await response.text();
  try {
    // JSON.parse 的回傳型別是 any；立刻存成 unknown，強迫後面一定要先驗證才能使用
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, errors: [STRINGS.quizNotJson(errorMessage(error))] };
  }
}

async function loadImage(url: URL, alt: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.alt = alt;
  image.src = url.href;
  // decode() 會等圖片下載並解碼完成；載入失敗時會 reject
  await image.decode();
  return image;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
