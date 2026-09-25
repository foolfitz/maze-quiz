import { resolveOptions, validateQuiz, type GameOptions, type QuizFile } from './core/quiz';
import { STRINGS } from './ui/strings';

/** 載入題組，並預先載入字型與所有圖片（§4.3、§5.1） */

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

/** 題目與選項文字用到的字重：題目是一般（400），答案區的選項與標題是粗體（700） */
export const QUIZ_FONT_WEIGHTS = [400, 700] as const;

/**
 * quizFontFamily 是題目與選項的字型（§12.4），@font-face 寫在 style.css。
 * 這裡先把它下載好再進標題畫面：迷宮上的選項文字畫在快取的圖層裡，字型還沒到就畫的話會一直是後備字型。
 */
export async function loadQuiz(
  quizUrl: URL,
  quizFontFamily: string,
  onProgress: ProgressCallback,
): Promise<LoadResult> {
  onProgress(0);

  // 進度的分母：題組檔案、每個字重、每張圖各算 1 步；讀到題組之後才知道有幾張圖，在那之前先不回報
  let totalSteps: number | null = null;
  let doneSteps = 0;
  const stepDone = (): void => {
    doneSteps += 1;
    if (totalSteps !== null) onProgress(doneSteps / totalSteps);
  };

  // 字型和題組同時開始下載
  const fonts = QUIZ_FONT_WEIGHTS.map(async (weight) => {
    const loaded = await loadFont(`${weight} 16px ${quizFontFamily}`);
    stepDone();
    return { weight, loaded };
  });

  const raw = await fetchJson(quizUrl);
  if (!raw.ok) return raw;

  const validation = validateQuiz(raw.value);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  const { quiz } = validation;

  const entries = Object.entries(quiz.images);
  totalSteps = 1 + fonts.length + entries.length;
  stepDone();

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
      stepDone();
    }),
  );
  // 字型載入失敗不中斷遊戲，改用後備字型並記一筆警告（和圖片一樣）
  for (const { weight, loaded } of await Promise.all(fonts)) {
    if (!loaded) warnings.push(STRINGS.fontLoadFailed(quizFontFamily, weight));
  }

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

  let text: string;
  try {
    // 連線可能在讀內容的途中斷掉
    text = await response.text();
  } catch (error) {
    return { ok: false, errors: [STRINGS.quizFetchFailed(url.pathname, errorMessage(error))] };
  }
  try {
    // JSON.parse 的回傳型別是 any；立刻存成 unknown，強迫後面一定要先驗證才能使用
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, errors: [STRINGS.quizNotJson(errorMessage(error))] };
  }
}

/** 下載一種字重的字型（例如 "700 16px Andika"）；失敗時回傳 false */
async function loadFont(font: string): Promise<boolean> {
  try {
    // 找不到對應的 @font-face 時回傳空陣列；字型檔下載失敗時，有的瀏覽器 reject、有的把狀態標成 error
    const faces = await document.fonts.load(font);
    return faces.length > 0 && faces.every((face) => face.status === 'loaded');
  } catch {
    return false;
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
