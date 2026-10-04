import type { Scope } from './scope';

/**
 * 答案區的選項圖片。canvas 只能畫已經解碼好的圖片，所以先用 <img> 載入，好了再通知重畫。
 * 網址由宿主提供（已解析好的網址），遊戲本身不發出 fetch／XHR。
 * 載入失敗的圖片改用文字顯示，不中斷遊戲。
 */
export interface ImageCache {
    /** 開始載入（已經在載入或載入過就不重複） */
    request(url: string): void;
    /** 已經可以畫的圖片；還在載入或失敗時是 null */
    get(url: string): HTMLImageElement | null;
    /** 載入失敗（或從來沒有要求載入） */
    failed(url: string): boolean;
}

type Entry =
    | { readonly status: 'loading'; readonly image: HTMLImageElement }
    | { readonly status: 'loaded'; readonly image: HTMLImageElement }
    | { readonly status: 'failed' };

export function createImageCache(
    doc: Document,
    scope: Scope,
    onChange: () => void,
): ImageCache {
    const entries = new Map<string, Entry>();

    // 銷毀時中止還在下載的圖片，之後才完成的也不再通知
    scope.add(() => {
        for (const entry of entries.values()) {
            if (entry.status === 'loading') entry.image.removeAttribute('src');
        }
        entries.clear();
    });

    const settle = (url: string, entry: Entry): void => {
        if (scope.disposed || entries.get(url)?.status !== 'loading') return;
        entries.set(url, entry);
        onChange();
    };

    return {
        request(url) {
            if (scope.disposed || entries.has(url)) return;
            const image = doc.createElement('img');
            image.decoding = 'async';
            image.alt = '';
            image.src = url;
            entries.set(url, { status: 'loading', image });
            // decode() 會等圖片下載並解碼完成；載入失敗時會 reject
            image.decode().then(
                () => settle(url, { status: 'loaded', image }),
                () => settle(url, { status: 'failed' }),
            );
        },
        get(url) {
            const entry = entries.get(url);
            return entry?.status === 'loaded' ? entry.image : null;
        },
        failed(url) {
            const entry = entries.get(url);
            return entry === undefined || entry.status === 'failed';
        },
    };
}
