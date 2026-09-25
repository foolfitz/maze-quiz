import { CONFIG } from '../config';
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
import type { GameOptions, Question, QuizFile } from './quiz';
import { createRng, hashSeed } from './rng';
import { assertNever, type Direction, type Phase, type QuestionResult } from './types';

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
  readonly timing: TimingConfig;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  maze: DEFAULT_MAZE_CONFIG,
  player: DEFAULT_PLAYER_CONFIG,
  timing: CONFIG.timing,
};

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
      state.elapsedMs += dtMs;
      updatePlayer(level.player, dtMs, playerPassable(levelMaze(level)), config.player);
      judgeZone(state, level);
      return;
    }

    case 'wrongFeedback': {
      state.elapsedMs += dtMs;
      const remainingMs = phase.remainingMs - dtMs;
      if (remainingMs > 0) state.phase = { ...phase, remainingMs };
      else if (level !== null) sealEnteredZone(state, level);
      return;
    }

    case 'lifeLost': {
      // M5 才會進到這個狀態
      state.elapsedMs += dtMs;
      const remainingMs = phase.remainingMs - dtMs;
      state.phase = remainingMs > 0 ? { ...phase, remainingMs } : { kind: 'playing' };
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
  state.levelIndex = levelIndex;
  state.level = {
    questionIndex,
    question,
    mazeResult,
    player: createPlayer(mazeResult.maze.start),
    sealed: mazeResult.maze.zones.map(() => false),
    enteredZone: null,
    wrongChoiceIds: [],
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
  level.player.dir = null;
  level.player.pendingDir = null;
  level.player.pendingMs = 0;

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
