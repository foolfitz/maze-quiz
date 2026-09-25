import type { LeaderboardEntry } from '../core/scoring';

/** 排行榜需要的 localStorage 方法；測試時可以傳入簡單的替身物件 */
export type LeaderboardStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** 每個題組一個 key（§11.2） */
export function leaderboardKey(quizId: string): string {
  return `maze-quiz:leaderboard:${quizId}`;
}

const PROBE_KEY = 'maze-quiz:probe';

/**
 * 確認真的能讀寫。有些瀏覽器在隱私瀏覽時 localStorage 雖然存在，一寫入就丟錯；
 * 不能用時排行榜停用並說明原因，遊戲照常進行（§11.2）。
 */
export function isStorageUsable(storage: LeaderboardStorage | null): storage is LeaderboardStorage {
  if (storage === null) return false;
  try {
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** 讀取某個題組的排行榜；沒有資料、格式壞掉或讀不到時是空的 */
export function loadLeaderboard(storage: LeaderboardStorage, quizId: string): LeaderboardEntry[] {
  try {
    const text = storage.getItem(leaderboardKey(quizId));
    return text === null ? [] : parseLeaderboard(JSON.parse(text));
  } catch {
    return [];
  }
}

/** 寫入排行榜；成功回傳 true */
export function saveLeaderboard(
  storage: LeaderboardStorage,
  quizId: string,
  entries: readonly LeaderboardEntry[],
): boolean {
  try {
    storage.setItem(leaderboardKey(quizId), JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

type UnknownRecord = Readonly<Record<string, unknown>>;

/** 型別守衛：回傳 true 時，TypeScript 會把 value 的型別縮小成 UnknownRecord */
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 把存起來的 JSON 轉回紀錄。資料可能被手動改壞或是舊版格式，
 * 所以每一筆都重新檢查、重新組出物件，不合格的直接丟掉，不用 `as` 硬轉。
 */
export function parseLeaderboard(raw: unknown): LeaderboardEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item: unknown) => {
    if (!isRecord(item)) return [];
    const { name, score, total, elapsedMs, livesLeft, optionsKey, playedAt } = item;
    if (
      typeof name !== 'string' ||
      typeof score !== 'number' ||
      typeof total !== 'number' ||
      typeof elapsedMs !== 'number' ||
      typeof livesLeft !== 'number' ||
      typeof optionsKey !== 'string' ||
      typeof playedAt !== 'string' ||
      ![score, total, elapsedMs, livesLeft].every(Number.isFinite)
    ) {
      return [];
    }
    return [{ name, score, total, elapsedMs, livesLeft, optionsKey, playedAt }];
  });
}
