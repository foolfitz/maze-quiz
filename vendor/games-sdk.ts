// 遊戲模組介面，規格見 docs/SPEC.md 7.2。

export interface Face {
    text?: string;
    // text 的語言（BCP 47），例：題組語言 'id'、中文意思 'zh-TW'。問答組的文字不確定是哪種語言，省略
    lang?: string;
    romanization?: string;
    audio?: string; // 已解析的網址
    image?: string; // 已解析的網址
}

// 遊戲能呈現的欄位（lang 只是 text 的屬性，不算）
export type FaceField = Exclude<keyof Face, 'lang'>;

export type Round =
    | {
          shape: 'mcq';
          entryId: string;
          prompt: Face;
          options: { id: string; face: Face; correct: boolean }[];
      }
    | { shape: 'pair'; entryId: string; left: Face; right: Face }
    | { shape: 'card'; entryId: string; front: Face; back: Face };

export type FaceSlot =
    | 'prompt'
    | 'option'
    | 'left'
    | 'right'
    | 'front'
    | 'back';

export interface GameRequirements {
    shape: Round['shape']; // 這個遊戲需要的題目形狀
    minRounds: number;
    optionCount?: { min: number; max: number }; // 僅 mcq：每題的選項數
    renders: Partial<Record<FaceSlot, FaceField[]>>; // 各位置能呈現的欄位
    scored: boolean; // 是否計分；字卡為 false
}

export interface GameModule<Options = Record<string, unknown>> {
    id: string; // 例：'maze-quiz'
    version: string; // semver
    title: { 'zh-TW': string };
    requires: GameRequirements;
    optionsSchema: object; // JSON Schema，老師端的設定表單依此自動產生
    defaultOptions: Options;
    // 遊戲得分（completed 的 gameScore）的名稱，例：打地鼠「星星」。
    // 有設定的遊戲，學生的結果頁與老師的成績頁才顯示遊戲得分；選擇題、配對、迷宮的得分就是答對題數，不設定
    scoreLabel?: { 'zh-TW': string };
    mount(el: HTMLElement, ctx: GameContext<Options>): GameInstance;
}

export interface GameContext<Options> {
    rounds: Round[];
    options: Options;
    language: string; // 題組語言，例：'th'
    uiLocale: 'zh-TW';
    rng: () => number; // 可重現的亂數，方便除錯與測試
    audio: {
        play(url: string): Promise<void>;
        stopAll(): void;
    };
    emit(event: GameEvent): void;
}

export interface GameInstance {
    destroy(): void;
    pause?(): void;
    resume?(): void;
}

export type GameEvent =
    | { type: 'started' }
    | {
          type: 'answered';
          entryId: string;
          selected: string[]; // mcq 為選項 id；pair 為配到的右側卡片的 entryId。v1 一律只有一個元素
          correct: boolean; // 遊戲自己的判定，只用於即時回饋（見 7.4）
          durationMs: number;
          // 這一題實際出現了哪些選項。mcq 省略，由宿主依 Round 補上；
          // pair 的右側卡片由遊戲決定怎麼分批出現，所以由遊戲提供同一批的卡片（entryId）
          presented?: string[];
      }
    | { type: 'viewed'; entryId: string } // 不計分的遊戲（例如字卡）
    | {
          type: 'completed';
          gameScore?: number; // 遊戲自己的得分，只供顯示（有 scoreLabel 的遊戲才顯示，見 7.4）
          durationMs: number;
          // 玩的人在遊戲中按了「再玩一次」：宿主結束這次作答，不顯示結果，直接重新開始（例如字卡）
          replay?: boolean;
      };
