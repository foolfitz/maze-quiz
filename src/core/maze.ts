import { CONFIG, DIFFICULTY_TABLE } from '../config';
import {
    bfs,
    DIRECTIONS,
    expandRect,
    Grid,
    inRect,
    rectTiles,
    sameTile,
    step,
    type Passable,
    type Rect,
    type Tile,
} from './grid';
import { createRng, hashSeed, type Rng } from './rng';
import { assertNever, type Direction } from './types';

// ─── 設定 ────────────────────────────────────────────────────

export interface MazeConfig {
    readonly width: number; // 奇數
    readonly height: number; // 奇數
    readonly zoneInterior: number; // 園區內部邊長，奇數
    readonly deadEndRemoval: number; // 0–1
    readonly fairnessMaxRatio: number;
    readonly minStartToZone: number;
    readonly maxAttempts: number;
    readonly spawnMinDistance: number;
    readonly spawnCount: number; // 產生幾個敵人出生點
}

export const DEFAULT_MAZE_CONFIG: MazeConfig = {
    ...CONFIG.maze,
    spawnMinDistance: CONFIG.enemy.spawnMinDistance,
    // 出生點一律依最高難度的敵人數量產生，這樣同一個種子在不同難度下是同一張迷宮
    spawnCount: Math.max(
        ...Object.values(DIFFICULTY_TABLE).map((row) => row.enemyCount),
    ),
};

// ─── 答案區的位置（§6.2）─────────────────────────────────────

export type ZoneSlot =
    | 'topLeft'
    | 'topRight'
    | 'bottomLeft'
    | 'bottomRight'
    | 'left'
    | 'right'
    | 'top'
    | 'bottom';

export type ZoneCount = 2 | 3 | 4 | 5 | 6;

export function isZoneCount(value: number): value is ZoneCount {
    return (
        value === 2 || value === 3 || value === 4 || value === 5 || value === 6
    );
}

/**
 * 選項數 → 使用的位置。`satisfies` 會檢查每個 key 都有、值的型別正確，
 * 但保留 `as const` 推導出來的精確型別。
 */
export const ZONE_LAYOUTS = {
    2: ['left', 'right'],
    3: ['topLeft', 'topRight', 'bottom'],
    4: ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'],
    5: ['topLeft', 'topRight', 'bottomLeft', 'bottomRight', 'top'],
    6: ['topLeft', 'topRight', 'bottomLeft', 'bottomRight', 'left', 'right'],
} as const satisfies Readonly<Record<ZoneCount, readonly ZoneSlot[]>>;

type Column = 'left' | 'center' | 'right';
type Row = 'top' | 'middle' | 'bottom';

const SLOT_POSITIONS: Readonly<
    Record<ZoneSlot, { readonly column: Column; readonly row: Row }>
> = {
    topLeft: { column: 'left', row: 'top' },
    topRight: { column: 'right', row: 'top' },
    bottomLeft: { column: 'left', row: 'bottom' },
    bottomRight: { column: 'right', row: 'bottom' },
    left: { column: 'left', row: 'middle' },
    right: { column: 'right', row: 'middle' },
    top: { column: 'center', row: 'top' },
    bottom: { column: 'center', row: 'bottom' },
};

// ─── 迷宮資料 ────────────────────────────────────────────────

export interface Zone {
    readonly slot: ZoneSlot;
    readonly choiceIndex: number; // 放在這一區的選項（題目 choices 的索引）
    readonly rect: Rect; // 內部地板
    readonly doorSide: Direction; // 門開在園區的哪一側
    readonly door: Tile; // 門所在的格子（在園區外圍那圈牆上）
    readonly outside: Tile; // 門外相鄰的走廊格
}

export interface Maze {
    readonly grid: Grid;
    /** zones[i] 放的是第 i 個選項，也就是 zones[i].choiceIndex === i */
    readonly zones: readonly Zone[];
    readonly start: Tile;
    readonly enemySpawns: readonly Tile[];
}

/** 不符合 §6.4 驗證條件的項目 */
export type MazeViolation =
    | { readonly kind: 'disconnected'; readonly unreachable: number }
    | { readonly kind: 'badDoor'; readonly zoneIndex: number }
    | { readonly kind: 'wideArea'; readonly at: Tile }
    | { readonly kind: 'deadEnd'; readonly at: Tile }
    | {
          readonly kind: 'unfair';
          readonly ratio: number;
          readonly limit: number;
      }
    | {
          readonly kind: 'zoneTooClose';
          readonly distance: number;
          readonly limit: number;
      }
    | {
          readonly kind: 'notEnoughSpawns';
          readonly found: number;
          readonly needed: number;
      };

export interface MazeResult {
    readonly maze: Maze;
    readonly seed: number; // 採用的這一張的 levelSeed
    readonly attempt: number; // 第幾次嘗試，從 0 開始
    /** 空陣列表示條件全部成立；否則是「採用最接近條件的一張」 */
    readonly violations: readonly MazeViolation[];
}

// ─── 查詢 ────────────────────────────────────────────────────

/** 玩家中心所在的園區（內部），不在任何園區裡時回傳 null。門不算園區內部（§8）。 */
export function zoneIndexAt(maze: Maze, tile: Tile): number | null {
    const index = maze.zones.findIndex((zone) => inRect(tile, zone.rect));
    return index === -1 ? null : index;
}

/** 園區內部或門 */
function isZoneTile(
    zones: readonly Pick<Zone, 'rect' | 'door'>[],
    tile: Tile,
): boolean {
    return zones.some(
        (zone) => inRect(tile, zone.rect) || sameTile(zone.door, tile),
    );
}

/** 走廊：園區以外的地板。敵人只能走走廊（§8）。 */
export function isCorridor(maze: Maze, tile: Tile): boolean {
    return maze.grid.isFloor(tile) && !isZoneTile(maze.zones, tile);
}

// ─── 生成（§6.3）────────────────────────────────────────────

/**
 * 生成一關的迷宮。每次嘗試用 hashSeed(seed, levelIndex, attempt) 當種子，
 * 不符合驗證條件就換下一個 attempt；全部失敗時採用最接近條件的一張（§6.4）。
 */
export function generateLevelMaze(
    baseSeed: number,
    levelIndex: number,
    zoneCount: ZoneCount,
    config: MazeConfig = DEFAULT_MAZE_CONFIG,
): MazeResult {
    let best: { result: MazeResult; penalty: number } | null = null;
    for (
        let attempt = 0;
        attempt < Math.max(1, config.maxAttempts);
        attempt++
    ) {
        const seed = hashSeed(baseSeed, levelIndex, attempt);
        const maze = buildMaze(createRng(seed), zoneCount, config);
        const violations = checkMaze(maze, config);
        const result: MazeResult = { maze, seed, attempt, violations };
        if (violations.length === 0) return result;

        const penalty = violations.reduce(
            (sum, v) => sum + violationPenalty(v),
            0,
        );
        if (best === null || penalty < best.penalty) best = { result, penalty };
    }
    if (best === null) throw new Error('迷宮生成失敗：maxAttempts 至少要是 1');
    return best.result;
}

/** 依 §6.3 的步驟生成一張迷宮（不做驗證） */
export function buildMaze(
    rng: Rng,
    zoneCount: ZoneCount,
    config: MazeConfig,
): Maze {
    assertValidConfig(config);
    const grid = new Grid(config.width, config.height, 'wall');

    // 1–2. 全部填牆，挖出園區
    const shapes = placeZones(ZONE_LAYOUTS[zoneCount], config, rng);
    for (const shape of shapes) {
        for (const tile of rectTiles(shape.rect)) grid.set(tile, 'floor');
        grid.set(shape.door, 'floor');
    }

    // 3. 在其餘區域挖出完美迷宮
    carvePerfectMaze(grid, shapes, rng);

    // 4. 移除死路
    removeDeadEnds(grid, shapes, config.deadEndRemoval, rng);

    // 5. 起點：最接近正中央的走廊格
    const isCorridorTile = (tile: Tile): boolean =>
        grid.isFloor(tile) && !isZoneTile(shapes, tile);
    const start = pickStart(
        grid.allTiles().filter(isCorridorTile),
        config,
        rng,
    );

    // 5½. 調整走廊，讓起點到各答案區的距離符合公平性條件（規格沒有這一步，見 DECISIONS.md）
    balanceDistances(grid, shapes, start, config, rng);

    // 選項隨機分配到位置上：打亂園區的順序，第 i 個園區就放第 i 個選項
    const zones: Zone[] = rng
        .shuffle(shapes)
        .map((shape, choiceIndex) => ({ ...shape, choiceIndex }));

    // 6. 敵人出生點
    const corridors = grid.allTiles().filter(isCorridorTile);
    const enemySpawns = pickSpawns(grid, zones, corridors, start, config, rng);

    return { grid, zones, start, enemySpawns };
}

function assertValidConfig(config: MazeConfig): void {
    const { width, height, zoneInterior } = config;
    const isOdd = (n: number): boolean => Number.isInteger(n) && n % 2 === 1;
    if (!isOdd(width) || !isOdd(height)) {
        throw new RangeError(`迷宮的寬高必須是奇數，目前是 ${width}×${height}`);
    }
    if (!isOdd(zoneInterior) || zoneInterior < 3) {
        throw new RangeError(
            `園區內部邊長必須是 3 以上的奇數，目前是 ${zoneInterior}`,
        );
    }
}

/** 還沒分配選項的園區 */
type ZoneShape = Omit<Zone, 'choiceIndex'>;

/** 小於等於 n 的最大奇數 */
function alignOddDown(n: number): number {
    return Math.abs(n % 2) === 1 ? n : n - 1;
}

function slotRect(slot: ZoneSlot, config: MazeConfig): Rect {
    const { width, height, zoneInterior: size } = config;
    const { column, row } = SLOT_POSITIONS[slot];
    const half = (size - 1) / 2;
    const xs: Record<Column, number> = {
        left: 1,
        center: alignOddDown((width - 1) / 2 - half),
        right: width - 1 - size,
    };
    const ys: Record<Row, number> = {
        top: 1,
        middle: alignOddDown((height - 1) / 2 - half),
        bottom: height - 1 - size,
    };
    return { x: xs[column], y: ys[row], width: size, height: size };
}

/** 朝向迷宮中央的那一側；角落有兩個選擇 */
function doorSideOptions(slot: ZoneSlot): Direction[] {
    const { column, row } = SLOT_POSITIONS[slot];
    const sides: Direction[] = [];
    if (column === 'left') sides.push('right');
    if (column === 'right') sides.push('left');
    if (row === 'top') sides.push('down');
    if (row === 'bottom') sides.push('up');
    return sides;
}

/** 某一側牆上可以開門的位置：對齊奇數格點，門外剛好是一個迷宮 cell */
function doorCandidates(
    rect: Rect,
    side: Direction,
): { door: Tile; outside: Tile }[] {
    const candidates: { door: Tile; outside: Tile }[] = [];
    const horizontal = side === 'left' || side === 'right';
    const length = horizontal ? rect.height : rect.width;
    for (let offset = 0; offset < length; offset += 2) {
        let door: Tile;
        if (side === 'left') door = { x: rect.x - 1, y: rect.y + offset };
        else if (side === 'right')
            door = { x: rect.x + rect.width, y: rect.y + offset };
        else if (side === 'up') door = { x: rect.x + offset, y: rect.y - 1 };
        else door = { x: rect.x + offset, y: rect.y + rect.height };
        candidates.push({ door, outside: step(door, side) });
    }
    return candidates;
}

function placeZones(
    slots: readonly ZoneSlot[],
    config: MazeConfig,
    rng: Rng,
): ZoneShape[] {
    const placed = slots.map((slot) => ({
        slot,
        rect: slotRect(slot, config),
    }));

    // 園區之間可以共用外圍的牆，但內部不能相鄰或重疊
    for (const a of placed) {
        for (const b of placed) {
            if (a === b) continue;
            if (
                rectTiles(a.rect).some((tile) =>
                    inRect(tile, expandRect(b.rect, 1)),
                )
            ) {
                throw new RangeError(
                    `迷宮 ${config.width}×${config.height} 太小，園區 ${a.slot} 和 ${b.slot} 重疊`,
                );
            }
        }
    }

    const center: Tile = {
        x: (config.width - 1) / 2,
        y: (config.height - 1) / 2,
    };
    const isMazeCell = (tile: Tile): boolean =>
        tile.x >= 1 &&
        tile.y >= 1 &&
        tile.x <= config.width - 2 &&
        tile.y <= config.height - 2 &&
        !placed.some((other) => inRect(tile, other.rect));
    const pockets = findPockets(config, isMazeCell);
    const inPocket = (tile: Tile): boolean =>
        pockets.has(tile.y * config.width + tile.x);

    return placed.map(({ slot, rect }) => {
        // 角落的園區隨機選水平或垂直；選到的那一側開不了門（門外是別的園區或凹槽）就換另一側
        for (const side of rng.shuffle(doorSideOptions(slot))) {
            const candidates = doorCandidates(rect, side).filter(
                (c) => isMazeCell(c.outside) && !inPocket(c.outside),
            );
            if (candidates.length === 0) continue;
            // 同一側有幾個位置可以開門時，選門外最靠近中央的；一樣近就隨機
            const distance = (c: { outside: Tile }): number =>
                (c.outside.x - center.x) ** 2 + (c.outside.y - center.y) ** 2;
            const nearest = Math.min(...candidates.map(distance));
            const chosen = rng.pick(
                candidates.filter((c) => distance(c) === nearest),
            );
            return {
                slot,
                rect,
                doorSide: side,
                door: chosen.door,
                outside: chosen.outside,
            };
        }
        throw new RangeError(`園區 ${slot} 找不到可以開門的位置`);
    });
}

/**
 * 找出凹槽：能連到的其他 cell 不到兩個的 cell（例如夾在兩個園區之間、貼著外框的那一格）。
 * 凹槽在移除死路時會被填成牆，所以門不能開向凹槽，否則門外那一格只剩一條走廊。
 * 一個 cell 被判定為凹槽後，它的鄰居可能也變成凹槽，所以反覆檢查到沒有變化為止。
 * 回傳格子索引（y * width + x）的集合。
 */
function findPockets(
    config: MazeConfig,
    isMazeCell: (tile: Tile) => boolean,
): Set<number> {
    const index = (tile: Tile): number => tile.y * config.width + tile.x;
    const cells: Tile[] = [];
    for (let y = 1; y < config.height - 1; y += 2) {
        for (let x = 1; x < config.width - 1; x += 2) {
            if (isMazeCell({ x, y })) cells.push({ x, y });
        }
    }
    const pockets = new Set<number>();
    for (let changed = true; changed;) {
        changed = false;
        for (const cell of cells) {
            if (pockets.has(index(cell))) continue;
            const exits = DIRECTIONS.filter((d) => {
                const next = step(cell, d, 2);
                return isMazeCell(next) && !pockets.has(index(next));
            });
            if (exits.length <= 1) {
                pockets.add(index(cell));
                changed = true;
            }
        }
    }
    return pockets;
}

/** recursive backtracker：在奇數格點（cell）上挖出完美迷宮，園區內部不挖 */
function carvePerfectMaze(
    grid: Grid,
    zones: readonly ZoneShape[],
    rng: Rng,
): void {
    const isCell = (tile: Tile): boolean =>
        tile.x % 2 === 1 &&
        tile.y % 2 === 1 &&
        tile.x < grid.width - 1 &&
        tile.y < grid.height - 1 &&
        !zones.some((zone) => inRect(tile, zone.rect));

    const cells = grid.allTiles().filter(isCell);
    const visited = new Set<number>();
    const first = rng.pick(cells);
    const stack: Tile[] = [first];
    visited.add(grid.indexOf(first));
    grid.set(first, 'floor');

    // 不用 stack.at(-1)：Array.prototype.at 要 iPadOS 15.4 以上
    for (
        let current = stack[stack.length - 1];
        current !== undefined;
        current = stack[stack.length - 1]
    ) {
        const here = current; // 讓 filter 的 callback 拿到確定不是 undefined 的值
        const options = DIRECTIONS.filter((d) => {
            const next = step(here, d, 2);
            return isCell(next) && !visited.has(grid.indexOf(next));
        });
        if (options.length === 0) {
            stack.pop();
            continue;
        }
        const direction = rng.pick(options);
        const next = step(here, direction, 2);
        grid.set(step(here, direction), 'floor');
        grid.set(next, 'floor');
        visited.add(grid.indexOf(next));
        stack.push(next);
    }
}

/**
 * 對每個死路（只有一個方向接到走廊的走廊格）打通一面牆接到相鄰走廊，比例由 ratio 決定。
 * 門不算通路：敵人把門當成牆（§8），答錯封門後玩家也會被放在門外，所以門外那一格也要有兩條走廊。
 * 外框與園區的牆不能打通；如果某個死路四周只剩這種牆（例如夾在兩個園區之間的凹槽），
 * 就把它填回牆，再檢查它的鄰居是不是變成了新的死路。
 */
function removeDeadEnds(
    grid: Grid,
    zones: readonly ZoneShape[],
    ratio: number,
    rng: Rng,
): void {
    const corridor: Passable = (tile) =>
        grid.isFloor(tile) && !isZoneTile(zones, tile);
    const isOutside = (tile: Tile): boolean =>
        zones.some((zone) => sameTile(zone.outside, tile));
    const isDeadEnd = (tile: Tile): boolean =>
        corridor(tile) && grid.countOpenNeighbors(tile, corridor) <= 1;
    // 園區內部與外圍那圈牆
    const isProtected = (tile: Tile): boolean =>
        grid.onBorder(tile) ||
        zones.some((zone) => inRect(tile, expandRect(zone.rect, 1)));

    const canOpen = (tile: Tile, direction: Direction): boolean => {
        const wall = step(tile, direction);
        const beyond = step(tile, direction, 2);
        return (
            !grid.isFloor(wall) &&
            grid.inBounds(wall) &&
            !isProtected(wall) &&
            grid.isFloor(beyond) &&
            !isZoneTile(zones, beyond)
        );
    };

    // forced 為 true 的是「因為填牆而新產生的死路」，一定要處理，不再抽比例
    const queue = rng
        .shuffle(grid.allTiles().filter(isDeadEnd))
        .map((tile) => ({ tile, forced: false }));

    for (let item = queue.pop(); item !== undefined; item = queue.pop()) {
        const { tile, forced } = item;
        if (!isDeadEnd(tile)) continue; // 之前打通別的牆時已經順便解決了
        if (!forced && !rng.chance(ratio)) continue;

        const options = DIRECTIONS.filter((d) => canOpen(tile, d));
        if (options.length > 0) {
            // 優先接到另一個死路，一次解決兩個，迷宮裡的迴圈比較少
            const toDeadEnd = options.filter((d) =>
                isDeadEnd(step(tile, d, 2)),
            );
            const direction = rng.pick(
                toDeadEnd.length > 0 ? toDeadEnd : options,
            );
            grid.set(step(tile, direction), 'floor');
            continue;
        }

        // 門外那一格不能填，不然園區會被封死
        if (isOutside(tile)) continue;
        const exit = DIRECTIONS.find((d) => corridor(step(tile, d)));
        grid.set(tile, 'wall');
        if (exit === undefined) continue;
        const passage = step(tile, exit);
        grid.set(passage, 'wall');
        queue.push({ tile: step(tile, exit, 2), forced: true });
    }
}

/** 公平性調整的搜尋上限 */
const BALANCE_MAX_ITERATIONS = 200;
const BALANCE_SIDEWAYS_MOVES = 30;
const BALANCE_TABU_SIZE = 8;

/**
 * 公平性調整：反覆試著「打通」或「封住」一面兩個 cell 之間的牆，每次挑讓差距分數最小的一步，
 * 直到符合條件或再也改善不了。
 * - 打通只會多出迴圈，不會產生死路或 2×2 地板。
 * - 封住只在兩側的 cell 都還有 3 條以上通路（封完剩 2 條）、而且走廊不會斷開時才做，所以也不會產生死路。
 * - 外框、園區外圍與起點附近（離中央不比起點遠的格子）都不動，起點仍是最接近中央的地板格。
 * 迷宮只有幾百格，這裡用格子索引與 Uint8Array 做 BFS，不建立 Tile 物件，速度比較快。
 */
function balanceDistances(
    grid: Grid,
    zones: readonly ZoneShape[],
    start: Tile,
    config: MazeConfig,
    rng: Rng,
): void {
    const { width, height } = grid;
    const size = width * height;
    const index = (tile: Tile): number => tile.y * width + tile.x;

    // 走廊遮罩：1 表示可以走（地板而且不是園區或門）
    const corridor = new Uint8Array(size);
    for (const tile of grid.allTiles()) {
        if (grid.isFloor(tile) && !isZoneTile(zones, tile))
            corridor[index(tile)] = 1;
    }
    const startIndex = index(start);
    const outsideIndexes = zones.map((zone) => index(zone.outside));
    const neighborOffsets = [-width, width, -1, 1];
    const distances = new Int32Array(size);
    const queue = new Int32Array(size);
    const openCount = (i: number): number =>
        neighborOffsets.filter((offset) => corridor[i + offset] === 1).length;

    /** 從起點 BFS，回傳走得到的走廊格數 */
    const runBfs = (): number => {
        distances.fill(-1);
        distances[startIndex] = 0;
        queue[0] = startIndex;
        let tail = 1;
        for (let head = 0; head < tail; head++) {
            const current = queue[head] ?? 0;
            const next = (distances[current] ?? 0) + 1;
            for (const offset of neighborOffsets) {
                const neighbor = current + offset;
                if (corridor[neighbor] !== 1 || distances[neighbor] !== -1)
                    continue;
                distances[neighbor] = next;
                queue[tail++] = neighbor;
            }
        }
        return tail;
    };

    /** 差距分數：0 表示符合公平性與最短距離條件 */
    const score = (): number => {
        const ds = outsideIndexes.map((i) => distances[i] ?? -1);
        if (ds.some((d) => d < 0)) return Infinity;
        const allowedMin = Math.max(
            Math.max(...ds) / config.fairnessMaxRatio,
            config.minStartToZone,
        );
        return ds.reduce((sum, d) => sum + Math.max(0, allowedMin - d), 0);
    };

    const center: Tile = { x: (width - 1) / 2, y: (height - 1) / 2 };
    const centerDistance = (tile: Tile): number =>
        (tile.x - center.x) ** 2 + (tile.y - center.y) ** 2;
    const startCenterDistance = centerDistance(start);
    const isProtected = (tile: Tile): boolean =>
        grid.onBorder(tile) ||
        zones.some((zone) => inRect(tile, expandRect(zone.rect, 1))) ||
        centerDistance(tile) <= startCenterDistance;

    // 所有可以調整的牆洞：剛好一個座標是偶數的格子，位在兩個 cell 之間
    const slots = grid
        .allTiles()
        .filter(
            (tile) => (tile.x % 2) + (tile.y % 2) === 1 && !isProtected(tile),
        )
        .map((tile) => {
            const [a, b]: [Tile, Tile] =
                tile.x % 2 === 0
                    ? [step(tile, 'left'), step(tile, 'right')]
                    : [step(tile, 'up'), step(tile, 'down')];
            return {
                tile,
                index: index(tile),
                a: index(a),
                b: index(b),
                aTile: a,
                bTile: b,
            };
        });

    let corridorCount = corridor.reduce((sum, v) => sum + v, 0);
    runBfs();
    let current = score();

    type Slot = (typeof slots)[number];
    // 卡在局部最佳時，允許走幾步「分數不變」的橫移（例如先打通一面牆，下一步才能封住另一面），
    // 最近動過的牆暫時不能再動，避免來回打開又關上
    let sidewaysLeft = BALANCE_SIDEWAYS_MOVES;
    const recent: number[] = [];

    for (
        let iteration = 0;
        iteration < BALANCE_MAX_ITERATIONS && current > 0;
        iteration++
    ) {
        let bestScore = Infinity;
        let bestMoves: Slot[] = [];

        for (const slot of slots) {
            if (
                corridor[slot.a] !== 1 ||
                corridor[slot.b] !== 1 ||
                recent.includes(slot.index)
            )
                continue;
            const closing = corridor[slot.index] === 1;
            // 封完之後兩側的 cell 都還要有 2 條以上走廊（門不算）
            if (closing && (openCount(slot.a) < 3 || openCount(slot.b) < 3))
                continue;

            corridor[slot.index] = closing ? 0 : 1;
            const reached = runBfs();
            // 封牆後走廊斷開就不行
            const candidate =
                closing && reached !== corridorCount - 1 ? Infinity : score();
            corridor[slot.index] = closing ? 1 : 0;

            if (candidate < bestScore)
                [bestScore, bestMoves] = [candidate, [slot]];
            else if (candidate === bestScore) bestMoves.push(slot);
        }

        const improving = bestScore < current;
        if (!improving && (bestScore > current || sidewaysLeft === 0)) break; // 已經改善不了
        if (!improving) sidewaysLeft -= 1;
        if (bestMoves.length === 0) break;

        const move = rng.pick(bestMoves);
        const opening = corridor[move.index] === 0;
        corridor[move.index] = opening ? 1 : 0;
        grid.set(move.tile, opening ? 'floor' : 'wall');
        corridorCount += opening ? 1 : -1;
        recent.push(move.index);
        if (recent.length > BALANCE_TABU_SIZE) recent.shift();
        runBfs();
        current = score();
    }
}

function pickStart(
    corridors: readonly Tile[],
    config: MazeConfig,
    rng: Rng,
): Tile {
    const cx = (config.width - 1) / 2;
    const cy = (config.height - 1) / 2;
    const distance = (tile: Tile): number =>
        (tile.x - cx) ** 2 + (tile.y - cy) ** 2;
    const nearest = Math.min(...corridors.map(distance));
    return rng.pick(corridors.filter((tile) => distance(tile) === nearest));
}

/** 與起點 BFS 距離夠遠的路口格（三條以上通路），彼此不重複；也不選門外那一格，免得敵人堵在門口 */
function pickSpawns(
    grid: Grid,
    zones: readonly Zone[],
    corridors: readonly Tile[],
    start: Tile,
    config: MazeConfig,
    rng: Rng,
): Tile[] {
    const corridor: Passable = (tile) =>
        grid.isFloor(tile) && !isZoneTile(zones, tile);
    const distances = bfs(grid, start, corridor);
    const candidates = corridors.filter(
        (tile) =>
            grid.countOpenNeighbors(tile, corridor) >= 3 &&
            (distances.get(tile) ?? -1) >= config.spawnMinDistance &&
            !zones.some((zone) => sameTile(zone.outside, tile)),
    );
    return rng.shuffle(candidates).slice(0, config.spawnCount);
}

// ─── 驗證（§6.4）────────────────────────────────────────────

export function checkMaze(maze: Maze, config: MazeConfig): MazeViolation[] {
    const { grid, zones, start } = maze;
    const violations: MazeViolation[] = [];

    // 所有地板格彼此連通
    const reach = bfs(grid, start);
    const unreachable = grid
        .allTiles()
        .filter(
            (tile) => grid.isFloor(tile) && reach.get(tile) === null,
        ).length;
    if (unreachable > 0) violations.push({ kind: 'disconnected', unreachable });

    // 每個園區只有一個門，門外是走廊
    zones.forEach((zone, zoneIndex) => {
        const ring = rectTiles(expandRect(zone.rect, 1)).filter(
            (tile) => !inRect(tile, zone.rect),
        );
        const openings = ring.filter((tile) => grid.isFloor(tile));
        const onlyDoor =
            openings.length === 1 &&
            openings.every((tile) => sameTile(tile, zone.door));
        const doorLeadsOut = sameTile(
            step(zone.door, zone.doorSide),
            zone.outside,
        );
        if (!onlyDoor || !doorLeadsOut || !isCorridor(maze, zone.outside)) {
            violations.push({ kind: 'badDoor', zoneIndex });
        }
    });

    // 園區以外沒有 2×2 的地板
    for (let y = 0; y < grid.height - 1; y++) {
        for (let x = 0; x < grid.width - 1; x++) {
            const block = rectTiles({ x, y, width: 2, height: 2 });
            if (!block.every((tile) => grid.isFloor(tile))) continue;
            const insideOneZone = zones.some((zone) =>
                block.every((tile) => inRect(tile, zone.rect)),
            );
            if (!insideOneZone)
                violations.push({ kind: 'wideArea', at: { x, y } });
        }
    }

    // 死路（只在設定為全部移除時檢查）：門不算通路，門外那一格也要有兩條走廊
    if (config.deadEndRemoval >= 1) {
        const corridor: Passable = (tile) => isCorridor(maze, tile);
        for (const tile of grid.allTiles()) {
            if (
                corridor(tile) &&
                grid.countOpenNeighbors(tile, corridor) <= 1
            ) {
                violations.push({ kind: 'deadEnd', at: tile });
            }
        }
    }

    // 起點到各答案區的距離：公平性與最短距離
    const corridorDistances = bfs(grid, start, (tile) =>
        isCorridor(maze, tile),
    );
    const zoneDistances = zones.map((zone) =>
        corridorDistances.get(zone.outside),
    );
    if (
        zoneDistances.every((d): d is number => d !== null) &&
        zoneDistances.length > 0
    ) {
        const nearest = Math.min(...zoneDistances);
        const farthest = Math.max(...zoneDistances);
        const ratio = nearest === 0 ? Infinity : farthest / nearest;
        if (ratio > config.fairnessMaxRatio) {
            violations.push({
                kind: 'unfair',
                ratio,
                limit: config.fairnessMaxRatio,
            });
        }
        if (nearest < config.minStartToZone) {
            violations.push({
                kind: 'zoneTooClose',
                distance: nearest,
                limit: config.minStartToZone,
            });
        }
    }

    if (maze.enemySpawns.length < config.spawnCount) {
        violations.push({
            kind: 'notEnoughSpawns',
            found: maze.enemySpawns.length,
            needed: config.spawnCount,
        });
    }

    return violations;
}

/**
 * 「離條件有多遠」：結構性的問題最嚴重，公平性依差距計分。
 * 公平性的分數有上限，差距再大也不會超過一個結構性問題。
 */
function violationPenalty(violation: MazeViolation): number {
    switch (violation.kind) {
        case 'disconnected':
        case 'badDoor':
            return 1_000_000;
        case 'wideArea':
        case 'deadEnd':
        case 'notEnoughSpawns':
            return 1_000;
        case 'unfair':
            return Math.min(999, 100 * (violation.ratio - violation.limit));
        case 'zoneTooClose':
            return Math.min(999, 100 * (violation.limit - violation.distance));
        default:
            return assertNever(violation);
    }
}
