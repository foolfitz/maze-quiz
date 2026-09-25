import { DEFAULT_GAME_OPTIONS } from '../config';

// ─── 型別（§4.1）────────────────────────────────────────────

/** 題組檔案（quiz.json）的最上層結構 */
export interface QuizFile {
  readonly schemaVersion: 1;
  readonly id: string; // 題組代號，也用於排行榜的儲存 key
  readonly title: string; // 顯示在標題畫面
  readonly locale: string; // 題目內容的語言（BCP 47），例如 "en"
  /** 語言選單上顯示的名稱，例如 "English"；有 translations 時必填 */
  readonly languageName?: string;
  /** 其他語言的版本，key 是語言代碼（BCP 47），例如 "zh-Hant"。題目、選項、對錯與圖片都相同，只換文字 */
  readonly translations?: Readonly<Record<string, QuizTranslation>>;
  readonly options?: Partial<GameOptions>;
  readonly images: Readonly<Record<string, ImageAsset>>;
  readonly questions: readonly Question[];
}

export interface Question {
  readonly id: string;
  readonly prompt: string; // 題目文字，顯示在畫面下方
  readonly image?: string; // 選填：images 的 key
  readonly choices: readonly Choice[]; // 2–6 個
}

export interface Choice {
  readonly id: string;
  readonly text: string;
  readonly image?: string; // 選填：images 的 key
  readonly correct: boolean; // 一題可以有多個正確選項
}

/** 同一組題目的另一個語言版本 */
export interface QuizTranslation {
  readonly languageName: string; // 語言選單上顯示的名稱，例如 "中文"
  readonly title: string;
  /** key 是題目 id；每一題都要有 */
  readonly questions: Readonly<Record<string, QuestionTranslation>>;
}

export interface QuestionTranslation {
  readonly prompt: string;
  /** key 是選項 id，值是選項文字；每個選項都要有 */
  readonly choices: Readonly<Record<string, string>>;
}

export interface ImageAsset {
  readonly src: string; // 相對於 quiz.json 所在的資料夾
  readonly alt: string;
  readonly credit: ImageCredit | null; // null 表示尚未補上授權資訊
}

export interface ImageCredit {
  readonly title: string; // 原始檔名或作品名稱
  readonly author: string;
  readonly license: string; // 例如 "CC BY-SA 4.0"
  readonly licenseUrl: string;
  readonly sourceUrl: string; // 檔案說明頁的網址，不是圖片直連
}

// 先寫出所有合法值的陣列，再從陣列推導出型別：兩者永遠同步，驗證時也能直接拿陣列來比對。
export const TIMER_MODES = ['none', 'countUp', 'countDown'] as const;
export type TimerMode = (typeof TIMER_MODES)[number]; // 'none' | 'countUp' | 'countDown'

// 使用者 2026-09-25 改成三級（§4.1 原本是 1–5）
export const DIFFICULTIES = [1, 2, 3] as const;
export type Difficulty = (typeof DIFFICULTIES)[number]; // 1 | 2 | 3

export interface GameOptions {
  readonly timerMode: TimerMode; // 預設 'countUp'
  readonly countDownSeconds: number; // 預設 300，只在 countDown 使用
  readonly lives: number; // 預設 3，範圍 1–9
  readonly difficulty: Difficulty; // 預設 2
  readonly shuffleQuestions: boolean; // 預設 true
  readonly showAnswersAtEnd: boolean; // 預設 true
}

export type ValidationResult =
  | { readonly ok: true; readonly quiz: QuizFile; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

/** 驗證規則的上下限（§4.2） */
export const QUIZ_LIMITS = {
  minChoices: 2,
  maxChoices: 6,
  lives: { min: 1, max: 9 },
  countDownSeconds: { min: 30, max: 3600 },
  maxChoiceTextLength: 20,
  maxPromptLength: 120,
} as const;

// ─── 預設值合併 ─────────────────────────────────────────────

/** 程式預設值，再以題組 JSON 的 options 覆蓋（§4.3） */
export function resolveOptions(overrides: Partial<GameOptions> | undefined): GameOptions {
  // 逐欄寫出來而不用展開運算子：GameOptions 之後新增欄位時，這裡會編譯失敗提醒要處理
  return {
    timerMode: overrides?.timerMode ?? DEFAULT_GAME_OPTIONS.timerMode,
    countDownSeconds: overrides?.countDownSeconds ?? DEFAULT_GAME_OPTIONS.countDownSeconds,
    lives: overrides?.lives ?? DEFAULT_GAME_OPTIONS.lives,
    difficulty: overrides?.difficulty ?? DEFAULT_GAME_OPTIONS.difficulty,
    shuffleQuestions: overrides?.shuffleQuestions ?? DEFAULT_GAME_OPTIONS.shuffleQuestions,
    showAnswersAtEnd: overrides?.showAnswersAtEnd ?? DEFAULT_GAME_OPTIONS.showAnswersAtEnd,
  };
}

// ─── 語言版本 ───────────────────────────────────────────────

/** 語言選單的一個選項 */
export interface QuizLanguage {
  readonly locale: string;
  readonly name: string;
}

/** 題組有哪些語言：原文排第一個，再來是 translations 的順序 */
export function quizLanguages(quiz: QuizFile): readonly QuizLanguage[] {
  const original: QuizLanguage = { locale: quiz.locale, name: quiz.languageName ?? quiz.locale };
  const translated = Object.entries(quiz.translations ?? {}).map(([locale, t]) => ({ locale, name: t.languageName }));
  return [original, ...translated];
}

/**
 * 換成指定語言的題組：題目、選項、對錯與圖片都不變，只換標題、題目與選項的文字。
 * 回傳的仍然是 QuizFile，遊戲其他部分不必知道有翻譯這回事。
 * 是原文或找不到這個語言時，直接回傳原本的題組。
 */
export function localizeQuiz(quiz: QuizFile, locale: string): QuizFile {
  const translation = locale === quiz.locale ? undefined : own(quiz.translations ?? {}, locale);
  if (translation === undefined) return quiz;
  return {
    schemaVersion: quiz.schemaVersion,
    id: quiz.id, // 同一組題目：排行榜也存在同一個 key 底下（用 optionsKey 區分語言）
    title: translation.title,
    locale,
    languageName: translation.languageName,
    ...(quiz.options === undefined ? {} : { options: quiz.options }),
    images: quiz.images,
    questions: quiz.questions.map((question) => {
      // 驗證過的題組每一題、每個選項都有翻譯；萬一缺了就沿用原文
      const q = own(translation.questions, question.id);
      return {
        ...question,
        prompt: q?.prompt ?? question.prompt,
        choices: question.choices.map((choice) => ({
          ...choice,
          text: (q === undefined ? undefined : own(q.choices, choice.id)) ?? choice.text,
        })),
      };
    }),
  };
}

/**
 * 只讀物件自己的屬性。翻譯以題目與選項的 id 當 key，id 可能剛好是 toString、constructor 之類
 * Object.prototype 上的名字；直接用 record[key] 會讀到繼承來的函式，誤以為有翻譯。
 * （Object.hasOwn 要 Safari 15.4，所以用 hasOwnProperty.call）
 */
function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

/** BCP 47 語言代碼的標準寫法（例如 "zh-hant" → "zh-Hant"）；不是合法的代碼時回傳 null */
function canonicalLocale(locale: string): string | null {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? null;
  } catch {
    return null;
  }
}

// ─── 驗證（§4.2）────────────────────────────────────────────
//
// 做法：每個 parseXxx 函式讀一段未知的 JSON，把問題記進 Issues，
// 成功時回傳建好的物件，失敗時回傳 undefined。
// 回傳的物件都是重新組出來的，所以不需要用 `as` 把 unknown 硬轉成 QuizFile。

/** 收集驗證過程中的錯誤與警告；訊息格式是「位置：原因」 */
class Issues {
  readonly errors: string[] = [];
  readonly warnings: string[] = [];

  error(path: string, message: string): void {
    this.errors.push(`${path}：${message}`);
  }

  warn(path: string, message: string): void {
    this.warnings.push(`${path}：${message}`);
  }
}

type UnknownRecord = Readonly<Record<string, unknown>>;

/** 型別守衛：回傳 true 時，TypeScript 會把 value 的型別縮小成 UnknownRecord */
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimerMode(value: unknown): value is TimerMode {
  return TIMER_MODES.some((mode) => mode === value);
}

function isDifficulty(value: unknown): value is Difficulty {
  return DIFFICULTIES.some((level) => level === value);
}

/** 把「期望的型別」和「實際拿到的值」寫成人看得懂的說明 */
function describe(value: unknown): string {
  if (value === undefined) return '沒有填';
  if (value === null) return 'null';
  if (Array.isArray(value)) return '陣列';
  if (typeof value === 'object') return '物件';
  return JSON.stringify(value);
}

/** 字數以 Unicode code point 計算，中文字與 emoji 都算一個字 */
function charCount(text: string): number {
  return [...text].length;
}

function childPath(parent: string, key: string): string {
  return parent === '' ? key : `${parent}.${key}`;
}

function formatList(values: readonly (string | number)[]): string {
  return values.map((v) => JSON.stringify(v)).join('、');
}

/** 讀取必填的文字欄位；allowEmpty 為 false 時空字串也算錯 */
function readString(
  obj: UnknownRecord,
  key: string,
  path: string,
  issues: Issues,
  allowEmpty = false,
): string | undefined {
  const value = obj[key];
  const p = childPath(path, key);
  if (typeof value !== 'string') {
    issues.error(p, `必須是文字，目前是 ${describe(value)}`);
    return undefined;
  }
  if (!allowEmpty && value.trim() === '') {
    issues.error(p, '不能是空的');
    return undefined;
  }
  return value;
}

/** 讀取選填的圖片 key，並確認它存在於 images */
function readImageRef(
  obj: UnknownRecord,
  path: string,
  imageKeys: ReadonlySet<string>,
  issues: Issues,
): { readonly valid: boolean; readonly image: string | undefined } {
  const value = obj['image'];
  const p = childPath(path, 'image');
  if (value === undefined) return { valid: true, image: undefined };
  if (typeof value !== 'string') {
    issues.error(p, `必須是文字（images 裡的 key），目前是 ${describe(value)}`);
    return { valid: false, image: undefined };
  }
  if (!imageKeys.has(value)) {
    issues.error(p, `找不到圖片 ${JSON.stringify(value)}，請確認 images 裡有這個 key`);
    return { valid: false, image: undefined };
  }
  return { valid: true, image: value };
}

export function validateQuiz(raw: unknown): ValidationResult {
  const issues = new Issues();
  const quiz = parseQuizFile(raw, issues);
  if (quiz === undefined || issues.errors.length > 0) {
    return { ok: false, errors: issues.errors };
  }
  return { ok: true, quiz, warnings: issues.warnings };
}

function parseQuizFile(raw: unknown, issues: Issues): QuizFile | undefined {
  if (!isRecord(raw)) {
    issues.error('quiz.json', `最上層必須是物件（{ … }），目前是 ${describe(raw)}`);
    return undefined;
  }

  // 字面型別 1：只有在 schemaVersion === 1 的分支裡，TypeScript 才知道它的型別是 1 而不是 number
  const schemaVersion = raw['schemaVersion'];
  if (schemaVersion !== 1) {
    issues.error('schemaVersion', `必須是 1，目前是 ${describe(schemaVersion)}`);
  }

  const id = readString(raw, 'id', '', issues);
  const title = readString(raw, 'title', '', issues);
  const locale = readString(raw, 'locale', '', issues);
  const options = parseOptions(raw['options'], issues);
  const images = parseImages(raw['images'], issues);

  // 即使 images 本身有錯，也用它原本的 key 檢查引用，避免同一個問題連帶噴出一堆錯誤
  const imageKeys = new Set(isRecord(raw['images']) ? Object.keys(raw['images']) : []);
  const questions = parseQuestions(raw['questions'], imageKeys, issues);

  // 有其他語言時，原文也要寫出語言名稱，選單上才有東西可以顯示
  const hasTranslations = raw['translations'] !== undefined;
  const languageName = hasTranslations || raw['languageName'] !== undefined
    ? readString(raw, 'languageName', '', issues)
    : null;
  const translations = parseTranslations(raw['translations'], locale, questions, issues);

  if (
    schemaVersion !== 1 ||
    id === undefined ||
    title === undefined ||
    locale === undefined ||
    languageName === undefined ||
    translations === undefined ||
    options === undefined ||
    images === undefined ||
    questions === undefined
  ) {
    return undefined;
  }

  return {
    schemaVersion,
    id,
    title,
    locale,
    // 選填欄位：題組沒寫的話，回傳的物件也不帶這個 key
    ...(languageName === null ? {} : { languageName }),
    ...(translations === null ? {} : { translations }),
    ...(options === null ? {} : { options }),
    images,
    questions,
  };
}

/**
 * 其他語言的版本。每一題、每個選項都要有翻譯，也不能多出題組裡沒有的 id。
 * 題目本身有錯（questions 是 undefined）時只檢查翻譯的格式，先不和題目比對。
 * 回傳 null 表示題組沒有寫 translations；undefined 表示有錯。
 */
function parseTranslations(
  raw: unknown,
  baseLocale: string | undefined,
  questions: readonly Question[] | undefined,
  issues: Issues,
): Record<string, QuizTranslation> | null | undefined {
  if (raw === undefined) return null;
  if (!isRecord(raw)) {
    issues.error('translations', `必須是物件（{ "語言代碼": { … } }），目前是 ${describe(raw)}`);
    return undefined;
  }
  // 用 Object.fromEntries 組出結果：key 就算是 "__proto__" 也是一般的屬性，不會改到原型
  const entries: [string, QuizTranslation][] = [];
  let valid = true;
  for (const [locale, value] of Object.entries(raw)) {
    const path = `translations.${locale}`;
    const canonical = canonicalLocale(locale);
    if (canonical === null) {
      issues.error(path, '不是合法的語言代碼（BCP 47），例如 "zh-Hant"、"ja"');
      valid = false;
      continue;
    }
    if (canonical === canonicalLocale(baseLocale ?? '')) {
      issues.error(path, `和題組原文的 locale（${JSON.stringify(baseLocale)}）是同一個語言`);
      valid = false;
      continue;
    }
    const translation = parseTranslation(value, path, questions, issues);
    if (translation === undefined) valid = false;
    else entries.push([locale, translation]);
  }
  return valid ? Object.fromEntries(entries) : undefined;
}

function parseTranslation(
  raw: unknown,
  path: string,
  questions: readonly Question[] | undefined,
  issues: Issues,
): QuizTranslation | undefined {
  if (!isRecord(raw)) {
    issues.error(path, `必須是物件（{ "languageName": …, "title": …, "questions": { … } }），目前是 ${describe(raw)}`);
    return undefined;
  }
  const languageName = readString(raw, 'languageName', path, issues);
  const title = readString(raw, 'title', path, issues);
  const questionsPath = `${path}.questions`;
  const rawQuestions = raw['questions'];
  if (!isRecord(rawQuestions)) {
    issues.error(questionsPath, `必須是物件（{ "題目 id": { … } }），目前是 ${describe(rawQuestions)}`);
    return undefined;
  }

  let valid = true;
  const translated: [string, QuestionTranslation][] = [];
  for (const [questionId, value] of Object.entries(rawQuestions)) {
    const question = questions?.find((q) => q.id === questionId);
    if (questions !== undefined && question === undefined) {
      issues.error(`${questionsPath}.${questionId}`, '題組裡沒有這個題目 id（拼錯了嗎？）');
      valid = false;
      continue;
    }
    const parsed = parseQuestionTranslation(value, `${questionsPath}.${questionId}`, question, issues);
    if (parsed === undefined) valid = false;
    else translated.push([questionId, parsed]);
  }
  for (const question of questions ?? []) {
    if (own(rawQuestions, question.id) === undefined) {
      issues.error(questionsPath, `缺少題目 ${JSON.stringify(question.id)} 的翻譯`);
      valid = false;
    }
  }

  if (!valid || languageName === undefined || title === undefined) return undefined;
  return { languageName, title, questions: Object.fromEntries(translated) };
}

/** question 是 undefined 時（題目本身有錯）只檢查格式 */
function parseQuestionTranslation(
  raw: unknown,
  path: string,
  question: Question | undefined,
  issues: Issues,
): QuestionTranslation | undefined {
  if (!isRecord(raw)) {
    issues.error(path, `必須是物件（{ "prompt": …, "choices": { … } }），目前是 ${describe(raw)}`);
    return undefined;
  }
  const prompt = readString(raw, 'prompt', path, issues);
  if (prompt !== undefined) warnLongPrompt(prompt, `${path}.prompt`, issues);

  const choicesPath = `${path}.choices`;
  const rawChoices = raw['choices'];
  if (!isRecord(rawChoices)) {
    issues.error(choicesPath, `必須是物件（{ "選項 id": "文字" }），目前是 ${describe(rawChoices)}`);
    return undefined;
  }

  let valid = true;
  const choices: [string, string][] = [];
  for (const choiceId of Object.keys(rawChoices)) {
    const choice = question?.choices.find((c) => c.id === choiceId);
    if (question !== undefined && choice === undefined) {
      issues.error(`${choicesPath}.${choiceId}`, '這一題沒有這個選項 id（拼錯了嗎？）');
      valid = false;
      continue;
    }
    // 和原文一樣：有圖片的選項可以不寫字，沒有圖片時一定要有文字；
    // 原文的題目有錯（question 是 undefined）時不知道有沒有圖片，先不檢查是不是空的
    const allowEmpty = question === undefined || choice?.image !== undefined;
    const text = readString(rawChoices, choiceId, choicesPath, issues, allowEmpty);
    if (text === undefined) valid = false;
    else {
      warnLongChoiceText(text, `${choicesPath}.${choiceId}`, issues);
      choices.push([choiceId, text]);
    }
  }
  for (const choice of question?.choices ?? []) {
    if (own(rawChoices, choice.id) === undefined) {
      issues.error(choicesPath, `缺少選項 ${JSON.stringify(choice.id)} 的翻譯`);
      valid = false;
    }
  }

  if (!valid || prompt === undefined) return undefined;
  return { prompt, choices: Object.fromEntries(choices) };
}

function warnLongPrompt(prompt: string, path: string, issues: Issues): void {
  if (charCount(prompt) > QUIZ_LIMITS.maxPromptLength) {
    issues.warn(path, `題目有 ${charCount(prompt)} 個字元，超過 ${QUIZ_LIMITS.maxPromptLength} 個可能在題目列放不下`);
  }
}

function warnLongChoiceText(text: string, path: string, issues: Issues): void {
  if (charCount(text) > QUIZ_LIMITS.maxChoiceTextLength) {
    issues.warn(
      path,
      `選項文字有 ${charCount(text)} 個字元，超過 ${QUIZ_LIMITS.maxChoiceTextLength} 個可能在答案區裡放不下`,
    );
  }
}

/** 去掉 readonly 的工具型別，用來一欄一欄組出物件 */
type Writable<T> = { -readonly [K in keyof T]: T[K] };

const OPTION_KEYS: readonly (keyof GameOptions)[] = [
  'timerMode',
  'countDownSeconds',
  'lives',
  'difficulty',
  'shuffleQuestions',
  'showAnswersAtEnd',
];

/** 回傳 null 表示題組沒有寫 options；undefined 表示有錯 */
function parseOptions(raw: unknown, issues: Issues): Partial<GameOptions> | null | undefined {
  if (raw === undefined) return null;
  if (!isRecord(raw)) {
    issues.error('options', `必須是物件（{ … }），目前是 ${describe(raw)}`);
    return undefined;
  }

  const result: Writable<Partial<GameOptions>> = {};
  let valid = true;
  const fail = (key: keyof GameOptions, message: string): void => {
    issues.error(`options.${key}`, message);
    valid = false;
  };

  for (const key of Object.keys(raw)) {
    if (!OPTION_KEYS.some((known) => known === key)) {
      issues.warn(`options.${key}`, '不認得這個設定，會被忽略（名稱拼錯了嗎？）');
    }
  }

  const { timerMode, countDownSeconds, lives, difficulty, shuffleQuestions, showAnswersAtEnd } = raw;

  if (timerMode !== undefined) {
    if (isTimerMode(timerMode)) result.timerMode = timerMode;
    else fail('timerMode', `必須是 ${formatList(TIMER_MODES)} 其中之一，目前是 ${describe(timerMode)}`);
  }

  if (countDownSeconds !== undefined) {
    const { min, max } = QUIZ_LIMITS.countDownSeconds;
    if (typeof countDownSeconds === 'number' && countDownSeconds >= min && countDownSeconds <= max) {
      result.countDownSeconds = countDownSeconds;
    } else {
      fail('countDownSeconds', `必須是 ${min}–${max} 的數字（秒），目前是 ${describe(countDownSeconds)}`);
    }
  }

  if (lives !== undefined) {
    const { min, max } = QUIZ_LIMITS.lives;
    if (typeof lives === 'number' && Number.isInteger(lives) && lives >= min && lives <= max) {
      result.lives = lives;
    } else {
      fail('lives', `必須是 ${min}–${max} 的整數，目前是 ${describe(lives)}`);
    }
  }

  if (difficulty !== undefined) {
    if (isDifficulty(difficulty)) result.difficulty = difficulty;
    else fail('difficulty', `必須是 ${formatList(DIFFICULTIES)} 其中之一，目前是 ${describe(difficulty)}`);
  }

  if (shuffleQuestions !== undefined) {
    if (typeof shuffleQuestions === 'boolean') result.shuffleQuestions = shuffleQuestions;
    else fail('shuffleQuestions', `必須是 true 或 false，目前是 ${describe(shuffleQuestions)}`);
  }

  if (showAnswersAtEnd !== undefined) {
    if (typeof showAnswersAtEnd === 'boolean') result.showAnswersAtEnd = showAnswersAtEnd;
    else fail('showAnswersAtEnd', `必須是 true 或 false，目前是 ${describe(showAnswersAtEnd)}`);
  }

  return valid ? result : undefined;
}

function parseImages(raw: unknown, issues: Issues): Record<string, ImageAsset> | undefined {
  if (!isRecord(raw)) {
    issues.error('images', `必須是物件（{ "key": { … } }），目前是 ${describe(raw)}；沒有圖片時請寫 {}`);
    return undefined;
  }
  const result: Record<string, ImageAsset> = {};
  let valid = true;
  for (const [key, value] of Object.entries(raw)) {
    const asset = parseImageAsset(value, `images.${key}`, issues);
    if (asset === undefined) valid = false;
    else result[key] = asset;
  }
  return valid ? result : undefined;
}

function parseImageAsset(raw: unknown, path: string, issues: Issues): ImageAsset | undefined {
  if (!isRecord(raw)) {
    issues.error(path, `必須是物件（{ "src": …, "alt": …, "credit": … }），目前是 ${describe(raw)}`);
    return undefined;
  }
  const src = readString(raw, 'src', path, issues);
  const alt = readString(raw, 'alt', path, issues, true);
  if (alt !== undefined && alt.trim() === '') {
    issues.warn(childPath(path, 'alt'), '沒有替代文字，看不到圖片的人會不知道這是什麼');
  }
  const credit = parseCredit(raw['credit'], childPath(path, 'credit'), issues);
  if (src === undefined || alt === undefined || credit === undefined) return undefined;
  return { src, alt, credit };
}

function parseCredit(raw: unknown, path: string, issues: Issues): ImageCredit | null | undefined {
  if (raw === null) {
    issues.warn(path, '尚未補上圖片授權資訊');
    return null;
  }
  if (!isRecord(raw)) {
    issues.error(path, `必須是物件或 null（還沒有授權資訊時請寫 null），目前是 ${describe(raw)}`);
    return undefined;
  }
  const title = readString(raw, 'title', path, issues);
  const author = readString(raw, 'author', path, issues);
  const license = readString(raw, 'license', path, issues);
  const licenseUrl = readString(raw, 'licenseUrl', path, issues);
  const sourceUrl = readString(raw, 'sourceUrl', path, issues);
  if (
    title === undefined ||
    author === undefined ||
    license === undefined ||
    licenseUrl === undefined ||
    sourceUrl === undefined
  ) {
    return undefined;
  }
  return { title, author, license, licenseUrl, sourceUrl };
}

function parseQuestions(
  raw: unknown,
  imageKeys: ReadonlySet<string>,
  issues: Issues,
): Question[] | undefined {
  if (!Array.isArray(raw)) {
    issues.error('questions', `必須是陣列（[ … ]），目前是 ${describe(raw)}`);
    return undefined;
  }
  if (raw.length === 0) {
    issues.error('questions', '至少需要 1 題');
    return undefined;
  }

  const result: Question[] = [];
  let valid = true;
  raw.forEach((item: unknown, index) => {
    const question = parseQuestion(item, `questions[${index}]`, imageKeys, issues);
    if (question === undefined) valid = false;
    else result.push(question);
  });

  const uniqueIds = checkDuplicateIds(
    raw,
    (index) => `questions[${index}]`,
    (id, firstIndex) => `題目 id ${JSON.stringify(id)} 重複（和 questions[${firstIndex}] 相同），每一題的 id 都要不一樣`,
    issues,
  );

  return valid && uniqueIds ? result : undefined;
}

/**
 * 檢查陣列裡各物件的 id 有沒有重複，回傳 true 表示沒有重複。
 * 直接讀原始資料而不是解析後的結果，這樣某一項有其他錯誤時，重複的 id 也會一起列出來。
 */
function checkDuplicateIds(
  items: readonly unknown[],
  itemPath: (index: number) => string,
  duplicateMessage: (id: string, firstIndex: number) => string,
  issues: Issues,
): boolean {
  const firstIndexById = new Map<string, number>();
  let unique = true;
  items.forEach((item, index) => {
    const id = isRecord(item) ? item['id'] : undefined;
    // 缺少 id 或 id 是空的，readString 已經報過錯
    if (typeof id !== 'string' || id.trim() === '') return;
    const firstIndex = firstIndexById.get(id);
    if (firstIndex === undefined) {
      firstIndexById.set(id, index);
    } else {
      issues.error(`${itemPath(index)}.id`, duplicateMessage(id, firstIndex));
      unique = false;
    }
  });
  return unique;
}

function parseQuestion(
  raw: unknown,
  path: string,
  imageKeys: ReadonlySet<string>,
  issues: Issues,
): Question | undefined {
  if (!isRecord(raw)) {
    issues.error(path, `必須是物件（{ "id": …, "prompt": …, "choices": [ … ] }），目前是 ${describe(raw)}`);
    return undefined;
  }
  const id = readString(raw, 'id', path, issues);
  const prompt = readString(raw, 'prompt', path, issues);
  if (prompt !== undefined) warnLongPrompt(prompt, `${path}.prompt`, issues);
  const imageRef = readImageRef(raw, path, imageKeys, issues);
  const choices = parseChoices(raw['choices'], `${path}.choices`, imageKeys, issues);

  if (id === undefined || prompt === undefined || !imageRef.valid || choices === undefined) {
    return undefined;
  }
  const { image } = imageRef;
  return { id, prompt, ...(image === undefined ? {} : { image }), choices };
}

function parseChoices(
  raw: unknown,
  path: string,
  imageKeys: ReadonlySet<string>,
  issues: Issues,
): Choice[] | undefined {
  if (!Array.isArray(raw)) {
    issues.error(path, `必須是陣列（[ … ]），目前是 ${describe(raw)}`);
    return undefined;
  }

  let valid = true;
  const { minChoices, maxChoices } = QUIZ_LIMITS;
  if (raw.length < minChoices) {
    issues.error(path, `至少需要 ${minChoices} 個選項，目前有 ${raw.length} 個`);
    valid = false;
  } else if (raw.length > maxChoices) {
    issues.error(path, `最多只能有 ${maxChoices} 個選項，目前有 ${raw.length} 個`);
    valid = false;
  }

  const result: Choice[] = [];
  raw.forEach((item: unknown, index) => {
    const choice = parseChoice(item, `${path}[${index}]`, imageKeys, issues);
    if (choice === undefined) valid = false;
    else result.push(choice);
  });

  const uniqueIds = checkDuplicateIds(
    raw,
    (index) => `${path}[${index}]`,
    (id, firstIndex) => `選項 id ${JSON.stringify(id)} 在這一題重複（和 choices[${firstIndex}] 相同）`,
    issues,
  );
  if (!uniqueIds) valid = false;

  // 正確答案的數量也直接看原始資料：只要每個選項的 correct 都是 true/false 就能判斷，
  // 不受其他欄位的錯誤影響。every 搭配型別守衛，通過後 flags 的型別會縮小成 boolean[]。
  const flags = raw.map((item: unknown) => (isRecord(item) ? item['correct'] : undefined));
  if (flags.length > 0 && flags.every((flag): flag is boolean => typeof flag === 'boolean')) {
    const correctCount = flags.filter((flag) => flag).length;
    if (correctCount === 0) {
      issues.error(path, '沒有任何正確選項，至少要有一個選項的 correct 是 true');
      valid = false;
    } else if (correctCount === flags.length) {
      issues.warn(path, '所有選項都是正確答案，這題走進哪一區都會答對');
    }
  }

  return valid ? result : undefined;
}

function parseChoice(
  raw: unknown,
  path: string,
  imageKeys: ReadonlySet<string>,
  issues: Issues,
): Choice | undefined {
  if (!isRecord(raw)) {
    issues.error(path, `必須是物件（{ "id": …, "text": …, "correct": … }），目前是 ${describe(raw)}`);
    return undefined;
  }
  const id = readString(raw, 'id', path, issues);
  const imageRef = readImageRef(raw, path, imageKeys, issues);

  // 有圖片的選項可以只放圖、不寫字；沒有圖片時一定要有文字
  const hasImage = raw['image'] !== undefined;
  const text = readString(raw, 'text', path, issues, hasImage);
  if (text !== undefined) warnLongChoiceText(text, `${path}.text`, issues);

  const correct = raw['correct'];
  if (typeof correct !== 'boolean') {
    issues.error(`${path}.correct`, `必須是 true 或 false，目前是 ${describe(correct)}`);
  }

  if (id === undefined || text === undefined || !imageRef.valid || typeof correct !== 'boolean') {
    return undefined;
  }
  const { image } = imageRef;
  return { id, text, ...(image === undefined ? {} : { image }), correct };
}
