import type { TextSegmenter } from '../text/segments';

/**
 * 答案區卡片上的選項文字排版（純函式，量字寬的方法由呼叫的人提供，測試時可以換成假的）。
 *
 * 1. 從最大字級往下試，只在詞與詞之間換行，找到第一個放得進去的字級。
 * 2. 縮到最小字級還放不下時，太長的詞改以字素為單位斷開，超過行數的部分截斷並加「…」。
 *
 * 不以 code unit 或 code point 切字：泰文的上下標記、越南文的疊加聲調不會被拆開（docs/SPEC.md 第 8 節）。
 */

/** 行高是字級的幾倍；越南文字母上方可能疊兩層符號，不能太緊 */
export const LABEL_LINE_HEIGHT = 1.4;

const ELLIPSIS = '…';

export interface LabelLayout {
    readonly lines: readonly string[];
    readonly fontPx: number;
    readonly lineHeightPx: number;
}

export interface LabelBox {
    readonly maxWidth: number;
    readonly maxHeight: number;
    readonly maxFontPx: number;
    readonly minFontPx: number;
    /** 最多幾行，避免字縮得很小卻排成好幾行 */
    readonly maxLines: number;
}

/** 量 text 在字級 fontPx 下的寬度（CSS px） */
export type MeasureText = (text: string, fontPx: number) => number;

export function layoutLabel(
    text: string,
    box: LabelBox,
    measure: MeasureText,
    segmenter: TextSegmenter,
): LabelLayout {
    const trimmed = text.trim();
    const minFontPx = Math.max(1, Math.min(box.minFontPx, box.maxFontPx));
    const linesFor = (fontPx: number): number =>
        Math.max(
            1,
            Math.min(
                box.maxLines,
                Math.floor(box.maxHeight / (fontPx * LABEL_LINE_HEIGHT)),
            ),
        );
    const result = (lines: readonly string[], fontPx: number): LabelLayout => ({
        lines,
        fontPx,
        lineHeightPx: fontPx * LABEL_LINE_HEIGHT,
    });
    if (trimmed === '') return result([], box.maxFontPx);

    const words = segmenter.words(trimmed);
    for (
        let fontPx = Math.floor(box.maxFontPx);
        fontPx >= minFontPx;
        fontPx -= 1
    ) {
        const lines = wrapAtWords(words, box.maxWidth, (value) =>
            measure(value, fontPx),
        );
        if (lines !== null && lines.length <= linesFor(fontPx))
            return result(lines, fontPx);
    }

    // 最小字級還放不下：長詞以字素斷開，多出來的行截掉
    const fontPx = minFontPx;
    const width = (value: string): number => measure(value, fontPx);
    const maxLines = linesFor(fontPx);
    const lines = wrapAnywhere(words, box.maxWidth, width, segmenter);
    if (lines.length <= maxLines) return result(lines, fontPx);
    // 後面還有字：最後一行截短並加上「…」
    const kept = lines.slice(0, maxLines - 1);
    const last = lines[maxLines - 1] ?? '';
    kept.push(truncate(last, box.maxWidth, width, segmenter));
    return result(kept, fontPx);
}

/** 只在詞與詞之間換行；有一個詞單獨就放不下時回傳 null */
function wrapAtWords(
    words: readonly string[],
    maxWidth: number,
    width: (value: string) => number,
): string[] | null {
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const candidate = line + word;
        if (width(candidate.trim()) <= maxWidth) {
            line = candidate;
            continue;
        }
        if (line.trim() !== '') lines.push(line.trim());
        // 換行後行首的空白不算
        line = word.trim() === '' ? '' : word;
        if (width(line) > maxWidth) return null;
    }
    if (line.trim() !== '') lines.push(line.trim());
    return lines;
}

/** 盡量在詞與詞之間換行；單獨一個詞就放不下時，以字素為單位斷開 */
function wrapAnywhere(
    words: readonly string[],
    maxWidth: number,
    width: (value: string) => number,
    segmenter: TextSegmenter,
): string[] {
    const pieces = words.flatMap((word) =>
        width(word.trim()) <= maxWidth ? [word] : segmenter.graphemes(word),
    );
    const lines: string[] = [];
    let line = '';
    for (const piece of pieces) {
        const candidate = line + piece;
        if (line === '' || width(candidate.trim()) <= maxWidth) {
            line = candidate;
            continue;
        }
        if (line.trim() !== '') lines.push(line.trim());
        line = piece.trim() === '' ? '' : piece;
    }
    if (line.trim() !== '') lines.push(line.trim());
    return lines;
}

/** 截到放得下為止並加上「…」，以字素為單位刪字 */
function truncate(
    text: string,
    maxWidth: number,
    width: (value: string) => number,
    segmenter: TextSegmenter,
): string {
    const parts = segmenter.graphemes(text.trim());
    while (
        parts.length > 1 &&
        width(`${parts.join('').trimEnd()}${ELLIPSIS}`) > maxWidth
    ) {
        parts.pop();
    }
    return `${parts.join('').trimEnd()}${ELLIPSIS}`;
}
