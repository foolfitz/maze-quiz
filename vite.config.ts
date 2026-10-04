import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

// 單獨執行時，平台的兩個套件改用 vendor/ 中的副本（見 vendor/README.md）。
// 放在 Kancil Quiz 中時不會讀這個檔案，照常解析到 workspace 的正本。
const vendor = (name: string): string =>
    fileURLToPath(new URL(`./vendor/${name}.ts`, import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            '@kancil-quiz/games-sdk': vendor('games-sdk'),
            '@kancil-quiz/text': vendor('text'),
        },
    },
    test: {
        include: ['tests/**/*.test.ts'],
        // tests/theme.test.ts 會檢查 CSS 是否都限定在遊戲的根元素之下
        css: { include: [/src\/style\.css/] },
    },
    lint: {
        ignorePatterns: ['dist/**'],
        options: {
            denyWarnings: true,
            typeAware: true,
            typeCheck: true,
        },
    },
    // 與 Kancil Quiz 相同：放在平台中時，平台的 vp check 也會檢查這個 repo 的檔案
    fmt: {
        printWidth: 80,
        tabWidth: 4,
        singleQuote: true,
        semi: true,
        singleAttributePerLine: false,
        htmlWhitespaceSensitivity: 'css',
        ignorePatterns: ['dist/**'],
    },
});
