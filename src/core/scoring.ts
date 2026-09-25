import type { GameOptions } from './quiz';
import type { QuestionResult } from './types';

/** 分數 = 一次就答對的題數（§11.1） */
export function computeScore(results: readonly QuestionResult[]): number {
  return results.filter((result) => result.status === 'firstTry').length;
}

// ─── 排行榜（§11.2）─────────────────────────────────────────

export interface LeaderboardEntry {
  readonly name: string; // 1–12 字元，前後空白去掉
  readonly score: number;
  readonly total: number;
  readonly elapsedMs: number;
  readonly livesLeft: number;
  readonly optionsKey: string; // 例如 "d3-l3-countUp"
  readonly playedAt: string; // ISO 8601
}

/** 決定成績能不能互相比較的設定：難度、命數、計時方式，倒數時再加上秒數 */
export type RankedOptions = Pick<GameOptions, 'difficulty' | 'lives' | 'timerMode' | 'countDownSeconds'>;

/**
 * 設定代號，例如 "d3-l3-countUp"、"d5-l1-countDown-300"。
 * 秒數只在倒數時有意義，其他計時方式不放進去，改了也不會把排行榜拆開。
 */
export function optionsKey(options: RankedOptions): string {
  const base = `d${options.difficulty}-l${options.lives}-${options.timerMode}`;
  return options.timerMode === 'countDown' ? `${base}-${options.countDownSeconds}` : base;
}

/**
 * 排序：分數高的在前，其次用時短的在前，再其次剩下的命多的在前。
 * 全部一樣時先玩的在前，後來追平的不會把先前的紀錄擠下去。
 */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return (
    b.score - a.score ||
    a.elapsedMs - b.elapsedMs ||
    b.livesLeft - a.livesLeft ||
    (a.playedAt < b.playedAt ? -1 : a.playedAt > b.playedAt ? 1 : 0)
  );
}

/** 某個設定的紀錄，由好到壞排好 */
export function entriesFor(entries: readonly LeaderboardEntry[], key: string): LeaderboardEntry[] {
  return entries.filter((entry) => entry.optionsKey === key).sort(compareEntries);
}

/**
 * 把新紀錄加進排行榜。每種設定各自保留前 maxEntries 名，互不排擠。
 * 回傳新的完整清單，以及新紀錄在同設定裡的名次（從 1 開始；沒進前幾名是 null）。
 */
export function addEntry(
  entries: readonly LeaderboardEntry[],
  entry: LeaderboardEntry,
  maxEntries: number,
): { readonly entries: LeaderboardEntry[]; readonly rank: number | null } {
  const ranked = entriesFor([...entries, entry], entry.optionsKey).slice(0, maxEntries);
  const index = ranked.indexOf(entry);
  const others = entries.filter((e) => e.optionsKey !== entry.optionsKey);
  return { entries: [...others, ...ranked], rank: index === -1 ? null : index + 1 };
}

/** 這個成績能不能進前 maxEntries 名；能的話才請玩家輸入名字 */
export function qualifies(
  entries: readonly LeaderboardEntry[],
  candidate: LeaderboardEntry,
  maxEntries: number,
): boolean {
  return addEntry(entries, candidate, maxEntries).rank !== null;
}

/** 名字去掉前後空白後，長度要在 1–maxLength 個字元之間（以 code point 計算）；不合格回傳 null */
export function normalizeName(raw: string, maxLength: number): string | null {
  const name = raw.trim();
  const length = [...name].length;
  return length >= 1 && length <= maxLength ? name : null;
}
