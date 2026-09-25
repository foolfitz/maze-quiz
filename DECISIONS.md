# 實作決定

規格沒寫到、由實作時自行決定的事項。一條一行，附理由。

## M0 骨架

- 專案根目錄是 `QuizGames/maze-quiz/`，原本放在 `QuizGames/` 的 `SPEC.md` 與 `quiz.json` 移進來 —— 對應 §3 的目錄結構，上層 `QuizGames/` 之後可以放其他遊戲。
- TypeScript 用 create-vite 範本附的 `~6.0`（npm 上已有 7.0）—— 範本與 Vite 8 一起測過，先不冒險換成新的原生編譯器。
- `tsconfig.json` 明確寫出 `strict: true`（TS 6 雖然預設就開）並加上 `noUncheckedIndexedAccess`、`resolveJsonModule` —— 前兩者是 §2 要求，後者讓測試能直接 import 範例題組。
- `vite.config.ts` 設 `base: './'` —— 建置結果放在任何子資料夾都能開，不必知道部署路徑。
- `vite.config.ts` 設 `appType: 'mpa'` —— 關掉 SPA fallback；不然 `quiz` 參數打錯時伺服器會回傳 index.html，錯誤訊息變成看不懂的「JSON 格式錯誤」，而不是「找不到檔案」。
- 題組相關型別放在 `core/quiz.ts`，`core/types.ts` 放跨模組共用的型別（`Phase`、`Direction`）—— §3 寫 quiz.ts 負責「題組型別」。
- `TimerMode`、`Difficulty` 從常數陣列推導（`(typeof TIMER_MODES)[number]`）—— 型別和驗證用的合法值清單只寫一次，不會不同步；結果與 §4.1 的型別相同。
- `GameOptions` 的預設值放在 `config.ts` 的 `DEFAULT_GAME_OPTIONS` —— 屬於可調參數，和附錄 A 放在一起。
- 驗證訊息寫在 `core/quiz.ts`，不放 `ui/strings.ts` —— `core` 不依賴 `ui` 層；之後做多語系時再一起抽出。
- 除了 §4.2 列的規則，欄位缺少或型別不對也算錯誤 —— 否則無法保證驗證通過的物件真的符合 `QuizFile` 型別。
- 重複 id 與「沒有正確選項」直接檢查原始資料，不因同一題有其他錯誤而跳過 —— 一次列出所有問題，不必改一個、重新整理、再冒出下一個。
- 題組有錯誤時只顯示錯誤、不顯示警告 —— 錯誤畫面保持聚焦；修好之後警告會出現在 console。
- 選項有圖片時 `text` 可以是空字串，沒有圖片時不行 —— 純圖片選項是合理用法，但沒圖又沒字就無法作答。
- `alt` 是空字串只給警告 —— 不影響遊玩，但圖片是學習內容，應該有替代文字。
- `credit` 欄位整個缺少算錯誤，必須明確寫 `null` —— 對應型別 `ImageCredit | null`，避免漏寫而不自知。
- `options` 裡不認得的 key 給警告 —— 抓出拼錯的設定名稱（例如 `live`），否則會被默默忽略。
- `lives` 必須是整數；`countDownSeconds` 只檢查範圍，允許小數 —— 命不能是半條，秒數有小數不影響計時。
- 字數以 Unicode code point 計算（`[...text].length`）—— 中文字與 emoji 都算一個字元，和人的直覺一致。
- 網址參數 `quiz` 只接受英文字母、數字、`-`、`_`；空字串也算錯 —— 這個值會拼進檔案路徑，避免 `../` 之類的路徑跳脫。
- 新增 `src/loader.ts`（載入題組與預載圖片）與 `src/urlParams.ts`（網址參數）—— §3 沒列，屬於瀏覽器端 I/O，不能放 `core/`。
- 圖片預載在 M0 就做好；目前圖片檔還不存在，每張圖會記一筆「載入失敗」警告 —— 載入流程一次到位，M4 補上圖片後警告自然消失。
- M0 標題畫面的「開始」「排行榜」「圖片來源」按下後只顯示「這個功能還沒做好」—— 對應功能在後面的里程碑。
