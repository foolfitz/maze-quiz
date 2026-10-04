import type { GameEvent } from '@kancil-quiz/games-sdk';
import { describe, expect, it } from 'vite-plus/test';
import { FirstAnswers } from '../../demo/score';

const answered = (entryId: string, correct: boolean): GameEvent => ({
    type: 'answered',
    entryId,
    selected: ['x'],
    correct,
    durationMs: 1000,
});

describe('示範頁的成績', () => {
    it('每題以第一次作答計算：答錯後再答對仍算答錯', () => {
        const answers = new FirstAnswers();
        answers.record({ type: 'started' });
        answers.record(answered('a', false));
        answers.record(answered('a', true));
        answers.record(answered('b', true));
        answers.record(answered('b', false));
        answers.record({ type: 'completed', durationMs: 5000 });
        expect(answers.correct).toBe(1);
    });

    it('沒有作答就是 0 題', () => {
        expect(new FirstAnswers().correct).toBe(0);
    });
});
