# Maze Quiz 迷宮問答

在迷宮裡走進正確答案所在的園區，同時躲開敵人的問答小遊戲。桌機（鍵盤、滑鼠）與平板（觸控）都能玩。

**線上遊玩：<https://foolfitz.github.io/maze-quiz/>**

## 玩法

- 畫面下方是題目，迷宮邊緣的園區是選項。走進正確答案的園區就過關；一題一關，每一關都是新的迷宮。
- 走錯園區不扣命，但那個園區的門會關上；被敵人碰到會少一條命。
- 操作：
  - 鍵盤：方向鍵或 WASD；`Esc` 或 `P` 暫停。
  - 滑鼠、觸控：按在角色的哪一邊就往哪邊走，按住拖曳可以換方向。
  - 觸控方向鍵：標題畫面的「進階選項」可以放左邊、右邊或不顯示。
- 標題畫面的「進階選項」還可以換語言（英文、中文）與難度（1–3，只差在敵人的速度）。
- 排行榜存在這台裝置的瀏覽器裡，不會上傳到任何地方。

## 自己出題

題組放在 `public/quizzes/<題組 id>/quiz.json`，格式見 [SPEC.md](SPEC.md) §4，範例是 [`public/quizzes/zoo-animals/quiz.json`](public/quizzes/zoo-animals/quiz.json)。放好之後用網址參數 `?quiz=<題組 id>` 開啟，例如 `?quiz=my-quiz`。題組有錯時，遊戲會列出哪裡錯、怎麼修正。

## 開發

需要 Node.js 24。

```bash
npm install
npm run dev          # 開發伺服器；加上 -- --host，同一個 Wi-Fi 的平板也能連進來
npm test             # Vitest
npm run typecheck
npm run build        # 輸出到 dist/，是純靜態檔案
```

- 規格見 [SPEC.md](SPEC.md)，實作時的決定與理由見 [DECISIONS.md](DECISIONS.md)。
- push 到 `master` 時，GitHub Actions 會跑測試與建置，都通過才發布到 GitHub Pages（[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)）。
- 網址加 `?debug=1` 顯示除錯資訊，加 `?seed=1` 固定迷宮與出題順序。

## 授權

- 程式碼：[MIT](LICENSE)。
- 動物照片：取自 Wikimedia Commons，採 CC BY-SA 3.0 或 4.0，經過縮小與轉檔；修改後的照片同樣依原授權釋出。每張照片的作者、授權與出處列在遊戲的「圖片來源」畫面，以及 `quiz.json` 的 `credit`。
- 字型：[Andika](https://software.sil.org/andika/)（SIL International），採 SIL Open Font License 1.1，見 [`public/fonts/OFL.txt`](public/fonts/OFL.txt)。
