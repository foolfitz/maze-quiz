/**
 * 阻止兩指縮放（§7.4）。主要靠 CSS 的 touch-action；
 * iPad 的 Safari 不一定照 touch-action 處理縮放手勢，所以再用事件擋一次：
 * - gesturestart／gesturechange 是 Safari 專用的縮放手勢事件
 * - 兩根以上手指的 touchmove 取消預設動作（必須是 passive: false 才能取消）
 * 回傳解除監聽的函式。
 */
export function preventPinchZoom(target: Document): () => void {
  const onGesture = (event: Event): void => event.preventDefault();
  const onTouchMove = (event: TouchEvent): void => {
    if (event.touches.length > 1) event.preventDefault();
  };

  target.addEventListener('gesturestart', onGesture);
  target.addEventListener('gesturechange', onGesture);
  target.addEventListener('touchmove', onTouchMove, { passive: false });
  return () => {
    target.removeEventListener('gesturestart', onGesture);
    target.removeEventListener('gesturechange', onGesture);
    target.removeEventListener('touchmove', onTouchMove);
  };
}
