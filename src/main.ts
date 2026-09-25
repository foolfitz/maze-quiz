import './style.css';
import { CONFIG } from './config';
import { enemyTarget } from './core/enemies';
import {
  createGame,
  debugCompleteLevel,
  debugLoseLife,
  debugToggleInvincible,
  difficultyRow,
  levelMaze,
  startGame,
  steer,
  stepGame,
  viewResults,
  type GameState,
  type Level,
} from './core/game';
import { bfs } from './core/grid';
import { isCorridor } from './core/maze';
import { seedFromText } from './core/rng';
import { computeScore } from './core/scoring';
import type { Direction, Phase } from './core/types';
import { attachDpad } from './input/dpad';
import { attachKeyboard, isTextInput } from './input/keyboard';
import { attachPointer } from './input/pointer';
import { preventPinchZoom } from './input/zoomGuard';
import { loadQuiz, type LoadedQuiz } from './loader';
import { startLoop } from './loop';
import {
  Renderer,
  type DebugLayer,
  type PlayerCondition,
  type ZoneFeedback,
  type ZoneLabel,
} from './render/renderer';
import { ZOO_THEME } from './render/theme';
import { getLocalStorage, loadDpadSide, saveDpadSide, type DpadSide } from './storage/preferences';
import { renderDebugPanel, updateDebugFps, updateDebugLine } from './ui/debugPanel';
import { requireElement } from './ui/dom';
import { fitPrompt, showPrompt } from './ui/promptBar';
import { showRipple } from './ui/ripple';
import {
  showCredits,
  showError,
  showGameOver,
  showLoading,
  showResults,
  showTitle,
  showTitleNotice,
} from './ui/screens';
import { showLives } from './ui/statusBar';
import { STRINGS } from './ui/strings';
import { parseUrlParams, quizJsonPath, type UrlParams } from './urlParams';

/** 進入點：讀網址參數 → 載入題組 → 顯示標題畫面或錯誤畫面 */
async function start(): Promise<void> {
  const overlay = requireElement('overlay', HTMLDivElement);
  // 平板上兩指誤觸會把畫面放大，放大後就看不到題目
  preventPinchZoom(document);

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
  runApp(data, params, overlay);
}

/** 沒有指定 ?seed 時隨機產生；只在這裡用 Math.random，core 一律用注入的種子 */
function randomSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000);
}

/** 一關裡不會變的顯示資料，每關算一次 */
interface LevelView {
  readonly level: Level;
  readonly labels: readonly ZoneLabel[];
  readonly debug: DebugLayer | null;
}

/** 走進園區時要顯示的 ✓ ✗ */
function feedbackFor(phase: Phase, level: Level): ZoneFeedback | null {
  if (level.enteredZone === null) return null;
  if (phase.kind === 'wrongFeedback') return { zoneIndex: level.enteredZone, kind: 'wrong' };
  if (phase.kind === 'levelComplete') return { zoneIndex: level.enteredZone, kind: 'correct' };
  return null;
}

/** 玩家要畫成什麼樣子：受傷動畫、重生後的無敵，或平常。無敵只在 playing 倒數，其他時候全場靜止、不閃爍。 */
function playerCondition(phase: Phase, level: Level): PlayerCondition {
  if (phase.kind === 'lifeLost') return 'hurt';
  return phase.kind === 'playing' && level.invulnerableMs > 0 ? 'invulnerable' : 'normal';
}

/** 組裝畫面、輸入與遊戲迴圈。遊戲規則都在 core/game.ts，這裡只負責把狀態顯示出來。 */
function runApp(data: LoadedQuiz, params: UrlParams, overlay: HTMLDivElement): void {
  const { quiz } = data;
  const gameRoot = requireElement('game', HTMLDivElement);
  const stage = requireElement('stage', HTMLDivElement);
  const canvas = requireElement('maze-canvas', HTMLCanvasElement);
  const stageMessage = requireElement('stage-message', HTMLDivElement);
  const questionNumber = requireElement('question-number', HTMLSpanElement);
  const livesDisplay = requireElement('lives', HTMLSpanElement);
  const promptText = requireElement('prompt-text', HTMLParagraphElement);
  const promptImage = requireElement('prompt-image', HTMLImageElement);
  const debugRoot = requireElement('debug-panel', HTMLElement);
  const dpad = requireElement('dpad', HTMLDivElement);

  const fixedSeed = params.seed === null ? null : seedFromText(params.seed);
  // 網址參數 difficulty 蓋過題組的設定（測試用，見 DECISIONS.md）
  const options = params.difficulty === null ? data.options : { ...data.options, difficulty: params.difficulty };
  const mazeConfig = CONFIG.maze;
  const renderer = new Renderer(canvas, ZOO_THEME);

  // prefers-reduced-motion：關閉碰壁抖動（漣漪在 ui/ripple.ts 處理）
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  renderer.reducedMotion = reducedMotion.matches;
  reducedMotion.addEventListener('change', () => {
    renderer.reducedMotion = reducedMotion.matches;
  });

  // 觸控方向鍵：有觸控螢幕的裝置預設放右邊，否則不顯示；使用者在標題畫面改過就記在這台裝置上
  const preferences = getLocalStorage();
  const hasTouch = window.matchMedia('(any-pointer: coarse)').matches;
  let dpadSide = loadDpadSide(preferences, hasTouch ? 'right' : 'off');
  const applyDpadSide = (side: DpadSide): void => {
    gameRoot.dataset.dpad = side;
    dpad.hidden = side === 'off';
  };
  applyDpadSide(dpadSide);

  // 每一局用新的種子；網址指定了 ?seed 時每局都一樣，方便重現
  const newGame = (): GameState => createGame(quiz, options, fixedSeed ?? randomSeed());
  let state = newGame();
  let view: LevelView | null = null;
  let shownPhase: Phase['kind'] | null = null;
  let shownLives: number | null = null;

  // ─── 畫面切換 ───────────────────────────────────────────────

  const showTitleScreen = (): void => {
    state = newGame();
    view = null;
    shownPhase = null;
    shownLives = null;
    gameRoot.hidden = true;
    debugRoot.hidden = true;
    showTitle(overlay, quiz, {
      onStart: () => {
        startGame(state);
        overlay.hidden = true;
        gameRoot.hidden = false;
      },
      onLeaderboard: () => showTitleNotice(overlay, STRINGS.notImplemented),
      onCredits: () => showCredits(overlay, quiz, data.images, showTitleScreen),
      dpadSide,
      onDpadSideChange: (side) => {
        dpadSide = side;
        saveDpadSide(preferences, side);
        applyDpadSide(side);
      },
    });
  };

  /** 換關時更新題號、題目列與除錯資訊 */
  const showLevel = (level: Level): LevelView => {
    const maze = levelMaze(level);
    const choices = maze.zones.map((zone) => level.question.choices[zone.choiceIndex]);
    const distances = params.debug ? bfs(maze.grid, maze.start, (tile) => isCorridor(maze, tile)) : null;

    questionNumber.textContent = STRINGS.questionNumber(state.levelIndex + 1, state.order.length);
    const questionImage = level.question.image;
    showPrompt(
      promptText,
      promptImage,
      level.question.prompt,
      quiz.locale,
      questionImage === undefined ? null : (data.images.get(questionImage) ?? null),
    );

    if (distances !== null) {
      renderDebugPanel(debugRoot, {
        baseSeed: state.seed,
        levelIndex: state.levelIndex,
        result: level.mazeResult,
        zoneDistances: maze.zones.map((zone, i) => ({
          label: choices[i]?.text ?? String(i),
          distance: distances.get(zone.outside),
        })),
        warnings: data.warnings,
        difficulty: { level: state.options.difficulty, ...difficultyRow(state) },
      });
    }

    return {
      level,
      labels: choices.map((choice) => ({
        text: choice?.text ?? '',
        // 圖片載入失敗時查不到，改用純文字顯示（§4.3）
        image: choice?.image === undefined ? null : (data.images.get(choice.image) ?? null),
      })),
      debug:
        distances === null ? null : { distances, correct: choices.map((choice) => choice?.correct ?? false) },
    };
  };

  /** 狀態改變時更新畫面上的 DOM 部分 */
  const onPhaseChanged = (phase: Phase): void => {
    stageMessage.hidden = phase.kind !== 'levelIntro';
    if (phase.kind === 'levelIntro') stageMessage.textContent = STRINGS.ready;
    if (phase.kind === 'gameOver') showGameOver(overlay, () => viewResults(state));
    if (phase.kind === 'results') {
      showResults(overlay, computeScore(state.results), state.order.length, showTitleScreen);
    }
  };

  /** 每幀檢查狀態，有變才動 DOM */
  const syncUi = (): void => {
    const { level } = state;
    if (level !== null && view?.level !== level) view = showLevel(level);
    if (state.lives !== shownLives) {
      shownLives = state.lives;
      showLives(livesDisplay, state.lives, state.options.lives);
    }
    if (state.phase.kind !== shownPhase) {
      shownPhase = state.phase.kind;
      onPhaseChanged(state.phase);
    }
  };

  // ─── 版面：視窗大小、方向或 devicePixelRatio 改變時重新計算（§12.2）───

  const relayout = (): void => {
    const style = getComputedStyle(stage);
    const width = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    renderer.layout(width, height, mazeConfig.width, mazeConfig.height);
    fitPrompt(promptText);
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

  const onDirection = (direction: Direction): void => {
    if (steer(state, direction) === 'bumped') renderer.bump(direction, performance.now());
  };

  attachKeyboard(window, { onDirection });
  attachDpad(dpad, { onDirection });
  attachPointer(
    stage,
    {
      screenToTile: (x, y) => renderer.screenToTile(x, y),
      playerPosition: () => (state.phase.kind === 'playing' ? state.level?.player ?? null : null),
      deadZoneTiles: CONFIG.player.pointerDeadZoneTiles,
    },
    { onDirection, onPress: (x, y) => showRipple(stage, x, y) },
  );

  // 除錯快捷鍵（§12.6）：N 直接過關、K 扣一條命、I 切換無敵
  if (params.debug) {
    window.addEventListener('keydown', (event) => {
      // 和 keyboard.ts 一樣：保留瀏覽器快捷鍵，正在輸入文字時也不攔截
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || isTextInput(event.target)) return;
      if (event.code === 'KeyN') debugCompleteLevel(state);
      else if (event.code === 'KeyK') debugLoseLife(state);
      else if (event.code === 'KeyI') debugToggleInvincible(state);
    });
  }

  // ─── 遊戲迴圈（§5.3）───────────────────────────────────────

  let shownFps = -1;
  const loop = startLoop(
    {
      update: (dtMs) => stepGame(state, dtMs),
      render: (nowMs) => {
        syncUi();
        const { level } = state;
        if (level === null || view === null || gameRoot.hidden) return;
        const maze = levelMaze(level);
        const { player } = level;
        renderer.draw(
          {
            maze,
            labels: view.labels,
            sealed: level.sealed,
            feedback: feedbackFor(state.phase, level),
            debug: view.debug,
            player: { ...player, condition: playerCondition(state.phase, level) },
            enemies: level.enemies.map((enemy) => ({
              kind: enemy.kind,
              x: enemy.x,
              y: enemy.y,
              dir: enemy.dir,
              // 除錯模式才畫目標格
              target: params.debug ? enemyTarget(enemy, player, maze, state.config.enemy.ambushLookahead) : null,
            })),
          },
          nowMs,
        );

        if (params.debug) {
          if (loop.fps() !== shownFps) {
            shownFps = loop.fps();
            updateDebugFps(debugRoot, shownFps);
          }
          const { x, y, dir, pendingDir } = player;
          updateDebugLine(
            debugRoot,
            'debug-player',
            STRINGS.debug.player(x.toFixed(2), y.toFixed(2), dir ?? '—', pendingDir ?? '—'),
          );
          updateDebugLine(debugRoot, 'debug-invincible', STRINGS.debug.invincible(state.debugInvincible));
        }
      },
    },
    CONFIG.loop.stepHz,
    CONFIG.loop.maxFrameMs,
  );

  showTitleScreen();
}

void start();
