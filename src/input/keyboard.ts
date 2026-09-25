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
  /** Esc 或 P；M6 才接上暫停 */
  readonly onPause?: () => void;
}

/** 開始監聽鍵盤，回傳解除監聽的函式 */
export function attachKeyboard(target: Window, handlers: KeyboardHandlers): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    // 保留瀏覽器快捷鍵；正在輸入文字時（例如排行榜的名字）也不攔截
    if (event.ctrlKey || event.metaKey || event.altKey || isTextInput(event.target)) return;

    const direction = KEY_DIRECTIONS[event.code];
    if (direction !== undefined) {
      event.preventDefault(); // 避免方向鍵捲動頁面
      // 按住時的自動重複不算新的指令
      if (!event.repeat) handlers.onDirection(direction);
      return;
    }
    if ((event.code === 'Escape' || event.code === 'KeyP') && !event.repeat) {
      handlers.onPause?.();
    }
  };

  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}

function isTextInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
