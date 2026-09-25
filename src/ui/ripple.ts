import { el } from './dom';

/** 漣漪動畫的長度，要和 style.css 的 .ripple 一致 */
const RIPPLE_MS = 450;

/**
 * 在按下的位置顯示短暫的漣漪（§7.3）。用 DOM 元素而不是畫在 canvas 上，
 * 這樣按在迷宮外的空白處（例如直向畫面的上下留白）也看得到。
 * prefers-reduced-motion 時不顯示（§12.5）。
 */
export function showRipple(container: HTMLElement, clientX: number, clientY: number): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = container.getBoundingClientRect();
  const ripple = el('span', { className: 'ripple', attrs: { 'aria-hidden': 'true' } });
  ripple.style.left = `${clientX - box.left}px`;
  ripple.style.top = `${clientY - box.top}px`;
  container.append(ripple);
  // 動畫結束後移除；分頁在背景時 animationend 可能不會觸發，所以用計時器保險
  ripple.addEventListener('animationend', () => ripple.remove());
  window.setTimeout(() => ripple.remove(), RIPPLE_MS + 200);
}
