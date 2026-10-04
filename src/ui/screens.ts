import type { EndPhase } from '../core/types';
import { DPAD_SIDES, type DpadSide } from '../storage/preferences';
import type { Dom } from './dom';
import { STRINGS } from './strings';

/** 疊在遊戲畫面上的覆蓋層。每次呼叫都會替換掉 root 裡原本的內容。 */

function showCard(
    dom: Dom,
    root: HTMLElement,
    children: readonly Node[],
): void {
    root.replaceChildren(
        dom.el('div', { className: 'kq-maze-card', children }),
    );
    root.hidden = false;
}

export interface PausedHandlers {
    readonly onResume: () => void;
    /** 觸控方向鍵的位置：放在暫停畫面，因為宿主負責的開始畫面沒有這個設定 */
    readonly dpadSide: DpadSide;
    readonly onDpadSideChange: (side: DpadSide) => void;
}

/** 暫停：半透明覆蓋層，「繼續」與觸控方向鍵的位置 */
export function showPaused(
    dom: Dom,
    root: HTMLElement,
    handlers: PausedHandlers,
): void {
    const resume = dom.button(STRINGS.resume, handlers.onResume, 'primary');
    showCard(dom, root, [
        dom.el('h2', {
            className: 'kq-maze-card-title',
            text: STRINGS.pausedTitle,
        }),
        dom.el('div', { className: 'kq-maze-actions', children: [resume] }),
        dpadSetting(dom, handlers),
    ]);
    resume.focus({ preventScroll: true });
}

/** 同一頁可能掛載好幾次，id 加上流水號才不會重複 */
let settingCount = 0;

/** 觸控方向鍵的位置：左邊、右邊、不顯示，三個並排的單選選項 */
function dpadSetting(dom: Dom, handlers: PausedHandlers): HTMLElement {
    settingCount += 1;
    const labelId = `kq-maze-dpad-${settingCount}`;
    const choices = DPAD_SIDES.map((side) => {
        const input = dom.el('input', {
            attrs: { type: 'radio', name: labelId, value: side },
        });
        input.checked = side === handlers.dpadSide;
        dom.on(input, 'change', () => {
            if (input.checked) handlers.onDpadSideChange(side);
        });
        // 看得到的是選項後面的文字；選取狀態由 CSS 的 input:checked + span 顯示
        return dom.el('label', {
            children: [
                input,
                dom.el('span', { text: STRINGS.dpadSides[side] }),
            ],
        });
    });
    return dom.el('div', {
        className: 'kq-maze-setting',
        children: [
            dom.el('span', {
                className: 'kq-maze-setting-label',
                text: STRINGS.dpadSetting,
                attrs: { id: labelId },
            }),
            dom.el('div', {
                className: 'kq-maze-segmented',
                attrs: { role: 'radiogroup', 'aria-labelledby': labelId },
                children: choices,
            }),
        ],
    });
}

/**
 * 遊戲結束：只顯示中性的結束訊息，沒有按鈕。
 * 宿主收到 completed 事件後會換成自己的成績畫面。
 */
export function showEnded(dom: Dom, root: HTMLElement, phase: EndPhase): void {
    showCard(dom, root, [
        dom.el('h2', {
            className: 'kq-maze-card-title',
            text: STRINGS.ended[phase.kind],
        }),
    ]);
}
