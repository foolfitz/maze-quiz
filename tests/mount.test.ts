import type { GameContext, GameEvent, Round } from '@kancil-quiz/games-sdk';
import { describe, expect, it } from 'vite-plus/test';
import mazeQuiz from '../src';
import { meta, type MazeQuizOptions } from '../src/meta';
import {
    createFakeEnvironment,
    FakeKeyboardEvent,
    FakePointerEvent,
    type FakeEnvironment,
} from './fakeDom';
import { hostRng } from './helpers';

const PROMPT_AUDIO = 'https://media.example.test/a/prompt.m4a';

const rounds: Round[] = [
    {
        shape: 'mcq',
        entryId: '01M3ZYQ6WGT6CYY66DFAY06R1D',
        prompt: {
            text: '「香蕉」的越南語是？',
            image: 'https://media.example.test/a/prompt.webp',
            audio: PROMPT_AUDIO,
        },
        options: [
            {
                id: 'a',
                face: {
                    text: 'Chuối',
                    image: 'https://media.example.test/a/1.webp',
                },
                correct: true,
            },
            // 圖片載入失敗：改用文字顯示，不中斷遊戲
            {
                id: 'b',
                face: { image: 'https://media.example.test/broken.webp' },
                correct: false,
            },
            { id: 'c', face: { text: 'Xoài' }, correct: false },
        ],
    },
    {
        shape: 'mcq',
        entryId: '01M3ZYQ7VR1MB2JNFJZHR8GM5J',
        prompt: { text: '「謝謝」的越南語是？' },
        options: [
            { id: 'a', face: { text: 'Cảm ơn' }, correct: true },
            { id: 'b', face: { text: 'Xin chào' }, correct: false },
        ],
    },
];

interface Harness {
    readonly ctx: GameContext<MazeQuizOptions>;
    readonly events: GameEvent[];
    readonly played: string[];
    readonly stopAll: { count: number };
}

function harness(
    options: Partial<MazeQuizOptions> = {},
    gameRounds: Round[] = rounds,
): Harness {
    const events: GameEvent[] = [];
    const played: string[] = [];
    const stopAll = { count: 0 };
    return {
        events,
        played,
        stopAll,
        ctx: {
            rounds: gameRounds,
            options: { ...meta.defaultOptions, ...options },
            language: 'vi',
            uiLocale: 'zh-TW',
            rng: hostRng(42),
            audio: {
                play: (url) => {
                    played.push(url);
                    return Promise.resolve();
                },
                stopAll: () => {
                    stopAll.count += 1;
                },
            },
            emit: (event) => events.push(event),
        },
    };
}

/** destroy() 之後：沒有監聽、計時器、requestAnimationFrame、ResizeObserver，掛載點也清空 */
function expectClean(env: FakeEnvironment, host: HTMLElement): void {
    expect(env.listenerCount()).toBe(0);
    expect(env.pendingTimers()).toBe(0);
    expect(env.pendingFrames()).toBe(0);
    expect(env.activeObservers()).toBe(0);
    expect(env.findAll(host, 'kq-maze')).toEqual([]);
}

/** 讓 decode()、字型載入等 promise 有機會完成 */
async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('mount() 與 destroy()（假的 DOM）', () => {
    it('掛載後立刻開始；destroy() 之後不留下任何監聽、計時器或 requestAnimationFrame', async () => {
        const env = createFakeEnvironment();
        const host = env.createHost();
        const { ctx, events, played, stopAll } = harness();

        // 掛載前不播放任何聲音
        expect(played).toEqual([]);
        const instance = mazeQuiz.mount(host, ctx);

        expect(events).toEqual([{ type: 'started' }]);
        // 第 1 關一開始就播放題目的音檔，題目列有「再聽一次」
        expect(played).toEqual([PROMPT_AUDIO]);
        const replay = env.find(host, 'kq-maze-replay');
        expect(replay?.hidden).toBe(false);
        expect(env.find(host, 'kq-maze-prompt-text')?.textContent).toBe(
            '「香蕉」的越南語是？',
        );
        expect(
            env.find(host, 'kq-maze-prompt-text')?.getAttribute('lang'),
        ).toBe('vi');
        expect(env.find(host, 'kq-maze-question-number')?.textContent).toBe(
            '第 1 / 2 題',
        );
        expect(env.listenerCount()).toBeGreaterThan(0);
        expect(env.pendingFrames()).toBe(1);
        expect(env.activeObservers()).toBe(1);

        // 玩一下：鍵盤、觸控（漣漪會留一個計時器）、再聽一次
        env.runFrames(120);
        env.win.dispatchEvent(new FakeKeyboardEvent('ArrowLeft'));
        env.find(host, 'kq-maze-stage')?.dispatchEvent(
            new FakePointerEvent('pointerdown', 10, 10),
        );
        expect(env.pendingTimers()).toBe(1);
        replay?.dispatchEvent(new Event('click'));
        expect(played).toEqual([PROMPT_AUDIO, PROMPT_AUDIO]);
        await settle();
        env.runFrames(10);

        // 答案區：文字照畫；純圖片的選項圖片載入失敗時改畫「?」，不會當掉
        expect(env.drawnTexts).toContain('Chuối');
        expect(env.drawnTexts).toContain('Xoài');
        expect(env.drawnTexts).toContain('?');

        instance.destroy();
        expectClean(env, host);
        expect(stopAll.count).toBeGreaterThan(0);

        // 銷毀後什麼都不會再發生；重複呼叫也沒關係
        const eventCount = events.length;
        await settle();
        env.runFrames(10);
        env.runTimers();
        instance.destroy();
        instance.pause?.();
        instance.resume?.();
        expect(events).toHaveLength(eventCount);
        expectClean(env, host);
    });

    it('同一個掛載點可以反覆 mount／destroy', () => {
        const env = createFakeEnvironment();
        const host = env.createHost();
        for (let i = 0; i < 3; i++) {
            const { ctx, events } = harness();
            const instance = mazeQuiz.mount(host, ctx);
            expect(env.findAll(host, 'kq-maze')).toHaveLength(1);
            env.runFrames(30);
            expect(events[0]).toEqual({ type: 'started' });
            instance.destroy();
            expectClean(env, host);
        }
    });

    it('宿主的 pause() 停住迴圈；resume() 之後停在暫停畫面，等玩家按「繼續」', () => {
        const env = createFakeEnvironment();
        const host = env.createHost();
        const { ctx, stopAll } = harness();
        const instance = mazeQuiz.mount(host, ctx);
        env.runFrames(5);

        instance.pause?.();
        expect(env.pendingFrames()).toBe(0);
        expect(stopAll.count).toBeGreaterThan(0);
        const overlay = env.find(host, 'kq-maze-overlay');
        expect(overlay?.hidden).toBe(false);
        expect(overlay?.textContent).toContain('暫停');

        instance.resume?.();
        expect(env.pendingFrames()).toBe(1);
        env.runFrames(5);
        expect(overlay?.hidden).toBe(false);

        env.find(host, 'kq-maze-btn-primary')?.dispatchEvent(
            new Event('click'),
        );
        env.runFrames(1);
        expect(overlay?.hidden).toBe(true);

        instance.destroy();
        expectClean(env, host);
    });

    it('Esc／P 暫停與繼續；暫停畫面可以改觸控方向鍵的位置，記在 localStorage', () => {
        const env = createFakeEnvironment();
        const host = env.createHost();
        const instance = mazeQuiz.mount(host, harness().ctx);
        const root = env.find(host, 'kq-maze');
        // 沒有觸控螢幕：預設不顯示方向鍵
        expect(root?.dataset.dpad).toBe('off');

        env.win.dispatchEvent(new FakeKeyboardEvent('KeyP'));
        env.runFrames(1);
        const overlay = env.find(host, 'kq-maze-overlay');
        expect(overlay?.textContent).toContain('觸控方向鍵');
        const inputs = env.findAll(host, 'kq-maze-segmented')[0]?.descendants();
        const left = [...(inputs ?? [])].find(
            (element) => element.getAttribute('value') === 'left',
        );
        if (left === undefined) throw new Error('找不到「左邊」');
        Object.assign(left, { checked: true });
        left.dispatchEvent(new Event('change'));
        expect(root?.dataset.dpad).toBe('left');
        expect(env.find(host, 'kq-maze-dpad')?.hidden).toBe(false);
        expect([...env.storage.values()]).toEqual(['left']);

        env.win.dispatchEvent(new FakeKeyboardEvent('Escape'));
        env.runFrames(1);
        expect(overlay?.hidden).toBe(true);

        instance.destroy();
        expectClean(env, host);

        // 下一次掛載記得上次的位置
        const again = mazeQuiz.mount(host, harness().ctx);
        expect(env.find(host, 'kq-maze')?.dataset.dpad).toBe('left');
        again.destroy();
        expectClean(env, host);
    });

    it('localStorage 無法使用時照常進行', () => {
        const env = createFakeEnvironment({ storageThrows: true });
        const host = env.createHost();
        const { ctx, events } = harness();
        const instance = mazeQuiz.mount(host, ctx);
        env.runFrames(30);
        expect(events[0]).toEqual({ type: 'started' });
        instance.destroy();
        expectClean(env, host);
    });

    it('倒數歸零：發出 completed、停止迴圈，留下中性的結束畫面', () => {
        const env = createFakeEnvironment();
        const host = env.createHost();
        // 命給多一點，30 秒內不會被敵人撞光
        const { ctx, events } = harness({
            timerMode: 'countDown',
            countDownSeconds: 30,
            lives: 9,
        });
        const instance = mazeQuiz.mount(host, ctx);
        env.runFrames(200, 250);

        expect(events.map((event) => event.type)).toEqual([
            'started',
            'completed',
        ]);
        expect(events[1]).toEqual({
            type: 'completed',
            gameScore: 0,
            durationMs: 30_000,
        });
        expect(env.pendingFrames()).toBe(0);
        const overlay = env.find(host, 'kq-maze-overlay');
        expect(overlay?.textContent).toBe('時間到');
        // 結束畫面沒有按鈕，交給宿主換成成績畫面
        expect(env.findAll(host, 'kq-maze-btn')).toEqual([]);

        // 結束後宿主的 pause()／resume() 不會重新啟動迴圈
        instance.pause?.();
        instance.resume?.();
        expect(env.pendingFrames()).toBe(0);
        instance.destroy();
        expectClean(env, host);
    });

    it('沒有可以玩的題目：started 之後立刻 completed，不跑迴圈', () => {
        const env = createFakeEnvironment();
        const host = env.createHost();
        const { ctx, events, played } = harness({}, [
            {
                shape: 'pair',
                entryId: 'p1',
                left: { text: 'L' },
                right: { text: 'R' },
            },
        ]);
        const instance = mazeQuiz.mount(host, ctx);
        expect(events).toEqual([
            { type: 'started' },
            { type: 'completed', gameScore: 0, durationMs: 0 },
        ]);
        expect(env.pendingFrames()).toBe(0);
        expect(played).toEqual([]);
        instance.destroy();
        expectClean(env, host);
    });

    it('題目沒有音檔時不播放聲音，也不顯示「再聽一次」', () => {
        const env = createFakeEnvironment();
        const host = env.createHost();
        const second = rounds[1];
        if (second === undefined) throw new Error('沒有第 2 題');
        const { ctx, played } = harness({}, [second]);
        const instance = mazeQuiz.mount(host, ctx);
        env.runFrames(60);
        expect(played).toEqual([]);
        expect(env.find(host, 'kq-maze-replay')?.hidden).toBe(true);
        instance.destroy();
        expectClean(env, host);
    });
});
