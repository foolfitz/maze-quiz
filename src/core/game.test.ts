import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_OPTIONS } from '../config';
import {
  createGame,
  DEFAULT_GAME_CONFIG,
  debugCompleteLevel,
  levelMaze,
  startGame,
  steer,
  stepGame,
  type GameState,
  type Level,
} from './game';
import { opposite } from './grid';
import type { GameOptions, QuizFile } from './quiz';

const STEP_MS = 1000 / 60;
const { timing } = DEFAULT_GAME_CONFIG;

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

function currentLevel(state: GameState): Level {
  if (state.level === null) throw new Error('目前沒有關卡');
  return state.level;
}

/** 開始遊戲並跳過「預備」 */
function startPlaying(seed = 1): GameState {
  const state = createGame(quiz, options, seed);
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
    const state = createGame(quiz, options, 1);
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
