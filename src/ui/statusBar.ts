import { el } from './dom';
import { STRINGS } from './strings';

/**
 * 狀態列的生命（§12.1）：剩下的命畫實心 ♥，用掉的畫空心 ♡。
 * 整組當成一張圖，螢幕閱讀器唸「剩下 2 條命」，不會一顆一顆唸愛心。
 */
export function showLives(root: HTMLElement, lives: number, maxLives: number): void {
  const hearts = Array.from({ length: Math.max(maxLives, lives) }, (_, i) =>
    i < lives
      ? // U+FE0E 要求用文字樣式顯示，iPad 上才不會變成彩色 emoji
        el('span', { className: 'heart', text: '♥︎' })
      : el('span', { className: 'heart heart-lost', text: '♡' }),
  );
  root.replaceChildren(...hearts);
  root.setAttribute('aria-label', STRINGS.lives(lives));
}

/**
 * 狀態列的時間（§5.2）；text 是 null 時（不計時模式）隱藏。內容沒變就不動 DOM。
 * label 給螢幕閱讀器，例如「剩下 1:23」，只唸數字聽不出是用了多久還是剩多久。
 */
export function showClock(element: HTMLElement, text: string | null, label: string): void {
  element.hidden = text === null;
  if (text === null || element.textContent === text) return;
  element.textContent = text;
  element.setAttribute('aria-label', label);
}
