import type { Direction } from '../core/types';
import type { HostWindow, Scope } from '../scope';

/** 浮點數格座標 */
export interface TilePoint {
    readonly x: number;
    readonly y: number;
}

/**
 * 由按點相對於玩家中心的向量（以格為單位）決定方向：取絕對值較大的軸。
 * 距離小於 deadZone 時回傳 null。兩軸一樣大時算水平。
 */
export function directionFromVector(
    dx: number,
    dy: number,
    deadZone: number,
): Direction | null {
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
 * 滑鼠、觸控、觸控筆一律用 Pointer Events。
 * 按下時送出一次方向；按住拖曳時，每當算出的方向改變就再送一次。同一時間只追蹤一根手指。
 */
export function attachPointer(
    scope: Scope,
    win: HostWindow,
    element: HTMLElement,
    options: PointerOptions,
    handlers: PointerHandlers,
): void {
    trackPointer(scope, win, element, {
        onStart: (event) => handlers.onPress(event.clientX, event.clientY),
        direction: (event) => {
            const player = options.playerPosition();
            if (player === null) return null;
            const point = options.screenToTile(event.clientX, event.clientY);
            return directionFromVector(
                point.x - player.x,
                point.y - player.y,
                options.deadZoneTiles,
            );
        },
        onDirection: handlers.onDirection,
        onEnd: () => undefined,
    });
}

export interface PointerTracking {
    readonly onStart: (event: PointerEvent) => void;
    /** 這個按點代表哪個方向；null 表示不算任何方向 */
    readonly direction: (event: PointerEvent) => Direction | null;
    readonly onDirection: (direction: Direction) => void;
    readonly onEnd: () => void;
}

/**
 * 迷宮舞台與觸控方向鍵共用：追蹤一根手指，方向改變時才送出，按住不放不會重複送出。
 * 監聽登記在 scope，destroy() 時移除。
 */
export function trackPointer(
    scope: Scope,
    win: HostWindow,
    element: HTMLElement,
    tracking: PointerTracking,
): void {
    let activeId: number | null = null;
    let lastSent: Direction | null = null;

    const update = (event: PointerEvent): void => {
        const direction = tracking.direction(event);
        if (direction !== null && direction !== lastSent) {
            lastSent = direction;
            tracking.onDirection(direction);
        }
    };

    const pointer = (handler: (event: PointerEvent) => void) => {
        return (event: Event): void => {
            if (event instanceof win.PointerEvent) handler(event);
        };
    };

    const onEnd = pointer((event) => {
        if (event.pointerId !== activeId) return;
        activeId = null;
        lastSent = null;
        tracking.onEnd();
    });

    scope.listen(
        element,
        'pointerdown',
        pointer((event) => {
            if (activeId !== null) return;
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            event.preventDefault(); // 不要選取文字、不要觸發捲動
            activeId = event.pointerId;
            lastSent = null;
            try {
                element.setPointerCapture(event.pointerId);
            } catch {
                // 指標已經不在了（例如很快就放開），照樣處理這一下
            }
            tracking.onStart(event);
            update(event);
        }),
    );
    scope.listen(
        element,
        'pointermove',
        pointer((event) => {
            if (event.pointerId === activeId) update(event);
        }),
    );
    scope.listen(element, 'pointerup', onEnd);
    scope.listen(element, 'pointercancel', onEnd);
    scope.listen(element, 'lostpointercapture', onEnd);
    // 長按選單
    scope.listen(element, 'contextmenu', (event) => event.preventDefault());
}
