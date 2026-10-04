import { describe, expect, it } from 'vite-plus/test';
import { createRng } from '../../src/core/rng';
import { meta } from '../../src/meta';
import { roundsToLevels } from '../../src/rounds';
import { OPTION_COUNT, vocabRounds } from '../../demo/rounds';
import type { DemoSet } from '../../demo/sets';
import lesson from '../../demo/sets/id-1-3/set.json';

// 罐頭題組：平台匯出的印尼語第 1 冊第 3 課（看插圖與中文，選印尼語）
const set: DemoSet = lesson as DemoSet;
const mediaUrl = (src: string) => `/assets/${src}`;

describe('示範頁：詞彙組轉成選擇題', () => {
    const rounds = vocabRounds(set, mediaUrl, createRng(7));

    it('每個詞一題，題目是插圖與中文', () => {
        expect(rounds.map((round) => round.entryId).sort()).toEqual(
            set.entries.map((entry) => entry.id).sort(),
        );
        for (const round of rounds) {
            const item = set.entries.find(
                (entry) => entry.id === round.entryId,
            )?.item;
            expect(round.shape).toBe('mcq');
            if (round.shape !== 'mcq' || item === undefined) continue;
            expect(round.prompt).toEqual({
                image: `/assets/${item.image?.src}`,
                text: item.translation_zh,
            });
        }
    });

    it('每題 4 個不同的印尼語選項，只有這個詞是正解', () => {
        for (const round of rounds) {
            if (round.shape !== 'mcq') continue;
            expect(round.options).toHaveLength(OPTION_COUNT);
            const texts = round.options.map((option) => option.face.text);
            expect(new Set(texts).size).toBe(OPTION_COUNT);
            expect(round.options.filter((option) => option.correct)).toEqual([
                expect.objectContaining({ id: round.entryId, correct: true }),
            ]);
        }
    });

    it('遊戲能玩每一題，選項數在遊戲的範圍內', () => {
        expect(roundsToLevels(rounds)).toHaveLength(set.entries.length);
        expect(OPTION_COUNT).toBeGreaterThanOrEqual(
            meta.requires.optionCount.min,
        );
        expect(OPTION_COUNT).toBeLessThanOrEqual(meta.requires.optionCount.max);
    });

    it('同一個種子出同樣的題目', () => {
        expect(vocabRounds(set, mediaUrl, createRng(7))).toEqual(rounds);
        expect(vocabRounds(set, mediaUrl, createRng(8))).not.toEqual(rounds);
    });

    it('答案看起來一樣的詞不會同時出現；詞不夠時選項就少一些', () => {
        const entry = (id: string, text: string) => ({
            id,
            item: { text, translation_zh: id },
        });
        const small: DemoSet = {
            kind: 'vocab',
            language: 'id',
            title: '測試',
            faces: { prompt: ['translation_zh'], answer: ['text'] },
            entries: [entry('a', 'Ibu'), entry('b', 'ibu'), entry('c', 'ayah')],
        };
        for (const round of vocabRounds(small, mediaUrl, createRng(1))) {
            if (round.shape !== 'mcq') continue;
            expect(round.options).toHaveLength(2);
        }
    });

    it('只支援詞彙組', () => {
        expect(() =>
            vocabRounds({ ...set, kind: 'qa' }, mediaUrl, createRng(1)),
        ).toThrow('示範頁只支援詞彙組');
    });
});
