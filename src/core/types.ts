/** 跨模組共用的型別。題組相關的型別在 quiz.ts。 */

export type Direction = 'up' | 'down' | 'left' | 'right';

/** 可以被暫停的遊戲中狀態 */
export type PlayPhase =
  | { readonly kind: 'levelIntro'; readonly remainingMs: number }
  | { readonly kind: 'playing' }
  | { readonly kind: 'wrongFeedback'; readonly zoneId: string; readonly remainingMs: number }
  | { readonly kind: 'lifeLost'; readonly remainingMs: number }
  | { readonly kind: 'levelComplete'; readonly remainingMs: number };

export type Phase =
  | { readonly kind: 'loading'; readonly progress: number } // 0–1
  | { readonly kind: 'error'; readonly messages: readonly string[] }
  | { readonly kind: 'title' }
  | PlayPhase
  | { readonly kind: 'paused'; readonly resumeTo: PlayPhase }
  | { readonly kind: 'gameOver' }
  | { readonly kind: 'timeUp' }
  | { readonly kind: 'results' };

/**
 * 窮舉檢查：switch 的每個 case 都處理過之後，剩下的值型別是 never。
 * 之後替 union 新增成員卻忘了處理時，呼叫這個函式的地方會編譯失敗。
 */
export function assertNever(value: never): never {
  throw new Error(`未處理的值：${JSON.stringify(value)}`);
}
