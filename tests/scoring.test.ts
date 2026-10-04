import { describe, expect, it } from 'vite-plus/test';
import { computeScore } from '../src/core/scoring';
import type { QuestionResult } from '../src/core/types';

describe('computeScore', () => {
    it('只算一次就答對的題數', () => {
        const results: QuestionResult[] = [
            { questionId: 'q1', status: 'firstTry', wrongChoiceIds: [] },
            { questionId: 'q2', status: 'retry', wrongChoiceIds: ['q2-a'] },
            { questionId: 'q3', status: 'firstTry', wrongChoiceIds: [] },
            { questionId: 'q4', status: 'unanswered', wrongChoiceIds: [] },
        ];
        expect(computeScore(results)).toBe(2);
    });

    it('沒有結果時是 0 分', () => {
        expect(computeScore([])).toBe(0);
    });
});
