# Maze Quiz 迷宮問答

在迷宮裡走進正確答案所在的園區，同時躲開敵人的問答小遊戲。桌機（鍵盤、滑鼠）與平板（觸控）都能玩。

這是 Kancil Quiz（給新住民語文老師的互動練習平台）的遊戲模組：平台把老師的題組轉成選擇題交給遊戲，遊戲回報學生的作答。這個 repo 也能單獨執行。

## 玩法

- 畫面下方是題目，迷宮邊緣的園區是選項。走進正確答案的園區就過關；一題一關，每一關都是新的迷宮。
- 走錯園區不扣命，但那個園區的門會關上；被敵人碰到會少一條命。
- 操作：
    - 鍵盤：方向鍵或 WASD；`Esc` 或 `P` 暫停。
    - 滑鼠、觸控：按在角色的哪一邊就往哪邊走，按住拖曳可以換方向。
    - 觸控方向鍵：暫停畫面中可以放左邊、右邊或不顯示。

## 開發

需要 Node.js 22 以上。工具鏈是 [Vite+](https://viteplus.dev/)（`vp`）。

```bash
npm install
npm test             # Vitest
npm run check        # 格式、lint 與型別檢查；npm run check:fix 自動修正
```

- `src/`：遊戲模組。`src/index.ts` 匯出 `GameModule`，`src/meta.ts` 只有設定資訊（平台的老師端與伺服器只需要這些）。
- `tests/`：不碰 DOM 的進行狀態在 `src/session.ts`，用 Vitest 測試。
- `vendor/`：平台兩個套件的副本，見 [vendor/README.md](vendor/README.md)。
- 格式設定與 Kancil Quiz 相同（4 格縮排、單引號、每行 80 字），因為放在平台中時，平台的檢查也會涵蓋這個 repo。

### 在 Kancil Quiz 中

平台以 git submodule 把這個 repo 掛在 `packages/games/maze-quiz`。平時在這個 repo 修改、測試、commit，再到平台更新 submodule 指標。

遊戲模組的規則見平台的 `docs/SPEC.md` 第 7 節，重點如下：

- 遊戲不碰後端、不發出網路請求，資料由宿主透過 `GameContext` 提供，結果以事件回報。
- 遊戲不判定正式成績：回報學生選了什麼，由伺服器重新判定。
- 把文字拆成字塊時一律用 `@kancil-quiz/text` 的 `graphemes()`。

## 歷史

這個 repo 原本是獨立的網頁版（標題畫面、排行榜、`quiz.json` 題組、Wikimedia Commons 的動物照片）。
2026-10 改寫成 Kancil Quiz 的遊戲模組後，那些功能由平台負責。
原本的規格與實作決定記錄在 git 歷史中的 `SPEC.md`、`DECISIONS.md`（commit `bf5fa64` 以前）。

## 授權

- 程式碼：[MIT](LICENSE)，包含 `vendor/` 中的副本。
- 字型：[Andika](https://software.sil.org/andika/)（SIL International），採 SIL Open Font License 1.1，見 [`fonts/OFL.txt`](fonts/OFL.txt)。
