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
/** 畫面比例超過這個值就算已經被放大了 */
const ZOOMED_SCALE = 1.01;
/** 點下去要照常觸發 click 的元素 */
const INTERACTIVE_SELECTOR = 'button, a, input, label, select, textarea';

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
 * 畫面是不是已經被放大了。擋不住而被放大時，所有防縮放都要暫停，
 * 使用者才能用兩指或點兩下縮回來（試玩時被放大後就縮不回來）。
 */
function isZoomedIn(view: Window | null): boolean {
  return (view?.visualViewport?.scale ?? 1) > ZOOMED_SCALE;
}

/**
 * 阻止兩指縮放與點兩下放大（§7.4），整頁都有效。主要靠 CSS 的 touch-action；
 * iPad 的 Safari 不一定照 touch-action 處理，所以再用事件擋一次：
 * - gesturestart／gesturechange 是 Safari 專用的縮放手勢事件
 * - 兩根以上手指的 touchstart／touchmove 取消預設動作
 * - 點兩下：第二下的 touchend 取消預設動作。遊戲畫面另外由 holdTouches() 擋得更徹底；
 *   這一層是給標題、結算等要能捲動的畫面用的。輸入框裡照常，才能點兩下選字。
 * 取消預設動作的監聽都必須是 passive: false。
 * viewport 的 user-scalable=no 在 Android 有效，但 iPad 的 Safari 不理它，所以幾層一起用。
 * 回傳解除監聽的函式。
 */
export function preventZoom(target: Document): () => void {
  const zoomed = (): boolean => isZoomedIn(target.defaultView);
  const onGesture = (event: Event): void => {
    if (!zoomed()) event.preventDefault();
  };

  // 單指按下的位置，用來分辨點擊與滑動；上一次點擊，用來判斷點兩下
  let pressedAt: { readonly x: number; readonly y: number } | null = null;
  let lastTap: Tap | null = null;

  const onTouchStart = (event: TouchEvent): void => {
    // 第二根手指一放上來就取消，縮放手勢根本不會開始
    if (event.touches.length > 1) {
      if (!zoomed()) event.preventDefault();
      pressedAt = null;
      return;
    }
    const touch = event.touches[0];
    pressedAt = touch === undefined ? null : { x: touch.clientX, y: touch.clientY };
  };

  const onTouchMove = (event: TouchEvent): void => {
    if (event.touches.length > 1 && !zoomed()) event.preventDefault();
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
    if (isDoubleTap(previous, tap) && event.cancelable && !isTextInput(event.target) && !zoomed()) {
      event.preventDefault();
    }
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

/**
 * 遊戲畫面（狀態列、迷宮舞台、題目列、方向鍵）：手指一按下就取消預設動作。
 * Safari 就不會把它當成點兩下放大、捲動或選字——只設 CSS 的 touch-action: none 時，
 * 試玩的 iOS 裝置在迷宮旁的留白點兩下照樣會放大。
 * 迷宮與方向鍵都用 Pointer Events 操作，Pointer Events 在 touch 事件之前就送出，不受影響；
 * 按鈕（暫停）除外，取消了就不會觸發 click。已經被放大時不擋，讓使用者縮回來。
 * 回傳解除監聽的函式。
 */
export function holdTouches(element: HTMLElement): () => void {
  const onTouchStart = (event: TouchEvent): void => {
    const onControl = event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR) !== null;
    if (!onControl && event.cancelable && !isZoomedIn(element.ownerDocument.defaultView)) event.preventDefault();
  };
  element.addEventListener('touchstart', onTouchStart, { passive: false });
  return () => element.removeEventListener('touchstart', onTouchStart);
}
