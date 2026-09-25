import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_OPTIONS } from '../config';
import {
  clockMs,
  createGame,
  DEFAULT_GAME_CONFIG,
  debugCompleteLevel,
  debugLoseLife,
  debugToggleInvincible,
  isInvulnerable,
  isPlayPhase,
  levelMaze,
  pauseGame,
  resumeGame,
  startGame,
  steer,
  stepGame,
  viewResults,
  type GameConfig,
  type GameState,
  type Level,
} from './game';
import type { Enemy } from './enemies';
import { opposite } from './grid';
import type { Difficulty, GameOptions, QuizFile } from './quiz';

const STEP_MS = 1000 / 60;
const { timing } = DEFAULT_GAME_CONFIG;
const releaseDelayMs = DEFAULT_GAME_CONFIG.enemy.releaseDelayMs;

/** 判定相關的測試不放敵人，免得玩家在測試途中被撞到 */
const NO_ENEMIES: GameConfig = {
  ...DEFAULT_GAME_CONFIG,
  difficulties: { 1: noEnemy(1), 2: noEnemy(2), 3: noEnemy(3), 4: noEnemy(4), 5: noEnemy(5) },
};

function noEnemy(difficulty: Difficulty) {
  return { ...DEFAULT_GAME_CONFIG.difficulties[difficulty], enemyCount: 0 };
}

const quiz: QuizFile = {
  schemaVersion: 1,
  id: 'test',
  title: 'Test',
  locale: 'en',
  images: {},
  questions: [
    {
      id: 'q1',
      prompt: 'Pick A',
      choices: [
        { id: 'q1-a', text: 'A', correct: true },
        { id: 'q1-b', text: 'B', correct: false },
        { id: 'q1-c', text: 'C', correct: false },
        { id: 'q1-d', text: 'D', correct: false },
      ],
    },
    {
      id: 'q2',
      prompt: 'Pick A or B',
      choices: [
        { id: 'q2-a', text: 'A', correct: true },
        { id: 'q2-b', text: 'B', correct: true },
        { id: 'q2-c', text: 'C', correct: false },
      ],
    },
  ],
};

const options: GameOptions = { ...DEFAULT_GAME_OPTIONS, shuffleQuestions: false };

/** 以 60 Hz 前進 durationMs 毫秒 */
function run(state: GameState, durationMs: number): void {
  const steps = Math.round(durationMs / STEP_MS);
  for (let i = 0; i < steps; i++) stepGame(state, STEP_MS);
}

/** 一直前進到狀態不再是 kind（例如受傷動畫播完、剛好重生的那一刻） */
function runWhile(state: GameState, kind: GameState['phase']['kind'], maxMs = 10_000): void {
  for (let t = 0; state.phase.kind === kind && t < maxMs; t += STEP_MS) stepGame(state, STEP_MS);
}

function currentLevel(state: GameState): Level {
  if (state.level === null) throw new Error('目前沒有關卡');
  return state.level;
}

/** 開始遊戲並跳過「預備」 */
function startPlaying(seed = 1, config: GameConfig = NO_ENEMIES, gameOptions: GameOptions = options): GameState {
  const state = createGame(quiz, gameOptions, seed, config);
  startGame(state);
  run(state, timing.levelIntroMs);
  expect(state.phase.kind).toBe('playing');
  return state;
}

/** 放著選項 choiceId 的園區索引 */
function zoneOf(state: GameState, choiceId: string): number {
  const level = currentLevel(state);
  const index = levelMaze(level).zones.findIndex((zone) => level.question.choices[zone.choiceIndex]?.id === choiceId);
  if (index === -1) throw new Error(`找不到選項 ${choiceId}`);
  return index;
}

/** 把玩家放到園區門外，往門走進去，直到狀態改變 */
function walkInto(state: GameState, zoneIndex: number): void {
  const level = currentLevel(state);
  const zone = levelMaze(level).zones[zoneIndex];
  if (zone === undefined) throw new Error(`沒有第 ${zoneIndex} 個園區`);
  Object.assign(level.player, { x: zone.outside.x, y: zone.outside.y, dir: null });
  steer(state, opposite(zone.doorSide));
  for (let i = 0; i < 120 && state.phase.kind === 'playing'; i++) stepGame(state, STEP_MS);
}

describe('開始與「預備」', () => {
  it('建立後停在標題畫面，按開始進入第 1 關的預備', () => {
    const state = createGame(quiz, options, 1);
    expect(state.phase.kind).toBe('title');
    startGame(state);
    expect(state.phase).toEqual({ kind: 'levelIntro', remainingMs: timing.levelIntroMs });
    expect(currentLevel(state).question.id).toBe('q1');
    expect(state.lives).toBe(options.lives);
  });

  it('預備期間玩家不能動、不計時，時間到進入 playing', () => {
    const state = createGame(quiz, options, 1);
    startGame(state);
    const player = currentLevel(state).player;
    const start = { x: player.x, y: player.y };
    for (const direction of ['up', 'down', 'left', 'right'] as const) expect(steer(state, direction)).toBeNull();
    run(state, timing.levelIntroMs - 100);
    expect(state.phase.kind).toBe('levelIntro');
    expect(state.elapsedMs).toBe(0);
    expect({ x: player.x, y: player.y }).toEqual(start);
    run(state, 200);
    expect(state.phase.kind).toBe('playing');
  });
});

describe('答錯（§8）', () => {
  it('顯示 ✗ 約 0.6 秒，期間全場靜止', () => {
    const state = startPlaying();
    walkInto(state, zoneOf(state, 'q1-b'));
    expect(state.phase).toMatchObject({ kind: 'wrongFeedback', zoneId: 'q1-b' });
    const level = currentLevel(state);
    expect(level.player.dir).toBeNull();
    expect(level.enteredZone).toBe(zoneOf(state, 'q1-b'));
    expect(steer(state, 'up')).toBeNull();
  });

  it('結束後：封住該區、玩家移到門外、命不變、記錄答錯一次', () => {
    const state = startPlaying();
    const zoneIndex = zoneOf(state, 'q1-b');
    walkInto(state, zoneIndex);
    run(state, timing.wrongFeedbackMs + STEP_MS);

    const level = currentLevel(state);
    const zone = levelMaze(level).zones[zoneIndex];
    expect(state.phase.kind).toBe('playing');
    expect(zone && levelMaze(level).grid.isFloor(zone.door)).toBe(false);
    expect(level.sealed[zoneIndex]).toBe(true);
    expect(level.player).toMatchObject({ x: zone?.outside.x, y: zone?.outside.y, dir: null });
    expect(level.enteredZone).toBeNull();
    expect(state.lives).toBe(options.lives);
    expect(level.wrongChoiceIds).toEqual(['q1-b']);
  });

  it('封住的園區走不進去', () => {
    const state = startPlaying();
    const zoneIndex = zoneOf(state, 'q1-c');
    walkInto(state, zoneIndex);
    run(state, timing.wrongFeedbackMs + STEP_MS);
    const zone = levelMaze(currentLevel(state)).zones[zoneIndex];
    if (zone === undefined) throw new Error('沒有園區');
    expect(steer(state, opposite(zone.doorSide))).toBe('bumped');
  });

  it('答錯多次時依先後順序記錄', () => {
    const state = startPlaying();
    for (const id of ['q1-d', 'q1-b']) {
      walkInto(state, zoneOf(state, id));
      run(state, timing.wrongFeedbackMs + STEP_MS);
    }
    expect(currentLevel(state).wrongChoiceIds).toEqual(['q1-d', 'q1-b']);
  });
});

describe('答對', () => {
  it('一次答對：顯示 ✓ 約 0.8 秒，記為 firstTry，然後進入下一關的預備', () => {
    const state = startPlaying();
    const zoneIndex = zoneOf(state, 'q1-a');
    walkInto(state, zoneIndex);
    expect(state.phase.kind).toBe('levelComplete');
    expect(currentLevel(state).enteredZone).toBe(zoneIndex);
    expect(state.results).toEqual([{ questionId: 'q1', status: 'firstTry', wrongChoiceIds: [] }]);

    run(state, timing.levelCompleteMs + STEP_MS);
    expect(state.phase.kind).toBe('levelIntro');
    expect(state.levelIndex).toBe(1);
    expect(currentLevel(state).question.id).toBe('q2');
  });

  it('答錯過再答對：記為 retry，附上答錯的選項', () => {
    const state = startPlaying();
    walkInto(state, zoneOf(state, 'q1-c'));
    run(state, timing.wrongFeedbackMs + STEP_MS);
    walkInto(state, zoneOf(state, 'q1-a'));
    expect(state.results).toEqual([{ questionId: 'q1', status: 'retry', wrongChoiceIds: ['q1-c'] }]);
  });

  it.each(['q2-a', 'q2-b'])('有多個正確選項時，走進任何一個都過關：%s', (choiceId) => {
    const state = startPlaying();
    walkInto(state, zoneOf(state, 'q1-a'));
    run(state, timing.levelCompleteMs + timing.levelIntroMs + STEP_MS * 2);
    expect(currentLevel(state).question.id).toBe('q2');
    walkInto(state, zoneOf(state, choiceId));
    expect(state.phase.kind).toBe('levelComplete');
  });

  it('最後一題答對後進入結算', () => {
    const state = startPlaying();
    walkInto(state, zoneOf(state, 'q1-a'));
    run(state, timing.levelCompleteMs + timing.levelIntroMs + STEP_MS * 2);
    walkInto(state, zoneOf(state, 'q2-c'));
    run(state, timing.wrongFeedbackMs + STEP_MS);
    walkInto(state, zoneOf(state, 'q2-b'));
    run(state, timing.levelCompleteMs + STEP_MS);
    expect(state.phase.kind).toBe('results');
    expect(state.results.map((r) => r.status)).toEqual(['firstTry', 'retry']);
  });
});

describe('計時（§5.2）', () => {
  it('playing 與 wrongFeedback 計時，levelIntro 與 levelComplete 不計時', () => {
    const state = createGame(quiz, options, 1, NO_ENEMIES);
    startGame(state);
    run(state, timing.levelIntroMs);
    expect(state.elapsedMs).toBe(0);

    run(state, 1000);
    expect(state.elapsedMs).toBeCloseTo(1000, 0);

    walkInto(state, zoneOf(state, 'q1-b'));
    const beforeFeedback = state.elapsedMs;
    run(state, timing.wrongFeedbackMs + STEP_MS);
    expect(state.elapsedMs - beforeFeedback).toBeCloseTo(timing.wrongFeedbackMs + STEP_MS, 0);

    walkInto(state, zoneOf(state, 'q1-a'));
    const beforeComplete = state.elapsedMs;
    run(state, timing.levelCompleteMs + timing.levelIntroMs);
    expect(state.elapsedMs).toBe(beforeComplete);
  });
});

describe('出題順序', () => {
  const many: QuizFile = {
    ...quiz,
    questions: Array.from({ length: 8 }, (_, i) => ({
      id: `q${i}`,
      prompt: `Q${i}`,
      choices: [
        { id: 'a', text: 'a', correct: true },
        { id: 'b', text: 'b', correct: false },
      ],
    })),
  };

  it('shuffleQuestions 為 false 時照題組順序', () => {
    expect(createGame(many, options, 1).order).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('shuffleQuestions 為 true 時打亂，同一個種子順序相同', () => {
    const shuffled = { ...options, shuffleQuestions: true };
    const order = createGame(many, shuffled, 5).order;
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(order).not.toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(createGame(many, shuffled, 5).order).toEqual(order);
  });
});

describe('除錯快捷鍵', () => {
  it('N 直接過關，並在正確的園區顯示 ✓', () => {
    const state = startPlaying();
    debugCompleteLevel(state);
    expect(state.phase.kind).toBe('levelComplete');
    expect(currentLevel(state).enteredZone).toBe(zoneOf(state, 'q1-a'));
  });
});

// ─── M5 敵人與生命 ───────────────────────────────────────────

function firstEnemy(state: GameState): Enemy {
  const enemy = currentLevel(state).enemies[0];
  if (enemy === undefined) throw new Error('沒有敵人');
  return enemy;
}

/** 把第一隻敵人放到玩家身上，前進一步 */
function hitByEnemy(state: GameState): void {
  const { player } = currentLevel(state);
  Object.assign(firstEnemy(state), { x: player.x, y: player.y });
  stepGame(state, STEP_MS);
}

describe('敵人（§9）', () => {
  it.each([
    [1, ['chaser']],
    [3, ['chaser', 'wanderer']],
    [5, ['chaser', 'wanderer', 'ambusher']],
  ] as const)('難度 %i 的敵人：%j', (difficulty, kinds) => {
    const state = startPlaying(1, DEFAULT_GAME_CONFIG, { ...options, difficulty });
    const level = currentLevel(state);
    expect(level.enemies.map((e) => e.kind)).toEqual(kinds);
    level.enemies.forEach((enemy, i) => expect(enemy.spawn).toEqual(levelMaze(level).enemySpawns[i]));
  });

  it('同一個種子在不同難度下是同一張迷宮', () => {
    const easy = startPlaying(3, DEFAULT_GAME_CONFIG, { ...options, difficulty: 1 });
    const hard = startPlaying(3, DEFAULT_GAME_CONFIG, { ...options, difficulty: 5 });
    expect(levelMaze(currentLevel(easy)).grid).toEqual(levelMaze(currentLevel(hard)).grid);
  });

  it('預備期間不動；開始後先等 releaseDelayMs 才出發', () => {
    const state = createGame(quiz, options, 1);
    startGame(state);
    const enemy = firstEnemy(state);
    const spawn = { x: enemy.x, y: enemy.y };
    run(state, timing.levelIntroMs);
    expect({ x: enemy.x, y: enemy.y }).toEqual(spawn);
    run(state, releaseDelayMs - 100);
    expect({ x: enemy.x, y: enemy.y }).toEqual(spawn);
    run(state, 300);
    expect({ x: enemy.x, y: enemy.y }).not.toEqual(spawn);
  });

  it('速度是玩家速度乘上難度的 enemySpeedRatio', () => {
    for (const difficulty of [1, 5] as const) {
      const state = startPlaying(1, DEFAULT_GAME_CONFIG, { ...options, difficulty });
      run(state, releaseDelayMs);
      const enemy = firstEnemy(state);
      // 同一隻敵人連續走 0.1 秒（不會在這麼短的時間內回頭）
      const before = { x: enemy.x, y: enemy.y };
      Object.assign(currentLevel(state), { invulnerableMs: 10_000 });
      run(state, 100);
      const moved = Math.abs(enemy.x - before.x) + Math.abs(enemy.y - before.y);
      const ratio = DEFAULT_GAME_CONFIG.difficulties[difficulty].enemySpeedRatio;
      expect(moved).toBeCloseTo(DEFAULT_GAME_CONFIG.player.speedTilesPerSec * ratio * 0.1, 2);
    }
  });
});

describe('受傷與重生（§10）', () => {
  it('碰到敵人：生命減一，進入 lifeLost，全場靜止', () => {
    const state = startPlaying(1, DEFAULT_GAME_CONFIG);
    hitByEnemy(state);
    expect(state.lives).toBe(options.lives - 1);
    expect(state.phase).toMatchObject({ kind: 'lifeLost' });
    expect(steer(state, 'up')).toBeNull();

    const level = currentLevel(state);
    const snapshot = JSON.stringify([level.player, level.enemies]);
    run(state, timing.lifeLostMs - 100);
    expect(JSON.stringify([level.player, level.enemies])).toBe(snapshot);
  });

  it('中心距離小於 collisionDistance 才算碰到', () => {
    const state = startPlaying(1, DEFAULT_GAME_CONFIG);
    const level = currentLevel(state);
    const enemy = firstEnemy(state);
    const { collisionDistance } = DEFAULT_GAME_CONFIG;
    Object.assign(enemy, { x: level.player.x + collisionDistance + 0.01, y: level.player.y });
    stepGame(state, STEP_MS);
    expect(state.phase.kind).toBe('playing');
    Object.assign(enemy, { x: level.player.x + collisionDistance - 0.01, y: level.player.y });
    stepGame(state, STEP_MS);
    expect(state.phase.kind).toBe('lifeLost');
  });

  it('lifeLost 期間照樣計時（§5.2）', () => {
    const state = startPlaying(1, DEFAULT_GAME_CONFIG);
    hitByEnemy(state);
    const before = state.elapsedMs;
    run(state, 500);
    expect(state.elapsedMs - before).toBeCloseTo(500, 0);
  });

  it('還有命：玩家回起點、敵人回出生點重新等待、玩家無敵，封住的園區維持封住', () => {
    const state = startPlaying(1, DEFAULT_GAME_CONFIG);
    const zoneIndex = zoneOf(state, 'q1-b');
    walkInto(state, zoneIndex);
    run(state, timing.wrongFeedbackMs + STEP_MS);
    const level = currentLevel(state);
    expect(level.sealed[zoneIndex]).toBe(true);

    hitByEnemy(state);
    runWhile(state, 'lifeLost');
    const maze = levelMaze(level);
    expect(state.phase.kind).toBe('playing');
    expect(level.player).toMatchObject({ x: maze.start.x, y: maze.start.y, dir: null, pendingDir: null });
    for (const enemy of level.enemies) {
      expect(enemy).toMatchObject({ x: enemy.spawn.x, y: enemy.spawn.y, dir: null, releaseMs: releaseDelayMs });
    }
    expect(level.invulnerableMs).toBe(timing.invulnerableMs);
    expect(level.sealed[zoneIndex]).toBe(true);
    expect(maze.grid.isFloor(maze.zones[zoneIndex]?.door ?? maze.start)).toBe(false);
  });

  it('無敵期間碰到敵人不會受傷，無敵結束後會', () => {
    const state = startPlaying(1, DEFAULT_GAME_CONFIG);
    hitByEnemy(state);
    runWhile(state, 'lifeLost');
    const level = currentLevel(state);
    expect(isInvulnerable(state, level)).toBe(true);

    // 每一步都把敵人放到玩家身上，直到受傷為止
    let steps = 0;
    while (state.phase.kind === 'playing' && steps < 1000) {
      hitByEnemy(state);
      steps++;
    }
    expect(steps * STEP_MS).toBeCloseTo(timing.invulnerableMs, -2);
    expect(isInvulnerable(state, level)).toBe(false);
    expect(state.phase.kind).toBe('lifeLost');
    expect(state.lives).toBe(options.lives - 2);
  });

  it('重生後敵人在出生點等 releaseDelayMs 才出發', () => {
    const state = startPlaying(1, DEFAULT_GAME_CONFIG);
    run(state, releaseDelayMs + 500);
    debugLoseLife(state);
    runWhile(state, 'lifeLost');
    const level = currentLevel(state);
    const positions = (): string => JSON.stringify(level.enemies.map((e) => [e.x, e.y]));
    const atSpawn = JSON.stringify(level.enemies.map((e) => [e.spawn.x, e.spawn.y]));
    expect(positions()).toBe(atSpawn);
    run(state, releaseDelayMs - 100);
    expect(positions()).toBe(atSpawn);
    run(state, 300);
    expect(positions()).not.toBe(atSpawn);
  });

  it('答錯回饋與過關期間敵人不動', () => {
    const state = startPlaying(1, DEFAULT_GAME_CONFIG);
    debugToggleInvincible(state); // 走向園區途中不要被撞
    run(state, releaseDelayMs + 500);
    const level = currentLevel(state);
    const positions = (): string => JSON.stringify(level.enemies.map((e) => [e.x, e.y, e.dir]));

    walkInto(state, zoneOf(state, 'q1-b'));
    expect(state.phase.kind).toBe('wrongFeedback');
    const atFeedback = positions();
    run(state, timing.wrongFeedbackMs - 100);
    expect(positions()).toBe(atFeedback);

    run(state, 200);
    walkInto(state, zoneOf(state, 'q1-a'));
    expect(state.phase.kind).toBe('levelComplete');
    const atComplete = positions();
    run(state, timing.levelCompleteMs - 100);
    expect(positions()).toBe(atComplete);
  });

  it('命歸零 → gameOver；目前這題與之後的題目記為未作答', () => {
    const state = startPlaying(1, DEFAULT_GAME_CONFIG, { ...options, lives: 2 });
    walkInto(state, zoneOf(state, 'q1-c'));
    run(state, timing.wrongFeedbackMs + STEP_MS);

    hitByEnemy(state);
    runWhile(state, 'lifeLost');
    expect(state.phase.kind).toBe('playing');
    run(state, timing.invulnerableMs);
    hitByEnemy(state);
    expect(state.lives).toBe(0);
    run(state, timing.lifeLostMs - 100);
    expect(state.phase.kind).toBe('lifeLost');
    run(state, 200);

    expect(state.phase.kind).toBe('gameOver');
    expect(state.results).toEqual([
      { questionId: 'q1', status: 'unanswered', wrongChoiceIds: ['q1-c'] },
      { questionId: 'q2', status: 'unanswered', wrongChoiceIds: [] },
    ]);
    // gameOver 之後不再計時，按「看成績」進入結算
    const elapsed = state.elapsedMs;
    run(state, 1000);
    expect(state.elapsedMs).toBe(elapsed);
    viewResults(state);
    expect(state.phase.kind).toBe('results');
  });

  it('答對過的題目保留結果，只有目前與之後的題目記為未作答', () => {
    const state = startPlaying(1, DEFAULT_GAME_CONFIG, { ...options, lives: 1 });
    walkInto(state, zoneOf(state, 'q1-a'));
    run(state, timing.levelCompleteMs + timing.levelIntroMs + STEP_MS * 2);
    hitByEnemy(state);
    run(state, timing.lifeLostMs + STEP_MS);
    expect(state.phase.kind).toBe('gameOver');
    expect(state.results.map((r) => [r.questionId, r.status])).toEqual([
      ['q1', 'firstTry'],
      ['q2', 'unanswered'],
    ]);
  });

  it('viewResults 只在 gameOver 與 timeUp 有效', () => {
    const state = startPlaying();
    viewResults(state);
    expect(state.phase.kind).toBe('playing');
  });
});

describe('除錯快捷鍵（M5）', () => {
  it('K 扣一條命，和碰到敵人一樣', () => {
    const state = startPlaying();
    debugLoseLife(state);
    expect(state.lives).toBe(options.lives - 1);
    expect(state.phase.kind).toBe('lifeLost');
    runWhile(state, 'lifeLost');
    expect(isInvulnerable(state, currentLevel(state))).toBe(true);
  });

  it('K 只在 playing 時有效', () => {
    const state = createGame(quiz, options, 1);
    startGame(state);
    debugLoseLife(state);
    expect(state.phase.kind).toBe('levelIntro');
    expect(state.lives).toBe(options.lives);
  });

  it('I 切換無敵：碰到敵人不會受傷，再按一次恢復', () => {
    const state = startPlaying(1, DEFAULT_GAME_CONFIG);
    debugToggleInvincible(state);
    hitByEnemy(state);
    expect(state.phase.kind).toBe('playing');
    expect(state.lives).toBe(options.lives);
    debugToggleInvincible(state);
    hitByEnemy(state);
    expect(state.phase.kind).toBe('lifeLost');
  });
});

// ─── M6 計時與暫停 ───────────────────────────────────────────

describe('倒數（§5.2）', () => {
  const countDown: GameOptions = { ...options, timerMode: 'countDown', countDownSeconds: 30 };

  it('顯示剩下的時間；歸零時進入 timeUp，所有題目記為未作答', () => {
    const state = startPlaying(1, NO_ENEMIES, countDown);
    expect(clockMs(state)).toBe(30_000);
    walkInto(state, zoneOf(state, 'q1-b'));
    run(state, 10_000);
    expect(state.phase.kind).toBe('playing');
    expect(clockMs(state)).toBeLessThan(20_000);

    runWhile(state, 'playing', 40_000);
    expect(state.phase.kind).toBe('timeUp');
    expect(clockMs(state)).toBe(0);
    expect(state.elapsedMs).toBe(30_000);
    expect(state.results).toEqual([
      { questionId: 'q1', status: 'unanswered', wrongChoiceIds: ['q1-b'] },
      { questionId: 'q2', status: 'unanswered', wrongChoiceIds: [] },
    ]);
    viewResults(state);
    expect(state.phase.kind).toBe('results');
  });

  it('受傷動畫期間也會時間到', () => {
    const state = startPlaying(1, NO_ENEMIES, countDown);
    run(state, 29_900);
    debugLoseLife(state);
    expect(state.phase.kind).toBe('lifeLost');
    run(state, 200);
    expect(state.phase.kind).toBe('timeUp');
  });

  it('答錯回饋期間也會時間到', () => {
    const state = startPlaying(1, NO_ENEMIES, countDown);
    run(state, 29_300);
    walkInto(state, zoneOf(state, 'q1-b'));
    expect(state.phase.kind).toBe('wrongFeedback');
    // 答錯回饋（0.6 秒）還沒播完就到 30 秒
    expect(30_000 - state.elapsedMs).toBeLessThan(timing.wrongFeedbackMs);
    runWhile(state, 'wrongFeedback');
    expect(state.phase.kind).toBe('timeUp');
    expect(state.elapsedMs).toBe(30_000);
  });

  it('最後一條命被撞之後才時間到：結果仍然是「沒有命了」', () => {
    const state = startPlaying(1, NO_ENEMIES, { ...countDown, lives: 1 });
    run(state, 29_500);
    debugLoseLife(state);
    expect(state.lives).toBe(0);
    runWhile(state, 'lifeLost');
    expect(state.phase.kind).toBe('gameOver');
    expect(state.elapsedMs).toBe(30_000);
  });

  it('正計時與不顯示時間都不會時間到；不顯示時間時 clockMs 是 null，但照樣累計', () => {
    const countUp = startPlaying(1, NO_ENEMIES, { ...options, timerMode: 'countUp', countDownSeconds: 30 });
    run(countUp, 40_000);
    expect(countUp.phase.kind).toBe('playing');
    expect(clockMs(countUp)).toBeCloseTo(40_000, -2);

    const hidden = startPlaying(1, NO_ENEMIES, { ...options, timerMode: 'none', countDownSeconds: 30 });
    run(hidden, 40_000);
    expect(hidden.phase.kind).toBe('playing');
    expect(clockMs(hidden)).toBeNull();
    expect(hidden.elapsedMs).toBeCloseTo(40_000, -2);
  });
});

describe('暫停（§5.1）', () => {
  it('暫停期間不計時、不動，繼續後回到原本的狀態', () => {
    const state = startPlaying(1, DEFAULT_GAME_CONFIG);
    steer(state, 'left');
    run(state, 500);
    pauseGame(state);
    expect(state.phase).toEqual({ kind: 'paused', resumeTo: { kind: 'playing' } });
    expect(steer(state, 'up')).toBeNull();

    const level = currentLevel(state);
    const snapshot = JSON.stringify([state.elapsedMs, level.player, level.enemies]);
    run(state, 5000);
    expect(JSON.stringify([state.elapsedMs, level.player, level.enemies])).toBe(snapshot);

    resumeGame(state);
    expect(state.phase.kind).toBe('playing');
    run(state, 100);
    expect(state.elapsedMs).toBeGreaterThan(500);
  });

  it('預備期間暫停：繼續後剩下的預備時間照舊', () => {
    const state = createGame(quiz, options, 1, NO_ENEMIES);
    startGame(state);
    run(state, 1000);
    pauseGame(state);
    run(state, 5000);
    resumeGame(state);
    expect(state.phase).toMatchObject({ kind: 'levelIntro' });
    const remaining = state.phase.kind === 'levelIntro' ? state.phase.remainingMs : NaN;
    expect(remaining).toBeCloseTo(timing.levelIntroMs - 1000, 0);
    expect(state.elapsedMs).toBe(0);
    run(state, timing.levelIntroMs - 1000 + STEP_MS);
    expect(state.phase.kind).toBe('playing');
  });

  it('只有 PlayPhase 可以暫停', () => {
    const state = createGame(quiz, options, 1, NO_ENEMIES);
    pauseGame(state);
    expect(state.phase.kind).toBe('title');
    expect(isPlayPhase({ kind: 'results' })).toBe(false);
    expect(isPlayPhase({ kind: 'wrongFeedback', zoneId: 'x', remainingMs: 1 })).toBe(true);

    // 結束之後不能暫停
    const ended = startPlaying(1, NO_ENEMIES, { ...options, lives: 1 });
    debugLoseLife(ended);
    runWhile(ended, 'lifeLost');
    expect(ended.phase.kind).toBe('gameOver');
    pauseGame(ended);
    expect(ended.phase.kind).toBe('gameOver');
    viewResults(ended);
    pauseGame(ended);
    expect(ended.phase.kind).toBe('results');

    // 暫停中再暫停一次不會疊兩層
    startGame(state);
    pauseGame(state);
    pauseGame(state);
    expect(state.phase).toMatchObject({ kind: 'paused', resumeTo: { kind: 'levelIntro' } });
  });
});
