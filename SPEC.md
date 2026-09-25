# Maze Quiz 迷宮問答：規格書

版本：0.2（2026-09-25；改了什麼見附錄 B）

## 0. 給 Claude Code 的工作規則

1. 先讀完整份規格再動手。依 §15 的里程碑順序實作，一次做一個。M0–M7 已全部完成；之後的試玩回饋與追加需求同樣一次做一件，做完照第 2 點停下來。
2. 每個里程碑完成時停下來：列出做了什麼、我要怎麼手動驗證，等我確認後再進下一個。
3. 規格沒寫到或有矛盾時，重要的事先問我；小事可以自己決定，但要記在 `DECISIONS.md`（一條一行，附理由）。
4. 識別字用英文，**程式註解用正體中文**。我正在學 TypeScript，請多用型別表達意圖（discriminated union、`readonly`、字面型別），少用 `any` 與型別斷言（`as`）。
5. 除了 §2 列出的套件，不要新增相依套件；真的需要時先問。

## 1. 目標與範圍

一個網頁版的迷宮追逐問答小遊戲：畫面下方顯示題目，玩家在迷宮裡走進正確答案所在的區域，同時躲開敵人。玩法參考 Wordwall 的 Maze Chase，但程式、美術與名稱全部自製，**不使用 Wordwall 的任何素材**。

必須做到：

- 桌機（鍵盤、滑鼠）與平板（觸控）都能順暢遊玩。
- 題組用 JSON 定義，題目與選項都可以附圖片。
- 每一關（一題就是一關）自動生成新的迷宮。
- 建置結果是純靜態檔案，執行時不需要網路（字型、圖片都打包在內）。

這一版不做：帳號、後端、線上排行榜、題組編輯器、多人、音效、LMS 整合（見 §16）。

## 2. 技術選型

| 項目 | 選擇 | 說明 |
|---|---|---|
| 語言 | TypeScript | `strict: true`、`noUncheckedIndexedAccess: true` |
| 建置 | Vite | 以 `vanilla-ts` 範本起始 |
| 遊戲畫面 | Canvas 2D | 不用遊戲引擎 |
| 選單與覆蓋層 | 原生 DOM + CSS | 不用 UI 框架 |
| 測試 | Vitest | `src/core/` 在 Node 環境測試 |
| 圖片處理 | sharp（devDependency） | 只在 `scripts/` 使用，不進遊戲本體 |
| 腳本執行 | tsx（devDependency） | 執行 `scripts/*.ts` |
| Node 型別 | @types/node（devDependency） | 讓 `scripts/` 與測試裡用到的 Node API 能做型別檢查 |

執行期相依套件：**無**。開發環境是 Ubuntu + Node.js LTS。

npm scripts：`dev`、`build`、`preview`、`test`、`typecheck`、`images`（§13）。

**瀏覽器相容性**：學校裡還有停在 iPadOS 15 的舊 iPad，遊戲要能在 Safari 15 上執行。

- 不用 Safari 15 還沒有的功能：`ctx.roundRect()`（圓角用 `arcTo` 畫）、`Array.prototype.at()`、`Object.hasOwn`（改用 `Object.prototype.hasOwnProperty.call`）、CSS `:has()`、`color-mix()`。
- ▶ ◀ ⏸ 這類會被 iPad 顯示成彩色 emoji 的符號改用 SVG；♥ 後面加 U+FE0E。
- 輸入框字級至少 16 px，否則 Safari 在輸入框取得焦點時會自動放大畫面。

## 3. 專案結構

```
maze-quiz/
├─ SPEC.md
├─ DECISIONS.md              實作時自行補充的決定
├─ index.html
├─ vite.config.ts            相對路徑（base: './'）、建置時間（§5.1）
├─ public/
│  ├─ fonts/                 Andika 字型與 OFL 授權檔
│  └─ quizzes/
│     └─ zoo-animals/
│        ├─ quiz.json        範例題組（隨本規格提供）
│        └─ images/          處理後的選項圖片（§13）
├─ scripts/
│  ├─ image-sources.json     每張圖選用的來源檔案（§13）
│  ├─ image-utils.ts         授權判斷、HTML 轉文字等純函式（有測試）
│  └─ process-images.ts      下載、處理圖片並寫回授權資訊
└─ src/
   ├─ main.ts                進入點：組裝各模組、依狀態更新畫面
   ├─ loop.ts                遊戲迴圈（§5.3）
   ├─ loader.ts              載入題組、字型與圖片
   ├─ urlParams.ts           網址參數（§4.3）
   ├─ config.ts              所有可調參數（附錄 A）
   ├─ style.css              DOM 的樣式與顏色變數
   ├─ core/                  純邏輯，不碰 DOM
   │  ├─ types.ts            Phase、Direction 等跨模組共用的型別
   │  ├─ quiz.ts             題組型別、驗證、預設值合併、語言版本
   │  ├─ rng.ts              可設種子的亂數產生器
   │  ├─ grid.ts             格子、座標、BFS
   │  ├─ maze.ts             迷宮與答案區生成
   │  ├─ player.ts           玩家移動
   │  ├─ enemies.ts          敵人 AI
   │  ├─ game.ts             狀態機與單步更新
   │  └─ scoring.ts          計分與排行榜排序
   ├─ render/
   │  ├─ renderer.ts         Canvas 繪圖、screenToTile()
   │  └─ theme.ts            視覺主題（§12.3）
   ├─ input/
   │  ├─ keyboard.ts
   │  ├─ pointer.ts
   │  ├─ dpad.ts             觸控方向鍵（§7.3）
   │  └─ zoomGuard.ts        防止誤觸縮放（§7.4）
   ├─ ui/                    DOM 畫面：標題、狀態列、題目列、暫停、結算、排行榜、圖片來源、除錯面板
   │  └─ strings.ts          介面文字（正體中文）
   └─ storage/
      ├─ localStorage.ts     取得 localStorage（無法存取時是 null）
      ├─ leaderboard.ts      排行榜的讀寫
      └─ preferences.ts      這台裝置記住的設定（§5.4）
```

測試檔與被測模組放在一起（`maze.test.ts` 與 `maze.ts` 同資料夾）。

**架構原則**：`src/core/` 不可以存取 `window`、`document`、Canvas 或 `localStorage`，所有隨機性都來自注入的 `Rng`。這樣迷宮生成、移動與判定都能用固定種子在 Node 裡重現與測試。`core` 的函式可以就地修改 `GameState`（不強制 immutable），但同樣的初始狀態、輸入與種子必須得到同樣的結果。

## 4. 題組資料格式

### 4.1 型別

```ts
/** 題組檔案（quiz.json）的最上層結構 */
export interface QuizFile {
  readonly schemaVersion: 1;
  readonly id: string;                 // 題組代號，也用於排行榜的儲存 key
  readonly title: string;              // 顯示在標題畫面
  readonly locale: string;             // 題目內容的語言（BCP 47），例如 "en"
  readonly languageName?: string;      // 語言選單上顯示的名稱，例如 "English"；有 translations 時必填
  readonly translations?: Readonly<Record<string, QuizTranslation>>; // key 是語言代碼（BCP 47），例如 "zh-Hant"
  readonly options?: Partial<GameOptions>;
  readonly images: Readonly<Record<string, ImageAsset>>;
  readonly questions: readonly Question[];
}

export interface Question {
  readonly id: string;
  readonly prompt: string;             // 題目文字，顯示在畫面下方
  readonly image?: string;             // 選填：images 的 key
  readonly choices: readonly Choice[]; // 2–6 個
}

export interface Choice {
  readonly id: string;
  readonly text: string;
  readonly image?: string;             // 選填：images 的 key
  readonly correct: boolean;           // 一題可以有多個正確選項
}

/** 同一組題目的另一個語言版本：只換文字 */
export interface QuizTranslation {
  readonly languageName: string;       // 語言選單上顯示的名稱，例如 "中文"
  readonly title: string;
  readonly questions: Readonly<Record<string, QuestionTranslation>>; // key 是題目 id，每一題都要有
}

export interface QuestionTranslation {
  readonly prompt: string;
  readonly choices: Readonly<Record<string, string>>; // key 是選項 id，值是選項文字；每個選項都要有
}

export interface ImageAsset {
  readonly src: string;                // 相對於 quiz.json 所在的資料夾
  readonly alt: string;
  readonly credit: ImageCredit | null; // null 表示尚未補上授權資訊
}

export interface ImageCredit {
  readonly title: string;              // 原始檔名或作品名稱
  readonly author: string;
  readonly license: string;            // 例如 "CC BY-SA 4.0"
  readonly licenseUrl: string;
  readonly sourceUrl: string;          // 檔案說明頁的網址，不是圖片直連
}

export type TimerMode = 'none' | 'countUp' | 'countDown';
export type Difficulty = 1 | 2 | 3;

export interface GameOptions {
  readonly timerMode: TimerMode;       // 預設 'countUp'
  readonly countDownSeconds: number;   // 預設 300，只在 countDown 使用
  readonly lives: number;              // 預設 3，範圍 1–9
  readonly difficulty: Difficulty;     // 預設 2；標題畫面可以改（§5.4）
  readonly shuffleQuestions: boolean;  // 預設 true
  readonly showAnswersAtEnd: boolean;  // 預設 true
}
```

圖片集中定義在 `images`，題目和選項只用 key 引用。同一種動物在不同題目重複出現時共用一張圖，授權資訊也只要寫一次。

**語言版本**：同一組題目的其他語言寫在同一個 quiz.json 的 `translations` 裡，只放標題、題目與選項的文字；對錯、圖片、選項數與 id 都沿用原文，不必寫兩次，也不會改了一邊忘了另一邊。圖片的 `alt` 不翻譯，沿用原文。玩家在標題畫面選語言（§5.4）；`localizeQuiz(quiz, locale)` 把題組換成指定語言後仍然回傳 `QuizFile`（`locale` 也換成那個語言），遊戲、結算與回顧都不必知道有翻譯。

### 4.2 驗證規則

`validateQuiz(raw: unknown)` 回傳：

```ts
type ValidationResult =
  | { ok: true; quiz: QuizFile; warnings: readonly string[] }
  | { ok: false; errors: readonly string[] };
```

驗證由手寫函式完成，不引入 schema 套件。錯誤訊息要指出位置與原因，例如 `questions[2].choices：至少需要 2 個選項`。

**錯誤**（無法開始遊戲）：

- `schemaVersion` 不是 `1`。
- `questions` 是空陣列。
- id 重複：題目 id 在題組內要唯一；選項 id 在同一題內要唯一。
- 選項少於 2 個或多於 6 個。
- 某題沒有任何正確選項。
- `image` 指向 `images` 裡不存在的 key。
- `options` 的值超出範圍：`lives` 1–9、`difficulty` 1–3、`countDownSeconds` 30–3600。
- 欄位缺少或型別不對（例如 `lives` 不是整數、`credit` 整個沒寫而不是 `null`）。
- `translations`：語言代碼不是合法的 BCP 47，或和原文的 `locale` 是同一個語言（大小寫不同也算）；有 `translations` 時原文沒寫 `languageName`；缺少某一題或某個選項的翻譯，或多出原文沒有的 id。

**警告**（可以玩，但在 console 與除錯覆蓋層顯示）：

- 某題所有選項都是正確的。
- 選項文字超過 20 個字元（答案區可能放不下）。
- 題目文字超過 120 個字元。
- 翻譯的文字也照上面兩條檢查。
- 圖片的 `credit` 是 `null`。
- `options` 裡有不認得的 key（例如把 `lives` 拼成 `live`）。

字數一律以 Unicode code point 計算，中文字與 emoji 都算一個字元。

### 4.3 載入與網址參數

| 參數 | 預設 | 說明 |
|---|---|---|
| `quiz` | `zoo-animals` | 載入 `public/quizzes/<quiz>/quiz.json`；只接受英文字母、數字、`-`、`_` |
| `seed` | 隨機 | 固定迷宮種子與出題順序，方便重現與除錯；沒指定時每一局重新產生 |
| `debug` | 關閉 | `debug=1` 開啟除錯覆蓋層（§12.6） |
| `difficulty` | — | 測試用：1–3，蓋過標題畫面選的難度 |
| `lives` | — | 測試用：1–9 |
| `timer` | — | 測試用：`none`、`countUp` 或 `countDown` |
| `seconds` | — | 測試用：倒數秒數，30–3600 |

測試用的參數是為了驗收時不必改 quiz.json；值不合法時顯示錯誤畫面。

`options` 的合併順序（後面的蓋過前面的）：程式預設值 → 題組 JSON 的 `options` → 這台裝置記住的難度（只有難度，§5.4）→ 測試用的網址參數。因為難度會記在裝置上，題組的 `options.difficulty` 只在這台裝置第一次開啟時有作用。

所有圖片在標題畫面出現前預先載入並顯示進度。某張圖載入失敗時，該選項改用純文字顯示並記一筆警告，不中斷遊戲。

### 4.4 範例題組

`public/quizzes/zoo-animals/quiz.json` 隨本規格提供：五題，正確答案依序是 elephant、zebra、giraffe、tiger、crocodile，選項數刻意從 3 到 6 不等，方便測試各種答案區配置。題目用英文描述動物特徵，因為所有選項都有圖片；如果題目寫中文名稱，學生看圖就能作答，不必讀懂英文。出題順序照預設值隨機打亂（沒有寫 `shuffleQuestions`）。

範例題組附有 `zh-Hant` 中文版（`languageName` 是「中文」，原文是「English」）。中文題目同樣描述特徵，避免用到答案的字（例如不寫「象鼻」），要讀懂題目才答得出來；選項用台灣的說法（「貓熊」「棕熊」「花豹」）。

## 5. 遊戲流程

### 5.1 狀態

```ts
/** 可以被暫停的遊戲中狀態 */
export type PlayPhase =
  | { kind: 'levelIntro'; remainingMs: number }
  | { kind: 'playing' }
  | { kind: 'wrongFeedback'; zoneId: string; remainingMs: number }
  | { kind: 'lifeLost'; remainingMs: number }
  | { kind: 'levelComplete'; remainingMs: number };

export type Phase =
  | { kind: 'loading'; progress: number }          // 0–1
  | { kind: 'error'; messages: readonly string[] }
  | { kind: 'title' }
  | PlayPhase
  | { kind: 'paused'; resumeTo: PlayPhase }
  | { kind: 'gameOver' }
  | { kind: 'timeUp' }
  | { kind: 'results' };
```

| 狀態 | 畫面與行為 | 離開條件 |
|---|---|---|
| `loading` | 載入題組、字型與圖片，顯示進度 | 驗證失敗 → `error`；完成 → `title` |
| `error` | 列出驗證錯誤 | 無（修正檔案後重新整理） |
| `title` | 題組標題、設定（§5.4）、「開始」按鈕，以及「排行榜」「圖片來源」；最下面顯示建置時間（例如「版本 2026-09-25 15:00」，試玩時確認裝置拿到新版） | 按「開始」→ `levelIntro` |
| `levelIntro` | 生成本關迷宮並畫出，題目顯示在下方，中央顯示「預備」約 1.5 秒；玩家與敵人都不動 | 時間到 → `playing` |
| `playing` | 主要遊戲 | 走進正確答案區 → `levelComplete`；走進錯誤答案區 → `wrongFeedback`；碰到敵人 → `lifeLost`；倒數歸零 → `timeUp` |
| `wrongFeedback` | 該答案區顯示 ✗，全場靜止約 0.6 秒 | 時間到：封住該區、玩家移到門外（§8）→ `playing` |
| `lifeLost` | 受傷動畫約 1 秒，全場靜止 | 還有命：重生（§10）→ `playing`；沒命 → `gameOver` |
| `levelComplete` | 該答案區顯示 ✓ 約 0.8 秒 | 還有題目 → `levelIntro`；題目做完 → `results` |
| `paused` | 半透明覆蓋層，「繼續」「重新開始」按鈕；畫面停格 | 「繼續」或再按一次 `Esc`／`P` → 回到 `resumeTo`；「重新開始」→ 新的一局，從第 1 題的 `levelIntro` 開始 |
| `gameOver` | 「沒有命了」與「看成績」按鈕 | → `results` |
| `timeUp` | 「時間到」與「看成績」按鈕 | → `results` |
| `results` | 成績、逐題回顧、輸入名字（§11） | 「再玩一次」→ `title` |

進入 `paused` 的方式：暫停按鈕、`Esc` 或 `P` 鍵，以及頁面被隱藏時（`visibilitychange`）自動暫停。只有 `PlayPhase` 可以被暫停。

### 5.2 計時

- `elapsedMs` 只在 `playing`、`wrongFeedback`、`lifeLost` 累加；`levelIntro`、`levelComplete`、`paused` 不計。
- `countUp`：顯示 `elapsedMs`。
- `countDown`：顯示 `countDownSeconds × 1000 − elapsedMs`（最小為 0），歸零時進入 `timeUp`。
- `none`：不顯示時間，但內部照樣累計（排行榜排序會用到）。
- 顯示格式 `m:ss`。

### 5.3 遊戲迴圈

以 `requestAnimationFrame` 驅動，邏輯以固定 60 Hz 步進（accumulator 模式），繪圖每幀一次。單幀 dt 上限 250 ms，避免切回分頁時一次補跑太多步。

### 5.4 標題畫面的設定

標題畫面有三個設定，選的值記在這台裝置的 `localStorage`：

| 設定 | 選項 | 沒選過時 | 儲存的 key |
|---|---|---|---|
| 語言 | 題組原文與各個翻譯（§4.1）；只有一種語言時不顯示 | 原文 | `maze-quiz:language:<quizId>`（每個題組分開記） |
| 難度 | 1、2、3 | 題組的 `options.difficulty`，沒寫就是 2 | `maze-quiz:difficulty`（所有題組共用） |
| 觸控方向鍵 | 右邊、左邊、不顯示（§7.3） | 有觸控螢幕（`any-pointer: coarse`）時放右邊，否則不顯示 | `maze-quiz:dpad` |

- 設定排成兩欄的表格（左邊名稱、右邊選項），選項群組用 `role="radiogroup"`；螢幕寬度小於 30rem 時名稱改放在選項上面。
- 換語言時，題組的標題、題目、選項文字與分頁標題都換成那個語言。
- `localStorage` 無法使用時照樣用上表的預設值，遊戲照常進行。

## 6. 迷宮生成

### 6.1 座標系統

- 迷宮是 `width × height` 的格子（tile），每格不是牆就是地板。x 向右、y 向下，(0, 0) 在左上角。最外圈一定是牆。
- 預設 `width = 25`、`height = 15`，兩者都必須是奇數。
- 玩家與敵人的位置用浮點數格座標，**整數值代表格子中心**。例如 `{ x: 3, y: 5 }` 就是第 (3, 5) 格的正中央。
- 每關的種子由基礎種子衍生：`levelSeed = hash(seed, levelIndex, attempt)`。

### 6.2 答案區

每個答案區是一個「園區」：內部 3×3 格地板，外圍一圈牆，牆上只開一個門。門外相鄰的那一格叫 `outside`，是走廊的一部分。

選項數 k 決定使用哪些位置。位置都在迷宮邊緣，由 `width`、`height` 算出並對齊奇數格點：

| k | 位置 |
|---|---|
| 2 | 左中、右中 |
| 3 | 左上、右上、下中 |
| 4 | 四個角落 |
| 5 | 四個角落、上中 |
| 6 | 四個角落、左中、右中 |

- 門開在朝向迷宮中央的那一側；角落的園區隨機選水平或垂直其中一側。
- 每一關都把選項隨機分配到位置上。這和 `shuffleQuestions` 無關，一律打亂。
- 園區內部 3×3 對齊奇數格點時，剛好佔 2×2 個迷宮 cell，不會跟走廊結構衝突。

### 6.3 生成步驟（建議做法）

1. 全部填牆。
2. 依 §6.2 挖出園區（內部地板與門），記下每個園區的 `rect`、`door`、`outside`。
3. 在其餘區域以 recursive backtracker（DFS）在奇數格點上挖出完美迷宮，確保每個 `outside` 都連進去。
4. 移除死路：對每個死路格（三面是牆），打通一面牆接到相鄰走廊。比例由 `deadEndRemoval` 決定，預設 1.0，也就是全部移除。不可以打通外框或園區的牆。死路會讓玩家被敵人堵死，所以預設不留。
5. 起點：最接近迷宮正中央的地板格。
6. 公平性調整：起點到各 `outside` 的距離不符合 §6.4 時，反覆試著打通或封住一面牆（兩個 cell 之間），挑讓距離差距最小的一步，直到符合為止。不可以產生死路或讓走廊斷開，也不動外框、園區外圍與「離中央不比起點遠」的格子。只靠換 `attempt` 重新生成時，5 個選項的關卡幾乎都不合格（「上中」的答案區離中央特別近）。
7. 敵人出生點：與起點 BFS 距離至少 `spawnMinDistance`（預設 8）的路口格（有三條以上通路），彼此不重複，也不選門外那一格。數量一律是難度表裡最多的 `enemyCount`（目前是 2），依難度取前幾個，所以同一個種子在不同難度下是同一張迷宮。

### 6.4 驗證條件

不符合就換 `attempt` 重新生成，最多 `maxAttempts`（預設 50）次；全部失敗時，採用最接近條件的一張，並在除錯覆蓋層提示。

- 所有地板格彼此連通。
- 每個園區只有一個門，門外的 `outside` 是走廊。
- 園區以外沒有 2×2 的地板區塊（走廊都是一格寬）。
- 起點到各個 `outside` 的 BFS 距離，最遠除以最近不超過 `fairnessMaxRatio`（預設 1.35），避免答案位置有遠近差異而暗示答案或造成不公平。
- 起點到任何 `outside` 的距離至少 `minStartToZone`（預設 6）。
- `deadEndRemoval = 1.0` 時，園區以外沒有死路。判斷死路時門不算通路，所以門外那一格也要接兩條以上走廊（答錯封門後玩家會被放在門外）。
- 敵人出生點的數量足夠。

## 7. 玩家移動與操作

### 7.1 基本規則

- 玩家沿走廊中央、以固定速度移動（預設每秒 4.5 格）。
- 玩家有「目前方向」`dir: Direction | null`。給定方向後持續前進；前方是牆時，停在該格中心，`dir` 變回 `null`。
- **不會自動轉彎**：走到 L 形轉角時停在轉角，必須再下一次指令才會轉；也不會沿著走廊自動拐彎。
- 每一步移動都要檢查是否跨過格子中心，速度快時也不能跳過中心點或穿牆。

```ts
export type Direction = 'up' | 'down' | 'left' | 'right';
```

### 7.2 轉向與寬限時間

收到方向指令 `d` 時：

1. `d` 與目前方向相反：立刻迴轉。
2. 玩家停著（`dir === null`）：`d` 方向可以走就出發；是牆就忽略，並給一個小小的碰壁回饋（角色輕微抖動）。
3. `d` 與目前方向垂直，而且玩家距離某個格子中心不超過 `turnTolerance`（預設 0.45 格）、那一格往 `d` 可以走：吸附到格子中心並轉向。
4. 以上都不成立：把 `d` 暫存為 `pendingDir`，**只保留 `inputGraceMs`（預設 300 ms）**。這段時間內一經過可以轉向的格子中心就轉，過期就丟掉。

與目前方向相同的指令直接忽略；暫存期間在牆前停下時，`pendingDir` 一併清掉。

第 4 點是為了讓觸控操作不必精準到毫秒，但時間很短，**不是**「記住方向、到下一個路口自動轉彎」。團隊在平板試玩後，已經從原本的 0.3 格、150 ms 放寬到上面的值。之後再調整時要守住一個條件：以玩家速度在 `inputGraceMs` 內走的距離（300 ms 是 1.35 格），必須小於「剛過路口、超出吸附範圍」到下一個路口的距離（2 − `turnTolerance` = 1.55 格），否則就變成自動轉彎。

### 7.3 輸入來源

**鍵盤**：方向鍵與 WASD，`keydown` 時送出一次方向，忽略按住時的自動重複。`Esc` 或 `P` 暫停。

**指標**（滑鼠、觸控、觸控筆一律用 Pointer Events）：

- 按下（`pointerdown`）時，計算按點相對於**玩家角色中心**的向量，取絕對值較大的軸決定方向。例如點在角色的右上方、但偏右比偏上多，就是往右。
- 按點距離角色中心小於 `pointerDeadZoneTiles`（預設 0.6 格）時忽略。
- 手指按住拖曳時，每當算出的方向改變就再送一次，玩家不用放開手指就能換方向。
- `pointer.ts` 透過 renderer 提供的 `screenToTile()` 把螢幕座標轉成格座標後再計算，所以死區以「格」為單位，和螢幕大小無關。
- 指標輸入綁在整個迷宮舞台（含迷宮外的留白），上方狀態列不算；直向畫面上下留白很大，按在迷宮下方往下走比較直覺。
- 同一時間只追蹤一根手指，其他手指忽略。

**觸控方向鍵**（試玩後加上）：

- 放在題目列裡，可以放右邊、左邊或不顯示（§5.4）。迷宮四個角都是答案區，疊在迷宮上會蓋住選項。
- 整組當成一個搖桿：依按點相對於方向鍵中心、取偏得比較多的那一軸決定方向；手指不放開滑到別的方向會再送一次；按住不放不會重複送出。和鍵盤、指標一樣，不會變成自動轉彎。
- 箭頭用 SVG 畫（§2 相容性）；整組設 `aria-hidden`，因為鍵盤的方向鍵本來就能操作。

**畫面回饋**：角色身上畫出目前方向的小箭頭；有 `pendingDir` 時用虛線箭頭表示「等待轉向」；觸控點顯示短暫的漣漪（滑鼠點擊也有，按在迷宮外的留白也看得到）。

### 7.4 平板必要設定

- 遊戲畫面（狀態列、迷宮舞台、題目列、方向鍵）設 `touch-action: none`，手指一按下就取消 `touchstart` 的預設動作，一次擋掉捲動、兩指縮放、點兩下放大、長按選單與文字選取。按鈕除外，要保留 click。迷宮與方向鍵用 Pointer Events，它在 touch 事件之前送出，不受影響。
- 整頁設 `touch-action: pan-x pan-y`，viewport 設 `maximum-scale=1.0, user-scalable=no`，並攔下 Safari 的 `gesturestart`／`gesturechange`，以及兩根以上手指的 `touchstart`／`touchmove`。iPad 的 Safari 不理 viewport 的設定，只能靠事件攔截。
- 標題、結算、圖片來源這些要能捲動的畫面不能取消 `touchstart`，改成取消「點兩下」第二下的 `touchend`（兩下間隔 400 ms、距離 60 px 以內；移動超過 12 px 算滑動）；輸入框裡不擋，才能點兩下選字。
- 畫面已經被放大（`visualViewport.scale` 大於 1.01）時，上面這些防護全部暫停，讓使用者自己縮回來；縮回來之後自動恢復。
- 需要放大畫面的使用者可以用系統的放大鏡功能。
- 所有按鈕的觸控範圍至少 44×44 px。
- 開發時用 `npm run dev -- --host`，同一個 Wi-Fi 下的平板就能直接開啟測試。

## 8. 答案區與判定

- **觸發**：玩家中心進入園區內部任一格時判定。走到門上不算。
- **答對**：→ `levelComplete`。題目有多個正確選項時，走進任何一個都算答對。
- **答錯**：→ `wrongFeedback`，結束後：
  - 門變成牆，畫成關上的柵門；園區變暗並保留 ✗。
  - 玩家移到該園區的 `outside`，`dir = null`。
  - **不扣命**，但記錄這題答錯一次（§11）。
- 敵人永遠把園區內部與門視為牆。
- 園區內顯示選項圖片（等比縮放、不裁切）與文字；沒有圖片就只顯示文字並放大字級。文字單行，放不下時縮小字級，最小 12 px；縮到 12 px 還放不下時截斷並加「…」（以 code point 為單位刪字）。

## 9. 敵人

- 數量、速度與聰明程度由難度決定（附錄 A）。速度以玩家速度的比例表示。目前三級難度只差在速度，都是 2 隻、`smartRatio` 0.65，所以第 3 隻（`ambusher`）不會出現；程式與測試保留，難度表改回 3 隻時就會出現。
- 三種行為，依序分配給第 1、2、3 隻：
  - `chaser`：目標是玩家所在的格子。
  - `wanderer`：目標是隨機的一個地板格，抵達後換下一個。
  - `ambusher`：目標是玩家前方 `ambushLookahead`（預設 4）格，沿玩家目前方向計算、碰到牆就停在牆前；玩家停著時等同 `chaser`。
- **決策時機**：敵人抵達格子中心時，列出所有可以走、而且不是回頭的方向。只有一個就直接走；兩個以上才做決策。只有在死路時可以回頭。
- **決策方式**：以 `smartRatio` 的機率選「到目標 BFS 距離最短」的方向，否則隨機選一個。
- 每關開始與玩家重生後，敵人先等待 `enemyReleaseMs`（預設 1.5 秒）才開始移動。
- 三種敵人除了顏色不同，外形也要不同，讓色覺辨識障礙的玩家也能分辨。
- 地圖只有幾百格，每次決策直接跑一次 BFS 即可，不需要最佳化。

## 10. 生命與受傷

- 玩家與任一敵人的中心距離小於 `collisionDistance`（預設 0.7 格），而且玩家不在無敵狀態 → `lifeLost`，生命減一。
- `lifeLost` 結束後若還有命：
  - 玩家回到起點，`dir = null`。
  - 所有敵人回到出生點，重新等待 `enemyReleaseMs`。
  - 玩家無敵 `invulnerableMs`（預設 1.5 秒），期間角色閃爍。
  - 已封住的園區維持封住。
- 命用完 → `gameOver`。目前這題與之後的題目都記為未作答。

## 11. 計分、結算與排行榜

### 11.1 逐題結果

```ts
export type QuestionStatus = 'firstTry' | 'retry' | 'unanswered';

export interface QuestionResult {
  readonly questionId: string;
  readonly status: QuestionStatus;
  readonly wrongChoiceIds: readonly string[]; // 依答錯的先後順序
}
```

- **分數** = `status === 'firstTry'` 的題數。
- 結算畫面顯示「一次答對 4 / 5 題」、用時、剩餘生命。
- `showAnswersAtEnd` 為 `true` 時，逐題列出題目、正確答案（圖片與文字），以及答錯時走進過的選項；為 `false` 時只顯示分數。

### 11.2 排行榜

```ts
export interface LeaderboardEntry {
  readonly name: string;        // 1–12 字元，前後空白去掉
  readonly score: number;
  readonly total: number;
  readonly elapsedMs: number;
  readonly livesLeft: number;
  readonly optionsKey: string;  // 例如 "d2-l3-countUp"
  readonly playedAt: string;    // ISO 8601
}
```

- 存在 `localStorage`，key 為 `maze-quiz:leaderboard:<quizId>`；每種設定（`optionsKey`）各自保留前 10 名，互不排擠。
- 排序：`score` 由高到低，其次 `elapsedMs` 由短到長，再其次 `livesLeft` 由多到少；全部一樣時先玩的在前。
- 只顯示 `optionsKey` 與目前設定相同的紀錄，不同設定的成績不互相比較。`optionsKey` 的格式：
  - 基本是難度、命數與計時方式，例如 `d2-l3-countUp`。
  - 倒數時加上秒數，例如 `d2-l3-countDown-300`；其他計時方式不因秒數不同而拆開排行榜。
  - 玩翻譯版本時最後加上語言代碼，例如 `d2-l3-countUp-zh-Hant`；原文不加，加入語言選項之前的紀錄照樣對得上。
- 能進前 10 名才顯示輸入名字的欄位。
- `localStorage` 無法使用時（例如隱私瀏覽），排行榜停用並說明原因，遊戲照常進行。

## 12. 畫面與視覺

### 12.1 版面

```
┌────────────────────────────────────────────────────┐
│ 第 2 / 5 題                    ♥ ♥ ♥   1:23    ⏸  │  狀態列
│ ┌────────────────────────────────────────────────┐ │
│ │ ┌───┐                                    ┌───┐ │ │
│ │ │ A │                                    │ B │ │ │
│ │ └───┘                                    └───┘ │ │
│ │ ┌───┐               ●                    ┌───┐ │ │  迷宮
│ │ │ F │                                    │ C │ │ │
│ │ └───┘                                    └───┘ │ │
│ │ ┌───┐                                    ┌───┐ │ │
│ │ │ E │                                    │ D │ │ │
│ │ └───┘                                    └───┘ │ │
│ └────────────────────────────────────────────────┘ │
│  I am the tallest animal in the world.              │  題目列
│  I have a very long neck.                           │
└────────────────────────────────────────────────────┘
```

- 上方狀態列：左邊是題號，右邊是生命、時間與暫停按鈕。
- 中間是迷宮，置中。
- 下方題目列：題目文字靠左對齊，最多兩行，放不下時縮小字級（最小 14 px；再放不下就換到第三行，不截斷題目）；題目有圖片時，圖片放在文字左側。觸控方向鍵放在題目列的右端或左端（§7.3）。
- 直向畫面也可以玩：迷宮縮小、上下留白，不強制旋轉。

### 12.2 縮放

- 格子邊長 = `floor(min(可用寬度 / width, 可用高度 / height))` px，視窗大小或方向改變時重算。
- Canvas 依 `devicePixelRatio` 提高內部解析度，避免在平板上模糊。

### 12.3 視覺方向：動物園步道

預設主題以動物園步道為意象：牆是樹籬，走廊是沙土步道，答案區是一個個園區，答錯時園區的柵門關上。主題的顏色與樣式集中在 `theme.ts`，之後可以新增其他主題。

| Token | 色碼 | 用途 |
|---|---|---|
| `hedge` | `#2F5E3B` | 牆（樹籬） |
| `path` | `#EAD9A6` | 走廊（步道） |
| `ink` | `#1F2A24` | 文字 |
| `keeper` | `#1C6FD1` | 玩家 |
| `correct` | `#2E9E4F` | ✓ 與答對提示 |
| `wrong` | `#C4402F` | ✗ 與關上的柵門 |

敵人顏色：`#E03131`、`#9C36B5`、`#E8590C`（外形也要不同，見 §9）。

**設計原則**：畫面上的視覺重點只有一個，就是答案區裡的圖片卡。它是學習內容本身，要大、清楚、底色乾淨（白色卡片）。牆、步道與狀態列都保持安靜，不加裝飾性花紋或漸層。

### 12.4 字型

- 題目與選項文字：**Andika**（SIL 為初學閱讀者設計的字型，字母形狀清楚好辨認，採 SIL Open Font License）。字型檔與授權檔放在 `public/fonts/`，不從外部 CDN 載入。
  - 使用 SIL 發布的 7.000 版，只放一般與粗體兩個 woff2 與 `OFL.txt`（題目用一般字重，選項與標題用粗體）。
  - 字型檔原封不動使用，不做子集化：Andika 有保留字型名稱，依 OFL 刪減字元算修改，改過就不能再叫 Andika。
  - 字型在 `loading` 階段用 `document.fonts.load()` 先下載好，算進進度條（canvas 上的選項文字畫在快取的圖層裡，字型晚到就會一直是後備字型）；下載失敗時記一筆警告、改用後備字型，不中斷遊戲。
- 介面中文：`"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif`。
- Andika 不含中文字，中文會自動使用後備字型。

### 12.5 動態與無障礙

- 動態只用來回應玩家的動作：觸控漣漪、✓ 與 ✗、受傷閃爍、碰壁抖動。沒有裝飾性的持續動畫。
- `prefers-reduced-motion` 時：關閉漣漪與抖動；無敵期間改用半透明，不閃爍。
- 對錯不能只靠顏色表示，一律搭配 ✓ 或 ✗ 符號。
- 覆蓋層的按鈕要有看得見的鍵盤焦點樣式。

### 12.6 除錯覆蓋層（`?debug=1`）

- 顯示格線、起點到各格的 BFS 距離、敵人出生點與目標格、各園區的對錯、目前種子、FPS、玩家狀態（位置、方向、等待轉向）、目前難度，以及題組驗證與圖片、字型載入的警告。
- 快捷鍵：`N` 直接過關、`K` 扣一條命、`I` 切換無敵。

### 12.7 介面文字

介面文字集中在 `src/ui/strings.ts`（正體中文），方便之後做多語系。題組內容的語言由 `translations` 處理（§4.1）；介面文字目前只有正體中文，不跟著題組的語言換。用詞簡單、直接說明按下會發生什麼：「開始」「繼續」「重新開始」「再玩一次」「看成績」「排行榜」「圖片來源」。錯誤訊息要說清楚哪裡錯、怎麼修正。

## 13. 圖片取得任務

`quiz.json` 的 `images` 列了 20 種動物。請依下列規則找圖、處理，並補上授權資訊。（M4 已完成：20 張圖與 `credit` 都已補上，挑圖的取捨記在 DECISIONS.md 的 M4 節。）

### 13.1 來源與授權

- 優先使用 Wikimedia Commons，透過 MediaWiki API 查詢；授權與作者從 `imageinfo` 的 `extmetadata` 讀取。找不到合適的再用 Openverse。
- 呼叫 Wikimedia API 時要帶上可識別的 `User-Agent`（Wikimedia 的使用政策要求）。
- **只接受**：CC0、Public Domain、CC BY、CC BY-SA（任何版本）。
- **不接受**：含 NC 或 ND 條款、授權不明、「合理使用」。無法確認授權的圖一律不用。
- 下載時被防機器人機制擋住（例如 HTTP 429 限流）時，照 `Retry-After` 等待；要等太久就先擱置、回報我，不要硬闖。

### 13.2 挑選標準

- 全部使用照片，風格一致，不要照片和插畫混用。
- 單一動物、主體夠大、背景單純。
- **全身入鏡**，而且題目提到的特徵要清楚可見。
- 圖片本身不能造成選項之間的混淆，例如馬不要選有斑點或條紋的。

| id | 動物 | 挑選要求 |
|---|---|---|
| `elephant` | 大象 | 側面全身，象鼻清楚 |
| `hippo` | 河馬 | 全身或大部分身體露出水面，看得出是河馬 |
| `rhino` | 犀牛 | 全身，角清楚 |
| `bear` | 棕熊 | 全身 |
| `zebra` | 斑馬 | 側面全身，條紋清楚 |
| `horse` | 馬 | 全身，單色毛皮 |
| `panda` | 大貓熊 | 全身 |
| `penguin` | 企鵝 | 全身站立 |
| `giraffe` | 長頸鹿 | 全身含整段脖子 |
| `camel` | 駱駝 | 全身 |
| `ostrich` | 鴕鳥 | 全身含整段脖子 |
| `tiger` | 老虎 | 全身，橘底黑紋清楚，不要白老虎 |
| `lion` | 獅子 | 公獅全身，鬃毛明顯 |
| `leopard` | 花豹 | 全身，斑點清楚 |
| `cheetah` | 獵豹 | 全身，臉上的淚痕紋可見更好 |
| `fox` | 赤狐 | 全身，毛色偏橘 |
| `crocodile` | 鱷魚 | 側面，看得到長吻與牙齒；要鱷科（crocodile），不要短吻鱷（alligator） |
| `turtle` | 烏龜 | 全身，淡水龜或陸龜 |
| `frog` | 青蛙 | 全身 |
| `snake` | 蛇 | 全身 |

### 13.3 處理流程

1. 替每個 id 挑好來源檔案，記在 `scripts/image-sources.json`（例如 `{ "elephant": "File:African_Bush_Elephant.jpg" }`）。
2. `scripts/process-images.ts`（`npm run images` 執行）讀取這份清單，然後：
   - 透過 API 取得授權資訊，不在 §13.1 允許清單內的直接報錯停止；
   - 下載 1280 px 的縮圖到 `scripts/.cache/`（加進 `.gitignore`；已經下載過就跳過），每張間隔 3 秒。不下載原始檔：原始檔每張 4–21 MB，很快就被限流，而輸出只要 512 px；被限流時 `Retry-After` 超過 120 秒就停下並說明，下次從快取接續；
   - 長邊縮到 512 px、保持比例、**不裁切**（避免裁掉長頸鹿的脖子或大象的鼻子），輸出 WebP，品質 80，存到 `public/quizzes/zoo-animals/images/<id>.webp`；
   - 把授權資訊寫回 `quiz.json` 的 `credit`（只改 `src` 與 `credit`，寫入前先用 `validateQuiz` 檢查）。
3. 依實際選用的圖片內容更新每張圖的 `alt`。`alt` 手動維護，腳本不會動它。

### 13.4 完成後

- 列一張表給我檢查：id、來源檔案、作者、授權。
- 遊戲的「圖片來源」畫面從 `quiz.json` 的 `credit` 自動產生清單（CC BY 與 CC BY-SA 都要求標示作者與授權）：縮圖、作品名稱（連到檔案說明頁）、作者、授權（連到授權條款），開頭註明照片經過縮小與轉檔。

## 14. 測試

`src/core/` 的每個模組都要有 Vitest 測試，至少涵蓋：

| 模組 | 測試重點 |
|---|---|
| `quiz` | 範例題組通過驗證；§4.2 每一條錯誤規則都有對應測試，錯誤訊息指出正確位置；預設值合併；翻譯的驗證、`localizeQuiz` 與 `quizLanguages` |
| `rng` | 同一種子產生同樣的序列 |
| `maze` | 種子 1–200 搭配 k = 2–6：§6.4 條件全部成立，或正確回報「採用最接近的一張」；同種子生成結果完全相同 |
| `player` | 直走撞牆停在格子中心；L 形轉角會停住、不自動轉彎；迴轉立即生效；寬限時間內能轉、過期不轉；高速時不穿牆、不跳過格子中心；預設的 `inputGraceMs` 走不到下一個路口（§7.2） |
| 判定 | 答錯：封門、玩家移到門外、命不變、記錄答錯；答對：過關；多個正確選項時走進任一個都過關 |
| `enemies` | 永遠在地板上、不進園區、非死路時不回頭；`smartRatio = 1` 的 chaser 每次決策都選 BFS 最短的方向 |
| `game` | 命歸零 → `gameOver`；倒數歸零 → `timeUp`；`levelIntro` 與 `paused` 期間不計時 |
| `scoring` | 分數計算、排行榜排序、`optionsKey` 的格式（倒數秒數、語言）與過濾 |

`core/` 以外也有測試：`urlParams`、`storage/`（排行榜逐筆驗證、偏好設定）、`input/pointer`、`input/zoomGuard`、`ui/format`、`render/theme`（canvas 與 `style.css` 共用的顏色與字型一致）、`scripts/image-utils`。

## 15. 開發里程碑

每個里程碑結束時，`npm run typecheck`、`npm test`、`npm run build` 都要通過，然後停下來讓我確認（§0）。

**M0–M7 已全部完成並驗收（2026-09-25）。** 下表保留當時的內容；M5 驗收時難度還是 1–5 級，之後改成 1–3 級（附錄 B）。之後的每一件回饋或追加需求，同樣要三項檢查都通過才算完成。

| 里程碑 | 內容 | 我怎麼驗收 |
|---|---|---|
| M0 骨架 | Vite + TS strict + Vitest；型別、`validateQuiz` 與測試；載入 `quiz.json`，顯示標題畫面或錯誤畫面 | 故意改壞 JSON，錯誤畫面指出正確位置 |
| M1 迷宮 | `rng`、`grid`、`maze` 與測試；畫出靜態迷宮與園區（先只放文字）；`?seed` 與 `?debug` | 換 seed 看到不同迷宮，同一個 seed 結果相同 |
| M2 移動 | 玩家移動、鍵盤與指標輸入、方向箭頭與漣漪 | 桌機與平板實際操作，轉角不會自動轉彎 |
| M3 關卡 | 題目列、判定、封門、`levelIntro` 與 `levelComplete`、簡易結算 | 五題能從頭玩到尾，答錯會封門 |
| M4 圖片 | §13 圖片任務、處理腳本、答案區顯示圖片、「圖片來源」畫面 | 檢查授權表，每張圖都完整清楚 |
| M5 敵人 | 敵人 AI、碰撞、生命、重生與無敵 | 難度 1 和 5 的手感明顯不同 |
| M6 完整流程 | 三種計時模式、暫停（含切換分頁自動暫停）、結算回顧、排行榜 | 倒數歸零與命用完兩種結束方式都正常 |
| M7 視覺 | 主題、Andika 字型、動態與 reduced motion、直向版面 | 平板橫向、直向都能玩 |

## 16. 之後可能做的（這一版不做）

- 音效與靜音開關。
- 單字發音：點選項或題目時朗讀英文，對語言學習特別有用。
- 標題畫面調整計時與生命（語言與難度已經可以在標題畫面選，§5.4）。
- 介面文字的多語系（目前只有題組內容可以換語言）；圖片 `alt` 的翻譯。
- 更多視覺主題。
- 題組編輯器。
- 以 iframe 嵌入 Moodle 等學習平台。
- PWA 離線安裝。

## 附錄 A：可調參數（`src/config.ts`）

```ts
export const CONFIG = {
  maze: {
    width: 25,                 // 必須是奇數
    height: 15,                // 必須是奇數
    zoneInterior: 3,           // 園區內部邊長（格）
    deadEndRemoval: 1.0,       // 0–1，移除死路的比例
    fairnessMaxRatio: 1.35,    // 起點到各答案區距離：最遠 ÷ 最近
    minStartToZone: 6,         // 起點到任一答案區的最短距離
    maxAttempts: 50,
  },
  player: {
    speedTilesPerSec: 4.5,
    turnTolerance: 0.45,       // 格；距格子中心多近可以轉向（原本 0.3，平板試玩後放寬）
    inputGraceMs: 300,         // 轉向指令的暫存時間（原本 150）；不可以長到走得到下一個路口（§7.2）
    pointerDeadZoneTiles: 0.6,
  },
  enemy: {
    releaseDelayMs: 1500,
    spawnMinDistance: 8,
    ambushLookahead: 4,
  },
  collisionDistance: 0.7,      // 格；玩家與敵人中心距離小於此值即碰撞
  timing: {
    levelIntroMs: 1500,
    wrongFeedbackMs: 600,
    lifeLostMs: 1000,
    levelCompleteMs: 800,
    invulnerableMs: 1500,
  },
  loop: {
    stepHz: 60,
    maxFrameMs: 250,
  },
  leaderboard: {
    maxEntries: 10,
    maxNameLength: 12,
  },
} as const;

/** 難度表：enemySpeedRatio 是相對於玩家速度的比例 */
export const DIFFICULTY_TABLE = {
  1: { enemyCount: 2, enemySpeedRatio: 0.5, smartRatio: 0.65 },
  2: { enemyCount: 2, enemySpeedRatio: 0.6, smartRatio: 0.65 },
  3: { enemyCount: 2, enemySpeedRatio: 0.7, smartRatio: 0.65 },
} as const;

/** 題組沒有指定時使用的遊戲設定（§4.1） */
export const DEFAULT_GAME_OPTIONS: GameOptions = {
  timerMode: 'countUp',
  countDownSeconds: 300,
  lives: 3,
  difficulty: 2,
  shuffleQuestions: true,
  showAnswersAtEnd: true,
};
```

難度表原本是五級（敵人 1–3 隻、`smartRatio` 0.25–0.95）。改成三級時只留速度的差別，數量與聰明程度都用原本難度 3 的值，所以新的難度 3 就是原本的難度 3，1、2 級沿用原本 1、2 級的速度。

## 附錄 B：版本紀錄

**0.2（2026-09-25）**：M0–M7 全部完成後，把試玩回饋與追加需求寫回規格。細節與理由見 `DECISIONS.md` 的「M5 試玩回饋」「M7 之後的回饋」「使用者追加需求（2026-09-25）」各節。

- 難度從 1–5 級改成 1–3 級，只差敵人速度，預設 2；可以在標題畫面選，記在這台裝置上（§4.1、§5.4、§9、附錄 A）。
- 題組可以附其他語言的版本（`languageName`、`translations`），標題畫面選語言；範例題組加上中文版；排行榜依語言分開（§4.1、§4.2、§4.4、§5.4、§11.2）。
- 範例題組的題目改成隨機順序（§4.4）。
- 觸控方向鍵（§7.3）；防止平板誤觸縮放，被放大時可以自己縮回來（§7.4）。
- 轉彎放寬：`turnTolerance` 0.3 → 0.45 格、`inputGraceMs` 150 → 300 ms（§7.2、附錄 A）。
- 測試用的網址參數 `difficulty`、`lives`、`timer`、`seconds`（§4.3）。
- 補上實作時確定的做法：瀏覽器相容性（§2）、專案結構（§3）、公平性調整與出生點（§6.3）、排行榜 `optionsKey` 的格式（§11.2）、字型檔（§12.4）、下載縮圖而不是原始檔（§13.3）、`core/` 以外的測試（§14）；標題畫面顯示建置時間（§5.1）。

**0.1（2026-09-25）**：初版。
