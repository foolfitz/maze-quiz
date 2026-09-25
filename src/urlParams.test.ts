import { describe, expect, it } from 'vitest';
import { DEFAULT_QUIZ_ID, parseUrlParams } from './urlParams';

function parse(search: string) {
  return parseUrlParams(new URLSearchParams(search));
}

describe('parseUrlParams', () => {
  it('沒有參數時使用預設值', () => {
    expect(parse('')).toEqual({
      ok: true,
      params: { quizId: DEFAULT_QUIZ_ID, seed: null, debug: false, overrides: {} },
    });
  });

  it('讀取 quiz、seed、debug', () => {
    expect(parse('?quiz=my-quiz_2&seed=42&debug=1')).toEqual({
      ok: true,
      params: { quizId: 'my-quiz_2', seed: '42', debug: true, overrides: {} },
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
    expect(result.ok && result.params.overrides).toEqual({ difficulty });
  });

  it('difficulty 空白時照題組設定', () => {
    const result = parse('?difficulty=');
    expect(result.ok && result.params.overrides).toEqual({});
  });

  it.each(['0', '6', '2.5', 'hard'])('拒絕不合法的 difficulty：%j', (value) => {
    const result = parse(`?difficulty=${value}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain(value);
  });

  it('讀取 timer、seconds、lives', () => {
    const result = parse('?timer=countDown&seconds=30&lives=1');
    expect(result.ok && result.params.overrides).toEqual({ timerMode: 'countDown', countDownSeconds: 30, lives: 1 });
  });

  it.each([
    ['timer', 'countdown'],
    ['seconds', '29'],
    ['seconds', '3601'],
    ['seconds', '60.5'],
    ['lives', '0'],
    ['lives', '10'],
  ])('拒絕不合法的 %s：%j', (name, value) => {
    const result = parse(`?${name}=${value}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain(value);
  });

  it('多個參數都錯時一次列出', () => {
    const result = parse('?quiz=../x&lives=0&timer=x');
    expect(result.ok ? 0 : result.errors.length).toBe(3);
  });
});
