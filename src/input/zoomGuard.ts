import { isTextInput } from './keyboard';

/** 一次點擊：放開手指的位置（CSS px）與時間 */
export interface Tap {
  readonly x: number;
  readonly y: number;
  readonly timeMs: number;
}

/** 兩下之間隔多久以內、距離多近以內，Safari 會當成「點兩下放大」；寧可抓寬一點 */
const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_DISTANCE_PX = 60;
/** 手指從按下到放開移動超過這個距離就是滑動（例如捲動清單），不算點擊 */
const TAP_SLOP_PX = 12;

/** 這一下和上一下合起來，會不會被 Safari 當成「點兩下放大」 */
export function isDoubleTap(previous: Tap | null, current: Tap): boolean {
  if (previous === null) return false;
  const elapsed = current.timeMs - previous.timeMs;
  return elapsed >= 0 && elapsed <= DOUBLE_TAP_MS && distance(previous, current) <= DOUBLE_TAP_DISTANCE_PX;
}

function distance(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 阻止兩指縮放與點兩下放大（§7.4）。主要靠 CSS 的 touch-action；
 * iPad 的 Safari 不一定照 touch-action 處理，所以再用事件擋一次：
 * - gesturestart／gesturechange 是 Safari 專用的縮放手勢事件
 * - 兩根以上手指的 touchstart／touchmove 取消預設動作
 * - 點兩下：第二下的 touchend 取消預設動作，Safari 就不會放大（試玩時在迷宮以外的地方點兩下會放大）。
 *   只取消 touchend，Pointer Events 已經送出，迷宮與方向鍵的操作不受影響；
 *   代價是很快連點兩下按鈕時第二下不算，這正好也避免誤按兩次。輸入框裡照常，才能點兩下選字。
 * 取消預設動作的監聽都必須是 passive: false。
 * viewport 的 user-scalable=no 在 Android 有效，但 iPad 的 Safari 不理它，所以幾層一起用。
 * 回傳解除監聽的函式。
 */
export function preventZoom(target: Document): () => void {
  const onGesture = (event: Event): void => event.preventDefault();

  // 單指按下的位置，用來分辨點擊與滑動；上一次點擊，用來判斷點兩下
  let pressedAt: { readonly x: number; readonly y: number } | null = null;
  let lastTap: Tap | null = null;

  const onTouchStart = (event: TouchEvent): void => {
    // 第二根手指一放上來就取消，縮放手勢根本不會開始
    if (event.touches.length > 1) {
      event.preventDefault();
      pressedAt = null;
      return;
    }
    const touch = event.touches[0];
    pressedAt = touch === undefined ? null : { x: touch.clientX, y: touch.clientY };
  };

  const onTouchMove = (event: TouchEvent): void => {
    if (event.touches.length > 1) event.preventDefault();
  };

  const onTouchEnd = (event: TouchEvent): void => {
    const touch = event.changedTouches[0];
    const start = pressedAt;
    pressedAt = null;
    // 還有別的手指按著，或是滑動而不是點擊：不算一下
    if (touch === undefined || event.touches.length > 0 || start === null) return;
    const tap: Tap = { x: touch.clientX, y: touch.clientY, timeMs: event.timeStamp };
    if (distance(start, tap) > TAP_SLOP_PX) {
      lastTap = null;
      return;
    }
    // 一直連點時每一下都和前一下比，第三下、第四下也擋得住
    const previous = lastTap;
    lastTap = tap;
    if (isDoubleTap(previous, tap) && event.cancelable && !isTextInput(event.target)) event.preventDefault();
  };

  target.addEventListener('gesturestart', onGesture);
  target.addEventListener('gesturechange', onGesture);
  target.addEventListener('touchstart', onTouchStart, { passive: false });
  target.addEventListener('touchmove', onTouchMove, { passive: false });
  target.addEventListener('touchend', onTouchEnd, { passive: false });
  return () => {
    target.removeEventListener('gesturestart', onGesture);
    target.removeEventListener('gesturechange', onGesture);
    target.removeEventListener('touchstart', onTouchStart);
    target.removeEventListener('touchmove', onTouchMove);
    target.removeEventListener('touchend', onTouchEnd);
  };
}
