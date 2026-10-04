import type { HostWindow } from '../src/scope';

/**
 * 給 mount()／destroy() 測試用的極簡假 DOM（repo 沒有裝 jsdom）。
 * 只做遊戲用得到的部分，重點是記錄每個物件上還掛著幾個監聽、還有幾個計時器與
 * requestAnimationFrame、ResizeObserver 有沒有斷開，用來確認 destroy() 之後什麼都沒留下。
 * 畫面不會真的畫出來：canvas 的 2D context 是什麼都不做的替身。
 */

type Listener = EventListenerOrEventListenerObject;

class FakeEventTarget {
    private readonly listeners = new Map<string, Set<Listener>>();

    constructor(registry: Set<FakeEventTarget>) {
        registry.add(this);
    }

    addEventListener(type: string, listener: Listener | null): void {
        if (listener === null) return;
        const set = this.listeners.get(type) ?? new Set<Listener>();
        set.add(listener);
        this.listeners.set(type, set);
    }

    removeEventListener(type: string, listener: Listener | null): void {
        if (listener !== null) this.listeners.get(type)?.delete(listener);
    }

    dispatchEvent(event: Event): boolean {
        // 先複製一份：監聽在處理事件時可能移除自己
        const current = Array.from(this.listeners.get(event.type) ?? []);
        for (const listener of current) {
            if (typeof listener === 'function') listener.call(this, event);
            else listener.handleEvent(event);
        }
        return !event.defaultPrevented;
    }

    get listenerTotal(): number {
        let total = 0;
        for (const set of this.listeners.values()) total += set.size;
        return total;
    }
}

type FakeNode = FakeElement | string;

/** element.style：一般屬性（width、left…）直接寫在物件上，CSS 變數用 setProperty() */
class FakeStyle {
    readonly custom = new Map<string, string>();

    setProperty(name: string, value: string): void {
        this.custom.set(name, value);
    }

    getPropertyValue(name: string): string {
        return this.custom.get(name) ?? '';
    }
}

export class FakeElement extends FakeEventTarget {
    readonly tagName: string;
    readonly ownerDocument: FakeDocument;
    readonly style = new FakeStyle();
    readonly dataset: Record<string, string | undefined> = {};
    readonly attributes = new Map<string, string>();
    children: FakeNode[] = [];
    parent: FakeElement | null = null;
    className = '';
    hidden = false;
    clientWidth = 800;
    clientHeight = 600;
    scrollHeight = 20;
    isContentEditable = false;

    readonly classList = {
        add: (...names: string[]): void => {
            const set = new Set(this.className.split(' ').filter(Boolean));
            for (const name of names) set.add(name);
            this.className = [...set].join(' ');
        },
        remove: (...names: string[]): void => {
            this.className = this.className
                .split(' ')
                .filter((name) => name !== '' && !names.includes(name))
                .join(' ');
        },
        contains: (name: string): boolean =>
            this.className.split(' ').includes(name),
    };

    constructor(
        registry: Set<FakeEventTarget>,
        doc: FakeDocument,
        tagName: string,
    ) {
        super(registry);
        this.ownerDocument = doc;
        this.tagName = tagName.toUpperCase();
    }

    get textContent(): string {
        return this.children
            .map((child) =>
                typeof child === 'string' ? child : child.textContent,
            )
            .join('');
    }

    set textContent(value: string) {
        this.replaceChildren(value);
    }

    get isConnected(): boolean {
        return this.parent !== null;
    }

    setAttribute(name: string, value: string): void {
        this.attributes.set(name, String(value));
    }

    getAttribute(name: string): string | null {
        return this.attributes.get(name) ?? null;
    }

    removeAttribute(name: string): void {
        this.attributes.delete(name);
    }

    append(...nodes: FakeNode[]): void {
        for (const node of nodes) {
            if (node === '') continue;
            if (typeof node !== 'string') {
                node.remove();
                node.parent = this;
            }
            this.children.push(node);
        }
    }

    replaceChildren(...nodes: FakeNode[]): void {
        for (const child of this.children) {
            if (typeof child !== 'string') child.parent = null;
        }
        this.children = [];
        this.append(...nodes);
    }

    remove(): void {
        if (this.parent === null) return;
        this.parent.children = this.parent.children.filter(
            (child) => child !== this,
        );
        this.parent = null;
    }

    /** 子孫元素（深度優先） */
    *descendants(): Generator<FakeElement> {
        for (const child of this.children) {
            if (typeof child === 'string') continue;
            yield child;
            yield* child.descendants();
        }
    }

    focus(): void {
        // 假 DOM 沒有焦點
    }

    getBoundingClientRect(): DOMRect {
        return {
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: this.clientWidth,
            bottom: this.clientHeight,
            width: this.clientWidth,
            height: this.clientHeight,
            toJSON: () => ({}),
        };
    }

    setPointerCapture(): void {
        // 假 DOM 不追蹤指標
    }

    closest(): null {
        return null;
    }
}

class FakeInput extends FakeElement {
    checked = false;
}

class FakeImage extends FakeElement {
    complete = true;
    naturalWidth = 120;
    naturalHeight = 80;
    alt = '';
    decoding = 'auto';

    get src(): string {
        return this.getAttribute('src') ?? '';
    }

    set src(value: string) {
        this.setAttribute('src', value);
    }

    /** 網址含有 broken 的圖片載入失敗 */
    decode(): Promise<void> {
        return this.src.includes('broken')
            ? Promise.reject(new Error('載入失敗'))
            : Promise.resolve();
    }
}

class FakeCanvas extends FakeElement {
    width = 300;
    height = 150;

    /** 什麼都不做的 2D context：任何方法都可以呼叫，屬性照樣可以讀寫；fillText 的文字記在 document 上 */
    getContext(): object {
        const doc = this.ownerDocument;
        const state: Record<string | symbol, unknown> = {};
        return new Proxy(state, {
            get(target, property) {
                if (property === 'fillText') {
                    return (text: string) => doc.drawnTexts.push(text);
                }
                if (property === 'measureText') {
                    // 假的量字寬：每個 UTF-16 code unit 8 px，夠測試用就好
                    return (text: string) => ({ width: text.length * 8 });
                }
                if (property in target) return target[property];
                return () => undefined;
            },
            set(target, property, value) {
                target[property] = value;
                return true;
            },
        });
    }
}

class FakeDocument extends FakeEventTarget {
    hidden = false;
    readonly fonts = { load: () => Promise.resolve([]) };
    /** canvas 上 fillText() 畫過的文字 */
    readonly drawnTexts: string[] = [];
    readonly body: FakeElement;
    defaultView: object | null = null;

    constructor(private readonly registry: Set<FakeEventTarget>) {
        super(registry);
        this.body = this.createElement('body');
    }

    createElement(tag: string): FakeElement {
        switch (tag) {
            case 'img':
                return new FakeImage(this.registry, this, tag);
            case 'canvas':
                return new FakeCanvas(this.registry, this, tag);
            case 'input':
                return new FakeInput(this.registry, this, tag);
            default:
                return new FakeElement(this.registry, this, tag);
        }
    }

    createElementNS(_namespace: string, tag: string): FakeElement {
        return new FakeElement(this.registry, this, tag);
    }
}

class FakeMediaQueryList extends FakeEventTarget {
    constructor(
        registry: Set<FakeEventTarget>,
        readonly media: string,
        readonly matches: boolean,
    ) {
        super(registry);
    }
}

export class FakeKeyboardEvent extends Event {
    readonly code: string;
    readonly repeat = false;
    readonly ctrlKey = false;
    readonly metaKey = false;
    readonly altKey = false;

    constructor(code: string) {
        super('keydown', { cancelable: true });
        this.code = code;
    }
}

export class FakePointerEvent extends Event {
    readonly pointerId = 1;
    readonly pointerType = 'touch';
    readonly button = 0;

    constructor(
        type: string,
        readonly clientX: number,
        readonly clientY: number,
    ) {
        super(type, { cancelable: true });
    }
}

/** 沒有任何元素會是這些類別的實例（遊戲裡沒有文字輸入框） */
class NeverElement {}

export interface FakeEnvironmentOptions {
    /** 讀取 localStorage 就丟錯（例如 Safari 的私密瀏覽或封鎖網站資料） */
    readonly storageThrows?: boolean;
    /** prefers-reduced-motion 與 any-pointer: coarse 的結果 */
    readonly mediaMatches?: boolean;
}

export interface FakeEnvironment {
    readonly win: HostWindow;
    readonly doc: Document;
    /** 新的元素（例如掛載點），型別當成真的 HTMLElement 用 */
    createHost(): HTMLElement;
    /** 所有假物件上還掛著的監聽總數 */
    listenerCount(): number;
    pendingTimers(): number;
    pendingFrames(): number;
    /** 還沒斷開的 ResizeObserver */
    activeObservers(): number;
    runFrame(nowMs: number): void;
    /** 連續跑好幾幀，每幀間隔 frameMs */
    runFrames(count: number, frameMs?: number): void;
    runTimers(): void;
    /** 依 class 找出 host 裡的元素 */
    find(host: HTMLElement, className: string): FakeElement | undefined;
    findAll(host: HTMLElement, className: string): FakeElement[];
    readonly storage: Map<string, string>;
    /** canvas 上 fillText() 畫過的文字 */
    readonly drawnTexts: string[];
}

export function createFakeEnvironment(
    options: FakeEnvironmentOptions = {},
): FakeEnvironment {
    const registry = new Set<FakeEventTarget>();
    const doc = new FakeDocument(registry);
    const timers = new Map<number, () => void>();
    const frames = new Map<number, (nowMs: number) => void>();
    const observers = new Set<object>();
    const storage = new Map<string, string>();
    let nextId = 1;
    let clock = 0;

    class FakeResizeObserver {
        observe(): void {
            observers.add(this);
        }

        disconnect(): void {
            observers.delete(this);
        }
    }

    const fakeStorage = {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
            storage.set(key, value);
        },
    };

    const win = Object.assign(new FakeEventTarget(registry), {
        document: doc,
        devicePixelRatio: 1,
        innerWidth: 1024,
        performance: { now: () => clock },
        visualViewport: undefined,
        TouchEvent: undefined,
        KeyboardEvent: FakeKeyboardEvent,
        PointerEvent: FakePointerEvent,
        Element: FakeElement,
        HTMLElement: FakeElement,
        HTMLInputElement: FakeInput,
        HTMLTextAreaElement: NeverElement,
        HTMLSelectElement: NeverElement,
        ResizeObserver: FakeResizeObserver,
        setTimeout: (callback: () => void) => {
            const id = nextId++;
            timers.set(id, callback);
            return id;
        },
        clearTimeout: (id: number) => {
            timers.delete(id);
        },
        requestAnimationFrame: (callback: (nowMs: number) => void) => {
            const id = nextId++;
            frames.set(id, callback);
            return id;
        },
        cancelAnimationFrame: (id: number) => {
            frames.delete(id);
        },
        matchMedia: (media: string) =>
            new FakeMediaQueryList(
                registry,
                media,
                options.mediaMatches ?? false,
            ),
        getComputedStyle: () => ({
            paddingLeft: '16px',
            paddingRight: '16px',
            paddingTop: '0px',
            paddingBottom: '16px',
            lineHeight: '30px',
        }),
    });
    Object.defineProperty(win, 'localStorage', {
        get: () => {
            if (options.storageThrows === true)
                throw new Error('SecurityError');
            return fakeStorage;
        },
    });
    doc.defaultView = win;

    const asFake = (host: HTMLElement): FakeElement => {
        if (!(host instanceof FakeElement)) throw new Error('不是假的元素');
        return host;
    };
    const findAll = (host: HTMLElement, className: string): FakeElement[] =>
        [...asFake(host).descendants()].filter((element) =>
            element.className.split(' ').includes(className),
        );

    const runFrame = (nowMs: number): void => {
        clock = nowMs;
        const pending = [...frames];
        frames.clear();
        for (const [, callback] of pending) callback(nowMs);
    };

    return {
        win: win as unknown as HostWindow,
        doc: doc as unknown as Document,
        createHost: () => doc.createElement('div') as unknown as HTMLElement,
        listenerCount: () => {
            let total = 0;
            for (const target of registry) total += target.listenerTotal;
            return total;
        },
        pendingTimers: () => timers.size,
        pendingFrames: () => frames.size,
        activeObservers: () => observers.size,
        runFrame,
        runFrames: (count, frameMs = 1000 / 60) => {
            for (let i = 0; i < count; i++) runFrame(clock + frameMs);
        },
        runTimers: () => {
            const pending = [...timers.values()];
            timers.clear();
            for (const callback of pending) callback();
        },
        find: (host, className) => findAll(host, className)[0],
        findAll,
        storage,
        drawnTexts: doc.drawnTexts,
    };
}
