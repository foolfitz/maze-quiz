/**
 * 時間顯示成 m:ss（§5.2）。正計時無條件捨去，倒數無條件進位：
 * 倒數畫面上的 0:00 一出現就是真的時間到，不會停在 0:00 還能繼續玩。
 */
export function formatClock(ms: number, rounding: 'down' | 'up' = 'down'): string {
  const totalSeconds = Math.max(0, rounding === 'up' ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
