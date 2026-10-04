import type { HostWindow } from '../scope';

/**
 * 這台裝置記住的觸控方向鍵位置，存在 localStorage。
 * 隱私瀏覽、網站資料被封鎖或空間已滿時，讀寫都可能丟錯；一律接住，照樣用預設值，遊戲照常進行。
 */

/** 觸控方向鍵放在哪一邊；off 表示不顯示。陣列的順序就是暫停畫面上選項的順序 */
export const DPAD_SIDES = ['left', 'right', 'off'] as const;
export type DpadSide = (typeof DPAD_SIDES)[number];

const DPAD_KEY = 'kancil-quiz:maze-quiz:dpad';

/** 讀寫偏好設定只需要這兩個方法；測試時可以傳入簡單的替身物件 */
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** 取得 localStorage；光是讀取 window.localStorage 就可能丟錯，這時回傳 null */
export function getStorage(win: HostWindow): PreferenceStorage | null {
    try {
        return win.localStorage;
    } catch {
        return null;
    }
}

/** 沒存過、值不認得或無法讀取時用 fallback */
export function loadDpadSide(
    storage: PreferenceStorage | null,
    fallback: DpadSide,
): DpadSide {
    try {
        const saved = storage?.getItem(DPAD_KEY);
        return DPAD_SIDES.find((side) => side === saved) ?? fallback;
    } catch {
        return fallback;
    }
}

/** 存不了就算了，這次開著的畫面仍然照新的設定 */
export function saveDpadSide(
    storage: PreferenceStorage | null,
    side: DpadSide,
): void {
    try {
        storage?.setItem(DPAD_KEY, side);
    } catch {
        // 忽略：偏好設定存不了不影響遊戲
    }
}
