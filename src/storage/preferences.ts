/** 這台裝置的偏好設定，存在 localStorage（和排行榜一樣用 maze-quiz: 開頭的 key） */

/** 觸控方向鍵放在哪一邊；off 表示不顯示 */
export const DPAD_SIDES = ['right', 'left', 'off'] as const;
export type DpadSide = (typeof DPAD_SIDES)[number];

const DPAD_KEY = 'maze-quiz:dpad';

/** 讀寫偏好設定只需要這兩個方法；測試時可以傳入簡單的替身物件 */
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** 取得 localStorage；隱私瀏覽或網站資料被封鎖時，光是讀取 window.localStorage 就可能丟錯，這時回傳 null */
export function getLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 讀取方向鍵的位置；沒存過、值不認得或無法讀取時用 fallback */
export function loadDpadSide(storage: PreferenceStorage | null, fallback: DpadSide): DpadSide {
  try {
    const saved = storage?.getItem(DPAD_KEY);
    // 從合法值清單裡找，找到的值型別就是 DpadSide，不需要型別斷言
    return DPAD_SIDES.find((side) => side === saved) ?? fallback;
  } catch {
    return fallback;
  }
}

/** 儲存方向鍵的位置；存不了（例如空間已滿）就算了，這次開著的畫面仍然照新的設定 */
export function saveDpadSide(storage: PreferenceStorage | null, side: DpadSide): void {
  try {
    storage?.setItem(DPAD_KEY, side);
  } catch {
    // 忽略：偏好設定存不了不影響遊戲
  }
}
