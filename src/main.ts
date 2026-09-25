import './style.css';
import { loadQuiz } from './loader';
import { requireElement } from './ui/dom';
import { showError, showLoading, showTitle, showTitleNotice } from './ui/screens';
import { STRINGS } from './ui/strings';
import { parseUrlParams, quizJsonPath } from './urlParams';

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

  const { quiz, warnings } = result.data;
  for (const warning of warnings) console.warn(`[題組警告] ${warning}`);

  document.title = `${quiz.title} – ${STRINGS.appName}`;
  const notYet = (): void => showTitleNotice(overlay, STRINGS.notImplemented);
  showTitle(overlay, quiz, { onStart: notYet, onLeaderboard: notYet, onCredits: notYet });
}

void start();
