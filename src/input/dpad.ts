import type { Direction } from '../core/types';
import type { HostWindow, Scope } from '../scope';
import { directionFromVector, trackPointer } from './pointer';

/** 方向鍵中央不算任何方向的範圍，佔方向鍵寬度的比例 */
const DEAD_ZONE_RATIO = 0.12;

/**
 * 螢幕上的觸控方向鍵。整組當成一個搖桿：
 * 依按點相對於方向鍵中心的位置決定方向（取偏得比較多的那一軸），
 * 手指按住滑到另一個方向時再送一次，不用放開手指。按住不放不會重複送出，和鍵盤一樣。
 * 目前按著的方向寫在 data-active，由 CSS 顯示成按下去的樣子。
 */
export function attachDpad(
    scope: Scope,
    win: HostWindow,
    element: HTMLElement,
    onDirection: (direction: Direction) => void,
): void {
    trackPointer(scope, win, element, {
        onStart: () => undefined,
        direction: (event) => {
            const rect = element.getBoundingClientRect();
            const dx = event.clientX - (rect.left + rect.width / 2);
            const dy = event.clientY - (rect.top + rect.height / 2);
            return directionFromVector(dx, dy, rect.width * DEAD_ZONE_RATIO);
        },
        onDirection: (direction) => {
            element.dataset.active = direction;
            onDirection(direction);
        },
        onEnd: () => {
            delete element.dataset.active;
        },
    });
}
