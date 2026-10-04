import type { HostWindow, Scope } from '../scope';
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
/** 點下去要照常觸發 click 的元素（JS 的 closest() 用，不是 CSS 規則） */
const INTERACTIVE_SELECTOR = 'button, a, input, label, select, textarea';

/** 這一下和上一下合起來，會不會被 Safari 當成「點兩下放大」 */
export function isDoubleTap(previous: Tap | null, current: Tap): boolean {
    if (previous === null) return false;
    const elapsed = current.timeMs - previous.timeMs;
    return (
        elapsed >= 0 &&
        elapsed <= DOUBLE_TAP_MS &&
        distance(previous, current) <= DOUBLE_TAP_DISTANCE_PX
    );
}

function distance(
    a: { readonly x: number; readonly y: number },
    b: { readonly x: number; readonly y: number },
): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 畫面是不是已經被放大了。擋不住而被放大時，所有防縮放都要暫停，
 * 使用者才能用兩指或點兩下縮回來。
 */
function isZoomedIn(win: HostWindow): boolean {
    return (win.visualViewport?.scale ?? 1) > ZOOMED_SCALE;
}

/**
 * 遊戲掛載期間阻止兩指縮放與點兩下放大（整頁都有效）；destroy() 時移除。
 * iPad 的 Safari 不一定照 CSS touch-action 與 viewport 的 user-scalable=no 處理，所以用事件擋：
 * - gesturestart／gesturechange 是 Safari 專用的縮放手勢事件
 * - 兩根以上手指的 touchstart／touchmove 取消預設動作
 * - 點兩下：第二下的 touchend 取消預設動作。遊戲畫面另外由 holdTouches() 擋得更徹底。
 * 取消預設動作的監聽都必須是 passive: false。
 */
export function preventZoom(
    scope: Scope,
    doc: Document,
    win: HostWindow,
): void {
    const zoomed = (): boolean => isZoomedIn(win);
    const onGesture = (event: Event): void => {
        if (!zoomed()) event.preventDefault();
    };
    // 沒有觸控的瀏覽器（例如桌機的 Firefox）沒有 TouchEvent，也不會收到 touch 事件
    const TouchEventClass: typeof TouchEvent | undefined = win.TouchEvent;
    const touch = (handler: (event: TouchEvent) => void) => {
        return (event: Event): void => {
            if (
                TouchEventClass !== undefined &&
                event instanceof TouchEventClass
            )
                handler(event);
        };
    };

    // 單指按下的位置，用來分辨點擊與滑動；上一次點擊，用來判斷點兩下
    let pressedAt: { readonly x: number; readonly y: number } | null = null;
    let lastTap: Tap | null = null;

    const onTouchStart = touch((event) => {
        // 第二根手指一放上來就取消，縮放手勢根本不會開始
        if (event.touches.length > 1) {
            if (!zoomed()) event.preventDefault();
            pressedAt = null;
            return;
        }
        const first = event.touches[0];
        pressedAt =
            first === undefined ? null : { x: first.clientX, y: first.clientY };
    });

    const onTouchMove = touch((event) => {
        if (event.touches.length > 1 && !zoomed()) event.preventDefault();
    });

    const onTouchEnd = touch((event) => {
        const changed = event.changedTouches[0];
        const start = pressedAt;
        pressedAt = null;
        // 還有別的手指按著，或是滑動而不是點擊：不算一下
        if (changed === undefined || event.touches.length > 0 || start === null)
            return;
        const tap: Tap = {
            x: changed.clientX,
            y: changed.clientY,
            timeMs: event.timeStamp,
        };
        if (distance(start, tap) > TAP_SLOP_PX) {
            lastTap = null;
            return;
        }
        // 一直連點時每一下都和前一下比，第三下、第四下也擋得住
        const previous = lastTap;
        lastTap = tap;
        if (
            isDoubleTap(previous, tap) &&
            event.cancelable &&
            !isTextInput(event.target, win) &&
            !zoomed()
        ) {
            event.preventDefault();
        }
    });

    const active = { passive: false } as const;
    scope.listen(doc, 'gesturestart', onGesture, active);
    scope.listen(doc, 'gesturechange', onGesture, active);
    scope.listen(doc, 'touchstart', onTouchStart, active);
    scope.listen(doc, 'touchmove', onTouchMove, active);
    scope.listen(doc, 'touchend', onTouchEnd, active);
}

/**
 * 遊戲畫面（狀態列、迷宮舞台、題目列、方向鍵）：手指一按下就取消預設動作，
 * Safari 就不會把它當成點兩下放大、捲動或選字。
 * 迷宮與方向鍵都用 Pointer Events 操作，Pointer Events 在 touch 事件之前就送出，不受影響；
 * 按鈕除外，取消了就不會觸發 click。已經被放大時不擋，讓使用者縮回來。
 */
export function holdTouches(
    scope: Scope,
    win: HostWindow,
    element: HTMLElement,
): void {
    scope.listen(
        element,
        'touchstart',
        (event) => {
            const { target } = event;
            const onControl =
                target instanceof win.Element &&
                target.closest(INTERACTIVE_SELECTOR) !== null;
            if (!onControl && event.cancelable && !isZoomedIn(win))
                event.preventDefault();
        },
        { passive: false },
    );
}
