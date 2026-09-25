/**
 * 阻止兩指縮放（§7.4）。主要靠 CSS 的 touch-action；
 * iPad 的 Safari 不一定照 touch-action 處理縮放手勢，所以再用事件擋一次：
 * - gesturestart／gesturechange 是 Safari 專用的縮放手勢事件
 * - 兩根以上手指的 touchstart／touchmove 取消預設動作（必須是 passive: false 才能取消）
 * viewport 的 user-scalable=no 在 Android 有效，但 iPad 的 Safari 不理它，所以三層一起用。
 * 回傳解除監聽的函式。
 */
export function preventPinchZoom(target: Document): () => void {
  const onGesture = (event: Event): void => event.preventDefault();
  // 第二根手指一放上來就取消，縮放手勢根本不會開始
  const onMultiTouch = (event: TouchEvent): void => {
    if (event.touches.length > 1) event.preventDefault();
  };

  target.addEventListener('gesturestart', onGesture);
  target.addEventListener('gesturechange', onGesture);
  target.addEventListener('touchstart', onMultiTouch, { passive: false });
  target.addEventListener('touchmove', onMultiTouch, { passive: false });
  return () => {
    target.removeEventListener('gesturestart', onGesture);
    target.removeEventListener('gesturechange', onGesture);
    target.removeEventListener('touchstart', onMultiTouch);
    target.removeEventListener('touchmove', onMultiTouch);
  };
}
