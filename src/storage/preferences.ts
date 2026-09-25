import { DIFFICULTIES, type Difficulty } from '../core/quiz';

/** 這台裝置的偏好設定，存在 localStorage（和排行榜一樣用 maze-quiz: 開頭的 key） */

/** 觸控方向鍵放在哪一邊；off 表示不顯示。陣列的順序就是標題畫面上選項的順序 */
export const DPAD_SIDES = ['left', 'right', 'off'] as const;
export type DpadSide = (typeof DPAD_SIDES)[number];

const DPAD_KEY = 'maze-quiz:dpad';
const DIFFICULTY_KEY = 'maze-quiz:difficulty';
/** 語言跟著題組走：每個題組有哪些語言不一樣 */
const languageKey = (quizId: string): string => `maze-quiz:language:${quizId}`;

/** 讀寫偏好設定只需要這兩個方法；測試時可以傳入簡單的替身物件 */
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * 讀取一個「從幾個值裡選一個」的設定；沒存過、值不認得或無法讀取時用 fallback。
 * 從合法值清單裡找，找到的值型別就是 T，不需要型別斷言。
 */
function loadChoice<T extends string | number>(
  storage: PreferenceStorage | null,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  try {
    const saved = storage?.getItem(key);
    return allowed.find((value) => String(value) === saved) ?? fallback;
  } catch {
    return fallback;
  }
}

/** 存不了（例如空間已滿、私密瀏覽）就算了，這次開著的畫面仍然照新的設定 */
function saveChoice(storage: PreferenceStorage | null, key: string, value: string | number): void {
  try {
    storage?.setItem(key, String(value));
  } catch {
    // 忽略：偏好設定存不了不影響遊戲
  }
}

export function loadDpadSide(storage: PreferenceStorage | null, fallback: DpadSide): DpadSide {
  return loadChoice(storage, DPAD_KEY, DPAD_SIDES, fallback);
}

export function saveDpadSide(storage: PreferenceStorage | null, side: DpadSide): void {
  saveChoice(storage, DPAD_KEY, side);
}

/** 標題畫面選的難度 */
export function loadDifficulty(storage: PreferenceStorage | null, fallback: Difficulty): Difficulty {
  return loadChoice(storage, DIFFICULTY_KEY, DIFFICULTIES, fallback);
}

export function saveDifficulty(storage: PreferenceStorage | null, difficulty: Difficulty): void {
  saveChoice(storage, DIFFICULTY_KEY, difficulty);
}

/** 標題畫面選的語言（語言代碼）；allowed 是這個題組有的語言 */
export function loadLanguage(
  storage: PreferenceStorage | null,
  quizId: string,
  allowed: readonly string[],
  fallback: string,
): string {
  return loadChoice(storage, languageKey(quizId), allowed, fallback);
}

export function saveLanguage(storage: PreferenceStorage | null, quizId: string, locale: string): void {
  saveChoice(storage, languageKey(quizId), locale);
}
