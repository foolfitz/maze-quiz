/** 所有可調參數（原 maze-quiz 規格書附錄 A） */
export const CONFIG = {
    maze: {
        width: 25, // 必須是奇數
        height: 15, // 必須是奇數
        zoneInterior: 3, // 園區內部邊長（格）
        deadEndRemoval: 1.0, // 0–1，移除死路的比例
        fairnessMaxRatio: 1.35, // 起點到各答案區距離：最遠 ÷ 最近
        minStartToZone: 6, // 起點到任一答案區的最短距離
        maxAttempts: 50,
    },
    player: {
        speedTilesPerSec: 4.5,
        // 原本是 0.3 格與 150 ms；平板試玩時轉彎太難而放寬
        turnTolerance: 0.45, // 格；距格子中心多近可以轉向（吸附到路口）
        inputGraceMs: 300, // 轉向指令的暫存時間；不可以長到走得到下一個路口，否則就變成自動轉彎
        pointerDeadZoneTiles: 0.6,
    },
    enemy: {
        releaseDelayMs: 1500,
        spawnMinDistance: 8,
        ambushLookahead: 4,
    },
    collisionDistance: 0.7, // 格；玩家與敵人中心距離小於此值即碰撞
    timing: {
        levelIntroMs: 1500,
        wrongFeedbackMs: 600,
        lifeLostMs: 1000,
        levelCompleteMs: 800,
        invulnerableMs: 1500,
    },
    loop: {
        stepHz: 60,
        maxFrameMs: 250,
    },
} as const;

/**
 * 難度表：enemySpeedRatio 是相對於玩家速度的比例。
 * 三級只差在敵人的速度，敵人數量與聰明程度都一樣。
 */
export const DIFFICULTY_TABLE = {
    1: { enemyCount: 2, enemySpeedRatio: 0.5, smartRatio: 0.65 },
    2: { enemyCount: 2, enemySpeedRatio: 0.6, smartRatio: 0.65 },
    3: { enemyCount: 2, enemySpeedRatio: 0.7, smartRatio: 0.65 },
} as const;
