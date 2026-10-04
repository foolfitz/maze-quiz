import { Grid } from '../src/core/grid';
import { createRng } from '../src/core/rng';

/**
 * 用 ASCII 字串畫格子：# 是牆，. 是地板。
 * 地圖只有 # 與 . 兩種 ASCII 字元，不是要顯示的文字，所以逐格用 charAt() 讀就好；
 * 遊戲裡要顯示的文字一律用 @kancil-quiz/text 的 graphemes() 切（src/text/segments.ts）。
 */
export function gridFrom(rows: readonly string[]): Grid {
    const width = rows[0]?.length ?? 0;
    const grid = new Grid(width, rows.length);
    rows.forEach((row, y) => {
        for (let x = 0; x < width; x++) {
            grid.set({ x, y }, row.charAt(x) === '#' ? 'wall' : 'floor');
        }
    });
    return grid;
}

/** 宿主的 ctx.rng：回傳 [0, 1) 的可重現亂數 */
export function hostRng(seed: number): () => number {
    const rng = createRng(seed);
    return () => rng.next();
}
