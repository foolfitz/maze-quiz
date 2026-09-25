import type { Choice, QuizFile } from '../core/quiz';
import type { LeaderboardEntry } from '../core/scoring';
import { assertNever, type QuestionResult, type QuestionStatus } from '../core/types';
import { button, el } from './dom';
import { leaderboardTable } from './leaderboard';
import { STRINGS } from './strings';

/** 結算畫面上方的摘要（§11.1） */
export interface ResultsSummary {
  readonly score: number;
  readonly total: number;
  /** 不計時模式是 null，不顯示用時 */
  readonly elapsedText: string | null;
  readonly livesLeft: number;
}

/** 回顧裡的一個選項：圖片（沒有或載入失敗時是 null）與文字 */
export interface ChoiceView {
  readonly text: string;
  readonly image: HTMLImageElement | null;
}

/** 逐題回顧的一題，依出題順序排列 */
export interface ReviewItem {
  readonly prompt: string;
  readonly promptImage: HTMLImageElement | null;
  readonly status: QuestionStatus;
  readonly correct: readonly ChoiceView[];
  readonly wrong: readonly ChoiceView[]; // 依走進去的先後順序
}

/** 由逐題結果組出回顧資料；圖片載入失敗時查不到，改用純文字（§4.3） */
export function buildReview(
  quiz: QuizFile,
  results: readonly QuestionResult[],
  images: ReadonlyMap<string, HTMLImageElement>,
): ReviewItem[] {
  const imageOf = (key: string | undefined): HTMLImageElement | null =>
    key === undefined ? null : (images.get(key) ?? null);
  return results.flatMap((result) => {
    const question = quiz.questions.find((q) => q.id === result.questionId);
    if (question === undefined) return [];
    const view = (choice: Choice): ChoiceView => ({ text: choice.text, image: imageOf(choice.image) });
    const wrong = result.wrongChoiceIds.flatMap((id) => {
      const choice = question.choices.find((c) => c.id === id);
      return choice === undefined ? [] : [view(choice)];
    });
    return [
      {
        prompt: question.prompt,
        promptImage: imageOf(question.image),
        status: result.status,
        correct: question.choices.filter((choice) => choice.correct).map(view),
        wrong,
      },
    ];
  });
}

/** 按下「登上排行榜」之後的結果 */
export type SubmitOutcome =
  | {
      readonly kind: 'saved';
      readonly entries: readonly LeaderboardEntry[]; // 同設定的排行榜，已排序
      readonly entry: LeaderboardEntry;
      readonly rank: number;
      readonly showTime: boolean;
    }
  | { readonly kind: 'invalidName' }
  | { readonly kind: 'notRanked' } // 儲存前重新讀取時，名次已經被別的分頁擠掉
  | { readonly kind: 'saveFailed' };

/** 結算畫面的排行榜區塊 */
export type RankingPanel =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'notRanked'; readonly maxEntries: number }
  | {
      readonly kind: 'qualified';
      readonly maxEntries: number;
      readonly maxNameLength: number;
      readonly submit: (rawName: string) => SubmitOutcome;
    };

export interface ResultsView {
  readonly summary: ResultsSummary;
  readonly ranking: RankingPanel;
  /** showAnswersAtEnd 為 false 時是 null，只顯示分數（§11.1） */
  readonly review: readonly ReviewItem[] | null;
  readonly locale: string; // 題目內容的語言
}

/** 結算畫面（§11）：成績、排行榜、「再玩一次」，下面是逐題回顧 */
export function showResults(root: HTMLElement, view: ResultsView, onPlayAgain: () => void): void {
  const { summary } = view;
  const again = button(STRINGS.playAgain, onPlayAgain, 'primary');
  const meta = [
    ...(summary.elapsedText === null ? [] : [STRINGS.elapsed(summary.elapsedText)]),
    STRINGS.livesLeft(summary.livesLeft),
  ].join('　');

  const children: Node[] = [
    el('h1', { text: STRINGS.resultsTitle }),
    el('p', { className: 'score', text: STRINGS.firstTryScore(summary.score, summary.total) }),
    el('p', { className: 'muted', text: meta }),
    rankingSection(view.ranking),
    el('div', { className: 'actions', children: [again] }),
  ];
  if (view.review !== null) children.push(reviewSection(view.review, view.locale));

  root.replaceChildren(el('div', { className: 'card card-wide', children }));
  root.classList.add('backdrop');
  root.hidden = false;
  root.scrollTop = 0;
  again.focus({ preventScroll: true });
}

// ─── 排行榜區塊 ──────────────────────────────────────────────

function rankingSection(panel: RankingPanel): HTMLElement {
  const section = el('section', { className: 'ranking' });
  switch (panel.kind) {
    case 'unavailable':
      section.append(el('p', { className: 'muted', text: STRINGS.leaderboardUnavailable }));
      break;
    case 'notRanked':
      section.append(el('p', { text: STRINGS.leaderboardNotRanked(panel.maxEntries) }));
      break;
    case 'qualified':
      section.append(nameForm(section, panel));
      break;
    default:
      assertNever(panel);
  }
  return section;
}

/** 輸入名字登上排行榜；成功後把表單換成排行榜 */
function nameForm(section: HTMLElement, panel: Extract<RankingPanel, { kind: 'qualified' }>): HTMLFormElement {
  const input = el('input', {
    className: 'name-input',
    attrs: {
      type: 'text',
      name: 'player-name',
      autocomplete: 'off',
      enterkeyhint: 'done',
      // maxlength 以 UTF-16 計算，emoji 算兩個；真正的長度限制在 normalizeName 用 code point 檢查
      maxlength: String(panel.maxNameLength * 2),
      'aria-describedby': 'name-hint',
    },
  });
  const message = el('p', { className: 'form-message', attrs: { 'aria-live': 'polite' } });
  const form = el('form', {
    className: 'name-form',
    children: [
      el('p', { text: STRINGS.leaderboardQualified(panel.maxEntries) }),
      el('div', {
        className: 'name-row',
        children: [
          el('label', { children: [el('span', { text: STRINGS.nameLabel }), input] }),
          el('button', { className: 'btn btn-primary', text: STRINGS.saveName, attrs: { type: 'submit' } }),
        ],
      }),
      el('p', { className: 'muted', text: STRINGS.nameHint(panel.maxNameLength), attrs: { id: 'name-hint' } }),
      message,
    ],
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const outcome = panel.submit(input.value);
    switch (outcome.kind) {
      case 'invalidName':
        message.textContent = STRINGS.nameInvalid(panel.maxNameLength);
        input.focus();
        return;
      case 'saveFailed':
        message.textContent = STRINGS.leaderboardSaveFailed;
        return;
      case 'notRanked': {
        const note = el('p', { text: STRINGS.leaderboardNotRanked(panel.maxEntries), attrs: { tabindex: '-1' } });
        section.replaceChildren(note);
        // 表單被換掉了，焦點移到新的訊息上，鍵盤與螢幕閱讀器的使用者才不會迷路
        note.focus();
        return;
      }
      case 'saved': {
        const note = el('p', {
          className: 'ranking-saved',
          text: STRINGS.leaderboardSaved(outcome.rank),
          attrs: { tabindex: '-1' },
        });
        section.replaceChildren(
          note,
          leaderboardTable(outcome.entries, { showTime: outcome.showTime, highlight: outcome.entry }),
        );
        note.focus();
        return;
      }
      default:
        assertNever(outcome);
    }
  });
  return form;
}

// ─── 逐題回顧（§11.1）───────────────────────────────────────

function reviewSection(items: readonly ReviewItem[], locale: string): HTMLElement {
  return el('section', {
    className: 'review',
    children: [
      el('h2', { text: STRINGS.reviewTitle }),
      // list-style: none 時 Safari 的 VoiceOver 不把它當成清單，所以明確加上 role="list"
      el('ol', {
        className: 'review-list',
        attrs: { role: 'list' },
        children: items.map((item, i) => reviewItem(item, i + 1, locale)),
      }),
    ],
  });
}

function reviewItem(item: ReviewItem, number: number, locale: string): HTMLLIElement {
  const prompt = el('p', { className: 'review-prompt quiz-text', text: item.prompt, attrs: { lang: locale } });
  const children: Node[] = [
    statusLine(item, number),
    el('div', {
      className: 'review-question',
      children: [...(item.promptImage === null ? [] : [thumbnail(item.promptImage)]), prompt],
    }),
    choiceGroup(STRINGS.reviewCorrect, item.correct, 'correct', locale),
  ];
  if (item.wrong.length > 0) children.push(choiceGroup(STRINGS.reviewWrong, item.wrong, 'wrong', locale));
  return el('li', { className: `review-item review-${item.status}`, children });
}

/** 這一題的結果：符號加文字，不只靠顏色（§12.5） */
function statusLine(item: ReviewItem, number: number): HTMLElement {
  const S = STRINGS.reviewStatus;
  let symbol: string;
  let text: string;
  switch (item.status) {
    case 'firstTry':
      [symbol, text] = ['✓', S.firstTry];
      break;
    case 'retry':
      [symbol, text] = ['✓', S.retry(item.wrong.length)];
      break;
    case 'unanswered':
      [symbol, text] = ['–', S.unanswered];
      break;
    default:
      return assertNever(item.status);
  }
  return el('p', {
    className: 'review-status',
    children: [
      el('span', { className: 'review-number', text: STRINGS.reviewNumber(number) }),
      el('span', { className: 'review-symbol', text: symbol, attrs: { 'aria-hidden': 'true' } }),
      el('span', { text }),
    ],
  });
}

function choiceGroup(
  label: string,
  choices: readonly ChoiceView[],
  kind: 'correct' | 'wrong',
  locale: string,
): HTMLElement {
  return el('div', {
    className: `review-choices review-choices-${kind}`,
    children: [
      el('span', { className: 'review-label', text: label }),
      ...choices.map((choice) =>
        el('span', {
          className: 'choice-chip',
          children: [
            el('span', {
              className: 'chip-mark',
              text: kind === 'correct' ? '✓' : '✗',
              attrs: { 'aria-hidden': 'true' },
            }),
            ...(choice.image === null ? [] : [thumbnail(choice.image)]),
            el('span', { className: 'quiz-text', text: choice.text, attrs: { lang: locale } }),
          ],
        }),
      ),
    ],
  });
}

function thumbnail(image: HTMLImageElement): HTMLImageElement {
  return el('img', { className: 'review-thumb', attrs: { src: image.src, alt: image.alt } });
}
