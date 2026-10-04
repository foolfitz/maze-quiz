# Maze Quiz 迷宮問答

在迷宮裡走進正確答案所在的園區，同時躲開敵人的問答小遊戲。桌機（鍵盤、滑鼠）與平板（觸控）都能玩。

這是 Kancil Quiz（給新住民語文老師的互動練習平台）的遊戲模組：平台把老師的題組轉成選擇題交給遊戲，遊戲回報學生的作答。這個 repo 也能單獨執行，附有示範頁。

**線上示範：<https://foolfitz.github.io/maze-quiz/>**

## 玩法

- 畫面下方是題目，迷宮邊緣的園區是選項。走進正確答案的園區就過關；一題一關，每一關都是新的迷宮。
- 走錯園區不扣命，但那個園區的門會關上；被敵人碰到會少一條命。
- 操作：
    - 鍵盤：方向鍵或 WASD；`Esc` 或 `P` 暫停。
    - 滑鼠、觸控：按在角色的哪一邊就往哪邊走，按住拖曳可以換方向。
    - 觸控方向鍵：暫停畫面中可以放左邊、右邊或不顯示。

## 示範頁

`demo/` 是一個陽春的宿主：開始按鈕（同時解鎖 iPad 的音訊）、掛載遊戲、結束後顯示答對幾題。
題目是平台匯出的罐頭題組，預設是印尼語第 1 冊第 3 課「Keluarga Saya 我的家人」：看插圖與中文，選出印尼語。

網址參數：

- `set`：罐頭題組，也就是 `demo/sets/` 底下的目錄名稱，預設 `id-1-3`。
- `seed`：0 到 4294967295 的整數，固定出題順序、選項與迷宮；沒給時每次隨機。
- `difficulty`（1–3，只差在敵人的速度）、`lives`（1–9）、`timer`（`none`、`countUp`、`countDown`）、`seconds`（倒數秒數，30–3600）：遊戲設定，沒給的照遊戲的預設值。
- `debug=1`：在遊戲下方顯示除錯資訊（FPS、種子、玩家位置、起點到各答案區的步數），並啟用快捷鍵 N（直接過關）、K（扣一條命）、I（切換無敵）。

例如 `?seed=42&difficulty=3&debug=1`。

### 罐頭題組

`demo/sets/<名稱>/` 就是平台「匯出 zip」解開後的內容：`set.json`、`media/`、`LICENSE.txt`。

- 要換課或加一課，就從平台匯出那一課，解開到新的目錄，再執行 `npm run check:fix`（把 `set.json` 排版成這個 repo 的格式）。
- 示範頁只支援詞彙組。題目轉換是平台規則的簡化版（`demo/rounds.ts`）：每題 4 個選項，干擾選項從同題組的其他詞抽。

## 開發

需要 Node.js 22 以上。工具鏈是 [Vite+](https://viteplus.dev/)（`vp`）。

```bash
npm install
npm run dev          # 示範頁；加上 -- --host，同一個 Wi-Fi 的平板也能連進來
npm test             # Vitest
npm run check        # 格式、lint 與型別檢查；npm run check:fix 自動修正
npm run build        # 示範頁建置成靜態網站，輸出到 dist/
```

- `src/`：遊戲模組。`src/index.ts` 匯出 `GameModule`，`src/meta.ts` 只有設定資訊（平台的老師端與伺服器只需要這些）。
- `tests/`：不碰 DOM 的進行狀態在 `src/session.ts`，用 Vitest 測試；`tests/demo/` 是示範頁的測試。
- `vendor/`：平台兩個套件的副本，見 [vendor/README.md](vendor/README.md)。
- 格式設定與 Kancil Quiz 相同（4 格縮排、單引號、每行 80 字），因為放在平台中時，平台的檢查也會涵蓋這個 repo。
- push 到 `master` 時，GitHub Actions 會檢查、測試與建置，都通過才把示範頁發布到 GitHub Pages（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)）。

### 在 Kancil Quiz 中

平台以 git submodule 把這個 repo 掛在 `packages/games/maze-quiz`。平時在這個 repo 修改、測試、commit，再到平台更新 submodule 指標。

遊戲模組的規則見平台的 `docs/SPEC.md` 第 7 節，重點如下：

- 遊戲不碰後端、不發出網路請求，資料由宿主透過 `GameContext` 提供，結果以事件回報。
- 遊戲不判定正式成績：回報學生選了什麼，由伺服器重新判定。
- 把文字拆成字塊時一律用 `@kancil-quiz/text` 的 `graphemes()`。
- `mount()` 的第三個參數（`MountHooks`）只給示範頁的除錯畫面用，平台不會傳。

## 歷史

這個 repo 原本是獨立的網頁版（標題畫面、排行榜、`quiz.json` 題組、Wikimedia Commons 的動物照片）。
2026-10 改寫成 Kancil Quiz 的遊戲模組後，那些功能由平台負責。
原本的規格與實作決定記錄在 git 歷史中的 `SPEC.md`、`DECISIONS.md`（commit `bf5fa64` 以前）。

## 授權

- 程式碼：[MIT](LICENSE)，包含 `vendor/` 中的副本。
- 字型：[Andika](https://software.sil.org/andika/)（SIL International），採 SIL Open Font License 1.1，見 [`fonts/OFL.txt`](fonts/OFL.txt)。
- 罐頭題組：Kancil Quiz 製作，採 CC BY 4.0，作者與出處見各題組的 `LICENSE.txt`。
    - 詞彙取自國教署《新住民語文學習教材》的課名與詞彙，各詞標有課本頁碼；不含課文、教材插圖與音檔。
    - 插圖由 AI 生成。
