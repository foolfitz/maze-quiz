/** 介面文字（正體中文）。題目內容的驗證訊息在 core/quiz.ts。 */
export const STRINGS = {
  appName: '迷宮問答',

  // 載入
  loading: '載入中…',
  loadingPercent: (percent: number) => `載入中… ${percent}%`,

  // 錯誤畫面
  errorTitle: '題組有問題，沒辦法開始遊戲',
  errorFile: (url: string) => `檔案：${url}`,
  errorHint: '請依照上面的說明修正檔案，存檔後重新整理這個頁面。',

  // 標題畫面
  start: '開始',
  leaderboard: '排行榜',
  credits: '圖片來源',
  questionCount: (count: number) => `共 ${count} 題`,
  notImplemented: '這個功能還沒做好。',

  // 遊戲畫面
  questionNumber: (current: number, total: number) => `第 ${current} / ${total} 題`,

  // 載入失敗的原因
  invalidQuizParam: (value: string) =>
    `網址參數 quiz 的值「${value}」不正確：只能使用英文字母、數字、- 和 _。`,
  quizNotFound: (url: string, status: number) =>
    `找不到題組檔案 ${url}（HTTP ${status}）。請確認網址參數 quiz 有沒有打錯，` +
    `或檔案是否放在 public/quizzes/<題組代號>/quiz.json。`,
  quizFetchFailed: (url: string, reason: string) => `無法讀取題組檔案 ${url}：${reason}`,
  quizNotJson: (reason: string) =>
    `quiz.json 不是正確的 JSON 格式：${reason}。常見原因是多了或少了逗號、引號或括號。`,
  imageLoadFailed: (key: string, url: string) =>
    `images.${key}：圖片載入失敗（${url}），用到這張圖的地方會改用純文字顯示`,

  // 除錯覆蓋層（§12.6）
  debug: {
    title: '除錯資訊',
    seed: (seed: number) => `種子 ${seed}（網址加上 ?seed=${seed} 可重現）`,
    level: (levelNumber: number, levelSeed: number, attempt: number) =>
      `第 ${levelNumber} 關：levelSeed ${levelSeed}，第 ${attempt + 1} 次嘗試`,
    distances: '起點到各答案區的步數：',
    ratio: (ratio: string) => `最遠 ÷ 最近 = ${ratio}`,
    fallback: '⚠ 迷宮沒有完全符合條件，採用最接近的一張：',
    warnings: (count: number) => `題組警告（${count}）`,
    shortcuts: '快捷鍵　N：下一關',
    violation: {
      disconnected: (count: number) => `有 ${count} 格地板走不到`,
      badDoor: (zone: string) => `答案區「${zone}」的門不正確`,
      wideArea: (x: number, y: number) => `(${x}, ${y}) 有 2×2 的地板`,
      deadEnd: (x: number, y: number) => `(${x}, ${y}) 是死路`,
      unfair: (ratio: string, limit: number) => `距離差距 ${ratio} 超過上限 ${limit}`,
      zoneTooClose: (distance: number, limit: number) => `最近的答案區只有 ${distance} 步，少於 ${limit} 步`,
      notEnoughSpawns: (found: number, needed: number) => `敵人出生點只有 ${found} 個，需要 ${needed} 個`,
    },
  },
} as const;
