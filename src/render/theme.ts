import type { EnemyKind } from '../core/enemies';

/**
 * 視覺主題（動物園步道）：canvas 上用到的顏色與字型都集中在這裡。
 * DOM 也要用的部分由 themeCssVariables() 轉成 CSS 變數，掛載時設在根元素上，兩邊只寫一次。
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
    /** 題目與選項文字的字型名稱；字型檔在套件的 fonts/，@font-face 寫在 style.css */
    readonly quizFontFamily: string;
    /** canvas 用的完整字型清單：quizFontFamily 加上後備字型（中文字會用後備字型） */
    readonly quizFont: string;
    /** 介面中文的字型 */
    readonly uiFont: string;
}

/** 介面中文的字型 */
const UI_FONT_STACK =
    '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif';

/** Andika（SIL Open Font License）。family 名稱加上 KQ 前綴，不會和宿主頁面的字型衝突 */
const QUIZ_FONT_FAMILY = 'KQ Andika';

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
    quizFontFamily: QUIZ_FONT_FAMILY,
    quizFont: `"${QUIZ_FONT_FAMILY}", ${UI_FONT_STACK}`,
    uiFont: UI_FONT_STACK,
};

/** DOM（style.css）也要用的 token，轉成 .kq-maze 上的 CSS 變數 */
export function themeCssVariables(
    theme: Theme,
): Readonly<Record<`--kq-${string}`, string>> {
    return {
        '--kq-hedge': theme.hedge,
        '--kq-path': theme.path,
        '--kq-ink': theme.ink,
        '--kq-keeper': theme.keeper,
        '--kq-correct': theme.correct,
        '--kq-wrong': theme.wrong,
        '--kq-card': theme.card,
        '--kq-font-ui': theme.uiFont,
        '--kq-font-quiz': theme.quizFont,
    };
}
