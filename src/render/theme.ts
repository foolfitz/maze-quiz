import type { EnemyKind } from '../core/enemies';

/** 視覺主題（§12.3）。顏色與 style.css 的 CSS 變數保持一致。 */
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
  readonly quizFont: string; // 題目與選項文字的字型
}

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
  quizFont: 'Andika, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
};
