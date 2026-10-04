// 文字處理，規格見 docs/SPEC.md 第 8 節。斷詞建議 suggestWords() 與 Zawgyi 偵測在 M6 實作。

// 使用拉丁字母的語言：比對時不分大小寫，也才有「寬鬆模式」。
const LATIN_LANGUAGES = new Set(['id', 'vi', 'ms', 'fil']);

// 儲存與比對前一律轉成 NFC。
export function nfc(text: string): string {
    return text.normalize('NFC');
}

export function isNfc(text: string): boolean {
    return text === nfc(text);
}

// 遊戲排版時會反覆切字，所以每種語言只建立一次 Segmenter。
const segmenters = new Map<string, Intl.Segmenter>();

function graphemeSegmenter(language = ''): Intl.Segmenter {
    let segmenter = segmenters.get(language);
    if (!segmenter) {
        try {
            segmenter = new Intl.Segmenter(language || undefined, {
                granularity: 'grapheme',
            });
        } catch {
            // 語言代碼不合法時退回瀏覽器預設語言；字素的切法與語言幾乎無關
            segmenter = new Intl.Segmenter(undefined, {
                granularity: 'grapheme',
            });
        }
        segmenters.set(language, segmenter);
    }
    return segmenter;
}

// 把文字切成字素（使用者看到的一個字）。凡是把文字拆成格子或字塊都必須用它，
// 不可以用 split('') 或 [...text]，否則泰文、高棉文的附加符號會被拆開。
export function graphemes(text: string, language?: string): string[] {
    return Array.from(
        graphemeSegmenter(language).segment(nfc(text)),
        ({ segment }) => segment,
    );
}

export interface MatchOptions {
    language: string;
    // 忽略聲調與變音符號，只對拉丁字母語言有效。預設關閉，因為越南語的聲調有辨義作用。
    loose?: boolean;
}

// 答案比對用的正規形式：NFC → 去頭尾空白 → 合併連續空白 → 拉丁字母語言不分大小寫。
export function normalizeForMatch(
    text: string,
    { language, loose = false }: MatchOptions,
): string {
    let result = nfc(text).trim().replace(/\s+/gu, ' ');

    if (LATIN_LANGUAGES.has(language)) {
        result = result.toLocaleLowerCase(language);

        if (loose) {
            result = nfc(
                result
                    .normalize('NFD')
                    .replace(/\p{Mn}/gu, '')
                    .replace(/đ/gu, 'd'),
            );
        }
    }

    return result;
}

export function isMatch(a: string, b: string, options: MatchOptions): boolean {
    return normalizeForMatch(a, options) === normalizeForMatch(b, options);
}
