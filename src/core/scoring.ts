import type { QuestionResult } from './types';

/** 遊戲自己的分數 = 一次就答對的題數（只供顯示，正式成績由伺服器判定） */
export function computeScore(results: readonly QuestionResult[]): number {
    return results.filter((result) => result.status === 'firstTry').length;
}
