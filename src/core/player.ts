import { CONFIG } from '../config';
import {
    advanceToNextCenter,
    isHorizontal,
    nearestTile,
    opposite,
    step,
    type Passable,
    type Tile,
} from './grid';
import type { Direction } from './types';

export interface PlayerConfig {
    readonly speedTilesPerSec: number;
    readonly turnTolerance: number; // 格；距格子中心多近可以轉向
    readonly inputGraceMs: number; // 轉向指令的暫存時間
}

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = CONFIG.player;

/**
 * 玩家狀態。位置是浮點數格座標，整數值代表格子中心（§6.1）。
 * 玩家只會沿走廊中央移動：往左右走時 y 一定是整數，往上下走時 x 一定是整數。
 */
export interface Player {
    x: number;
    y: number;
    dir: Direction | null; // 目前方向；null 表示停著（一定停在格子中心）
    pendingDir: Direction | null; // 等待轉向的方向（§7.2 第 4 點）
    pendingMs: number; // pendingDir 還能保留多久
}

export function createPlayer(start: Tile): Player {
    return {
        x: start.x,
        y: start.y,
        dir: null,
        pendingDir: null,
        pendingMs: 0,
    };
}

/** 玩家中心所在的格子 */
export function playerTile(player: Player): Tile {
    return nearestTile(player);
}

/** 收到方向指令後發生了什麼；介面依此決定要不要播放碰壁回饋 */
export type TurnResult =
    | 'reversed' // 與目前方向相反，立刻迴轉
    | 'started' // 原本停著，出發
    | 'turned' // 靠近格子中心，吸附後轉向
    | 'queued' // 暫存起來，寬限時間內經過可以轉的格子中心就轉
    | 'bumped' // 停著而且那個方向是牆：不動，給碰壁回饋
    | 'ignored'; // 與目前方向相同

/** 處理一次方向指令（§7.2）。passable 判斷哪些格子可以走。 */
export function requestDirection(
    player: Player,
    direction: Direction,
    passable: Passable,
    config: PlayerConfig = DEFAULT_PLAYER_CONFIG,
): TurnResult {
    const { dir } = player;

    // 1. 與目前方向相反：立刻迴轉
    if (dir !== null && direction === opposite(dir)) {
        player.dir = direction;
        clearPending(player);
        return 'reversed';
    }

    // 2. 停著：那個方向可以走就出發，是牆就忽略
    if (dir === null) {
        if (!passable(step(playerTile(player), direction))) return 'bumped';
        player.dir = direction;
        clearPending(player);
        return 'started';
    }

    if (direction === dir) return 'ignored';

    // 3. 與目前方向垂直，而且離某個格子中心夠近、那一格往新方向可以走：吸附並轉向
    const horizontal = isHorizontal(dir);
    const along = horizontal ? player.x : player.y;
    const nearest = Math.round(along);
    if (Math.abs(along - nearest) <= config.turnTolerance) {
        const center: Tile = horizontal
            ? { x: nearest, y: player.y }
            : { x: player.x, y: nearest };
        if (passable(step(center, direction))) {
            player.x = center.x;
            player.y = center.y;
            player.dir = direction;
            clearPending(player);
            return 'turned';
        }
    }

    // 4. 以上都不成立：暫存，只保留 inputGraceMs
    player.pendingDir = direction;
    player.pendingMs = config.inputGraceMs;
    return 'queued';
}

/**
 * 依目前方向前進 dtMs 毫秒（§7.1）。
 * 一段一段走到下一個格子中心，每個中心都停下來檢查，所以速度再快也不會跳過中心點或穿牆。
 */
export function updatePlayer(
    player: Player,
    dtMs: number,
    passable: Passable,
    config: PlayerConfig = DEFAULT_PLAYER_CONFIG,
): void {
    let remaining = (config.speedTilesPerSec * dtMs) / 1000;

    while (player.dir !== null && remaining > 0) {
        const dir: Direction = player.dir;
        const horizontal = isHorizontal(dir);
        const along = horizontal ? player.x : player.y;

        if (Number.isInteger(along)) {
            // 在格子中心：先看有沒有等待中的轉向，再看前方是不是牆
            const here = playerTile(player);
            const pending = player.pendingDir;
            if (pending !== null && passable(step(here, pending))) {
                player.dir = pending;
                clearPending(player);
                continue;
            }
            if (!passable(step(here, dir))) {
                // 前方是牆：停在這一格中心，不自動轉彎
                player.dir = null;
                clearPending(player);
                break;
            }
        }

        // 往前走，最多走到下一個格子中心
        remaining = advanceToNextCenter(player, dir, remaining);
    }

    // 寬限時間倒數；這一步經過的格子中心已經在上面檢查過了
    if (player.pendingDir !== null) {
        player.pendingMs -= dtMs;
        if (player.pendingMs <= 0) clearPending(player);
    }
}

function clearPending(player: Player): void {
    player.pendingDir = null;
    player.pendingMs = 0;
}
