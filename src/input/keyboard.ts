import type { Direction } from '../core/types';
import type { HostWindow, Scope } from '../scope';

/** 方向鍵與 WASD。用 event.code 判斷實體按鍵位置，不受輸入法與鍵盤配置影響。 */
const KEY_DIRECTIONS: Readonly<Partial<Record<string, Direction>>> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    KeyW: 'up',
    KeyS: 'down',
    KeyA: 'left',
    KeyD: 'right',
};

export interface KeyboardHandlers {
    readonly onDirection: (direction: Direction) => void;
    /** Esc 或 P：暫停或繼續 */
    readonly onPause: () => void;
    /** 現在是不是在玩；不在玩時方向鍵交給瀏覽器（例如宿主頁面的捲動） */
    readonly isPlaying: () => boolean;
}

/**
 * 監聽整個視窗的鍵盤，玩家不必先點一下遊戲畫面。監聽登記在 scope，destroy() 時移除。
 */
export function attachKeyboard(
    scope: Scope,
    win: HostWindow,
    handlers: KeyboardHandlers,
): void {
    scope.listen(win, 'keydown', (event) => {
        if (!(event instanceof win.KeyboardEvent)) return;
        // 保留瀏覽器快捷鍵；正在輸入文字時（例如宿主頁面上的輸入框）也不攔截
        if (
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            event.defaultPrevented ||
            isTextInput(event.target, win)
        )
            return;

        const direction = KEY_DIRECTIONS[event.code];
        if (direction !== undefined && handlers.isPlaying()) {
            event.preventDefault(); // 避免方向鍵捲動頁面
            // 按住時的自動重複不算新的指令
            if (!event.repeat) handlers.onDirection(direction);
            return;
        }
        if (
            (event.code === 'Escape' || event.code === 'KeyP') &&
            !event.repeat
        ) {
            handlers.onPause();
        }
    });
}

/** 事件目標是不是可以輸入文字的元素（input、textarea、select、contenteditable） */
export function isTextInput(
    target: EventTarget | null,
    win: HostWindow,
): boolean {
    return (
        target instanceof win.HTMLInputElement ||
        target instanceof win.HTMLTextAreaElement ||
        target instanceof win.HTMLSelectElement ||
        (target instanceof win.HTMLElement && target.isContentEditable)
    );
}
