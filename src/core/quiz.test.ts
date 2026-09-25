import { describe, expect, it } from 'vitest';
import sampleQuiz from '../../public/quizzes/zoo-animals/quiz.json';
import { DEFAULT_GAME_OPTIONS } from '../config';
import { resolveOptions, validateQuiz } from './quiz';

// ─── 建立測試資料的小工具 ─────────────────────────────────────
// 每次呼叫都回傳新的物件，測試之間不會互相影響。

const credit = {
  title: 'Cat.jpg',
  author: 'Someone',
  license: 'CC0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Cat.jpg',
};

function choice(id: string, correct = false, extra: Record<string, unknown> = {}) {
  return { id, text: id, correct, ...extra };
}

function question(id: string, choices: readonly unknown[], extra: Record<string, unknown> = {}) {
  return { id, prompt: `Question ${id}`, choices, ...extra };
}

function quiz(extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id: 'test',
    title: 'Test Quiz',
    locale: 'en',
    images: { cat: { src: 'images/cat.webp', alt: 'A cat', credit } },
    questions: [question('q1', [choice('a', true), choice('b')])],
    ...extra,
  };
}

/** 驗證應該失敗，回傳錯誤訊息 */
function errorsOf(raw: unknown): readonly string[] {
  const result = validateQuiz(raw);
  if (result.ok) throw new Error('預期驗證失敗，結果卻通過了');
  return result.errors;
}

/** 驗證應該通過，回傳警告訊息 */
function warningsOf(raw: unknown): readonly string[] {
  const result = validateQuiz(raw);
  if (!result.ok) throw new Error(`預期驗證通過，結果失敗：\n${result.errors.join('\n')}`);
  return result.warnings;
}

/** 確認只有一則訊息，而且位置（「：」前面的部分）正確 */
function expectSingleAt(messages: readonly string[], path: string): void {
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatch(new RegExp(`^${escapeRegExp(path)}：`));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── 範例題組 ────────────────────────────────────────────────

describe('範例題組 zoo-animals', () => {
  it('通過驗證，內容原封不動', () => {
    const result = validateQuiz(sampleQuiz);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.quiz).toEqual(sampleQuiz);
  });

  it('只有「尚未補上授權資訊」的警告，每張圖一則', () => {
    const warnings = warningsOf(sampleQuiz);
    expect(warnings).toHaveLength(Object.keys(sampleQuiz.images).length);
    for (const warning of warnings) expect(warning).toMatch(/^images\.\w+\.credit：/);
  });
});

describe('最小的合法題組', () => {
  it('沒有任何警告', () => {
    expect(warningsOf(quiz())).toEqual([]);
  });

  it('沒寫 options 時，回傳的題組也沒有 options', () => {
    const result = validateQuiz(quiz());
    expect(result.ok && 'options' in result.quiz).toBe(false);
  });
});

// ─── §4.2 錯誤規則 ───────────────────────────────────────────

describe('錯誤：schemaVersion 不是 1', () => {
  it.each([2, '1', 0, null])('schemaVersion = %j', (version) => {
    expectSingleAt(errorsOf(quiz({ schemaVersion: version })), 'schemaVersion');
  });

  it('沒有 schemaVersion', () => {
    const { schemaVersion: _omit, ...raw } = quiz();
    expectSingleAt(errorsOf(raw), 'schemaVersion');
  });
});

describe('錯誤：questions 是空陣列', () => {
  it('指出 questions', () => {
    const errors = errorsOf(quiz({ questions: [] }));
    expectSingleAt(errors, 'questions');
    expect(errors[0]).toContain('至少需要 1 題');
  });
});

describe('錯誤：id 重複', () => {
  it('題目 id 在題組內重複', () => {
    const questions = [
      question('q1', [choice('a', true), choice('b')]),
      question('q2', [choice('a', true), choice('b')]),
      question('q1', [choice('a', true), choice('b')]),
    ];
    const errors = errorsOf(quiz({ questions }));
    expectSingleAt(errors, 'questions[2].id');
    expect(errors[0]).toContain('questions[0]');
  });

  it('選項 id 在同一題內重複', () => {
    const questions = [question('q1', [choice('a', true), choice('b'), choice('a')])];
    const errors = errorsOf(quiz({ questions }));
    expectSingleAt(errors, 'questions[0].choices[2].id');
    expect(errors[0]).toContain('choices[0]');
  });

  it('不同題目的選項 id 相同是允許的', () => {
    const questions = [
      question('q1', [choice('a', true), choice('b')]),
      question('q2', [choice('a', true), choice('b')]),
    ];
    expect(warningsOf(quiz({ questions }))).toEqual([]);
  });
});

describe('錯誤：選項數量', () => {
  it('少於 2 個', () => {
    const errors = errorsOf(quiz({ questions: [question('q1', [choice('a', true)])] }));
    expectSingleAt(errors, 'questions[0].choices');
    expect(errors[0]).toContain('至少需要 2 個選項');
  });

  it('多於 6 個', () => {
    const choices = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => choice(id, id === 'a'));
    const errors = errorsOf(quiz({ questions: [question('q1', choices)] }));
    expectSingleAt(errors, 'questions[0].choices');
    expect(errors[0]).toContain('最多只能有 6 個選項');
  });

  it('2 個和 6 個都可以', () => {
    const two = ['a', 'b'].map((id) => choice(id, id === 'a'));
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => choice(id, id === 'a'));
    const questions = [question('q1', two), question('q2', six)];
    expect(warningsOf(quiz({ questions }))).toEqual([]);
  });

  it('位置指向第幾題', () => {
    const questions = [
      question('q1', [choice('a', true), choice('b')]),
      question('q2', [choice('a', true), choice('b')]),
      question('q3', [choice('a', true)]),
    ];
    expectSingleAt(errorsOf(quiz({ questions })), 'questions[2].choices');
  });
});

describe('錯誤：沒有正確選項', () => {
  it('指出該題的 choices', () => {
    const questions = [
      question('q1', [choice('a', true), choice('b')]),
      question('q2', [choice('a'), choice('b'), choice('c')]),
    ];
    const errors = errorsOf(quiz({ questions }));
    expectSingleAt(errors, 'questions[1].choices');
    expect(errors[0]).toContain('沒有任何正確選項');
  });
});

describe('錯誤：image 指向不存在的 key', () => {
  it('題目的 image', () => {
    const questions = [question('q1', [choice('a', true), choice('b')], { image: 'dog' })];
    const errors = errorsOf(quiz({ questions }));
    expectSingleAt(errors, 'questions[0].image');
    expect(errors[0]).toContain('"dog"');
  });

  it('選項的 image', () => {
    const questions = [question('q1', [choice('a', true, { image: 'cat' }), choice('b', false, { image: 'dgo' })])];
    const errors = errorsOf(quiz({ questions }));
    expectSingleAt(errors, 'questions[0].choices[1].image');
    expect(errors[0]).toContain('"dgo"');
  });

  it('存在的 key 可以通過', () => {
    const questions = [question('q1', [choice('a', true, { image: 'cat' }), choice('b')], { image: 'cat' })];
    expect(warningsOf(quiz({ questions }))).toEqual([]);
  });
});

describe('錯誤：options 超出範圍', () => {
  it.each([
    ['lives', 0],
    ['lives', 10],
    ['lives', 2.5],
    ['lives', '3'],
    ['difficulty', 0],
    ['difficulty', 6],
    ['difficulty', 2.5],
    ['countDownSeconds', 29],
    ['countDownSeconds', 3601],
    ['timerMode', 'up'],
    ['shuffleQuestions', 'yes'],
    ['showAnswersAtEnd', 1],
  ])('%s = %j', (key, value) => {
    expectSingleAt(errorsOf(quiz({ options: { [key]: value } })), `options.${key}`);
  });

  it('邊界值可以通過', () => {
    for (const options of [
      { lives: 1, difficulty: 1, countDownSeconds: 30 },
      { lives: 9, difficulty: 5, countDownSeconds: 3600 },
    ]) {
      expect(warningsOf(quiz({ options }))).toEqual([]);
    }
  });

  it('不認得的設定只給警告', () => {
    expectSingleAt(warningsOf(quiz({ options: { live: 3 } })), 'options.live');
  });
});

describe('錯誤：欄位缺少或型別不對', () => {
  it('最上層不是物件', () => {
    expectSingleAt(errorsOf([]), 'quiz.json');
    expectSingleAt(errorsOf('hello'), 'quiz.json');
  });

  it('選項缺少 correct', () => {
    const questions = [question('q1', [choice('a', true), { id: 'b', text: 'b' }])];
    expectSingleAt(errorsOf(quiz({ questions })), 'questions[0].choices[1].correct');
  });

  it('沒有圖片的選項，text 不能是空的', () => {
    const questions = [question('q1', [choice('a', true), choice('b', false, { text: '' })])];
    expectSingleAt(errorsOf(quiz({ questions })), 'questions[0].choices[1].text');
  });

  it('有圖片的選項可以不寫字', () => {
    const questions = [question('q1', [choice('a', true), choice('b', false, { text: '', image: 'cat' })])];
    expect(warningsOf(quiz({ questions }))).toEqual([]);
  });

  it('credit 缺少欄位', () => {
    const { author: _omit, ...partialCredit } = credit;
    const images = { cat: { src: 'images/cat.webp', alt: 'A cat', credit: partialCredit } };
    expectSingleAt(errorsOf(quiz({ images })), 'images.cat.credit.author');
  });

  it('一次列出所有錯誤', () => {
    const questions = [
      question('q1', [choice('a')]),
      question('q1', [choice('a', true), choice('b')], { image: 'nope' }),
    ];
    const errors = errorsOf(quiz({ schemaVersion: 2, options: { lives: 0 }, questions }));
    expect(errors).toEqual([
      expect.stringMatching(/^schemaVersion：/),
      expect.stringMatching(/^options\.lives：/),
      expect.stringMatching(/^questions\[0\]\.choices：至少需要 2 個選項/),
      expect.stringMatching(/^questions\[0\]\.choices：沒有任何正確選項/),
      expect.stringMatching(/^questions\[1\]\.image：/),
      expect.stringMatching(/^questions\[1\]\.id：/),
    ]);
  });

  it('某一題有其他錯誤時，重複的 id 仍然會列出來', () => {
    const questions = [
      question('q1', [choice('a', true), choice('b')]),
      question('q2', [choice('a', true), choice('b', false, { image: 'nope' }), choice('a')]),
      question('q2', [choice('a', true), choice('b')]),
    ];
    const errors = errorsOf(quiz({ questions }));
    expect(errors).toEqual([
      expect.stringMatching(/^questions\[1\]\.choices\[1\]\.image：/),
      expect.stringMatching(/^questions\[1\]\.choices\[2\]\.id：/),
      expect.stringMatching(/^questions\[2\]\.id：/),
    ]);
  });
});

// ─── §4.2 警告規則 ───────────────────────────────────────────

describe('警告', () => {
  it('所有選項都是正確的', () => {
    const questions = [question('q1', [choice('a', true), choice('b', true)])];
    expectSingleAt(warningsOf(quiz({ questions })), 'questions[0].choices');
  });

  it('選項文字超過 20 個字元（21 個才警告）', () => {
    const questions = [
      question('q1', [choice('a', true, { text: 'x'.repeat(20) }), choice('b', false, { text: 'y'.repeat(21) })]),
    ];
    expectSingleAt(warningsOf(quiz({ questions })), 'questions[0].choices[1].text');
  });

  it('中文字一個字算一個字元', () => {
    const questions = [question('q1', [choice('a', true, { text: '長'.repeat(20) }), choice('b')])];
    expect(warningsOf(quiz({ questions }))).toEqual([]);
  });

  it('題目文字超過 120 個字元', () => {
    const questions = [
      question('q1', [choice('a', true), choice('b')], { prompt: 'x'.repeat(120) }),
      question('q2', [choice('a', true), choice('b')], { prompt: 'x'.repeat(121) }),
    ];
    expectSingleAt(warningsOf(quiz({ questions })), 'questions[1].prompt');
  });

  it('圖片的 credit 是 null', () => {
    const images = { cat: { src: 'images/cat.webp', alt: 'A cat', credit: null } };
    expectSingleAt(warningsOf(quiz({ images })), 'images.cat.credit');
  });
});

// ─── 預設值合併 ──────────────────────────────────────────────

describe('resolveOptions', () => {
  it('沒有 options 時使用預設值', () => {
    expect(resolveOptions(undefined)).toEqual(DEFAULT_GAME_OPTIONS);
    expect(resolveOptions({})).toEqual(DEFAULT_GAME_OPTIONS);
  });

  it('題組的設定覆蓋預設值，其他維持預設', () => {
    expect(resolveOptions({ lives: 5, timerMode: 'countDown' })).toEqual({
      ...DEFAULT_GAME_OPTIONS,
      lives: 5,
      timerMode: 'countDown',
    });
  });

  it('預設值符合規格', () => {
    expect(DEFAULT_GAME_OPTIONS).toEqual({
      timerMode: 'countUp',
      countDownSeconds: 300,
      lives: 3,
      difficulty: 3,
      shuffleQuestions: true,
      showAnswersAtEnd: true,
    });
  });

  it('範例題組關閉題目洗牌', () => {
    const result = validateQuiz(sampleQuiz);
    if (!result.ok) throw new Error('範例題組應該通過驗證');
    expect(resolveOptions(result.quiz.options).shuffleQuestions).toBe(false);
  });
});
