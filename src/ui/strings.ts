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
} as const;
