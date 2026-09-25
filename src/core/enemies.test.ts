import { describe, expect, it } from 'vitest';
import {
  chooseDirection,
  createEnemies,
  createEnemy,
  enemyTarget,
  enemyTile,
  openDirections,
  resetEnemy,
  shortestDirections,
  updateEnemy,
  type Enemy,
  type EnemyContext,
  type EnemyKind,
  type PlayerPosition,
} from './enemies';
import { bfs, DIRECTIONS, Grid, inRect, opposite, sameTile, step, type Tile } from './grid';
import { generateLevelMaze, isCorridor, type Maze, type ZoneCount } from './maze';
import { createPlayer, requestDirection, updatePlayer } from './player';
import { createRng, type Rng } from './rng';
import type { Direction } from './types';

const STEP_MS = 1000 / 60;

/** 用字串畫迷宮（沒有園區）：# 是牆，. 是地板 */
function mazeFrom(rows: readonly string[]): Maze {
  const grid = new Grid(rows[0]?.length ?? 0, rows.length);
  rows.forEach((row, y) => {
    [...row].forEach((char, x) => grid.set({ x, y }, char === '#' ? 'wall' : 'floor'));
  });
  return { grid, zones: [], start: { x: 1, y: 1 }, enemySpawns: [] };
}

/** 在 tile 放一隻已經可以出發的敵人 */
function enemyAt(kind: EnemyKind, tile: Tile, dir: Direction | null = null): Enemy {
  const enemy = createEnemy(kind, tile, 0);
  enemy.dir = dir;
  return enemy;
}

/** Extract 從 union 裡挑出 kind 是 'wanderer' 的那一種，這樣就能直接讀寫 goal */
type Wanderer = Extract<Enemy, { readonly kind: 'wanderer' }>;

function wandererAt(tile: Tile): Wanderer {
  return { kind: 'wanderer', spawn: tile, x: tile.x, y: tile.y, dir: null, releaseMs: 0, goal: null };
}

function context(maze: Maze, player: PlayerPosition, rng: Rng, overrides: Partial<EnemyContext> = {}): EnemyContext {
  return { maze, player, rng, speedTilesPerSec: 3, smartRatio: 1, ambushLookahead: 4, ...overrides };
}

/** 條件全部成立的迷宮（沒有死路）；找不到夠多張就直接失敗，不要一直找下去 */
function validMazes(count: number, zoneCounts: readonly ZoneCount[] = [2, 3, 4, 5, 6]): Maze[] {
  const mazes: Maze[] = [];
  for (let seed = 1; mazes.length < count && seed <= 1000; seed++) {
    for (const k of zoneCounts) {
      const result = generateLevelMaze(seed, 0, k);
      if (result.violations.length === 0) mazes.push(result.maze);
    }
  }
  if (mazes.length < count) throw new Error(`種子 1–1000 只找到 ${mazes.length} 張合格的迷宮`);
  return mazes.slice(0, count);
}

function corridorTiles(maze: Maze): Tile[] {
  return maze.grid.allTiles().filter((tile) => isCorridor(maze, tile));
}

/** 位置在走廊中央線上：與移動方向垂直的座標是整數，前後兩格都是走廊 */
function onCorridorLine(maze: Maze, enemy: Enemy): boolean {
  if (!Number.isInteger(enemy.x) && !Number.isInteger(enemy.y)) return false;
  const a = { x: Math.floor(enemy.x), y: Math.floor(enemy.y) };
  const b = { x: Math.ceil(enemy.x), y: Math.ceil(enemy.y) };
  return isCorridor(maze, a) && isCorridor(maze, b);
}

describe('建立與重生', () => {
  const spawns = [
    { x: 1, y: 1 },
    { x: 3, y: 1 },
    { x: 5, y: 1 },
  ];

  it('依序是 chaser、wanderer、ambusher，放在對應的出生點並等待 releaseDelayMs', () => {
    const enemies = createEnemies(spawns, 3, 1500);
    expect(enemies.map((e) => e.kind)).toEqual(['chaser', 'wanderer', 'ambusher']);
    expect(enemies.map((e) => ({ x: e.x, y: e.y }))).toEqual(spawns);
    expect(enemies.every((e) => e.dir === null && e.releaseMs === 1500)).toBe(true);
  });

  it('只取難度指定的數量；出生點不夠時少放幾隻', () => {
    expect(createEnemies(spawns, 1, 0).map((e) => e.kind)).toEqual(['chaser']);
    expect(createEnemies(spawns.slice(0, 2), 3, 0)).toHaveLength(2);
  });

  it('只有 wanderer 有目標（goal）', () => {
    expect(createEnemies(spawns, 3, 0).map((e) => 'goal' in e)).toEqual([false, true, false]);
  });

  it('resetEnemy 回到出生點、重新等待、清掉目標', () => {
    const enemy = wandererAt({ x: 3, y: 1 });
    Object.assign(enemy, { x: 4, y: 1, dir: 'left', goal: { x: 2, y: 1 } });
    resetEnemy(enemy, 1500);
    expect(enemy).toMatchObject({ x: 3, y: 1, dir: null, releaseMs: 1500, goal: null });
  });
});

describe('等待出發', () => {
  const maze = mazeFrom(['#######', '#.....#', '#######']);

  it('releaseMs 內不動，時間到才出發', () => {
    const enemy = { ...enemyAt('chaser', { x: 1, y: 1 }), releaseMs: 1500 };
    const ctx = context(maze, { x: 5, y: 1, dir: null }, createRng(1));
    for (let t = 0; t < 1500 - STEP_MS; t += STEP_MS) updateEnemy(enemy, STEP_MS, ctx);
    expect(enemy).toMatchObject({ x: 1, y: 1, dir: null });
    for (let i = 0; i < 10; i++) updateEnemy(enemy, STEP_MS, ctx);
    expect(enemy.x).toBeGreaterThan(1);
    expect(enemy.dir).toBe('right');
  });
});

describe('可以走的方向', () => {
  // 十字路口，(3, 3) 四個方向都能走
  const cross = mazeFrom(['#######', '###.###', '###.###', '#.....#', '###.###', '###.###', '#######']);

  it('不回頭', () => {
    expect(openDirections(cross, { x: 3, y: 3 }, 'right').sort()).toEqual(['down', 'right', 'up']);
  });

  it('還沒出發時四個方向都算', () => {
    expect(openDirections(cross, { x: 3, y: 3 }, null)).toHaveLength(4);
  });

  it('死路時只能回頭', () => {
    expect(openDirections(cross, { x: 5, y: 3 }, 'right')).toEqual(['left']);
  });

  it('直走的走廊只有一個方向', () => {
    expect(openDirections(cross, { x: 3, y: 2 }, 'down')).toEqual(['down']);
  });
});

describe('移動（§9）', () => {
  it('走到死路才回頭，其他地方不回頭', () => {
    const maze = mazeFrom(['#######', '#.....#', '#######']);
    const enemy = enemyAt('wanderer', { x: 1, y: 1 });
    const ctx = context(maze, { x: 3, y: 1, dir: null }, createRng(3), { smartRatio: 0 });
    const reversals: Tile[] = [];
    for (let i = 0; i < 600; i++) {
      const before = enemy.dir;
      updateEnemy(enemy, STEP_MS, ctx);
      if (before !== null && enemy.dir === opposite(before)) reversals.push(enemyTile(enemy));
      expect(onCorridorLine(maze, enemy)).toBe(true);
    }
    expect(reversals.length).toBeGreaterThan(0);
    for (const tile of reversals) expect(tile.x === 1 || tile.x === 5).toBe(true);
  });

  it('生成的迷宮裡：永遠在走廊中央、不進園區與門、不回頭', () => {
    // 每一步都呼叫 expect 太慢，先收集問題，最後再一起檢查
    const problems: string[] = [];
    for (const [mazeIndex, maze] of validMazes(20).entries()) {
      const rng = createRng(mazeIndex);
      const player = createPlayer(maze.start);
      const playerPassable = (tile: Tile): boolean => maze.grid.isFloor(tile);
      const enemies = createEnemies(maze.enemySpawns, 3, 0);
      for (const smartRatio of [0, 0.6, 1]) {
        const ctx = context(maze, player, rng, { smartRatio, speedTilesPerSec: 4.05 });
        const traveled = enemies.map(() => 0);
        for (let i = 0; i < 60 * 20; i++) {
          // 玩家隨機亂走
          if (i % 20 === 0) requestDirection(player, rng.pick(DIRECTIONS), playerPassable);
          updatePlayer(player, STEP_MS, playerPassable);
          for (const [enemyIndex, enemy] of enemies.entries()) {
            const before = enemy.dir;
            const from = { x: enemy.x, y: enemy.y };
            updateEnemy(enemy, STEP_MS, ctx);
            // 沿走廊走，這一步走的路程就是兩個座標差的總和（轉彎也一樣）
            const moved = Math.abs(enemy.x - from.x) + Math.abs(enemy.y - from.y);
            traveled[enemyIndex] = (traveled[enemyIndex] ?? 0) + moved;
            const where = `迷宮 ${mazeIndex} ${enemy.kind} (${enemy.x}, ${enemy.y})`;
            if (!onCorridorLine(maze, enemy)) problems.push(`${where} 不在走廊上`);
            const tile = enemyTile(enemy);
            if (maze.zones.some((zone) => inRect(tile, zone.rect) || sameTile(tile, zone.door))) {
              problems.push(`${where} 進了園區或門`);
            }
            // 沒有死路的迷宮裡不會回頭
            if (before !== null && enemy.dir === opposite(before)) problems.push(`${where} 回頭`);
          }
        }
        // 沒有死路也就不會停下來：20 秒一直以每秒 4.05 格的速度前進
        traveled.forEach((distance, i) => {
          if (Math.abs(distance - 4.05 * 20) > 0.01) problems.push(`迷宮 ${mazeIndex} 第 ${i + 1} 隻只走了 ${distance} 格`);
        });
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it('同樣的種子走出同樣的路線', () => {
    const [maze] = validMazes(1);
    if (maze === undefined) throw new Error('沒有迷宮');
    const trace = (): string[] => {
      const rng = createRng(42);
      const enemies = createEnemies(maze.enemySpawns, 3, 0);
      const ctx = context(maze, { x: maze.start.x, y: maze.start.y, dir: null }, rng, { smartRatio: 0.5 });
      const positions: string[] = [];
      for (let i = 0; i < 600; i++) {
        for (const enemy of enemies) updateEnemy(enemy, STEP_MS, ctx);
        positions.push(enemies.map((e) => `${e.x.toFixed(4)},${e.y.toFixed(4)}`).join(' '));
      }
      return positions;
    };
    expect(trace()).toEqual(trace());
  });

  it('速度再快也不會跳過格子中心或穿牆', () => {
    const maze = mazeFrom(['#######', '#.#...#', '#.#.#.#', '#.....#', '#######']);
    const enemy = enemyAt('wanderer', { x: 1, y: 1 });
    const ctx = context(maze, { x: 1, y: 1, dir: null }, createRng(9), { smartRatio: 0, speedTilesPerSec: 90 });
    const visited = new Set<string>();
    for (let i = 0; i < 300; i++) {
      updateEnemy(enemy, STEP_MS, ctx);
      expect(onCorridorLine(maze, enemy)).toBe(true);
      visited.add(`${enemyTile(enemy).x},${enemyTile(enemy).y}`);
    }
    // 真的有在走：每步 1.5 格，繞完整個迴圈的 12 格
    expect(visited.size).toBe(12);
  });
});

describe('決策（§9）', () => {
  const mazes = validMazes(10);

  /** 每個走廊格 × 每個進來的方向 × 隨機的玩家位置，都做一次決策 */
  function* decisions(maze: Maze, rng: Rng): Generator<{ enemy: Enemy; player: Tile; options: Direction[] }> {
    const corridors = corridorTiles(maze);
    for (const tile of corridors) {
      for (const dir of DIRECTIONS) {
        // 只考慮實際走得進來的方向：身後那一格是走廊
        if (!isCorridor(maze, step(tile, opposite(dir)))) continue;
        const options = openDirections(maze, tile, dir);
        if (options.length < 2) continue;
        yield { enemy: enemyAt('chaser', tile, dir), player: rng.pick(corridors), options };
      }
    }
  }

  it('smartRatio = 1 的 chaser 每次決策都選 BFS 最短的方向', () => {
    let count = 0;
    for (const maze of mazes) {
      const rng = createRng(7);
      for (const { enemy, player, options } of decisions(maze, rng)) {
        const ctx = context(maze, { ...player, dir: null }, rng, { smartRatio: 1 });
        const chosen = chooseDirection(enemy, ctx);
        // 另外從玩家跑一次 BFS 驗證，不依賴 shortestDirections
        const distances = bfs(maze.grid, player, (t) => isCorridor(maze, t));
        const here = enemyTile(enemy);
        const best = Math.min(...options.map((d) => distances.get(step(here, d)) ?? Infinity));
        expect(chosen).not.toBeNull();
        if (chosen !== null) expect(distances.get(step(here, chosen))).toBe(best);
        count++;
      }
    }
    expect(count).toBeGreaterThan(500);
  });

  it('smartRatio = 0 時隨機選，不一定是最短的方向', () => {
    let notShortest = 0;
    for (const maze of mazes) {
      const rng = createRng(8);
      for (const { enemy, player, options } of decisions(maze, rng)) {
        const chosen = chooseDirection(enemy, context(maze, { ...player, dir: null }, rng, { smartRatio: 0 }));
        expect(chosen === null ? false : options.includes(chosen)).toBe(true);
        const best = shortestDirections(maze, player, enemyTile(enemy), options);
        if (chosen !== null && !best.includes(chosen)) notShortest++;
      }
    }
    expect(notShortest).toBeGreaterThan(100);
  });

  it('smartRatio = 1 的 chaser 追停著的玩家，走的步數剛好是 BFS 距離', () => {
    for (const maze of mazes) {
      const [spawn] = maze.enemySpawns;
      if (spawn === undefined) continue;
      const enemy = enemyAt('chaser', spawn);
      const player = { x: maze.start.x, y: maze.start.y, dir: null };
      const distance = bfs(maze.grid, spawn, (t) => isCorridor(maze, t)).get(maze.start);
      if (distance === null) throw new Error('到不了起點');
      const ctx = context(maze, player, createRng(1), { speedTilesPerSec: 6 });
      let steps = 0;
      while (Math.hypot(enemy.x - player.x, enemy.y - player.y) > 1e-6 && steps < 10_000) {
        updateEnemy(enemy, STEP_MS, ctx);
        steps++;
      }
      // 每步走 0.1 格；浮點誤差最多差一步
      expect(Math.abs(steps - distance * 10)).toBeLessThanOrEqual(1);
    }
  });

  it('目標是玩家站著的門時，仍然往門外那一格走', () => {
    for (const maze of mazes) {
      const zone = maze.zones[0];
      const [spawn] = maze.enemySpawns;
      if (zone === undefined || spawn === undefined) continue;
      const enemy = enemyAt('chaser', spawn);
      const ctx = context(maze, { ...zone.door, dir: null }, createRng(2), { speedTilesPerSec: 6 });
      const distance = bfs(maze.grid, spawn, (t) => isCorridor(maze, t)).get(zone.outside);
      if (distance === null) throw new Error('到不了門外');
      // 每步走 0.1 格，走最短路線剛好 distance × 10 步到門外
      let steps = 0;
      while (!sameTile(enemyTile(enemy), zone.outside) && steps < 10_000) {
        updateEnemy(enemy, STEP_MS, ctx);
        steps++;
      }
      expect(Math.abs(steps - (distance * 10 - 5))).toBeLessThanOrEqual(1);
    }
  });
});

describe('目標（§9）', () => {
  // 一條橫向走廊，x = 1–7
  const corridor = mazeFrom(['#########', '#.......#', '#########']);

  it('chaser：玩家所在的格子（四捨五入）', () => {
    expect(enemyTarget(enemyAt('chaser', { x: 1, y: 1 }), { x: 2.6, y: 1, dir: 'right' }, corridor, 4)).toEqual({
      x: 3,
      y: 1,
    });
  });

  it('ambusher：玩家前方 4 格', () => {
    expect(enemyTarget(enemyAt('ambusher', { x: 1, y: 1 }), { x: 2, y: 1, dir: 'right' }, corridor, 4)).toEqual({
      x: 6,
      y: 1,
    });
  });

  it('ambusher：碰到牆就停在牆前', () => {
    expect(enemyTarget(enemyAt('ambusher', { x: 1, y: 1 }), { x: 5, y: 1, dir: 'right' }, corridor, 4)).toEqual({
      x: 7,
      y: 1,
    });
  });

  it('ambusher：玩家停著時等同 chaser', () => {
    expect(enemyTarget(enemyAt('ambusher', { x: 1, y: 1 }), { x: 5, y: 1, dir: null }, corridor, 4)).toEqual({
      x: 5,
      y: 1,
    });
  });

  it('ambusher：門也當成牆，目標停在門外', () => {
    for (const maze of validMazes(5)) {
      for (const zone of maze.zones) {
        const player = { ...zone.outside, dir: opposite(zone.doorSide) };
        expect(enemyTarget(enemyAt('ambusher', { x: 1, y: 1 }), player, maze, 4)).toEqual(zone.outside);
      }
    }
  });

  it('wanderer：目標是隨機的走廊格，抵達後換下一個', () => {
    const [maze] = validMazes(1);
    if (maze === undefined) throw new Error('沒有迷宮');
    const [spawn] = maze.enemySpawns;
    if (spawn === undefined) throw new Error('沒有出生點');
    const enemy = wandererAt(spawn);
    const ctx = context(maze, { x: maze.start.x, y: maze.start.y, dir: null }, createRng(5), { smartRatio: 1 });
    const goals: Tile[] = [];
    for (let i = 0; i < 60 * 60; i++) {
      const before = enemy.goal;
      updateEnemy(enemy, STEP_MS, ctx);
      const after = enemy.goal;
      if (after === null || (before !== null && sameTile(before, after))) continue;
      expect(isCorridor(maze, after)).toBe(true);
      // 換目標時一定是剛抵達前一個目標
      if (before !== null) expect(sameTile(enemyTile(enemy), before)).toBe(true);
      goals.push(after);
    }
    expect(goals.length).toBeGreaterThan(3);
    expect(enemyTarget(enemy, ctx.player, maze, 4)).toEqual(enemy.goal);
  });
});
