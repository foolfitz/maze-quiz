import { describe, expect, it } from 'vitest';
import {
  addEntry,
  compareEntries,
  computeScore,
  entriesFor,
  normalizeName,
  optionsKey,
  qualifies,
  type LeaderboardEntry,
} from './scoring';
import type { QuestionResult } from './types';

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

describe('optionsKey', () => {
  it('由難度、命數與計時方式組成', () => {
    expect(optionsKey({ difficulty: 3, lives: 3, timerMode: 'countUp', countDownSeconds: 300 })).toBe('d3-l3-countUp');
  });

  it('倒數時加上秒數；其他計時方式不受秒數影響', () => {
    expect(optionsKey({ difficulty: 2, lives: 1, timerMode: 'countDown', countDownSeconds: 120 })).toBe(
      'd2-l1-countDown-120',
    );
    expect(optionsKey({ difficulty: 1, lives: 9, timerMode: 'none', countDownSeconds: 120 })).toBe(
      optionsKey({ difficulty: 1, lives: 9, timerMode: 'none', countDownSeconds: 999 }),
    );
  });

  it('翻譯版本在最後加上語言代碼；原文不加', () => {
    const options = { difficulty: 2, lives: 3, timerMode: 'countUp', countDownSeconds: 300 } as const;
    expect(optionsKey(options, 'zh-Hant')).toBe('d2-l3-countUp-zh-Hant');
    expect(optionsKey(options, null)).toBe('d2-l3-countUp');
    expect(optionsKey({ ...options, timerMode: 'countDown' }, 'zh-Hant')).toBe('d2-l3-countDown-300-zh-Hant');
  });
});

/** 建立一筆紀錄，沒指定的欄位用固定值 */
function entry(overrides: Partial<LeaderboardEntry>): LeaderboardEntry {
  return {
    name: 'A',
    score: 3,
    total: 5,
    elapsedMs: 60_000,
    livesLeft: 2,
    optionsKey: 'd3-l3-countUp',
    playedAt: '2026-09-25T10:00:00.000Z',
    ...overrides,
  };
}

describe('排行榜排序（§11.2）', () => {
  it('分數高的在前，其次用時短，再其次剩下的命多', () => {
    const entries = [
      entry({ name: 'slow', score: 4, elapsedMs: 90_000 }),
      entry({ name: 'low', score: 2, elapsedMs: 10_000 }),
      entry({ name: 'fewLives', score: 4, elapsedMs: 50_000, livesLeft: 1 }),
      entry({ name: 'best', score: 5, elapsedMs: 120_000 }),
      entry({ name: 'fast', score: 4, elapsedMs: 50_000, livesLeft: 3 }),
    ];
    expect([...entries].sort(compareEntries).map((e) => e.name)).toEqual(['best', 'fast', 'fewLives', 'slow', 'low']);
  });

  it('全部一樣時先玩的在前', () => {
    const early = entry({ name: 'early', playedAt: '2026-09-25T09:00:00.000Z' });
    const late = entry({ name: 'late', playedAt: '2026-09-25T11:00:00.000Z' });
    expect([late, early].sort(compareEntries).map((e) => e.name)).toEqual(['early', 'late']);
  });
});

describe('optionsKey 過濾與保留前幾名', () => {
  const other = entry({ name: 'other', optionsKey: 'd5-l1-countUp', score: 0 });

  it('只列出同樣設定的紀錄', () => {
    const mine = entry({ name: 'mine' });
    expect(entriesFor([other, mine], 'd3-l3-countUp')).toEqual([mine]);
  });

  it('加入後回傳名次；每種設定各自保留前幾名，不排擠其他設定', () => {
    let entries: LeaderboardEntry[] = [other];
    for (let i = 0; i < 3; i++) entries = addEntry(entries, entry({ name: `p${i}`, score: i }), 3).entries;
    const result = addEntry(entries, entry({ name: 'new', score: 1, elapsedMs: 1 }), 3);
    expect(result.rank).toBe(2);
    expect(entriesFor(result.entries, 'd3-l3-countUp').map((e) => e.name)).toEqual(['p2', 'new', 'p1']);
    expect(result.entries).toContain(other);
  });

  it('沒進前幾名時名次是 null，清單不變', () => {
    const entries = [entry({ name: 'a', score: 5 }), entry({ name: 'b', score: 4 })];
    const result = addEntry(entries, entry({ name: 'c', score: 1 }), 2);
    expect(result.rank).toBeNull();
    expect(entriesFor(result.entries, 'd3-l3-countUp').map((e) => e.name)).toEqual(['a', 'b']);
  });

  it('追平最後一名時擠不進去（先玩的優先）', () => {
    const entries = [entry({ name: 'a', score: 5 }), entry({ name: 'b', score: 4 })];
    expect(qualifies(entries, entry({ name: 'c', score: 4, playedAt: '2026-09-26T00:00:00.000Z' }), 2)).toBe(false);
    expect(qualifies(entries, entry({ name: 'c', score: 4, elapsedMs: 1 }), 2)).toBe(true);
  });

  it('還沒滿時任何成績都能進榜', () => {
    expect(qualifies([], entry({ score: 0 }), 10)).toBe(true);
  });
});

describe('名字', () => {
  it('去掉前後空白', () => {
    expect(normalizeName('  小明  ', 12)).toBe('小明');
  });

  it('空白或太長時不接受；以字元（code point）計算長度', () => {
    expect(normalizeName('   ', 12)).toBeNull();
    expect(normalizeName('一二三四五六七八九十一二', 12)).toBe('一二三四五六七八九十一二');
    expect(normalizeName('一二三四五六七八九十一二三', 12)).toBeNull();
    expect(normalizeName('🐘'.repeat(12), 12)).toBe('🐘'.repeat(12));
  });
});
