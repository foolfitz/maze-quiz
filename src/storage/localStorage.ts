/** 取得 localStorage；隱私瀏覽或網站資料被封鎖時，光是讀取 window.localStorage 就可能丟錯，這時回傳 null */
export function getLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
