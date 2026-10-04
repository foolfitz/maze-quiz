import type { HostWindow } from '../scope';

/** 題目列的字級範圍（CSS px） */
const MAX_FONT_PX = 30;
const MIN_FONT_PX = 14;
/** 最多幾行 */
const MAX_LINES = 2;
/** CSS 的 line-height 讀不到時的後備值；越南文的疊加聲調需要寬鬆的行高 */
const FALLBACK_LINE_HEIGHT = 1.45;

/**
 * 依目前寬度調整題目文字的字級：先用最大字級，超過兩行就逐步縮小。
 * 縮到最小字級還放不下時就讓它換成第三行，寧可多一行也不要截掉題目。
 * 大小改變或換題時呼叫。container 是遊戲的根元素（宿主可能只給遊戲一部分的畫面）。
 */
export function fitPrompt(
    element: HTMLElement,
    win: HostWindow,
    container: HTMLElement,
): void {
    if (element.textContent === '') return;
    // 窄的畫面上最大字級也跟著變小，免得一開始就是好幾行
    const width = container.clientWidth || win.innerWidth;
    const maxSize = Math.max(
        MIN_FONT_PX,
        Math.min(MAX_FONT_PX, Math.floor(width / 28)),
    );
    for (let size = maxSize; size >= MIN_FONT_PX; size -= 1) {
        element.style.fontSize = `${size}px`;
        const lineHeight =
            parseFloat(win.getComputedStyle(element).lineHeight) ||
            size * FALLBACK_LINE_HEIGHT;
        if (element.scrollHeight <= lineHeight * MAX_LINES + 1) return;
    }
}
