import { DIFFICULTIES, type Difficulty, type ImageAsset, type QuizFile, type QuizLanguage } from '../core/quiz';
import { DPAD_SIDES, type DpadSide } from '../storage/preferences';
import { button, el } from './dom';
import { formatBuildTime } from './format';
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
  /** 題組有的語言；只有一種時不顯示語言選項 */
  readonly languages: readonly QuizLanguage[];
  readonly language: string;
  /** 換語言：回傳換好語言的題組，標題畫面上的題組名稱跟著換 */
  readonly onLanguageChange: (locale: string) => QuizFile;
  readonly difficulty: Difficulty;
  readonly onDifficultyChange: (difficulty: Difficulty) => void;
  /** 目前的方向鍵位置與改變時的處理 */
  readonly dpadSide: DpadSide;
  readonly onDpadSideChange: (side: DpadSide) => void;
}

export function showTitle(root: HTMLElement, quiz: QuizFile, handlers: TitleHandlers): void {
  const startButton = button(STRINGS.start, handlers.onStart, 'primary');
  const title = el('h1', { className: 'quiz-text title', text: quiz.title, attrs: { lang: quiz.locale } });
  const onLanguageChange = (locale: string): void => {
    const localized = handlers.onLanguageChange(locale);
    title.textContent = localized.title;
    title.lang = localized.locale;
  };

  const settings = [
    ...(handlers.languages.length > 1
      ? settingRow(
          'language',
          STRINGS.languageSetting,
          handlers.languages.map(({ locale, name }) => ({ value: locale, label: name, lang: locale })),
          handlers.language,
          onLanguageChange,
        )
      : []),
    ...settingRow(
      'difficulty',
      STRINGS.difficultySetting,
      DIFFICULTIES.map((level) => ({ value: level, label: String(level) })),
      handlers.difficulty,
      handlers.onDifficultyChange,
    ),
    ...settingRow(
      'dpad',
      STRINGS.dpadSetting,
      DPAD_SIDES.map((side) => ({ value: side, label: STRINGS.dpadSides[side] })),
      handlers.dpadSide,
      handlers.onDpadSideChange,
    ),
  ];

  showCard(root, [
    title,
    el('p', { className: 'muted', text: STRINGS.questionCount(quiz.questions.length) }),
    el('div', {
      className: 'actions',
      children: [
        startButton,
        button(STRINGS.leaderboard, handlers.onLeaderboard),
        button(STRINGS.credits, handlers.onCredits),
      ],
    }),
    el('div', { className: 'settings', children: settings }),
    // 建置時間：試玩時確認裝置拿到的是新版
    el('p', { className: 'build-info', text: STRINGS.buildInfo(formatBuildTime(import.meta.env.VITE_BUILD_TIME)) }),
  ]);
  startButton.focus();
}

/** 設定的一個選項；lang 是選項文字本身的語言（例如語言選單上的 "English"） */
interface SettingOption<T> {
  readonly value: T;
  readonly label: string;
  readonly lang?: string;
}

/**
 * 標題畫面的一項設定：左邊是名稱，右邊是幾個並排的單選選項。
 * 回傳兩個元素，放進 .settings 的兩欄表格裡；選項群組用 aria-labelledby 指向名稱。
 */
function settingRow<T extends string | number>(
  id: string,
  label: string,
  options: readonly SettingOption<T>[],
  current: T,
  onChange: (value: T) => void,
): HTMLElement[] {
  const labelId = `setting-${id}`;
  const choices = options.map((option) => {
    const input = el('input', { attrs: { type: 'radio', name: labelId, value: String(option.value) } });
    input.checked = option.value === current;
    input.addEventListener('change', () => {
      if (input.checked) onChange(option.value);
    });
    const text = el('span', { text: option.label, attrs: option.lang === undefined ? {} : { lang: option.lang } });
    return el('label', { children: [input, text] });
  });
  return [
    el('span', { className: 'setting-label', text: label, attrs: { id: labelId } }),
    el('div', { className: 'segmented', attrs: { role: 'radiogroup', 'aria-labelledby': labelId }, children: choices }),
  ];
}

/** 沒有命了、時間到（§5.1）：疊在遊戲畫面上，按「看成績」進入結算 */
export function showGameEnd(root: HTMLElement, kind: 'gameOver' | 'timeUp', onViewResults: () => void): void {
  const view = button(STRINGS.viewResults, onViewResults, 'primary');
  const title = kind === 'gameOver' ? STRINGS.gameOver : STRINGS.timeUp;
  showCard(root, [el('h1', { text: title }), el('div', { className: 'actions', children: [view] })]);
  root.classList.add('backdrop');
  view.focus();
}

export interface PausedHandlers {
  readonly onResume: () => void;
  readonly onRestart: () => void;
}

/** 暫停（§5.1）：半透明覆蓋層，「繼續」「重新開始」 */
export function showPaused(root: HTMLElement, handlers: PausedHandlers): void {
  const resume = button(STRINGS.resume, handlers.onResume, 'primary');
  showCard(root, [
    el('h1', { text: STRINGS.pausedTitle }),
    el('div', { className: 'actions', children: [resume, button(STRINGS.restart, handlers.onRestart)] }),
  ]);
  root.classList.add('backdrop');
  resume.focus();
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
