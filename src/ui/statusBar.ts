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
