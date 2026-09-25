import type { ImageAsset, QuizFile } from '../core/quiz';
import { button, el } from './dom';
import { STRINGS } from './strings';

/** 覆蓋層上的各個畫面。每次呼叫都會替換掉 root 裡原本的內容。 */

function showCard(root: HTMLElement, children: readonly Node[], className = ''): void {
  const card = el('div', { className: `card ${className}`.trim(), children });
  root.replaceChildren(card);
  root.classList.remove('backdrop');
  root.hidden = false;
}

export function showLoading(root: HTMLElement, progress: number): void {
  const percent = Math.round(Math.min(Math.max(progress, 0), 1) * 100);
  const bar = el('progress', { attrs: { max: '100', 'aria-label': STRINGS.loading } });
  bar.value = percent;
  showCard(root, [
    el('p', { className: 'loading-text', text: STRINGS.loadingPercent(percent) }),
    bar,
  ]);
}

export function showError(
  root: HTMLElement,
  messages: readonly string[],
  fileUrl: string | null,
): void {
  const list = el('ul', {
    className: 'error-list',
    children: messages.map((message) => el('li', { text: message })),
  });
  showCard(
    root,
    [
      el('h1', { text: STRINGS.errorTitle }),
      ...(fileUrl === null ? [] : [el('p', { className: 'muted', text: STRINGS.errorFile(fileUrl) })]),
      list,
      el('p', { text: STRINGS.errorHint }),
    ],
    'card-error',
  );
}

export interface TitleHandlers {
  readonly onStart: () => void;
  readonly onLeaderboard: () => void;
  readonly onCredits: () => void;
}

export function showTitle(root: HTMLElement, quiz: QuizFile, handlers: TitleHandlers): void {
  const startButton = button(STRINGS.start, handlers.onStart, 'primary');
  showCard(root, [
    el('h1', { className: 'quiz-text title', text: quiz.title, attrs: { lang: quiz.locale } }),
    el('p', { className: 'muted', text: STRINGS.questionCount(quiz.questions.length) }),
    el('div', {
      className: 'actions',
      children: [
        startButton,
        button(STRINGS.leaderboard, handlers.onLeaderboard),
        button(STRINGS.credits, handlers.onCredits),
      ],
    }),
    // 暫時的提示訊息放這裡，螢幕閱讀器會唸出變化
    el('p', { className: 'notice', attrs: { id: 'title-notice', 'aria-live': 'polite' } }),
  ]);
  startButton.focus();
}

/** 在標題畫面下方顯示一行提示 */
export function showTitleNotice(root: HTMLElement, message: string): void {
  const notice = root.querySelector('#title-notice');
  if (notice !== null) notice.textContent = message;
}

/** 簡易結算（M3）：一次答對的題數與「再玩一次」。逐題回顧在 M6。 */
export function showResults(root: HTMLElement, score: number, total: number, onPlayAgain: () => void): void {
  const again = button(STRINGS.playAgain, onPlayAgain, 'primary');
  showCard(root, [
    el('h1', { text: STRINGS.resultsTitle }),
    el('p', { className: 'score', text: STRINGS.firstTryScore(score, total) }),
    el('div', { className: 'actions', children: [again] }),
  ]);
  root.classList.add('backdrop');
  again.focus();
}

/**
 * 圖片來源（§13.4）：從 quiz.json 的 credit 自動產生。
 * CC BY 與 CC BY-SA 都要求標示作者與授權，所以每張圖都列出作品名稱、作者與授權連結。
 */
export function showCredits(
  root: HTMLElement,
  quiz: QuizFile,
  images: ReadonlyMap<string, HTMLImageElement>,
  onBack: () => void,
): void {
  const back = button(STRINGS.back, onBack, 'primary');
  const items = Object.entries(quiz.images).map(([key, asset]) => creditItem(asset, images.get(key) ?? null));
  showCard(
    root,
    [
      el('h1', { text: STRINGS.credits }),
      el('p', { className: 'muted', text: STRINGS.creditsIntro }),
      el('ul', { className: 'credit-list', children: items }),
      el('div', { className: 'actions', children: [back] }),
    ],
    'card-credits',
  );
  // 清單很長：焦點放在「返回」，但畫面停在最上面，不要被焦點帶到底部
  back.focus({ preventScroll: true });
  root.scrollTop = 0;
}

function creditItem(asset: ImageAsset, image: HTMLImageElement | null): HTMLLIElement {
  const thumb =
    image === null
      ? el('div', { className: 'credit-thumb' })
      : el('img', { className: 'credit-thumb', attrs: { src: image.src, alt: asset.alt } });
  const { credit } = asset;
  const details =
    credit === null
      ? [el('p', { className: 'muted', text: STRINGS.creditMissing })]
      : [
          el('a', { className: 'credit-title', text: credit.title, attrs: externalLink(credit.sourceUrl) }),
          el('p', { text: STRINGS.creditAuthor(credit.author) }),
          el('p', {
            children: [
              document.createTextNode(STRINGS.creditLicense),
              el('a', { text: credit.license, attrs: externalLink(credit.licenseUrl) }),
            ],
          }),
        ];
  return el('li', { className: 'credit-item', children: [thumb, el('div', { children: details })] });
}

/** 在新分頁開啟外部連結 */
function externalLink(href: string): Record<string, string> {
  return { href, target: '_blank', rel: 'noopener noreferrer' };
}
