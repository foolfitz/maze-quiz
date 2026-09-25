import type { QuizFile } from '../core/quiz';
import { button, el } from './dom';
import { STRINGS } from './strings';

/** 覆蓋層上的各個畫面。每次呼叫都會替換掉 root 裡原本的內容。 */

function showCard(root: HTMLElement, children: readonly Node[], className = ''): void {
  const card = el('div', { className: `card ${className}`.trim(), children });
  root.replaceChildren(card);
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
