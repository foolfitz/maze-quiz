# vendor

Kancil Quiz 平台兩個套件的副本，讓這個 repo 單獨 clone 也能安裝、測試與建置：

- `games-sdk.ts`：`@kancil-quiz/games-sdk`（遊戲模組介面），只有型別。
- `text.ts`：`@kancil-quiz/text`（正規化、答案比對、切字）。

單獨執行時，`vite.config.ts` 與 `tsconfig.json` 把這兩個套件名稱指向這裡。
放在 Kancil Quiz 的 `packages/games/maze-quiz` 時，照常使用平台 workspace 中的正本。

- 內容必須與正本完全相同，Kancil Quiz 有測試檢查。改了平台的 SDK 或 `text`，要把新版複製過來。
- 正本在 Kancil Quiz repo 的 `packages/games-sdk/src/index.ts`、`packages/text/src/index.ts`。
- 檔案中的 `docs/SPEC.md` 指的是 Kancil Quiz 的規格書。
- 這兩個套件之後會發布到 npm，屆時改依版本號引用，刪除這個目錄。
