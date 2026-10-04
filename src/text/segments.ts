import { graphemes, nfc } from '@kancil-quiz/text';

/**
 * 切字的小工具。docs/SPEC.md 第 8 節規定切字一律用 @kancil-quiz/text 的 graphemes()。
 * 絕對不要改成 split('')、[...text] 或用 .length 判斷寬度：泰文、越南文的組合字元會被拆開。
 */

export interface TextSegmenter {
    /** 字素（使用者看到的一個字），結果為 NFC；泰文的上下標記、越南文的疊加聲調都和前面的字母算在一起 */
    graphemes(text: string): string[];
    /** 換行的候選位置：詞與詞之間（含空白），結果為 NFC，只用於畫面上的換行，不儲存 */
    words(text: string): string[];
}

/** 依題組語言建立；語言代碼不合法時退回瀏覽器預設語言 */
export function createSegmenter(language: string): TextSegmenter {
    const word = wordSegmenter(language);
    return {
        graphemes: (text) => graphemes(text, language),
        // graphemes() 的結果是 NFC，換行的詞也轉成 NFC，兩者才能接在同一行
        words: (text) =>
            Array.from(word.segment(nfc(text)), (part) => part.segment),
    };
}

function wordSegmenter(language: string): Intl.Segmenter {
    try {
        return new Intl.Segmenter(language || undefined, {
            granularity: 'word',
        });
    } catch {
        // 例如格式錯誤的語言代碼
        return new Intl.Segmenter(undefined, { granularity: 'word' });
    }
}
