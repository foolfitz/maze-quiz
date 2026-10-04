import { describe, expect, it } from 'vite-plus/test';
import mazeQuiz, { mazeQuiz as named } from '../src';
import metaSource from '../src/meta.ts?raw';
import {
    DIFFICULTIES,
    meta,
    OPTION_LIMITS,
    TIMER_MODES,
    type MazeQuizOptions,
} from '../src/meta';
import { normalizeOptions } from '../src/options';

describe('模組的中繼資料', () => {
    it('預設匯出與具名匯出是同一個模組，內容來自 meta', () => {
        expect(named).toBe(mazeQuiz);
        expect(mazeQuiz).toMatchObject({
            id: 'maze-quiz',
            version: '0.1.0',
            title: { 'zh-TW': '迷宮問答' },
            requires: {
                shape: 'mcq',
                minRounds: 1,
                optionCount: { min: 2, max: 6 },
                renders: {
                    prompt: ['text', 'image', 'audio'],
                    option: ['text', 'image'],
                },
                scored: true,
            },
        });
        expect(mazeQuiz.optionsSchema).toBe(meta.optionsSchema);
        expect(typeof mazeQuiz.mount).toBe('function');
    });

    it('預設值沿用原本的遊戲：正計時、300 秒、3 條命、難度 2', () => {
        expect(meta.defaultOptions).toEqual({
            timerMode: 'countUp',
            countDownSeconds: 300,
            lives: 3,
            difficulty: 2,
        });
    });

    it('meta.ts 只 import 型別，不會把遊戲本體、CSS 或字型帶進來', () => {
        const imports = metaSource
            .split('\n')
            .filter((line) => /^\s*import\b/.test(line));
        expect(imports.length).toBeGreaterThan(0);
        for (const line of imports) expect(line).toMatch(/^import type /);
    });
});

describe('optionsSchema', () => {
    const { properties, required } = meta.optionsSchema;

    it('每個設定都有中文標題，而且都是必填', () => {
        expect(Object.keys(properties).sort()).toEqual(
            Object.keys(meta.defaultOptions).sort(),
        );
        expect([...required].sort()).toEqual(Object.keys(properties).sort());
        for (const property of Object.values(properties)) {
            expect(property.title).toMatch(/\p{Script=Han}/u);
        }
    });

    it('預設值與 defaultOptions 相同', () => {
        for (const [key, property] of Object.entries(properties)) {
            expect(property.default).toBe(
                meta.defaultOptions[key as keyof MazeQuizOptions],
            );
        }
    });

    it('列舉值附上中文名稱，範圍和 normalizeOptions 用的一樣', () => {
        expect(properties.timerMode.oneOf.map((o) => o.const)).toEqual([
            ...TIMER_MODES,
        ]);
        expect(properties.difficulty.oneOf.map((o) => o.const)).toEqual([
            ...DIFFICULTIES,
        ]);
        for (const option of [
            ...properties.timerMode.oneOf,
            ...properties.difficulty.oneOf,
        ]) {
            expect(option.title).not.toBe('');
        }
        expect(properties.lives).toMatchObject({
            type: 'integer',
            minimum: OPTION_LIMITS.lives.min,
            maximum: OPTION_LIMITS.lives.max,
        });
        expect(properties.countDownSeconds).toMatchObject({
            type: 'integer',
            minimum: 30,
            maximum: 3600,
        });
    });

    it('沒有 shuffleQuestions 與 showAnswersAtEnd（出題順序與成績畫面由宿主決定）', () => {
        expect(properties).not.toHaveProperty('shuffleQuestions');
        expect(properties).not.toHaveProperty('showAnswersAtEnd');
    });
});

describe('normalizeOptions', () => {
    it('合法的設定原樣保留', () => {
        const options: MazeQuizOptions = {
            timerMode: 'countDown',
            countDownSeconds: 30,
            lives: 9,
            difficulty: 3,
        };
        expect(normalizeOptions(options)).toEqual(options);
    });

    it('缺少或不合法的欄位改用預設值', () => {
        expect(normalizeOptions(undefined)).toEqual(meta.defaultOptions);
        expect(normalizeOptions({})).toEqual(meta.defaultOptions);
        expect(
            normalizeOptions({
                timerMode: 'fast',
                countDownSeconds: 29,
                lives: 0,
                difficulty: 4,
            }),
        ).toEqual(meta.defaultOptions);
        expect(
            normalizeOptions({ lives: 2.5, countDownSeconds: '60' }),
        ).toEqual(meta.defaultOptions);
        expect(normalizeOptions({ lives: 1, difficulty: 1 })).toEqual({
            ...meta.defaultOptions,
            lives: 1,
            difficulty: 1,
        });
    });
});
