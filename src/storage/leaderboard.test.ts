import { describe, expect, it } from 'vitest';
import type { LeaderboardEntry } from '../core/scoring';
import {
  isStorageUsable,
  leaderboardKey,
  loadLeaderboard,
  parseLeaderboard,
  saveLeaderboard,
  type LeaderboardStorage,
} from './leaderboard';

function memoryStorage(): LeaderboardStorage & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const blocked: LeaderboardStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

const sample: LeaderboardEntry = {
  name: '小明',
  score: 4,
  total: 5,
  elapsedMs: 83_000,
  livesLeft: 2,
  optionsKey: 'd3-l3-countUp',
  playedAt: '2026-09-25T10:00:00.000Z',
};

describe('排行榜的儲存（§11.2）', () => {
  it('key 是 maze-quiz:leaderboard:<quizId>', () => {
    expect(leaderboardKey('zoo-animals')).toBe('maze-quiz:leaderboard:zoo-animals');
  });

  it('存了讀得回來，各題組分開', () => {
    const storage = memoryStorage();
    expect(saveLeaderboard(storage, 'zoo', [sample])).toBe(true);
    expect(loadLeaderboard(storage, 'zoo')).toEqual([sample]);
    expect(loadLeaderboard(storage, 'other')).toEqual([]);
  });

  it('localStorage 不能用時：偵測得出來，讀寫都不丟錯', () => {
    expect(isStorageUsable(null)).toBe(false);
    expect(isStorageUsable(blocked)).toBe(false);
    expect(isStorageUsable(memoryStorage())).toBe(true);
    expect(loadLeaderboard(blocked, 'zoo')).toEqual([]);
    expect(saveLeaderboard(blocked, 'zoo', [sample])).toBe(false);
  });

  it('偵測用的 key 不會留下來', () => {
    const storage = memoryStorage();
    isStorageUsable(storage);
    expect(storage.map.size).toBe(0);
  });

  it('資料壞掉時當成空的', () => {
    const storage = memoryStorage();
    storage.setItem(leaderboardKey('zoo'), '{not json');
    expect(loadLeaderboard(storage, 'zoo')).toEqual([]);
  });

  it('格式不對的紀錄丟掉，其他的保留', () => {
    expect(
      parseLeaderboard([sample, { ...sample, score: '4' }, null, { ...sample, elapsedMs: Infinity }, 'x']),
    ).toEqual([sample]);
    expect(parseLeaderboard({ entries: [sample] })).toEqual([]);
  });
});
