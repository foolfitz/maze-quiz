import type { Direction } from './types';

/** 格座標（整數），x 向右、y 向下，(0, 0) 在左上角（§6.1） */
export interface Tile {
    readonly x: number;
    readonly y: number;
}

/** 矩形範圍（格），含 (x, y)，寬高至少 1 */
export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export type TileKind = 'wall' | 'floor';

/** 判斷某一格能不能通行，BFS 用 */
export type Passable = (tile: Tile) => boolean;

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

/** 每個方向走一格的位移 */
export const DIRECTION_VECTORS: Readonly<Record<Direction, Tile>> = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};

const OPPOSITES: Readonly<Record<Direction, Direction>> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
};

export function opposite(direction: Direction): Direction {
    return OPPOSITES[direction];
}

export function isHorizontal(direction: Direction): boolean {
    return direction === 'left' || direction === 'right';
}

/** 從 tile 往 direction 走 distance 格 */
export function step(tile: Tile, direction: Direction, distance = 1): Tile {
    const v = DIRECTION_VECTORS[direction];
    return { x: tile.x + v.x * distance, y: tile.y + v.y * distance };
}

/** 浮點數格座標（整數值是格子中心）最接近的格子 */
export function nearestTile(point: {
    readonly x: number;
    readonly y: number;
}): Tile {
    return { x: Math.round(point.x), y: Math.round(point.y) };
}

/**
 * 沿 direction 前進 distance 格，但最多走到下一個格子中心；回傳還沒走完的距離。
 * 玩家與敵人共用：每走到一個中心就停下來，讓呼叫的人檢查轉向或做決策，速度再快也不會跳過中心點或穿牆。
 * position 必須在走廊中央線上（與方向垂直的座標是整數）。
 */
export function advanceToNextCenter(
    position: { x: number; y: number },
    direction: Direction,
    distance: number,
): number {
    const horizontal = isHorizontal(direction);
    const along = horizontal ? position.x : position.y;
    const sign =
        DIRECTION_VECTORS[direction].x + DIRECTION_VECTORS[direction].y; // +1 或 -1
    const center = sign > 0 ? Math.floor(along) + 1 : Math.ceil(along) - 1;
    const gap = Math.abs(center - along);
    // 走到中心時直接設成整數，避免浮點誤差累積
    const next = distance >= gap ? center : along + sign * distance;
    if (horizontal) position.x = next;
    else position.y = next;
    return distance - Math.min(distance, gap);
}

export function sameTile(a: Tile, b: Tile): boolean {
    return a.x === b.x && a.y === b.y;
}

export function manhattan(a: Tile, b: Tile): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function inRect(tile: Tile, rect: Rect): boolean {
    return (
        tile.x >= rect.x &&
        tile.x < rect.x + rect.width &&
        tile.y >= rect.y &&
        tile.y < rect.y + rect.height
    );
}

/** 往四周各擴大 margin 格 */
export function expandRect(rect: Rect, margin: number): Rect {
    return {
        x: rect.x - margin,
        y: rect.y - margin,
        width: rect.width + margin * 2,
        height: rect.height + margin * 2,
    };
}

/** 矩形裡的所有格子，由上而下、由左而右 */
export function rectTiles(rect: Rect): Tile[] {
    const tiles: Tile[] = [];
    for (let y = rect.y; y < rect.y + rect.height; y++) {
        for (let x = rect.x; x < rect.x + rect.width; x++) tiles.push({ x, y });
    }
    return tiles;
}

/** 迷宮的格子：每格不是牆就是地板。超出範圍的格子一律當成牆。 */
export class Grid {
    readonly width: number;
    readonly height: number;
    private readonly tiles: TileKind[];

    constructor(width: number, height: number, fill: TileKind = 'wall') {
        if (
            !Number.isInteger(width) ||
            !Number.isInteger(height) ||
            width <= 0 ||
            height <= 0
        ) {
            throw new RangeError(
                `格子大小必須是正整數，收到 ${width}×${height}`,
            );
        }
        this.width = width;
        this.height = height;
        this.tiles = Array.from(
            { length: width * height },
            (): TileKind => fill,
        );
    }

    clone(): Grid {
        const copy = new Grid(this.width, this.height);
        this.tiles.forEach((kind, i) => {
            copy.tiles[i] = kind;
        });
        return copy;
    }

    inBounds(tile: Tile): boolean {
        return (
            tile.x >= 0 &&
            tile.x < this.width &&
            tile.y >= 0 &&
            tile.y < this.height
        );
    }

    /** 是否在最外圈（外框） */
    onBorder(tile: Tile): boolean {
        return (
            tile.x === 0 ||
            tile.y === 0 ||
            tile.x === this.width - 1 ||
            tile.y === this.height - 1
        );
    }

    get(tile: Tile): TileKind {
        if (!this.inBounds(tile)) return 'wall';
        return this.tiles[this.indexOf(tile)] ?? 'wall';
    }

    set(tile: Tile, kind: TileKind): void {
        if (!this.inBounds(tile))
            throw new RangeError(`(${tile.x}, ${tile.y}) 超出迷宮範圍`);
        this.tiles[this.indexOf(tile)] = kind;
    }

    isFloor(tile: Tile): boolean {
        return this.get(tile) === 'floor';
    }

    /** 由上而下、由左而右的所有格子 */
    allTiles(): Tile[] {
        return rectTiles({
            x: 0,
            y: 0,
            width: this.width,
            height: this.height,
        });
    }

    /** 四個方向中，可以通行的相鄰格數量 */
    countOpenNeighbors(
        tile: Tile,
        passable: Passable = (t) => this.isFloor(t),
    ): number {
        return DIRECTIONS.filter((d) => passable(step(tile, d))).length;
    }

    indexOf(tile: Tile): number {
        return tile.y * this.width + tile.x;
    }
}

/** BFS 的結果：從起點到每一格的步數 */
export class DistanceField {
    readonly width: number;
    readonly height: number;
    private readonly distances: Int32Array; // -1 表示到不了

    constructor(width: number, height: number, distances: Int32Array) {
        this.width = width;
        this.height = height;
        this.distances = distances;
    }

    /** 到不了或超出範圍時回傳 null */
    get(tile: Tile): number | null {
        if (
            tile.x < 0 ||
            tile.x >= this.width ||
            tile.y < 0 ||
            tile.y >= this.height
        )
            return null;
        const d = this.distances[tile.y * this.width + tile.x] ?? -1;
        return d < 0 ? null : d;
    }
}

/** 從 start 開始的廣度優先搜尋；預設地板都能走 */
export function bfs(
    grid: Grid,
    start: Tile,
    passable: Passable = (t) => grid.isFloor(t),
): DistanceField {
    const distances = new Int32Array(grid.width * grid.height).fill(-1);
    if (!grid.inBounds(start) || !passable(start)) {
        return new DistanceField(grid.width, grid.height, distances);
    }

    const queue: Tile[] = [start];
    distances[grid.indexOf(start)] = 0;
    // 用索引往前讀，不用 shift()，避免每次都搬動整個陣列
    for (let head = 0; head < queue.length; head++) {
        const current = queue[head];
        if (current === undefined) break;
        const nextDistance = (distances[grid.indexOf(current)] ?? 0) + 1;
        for (const direction of DIRECTIONS) {
            const neighbor = step(current, direction);
            if (!grid.inBounds(neighbor) || !passable(neighbor)) continue;
            const index = grid.indexOf(neighbor);
            if (distances[index] !== -1) continue;
            distances[index] = nextDistance;
            queue.push(neighbor);
        }
    }
    return new DistanceField(grid.width, grid.height, distances);
}
