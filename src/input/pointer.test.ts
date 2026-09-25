import { describe, expect, it } from 'vitest';
import { directionFromVector } from './pointer';

describe('directionFromVector', () => {
  it('取絕對值較大的軸', () => {
    // 點在右上方，但偏右比偏上多 → 往右
    expect(directionFromVector(3, -2, 0.6)).toBe('right');
    expect(directionFromVector(1, -2, 0.6)).toBe('up');
    expect(directionFromVector(-4, 1, 0.6)).toBe('left');
    expect(directionFromVector(0.5, 2, 0.6)).toBe('down');
  });

  it('死區內忽略', () => {
    expect(directionFromVector(0.3, 0.3, 0.6)).toBeNull();
    expect(directionFromVector(0, 0, 0.6)).toBeNull();
    expect(directionFromVector(0.6, 0, 0.6)).toBe('right');
  });

  it('兩軸一樣大時算水平', () => {
    expect(directionFromVector(2, 2, 0.6)).toBe('right');
    expect(directionFromVector(-2, -2, 0.6)).toBe('left');
  });
});
