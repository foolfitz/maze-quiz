import './style.css';
import { CONFIG } from './config';
import { enemyTarget } from './core/enemies';
import {
  clockMs,
  createGame,
  debugCompleteLevel,
  debugLoseLife,
  debugToggleInvincible,
  difficultyRow,
  isPlayPhase,
  levelMaze,
  pauseGame,
  resumeGame,
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
import type { GameOptions } from './core/quiz';
import {
  addEntry,
  computeScore,
  entriesFor,
  normalizeName,
  optionsKey,
  qualifies,
  type LeaderboardEntry,
} from './core/scoring';
import type { Direction, Phase } from './core/types';
import { attachDpad } from './input/dpad';
import { attachKeyboard, isTextInput } from './input/keyboard';
import { attachPointer } from './input/pointer';
import { preventZoom } from './input/zoomGuard';
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
import { isStorageUsable, loadLeaderboard, saveLeaderboard } from './storage/leaderboard';
import { getLocalStorage } from './storage/localStorage';
import { loadDpadSide, saveDpadSide, type DpadSide } from './storage/preferences';
import { renderDebugPanel, updateDebugFps, updateDebugLine } from './ui/debugPanel';
import { requireElement } from './ui/dom';
import { formatClock } from './ui/format';
import { showLeaderboardScreen, type LeaderboardContent } from './ui/leaderboard';
import { fitPrompt, showPrompt } from './ui/promptBar';
import { showRipple } from './ui/ripple';
import { buildReview, showResults, type RankingPanel } from './ui/results';
import { showCredits, showError, showGameEnd, showLoading, showPaused, showTitle } from './ui/screens';
import { showClock, showLives } from './ui/statusBar';
import { STRINGS } from './ui/strings';
import { parseUrlParams, quizJsonPath, type UrlParams } from './urlParams';

/** 進入點：讀網址參數 → 載入題組 → 顯示標題畫面或錯誤畫面 */
async function start(): Promise<void> {
  const overlay = requireElement('overlay', HTMLDivElement);
  // 平板上兩指誤觸或點兩下會把畫面放大，放大後就看不到題目
  preventZoom(document);

  const parsed = parseUrlParams(new URLSearchParams(window.location.search));
  if (!parsed.ok) {
    showError(overlay, parsed.errors, null);
    return;
  }
  const { params } = parsed;

  // 以目前網頁的網址為基準算出 quiz.json 的絕對網址，圖片路徑再以它為基準
  const quizUrl = new URL(quizJsonPath(params.quizId), document.baseURI);

  showLoading(overlay, 0);
  const result = await loadQuiz(quizUrl, ZOO_THEME.quizFontFamily, (progress) => showLoading(overlay, progress));
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

/**
 * 結算與排行榜用的用時：遊戲時間是一步 1000/60 ms 累加的浮點數，整秒時常常差一點點（例如 59999.99…），
 * 先四捨五入到毫秒，結算畫面和排行榜才會顯示同一個秒數。
 */
function roundedElapsedMs(state: GameState): number {
  return Math.round(state.elapsedMs);
}

/** 排行榜與結算畫面上說明目前設定，例如「難度 3、3 條命、正計時」 */
function settingsText(options: GameOptions): string {
  const T = STRINGS.timerModes;
  const timer =
    options.timerMode === 'countDown'
      ? T.countDown(formatClock(options.countDownSeconds * 1000, 'up'))
      : T[options.timerMode];
  return STRINGS.settingsSummary(options.difficulty, options.lives, timer);
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
  const clock = requireElement('clock', HTMLSpanElement);
  const pauseButton = requireElement('pause-button', HTMLButtonElement);
  const promptText = requireElement('prompt-text', HTMLParagraphElement);
  const promptImage = requireElement('prompt-image', HTMLImageElement);
  const debugRoot = requireElement('debug-panel', HTMLElement);
  const dpad = requireElement('dpad', HTMLDivElement);

  const fixedSeed = params.seed === null ? null : seedFromText(params.seed);
  // 網址參數 difficulty、lives、timer、seconds 蓋過題組的設定（測試用，見 DECISIONS.md）
  const options: GameOptions = { ...data.options, ...params.overrides };
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

  /** 換成一局新的遊戲（還停在標題畫面） */
  const resetGame = (): void => {
    state = newGame();
    view = null;
    shownPhase = null;
    shownLives = null;
  };

  /** 標題畫面按「開始」，或暫停時按「重新開始」：開一局新遊戲，直接從第 1 題開始 */
  const beginGame = (): void => {
    resetGame();
    startGame(state);
    overlay.hidden = true;
    gameRoot.hidden = false;
  };

  const showTitleScreen = (): void => {
    resetGame();
    gameRoot.hidden = true;
    debugRoot.hidden = true;
    showTitle(overlay, quiz, {
      onStart: beginGame,
      onLeaderboard: showTitleLeaderboard,
      onCredits: () => showCredits(overlay, quiz, data.images, showTitleScreen),
      dpadSide,
      onDpadSideChange: (side) => {
        dpadSide = side;
        saveDpadSide(preferences, side);
        applyDpadSide(side);
      },
    });
  };

  /** 標題畫面按「排行榜」：只列出和目前設定相同的紀錄（§11.2） */
  const showTitleLeaderboard = (): void => {
    const storage = getLocalStorage();
    const content: LeaderboardContent = isStorageUsable(storage)
      ? {
          kind: 'entries',
          entries: entriesFor(loadLeaderboard(storage, quiz.id), optionsKey(options)),
          showTime: options.timerMode !== 'none',
        }
      : { kind: 'unavailable' };
    showLeaderboardScreen(overlay, content, settingsText(options), showTitleScreen);
  };

  /**
   * 結算畫面的排行榜區塊：localStorage 不能用時說明原因；進得了前 10 名才請玩家輸入名字。
   * 這一局的成績先記下來，按「登上排行榜」時才用到。
   */
  const rankingPanel = (finished: GameState): RankingPanel => {
    const storage = getLocalStorage();
    if (!isStorageUsable(storage)) return { kind: 'unavailable' };
    const { maxEntries, maxNameLength } = CONFIG.leaderboard;
    const showTime = finished.options.timerMode !== 'none';
    const makeEntry = (name: string): LeaderboardEntry => ({
      name,
      score: computeScore(finished.results),
      total: finished.order.length,
      elapsedMs: roundedElapsedMs(finished),
      livesLeft: finished.lives,
      optionsKey: optionsKey(finished.options),
      playedAt: new Date().toISOString(),
    });
    if (!qualifies(loadLeaderboard(storage, quiz.id), makeEntry(''), maxEntries)) {
      return { kind: 'notRanked', maxEntries };
    }
    return {
      kind: 'qualified',
      maxEntries,
      maxNameLength,
      submit: (rawName) => {
        const name = normalizeName(rawName, maxNameLength);
        if (name === null) return { kind: 'invalidName' };
        const entry = makeEntry(name);
        // 儲存前重新讀一次：同一台裝置可能還開著別的分頁在玩
        const { entries, rank } = addEntry(loadLeaderboard(storage, quiz.id), entry, maxEntries);
        if (rank === null) return { kind: 'notRanked' };
        if (!saveLeaderboard(storage, quiz.id, entries)) return { kind: 'saveFailed' };
        return { kind: 'saved', entries: entriesFor(entries, entry.optionsKey), entry, rank, showTime };
      },
    };
  };

  /** 結算（§11）：成績、排行榜、逐題回顧 */
  const showResultsScreen = (): void => {
    const finished = state;
    const showTime = finished.options.timerMode !== 'none';
    showResults(
      overlay,
      {
        summary: {
          score: computeScore(finished.results),
          total: finished.order.length,
          elapsedText: showTime ? formatClock(roundedElapsedMs(finished)) : null,
          livesLeft: finished.lives,
        },
        ranking: rankingPanel(finished),
        review: finished.options.showAnswersAtEnd ? buildReview(quiz, finished.results, data.images) : null,
        locale: quiz.locale,
      },
      showTitleScreen,
    );
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
    pauseButton.disabled = !isPlayPhase(phase);
    if (phase.kind === 'paused') {
      showPaused(overlay, { onResume: () => resumeGame(state), onRestart: beginGame });
    } else if (phase.kind === 'gameOver' || phase.kind === 'timeUp') {
      showGameEnd(overlay, phase.kind, () => viewResults(state));
    } else if (phase.kind === 'results') {
      showResultsScreen();
    } else if (isPlayPhase(phase)) {
      // 從暫停回來
      overlay.hidden = true;
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
    // 倒數無條件進位：畫面上出現 0:00 時就是時間到
    const ms = clockMs(state);
    const countDown = state.options.timerMode === 'countDown';
    const clockText = ms === null ? null : formatClock(ms, countDown ? 'up' : 'down');
    const clockLabel = countDown ? STRINGS.clockCountDown : STRINGS.clockCountUp;
    showClock(clock, clockText, clockText === null ? '' : clockLabel(clockText));
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

  // Esc 或 P：暫停；已經暫停時再按一次就繼續
  const togglePause = (): void => {
    if (state.phase.kind === 'paused') resumeGame(state);
    else pauseGame(state);
  };
  attachKeyboard(window, { onDirection, onPause: togglePause, isPlaying: () => isPlayPhase(state.phase) });
  pauseButton.setAttribute('aria-label', STRINGS.pause);
  pauseButton.title = STRINGS.pause;
  pauseButton.addEventListener('click', () => pauseGame(state));
  // 切換到別的分頁或 App 時自動暫停（§5.1）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame(state);
  });
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
  // 暫停時畫面停格：閃爍與抖動都停在按下暫停的那一刻
  let frozenAtMs: number | null = null;
  const loop = startLoop(
    {
      update: (dtMs) => stepGame(state, dtMs),
      render: (nowMs) => {
        syncUi();
        const { level } = state;
        if (level === null || view === null || gameRoot.hidden) return;
        const maze = levelMaze(level);
        const { player } = level;
        // 暫停時照暫停前的狀態畫，✓ ✗ 與受傷的樣子才不會消失
        const shownPlayPhase = state.phase.kind === 'paused' ? state.phase.resumeTo : state.phase;
        frozenAtMs = state.phase.kind === 'paused' ? (frozenAtMs ?? nowMs) : null;
        renderer.draw(
          {
            maze,
            labels: view.labels,
            sealed: level.sealed,
            feedback: feedbackFor(shownPlayPhase, level),
            debug: view.debug,
            player: { ...player, condition: playerCondition(shownPlayPhase, level) },
            enemies: level.enemies.map((enemy) => ({
              kind: enemy.kind,
              x: enemy.x,
              y: enemy.y,
              dir: enemy.dir,
              // 除錯模式才畫目標格
              target: params.debug ? enemyTarget(enemy, player, maze, state.config.enemy.ambushLookahead) : null,
            })),
          },
          frozenAtMs ?? nowMs,
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
