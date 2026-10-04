import type { Face, Round } from '@kancil-quiz/games-sdk';
import type { Question } from './core/types';

/** 一個答案區最多、最少放幾個選項（迷宮的園區配置只有 2–6 個） */
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

export interface LevelOption {
    readonly id: string;
    readonly face: Face;
    readonly correct: boolean;
}

/** 一關：一個 mcq Round。題目面顯示在題目列，選項面顯示在答案區 */
export interface LevelSource {
    readonly entryId: string;
    readonly prompt: Face;
    readonly options: readonly LevelOption[];
}

type McqRound = Extract<Round, { shape: 'mcq' }>;

/**
 * 宿主給的 rounds → 關卡，一個 Round 就是一關，順序不變（宿主已經決定出題順序，這裡不再打亂）。
 * 宿主照理已經依 requires 檢查過相容性；萬一混進遊戲沒辦法玩的題目
 * （不是 mcq、選項不是 2–6 個、沒有正確選項），就略過那一題，不讓遊戲當掉。
 */
export function roundsToLevels(rounds: readonly Round[]): LevelSource[] {
    return rounds.filter(isPlayable).map((round) => ({
        entryId: round.entryId,
        prompt: round.prompt,
        options: round.options.map((option) => ({
            id: option.id,
            face: option.face,
            correct: option.correct,
        })),
    }));
}

function isPlayable(round: Round): round is McqRound {
    return (
        round.shape === 'mcq' &&
        round.options.length >= MIN_OPTIONS &&
        round.options.length <= MAX_OPTIONS &&
        round.options.some((option) => option.correct)
    );
}

/** 狀態機只需要題目與選項的代號、對錯 */
export function levelQuestion(level: LevelSource): Question {
    return {
        id: level.entryId,
        choices: level.options.map((option) => ({
            id: option.id,
            correct: option.correct,
        })),
    };
}
