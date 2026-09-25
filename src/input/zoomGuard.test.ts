import { describe, expect, it } from 'vitest';
import { isDoubleTap } from './zoomGuard';

describe('isDoubleTap', () => {
  const first = { x: 100, y: 100, timeMs: 1000 };

  it('第一下不算點兩下', () => {
    expect(isDoubleTap(null, first)).toBe(false);
  });

  it('很快又點在附近：算點兩下', () => {
    expect(isDoubleTap(first, { x: 110, y: 95, timeMs: 1250 })).toBe(true);
    expect(isDoubleTap(first, { x: 100, y: 100, timeMs: 1400 })).toBe(true);
  });

  it('間隔太久或離太遠：不算', () => {
    expect(isDoubleTap(first, { x: 100, y: 100, timeMs: 1401 })).toBe(false);
    expect(isDoubleTap(first, { x: 200, y: 100, timeMs: 1100 })).toBe(false);
  });

  it('時間倒退（不同的時鐘）時不算', () => {
    expect(isDoubleTap(first, { x: 100, y: 100, timeMs: 900 })).toBe(false);
  });
});
