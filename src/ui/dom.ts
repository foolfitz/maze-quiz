import type { Scope } from '../scope';

/** 建立 DOM 元素的小工具；元素一律用掛載點所在的 document 建立 */

export interface ElementOptions {
    readonly className?: string;
    readonly text?: string;
    readonly attrs?: Readonly<Record<string, string>>;
    readonly children?: readonly Node[];
}

export interface Dom {
    readonly doc: Document;
    /**
     * 泛型 K 限定為 HTML 標籤名稱，回傳型別會跟著標籤變：
     * el('button') 的型別是 HTMLButtonElement，el('img') 是 HTMLImageElement。
     */
    el<K extends keyof HTMLElementTagNameMap>(
        tag: K,
        options?: ElementOptions,
    ): HTMLElementTagNameMap[K];
    /** 按鈕；點擊的監聽登記在 scope */
    button(
        label: string,
        onClick: () => void,
        variant?: 'primary' | 'secondary',
    ): HTMLButtonElement;
    /** 只有圖示的按鈕（例如暫停）；label 給螢幕閱讀器 */
    iconButton(
        label: string,
        icon: SVGSVGElement,
        onClick: () => void,
    ): HTMLButtonElement;
    /** 加上事件監聽，登記在 scope */
    on(
        target: EventTarget,
        type: string,
        handler: (event: Event) => void,
    ): void;
    /** 簡單的 SVG 圖示：viewBox 0 0 10 10，形狀用 path 的 d 屬性描述 */
    icon(paths: readonly string[]): SVGSVGElement;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createDom(doc: Document, scope: Scope): Dom {
    const el = <K extends keyof HTMLElementTagNameMap>(
        tag: K,
        options: ElementOptions = {},
    ): HTMLElementTagNameMap[K] => {
        const element = doc.createElement(tag);
        if (options.className !== undefined)
            element.className = options.className;
        if (options.text !== undefined) element.textContent = options.text;
        for (const [name, value] of Object.entries(options.attrs ?? {})) {
            element.setAttribute(name, value);
        }
        element.append(...(options.children ?? []));
        return element;
    };

    return {
        doc,
        el,
        button(label, onClick, variant = 'secondary') {
            const element = el('button', {
                className: `kq-maze-btn kq-maze-btn-${variant}`,
                text: label,
                attrs: { type: 'button' },
            });
            scope.listen(element, 'click', onClick);
            return element;
        },
        iconButton(label, icon, onClick) {
            const element = el('button', {
                className: 'kq-maze-icon-btn',
                attrs: { type: 'button', 'aria-label': label, title: label },
                children: [icon],
            });
            scope.listen(element, 'click', onClick);
            return element;
        },
        on(target, type, handler) {
            scope.listen(target, type, handler);
        },
        icon(paths) {
            // 圖示用 SVG，不用 ⏸ ▶ 之類的字元：iPad 會把它們顯示成彩色 emoji
            const svg = doc.createElementNS(SVG_NS, 'svg');
            svg.setAttribute('viewBox', '0 0 10 10');
            svg.setAttribute('aria-hidden', 'true');
            svg.setAttribute('focusable', 'false');
            for (const d of paths) {
                const path = doc.createElementNS(SVG_NS, 'path');
                path.setAttribute('d', d);
                svg.append(path);
            }
            return svg;
        },
    };
}

/** 圖示的形狀 */
export const ICONS = {
    pause: ['M2 1.5h2.2v7H2z', 'M5.8 1.5H8v7H5.8z'],
    /** 喇叭與聲波 */
    speaker: [
        'M1 3.6h1.9L5.4 1.5v7L2.9 6.4H1z',
        'M6.6 3.2a2.2 2.2 0 0 1 0 3.6l-.5-.6a1.4 1.4 0 0 0 0-2.4z',
        'M7.7 1.9a4 4 0 0 1 0 6.2l-.5-.6a3.2 3.2 0 0 0 0-5z',
    ],
    /** 方向鍵的三角形（朝上；其他方向用 CSS 旋轉） */
    arrow: ['M5 1.5 9 8H1z'],
} as const;
