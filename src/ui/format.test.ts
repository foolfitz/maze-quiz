import { describe, expect, it } from 'vitest';
import { formatClock } from './format';

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
