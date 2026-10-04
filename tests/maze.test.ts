import { describe, expect, it } from 'vite-plus/test';
import {
    bfs,
    expandRect,
    inRect,
    rectTiles,
    sameTile,
    step,
    type Tile,
} from '../src/core/grid';
import {
    buildMaze,
    checkMaze,
    DEFAULT_MAZE_CONFIG,
    generateLevelMaze,
    isCorridor,
    zoneIndexAt,
    ZONE_LAYOUTS,
    type Maze,
    type MazeConfig,
    type MazeViolation,
    type ZoneCount,
} from '../src/core/maze';
import { createRng, hashSeed } from '../src/core/rng';

const config = DEFAULT_MAZE_CONFIG;
const ZONE_COUNTS: readonly ZoneCount[] = [2, 3, 4, 5, 6];
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

/** 每個 (seed, k) 只生成一次，給下面多個測試共用 */
const results = ZONE_COUNTS.flatMap((k) =>
    SEEDS.map((seed) => ({
        seed,
        k,
        result: generateLevelMaze(seed, 0, k, config),
    })),
);

function kinds(violations: readonly MazeViolation[]): string[] {
    return [...new Set(violations.map((v) => v.kind))];
}

/** 園區以外的地板 */
function corridorTiles(maze: Maze): Tile[] {
    return maze.grid.allTiles().filter((tile) => isCorridor(maze, tile));
}

describe('種子 1–200 × k = 2–6', () => {
    it('每一張都符合 §6.4 的所有條件，或正確回報「採用最接近的一張」', () => {
        for (const { seed, k, result } of results) {
            // 回報的問題必須和重新檢查的結果一致
            expect(
                checkMaze(result.maze, config),
                `seed=${seed} k=${k}`,
            ).toEqual(result.violations);
            if (result.violations.length > 0) {
                // 採用最接近的一張，代表每一次嘗試都失敗了
                for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
                    const maze = buildMaze(
                        createRng(hashSeed(seed, 0, attempt)),
                        k,
                        config,
                    );
                    expect(
                        checkMaze(maze, config).length,
                        `seed=${seed} k=${k} attempt=${attempt}`,
                    ).toBeGreaterThan(0);
                }
            }
        }
    });

    // 只保證這個範圍（種子 1–200、第 1 關）；其他種子仍可能極少數用到「最接近的一張」，那是規格允許的
    it('目前的參數下，這個範圍全部都不需要退而求其次', () => {
        const fallbacks = results.filter(
            ({ result }) => result.violations.length > 0,
        );
        expect(
            fallbacks.map(
                ({ seed, k, result }) =>
                    `seed=${seed} k=${k}: ${kinds(result.violations).join(', ')}`,
            ),
        ).toEqual([]);
    });

    // 以下用獨立寫的程式再檢查一次，避免 checkMaze 本身有錯而沒發現

    it('所有地板格彼此連通', () => {
        for (const { result } of results) {
            const { grid, start } = result.maze;
            const field = bfs(grid, start);
            expect(
                grid
                    .allTiles()
                    .every(
                        (tile) =>
                            !grid.isFloor(tile) || field.get(tile) !== null,
                    ),
            ).toBe(true);
        }
    });

    it('外框都是牆', () => {
        for (const { result } of results) {
            const { grid } = result.maze;
            expect(
                grid
                    .allTiles()
                    .filter(
                        (tile) => grid.onBorder(tile) && grid.isFloor(tile),
                    ),
            ).toEqual([]);
        }
    });

    it('每個園區內部 3×3 全是地板，外圍一圈只有門是開的，門外是走廊', () => {
        for (const { result } of results) {
            const maze = result.maze;
            for (const zone of maze.zones) {
                expect(
                    rectTiles(zone.rect).every((tile) =>
                        maze.grid.isFloor(tile),
                    ),
                ).toBe(true);
                const ring = rectTiles(expandRect(zone.rect, 1)).filter(
                    (tile) => !inRect(tile, zone.rect),
                );
                expect(ring.filter((tile) => maze.grid.isFloor(tile))).toEqual([
                    zone.door,
                ]);
                expect(step(zone.door, zone.doorSide)).toEqual(zone.outside);
                expect(isCorridor(maze, zone.outside)).toBe(true);
            }
        }
    });

    it('園區以外沒有 2×2 的地板，也沒有死路（門不算通路，門外那一格也要有兩條走廊）', () => {
        for (const { result } of results) {
            const maze = result.maze;
            const corridor = (tile: Tile): boolean => isCorridor(maze, tile);
            for (const tile of corridorTiles(maze)) {
                expect(
                    maze.grid.countOpenNeighbors(tile, corridor),
                ).toBeGreaterThanOrEqual(2);
                const block = rectTiles({
                    x: tile.x,
                    y: tile.y,
                    width: 2,
                    height: 2,
                });
                expect(block.every((t) => maze.grid.isFloor(t))).toBe(false);
            }
        }
    });

    it('起點到各答案區的距離：最遠 ÷ 最近 ≤ 1.35，而且都至少 6 步', () => {
        for (const { result } of results) {
            const maze = result.maze;
            const field = bfs(maze.grid, maze.start, (tile) =>
                isCorridor(maze, tile),
            );
            const distances = maze.zones.map(
                (zone) => field.get(zone.outside) ?? -1,
            );
            expect(Math.min(...distances)).toBeGreaterThanOrEqual(
                config.minStartToZone,
            );
            expect(
                Math.max(...distances) / Math.min(...distances),
            ).toBeLessThanOrEqual(config.fairnessMaxRatio);
        }
    });
});

describe('答案區的配置', () => {
    it('位置符合 §6.2 的表格，內部對齊奇數格點', () => {
        for (const { k, result } of results) {
            const zones = result.maze.zones;
            expect(zones.map((zone) => zone.slot).sort()).toEqual(
                [...ZONE_LAYOUTS[k]].sort(),
            );
            for (const zone of zones) {
                expect(zone.rect.x % 2).toBe(1);
                expect(zone.rect.y % 2).toBe(1);
                expect(zone.rect.width).toBe(3);
                expect(zone.rect.height).toBe(3);
            }
        }
    });

    it('門朝向迷宮中央', () => {
        const center = {
            x: (config.width - 1) / 2,
            y: (config.height - 1) / 2,
        };
        for (const { result } of results) {
            for (const zone of result.maze.zones) {
                const zoneCenter = { x: zone.rect.x + 1, y: zone.rect.y + 1 };
                // 門往外走一格，應該比園區中心更接近迷宮中央
                const toward = step(zoneCenter, zone.doorSide, 2);
                expect(
                    Math.abs(toward.x - center.x) +
                        Math.abs(toward.y - center.y),
                ).toBeLessThan(
                    Math.abs(zoneCenter.x - center.x) +
                        Math.abs(zoneCenter.y - center.y),
                );
            }
        }
    });

    it('角落的園區有時開水平、有時開垂直的門', () => {
        const sides = new Set(
            results
                .filter(({ k }) => k === 4)
                .flatMap(({ result }) =>
                    result.maze.zones
                        .filter((z) => z.slot === 'topLeft')
                        .map((z) => z.doorSide),
                ),
        );
        expect([...sides].sort()).toEqual(['down', 'right']);
    });

    it('zones[i] 放第 i 個選項', () => {
        for (const { result } of results) {
            result.maze.zones.forEach((zone, i) =>
                expect(zone.choiceIndex).toBe(i),
            );
        }
    });

    it('每一關都把選項隨機分配到位置上', () => {
        const slotsOfFirstChoice = new Set(
            results
                .filter(({ k }) => k === 4)
                .map(({ result }) => result.maze.zones[0]?.slot),
        );
        expect(slotsOfFirstChoice.size).toBe(4);
    });

    it('zoneIndexAt：園區內部回傳索引，門與走廊回傳 null', () => {
        const maze = generateLevelMaze(1, 0, 4).maze;
        maze.zones.forEach((zone, i) => {
            for (const tile of rectTiles(zone.rect))
                expect(zoneIndexAt(maze, tile)).toBe(i);
            expect(zoneIndexAt(maze, zone.door)).toBeNull();
            expect(zoneIndexAt(maze, zone.outside)).toBeNull();
        });
    });
});

describe('起點與敵人出生點', () => {
    it('起點是最接近正中央的走廊格', () => {
        const cx = (config.width - 1) / 2;
        const cy = (config.height - 1) / 2;
        const distance = (tile: Tile): number =>
            (tile.x - cx) ** 2 + (tile.y - cy) ** 2;
        for (const { result } of results) {
            const maze = result.maze;
            expect(isCorridor(maze, maze.start)).toBe(true);
            const nearest = Math.min(...corridorTiles(maze).map(distance));
            expect(distance(maze.start)).toBe(nearest);
        }
    });

    it('出生點彼此不重複、是路口、離起點夠遠，也不在門外', () => {
        for (const { result } of results) {
            const maze = result.maze;
            const corridor = (tile: Tile): boolean => isCorridor(maze, tile);
            const field = bfs(maze.grid, maze.start, corridor);
            expect(maze.enemySpawns).toHaveLength(config.spawnCount);
            for (const [i, spawn] of maze.enemySpawns.entries()) {
                expect(
                    maze.enemySpawns.findIndex((other) =>
                        sameTile(other, spawn),
                    ),
                ).toBe(i);
                expect(
                    maze.grid.countOpenNeighbors(spawn, corridor),
                ).toBeGreaterThanOrEqual(3);
                expect(field.get(spawn) ?? -1).toBeGreaterThanOrEqual(
                    config.spawnMinDistance,
                );
                expect(
                    maze.zones.some((zone) => sameTile(zone.outside, spawn)),
                ).toBe(false);
            }
        }
    });
});

describe('可重現性', () => {
    it('同一個種子、同一關，生成結果完全相同', () => {
        for (const k of ZONE_COUNTS) {
            expect(generateLevelMaze(99, 2, k)).toEqual(
                generateLevelMaze(99, 2, k),
            );
        }
    });

    it('種子或關卡不同，迷宮就不同', () => {
        const base = generateLevelMaze(99, 2, 4).maze.grid;
        expect(generateLevelMaze(100, 2, 4).maze.grid).not.toEqual(base);
        expect(generateLevelMaze(99, 3, 4).maze.grid).not.toEqual(base);
    });
});

describe('採用最接近條件的一張', () => {
    it('條件不可能達成時，回傳問題最少的一張並列出原因', () => {
        const impossible: MazeConfig = {
            ...config,
            minStartToZone: 1000,
            maxAttempts: 5,
        };
        const result = generateLevelMaze(1, 0, 4, impossible);
        const reported = kinds(result.violations);
        expect(reported).toContain('zoneTooClose');
        // 結構性的問題（不連通、門、2×2、死路）不應該出現
        for (const kind of ['disconnected', 'badDoor', 'wideArea', 'deadEnd'])
            expect(reported).not.toContain(kind);
        expect(checkMaze(result.maze, impossible)).toEqual(result.violations);
        expect(result.attempt).toBeGreaterThanOrEqual(0);
        expect(result.attempt).toBeLessThan(5);
    });
});

describe('其他設定', () => {
    it('deadEndRemoval = 0 時保留死路', () => {
        const keep: MazeConfig = { ...config, deadEndRemoval: 0 };
        const maze = buildMaze(createRng(1), 4, keep);
        const deadEnds = corridorTiles(maze).filter(
            (tile) => maze.grid.countOpenNeighbors(tile) <= 1,
        );
        expect(deadEnds.length).toBeGreaterThan(0);
    });

    it('寬高不是奇數時丟錯', () => {
        expect(() =>
            buildMaze(createRng(1), 4, { ...config, width: 24 }),
        ).toThrow(RangeError);
    });

    it('迷宮太小、園區放不下時丟錯', () => {
        expect(() =>
            buildMaze(createRng(1), 6, { ...config, width: 9, height: 9 }),
        ).toThrow(RangeError);
    });
});

describe('checkMaze 抓得到每一種問題', () => {
    const valid = generateLevelMaze(1, 0, 4).maze;

    /** 複製一份迷宮再修改格子，不影響其他測試 */
    function modified(change: (maze: Maze) => void): Maze {
        const maze: Maze = { ...valid, grid: valid.grid.clone() };
        change(maze);
        return maze;
    }

    it('原本的迷宮沒有問題', () => {
        expect(checkMaze(valid, config)).toEqual([]);
    });

    it('不連通', () => {
        const maze = modified((m) => m.grid.set({ x: 0, y: 0 }, 'floor'));
        expect(kinds(checkMaze(maze, config))).toContain('disconnected');
    });

    it('園區多開了一個門', () => {
        const maze = modified((m) => {
            const zone = m.zones[0];
            if (zone === undefined) throw new Error('沒有園區');
            const ring = rectTiles(expandRect(zone.rect, 1)).filter(
                (t) => !inRect(t, zone.rect),
            );
            const other = ring.find(
                (t) => !sameTile(t, zone.door) && !m.grid.onBorder(t),
            );
            if (other === undefined) throw new Error('找不到可以開的牆');
            m.grid.set(other, 'floor');
        });
        expect(checkMaze(maze, config)).toContainEqual({
            kind: 'badDoor',
            zoneIndex: 0,
        });
    });

    it('2×2 的地板', () => {
        const maze = modified((m) => {
            for (const tile of rectTiles({
                x: m.start.x - 1,
                y: m.start.y - 1,
                width: 2,
                height: 2,
            })) {
                m.grid.set(tile, 'floor');
            }
        });
        expect(kinds(checkMaze(maze, config))).toContain('wideArea');
    });

    it('死路', () => {
        const maze = modified((m) => {
            // 在左邊第一排的走廊旁邊挖進外框，那一格就只有一條路
            const cell = m.grid
                .allTiles()
                .find((t) => t.x === 1 && isCorridor(m, t));
            if (cell === undefined) throw new Error('找不到左邊的走廊');
            m.grid.set(step(cell, 'left'), 'floor');
        });
        expect(kinds(checkMaze(maze, config))).toContain('deadEnd');
    });

    it('門外那一格只接一條走廊（封門後就是死路）', () => {
        const maze = modified((m) => {
            const zone = m.zones[0];
            if (zone === undefined) throw new Error('沒有園區');
            // 把門外那一格除了門以外的走廊封到只剩一條
            const exits = (['up', 'down', 'left', 'right'] as const)
                .map((d) => step(zone.outside, d))
                .filter((t) => isCorridor(m, t));
            for (const t of exits.slice(1)) m.grid.set(t, 'wall');
        });
        expect(checkMaze(maze, config)).toContainEqual({
            kind: 'deadEnd',
            at: valid.zones[0]?.outside,
        });
    });

    it('不公平、離起點太近、出生點不夠', () => {
        const strict: MazeConfig = {
            ...config,
            fairnessMaxRatio: 0.5,
            minStartToZone: 1000,
            spawnCount: 1000,
        };
        expect(kinds(checkMaze(valid, strict))).toEqual([
            'unfair',
            'zoneTooClose',
            'notEnoughSpawns',
        ]);
    });
});
