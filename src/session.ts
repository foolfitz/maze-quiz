import type { GameEvent } from '@kancil-quiz/games-sdk';
import {
    createGame,
    DEFAULT_GAME_CONFIG,
    isEndPhase,
    pauseGame,
    resumeGame,
    startGame,
    steer,
    stepGame,
    type GameConfig,
    type GameState,
} from './core/game';
import type { TurnResult } from './core/player';
import { computeScore } from './core/scoring';
import type { Direction, GameOptions } from './core/types';
import { levelQuestion, type LevelSource } from './rounds';

/**
 * 一局遊戲：包住 core 的狀態機，把它的訊號轉成宿主的事件（docs/SPEC.md 7.2）。
 * 純邏輯，不碰 DOM，測試可以直接照劇本玩一局、檢查發出的事件。
 *
 * - started：開局時一次。
 * - answered：每次走進答案區一次（答錯時園區封住、繼續玩，所以同一題可能有好幾筆）。
 *   correct 只是遊戲自己的即時判定，正式成績由伺服器重新判定。
 * - completed：題目答完、命用完或倒數歸零時剛好一次。
 */
export interface Session {
    readonly state: GameState;
    readonly levels: readonly LevelSource[];
    /** 開局：發出 started，進入第 1 關的「預備」 */
    start(): void;
    /** 前進一步（固定 dtMs），並發出這一步產生的事件 */
    step(dtMs: number): void;
    steer(direction: Direction): TurnResult | null;
    pause(): void;
    resume(): void;
    /** 已經發出 completed */
    readonly completed: boolean;
}

export function createSession(
    levels: readonly LevelSource[],
    options: GameOptions,
    seed: number,
    emit: (event: GameEvent) => void,
    config: GameConfig = DEFAULT_GAME_CONFIG,
): Session {
    const state = createGame(levels.map(levelQuestion), options, seed, config);
    let started = false;
    let completed = false;

    /** 把狀態機累積的訊號依序轉成事件 */
    const flush = (): void => {
        for (const signal of state.outbox.splice(0)) {
            if (signal.kind === 'answered') {
                emit({
                    type: 'answered',
                    entryId: signal.questionId,
                    selected: [signal.choiceId],
                    correct: signal.correct,
                    durationMs: Math.round(signal.levelElapsedMs),
                });
            } else if (!completed) {
                completed = true;
                emit({
                    type: 'completed',
                    gameScore: computeScore(state.results),
                    // 遊戲時間，和狀態列的用時相同：不含「預備」、過關動畫與暫停
                    durationMs: Math.round(state.elapsedMs),
                });
            }
        }
    };

    return {
        state,
        levels,
        start() {
            if (started) return;
            started = true;
            emit({ type: 'started' });
            startGame(state);
            flush();
        },
        step(dtMs) {
            if (completed) return;
            stepGame(state, dtMs);
            flush();
        },
        steer: (direction) => steer(state, direction),
        pause() {
            if (!isEndPhase(state.phase)) pauseGame(state);
        },
        resume: () => resumeGame(state),
        get completed() {
            return completed;
        },
    };
}
