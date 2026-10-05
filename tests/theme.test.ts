import { describe, expect, it } from 'vite-plus/test';
import mazeQuiz from '../src';
import { meta } from '../src/meta';
import { themeCssVariables, ZOO_THEME } from '../src/render/theme';
import rawCss from '../src/style.css?raw';
import { createFakeEnvironment } from './fakeDom';
import { hostRng } from './helpers';

/** 套件裡的字型檔（只列出路徑，不會載入） */
const fontFiles = Object.keys(import.meta.glob('../fonts/*'));

describe('視覺主題', () => {
    it('原本規格的六個色碼與三種敵人的顏色', () => {
        expect(ZOO_THEME).toMatchObject({
            hedge: '#2F5E3B',
            path: '#EAD9A6',
            ink: '#1F2A24',
            keeper: '#1C6FD1',
            correct: '#2E9E4F',
            wrong: '#C4402F',
        });
        expect(Object.values(ZOO_THEME.enemies)).toEqual([
            '#E03131',
            '#9C36B5',
            '#E8590C',
        ]);
    });

    it('題目字型：Andika（KQ 前綴）在前，後面接介面中文的字型', () => {
        expect(ZOO_THEME.quizFontFamily).toBe('KQ Andika');
        expect(ZOO_THEME.quizFont).toBe(`"KQ Andika", ${ZOO_THEME.uiFont}`);
    });

    it('canvas 與 DOM 共用的顏色只寫在 theme.ts，掛載時設成根元素的 CSS 變數', () => {
        const env = createFakeEnvironment();
        const host = env.createHost();
        const instance = mazeQuiz.mount(host, {
            rounds: [],
            options: meta.defaultOptions,
            language: 'vi',
            uiLocale: 'zh-TW',
            rng: hostRng(1),
            audio: { play: () => Promise.resolve(), stopAll: () => undefined },
            emit: () => undefined,
        });
        const root = env.find(host, 'kq-maze');
        for (const [name, value] of Object.entries(
            themeCssVariables(ZOO_THEME),
        )) {
            expect(root?.style.getPropertyValue(name)).toBe(value);
        }
        expect(root?.style.getPropertyValue('--kq-hedge')).toBe('#2F5E3B');
        instance.destroy();
    });

    it('字型檔與授權檔都在套件的 fonts/ 裡', () => {
        expect(fontFiles.sort()).toEqual([
            '../fonts/Andika-Bold.woff2',
            '../fonts/Andika-Regular.woff2',
            '../fonts/OFL.txt',
        ]);
    });
});

// ─── style.css 的內容 ───────────────────────────────────────
// Vitest 預設把所有 .css 的 import（連 ?raw 也是）換成空字串，要在根目錄的 vite.config.ts 設定
// test.css.include 才讀得到內容。讀不到時跳過這一段，不要假裝通過。

/** 去掉註解的 style.css：註解裡的 } 不會干擾解析 */
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

interface Block {
    readonly prelude: string;
    readonly body: string;
}

/** 頂層的區塊：選擇器或 @ 規則，加上大括號裡的內容 */
function blocks(source: string): Block[] {
    const result: Block[] = [];
    let depth = 0;
    let start = 0;
    let prelude = '';
    for (let i = 0; i < source.length; i++) {
        const char = source.charAt(i);
        if (char === '{') {
            if (depth === 0) {
                prelude = source.slice(start, i).trim();
                start = i + 1;
            }
            depth += 1;
        } else if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                result.push({ prelude, body: source.slice(start, i) });
                start = i + 1;
            }
        }
    }
    return result;
}

/** 所有一般規則的選擇器（@media、@container 裡的也算），不含 @font-face 與 @keyframes */
function selectors(source: string): string[] {
    return blocks(source).flatMap(({ prelude, body }) => {
        if (
            prelude.startsWith('@media') ||
            prelude.startsWith('@supports') ||
            prelude.startsWith('@container')
        )
            return selectors(body);
        if (prelude.startsWith('@')) return [];
        return prelude.split(',').map((selector) => selector.trim());
    });
}

describe.skipIf(css === '')('style.css 不影響宿主頁面', () => {
    it('每個選擇器都限定在 .kq-maze 底下', () => {
        const all = selectors(css);
        expect(all.length).toBeGreaterThan(20);
        const outside = all.filter(
            (selector) => !/^\.kq-maze(?![\w-])/.test(selector),
        );
        expect(outside).toEqual([]);
    });

    it('@font-face 與 @keyframes 的名稱都加上前綴', () => {
        for (const { prelude, body } of blocks(css)) {
            if (prelude === '@font-face')
                expect(body).toMatch(/font-family:\s*'KQ /);
            if (prelude.startsWith('@keyframes'))
                expect(prelude).toMatch(/^@keyframes kq-maze-/);
        }
    });

    it('每個字重都有 @font-face，字型檔用相對路徑指向套件的 fonts/', () => {
        const faces = blocks(css)
            .filter((block) => block.prelude === '@font-face')
            .map(({ body }) => ({
                family: /font-family:\s*'([^']+)'/.exec(body)?.[1],
                weight: /font-weight:\s*(\d+)/.exec(body)?.[1],
                url: /url\(\s*'([^']+)'\s*\)/.exec(body)?.[1],
            }));
        expect(faces.map((face) => face.weight ?? '').sort()).toEqual([
            '400',
            '700',
        ]);
        for (const face of faces) {
            expect(face.family).toBe(ZOO_THEME.quizFontFamily);
            // style.css 在 src/，測試在 tests/，兩邊的 ../fonts/ 是同一個資料夾
            expect(fontFiles).toContain(face.url);
        }
    });
});
