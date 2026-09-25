import type { Direction } from '../core/types';

/** 浮點數格座標 */
export interface TilePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * 由按點相對於玩家中心的向量（以格為單位）決定方向：取絕對值較大的軸（§7.3）。
 * 距離小於 deadZone 時回傳 null。兩軸一樣大時算水平。
 */
export function directionFromVector(dx: number, dy: number, deadZone: number): Direction | null {
  if (Math.hypot(dx, dy) < deadZone) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export interface PointerOptions {
  /** 螢幕座標 → 格座標，由 renderer 提供 */
  readonly screenToTile: (clientX: number, clientY: number) => TilePoint;
  /** 玩家中心的格座標；回傳 null 表示目前不接受操作 */
  readonly playerPosition: () => TilePoint | null;
  readonly deadZoneTiles: number;
}

export interface PointerHandlers {
  readonly onDirection: (direction: Direction) => void;
  /** 按下的位置，用來顯示漣漪 */
  readonly onPress: (clientX: number, clientY: number) => void;
}

/**
 * 滑鼠、觸控、觸控筆一律用 Pointer Events（§7.3）。
 * 按下時送出一次方向；按住拖曳時，每當算出的方向改變就再送一次。同一時間只追蹤一根手指。
 * 回傳解除監聽的函式。
 */
export function attachPointer(element: HTMLElement, options: PointerOptions, handlers: PointerHandlers): () => void {
  let activeId: number | null = null;
  let lastSent: Direction | null = null;

  const update = (event: PointerEvent): void => {
    const player = options.playerPosition();
    if (player === null) return;
    const point = options.screenToTile(event.clientX, event.clientY);
    const direction = directionFromVector(point.x - player.x, point.y - player.y, options.deadZoneTiles);
    if (direction !== null && direction !== lastSent) {
      lastSent = direction;
      handlers.onDirection(direction);
    }
  };

  const onDown = (event: PointerEvent): void => {
    if (activeId !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault(); // 不要選取文字、不要觸發捲動
    activeId = event.pointerId;
    lastSent = null;
    element.setPointerCapture(event.pointerId);
    handlers.onPress(event.clientX, event.clientY);
    update(event);
  };

  const onMove = (event: PointerEvent): void => {
    if (event.pointerId === activeId) update(event);
  };

  const onEnd = (event: PointerEvent): void => {
    if (event.pointerId !== activeId) return;
    activeId = null;
    lastSent = null;
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
