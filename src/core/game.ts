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
import type { Difficulty, GameOptions, Question, QuizFile } from './quiz';
import { createRng, hashSeed, type Rng } from './rng';
import { assertNever, type Direction, type Phase, type PlayPhase, type QuestionResult } from './types';

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
  readonly questionIndex: number; // quiz.questions 的索引
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
  /** 重生後的無敵時間還剩多久（§10）；0 表示不在無敵狀態 */
  invulnerableMs: number;
}

export interface GameState {
  phase: Phase;
  readonly quiz: QuizFile;
  readonly options: GameOptions;
  readonly config: GameConfig;
  readonly seed: number;
  /** 出題順序：第 i 關出 quiz.questions[order[i]] */
  readonly order: readonly number[];
  levelIndex: number;
  level: Level | null;
  /** 遊戲時間，只在 playing、wrongFeedback、lifeLost 累加（§5.2） */
  elapsedMs: number;
  lives: number;
  readonly results: QuestionResult[];
  /** 除錯快捷鍵 I 切換的無敵（§12.6），和重生後的無敵時間分開 */
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

/** 建立一局新遊戲，停在標題畫面 */
export function createGame(
  quiz: QuizFile,
  options: GameOptions,
  seed: number,
  config: GameConfig = DEFAULT_GAME_CONFIG,
): GameState {
  const indexes = quiz.questions.map((_, i) => i);
  // 出題順序用另一條亂數序列，和每一關的迷宮種子 hashSeed(seed, levelIndex, attempt) 分開
  const order = options.shuffleQuestions ? createRng(hashSeed(seed)).shuffle(indexes) : indexes;
  return {
    phase: { kind: 'title' },
    quiz,
    options,
    config,
    seed,
    order,
    levelIndex: 0,
    level: null,
    elapsedMs: 0,
    lives: options.lives,
    results: [],
    debugInvincible: false,
  };
}

/** 標題畫面按「開始」 */
export function startGame(state: GameState): void {
  if (state.phase.kind !== 'title') return;
  enterLevel(state, 0);
}

/** 方向指令；只在 playing 時有效，其他時候回傳 null */
export function steer(state: GameState, direction: Direction): TurnResult | null {
  const { level } = state;
  if (state.phase.kind !== 'playing' || level === null) return null;
  return requestDirection(level.player, direction, playerPassable(levelMaze(level)), state.config.player);
}

/** 單步更新（§5.3，固定 dtMs） */
export function stepGame(state: GameState, dtMs: number): void {
  const { phase, level, config } = state;
  switch (phase.kind) {
    case 'loading':
    case 'error':
    case 'title':
    case 'paused':
    case 'gameOver':
    case 'timeUp':
    case 'results':
      return;

    case 'levelIntro': {
      // 題目與迷宮已經顯示，玩家不動、不計時
      const remainingMs = phase.remainingMs - dtMs;
      state.phase = remainingMs > 0 ? { ...phase, remainingMs } : { kind: 'playing' };
      return;
    }

    case 'playing': {
      if (level === null) return;
      if (tickClock(state, dtMs)) return;
      updatePlayer(level.player, dtMs, playerPassable(levelMaze(level)), config.player);
      judgeZone(state, level);
      if (state.phase.kind !== 'playing') return; // 走進園區了，全場靜止

      level.invulnerableMs = Math.max(0, level.invulnerableMs - dtMs);
      const row = difficultyRow(state);
      const ctx: EnemyContext = {
        maze: levelMaze(level),
        player: level.player,
        rng: level.enemyRng,
        speedTilesPerSec: config.player.speedTilesPerSec * row.enemySpeedRatio,
        smartRatio: row.smartRatio,
        ambushLookahead: config.enemy.ambushLookahead,
      };
      for (const enemy of level.enemies) updateEnemy(enemy, dtMs, ctx);
      if (!isInvulnerable(state, level) && touchingEnemy(level, config.collisionDistance)) loseLife(state, level);
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
      // 受傷動畫期間全場靜止，但照樣計時（§5.2）；已經沒有命時結果就是「沒有命了」，不會變成時間到
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
      else if (state.levelIndex + 1 < state.order.length) enterLevel(state, state.levelIndex + 1);
      else state.phase = { kind: 'results' };
      return;
    }

    default:
      assertNever(phase);
  }
}

/** 可以暫停的狀態（§5.1 的 PlayPhase）；型別守衛讓 TypeScript 知道回傳 true 時 phase 是 PlayPhase */
export function isPlayPhase(phase: Phase): phase is PlayPhase {
  switch (phase.kind) {
    case 'levelIntro':
    case 'playing':
    case 'wrongFeedback':
    case 'lifeLost':
    case 'levelComplete':
      return true;
    case 'loading':
    case 'error':
    case 'title':
    case 'paused':
    case 'gameOver':
    case 'timeUp':
    case 'results':
      return false;
    default:
      return assertNever(phase);
  }
}

/** 暫停：只有 PlayPhase 可以暫停，並記住要回到哪個狀態（§5.1） */
export function pauseGame(state: GameState): void {
  if (isPlayPhase(state.phase)) state.phase = { kind: 'paused', resumeTo: state.phase };
}

/** 「繼續」：回到暫停前的狀態，剩下的倒數時間照舊 */
export function resumeGame(state: GameState): void {
  if (state.phase.kind === 'paused') state.phase = state.phase.resumeTo;
}

/** 倒數的總長度；不是倒數模式時是 null */
function countDownLimitMs(options: GameOptions): number | null {
  return options.timerMode === 'countDown' ? options.countDownSeconds * 1000 : null;
}

/** 狀態列要顯示的時間（§5.2）：正計時是用時，倒數是剩下的時間（最小 0），不顯示時間時是 null */
export function clockMs(state: GameState): number | null {
  const { timerMode } = state.options;
  switch (timerMode) {
    case 'none':
      return null;
    case 'countUp':
      return state.elapsedMs;
    case 'countDown':
      return Math.max(0, state.options.countDownSeconds * 1000 - state.elapsedMs);
    default:
      return assertNever(timerMode);
  }
}

/** 「沒有命了」或「時間到」畫面按「看成績」 */
export function viewResults(state: GameState): void {
  if (state.phase.kind === 'gameOver' || state.phase.kind === 'timeUp') state.phase = { kind: 'results' };
}

/** 目前難度的敵人數量、速度與聰明程度 */
export function difficultyRow(state: GameState): DifficultyRow {
  return state.config.difficulties[state.options.difficulty];
}

/** 玩家現在碰到敵人會不會受傷：重生後的無敵時間，或除錯用的無敵 */
export function isInvulnerable(state: GameState, level: Level): boolean {
  return state.debugInvincible || level.invulnerableMs > 0;
}

/** 除錯快捷鍵 K：扣一條命，和碰到敵人一樣（§12.6）；無敵時也有效 */
export function debugLoseLife(state: GameState): void {
  if (state.phase.kind === 'playing' && state.level !== null) loseLife(state, state.level);
}

/** 除錯快捷鍵 I：切換無敵（§12.6） */
export function debugToggleInvincible(state: GameState): void {
  state.debugInvincible = !state.debugInvincible;
}

/** 除錯快捷鍵 N：直接過關，當作走進了正確答案區（§12.6） */
export function debugCompleteLevel(state: GameState): void {
  const { level, phase } = state;
  if (level === null) return;
  if (phase.kind !== 'levelIntro' && phase.kind !== 'playing' && phase.kind !== 'wrongFeedback') return;
  const maze = levelMaze(level);
  const correctZone = maze.zones.findIndex((zone) => level.question.choices[zone.choiceIndex]?.correct);
  completeLevel(state, level, correctZone === -1 ? null : correctZone);
}

// ─── 內部 ────────────────────────────────────────────────────

function enterLevel(state: GameState, levelIndex: number): void {
  const questionIndex = state.order[levelIndex];
  const question = questionIndex === undefined ? undefined : state.quiz.questions[questionIndex];
  if (questionIndex === undefined || question === undefined) {
    throw new Error(`第 ${levelIndex + 1} 關沒有對應的題目`);
  }
  const zoneCount = question.choices.length;
  // 題組驗證已經保證選項數是 2–6，這裡再用型別守衛讓 TypeScript 也知道
  if (!isZoneCount(zoneCount)) throw new Error(`題目 ${question.id} 的選項數 ${zoneCount} 不在 2–6 之間`);

  const mazeResult = generateLevelMaze(state.seed, levelIndex, zoneCount, state.config.maze);
  const { enemyCount } = difficultyRow(state);
  state.levelIndex = levelIndex;
  state.level = {
    questionIndex,
    question,
    mazeResult,
    player: createPlayer(mazeResult.maze.start),
    sealed: mazeResult.maze.zones.map(() => false),
    enteredZone: null,
    wrongChoiceIds: [],
    // 每關開始時敵人先在出生點等待 releaseDelayMs（§9）
    enemies: createEnemies(mazeResult.maze.enemySpawns, enemyCount, state.config.enemy.releaseDelayMs),
    enemyRng: createRng(hashSeed(state.seed, levelIndex, ENEMY_RNG_STREAM)),
    invulnerableMs: 0,
  };
  state.phase = { kind: 'levelIntro', remainingMs: state.config.timing.levelIntroMs };
}

/** 玩家中心進入園區內部任一格時判定；走到門上不算（§8） */
function judgeZone(state: GameState, level: Level): void {
  const maze = levelMaze(level);
  const zoneIndex = zoneIndexAt(maze, playerTile(level.player));
  if (zoneIndex === null) return;
  const zone = maze.zones[zoneIndex];
  const choice = zone === undefined ? undefined : level.question.choices[zone.choiceIndex];
  if (choice === undefined) return;

  // 全場靜止
  stopPlayer(level.player);

  if (choice.correct) {
    completeLevel(state, level, zoneIndex);
  } else {
    level.enteredZone = zoneIndex;
    level.wrongChoiceIds.push(choice.id);
    // 園區以選項 id 識別
    state.phase = { kind: 'wrongFeedback', zoneId: choice.id, remainingMs: state.config.timing.wrongFeedbackMs };
  }
}

/** 答對：記錄這一題的結果，顯示 ✓ */
function completeLevel(state: GameState, level: Level, zoneIndex: number | null): void {
  level.enteredZone = zoneIndex;
  state.results.push({
    questionId: level.question.id,
    status: level.wrongChoiceIds.length === 0 ? 'firstTry' : 'retry',
    wrongChoiceIds: [...level.wrongChoiceIds],
  });
  state.phase = { kind: 'levelComplete', remainingMs: state.config.timing.levelCompleteMs };
}

/** 答錯的回饋結束：門變成牆、玩家移到門外（§8），不扣命 */
function sealEnteredZone(state: GameState, level: Level): void {
  const maze = levelMaze(level);
  const zoneIndex = level.enteredZone;
  const zone = zoneIndex === null ? undefined : maze.zones[zoneIndex];
  if (zone !== undefined) {
    maze.grid.set(zone.door, 'wall');
    level.sealed = level.sealed.map((sealed, i) => sealed || i === zoneIndex);
    level.player.x = zone.outside.x;
    level.player.y = zone.outside.y;
  }
  level.player.dir = null;
  level.enteredZone = null;
  state.phase = { kind: 'playing' };
}

/** 玩家與任一敵人的中心距離小於 collisionDistance（§10） */
function touchingEnemy(level: Level, collisionDistance: number): boolean {
  const { player } = level;
  return level.enemies.some((enemy) => Math.hypot(enemy.x - player.x, enemy.y - player.y) < collisionDistance);
}

/**
 * 受傷：生命減一，全場靜止播放受傷動畫（§10）。
 * 玩家停在被撞到的位置，方向等重生時才清掉；除錯鍵 K 在無敵期間扣命時，剩下的無敵時間也一併取消。
 */
function loseLife(state: GameState, level: Level): void {
  state.lives = Math.max(0, state.lives - 1);
  level.invulnerableMs = 0;
  state.phase = { kind: 'lifeLost', remainingMs: state.config.timing.lifeLostMs };
}

/** 還有命：玩家回起點並暫時無敵，敵人回出生點重新等待；封住的園區維持封住（§10） */
function respawn(state: GameState, level: Level): void {
  const { start } = levelMaze(level);
  level.player.x = start.x;
  level.player.y = start.y;
  stopPlayer(level.player);
  for (const enemy of level.enemies) resetEnemy(enemy, state.config.enemy.releaseDelayMs);
  level.invulnerableMs = state.config.timing.invulnerableMs;
  state.phase = { kind: 'playing' };
}

/**
 * 累加遊戲時間（§5.2，只在 playing、wrongFeedback、lifeLost 呼叫），用時不會超過倒數的長度。
 * 倒數歸零而且 canTimeUp 時結束遊戲、進入 timeUp，回傳 true。
 */
function tickClock(state: GameState, dtMs: number, canTimeUp = true): boolean {
  const limitMs = countDownLimitMs(state.options);
  state.elapsedMs = limitMs === null ? state.elapsedMs + dtMs : Math.min(limitMs, state.elapsedMs + dtMs);
  if (limitMs === null || state.elapsedMs < limitMs || !canTimeUp) return false;
  endGame(state, 'timeUp');
  return true;
}

/**
 * 命用完或時間到：目前這題與之後的題目都記為未作答（§10）。
 * 目前這題答錯過的選項照樣保留，結算回顧時看得到走進過哪些園區。
 */
function endGame(state: GameState, kind: 'gameOver' | 'timeUp'): void {
  const current = state.level;
  for (let levelIndex = state.levelIndex; levelIndex < state.order.length; levelIndex++) {
    const questionIndex = state.order[levelIndex];
    const question = questionIndex === undefined ? undefined : state.quiz.questions[questionIndex];
    if (question === undefined) continue;
    const wrongChoiceIds = levelIndex === state.levelIndex && current !== null ? [...current.wrongChoiceIds] : [];
    state.results.push({ questionId: question.id, status: 'unanswered', wrongChoiceIds });
  }
  state.phase = { kind };
}

function stopPlayer(player: Player): void {
  player.dir = null;
  player.pendingDir = null;
  player.pendingMs = 0;
}
