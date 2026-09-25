import { describe, expect, it } from 'vitest';
import { DEFAULT_QUIZ_ID, parseUrlParams } from './urlParams';

function parse(search: string) {
  return parseUrlParams(new URLSearchParams(search));
}

describe('parseUrlParams', () => {
  it('沒有參數時使用預設值', () => {
    expect(parse('')).toEqual({
      ok: true,
      params: { quizId: DEFAULT_QUIZ_ID, seed: null, debug: false },
    });
  });

  it('讀取 quiz、seed、debug', () => {
    expect(parse('?quiz=my-quiz_2&seed=42&debug=1')).toEqual({
      ok: true,
      params: { quizId: 'my-quiz_2', seed: '42', debug: true },
    });
  });

  it('debug 只有 1 才開啟', () => {
    const result = parse('?debug=true');
    expect(result.ok && result.params.debug).toBe(false);
  });

  it.each(['../secret', 'a/b', 'a.b', ''])('拒絕不合法的 quiz：%j', (value) => {
    expect(parse(`?quiz=${encodeURIComponent(value)}`).ok).toBe(false);
  });
});
