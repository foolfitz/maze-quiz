import './style.css';
import { CONFIG } from './config';
import { bfs, type Passable } from './core/grid';
import { DEFAULT_MAZE_CONFIG, generateLevelMaze, isCorridor, isZoneCount, type Maze } from './core/maze';
import { createPlayer, requestDirection, updatePlayer, type Player } from './core/player';
import { seedFromText } from './core/rng';
import type { Direction } from './core/types';
import { attachKeyboard } from './input/keyboard';
import { attachPointer } from './input/pointer';
import { loadQuiz, type LoadedQuiz } from './loader';
import { startLoop } from './loop';
import { Renderer, type DebugLayer, type ZoneLabel } from './render/renderer';
import { ZOO_THEME } from './render/theme';
import { renderDebugPanel, updateDebugFps, updateDebugPlayer } from './ui/debugPanel';
import { requireElement } from './ui/dom';
import { showRipple } from './ui/ripple';
import { showError, showLoading, showTitle, showTitleNotice } from './ui/screens';
import { STRINGS } from './ui/strings';
import { parseUrlParams, quizJsonPath, type UrlParams } from './urlParams';

/** 進入點：讀網址參數 → 載入題組 → 顯示標題畫面或錯誤畫面 */
async function start(): Promise<void> {
  const overlay = requireElement('overlay', HTMLDivElement);

  const parsed = parseUrlParams(new URLSearchParams(window.location.search));
  if (!parsed.ok) {
    showError(overlay, parsed.errors, null);
    return;
  }
  const { params } = parsed;

  // 以目前網頁的網址為基準算出 quiz.json 的絕對網址，圖片路徑再以它為基準
  const quizUrl = new URL(quizJsonPath(params.quizId), document.baseURI);

  showLoading(overlay, 0);
  const result = await loadQuiz(quizUrl, (progress) => showLoading(overlay, progress));
  if (!result.ok) {
    showError(overlay, result.errors, quizUrl.pathname);
    return;
  }

  const data = result.data;
  for (const warning of data.warnings) console.warn(`[題組警告] ${warning}`);

  document.title = `${data.quiz.title} – ${STRINGS.appName}`;
  const notYet = (): void => showTitleNotice(overlay, STRINGS.notImplemented);
  showTitle(overlay, data.quiz, {
    onStart: () => {
      overlay.hidden = true;
      startGame(data, params);
    },
    onLeaderboard: notYet,
    onCredits: notYet,
  });
}

/** 沒有指定 ?seed 時隨機產生；只在這裡用 Math.random，core 一律用注入的種子 */
function randomSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000);
}

/** 一關的靜態資料：迷宮與答案區顯示的內容 */
interface Level {
  readonly maze: Maze;
  readonly labels: readonly ZoneLabel[];
  readonly debug: DebugLayer | null;
}

/**
 * M2：在迷宮裡操作玩家移動（鍵盤、滑鼠、觸控）。
 * 除錯模式下按 N 換到下一關。答案判定與關卡流程在 M3 移到 core/game.ts。
 */
function startGame(data: LoadedQuiz, params: UrlParams): void {
  const { quiz } = data;
  const gameRoot = requireElement('game', HTMLDivElement);
  const stage = requireElement('stage', HTMLDivElement);
  const canvas = requireElement('maze-canvas', HTMLCanvasElement);
  const questionNumber = requireElement('question-number', HTMLSpanElement);
  const debugRoot = requireElement('debug-panel', HTMLElement);

  const seed = params.seed === null ? randomSeed() : seedFromText(params.seed);
  const config = DEFAULT_MAZE_CONFIG;
  const renderer = new Renderer(canvas, ZOO_THEME);

  // prefers-reduced-motion：關閉碰壁抖動（漣漪由 CSS 關閉）
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  renderer.reducedMotion = reducedMotion.matches;
  reducedMotion.addEventListener('change', () => {
    renderer.reducedMotion = reducedMotion.matches;
  });

  let levelIndex = 0;
  let level: Level | null = null;
  let player: Player | null = null;

  // M2 還沒有答案判定，玩家可以走進園區；M3 會加上判定與封門
  const passable: Passable = (tile) => level?.maze.grid.isFloor(tile) ?? false;

  const showLevel = (index: number): void => {
    const question = quiz.questions[index];
    if (question === undefined) return;
    const zoneCount = question.choices.length;
    // 題組驗證已經保證選項數是 2–6，這裡再用型別守衛讓 TypeScript 也知道
    if (!isZoneCount(zoneCount)) throw new Error(`第 ${index + 1} 題的選項數 ${zoneCount} 不在 2–6 之間`);

    levelIndex = index;
    const result = generateLevelMaze(seed, index, zoneCount, config);
    const { maze } = result;
    const choices = maze.zones.map((zone) => question.choices[zone.choiceIndex]);
    const distances = params.debug ? bfs(maze.grid, maze.start, (tile) => isCorridor(maze, tile)) : null;

    level = {
      maze,
      labels: choices.map((choice) => ({ text: choice?.text ?? '' })),
      debug:
        distances === null ? null : { distances, correct: choices.map((choice) => choice?.correct ?? false) },
    };
    player = createPlayer(maze.start);
    questionNumber.textContent = STRINGS.questionNumber(index + 1, quiz.questions.length);

    if (distances !== null) {
      renderDebugPanel(debugRoot, {
        baseSeed: seed,
        levelIndex: index,
        result,
        zoneDistances: maze.zones.map((zone, i) => ({
          label: choices[i]?.text ?? String(i),
          distance: distances.get(zone.outside),
        })),
        warnings: data.warnings,
      });
    }
  };

  const steer = (direction: Direction): void => {
    if (player === null) return;
    if (requestDirection(player, direction, passable) === 'bumped') {
      renderer.bump(direction, performance.now());
    }
  };

  // ─── 版面：視窗大小、方向或 devicePixelRatio 改變時重新計算（§12.2）───

  const relayout = (): void => {
    const style = getComputedStyle(stage);
    const width = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    renderer.layout(width, height, config.width, config.height);
  };
  new ResizeObserver(relayout).observe(stage);

  // 把視窗拖到解析度不同的螢幕時，CSS 尺寸不變但 devicePixelRatio 會變
  const watchPixelRatio = (): void => {
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener(
      'change',
      () => {
        relayout();
        watchPixelRatio();
      },
      { once: true },
    );
  };
  watchPixelRatio();

  // ─── 輸入 ───────────────────────────────────────────────────

  attachKeyboard(window, { onDirection: steer });
  attachPointer(
    stage,
    {
      screenToTile: (x, y) => renderer.screenToTile(x, y),
      playerPosition: () => player,
      deadZoneTiles: CONFIG.player.pointerDeadZoneTiles,
    },
    { onDirection: steer, onPress: (x, y) => showRipple(stage, x, y) },
  );

  if (params.debug) {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyN' && !event.repeat) showLevel((levelIndex + 1) % quiz.questions.length);
    });
  }

  // ─── 遊戲迴圈（§5.3）───────────────────────────────────────

  let shownFps = -1;
  const loop = startLoop(
    {
      update: (dtMs) => {
        if (player !== null) updatePlayer(player, dtMs, passable);
      },
      render: (nowMs) => {
        if (level === null || player === null) return;
        renderer.draw({ ...level, player }, nowMs);
        if (params.debug) {
          if (loop.fps() !== shownFps) {
            shownFps = loop.fps();
            updateDebugFps(debugRoot, shownFps);
          }
          const { x, y, dir, pendingDir } = player;
          updateDebugPlayer(debugRoot, STRINGS.debug.player(x.toFixed(2), y.toFixed(2), dir ?? '—', pendingDir ?? '—'));
        }
      },
    },
    CONFIG.loop.stepHz,
    CONFIG.loop.maxFrameMs,
  );

  gameRoot.hidden = false;
  showLevel(0);
}

void start();
