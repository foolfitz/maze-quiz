import { describe, expect, it } from 'vitest';
import { DEFAULT_QUIZ_ID, parseUrlParams } from './urlParams';

function parse(search: string) {
  return parseUrlParams(new URLSearchParams(search));
}

describe('parseUrlParams', () => {
  it('沒有參數時使用預設值', () => {
    expect(parse('')).toEqual({
      ok: true,
      params: { quizId: DEFAULT_QUIZ_ID, seed: null, debug: false, difficulty: null },
    });
  });

  it('讀取 quiz、seed、debug', () => {
    expect(parse('?quiz=my-quiz_2&seed=42&debug=1')).toEqual({
      ok: true,
      params: { quizId: 'my-quiz_2', seed: '42', debug: true, difficulty: null },
    });
  });

  it('debug 只有 1 才開啟', () => {
    const result = parse('?debug=true');
    expect(result.ok && result.params.debug).toBe(false);
  });

  it.each(['../secret', 'a/b', 'a.b', ''])('拒絕不合法的 quiz：%j', (value) => {
    expect(parse(`?quiz=${encodeURIComponent(value)}`).ok).toBe(false);
  });

  it.each([1, 2, 3, 4, 5])('讀取 difficulty=%i', (difficulty) => {
    const result = parse(`?difficulty=${difficulty}`);
    expect(result.ok && result.params.difficulty).toBe(difficulty);
  });

  it('difficulty 空白時照題組設定', () => {
    const result = parse('?difficulty=');
    expect(result.ok && result.params.difficulty).toBeNull();
  });

  it.each(['0', '6', '2.5', 'hard'])('拒絕不合法的 difficulty：%j', (value) => {
    const result = parse(`?difficulty=${value}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain(value);
  });
});
