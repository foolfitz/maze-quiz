import type { Round } from '@kancil-quiz/games-sdk';
import { describe, expect, it } from 'vite-plus/test';
import { levelQuestion, roundsToLevels } from '../src/rounds';

function mcq(entryId: string, optionCount: number, correctIndex = 0): Round {
    return {
        shape: 'mcq',
        entryId,
        prompt: { text: `題目 ${entryId}` },
        options: Array.from({ length: optionCount }, (_, i) => ({
            id: `${entryId}-${i}`,
            face: { text: `選項 ${i}` },
            correct: i === correctIndex,
        })),
    };
}

describe('rounds → 關卡', () => {
    it('一個 Round 就是一關，順序不變（不再打亂）', () => {
        const rounds = ['e3', 'e1', 'e2'].map((id) => mcq(id, 3));
        expect(roundsToLevels(rounds).map((level) => level.entryId)).toEqual([
            'e3',
            'e1',
            'e2',
        ]);
    });

    it('題目面與選項（id、face、correct）原樣帶過去', () => {
        const round: Round = {
            shape: 'mcq',
            entryId: 'e1',
            prompt: {
                text: 'Quả gì?',
                image: 'https://example.test/p.webp',
                audio: 'https://example.test/p.m4a',
            },
            options: [
                {
                    id: 'a',
                    face: {
                        text: 'Chuối',
                        image: 'https://example.test/a.webp',
                    },
                    correct: true,
                },
                {
                    id: 'b',
                    face: { image: 'https://example.test/b.webp' },
                    correct: false,
                },
            ],
        };
        const [level] = roundsToLevels([round]);
        expect(level).toEqual({
            entryId: 'e1',
            prompt: round.prompt,
            options: round.options,
        });
        if (level === undefined) throw new Error('沒有關卡');
        expect(levelQuestion(level)).toEqual({
            id: 'e1',
            choices: [
                { id: 'a', correct: true },
                { id: 'b', correct: false },
            ],
        });
    });

    it('選項數 2–6 都可以玩；超出範圍、沒有正確選項或不是 mcq 的題目略過', () => {
        const rounds: Round[] = [
            mcq('one', 1),
            mcq('two', 2),
            mcq('six', 6),
            mcq('seven', 7),
            mcq('none', 3, -1),
            {
                shape: 'pair',
                entryId: 'pair',
                left: { text: 'L' },
                right: { text: 'R' },
            },
        ];
        expect(roundsToLevels(rounds).map((level) => level.entryId)).toEqual([
            'two',
            'six',
        ]);
    });
});
