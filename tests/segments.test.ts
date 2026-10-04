import { describe, expect, it } from 'vite-plus/test';
import { createSegmenter } from '../src/text/segments';

describe('createSegmenter', () => {
    it('泰文的上下標記和前面的字母算同一個字素', () => {
        // อ + งุ่ + น：code point 有 5 個，字素只有 3 個
        expect(createSegmenter('th').graphemes('องุ่น')).toEqual(['อ', 'งุ่', 'น']);
    });

    it('越南文的疊加聲調（NFD 也一樣）不會被拆開', () => {
        const decomposed = 'Việt'.normalize('NFD');
        const parts = createSegmenter('vi').graphemes(decomposed);
        expect(parts).toHaveLength(4);
        expect(parts[2]?.normalize('NFC')).toBe('ệ');
    });

    it('詞與空白分開，可以當換行的位置', () => {
        expect(createSegmenter('vi').words('Xin chào')).toEqual([
            'Xin',
            ' ',
            'chào',
        ]);
    });

    it('語言代碼不合法時退回預設語言，不丟錯', () => {
        expect(createSegmenter('not a language!').graphemes('ab')).toEqual([
            'a',
            'b',
        ]);
        expect(createSegmenter('').graphemes('ab')).toEqual(['a', 'b']);
    });
});
