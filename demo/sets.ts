// 罐頭題組：Kancil Quiz 平台匯出的 zip 解開後的內容，一個題組一個目錄
// （demo/sets/<名稱>/：set.json、media/、LICENSE.txt）。建置時由 Vite 一起打包，用到才載入。
// 這裡只描述示範頁用得到的欄位；完整格式是平台的 packages/schema/set.v1.schema.json。

export type FaceField =
    | 'text'
    | 'translation_zh'
    | 'romanization'
    | 'audio'
    | 'image';

export interface SetMedia {
    readonly src: string; // zip 中的路徑，例：media/01M….webp
}

export interface VocabItem {
    readonly text: string;
    readonly translation_zh?: string;
    readonly romanization?: string;
    readonly image?: SetMedia;
    readonly audio?: readonly SetMedia[];
}

export interface DemoSet {
    readonly kind: string; // 示範頁只支援 vocab（詞彙組）
    readonly language: string;
    readonly title: string;
    readonly faces?: {
        readonly prompt: readonly FaceField[];
        readonly answer: readonly FaceField[];
    };
    readonly entries: readonly {
        readonly id: string;
        readonly item?: VocabItem;
    }[];
}

export interface LoadedSet {
    readonly name: string;
    readonly set: DemoSet;
    /** 題組的 LICENSE.txt：授權、作者與出處 */
    readonly license: string;
    /** set.json 中的媒體路徑換成建置後的網址；找不到時回傳 undefined */
    readonly mediaUrl: (src: string) => string | undefined;
}

export const DEFAULT_SET = 'id-1-3';

const setFiles = import.meta.glob<DemoSet>('./sets/*/set.json', {
    import: 'default',
});
const licenseFiles = import.meta.glob<string>('./sets/*/LICENSE.txt', {
    query: '?raw',
    import: 'default',
});
// 媒體只取網址（字串），一次全部載入也很小；圖片本身等遊戲用到才下載
const mediaUrls = import.meta.glob<string>('./sets/*/media/*', {
    query: '?url',
    import: 'default',
    eager: true,
});

/** 所有罐頭題組的名稱 */
export function setNames(): string[] {
    return Object.keys(setFiles)
        .map((path) => path.split('/')[2] ?? '')
        .sort();
}

/** 載入一個罐頭題組；沒有這個題組時回傳 null */
export async function loadSet(name: string): Promise<LoadedSet | null> {
    const dir = `./sets/${name}/`;
    const loadJson = setFiles[`${dir}set.json`];
    if (loadJson === undefined) return null;
    const loadLicense = licenseFiles[`${dir}LICENSE.txt`];
    const [set, license] = await Promise.all([
        loadJson(),
        loadLicense?.() ?? Promise.resolve(''),
    ]);
    const mediaUrl = (src: string) => mediaUrls[`${dir}${src}`];
    return { name, set, license, mediaUrl };
}
