import './style.css';
import type { GameEvent, GameInstance } from '@kancil-quiz/games-sdk';
import mazeQuiz from '../src';
import { createRng, hashSeed } from '../src/core/rng';
import { mount } from '../src/mount';
import { formatClock } from '../src/ui/format';
import { AudioHost } from './audio';
import { startDebugPanel } from './debug';
import { parseParams, type DemoParams } from './params';
import { vocabRounds } from './rounds';
import { FirstAnswers } from './score';
import { DEFAULT_SET, loadSet, setNames, type LoadedSet } from './sets';

// 示範頁：陽春的宿主，用罐頭題組單獨執行遊戲。平台上的宿主還會向伺服器建立作答紀錄、
// 依題組版本重新判分；這裡只在本機計算答對幾題。

const GAME_TITLE = mazeQuiz.title['zh-TW'];

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text = '',
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
    const node = el('button', 'demo-button', text);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
}

const app = document.querySelector<HTMLElement>('#app');
if (app === null) throw new Error('找不到 #app');
const audio = new AudioHost();

function screen(...children: HTMLElement[]): void {
    const box = el('main', 'demo-screen');
    box.append(...children);
    app?.replaceChildren(box);
}

function showError(title: string, details: readonly string[]): void {
    const list = el('ul', 'demo-errors');
    list.append(...details.map((detail) => el('li', '', detail)));
    screen(el('h1', 'demo-title', title), list);
}

function randomSeed(): number {
    return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

function startScreen(params: DemoParams, loaded: LoadedSet): void {
    const license = el('details', 'demo-license');
    license.append(
        el('summary', '', '題組的授權與出處'),
        el('pre', '', loaded.license),
    );
    const source = el('a', '', 'GitHub');
    source.href = 'https://github.com/foolfitz/maze-quiz';
    const footer = el(
        'p',
        'demo-note',
        'Kancil Quiz 的遊戲模組。原始碼與網址參數見 ',
    );
    footer.append(source, '。');
    screen(
        el('p', 'demo-game', `${GAME_TITLE}・示範`),
        el('h1', 'demo-title', loaded.set.title),
        el('p', 'demo-detail', `共 ${loaded.set.entries.length} 題`),
        button('開始', () => play(params, loaded)),
        license,
        footer,
    );
}

function play(params: DemoParams, loaded: LoadedSet): void {
    // 「開始」是使用者手勢：在這裡解鎖 iOS 的音訊播放
    audio.unlock();
    const seed = params.seed ?? randomSeed();
    const { set } = loaded;
    // 出題與遊戲各用一個由種子衍生的亂數序列；同一個種子就是同一局
    const rounds = vocabRounds(set, loaded.mediaUrl, createRng(seed));
    const gameRng = createRng(hashSeed(seed, 1));

    // 遊戲區與除錯畫面上下排列，除錯畫面不蓋住遊戲
    const layout = el('div', 'demo-play');
    const area = el('div', 'demo-game-area');
    area.lang = set.language;
    layout.append(area);
    app?.replaceChildren(layout);

    const answers = new FirstAnswers();
    let instance: GameInstance | null = null;
    let stopDebug = (): void => undefined;
    let finished = false;

    const emit = (event: GameEvent): void => {
        answers.record(event);
        if (event.type === 'completed' && !finished) {
            finished = true;
            // 遊戲在自己的事件處理中呼叫 emit，等它返回後再卸載
            setTimeout(() => {
                stopDebug();
                instance?.destroy();
                instance = null;
                showResults(
                    params,
                    loaded,
                    answers.correct,
                    rounds.length,
                    event.durationMs,
                );
            });
        }
    };

    instance = mount(
        area,
        {
            rounds,
            options: { ...mazeQuiz.defaultOptions, ...params.options },
            language: set.language,
            uiLocale: 'zh-TW',
            rng: () => gameRng.next(),
            audio: {
                play: (url) => audio.play(url),
                stopAll: () => audio.stopAll(),
            },
            emit,
        },
        {
            onSession: params.debug
                ? (session) => {
                      stopDebug = startDebugPanel(layout, session, seed);
                  }
                : undefined,
        },
    );
}

function showResults(
    params: DemoParams,
    loaded: LoadedSet,
    correct: number,
    total: number,
    durationMs: number,
): void {
    screen(
        el('p', 'demo-game', loaded.set.title),
        el('h1', 'demo-title', `答對 ${correct} / ${total} 題`),
        el('p', 'demo-detail', `用時 ${formatClock(durationMs)}`),
        button('再玩一次', () => play(params, loaded)),
    );
}

async function main(): Promise<void> {
    const parsed = parseParams(
        new URLSearchParams(location.search),
        DEFAULT_SET,
    );
    if (!parsed.ok) {
        showError('網址參數有誤', parsed.errors);
        return;
    }
    const { params } = parsed;
    const loaded = await loadSet(params.set);
    if (loaded === null) {
        showError(`找不到題組「${params.set}」`, [
            `可以用的題組：${setNames().join('、')}`,
        ]);
        return;
    }
    if (loaded.set.kind !== 'vocab') {
        showError('示範頁只支援詞彙組', [
            `題組「${params.set}」是 ${loaded.set.kind}`,
        ]);
        return;
    }
    document.title = `${loaded.set.title}｜${GAME_TITLE}`;
    startScreen(params, loaded);
}

void main();
