import type { Direction } from '../core/types';

/** 方向鍵與 WASD（§7.3）。用 event.code 判斷實體按鍵位置，不受輸入法與鍵盤配置影響。 */
const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
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
  /** 現在是不是在玩；不在玩時方向鍵交給瀏覽器，例如捲動很長的結算與逐題回顧 */
  readonly isPlaying: () => boolean;
}

/** 開始監聽鍵盤，回傳解除監聽的函式 */
export function attachKeyboard(target: Window, handlers: KeyboardHandlers): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    // 保留瀏覽器快捷鍵；正在輸入文字時（例如排行榜的名字）也不攔截
    if (event.ctrlKey || event.metaKey || event.altKey || isTextInput(event.target)) return;

    const direction = KEY_DIRECTIONS[event.code];
    if (direction !== undefined && handlers.isPlaying()) {
      event.preventDefault(); // 避免方向鍵捲動頁面
      // 按住時的自動重複不算新的指令
      if (!event.repeat) handlers.onDirection(direction);
      return;
    }
    if ((event.code === 'Escape' || event.code === 'KeyP') && !event.repeat) {
      handlers.onPause();
    }
  };

  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}

/** 事件目標是不是可以輸入文字的元素（input、textarea、contenteditable） */
export function isTextInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
