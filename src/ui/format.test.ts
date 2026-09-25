import { describe, expect, it } from 'vitest';
import { formatBuildTime, formatClock } from './format';

describe('formatClock', () => {
  it('顯示成 m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(83_000)).toBe('1:23');
    expect(formatClock(300_000)).toBe('5:00');
    expect(formatClock(75 * 60_000 + 3_000)).toBe('75:03');
  });

  it('正計時無條件捨去，倒數無條件進位', () => {
    expect(formatClock(59_999)).toBe('0:59');
    expect(formatClock(59_001, 'up')).toBe('1:00');
    expect(formatClock(1, 'up')).toBe('0:01');
    expect(formatClock(0, 'up')).toBe('0:00');
  });
});

describe('formatBuildTime', () => {
  it('顯示成當地時間的年月日與時分', () => {
    // 用當地時間建立，測試結果不受執行環境的時區影響
    const local = new Date(2026, 8, 5, 7, 3);
    expect(formatBuildTime(local.toISOString())).toBe('2026-09-05 07:03');
  });

  it('不是合法的時間就原樣顯示', () => {
    expect(formatBuildTime('dev')).toBe('dev');
  });
});
