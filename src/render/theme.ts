import type { EnemyKind } from '../core/enemies';

/**
 * 視覺主題（§12.3）：canvas 上用到的顏色與字型都集中在這裡。
 * DOM 部分的顏色是 style.css 的 CSS 變數；兩邊共用的 token 由 theme.test.ts 檢查是否一致。
 */
export interface Theme {
  readonly hedge: string; // 牆（樹籬）
  readonly path: string; // 走廊（步道）
  readonly ink: string; // 文字
  readonly keeper: string; // 玩家
  readonly correct: string; // ✓ 與答對提示
  readonly wrong: string; // ✗ 與關上的柵門
  readonly enemies: Readonly<Record<EnemyKind, string>>; // 各種敵人的顏色（外形在 renderer.ts）
  readonly card: string; // 答案區卡片底色
  readonly cardEdge: string; // 卡片邊框
  readonly outline: string; // 角色與 ✓ ✗ 的白邊、符號本身、敵人的眼白、柵門的橫條
  readonly sealedShade: string; // 答錯封住的園區蓋上的暗色
  /** 題目與選項文字的字型名稱（§12.4）；字型檔在 public/fonts/，@font-face 寫在 style.css */
  readonly quizFontFamily: string;
  /** canvas 用的完整字型清單：quizFontFamily 加上後備字型（中文字會用後備字型） */
  readonly quizFont: string;
}

/** 介面中文的字型（§12.4）；和 style.css 的 --font-ui 相同 */
const UI_FONT_STACK = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif';

export const ZOO_THEME: Theme = {
  hedge: '#2F5E3B',
  path: '#EAD9A6',
  ink: '#1F2A24',
  keeper: '#1C6FD1',
  correct: '#2E9E4F',
  wrong: '#C4402F',
  enemies: { chaser: '#E03131', wanderer: '#9C36B5', ambusher: '#E8590C' },
  card: '#FFFFFF',
  cardEdge: '#C9B98A',
  outline: '#FFFFFF',
  sealedShade: 'rgba(31, 42, 36, 0.45)',
  quizFontFamily: 'Andika',
  quizFont: `Andika, ${UI_FONT_STACK}`,
};
