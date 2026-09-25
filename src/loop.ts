/** 遊戲迴圈（§5.3）：requestAnimationFrame 驅動，邏輯以固定頻率步進，繪圖每幀一次 */

export interface LoopCallbacks {
  /** 邏輯更新，dtMs 固定為 1000 / stepHz */
  readonly update: (dtMs: number) => void;
  /** 繪圖，nowMs 是 requestAnimationFrame 給的時間 */
  readonly render: (nowMs: number) => void;
}

export interface Loop {
  stop(): void;
  /** 最近半秒的平均幀率 */
  fps(): number;
}

export function startLoop(callbacks: LoopCallbacks, stepHz: number, maxFrameMs: number): Loop {
  const stepMs = 1000 / stepHz;
  let lastTime: number | null = null;
  let accumulator = 0;
  let frameId = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsSince = 0;

  const frame = (now: number): void => {
    // 單幀 dt 上限：切回分頁時不要一次補跑太多步
    const dt = lastTime === null ? 0 : Math.min(now - lastTime, maxFrameMs);
    lastTime = now;
    accumulator += dt;
    while (accumulator >= stepMs) {
      callbacks.update(stepMs);
      accumulator -= stepMs;
    }
    callbacks.render(now);

    fpsFrames += 1;
    if (now - fpsSince >= 500) {
      fps = (fpsFrames * 1000) / (now - fpsSince);
      fpsFrames = 0;
      fpsSince = now;
    }
    frameId = requestAnimationFrame(frame);
  };
  frameId = requestAnimationFrame(frame);

  return {
    stop: () => cancelAnimationFrame(frameId),
    fps: () => fps,
  };
}
