import { describe, expect, it } from 'vitest';
import { bfs, expandRect, Grid, inRect, opposite, rectTiles, step, type Tile } from './grid';

/** 用字串畫格子：# 是牆，. 是地板 */
function gridFrom(rows: readonly string[]): Grid {
  const grid = new Grid(rows[0]?.length ?? 0, rows.length);
  rows.forEach((row, y) => {
    [...row].forEach((char, x) => grid.set({ x, y }, char === '.' ? 'floor' : 'wall'));
  });
  return grid;
}

describe('方向工具', () => {
  it('step 與 opposite', () => {
    expect(step({ x: 3, y: 3 }, 'up')).toEqual({ x: 3, y: 2 });
    expect(step({ x: 3, y: 3 }, 'right', 2)).toEqual({ x: 5, y: 3 });
    expect(opposite('left')).toBe('right');
    expect(opposite('down')).toBe('up');
  });
});

describe('Rect', () => {
  it('inRect、expandRect、rectTiles', () => {
    const rect = { x: 1, y: 1, width: 3, height: 3 };
    expect(inRect({ x: 1, y: 1 }, rect)).toBe(true);
    expect(inRect({ x: 3, y: 3 }, rect)).toBe(true);
    expect(inRect({ x: 4, y: 3 }, rect)).toBe(false);
    expect(expandRect(rect, 1)).toEqual({ x: 0, y: 0, width: 5, height: 5 });
    expect(rectTiles(rect)).toHaveLength(9);
  });
});

describe('Grid', () => {
  it('超出範圍一律當成牆', () => {
    const grid = new Grid(3, 3, 'floor');
    expect(grid.get({ x: -1, y: 0 })).toBe('wall');
    expect(grid.isFloor({ x: 3, y: 0 })).toBe(false);
    expect(() => grid.set({ x: 5, y: 5 }, 'floor')).toThrow(RangeError);
  });

  it('clone 之後互不影響', () => {
    const grid = new Grid(3, 3);
    const copy = grid.clone();
    copy.set({ x: 1, y: 1 }, 'floor');
    expect(grid.isFloor({ x: 1, y: 1 })).toBe(false);
    expect(copy.isFloor({ x: 1, y: 1 })).toBe(true);
  });

  it('onBorder 與 countOpenNeighbors', () => {
    const grid = gridFrom(['#####', '#...#', '#.#.#', '#####']);
    expect(grid.onBorder({ x: 0, y: 2 })).toBe(true);
    expect(grid.onBorder({ x: 2, y: 2 })).toBe(false);
    expect(grid.countOpenNeighbors({ x: 1, y: 1 })).toBe(2);
    expect(grid.countOpenNeighbors({ x: 2, y: 1 })).toBe(2);
    expect(grid.countOpenNeighbors({ x: 1, y: 2 })).toBe(1);
  });
});

describe('bfs', () => {
  const grid = gridFrom([
    '#######', //
    '#.....#',
    '#.###.#',
    '#...#.#',
    '#####.#',
    '#.#...#',
    '#######',
  ]);
  const start: Tile = { x: 1, y: 1 };

  it('算出最短步數', () => {
    const field = bfs(grid, start);
    expect(field.get(start)).toBe(0);
    expect(field.get({ x: 5, y: 1 })).toBe(4);
    expect(field.get({ x: 3, y: 3 })).toBe(4);
    expect(field.get({ x: 3, y: 5 })).toBe(10);
  });

  it('到不了的格子、牆、超出範圍都是 null', () => {
    const field = bfs(grid, start);
    expect(field.get({ x: 1, y: 5 })).toBeNull();
    expect(field.get({ x: 0, y: 0 })).toBeNull();
    expect(field.get({ x: 99, y: 1 })).toBeNull();
  });

  it('可以自訂哪些格子能走', () => {
    const field = bfs(grid, start, (t) => grid.isFloor(t) && !(t.x === 5 && t.y === 2));
    expect(field.get({ x: 5, y: 3 })).toBeNull();
  });

  it('起點不能走時全部都到不了', () => {
    expect(bfs(grid, { x: 0, y: 0 }).get(start)).toBeNull();
  });
});
