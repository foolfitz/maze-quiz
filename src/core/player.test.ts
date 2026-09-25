import { describe, expect, it } from 'vitest';
import { Grid } from './grid';
import { createPlayer, requestDirection, updatePlayer, type Player, type PlayerConfig } from './player';

/** 用字串畫格子：# 是牆，. 是地板 */
function gridFrom(rows: readonly string[]): Grid {
  const grid = new Grid(rows[0]?.length ?? 0, rows.length);
  rows.forEach((row, y) => {
    [...row].forEach((char, x) => grid.set({ x, y }, char === '#' ? 'wall' : 'floor'));
  });
  return grid;
}

const config: PlayerConfig = { speedTilesPerSec: 4.5, turnTolerance: 0.3, inputGraceMs: 150 };
const STEP_MS = 1000 / 60;

/** 以固定 60 Hz 前進 durationMs 毫秒 */
function run(player: Player, grid: Grid, durationMs: number, cfg: PlayerConfig = config): void {
  const passable = (t: { x: number; y: number }): boolean => grid.isFloor(t);
  const steps = Math.round(durationMs / STEP_MS);
  for (let i = 0; i < steps; i++) updatePlayer(player, STEP_MS, passable, cfg);
}

function request(player: Player, grid: Grid, direction: Parameters<typeof requestDirection>[1]) {
  return requestDirection(player, direction, (t) => grid.isFloor(t), config);
}

// 一條橫向走廊，x=5 往下有岔路
const T_JUNCTION = gridFrom([
  '#########', //
  '#.......#',
  '#####.###',
  '#####.###',
  '#########',
]);

// L 形轉角：往右走到 x=5，只能往下
const L_CORNER = gridFrom([
  '#######', //
  '#.....#',
  '#####.#',
  '#####.#',
  '#######',
]);

describe('直走與撞牆', () => {
  it('停著時往可以走的方向出發', () => {
    const player = createPlayer({ x: 1, y: 1 });
    expect(request(player, T_JUNCTION, 'right')).toBe('started');
    run(player, T_JUNCTION, 100);
    expect(player.x).toBeGreaterThan(1);
    expect(player.y).toBe(1);
  });

  it('停著時往牆走：不動，回報碰壁', () => {
    const player = createPlayer({ x: 1, y: 1 });
    expect(request(player, T_JUNCTION, 'up')).toBe('bumped');
    expect(player.dir).toBeNull();
    run(player, T_JUNCTION, 500);
    expect(player).toMatchObject({ x: 1, y: 1 });
  });

  it('直走撞牆會停在格子中心，方向變回 null', () => {
    const player = createPlayer({ x: 1, y: 1 });
    request(player, T_JUNCTION, 'right');
    run(player, T_JUNCTION, 3000);
    expect(player).toMatchObject({ x: 7, y: 1, dir: null });
  });

  it('速度是每秒 4.5 格', () => {
    const player = createPlayer({ x: 1, y: 1 });
    request(player, T_JUNCTION, 'right');
    run(player, T_JUNCTION, 1000);
    expect(player.x).toBeCloseTo(5.5, 1);
  });
});

describe('不自動轉彎', () => {
  it('L 形轉角會停住，不會自己往下轉', () => {
    const player = createPlayer({ x: 1, y: 1 });
    request(player, L_CORNER, 'right');
    run(player, L_CORNER, 3000);
    expect(player).toMatchObject({ x: 5, y: 1, dir: null });
  });

  it('停在轉角後再下指令才會轉', () => {
    const player = createPlayer({ x: 5, y: 1 });
    expect(request(player, L_CORNER, 'down')).toBe('started');
    run(player, L_CORNER, 3000);
    expect(player).toMatchObject({ x: 5, y: 3, dir: null });
  });

  it('經過岔路口時不會轉進岔路', () => {
    const player = createPlayer({ x: 1, y: 1 });
    request(player, T_JUNCTION, 'right');
    run(player, T_JUNCTION, 3000);
    expect(player.y).toBe(1);
  });
});

describe('迴轉', () => {
  it('與目前方向相反：立刻迴轉，不必走到格子中心', () => {
    const player = createPlayer({ x: 1, y: 1 });
    request(player, T_JUNCTION, 'right');
    run(player, T_JUNCTION, 250);
    const before = player.x;
    expect(Number.isInteger(before)).toBe(false);
    expect(request(player, T_JUNCTION, 'left')).toBe('reversed');
    run(player, T_JUNCTION, STEP_MS);
    expect(player.x).toBeLessThan(before);
  });
});

describe('轉向的容許範圍與寬限時間', () => {
  it('離路口中心 0.3 格以內：吸附到中心並立刻轉向', () => {
    const player: Player = { x: 4.75, y: 1, dir: 'right', pendingDir: null, pendingMs: 0 };
    expect(request(player, T_JUNCTION, 'down')).toBe('turned');
    expect(player).toMatchObject({ x: 5, y: 1, dir: 'down' });
  });

  it('剛過路口 0.3 格以內也可以吸附回去', () => {
    const player: Player = { x: 5.2, y: 1, dir: 'right', pendingDir: null, pendingMs: 0 };
    expect(request(player, T_JUNCTION, 'down')).toBe('turned');
    expect(player).toMatchObject({ x: 5, y: 1, dir: 'down' });
  });

  it('太遠時先暫存，寬限時間內經過路口中心就轉', () => {
    // 0.5 格要走約 111 ms，在 150 ms 內
    const player: Player = { x: 4.5, y: 1, dir: 'right', pendingDir: null, pendingMs: 0 };
    expect(request(player, T_JUNCTION, 'down')).toBe('queued');
    expect(player.pendingDir).toBe('down');
    run(player, T_JUNCTION, 300);
    expect(player.x).toBe(5);
    expect(player.y).toBeGreaterThan(1);
    expect(player.pendingDir).toBeNull();
  });

  it('寬限時間過了才到路口：不轉，暫存的方向也丟掉', () => {
    // 1.5 格要走約 333 ms，超過 150 ms
    const player: Player = { x: 3.5, y: 1, dir: 'right', pendingDir: null, pendingMs: 0 };
    expect(request(player, T_JUNCTION, 'down')).toBe('queued');
    run(player, T_JUNCTION, 200);
    expect(player.pendingDir).toBeNull();
    run(player, T_JUNCTION, 3000);
    expect(player).toMatchObject({ x: 7, y: 1, dir: null });
  });

  it('暫存的方向到了路口是牆就不轉，繼續直走', () => {
    const player: Player = { x: 4.5, y: 1, dir: 'right', pendingDir: null, pendingMs: 0 };
    expect(request(player, T_JUNCTION, 'up')).toBe('queued');
    run(player, T_JUNCTION, 3000);
    expect(player).toMatchObject({ x: 7, y: 1, dir: null });
  });

  it('暫存期間走到牆前停下：暫存的方向清掉', () => {
    const player: Player = { x: 6.8, y: 1, dir: 'right', pendingDir: null, pendingMs: 0 };
    expect(request(player, T_JUNCTION, 'down')).toBe('queued');
    run(player, T_JUNCTION, 100);
    expect(player).toMatchObject({ x: 7, dir: null, pendingDir: null });
  });

  it('與目前方向相同：忽略', () => {
    const player: Player = { x: 2.5, y: 1, dir: 'right', pendingDir: null, pendingMs: 0 };
    expect(request(player, T_JUNCTION, 'right')).toBe('ignored');
    expect(player.pendingDir).toBeNull();
  });
});

describe('高速移動', () => {
  // 每步（1/60 秒）走 10 格以上
  const fast: PlayerConfig = { ...config, speedTilesPerSec: 600 };

  it('一步走好幾格也不會穿牆，停在最後一格中心', () => {
    const player = createPlayer({ x: 1, y: 1 });
    request(player, T_JUNCTION, 'right');
    run(player, T_JUNCTION, STEP_MS, fast);
    expect(player).toMatchObject({ x: 7, y: 1, dir: null });
  });

  it('一步走好幾格也不會跳過路口中心：暫存的轉向照樣生效', () => {
    const player: Player = { x: 1, y: 1, dir: 'right', pendingDir: 'down', pendingMs: 150 };
    run(player, T_JUNCTION, STEP_MS, fast);
    expect(player).toMatchObject({ x: 5, y: 3, dir: null });
  });

  it('單次 dt 很長（250 ms）也一樣', () => {
    const player = createPlayer({ x: 1, y: 1 });
    request(player, T_JUNCTION, 'right');
    updatePlayer(player, 250, (t) => T_JUNCTION.isFloor(t), fast);
    expect(player).toMatchObject({ x: 7, y: 1, dir: null });
  });

  it('移動中永遠在走廊中央線上，也不會進到牆裡', () => {
    const player = createPlayer({ x: 1, y: 1 });
    const moves = ['right', 'down', 'up', 'left', 'right', 'down'] as const;
    for (const move of moves) {
      request(player, T_JUNCTION, move);
      for (let i = 0; i < 40; i++) {
        updatePlayer(player, STEP_MS, (t) => T_JUNCTION.isFloor(t), config);
        expect(Number.isInteger(player.x) || Number.isInteger(player.y)).toBe(true);
        expect(T_JUNCTION.isFloor({ x: Math.round(player.x), y: Math.round(player.y) })).toBe(true);
      }
    }
  });
});
