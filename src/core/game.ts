import { CONFIG, DIFFICULTY_TABLE } from '../config';
import {
    createEnemies,
    DEFAULT_ENEMY_CONFIG,
    resetEnemy,
    updateEnemy,
    type DifficultyRow,
    type Enemy,
    type EnemyConfig,
    type EnemyContext,
} from './enemies';
import type { Passable } from './grid';
import {
    DEFAULT_MAZE_CONFIG,
    generateLevelMaze,
    isZoneCount,
    zoneIndexAt,
    type Maze,
    type MazeConfig,
    type MazeResult,
} from './maze';
import {
    createPlayer,
    DEFAULT_PLAYER_CONFIG,
    playerTile,
    requestDirection,
    updatePlayer,
    type Player,
    type PlayerConfig,
    type TurnResult,
} from './player';
import { createRng, hashSeed, type Rng } from './rng';
import {
    assertNever,
    type Difficulty,
    type Direction,
    type EndPhase,
    type GameOptions,
    type Phase,
    type PlayPhase,
    type Question,
    type QuestionResult,
} from './types';

// ─── 設定 ────────────────────────────────────────────────────

export interface TimingConfig {
    readonly levelIntroMs: number;
    readonly wrongFeedbackMs: number;
    readonly lifeLostMs: number;
    readonly levelCompleteMs: number;
    readonly invulnerableMs: number;
}

export interface GameConfig {
    readonly maze: MazeConfig;
    readonly player: PlayerConfig;
    readonly enemy: EnemyConfig;
    readonly difficulties: Readonly<Record<Difficulty, DifficultyRow>>;
    readonly collisionDistance: number; // 格；玩家與敵人中心距離小於此值即碰撞
    readonly timing: TimingConfig;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
    maze: DEFAULT_MAZE_CONFIG,
    player: DEFAULT_PLAYER_CONFIG,
    enemy: DEFAULT_ENEMY_CONFIG,
    difficulties: DIFFICULTY_TABLE,
    collisionDistance: CONFIG.collisionDistance,
    timing: CONFIG.timing,
};

/**
 * 敵人亂數序列的第三個種子值。迷宮用 hashSeed(seed, levelIndex, attempt)，attempt 從 0 開始，
 * 用 -1 就不會和任何一次嘗試的迷宮種子相同；敵人怎麼走也不會影響迷宮長什麼樣子。
 */
const ENEMY_RNG_STREAM = -1;

// ─── 狀態 ────────────────────────────────────────────────────

/** 目前這一關 */
export interface Level {
    readonly questionIndex: number; // questions 的索引（出題順序就是 rounds 的順序）
    readonly question: Question;
    readonly mazeResult: MazeResult;
    readonly player: Player; // 物件本身會被 updatePlayer 就地修改
    /** 各園區是否已封住，順序與 maze.zones 相同。封門時換成新陣列，畫面比對參照就知道要重畫。 */
    sealed: readonly boolean[];
    /** 玩家剛走進的園區（顯示 ✓ ✗ 用）；回到 playing 時清掉 */
    enteredZone: number | null;
    readonly wrongChoiceIds: string[]; // 這一題答錯過的選項，依先後順序
    readonly enemies: readonly Enemy[]; // 物件本身會被 updateEnemy 就地修改
    readonly enemyRng: Rng; // 敵人的隨機決策；和迷宮的亂數序列分開
    /** 重生後的無敵時間還剩多久；0 表示不在無敵狀態 */
    invulnerableMs: number;
    /** 這一關開始時的 elapsedMs，用來算每次作答花了多久 */
    readonly startElapsedMs: number;
}

/**
 * 狀態機對外發出的訊號，由 session.ts 轉成遊戲模組的事件。
 * core 不認識宿主的事件格式，只說發生了什麼。
 */
export type GameSignal =
    | {
          readonly kind: 'answered';
          readonly questionId: string;
          readonly choiceId: string;
          readonly correct: boolean;
          /** 這一關開始到走進園區的遊戲時間（不含「預備」與暫停） */
          readonly levelElapsedMs: number;
      }
    | { readonly kind: 'ended'; readonly reason: EndPhase['kind'] };

export interface GameState {
    phase: Phase;
    readonly questions: readonly Question[];
    readonly options: GameOptions;
    readonly config: GameConfig;
    readonly seed: number;
    levelIndex: number;
    level: Level | null;
    /** 遊戲時間，只在 playing、wrongFeedback、lifeLost 累加 */
    elapsedMs: number;
    lives: number;
    readonly results: QuestionResult[];
    /** 還沒被 session 取走的訊號 */
    readonly outbox: GameSignal[];
    /** 測試用的無敵開關（原本的除錯快捷鍵 I），和重生後的無敵時間分開 */
    debugInvincible: boolean;
}

export function levelMaze(level: Level): Maze {
    return level.mazeResult.maze;
}

/** 玩家能走的格子：地板（封住的門已經變成牆） */
function playerPassable(maze: Maze): Passable {
    return (tile) => maze.grid.isFloor(tile);
}

// ─── 流程 ────────────────────────────────────────────────────

/** 建立一局新遊戲，停在 idle。出題順序就是 questions 的順序（宿主已經排好，不再打亂）。 */
export function createGame(
    questions: readonly Question[],
    options: GameOptions,
    seed: number,
    config: GameConfig = DEFAULT_GAME_CONFIG,
): GameState {
    return {
        phase: { kind: 'idle' },
        questions,
        options,
        config,
        seed,
        levelIndex: 0,
        level: null,
        elapsedMs: 0,
        lives: options.lives,
        results: [],
        outbox: [],
        debugInvincible: false,
    };
}

/** 開始第 1 關；沒有任何題目時直接結束 */
export function startGame(state: GameState): void {
    if (state.phase.kind !== 'idle') return;
    if (state.questions.length === 0) {
        finish(state);
        return;
    }
    enterLevel(state, 0);
}

/** 方向指令；只在 playing 時有效，其他時候回傳 null */
export function steer(
    state: GameState,
    direction: Direction,
): TurnResult | null {
    const { level } = state;
    if (state.phase.kind !== 'playing' || level === null) return null;
    return requestDirection(
        level.player,
        direction,
        playerPassable(levelMaze(level)),
        state.config.player,
    );
}

/** 單步更新（固定 dtMs） */
export function stepGame(state: GameState, dtMs: number): void {
    const { phase, level, config } = state;
    switch (phase.kind) {
        case 'idle':
        case 'paused':
        case 'gameOver':
        case 'timeUp':
        case 'finished':
            return;

        case 'levelIntro': {
            // 題目與迷宮已經顯示，玩家不動、不計時
            const remainingMs = phase.remainingMs - dtMs;
            state.phase =
                remainingMs > 0
                    ? { ...phase, remainingMs }
                    : { kind: 'playing' };
            return;
        }

        case 'playing': {
            if (level === null) return;
            if (tickClock(state, dtMs)) return;
            updatePlayer(
                level.player,
                dtMs,
                playerPassable(levelMaze(level)),
                config.player,
            );
            judgeZone(state, level);
            if (state.phase.kind !== 'playing') return; // 走進園區了，全場靜止

            level.invulnerableMs = Math.max(0, level.invulnerableMs - dtMs);
            const row = difficultyRow(state);
            const ctx: EnemyContext = {
                maze: levelMaze(level),
                player: level.player,
                rng: level.enemyRng,
                speedTilesPerSec:
                    config.player.speedTilesPerSec * row.enemySpeedRatio,
                smartRatio: row.smartRatio,
                ambushLookahead: config.enemy.ambushLookahead,
            };
            for (const enemy of level.enemies) updateEnemy(enemy, dtMs, ctx);
            if (
                !isInvulnerable(state, level) &&
                touchingEnemy(level, config.collisionDistance)
            ) {
                loseLife(state, level);
            }
            return;
        }

        case 'wrongFeedback': {
            if (tickClock(state, dtMs)) return;
            const remainingMs = phase.remainingMs - dtMs;
            if (remainingMs > 0) state.phase = { ...phase, remainingMs };
            else if (level !== null) sealEnteredZone(state, level);
            return;
        }

        case 'lifeLost': {
            // 受傷動畫期間全場靜止，但照樣計時；已經沒有命時結果就是「沒有命了」，不會變成時間到
            if (tickClock(state, dtMs, state.lives > 0)) return;
            const remainingMs = phase.remainingMs - dtMs;
            if (remainingMs > 0) state.phase = { ...phase, remainingMs };
            else if (level !== null && state.lives > 0) respawn(state, level);
            else endGame(state, 'gameOver');
            return;
        }

        case 'levelComplete': {
            const remainingMs = phase.remainingMs - dtMs;
            if (remainingMs > 0) state.phase = { ...phase, remainingMs };
            else if (state.levelIndex + 1 < state.questions.length)
                enterLevel(state, state.levelIndex + 1);
            else finish(state);
            return;
        }

        default:
            assertNever(phase);
    }
}

/** 可以暫停的狀態（PlayPhase）；型別守衛讓 TypeScript 知道回傳 true 時 phase 是 PlayPhase */
export function isPlayPhase(phase: Phase): phase is PlayPhase {
    switch (phase.kind) {
        case 'levelIntro':
        case 'playing':
        case 'wrongFeedback':
        case 'lifeLost':
        case 'levelComplete':
            return true;
        case 'idle':
        case 'paused':
        case 'gameOver':
        case 'timeUp':
        case 'finished':
            return false;
        default:
            return assertNever(phase);
    }
}

/** 遊戲已經結束（命用完、時間到或題目都答完） */
export function isEndPhase(phase: Phase): phase is EndPhase {
    return (
        phase.kind === 'gameOver' ||
        phase.kind === 'timeUp' ||
        phase.kind === 'finished'
    );
}

/** 暫停：只有 PlayPhase 可以暫停，並記住要回到哪個狀態 */
export function pauseGame(state: GameState): void {
    if (isPlayPhase(state.phase))
        state.phase = { kind: 'paused', resumeTo: state.phase };
}

/** 「繼續」：回到暫停前的狀態，剩下的倒數時間照舊 */
export function resumeGame(state: GameState): void {
    if (state.phase.kind === 'paused') state.phase = state.phase.resumeTo;
}

/** 倒數的總長度；不是倒數模式時是 null */
function countDownLimitMs(options: GameOptions): number | null {
    return options.timerMode === 'countDown'
        ? options.countDownSeconds * 1000
        : null;
}

/** 狀態列要顯示的時間：正計時是用時，倒數是剩下的時間（最小 0），不顯示時間時是 null */
export function clockMs(state: GameState): number | null {
    const { timerMode } = state.options;
    switch (timerMode) {
        case 'none':
            return null;
        case 'countUp':
            return state.elapsedMs;
        case 'countDown':
            return Math.max(
                0,
                state.options.countDownSeconds * 1000 - state.elapsedMs,
            );
        default:
            return assertNever(timerMode);
    }
}

/** 目前難度的敵人數量、速度與聰明程度 */
export function difficultyRow(state: GameState): DifficultyRow {
    return state.config.difficulties[state.options.difficulty];
}

/** 玩家現在碰到敵人會不會受傷：重生後的無敵時間，或測試用的無敵 */
export function isInvulnerable(state: GameState, level: Level): boolean {
    return state.debugInvincible || level.invulnerableMs > 0;
}

/** 測試用：扣一條命，和碰到敵人一樣；無敵時也有效（原本的除錯快捷鍵 K，介面沒有接上） */
export function debugLoseLife(state: GameState): void {
    if (state.phase.kind === 'playing' && state.level !== null)
        loseLife(state, state.level);
}

/** 測試用：切換無敵（原本的除錯快捷鍵 I，介面沒有接上） */
export function debugToggleInvincible(state: GameState): void {
    state.debugInvincible = !state.debugInvincible;
}

/**
 * 測試用：直接過關，當作走進了正確答案區（原本的除錯快捷鍵 N，介面沒有接上）。
 * 不會發出 answered 訊號。
 */
export function debugCompleteLevel(state: GameState): void {
    const { level, phase } = state;
    if (level === null) return;
    if (
        phase.kind !== 'levelIntro' &&
        phase.kind !== 'playing' &&
        phase.kind !== 'wrongFeedback'
    )
        return;
    const maze = levelMaze(level);
    const correctZone = maze.zones.findIndex(
        (zone) => level.question.choices[zone.choiceIndex]?.correct,
    );
    completeLevel(state, level, correctZone === -1 ? null : correctZone);
}

// ─── 內部 ────────────────────────────────────────────────────

function enterLevel(state: GameState, levelIndex: number): void {
    const question = state.questions[levelIndex];
    if (question === undefined) {
        throw new Error(`第 ${levelIndex + 1} 關沒有對應的題目`);
    }
    const zoneCount = question.choices.length;
    // rounds.ts 已經只留下選項數 2–6 的題目，這裡再用型別守衛讓 TypeScript 也知道
    if (!isZoneCount(zoneCount))
        throw new Error(
            `題目 ${question.id} 的選項數 ${zoneCount} 不在 2–6 之間`,
        );

    const mazeResult = generateLevelMaze(
        state.seed,
        levelIndex,
        zoneCount,
        state.config.maze,
    );
    const { enemyCount } = difficultyRow(state);
    state.levelIndex = levelIndex;
    state.level = {
        questionIndex: levelIndex,
        question,
        mazeResult,
        player: createPlayer(mazeResult.maze.start),
        sealed: mazeResult.maze.zones.map(() => false),
        enteredZone: null,
        wrongChoiceIds: [],
        // 每關開始時敵人先在出生點等待 releaseDelayMs
        enemies: createEnemies(
            mazeResult.maze.enemySpawns,
            enemyCount,
            state.config.enemy.releaseDelayMs,
        ),
        enemyRng: createRng(hashSeed(state.seed, levelIndex, ENEMY_RNG_STREAM)),
        invulnerableMs: 0,
        startElapsedMs: state.elapsedMs,
    };
    state.phase = {
        kind: 'levelIntro',
        remainingMs: state.config.timing.levelIntroMs,
    };
}

/** 玩家中心進入園區內部任一格時判定；走到門上不算 */
function judgeZone(state: GameState, level: Level): void {
    const maze = levelMaze(level);
    const zoneIndex = zoneIndexAt(maze, playerTile(level.player));
    if (zoneIndex === null) return;
    const zone = maze.zones[zoneIndex];
    const choice =
        zone === undefined
            ? undefined
            : level.question.choices[zone.choiceIndex];
    if (choice === undefined) return;

    // 全場靜止
    stopPlayer(level.player);
    state.outbox.push({
        kind: 'answered',
        questionId: level.question.id,
        choiceId: choice.id,
        correct: choice.correct,
        levelElapsedMs: state.elapsedMs - level.startElapsedMs,
    });

    if (choice.correct) {
        completeLevel(state, level, zoneIndex);
    } else {
        level.enteredZone = zoneIndex;
        level.wrongChoiceIds.push(choice.id);
        // 園區以選項 id 識別
        state.phase = {
            kind: 'wrongFeedback',
            zoneId: choice.id,
            remainingMs: state.config.timing.wrongFeedbackMs,
        };
    }
}

/** 答對：記錄這一題的結果，顯示 ✓ */
function completeLevel(
    state: GameState,
    level: Level,
    zoneIndex: number | null,
): void {
    level.enteredZone = zoneIndex;
    state.results.push({
        questionId: level.question.id,
        status: level.wrongChoiceIds.length === 0 ? 'firstTry' : 'retry',
        wrongChoiceIds: [...level.wrongChoiceIds],
    });
    state.phase = {
        kind: 'levelComplete',
        remainingMs: state.config.timing.levelCompleteMs,
    };
}

/** 答錯的回饋結束：門變成牆、玩家移到門外，不扣命 */
function sealEnteredZone(state: GameState, level: Level): void {
    const maze = levelMaze(level);
    const zoneIndex = level.enteredZone;
    const zone = zoneIndex === null ? undefined : maze.zones[zoneIndex];
    if (zone !== undefined) {
        maze.grid.set(zone.door, 'wall');
        level.sealed = level.sealed.map(
            (sealed, i) => sealed || i === zoneIndex,
        );
        level.player.x = zone.outside.x;
        level.player.y = zone.outside.y;
    }
    level.player.dir = null;
    level.enteredZone = null;
    state.phase = { kind: 'playing' };
}

/** 玩家與任一敵人的中心距離小於 collisionDistance */
function touchingEnemy(level: Level, collisionDistance: number): boolean {
    const { player } = level;
    return level.enemies.some(
        (enemy) =>
            Math.hypot(enemy.x - player.x, enemy.y - player.y) <
            collisionDistance,
    );
}

/**
 * 受傷：生命減一，全場靜止播放受傷動畫。
 * 玩家停在被撞到的位置，方向等重生時才清掉；無敵期間用測試鍵扣命時，剩下的無敵時間也一併取消。
 */
function loseLife(state: GameState, level: Level): void {
    state.lives = Math.max(0, state.lives - 1);
    level.invulnerableMs = 0;
    state.phase = {
        kind: 'lifeLost',
        remainingMs: state.config.timing.lifeLostMs,
    };
}

/** 還有命：玩家回起點並暫時無敵，敵人回出生點重新等待；封住的園區維持封住 */
function respawn(state: GameState, level: Level): void {
    const { start } = levelMaze(level);
    level.player.x = start.x;
    level.player.y = start.y;
    stopPlayer(level.player);
    for (const enemy of level.enemies)
        resetEnemy(enemy, state.config.enemy.releaseDelayMs);
    level.invulnerableMs = state.config.timing.invulnerableMs;
    state.phase = { kind: 'playing' };
}

/**
 * 累加遊戲時間（只在 playing、wrongFeedback、lifeLost 呼叫），用時不會超過倒數的長度。
 * 倒數歸零而且 canTimeUp 時結束遊戲、進入 timeUp，回傳 true。
 */
function tickClock(state: GameState, dtMs: number, canTimeUp = true): boolean {
    const limitMs = countDownLimitMs(state.options);
    state.elapsedMs =
        limitMs === null
            ? state.elapsedMs + dtMs
            : Math.min(limitMs, state.elapsedMs + dtMs);
    if (limitMs === null || state.elapsedMs < limitMs || !canTimeUp)
        return false;
    endGame(state, 'timeUp');
    return true;
}

/**
 * 命用完或時間到：目前這題與之後的題目都記為未作答。
 * 目前這題答錯過的選項照樣保留。
 */
function endGame(state: GameState, kind: 'gameOver' | 'timeUp'): void {
    const current = state.level;
    for (
        let levelIndex = state.levelIndex;
        levelIndex < state.questions.length;
        levelIndex++
    ) {
        const question = state.questions[levelIndex];
        if (question === undefined) continue;
        const wrongChoiceIds =
            levelIndex === state.levelIndex && current !== null
                ? [...current.wrongChoiceIds]
                : [];
        state.results.push({
            questionId: question.id,
            status: 'unanswered',
            wrongChoiceIds,
        });
    }
    state.phase = { kind };
    state.outbox.push({ kind: 'ended', reason: kind });
}

/** 所有題目都答完 */
function finish(state: GameState): void {
    state.phase = { kind: 'finished' };
    state.outbox.push({ kind: 'ended', reason: 'finished' });
}

function stopPlayer(player: Player): void {
    player.dir = null;
    player.pendingDir = null;
    player.pendingMs = 0;
}
