import type { Scope } from './scope';

/** 遊戲迴圈：requestAnimationFrame 驅動，邏輯以固定頻率步進（accumulator 模式），繪圖每幀一次 */

export interface LoopCallbacks {
    /** 邏輯更新，dtMs 固定為 1000 / stepHz */
    readonly update: (dtMs: number) => void;
    /** 繪圖，nowMs 是 requestAnimationFrame 給的時間 */
    readonly render: (nowMs: number) => void;
}

export interface Loop {
    /** 停止迴圈；在 update 或 render 裡呼叫時，這一幀照樣畫完，但不再排下一幀 */
    stop(): void;
    readonly running: boolean;
}

/** 每一幀都登記在 scope，destroy() 時一定會被取消 */
export function startLoop(
    scope: Scope,
    callbacks: LoopCallbacks,
    stepHz: number,
    maxFrameMs: number,
): Loop {
    const stepMs = 1000 / stepHz;
    let lastTime: number | null = null;
    let accumulator = 0;
    let stopped = false;
    let cancelFrame: (() => void) | null = null;

    const frame = (now: number): void => {
        cancelFrame = null;
        // 單幀 dt 上限：切回分頁時不要一次補跑太多步
        const dt = lastTime === null ? 0 : Math.min(now - lastTime, maxFrameMs);
        lastTime = now;
        accumulator += dt;
        while (accumulator >= stepMs && !stopped) {
            callbacks.update(stepMs);
            accumulator -= stepMs;
        }
        callbacks.render(now);
        if (!stopped) cancelFrame = scope.frame(frame);
    };
    cancelFrame = scope.frame(frame);

    return {
        stop() {
            stopped = true;
            cancelFrame?.();
            cancelFrame = null;
        },
        get running() {
            return !stopped;
        },
    };
}
