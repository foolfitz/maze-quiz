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
  dpadSetting: '觸控方向鍵',
  dpadSides: { right: '右邊', left: '左邊', off: '不顯示' },
  buildInfo: (time: string) => `版本 ${time}`,

  // 遊戲畫面
  questionNumber: (current: number, total: number) => `第 ${current} / ${total} 題`,
  ready: '預備',
  lives: (count: number) => `剩下 ${count} 條命`,
  pause: '暫停',
  clockCountUp: (time: string) => `用時 ${time}`,
  clockCountDown: (time: string) => `剩下 ${time}`,

  // 暫停（§5.1）
  pausedTitle: '暫停',
  resume: '繼續',
  restart: '重新開始',

  // 沒有命了、時間到（§5.1）
  gameOver: '沒有命了',
  timeUp: '時間到',
  viewResults: '看成績',

  // 圖片來源畫面（§13.4）
  creditsIntro: '照片依照各自的授權使用，並經過縮小與轉檔。點作品名稱可以看原始檔案與完整說明。',
  creditAuthor: (author: string) => `作者：${author}`,
  creditLicense: '授權：',
  creditMissing: '尚未補上授權資訊',
  back: '返回',

  // 結算畫面（§11.1）
  resultsTitle: '成績',
  firstTryScore: (score: number, total: number) => `一次答對 ${score} / ${total} 題`,
  elapsed: (time: string) => `用時 ${time}`,
  livesLeft: (count: number) => `剩下 ${count} 條命`,
  playAgain: '再玩一次',
  reviewTitle: '逐題回顧',
  reviewNumber: (n: number) => `第 ${n} 題`,
  reviewStatus: {
    firstTry: '一次答對',
    retry: (wrongCount: number) => `答錯 ${wrongCount} 次後答對`,
    unanswered: '沒有作答',
  },
  reviewCorrect: '正確答案',
  reviewWrong: '走進過的錯誤答案',

  // 排行榜（§11.2）
  leaderboardTitle: '排行榜',
  leaderboardSettings: (settings: string) => `目前設定：${settings}`,
  settingsSummary: (difficulty: number, lives: number, timer: string) => `難度 ${difficulty}、${lives} 條命、${timer}`,
  timerModes: { none: '不計時', countUp: '正計時', countDown: (time: string) => `倒數 ${time}` },
  leaderboardEmpty: '還沒有紀錄，快來當第一名！',
  leaderboardUnavailable:
    '這個瀏覽器目前不能儲存資料（例如正在使用私密瀏覽，或儲存空間已滿），所以排行榜暫時不能用。遊戲照常可以玩。',
  leaderboardSaveFailed: '排行榜沒有存成功，可能是瀏覽器的儲存空間滿了。',
  leaderboardNotRanked: (max: number) => `這次沒有進入前 ${max} 名，再接再厲！`,
  leaderboardQualified: (max: number) => `進入前 ${max} 名了！輸入名字就能登上排行榜。`,
  nameLabel: '名字',
  nameHint: (max: number) => `1–${max} 個字`,
  nameInvalid: (max: number) => `請輸入 1 到 ${max} 個字的名字。`,
  saveName: '登上排行榜',
  leaderboardSaved: (rank: number) => `登上排行榜第 ${rank} 名！`,
  leaderboardColumns: { rank: '名次', name: '名字', score: '一次答對', time: '用時', lives: '剩下的命' },


  // 載入失敗的原因
  invalidQuizParam: (value: string) =>
    `網址參數 quiz 的值「${value}」不正確：只能使用英文字母、數字、- 和 _。`,
  invalidDifficultyParam: (value: string) =>
    `網址參數 difficulty 的值「${value}」不正確：只能是 1 到 5 的整數（1 最簡單）。`,
  invalidTimerParam: (value: string) =>
    `網址參數 timer 的值「${value}」不正確：只能是 none（不計時）、countUp（正計時）或 countDown（倒數）。`,
  invalidLivesParam: (value: string) => `網址參數 lives 的值「${value}」不正確：只能是 1 到 9 的整數。`,
  invalidSecondsParam: (value: string) => `網址參數 seconds 的值「${value}」不正確：只能是 30 到 3600 的整數（秒）。`,
  quizNotFound: (url: string, status: number) =>
    `找不到題組檔案 ${url}（HTTP ${status}）。請確認網址參數 quiz 有沒有打錯，` +
    `或檔案是否放在 public/quizzes/<題組代號>/quiz.json。`,
  quizFetchFailed: (url: string, reason: string) => `無法讀取題組檔案 ${url}：${reason}`,
  quizNotJson: (reason: string) =>
    `quiz.json 不是正確的 JSON 格式：${reason}。常見原因是多了或少了逗號、引號或括號。`,
  imageLoadFailed: (key: string, url: string) =>
    `images.${key}：圖片載入失敗（${url}），用到這張圖的地方會改用純文字顯示`,
  fontLoadFailed: (family: string, weight: number) =>
    `字型 ${family}（字重 ${weight}）載入失敗，題目與選項文字改用系統字型。` +
    `請確認字型檔還在（原始碼在 public/fonts/，建置結果在 fonts/）。`,

  // 除錯覆蓋層（§12.6）
  debug: {
    title: '除錯資訊',
    fps: (fps: string) => `FPS ${fps}`,
    player: (x: string, y: string, dir: string, pending: string) =>
      `玩家 (${x}, ${y})　方向 ${dir}　等待轉向 ${pending}`,
    seed: (seed: number) => `種子 ${seed}（網址加上 ?seed=${seed} 可重現）`,
    level: (levelNumber: number, levelSeed: number, attempt: number) =>
      `第 ${levelNumber} 關：levelSeed ${levelSeed}，第 ${attempt + 1} 次嘗試`,
    distances: '起點到各答案區的步數：',
    ratio: (ratio: string) => `最遠 ÷ 最近 = ${ratio}`,
    fallback: '⚠ 迷宮沒有完全符合條件，採用最接近的一張：',
    warnings: (count: number) => `題組警告（${count}）`,
    shortcuts: '快捷鍵　N：直接過關　K：扣一條命　I：切換無敵',
    difficulty: (difficulty: number, count: number, speed: number, smart: number) =>
      `難度 ${difficulty}：敵人 ${count} 隻，速度 ${speed}×，聰明程度 ${smart}`,
    invincible: (on: boolean) => `無敵（I）：${on ? '開' : '關'}`,
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
