import type { GameEvent } from '@kancil-quiz/games-sdk';

/**
 * 示範頁的成績：每題以第一次作答計算（答錯後再走進正確的園區，仍算答錯），與平台相同。
 * 平台是由伺服器重新判定；示範頁沒有伺服器，直接採用遊戲回報的 correct。
 */
export class FirstAnswers {
    private readonly answers = new Map<string, boolean>();

    record(event: GameEvent): void {
        if (event.type === 'answered' && !this.answers.has(event.entryId))
            this.answers.set(event.entryId, event.correct);
    }

    /** 答對的題數；沒有作答的題目不算 */
    get correct(): number {
        return [...this.answers.values()].filter(Boolean).length;
    }
}
