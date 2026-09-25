import { CONFIG } from '../config';
import {
  advanceToNextCenter,
  bfs,
  DIRECTIONS,
  nearestTile,
  opposite,
  sameTile,
  step,
  type Passable,
  type Tile,
} from './grid';
import { isCorridor, type Maze } from './maze';
import type { Rng } from './rng';
import { assertNever, type Direction } from './types';

// ─── 設定 ────────────────────────────────────────────────────

export interface EnemyConfig {
  readonly releaseDelayMs: number; // 每關開始與玩家重生後，等多久才開始移動
  readonly ambushLookahead: number; // ambusher 的目標在玩家前方幾格
}

export const DEFAULT_ENEMY_CONFIG: EnemyConfig = CONFIG.enemy;

/** 難度表的一列（附錄 A） */
export interface DifficultyRow {
  readonly enemyCount: number;
  readonly enemySpeedRatio: number; // 相對於玩家速度的比例
  readonly smartRatio: number; // 選「到目標最短」方向的機率
}

// ─── 敵人 ────────────────────────────────────────────────────

/** 三種行為，依序分配給第 1、2、3 隻（§9） */
export const ENEMY_KINDS = ['chaser', 'wanderer', 'ambusher'] as const;
export type EnemyKind = (typeof ENEMY_KINDS)[number];

/**
 * 三種敵人共有的狀態。位置和玩家一樣是浮點數格座標，整數值代表格子中心，
 * 而且只沿走廊中央移動：往左右走時 y 一定是整數，往上下走時 x 一定是整數。
 */
interface EnemyBase {
  readonly spawn: Tile; // 出生點；玩家重生時回到這裡
  x: number;
  y: number;
  dir: Direction | null; // null 表示還沒出發（一定在格子中心）
  releaseMs: number; // 還要等多久才開始移動
}

/**
 * 敵人：以 kind 區分的 discriminated union。只有 wanderer 有自己的目標 goal，
 * 所以要先用 `enemy.kind === 'wanderer'` 確認種類，TypeScript 才允許讀寫 goal。
 */
export type Enemy =
  | (EnemyBase & { readonly kind: 'chaser' })
  | (EnemyBase & { readonly kind: 'wanderer'; goal: Tile | null }) // 目前要去的走廊格；還沒選時是 null
  | (EnemyBase & { readonly kind: 'ambusher' });

/** 敵人需要知道的玩家資訊 */
export interface PlayerPosition {
  readonly x: number;
  readonly y: number;
  readonly dir: Direction | null;
}

/** 更新敵人時需要的外部資訊 */
export interface EnemyContext {
  readonly maze: Maze;
  readonly player: PlayerPosition;
  readonly rng: Rng;
  readonly speedTilesPerSec: number;
  readonly smartRatio: number;
  readonly ambushLookahead: number;
}

/** 在出生點建立一隻 kind 種類的敵人，先等待 releaseDelayMs */
export function createEnemy(kind: EnemyKind, spawn: Tile, releaseDelayMs: number): Enemy {
  const base: EnemyBase = { spawn, x: spawn.x, y: spawn.y, dir: null, releaseMs: releaseDelayMs };
  return kind === 'wanderer' ? { ...base, kind, goal: null } : { ...base, kind };
}

/** 依出生點建立前 count 隻敵人；出生點不夠時就少放幾隻 */
export function createEnemies(spawns: readonly Tile[], count: number, releaseDelayMs: number): Enemy[] {
  return ENEMY_KINDS.slice(0, count).flatMap((kind, i) => {
    const spawn = spawns[i];
    return spawn === undefined ? [] : [createEnemy(kind, spawn, releaseDelayMs)];
  });
}

/** 回到出生點，重新等待（§10） */
export function resetEnemy(enemy: Enemy, releaseDelayMs: number): void {
  enemy.x = enemy.spawn.x;
  enemy.y = enemy.spawn.y;
  enemy.dir = null;
  enemy.releaseMs = releaseDelayMs;
  if (enemy.kind === 'wanderer') enemy.goal = null;
}

/** 敵人中心所在的格子 */
export function enemyTile(enemy: Enemy): Tile {
  return nearestTile(enemy);
}

/** 敵人能走的格子：只有走廊，園區內部與門一律當成牆（§8） */
export function enemyPassable(maze: Maze): Passable {
  return (tile) => isCorridor(maze, tile);
}

/**
 * 在格子中心可以走的方向：可以通行、而且不是回頭（§9）。
 * 還沒出發（dir 是 null）時四個方向都算；死路時只能回頭。
 */
export function openDirections(maze: Maze, tile: Tile, dir: Direction | null): Direction[] {
  const passable = enemyPassable(maze);
  const back = dir === null ? null : opposite(dir);
  const forward = DIRECTIONS.filter((d) => d !== back && passable(step(tile, d)));
  if (forward.length > 0 || back === null) return forward;
  return passable(step(tile, back)) ? [back] : [];
}

/**
 * 敵人目前的目標格（§9）；wanderer 還沒選目標時是 null。
 * - chaser：玩家所在的格子。
 * - wanderer：自己選的隨機走廊格。
 * - ambusher：玩家前方 ambushLookahead 格，碰到牆就停在牆前；玩家停著時等同 chaser。
 */
export function enemyTarget(enemy: Enemy, player: PlayerPosition, maze: Maze, ambushLookahead: number): Tile | null {
  const playerTile = nearestTile(player);
  switch (enemy.kind) {
    case 'chaser':
      return playerTile;
    case 'wanderer':
      return enemy.goal; // 這個 case 裡 TypeScript 知道 enemy 是 wanderer，才能讀 goal
    case 'ambusher': {
      if (player.dir === null) return playerTile;
      const passable = enemyPassable(maze);
      let target = playerTile;
      for (let i = 0; i < ambushLookahead; i++) {
        const next = step(target, player.dir);
        if (!passable(next)) break;
        target = next;
      }
      return target;
    }
    default:
      return assertNever(enemy);
  }
}

/**
 * 在格子中心決定下一步的方向（§9）：可以走的方向只有一個就直接走；
 * 兩個以上時，以 smartRatio 的機率選到目標 BFS 距離最短的方向，否則隨機選一個。
 * 無路可走時回傳 null。
 */
export function chooseDirection(enemy: Enemy, ctx: EnemyContext): Direction | null {
  const here = enemyTile(enemy);
  const options = openDirections(ctx.maze, here, enemy.dir);
  const [only] = options;
  if (only === undefined) return null;
  if (options.length === 1) return only;

  const target = enemyTarget(enemy, ctx.player, ctx.maze, ctx.ambushLookahead);
  if (target !== null && ctx.rng.chance(ctx.smartRatio)) {
    const best = shortestDirections(ctx.maze, target, here, options);
    // 一樣短的方向不只一個時隨機選；目標到不了時退回隨機
    if (best.length > 0) return ctx.rng.pick(best);
  }
  return ctx.rng.pick(options);
}

/**
 * options 裡走一步之後離 target 最近的方向（可能不只一個）。
 * 從目標跑一次 BFS；目標本身不是走廊時（例如玩家站在門上）也從它開始算，這樣門外那一格仍然有距離。
 */
export function shortestDirections(maze: Maze, target: Tile, from: Tile, options: readonly Direction[]): Direction[] {
  const passable = enemyPassable(maze);
  const distances = bfs(maze.grid, target, (tile) => passable(tile) || sameTile(tile, target));
  let best: Direction[] = [];
  let bestDistance = Infinity;
  for (const direction of options) {
    const distance = distances.get(step(from, direction));
    if (distance === null) continue;
    if (distance < bestDistance) {
      best = [direction];
      bestDistance = distance;
    } else if (distance === bestDistance) {
      best.push(direction);
    }
  }
  return best;
}

/**
 * 前進 dtMs 毫秒。每經過一個格子中心就停下來決定方向，所以速度再快也不會跳過中心點或穿牆。
 * 出生後先等 releaseMs 才開始移動。
 */
export function updateEnemy(enemy: Enemy, dtMs: number, ctx: EnemyContext): void {
  if (enemy.releaseMs > 0) {
    enemy.releaseMs = Math.max(0, enemy.releaseMs - dtMs);
    return;
  }

  let remaining = (ctx.speedTilesPerSec * dtMs) / 1000;
  while (remaining > 0) {
    if (Number.isInteger(enemy.x) && Number.isInteger(enemy.y)) {
      // 在格子中心：wanderer 抵達目標（或還沒有目標）就換下一個，然後決定方向
      const here = enemyTile(enemy);
      if (enemy.kind === 'wanderer' && (enemy.goal === null || sameTile(enemy.goal, here))) {
        enemy.goal = pickWandererGoal(ctx.maze, here, ctx.rng);
      }
      enemy.dir = chooseDirection(enemy, ctx);
    }
    if (enemy.dir === null) break; // 無路可走
    remaining = advanceToNextCenter(enemy, enemy.dir, remaining);
  }
}

/** wanderer 的下一個目標：隨機一個走廊格，不選自己所在的格子 */
function pickWandererGoal(maze: Maze, here: Tile, rng: Rng): Tile | null {
  const passable = enemyPassable(maze);
  const candidates = maze.grid.allTiles().filter((tile) => passable(tile) && !sameTile(tile, here));
  return candidates.length === 0 ? null : rng.pick(candidates);
}
