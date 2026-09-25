import type { Direction } from '../core/types';
import { directionFromVector } from './pointer';

export interface DpadHandlers {
  readonly onDirection: (direction: Direction) => void;
}

/** 方向鍵中央不算任何方向的範圍，佔方向鍵寬度的比例 */
const DEAD_ZONE_RATIO = 0.12;

/**
 * 螢幕上的觸控方向鍵（規格外，試玩回饋加的）。整組當成一個搖桿：
 * 依按點相對於方向鍵中心的位置決定方向（取偏得比較多的那一軸），
 * 手指按住滑到另一個方向時再送一次，不用放開手指。按住不放不會重複送出，和鍵盤一樣。
 * 目前按著的方向寫在 data-active，由 CSS 顯示成按下去的樣子。回傳解除監聽的函式。
 */
export function attachDpad(element: HTMLElement, handlers: DpadHandlers): () => void {
  let activeId: number | null = null;
  let lastSent: Direction | null = null;

  const setActive = (direction: Direction | null): void => {
    if (direction === null) delete element.dataset.active;
    else element.dataset.active = direction;
  };

  const update = (event: PointerEvent): void => {
    const rect = element.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const direction = directionFromVector(dx, dy, rect.width * DEAD_ZONE_RATIO);
    if (direction !== null && direction !== lastSent) {
      lastSent = direction;
      setActive(direction);
      handlers.onDirection(direction);
    }
  };

  const onDown = (event: PointerEvent): void => {
    if (activeId !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    activeId = event.pointerId;
    lastSent = null;
    element.setPointerCapture(event.pointerId);
    update(event);
  };

  const onMove = (event: PointerEvent): void => {
    if (event.pointerId === activeId) update(event);
  };

  const onEnd = (event: PointerEvent): void => {
    if (event.pointerId !== activeId) return;
    activeId = null;
    lastSent = null;
    setActive(null);
  };

  // 長按選單
  const onContextMenu = (event: Event): void => event.preventDefault();

  element.addEventListener('pointerdown', onDown);
  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerup', onEnd);
  element.addEventListener('pointercancel', onEnd);
  element.addEventListener('lostpointercapture', onEnd);
  element.addEventListener('contextmenu', onContextMenu);
  return () => {
    element.removeEventListener('pointerdown', onDown);
    element.removeEventListener('pointermove', onMove);
    element.removeEventListener('pointerup', onEnd);
    element.removeEventListener('pointercancel', onEnd);
    element.removeEventListener('lostpointercapture', onEnd);
    element.removeEventListener('contextmenu', onContextMenu);
  };
}
