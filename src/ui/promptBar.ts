/** 題目列的字級範圍（CSS px） */
const MAX_FONT_PX = 30;
const MIN_FONT_PX = 14;
/** 最多幾行（§12.1） */
const MAX_LINES = 2;

/**
 * 顯示題目文字：先用最大字級，超過兩行就逐步縮小。
 * 縮到最小字級還放不下時就讓它換成第三行，寧可多一行也不要截掉題目。
 */
export function showPrompt(element: HTMLElement, text: string, lang: string): void {
  element.textContent = text;
  element.lang = lang;
  fitPrompt(element);
}

/** 依目前寬度重新調整字級；視窗大小改變時呼叫 */
export function fitPrompt(element: HTMLElement): void {
  // 窄螢幕上最大字級也跟著變小，免得一開始就是好幾行
  const maxSize = Math.max(MIN_FONT_PX, Math.min(MAX_FONT_PX, Math.floor(window.innerWidth / 28)));
  for (let size = maxSize; size >= MIN_FONT_PX; size -= 1) {
    element.style.fontSize = `${size}px`;
    const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || size * 1.3;
    if (element.scrollHeight <= lineHeight * MAX_LINES + 1) return;
  }
}
