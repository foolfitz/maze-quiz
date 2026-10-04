import { describe, expect, it } from 'vite-plus/test';
import {
    LABEL_LINE_HEIGHT,
    layoutLabel,
    type LabelBox,
    type MeasureText,
} from '../src/render/textLayout';
import { createSegmenter } from '../src/text/segments';

/** 假的量字寬：每個字素寬 0.6 個字級（測試用，不需要真的字型） */
function measureWith(language: string): MeasureText {
    const segmenter = createSegmenter(language);
    return (text, fontPx) => segmenter.graphemes(text).length * fontPx * 0.6;
}

const box: LabelBox = {
    maxWidth: 90,
    maxHeight: 90,
    maxFontPx: 27,
    minFontPx: 12,
    maxLines: 3,
};

/** 每一行都在寬度內、行數與高度不超過限制 */
function expectFits(
    lines: readonly string[],
    fontPx: number,
    measure: MeasureText,
    limits: LabelBox = box,
): void {
    expect(lines.length).toBeLessThanOrEqual(limits.maxLines);
    expect(lines.length * fontPx * LABEL_LINE_HEIGHT).toBeLessThanOrEqual(
        Math.max(limits.maxHeight, fontPx * LABEL_LINE_HEIGHT),
    );
    for (const line of lines)
        expect(measure(line, fontPx)).toBeLessThanOrEqual(limits.maxWidth);
}

/** 行首不可以是組合用的符號（泰文的上下標記、越南文分解後的聲調）——那代表字被拆開了 */
function expectNoBrokenGraphemes(lines: readonly string[]): void {
    for (const line of lines) expect(line).not.toMatch(/^\p{M}/u);
}

describe('layoutLabel', () => {
    it('短的詞用放得下的最大字級，單行', () => {
        const measure = measureWith('en');
        const layout = layoutLabel(
            'Zebra',
            box,
            measure,
            createSegmenter('en'),
        );
        expect(layout.lines).toEqual(['Zebra']);
        expect(layout.fontPx).toBe(27);
    });

    it('只在詞與詞之間換行，不把越南文的詞拆開', () => {
        const measure = measureWith('vi');
        const layout = layoutLabel(
            'Chúc mừng năm mới',
            box,
            measure,
            createSegmenter('vi'),
        );
        expect(layout.lines.join(' ')).toBe('Chúc mừng năm mới');
        expect(layout.lines.length).toBeGreaterThan(1);
        expectFits(layout.lines, layout.fontPx, measure);
        expect(layout.fontPx).toBeGreaterThanOrEqual(box.minFontPx);
    });

    it('行高夠寬鬆，越南文的疊加聲調不會撞到上一行', () => {
        expect(LABEL_LINE_HEIGHT).toBeGreaterThanOrEqual(1.35);
        const layout = layoutLabel(
            'Bạn có khỏe không?',
            box,
            measureWith('vi'),
            createSegmenter('vi'),
        );
        expect(layout.lineHeightPx).toBeCloseTo(
            layout.fontPx * LABEL_LINE_HEIGHT,
        );
    });

    it('沒有空格的泰文：太長時以字素斷開，上下標記不會被拆開', () => {
        const text = 'มะม่วงสุกหวานอร่อยมาก';
        const measure = measureWith('th');
        const narrow: LabelBox = { ...box, maxWidth: 40, maxHeight: 200 };
        const layout = layoutLabel(
            text,
            narrow,
            measure,
            createSegmenter('th'),
        );
        expectNoBrokenGraphemes(layout.lines);
        expectFits(layout.lines, layout.fontPx, measure, narrow);
    });

    it('分解過的越南文（NFD）截斷時也不會留下半個字', () => {
        const text = 'Không có gì, cảm ơn bạn rất nhiều'.normalize('NFD');
        const measure = measureWith('vi');
        const tiny: LabelBox = { ...box, maxWidth: 50, maxHeight: 40 };
        const layout = layoutLabel(text, tiny, measure, createSegmenter('vi'));
        expectNoBrokenGraphemes(layout.lines);
        expectFits(layout.lines, layout.fontPx, measure, tiny);
        expect(layout.fontPx).toBe(tiny.minFontPx);
        // 放不下的部分截掉並加上「…」
        expect(layout.lines.at(-1)).toMatch(/…$/u);
        const shown = layout.lines
            .join('')
            .replace('…', '')
            .replaceAll(' ', '');
        // 切字時會轉成 NFC，所以和 NFC 的原文比較
        expect(
            text.normalize('NFC').replaceAll(' ', '').startsWith(shown),
        ).toBe(true);
    });

    it('空白的文字沒有任何一行', () => {
        const layout = layoutLabel(
            '   ',
            box,
            measureWith('en'),
            createSegmenter('en'),
        );
        expect(layout.lines).toEqual([]);
    });
});
