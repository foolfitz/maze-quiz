import type { QuestionResult } from './types';

/** 分數 = 一次就答對的題數（§11.1） */
export function computeScore(results: readonly QuestionResult[]): number {
  return results.filter((result) => result.status === 'firstTry').length;
}
