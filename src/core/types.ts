/** 跨模組共用的型別。core/ 是純邏輯，不碰 DOM，所有隨機性都來自注入的 Rng。 */

import type { MazeQuizOptions } from '../meta';

export type { Difficulty, TimerMode } from '../meta';

export type Direction = 'up' | 'down' | 'left' | 'right';

/** 遊戲設定（老師在活動設定裡選的） */
export type GameOptions = MazeQuizOptions;

/** 一題（一關）：遊戲只需要題目代號與每個選項的代號、對錯 */
export interface Question {
    readonly id: string; // Round 的 entryId
    readonly choices: readonly Choice[]; // 2–6 個
}

export interface Choice {
    readonly id: string; // 選項 id
    readonly correct: boolean; // 一題可以有多個正確選項
}

/** 可以被暫停的遊戲中狀態 */
export type PlayPhase =
    | { readonly kind: 'levelIntro'; readonly remainingMs: number }
    | { readonly kind: 'playing' }
    | {
          readonly kind: 'wrongFeedback';
          readonly zoneId: string;
          readonly remainingMs: number;
      }
    | { readonly kind: 'lifeLost'; readonly remainingMs: number }
    | { readonly kind: 'levelComplete'; readonly remainingMs: number };

/** 遊戲結束的三種方式 */
export type EndPhase =
    | { readonly kind: 'gameOver' } // 命用完
    | { readonly kind: 'timeUp' } // 倒數歸零
    | { readonly kind: 'finished' }; // 所有題目都答完

export type Phase =
    | { readonly kind: 'idle' } // 建立後還沒開始
    | PlayPhase
    | { readonly kind: 'paused'; readonly resumeTo: PlayPhase }
    | EndPhase;

/**
 * 窮舉檢查：switch 的每個 case 都處理過之後，剩下的值型別是 never。
 * 之後替 union 新增成員卻忘了處理時，呼叫這個函式的地方會編譯失敗。
 */
export function assertNever(value: never): never {
    throw new Error(`未處理的值：${JSON.stringify(value)}`);
}

/** 逐題結果 */
export type QuestionStatus = 'firstTry' | 'retry' | 'unanswered';

export interface QuestionResult {
    readonly questionId: string;
    readonly status: QuestionStatus;
    readonly wrongChoiceIds: readonly string[]; // 依答錯的先後順序
}
