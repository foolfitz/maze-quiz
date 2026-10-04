import type { GameEvent, Round } from '@kancil-quiz/games-sdk';
import { describe, expect, it } from 'vite-plus/test';
import {
    DEFAULT_GAME_CONFIG,
    debugLoseLife,
    levelMaze,
    type GameConfig,
} from '../src/core/game';
import { opposite } from '../src/core/grid';
import { meta, type MazeQuizOptions } from '../src/meta';
import { roundsToLevels } from '../src/rounds';
import { createSession, type Session } from '../src/session';

const STEP_MS = 1000 / 60;
const { timing } = DEFAULT_GAME_CONFIG;

/** 照劇本玩的時候不放敵人，免得途中被撞到 */
const NO_ENEMIES: GameConfig = {
    ...DEFAULT_GAME_CONFIG,
    difficulties: {
        1: { ...DEFAULT_GAME_CONFIG.difficulties[1], enemyCount: 0 },
        2: { ...DEFAULT_GAME_CONFIG.difficulties[2], enemyCount: 0 },
        3: { ...DEFAULT_GAME_CONFIG.difficulties[3], enemyCount: 0 },
    },
};

const rounds: Round[] = [
    {
        shape: 'mcq',
        entryId: '01M3ZYQ6WGT6CYY66DFAY06R1D',
        prompt: { text: '「謝謝」的越南語是？' },
        options: [
            { id: 'a', face: { text: 'Cảm ơn' }, correct: true },
            { id: 'b', face: { text: 'Xin chào' }, correct: false },
            { id: 'c', face: { text: 'Tạm biệt' }, correct: false },
        ],
    },
    {
        shape: 'mcq',
        entryId: '01M3ZYQ7VR1MB2JNFJZHR8GM5J',
        prompt: { text: '「對不起」的越南語是？' },
        options: [
            { id: 'a', face: { text: 'Không có gì' }, correct: false },
            { id: 'b', face: { text: 'Xin lỗi' }, correct: true },
            { id: 'c', face: { text: 'Cảm ơn' }, correct: false },
            { id: 'd', face: { text: 'Tạm biệt' }, correct: false },
        ],
    },
];

function play(
    options: Partial<MazeQuizOptions> = {},
    config: GameConfig = NO_ENEMIES,
    gameRounds: readonly Round[] = rounds,
): { session: Session; events: GameEvent[] } {
    const events: GameEvent[] = [];
    const session = createSession(
        roundsToLevels(gameRounds),
        { ...meta.defaultOptions, ...options },
        1234,
        (event) => events.push(event),
        config,
    );
    return { session, events };
}

function run(session: Session, durationMs: number): void {
    const steps = Math.round(durationMs / STEP_MS);
    for (let i = 0; i < steps; i++) session.step(STEP_MS);
}

/** 把玩家放到選項 optionId 的園區門外，往門走進去，直到狀態改變 */
function walkInto(session: Session, optionId: string): void {
    const { level } = session.state;
    if (level === null) throw new Error('目前沒有關卡');
    const maze = levelMaze(level);
    const zone = maze.zones.find(
        (z) => level.question.choices[z.choiceIndex]?.id === optionId,
    );
    if (zone === undefined) throw new Error(`找不到選項 ${optionId}`);
    Object.assign(level.player, {
        x: zone.outside.x,
        y: zone.outside.y,
        dir: null,
    });
    session.steer(opposite(zone.doorSide));
    for (let i = 0; i < 120 && session.state.phase.kind === 'playing'; i++)
        session.step(STEP_MS);
}

describe('照劇本玩一局：發出的事件', () => {
    it('started → 每次走進答案區一筆 answered → completed', () => {
        const { session, events } = play();
        expect(events).toEqual([]);
        session.start();
        expect(events).toEqual([{ type: 'started' }]);

        // 第 1 關：先答錯 b（園區封住、繼續玩），再答對 a
        run(session, timing.levelIntroMs + 500);
        walkInto(session, 'b');
        run(session, timing.wrongFeedbackMs + STEP_MS);
        walkInto(session, 'a');
        run(
            session,
            timing.levelCompleteMs + timing.levelIntroMs + STEP_MS * 2,
        );

        // 第 2 關：一次答對
        walkInto(session, 'b');
        run(session, timing.levelCompleteMs + STEP_MS);

        expect(events.map((e) => e.type)).toEqual([
            'started',
            'answered',
            'answered',
            'answered',
            'completed',
        ]);
        const [, wrong, right, second, completed] = events;
        expect(wrong).toMatchObject({
            type: 'answered',
            entryId: '01M3ZYQ6WGT6CYY66DFAY06R1D',
            selected: ['b'],
            correct: false,
        });
        expect(right).toMatchObject({
            type: 'answered',
            entryId: '01M3ZYQ6WGT6CYY66DFAY06R1D',
            selected: ['a'],
            correct: true,
        });
        expect(second).toMatchObject({
            type: 'answered',
            entryId: '01M3ZYQ7VR1MB2JNFJZHR8GM5J',
            selected: ['b'],
            correct: true,
        });
        // 作答時間從那一關開始算（不含「預備」），是整數毫秒；同一關的第二筆比第一筆長
        for (const event of [wrong, right, second]) {
            if (event?.type !== 'answered') throw new Error('不是 answered');
            expect(Number.isInteger(event.durationMs)).toBe(true);
        }
        if (wrong?.type === 'answered' && right?.type === 'answered') {
            expect(wrong.durationMs).toBeGreaterThanOrEqual(500);
            expect(wrong.durationMs).toBeLessThan(1500);
            expect(right.durationMs).toBeGreaterThan(
                wrong.durationMs + timing.wrongFeedbackMs,
            );
        }
        // 遊戲自己的分數 = 一次答對的題數（第 1 題答錯過，第 2 題一次答對）
        expect(completed).toEqual({
            type: 'completed',
            gameScore: 1,
            durationMs: Math.round(session.state.elapsedMs),
        });
        expect(session.completed).toBe(true);

        // completed 之後不再有任何事件
        run(session, 5000);
        session.pause();
        session.resume();
        expect(events).toHaveLength(5);
    });

    it('暫停期間不發出事件，也不計時', () => {
        const { session, events } = play();
        session.start();
        run(session, timing.levelIntroMs + 100);
        session.pause();
        const elapsed = session.state.elapsedMs;
        run(session, 5000);
        expect(session.state.elapsedMs).toBe(elapsed);
        expect(events).toEqual([{ type: 'started' }]);
        session.resume();
        expect(session.state.phase.kind).toBe('playing');
    });

    it('命用完：completed 只發一次，分數是答對過的題數', () => {
        const { session, events } = play({ lives: 1 });
        session.start();
        run(session, timing.levelIntroMs + STEP_MS);
        debugLoseLife(session.state);
        run(session, timing.lifeLostMs + STEP_MS * 2);
        expect(session.state.phase.kind).toBe('gameOver');
        run(session, 1000);
        expect(events.filter((e) => e.type === 'completed')).toEqual([
            {
                type: 'completed',
                gameScore: 0,
                durationMs: Math.round(session.state.elapsedMs),
            },
        ]);
    });

    it('倒數歸零：completed 的 durationMs 就是倒數的長度', () => {
        const { session, events } = play({
            timerMode: 'countDown',
            countDownSeconds: 30,
        });
        session.start();
        run(session, timing.levelIntroMs + 31_000);
        expect(session.state.phase.kind).toBe('timeUp');
        expect(events.map((e) => e.type)).toEqual(['started', 'completed']);
        expect(events[1]).toEqual({
            type: 'completed',
            gameScore: 0,
            durationMs: 30_000,
        });
    });

    it('沒有可以玩的題目：started 之後立刻 completed', () => {
        const { session, events } = play({}, NO_ENEMIES, []);
        session.start();
        session.start(); // 重複呼叫不會再發一次
        expect(events).toEqual([
            { type: 'started' },
            { type: 'completed', gameScore: 0, durationMs: 0 },
        ]);
    });

    it('同一個種子、同樣的操作，事件完全相同（可重現）', () => {
        const once = (): GameEvent[] => {
            const { session, events } = play({}, DEFAULT_GAME_CONFIG);
            session.start();
            run(session, timing.levelIntroMs);
            for (const direction of ['left', 'up', 'right', 'down'] as const) {
                session.steer(direction);
                run(session, 2000);
            }
            return events;
        };
        expect(once()).toEqual(once());
    });
});
