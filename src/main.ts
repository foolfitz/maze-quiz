import './style.css';
import { bfs } from './core/grid';
import { DEFAULT_MAZE_CONFIG, generateLevelMaze, isCorridor, isZoneCount } from './core/maze';
import { seedFromText } from './core/rng';
import { loadQuiz, type LoadedQuiz } from './loader';
import { Renderer, type Scene } from './render/renderer';
import { ZOO_THEME } from './render/theme';
import { renderDebugPanel } from './ui/debugPanel';
import { requireElement } from './ui/dom';
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

/**
 * M1：畫出每一關的靜態迷宮與答案區。
 * 除錯模式下按 N 換到下一關。遊戲狀態機在 M3 移到 core/game.ts。
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
  let scene: Scene | null = null;
  let levelIndex = 0;

  const redraw = (): void => {
    if (scene !== null) renderer.draw(scene);
  };

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

    scene = {
      maze,
      labels: choices.map((choice) => ({ text: choice?.text ?? '' })),
      debug:
        distances === null ? null : { distances, correct: choices.map((choice) => choice?.correct ?? false) },
    };
    questionNumber.textContent = STRINGS.questionNumber(index + 1, quiz.questions.length);
    redraw();

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

  // 視窗大小或方向改變時重新計算格子大小（§12.2）
  new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect;
    if (box === undefined) return;
    renderer.layout(box.width, box.height, config.width, config.height);
    redraw();
  }).observe(stage);

  if (params.debug) {
    window.addEventListener('keydown', (event) => {
      if (event.key === 'n' || event.key === 'N') {
        showLevel((levelIndex + 1) % quiz.questions.length);
      }
    });
  }

  gameRoot.hidden = false;
  showLevel(0);
}

void start();
