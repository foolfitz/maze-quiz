/**
 * 掛載期間建立的所有資源（事件監聽、計時器、requestAnimationFrame、observer…）都登記在這裡，
 * destroy() 時一次清乾淨，不留下任何監聽或計時器（docs/SPEC.md 7.6）。
 */

/** document.defaultView 的型別：window 本身加上所有全域建構子（HTMLElement 等） */
export type HostWindow = Window & typeof globalThis;

export interface Scope {
    readonly disposed: boolean;
    /** 加上事件監聽；回傳的函式可以提早移除 */
    listen(
        target: EventTarget,
        type: string,
        handler: (event: Event) => void,
        options?: AddEventListenerOptions,
    ): () => void;
    /** setTimeout；回傳的函式可以提早取消 */
    timeout(callback: () => void, ms: number): () => void;
    /** requestAnimationFrame；回傳的函式可以提早取消 */
    frame(callback: (nowMs: number) => void): () => void;
    /** 其他要在銷毀時執行的清理工作 */
    add(cleanup: () => void): () => void;
    /** 子範圍：可以單獨清理（例如換掉覆蓋層的內容時），父範圍清理時也會一起清理 */
    child(): Scope;
    /** 依登記的相反順序清理；可以重複呼叫 */
    dispose(): void;
}

export function createScope(win: HostWindow): Scope {
    const cleanups = new Set<() => void>();
    let disposed = false;

    /** 登記一個清理工作；回傳的函式會執行並取消登記 */
    const add = (cleanup: () => void): (() => void) => {
        if (disposed) {
            cleanup();
            return () => undefined;
        }
        let done = false;
        const run = (): void => {
            if (done) return;
            done = true;
            cleanups.delete(run);
            cleanup();
        };
        cleanups.add(run);
        return run;
    };

    return {
        get disposed() {
            return disposed;
        },
        listen(target, type, handler, options) {
            if (disposed) return () => undefined;
            target.addEventListener(type, handler, options);
            return add(() =>
                target.removeEventListener(type, handler, options),
            );
        },
        timeout(callback, ms) {
            if (disposed) return () => undefined;
            let cancel = (): void => undefined;
            const id = win.setTimeout(() => {
                cancel();
                callback();
            }, ms);
            cancel = add(() => win.clearTimeout(id));
            return cancel;
        },
        frame(callback) {
            if (disposed) return () => undefined;
            let cancel = (): void => undefined;
            const id = win.requestAnimationFrame((nowMs) => {
                cancel();
                callback(nowMs);
            });
            cancel = add(() => win.cancelAnimationFrame(id));
            return cancel;
        },
        add,
        child() {
            const sub = createScope(win);
            // 子範圍先清理時，順便從父範圍取消登記；父範圍清理時會清理子範圍
            sub.add(add(() => sub.dispose()));
            return sub;
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const cleanup of [...cleanups].reverse()) cleanup();
            cleanups.clear();
        },
    };
}
