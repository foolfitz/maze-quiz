import './style.css';
import type {
    GameContext,
    GameEvent,
    GameInstance,
} from '@kancil-quiz/games-sdk';
import { CONFIG } from './config';
import {
    clockMs,
    isEndPhase,
    isPlayPhase,
    levelMaze,
    type Level,
} from './core/game';
import { seedFromSource } from './core/rng';
import type { Direction, Phase } from './core/types';
import { attachDpad } from './input/dpad';
import { attachKeyboard } from './input/keyboard';
import { attachPointer } from './input/pointer';
import { holdTouches, preventZoom } from './input/zoomGuard';
import { startLoop, type Loop } from './loop';
import { createImageCache } from './media';
import type { MazeQuizOptions } from './meta';
import { normalizeOptions } from './options';
import {
    Renderer,
    type PlayerCondition,
    type ZoneFeedback,
    type ZoneLabel,
} from './render/renderer';
import { themeCssVariables, ZOO_THEME } from './render/theme';
import { roundsToLevels, type LevelSource } from './rounds';
import { createScope, type Scope } from './scope';
import { createSession, type Session } from './session';
import {
    getStorage,
    loadDpadSide,
    saveDpadSide,
    type DpadSide,
} from './storage/preferences';
import { createSegmenter } from './text/segments';
import { createDom, ICONS } from './ui/dom';
import { formatClock } from './ui/format';
import { fitPrompt } from './ui/promptBar';
import { showRipple } from './ui/ripple';
import { showEnded, showPaused } from './ui/screens';
import { showClock, showLives } from './ui/statusBar';
import { STRINGS } from './ui/strings';

/** 沒有在跑的迴圈 */
const IDLE_LOOP: Loop = { stop: () => undefined, running: false };

/** 純圖片的選項而圖片載入失敗時，答案區顯示的符號（至少看得出那裡有一個選項） */
const MISSING_IMAGE_LABEL = '?';

/** 題目與選項文字用到的字重：題目是一般（400），答案區的選項是粗體（700） */
const QUIZ_FONT_WEIGHTS = [400, 700] as const;

/** 一關裡不會變的顯示資料；圖片載入完成時換成新的 labels，畫面才會重畫 */
interface LevelView {
    readonly level: Level;
    readonly source: LevelSource;
    readonly labels: readonly ZoneLabel[];
}

/** 不屬於遊戲模組介面（GameModule）的掛勾，只給這個 repo 的示範頁用；平台不會傳 */
export interface MountHooks {
    /** 開局前把這一局交出去：除錯畫面（?debug=1）讀狀態，並呼叫 core/game.ts 的 debug 函式 */
    readonly onSession?: (session: Session) => void;
}

/**
 * 在 el 裡建立整個遊戲並立刻開始（宿主已經用「開始」按鈕解鎖音訊，沒有標題畫面）。
 * 所有監聽、計時器與 requestAnimationFrame 都登記在 scope，destroy() 時一次清乾淨。
 */
export function mount(
    el: HTMLElement,
    ctx: GameContext<MazeQuizOptions>,
    hooks: MountHooks = {},
): GameInstance {
    const doc = el.ownerDocument;
    const win = doc.defaultView;
    if (win === null) throw new Error('迷宮問答：掛載點不在任何視窗裡');

    const scope = createScope(win);
    const dom = createDom(doc, scope);
    const options = normalizeOptions(ctx.options);
    const levels = roundsToLevels(ctx.rounds);
    const segmenter = createSegmenter(ctx.language);
    let destroyed = false;
    /** 宿主呼叫了 pause()：迴圈停下來，等宿主呼叫 resume() */
    let suspended = false;

    // ─── 畫面 ───────────────────────────────────────────────────

    const questionNumber = dom.el('span', {
        className: 'kq-maze-question-number',
    });
    const livesDisplay = dom.el('span', {
        className: 'kq-maze-lives',
        attrs: { role: 'img' },
    });
    const clock = dom.el('span', {
        className: 'kq-maze-clock',
        attrs: { role: 'timer' },
    });
    clock.hidden = true;
    const pauseButton = dom.iconButton(
        STRINGS.pause,
        dom.icon(ICONS.pause),
        () => pauseByPlayer(),
    );
    const canvas = dom.el('canvas', { className: 'kq-maze-canvas' });
    const stageMessage = dom.el('div', {
        className: 'kq-maze-stage-message',
        attrs: { 'aria-live': 'polite' },
    });
    stageMessage.hidden = true;
    const stage = dom.el('div', {
        className: 'kq-maze-stage',
        children: [canvas, stageMessage],
    });
    const promptImage = dom.el('img', {
        className: 'kq-maze-prompt-image',
        attrs: { alt: '' },
    });
    promptImage.hidden = true;
    const promptText = dom.el('p', {
        className: 'kq-maze-prompt-text',
        attrs: { lang: ctx.language, 'aria-live': 'polite' },
    });
    const replayButton = dom.iconButton(
        STRINGS.replayAudio,
        dom.icon(ICONS.speaker),
        () => {
            const audio = view?.source.prompt.audio;
            if (audio !== undefined) playPrompt(audio);
        },
    );
    replayButton.classList.add('kq-maze-replay');
    replayButton.hidden = true;
    // 觸控方向鍵；鍵盤可以用方向鍵，所以螢幕閱讀器略過它
    const dpad = dom.el('div', {
        className: 'kq-maze-dpad',
        attrs: { 'aria-hidden': 'true' },
        children: (['up', 'left', 'right', 'down'] as const).map((direction) =>
            dom.el('span', {
                className: `kq-maze-dpad-btn kq-maze-dpad-${direction}`,
                children: [dom.icon(ICONS.arrow)],
            }),
        ),
    });
    const gameRoot = dom.el('div', {
        className: 'kq-maze-game',
        children: [
            dom.el('div', {
                className: 'kq-maze-status',
                children: [
                    questionNumber,
                    dom.el('div', {
                        className: 'kq-maze-status-right',
                        children: [livesDisplay, clock, pauseButton],
                    }),
                ],
            }),
            stage,
            dom.el('div', {
                className: 'kq-maze-prompt',
                children: [promptImage, promptText, replayButton, dpad],
            }),
        ],
    });
    const overlay = dom.el('div', { className: 'kq-maze-overlay' });
    overlay.hidden = true;
    const root = dom.el('div', {
        className: 'kq-maze',
        attrs: { lang: ctx.uiLocale },
        children: [gameRoot, overlay],
    });
    for (const [name, value] of Object.entries(themeCssVariables(ZOO_THEME)))
        root.style.setProperty(name, value);
    el.append(root);
    scope.add(() => root.remove());

    // ─── 遊戲狀態 ───────────────────────────────────────────────

    // 唯一的亂數來源是 ctx.rng：開局時取一個基礎種子，每一關的迷宮與敵人再由它衍生（見 core/rng.ts）
    const session = createSession(
        levels,
        options,
        seedFromSource(ctx.rng),
        (event) => emit(event),
    );
    const emit = (event: GameEvent): void => {
        if (destroyed) return;
        try {
            ctx.emit(event);
        } catch (error) {
            // 宿主的錯誤不要弄壞遊戲迴圈；丟到下一個 microtask，console 照樣看得到
            queueMicrotask(() => {
                throw error;
            });
        }
    };

    const renderer = new Renderer(canvas, ZOO_THEME, segmenter);
    const images = createImageCache(doc, scope, () => {
        labelsDirty = true;
    });
    let view: LevelView | null = null;
    let labelsDirty = false;
    let shownPhase: Phase['kind'] | null = null;
    let shownLives: number | null = null;
    /** 暫停時畫面停格：閃爍與抖動都停在按下暫停的那一刻 */
    let frozenAtMs: number | null = null;
    /** 覆蓋層（暫停、結束）的監聽；換內容時一起清掉 */
    let overlayScope: Scope | null = null;

    // ─── 音訊 ───────────────────────────────────────────────────

    /** 播放題目的音檔；宿主的 audio 失敗（例如網址失效）時不影響遊戲 */
    const playPrompt = (url: string): void => {
        if (destroyed) return;
        try {
            ctx.audio.stopAll();
            ctx.audio.play(url).catch(() => undefined);
        } catch {
            // 同上
        }
    };

    // ─── 觸控方向鍵的位置（記在這台裝置上） ─────────────────────────

    const storage = getStorage(win);
    const hasTouch = win.matchMedia('(any-pointer: coarse)').matches;
    let dpadSide = loadDpadSide(storage, hasTouch ? 'right' : 'off');
    const applyDpadSide = (side: DpadSide): void => {
        dpadSide = side;
        root.dataset.dpad = side;
        dpad.hidden = side === 'off';
    };
    applyDpadSide(dpadSide);

    // ─── 每一關 ─────────────────────────────────────────────────

    const optionImage = (source: LevelSource, index: number): string | null =>
        source.options[index]?.face.image ?? null;

    /** 預先載入這一關與下一關的選項圖片 */
    const preloadImages = (levelIndex: number): void => {
        for (const source of levels.slice(levelIndex, levelIndex + 2)) {
            for (const option of source.options) {
                if (option.face.image !== undefined)
                    images.request(option.face.image);
            }
        }
    };

    const buildLabels = (level: Level, source: LevelSource): ZoneLabel[] =>
        levelMaze(level).zones.map((zone) => {
            const url = optionImage(source, zone.choiceIndex);
            const text = source.options[zone.choiceIndex]?.face.text ?? '';
            // 圖片還在載入或載入失敗時只顯示文字；純圖片的選項載入失敗時顯示「?」
            const image = url === null ? null : images.get(url);
            const failed = url !== null && images.failed(url);
            return {
                text: text.trim() === '' && failed ? MISSING_IMAGE_LABEL : text,
                image,
            };
        });

    /** 換關：更新題號、題目列，播放題目的音檔 */
    const showLevel = (level: Level): LevelView => {
        const source = levels[level.questionIndex];
        if (source === undefined)
            throw new Error(`第 ${level.questionIndex + 1} 關沒有對應的題目`);
        preloadImages(level.questionIndex);

        questionNumber.textContent = STRINGS.questionNumber(
            level.questionIndex + 1,
            levels.length,
        );
        const { prompt } = source;
        promptText.textContent = prompt.text ?? '';
        showPromptImage(prompt.image);
        replayButton.hidden = prompt.audio === undefined;
        fitPrompt(promptText, win, root);
        if (prompt.audio !== undefined) playPrompt(prompt.audio);

        return { level, source, labels: buildLabels(level, source) };
    };

    /** 題目圖片：載入成功才顯示，失敗就只顯示文字 */
    const showPromptImage = (url: string | undefined): void => {
        if (url === undefined) {
            promptImage.removeAttribute('src');
            promptImage.hidden = true;
        } else if (
            promptImage.getAttribute('src') === url &&
            promptImage.complete &&
            promptImage.naturalWidth > 0
        ) {
            // 和上一題同一張圖：不會再觸發 load
            promptImage.hidden = false;
        } else {
            promptImage.hidden = true;
            promptImage.src = url;
        }
    };
    scope.listen(promptImage, 'load', () => {
        promptImage.hidden = false;
        fitPrompt(promptText, win, root);
    });
    scope.listen(promptImage, 'error', () => {
        promptImage.hidden = true;
    });

    // ─── 狀態改變時更新 DOM ─────────────────────────────────────

    const replaceOverlay = (): Scope => {
        overlayScope?.dispose();
        overlayScope = scope.child();
        return overlayScope;
    };

    const hideOverlay = (): void => {
        overlayScope?.dispose();
        overlayScope = null;
        overlay.replaceChildren();
        overlay.hidden = true;
        overlay.classList.remove('kq-maze-overlay-backdrop');
    };

    const onPhaseChanged = (phase: Phase): void => {
        stageMessage.hidden = phase.kind !== 'levelIntro';
        if (phase.kind === 'levelIntro')
            stageMessage.textContent = STRINGS.ready;
        pauseButton.disabled = !isPlayPhase(phase);
        if (phase.kind === 'paused') {
            showPaused(createDom(doc, replaceOverlay()), overlay, {
                onResume: () => {
                    if (!suspended) session.resume();
                },
                dpadSide,
                onDpadSideChange: (side) => {
                    applyDpadSide(side);
                    saveDpadSide(storage, side);
                },
            });
            overlay.classList.add('kq-maze-overlay-backdrop');
        } else if (isEndPhase(phase)) {
            showEnded(createDom(doc, replaceOverlay()), overlay, phase);
            overlay.classList.add('kq-maze-overlay-backdrop');
        } else {
            hideOverlay();
        }
    };

    /** 每幀檢查狀態，有變才動 DOM */
    const syncUi = (): void => {
        const { state } = session;
        const { level } = state;
        if (level !== null && view?.level !== level) {
            view = showLevel(level);
            labelsDirty = false;
        } else if (labelsDirty && view !== null) {
            view = { ...view, labels: buildLabels(view.level, view.source) };
            labelsDirty = false;
        }
        if (state.lives !== shownLives) {
            shownLives = state.lives;
            showLives(dom, livesDisplay, state.lives, options.lives);
        }
        // 倒數無條件進位：畫面上出現 0:00 時就是時間到
        const ms = clockMs(state);
        const countDown = options.timerMode === 'countDown';
        const clockText =
            ms === null ? null : formatClock(ms, countDown ? 'up' : 'down');
        const clockLabel = countDown
            ? STRINGS.clockCountDown
            : STRINGS.clockCountUp;
        showClock(
            clock,
            clockText,
            clockText === null ? '' : clockLabel(clockText),
        );
        if (state.phase.kind !== shownPhase) {
            shownPhase = state.phase.kind;
            onPhaseChanged(state.phase);
        }
    };

    const render = (nowMs: number): void => {
        if (destroyed) return;
        syncUi();
        const { phase, level } = session.state;
        if (level === null || view === null) return;
        // 暫停時照暫停前的狀態畫，✓ ✗ 與受傷的樣子才不會消失
        const shownPlayPhase = phase.kind === 'paused' ? phase.resumeTo : phase;
        frozenAtMs = phase.kind === 'paused' ? (frozenAtMs ?? nowMs) : null;
        renderer.draw(
            {
                maze: levelMaze(level),
                labels: view.labels,
                sealed: level.sealed,
                feedback: feedbackFor(shownPlayPhase, level),
                player: {
                    ...level.player,
                    condition: playerCondition(shownPlayPhase, level),
                },
                enemies: level.enemies.map((enemy) => ({
                    kind: enemy.kind,
                    x: enemy.x,
                    y: enemy.y,
                    dir: enemy.dir,
                })),
            },
            frozenAtMs ?? nowMs,
        );
    };

    // ─── 版面：大小、方向或 devicePixelRatio 改變時重新計算 ──────────

    const relayout = (): void => {
        if (destroyed) return;
        const style = win.getComputedStyle(stage);
        const px = (value: string): number => parseFloat(value) || 0;
        const width =
            stage.clientWidth - px(style.paddingLeft) - px(style.paddingRight);
        const height =
            stage.clientHeight - px(style.paddingTop) - px(style.paddingBottom);
        renderer.layout(
            width,
            height,
            CONFIG.maze.width,
            CONFIG.maze.height,
            win.devicePixelRatio || 1,
        );
        fitPrompt(promptText, win, root);
    };
    /** 大小改變時重新排版；暫停或宿主停住迴圈時也要重畫，畫面才不會是空白的 */
    const onResize = (): void => {
        relayout();
        if (!loop.running) render(win.performance.now());
    };
    const resizeObserver = new win.ResizeObserver(onResize);
    resizeObserver.observe(stage);
    scope.add(() => resizeObserver.disconnect());

    // 把視窗拖到解析度不同的螢幕時，CSS 尺寸不變但 devicePixelRatio 會變
    let unwatchPixelRatio = (): void => undefined;
    const watchPixelRatio = (): void => {
        unwatchPixelRatio();
        const query = win.matchMedia(
            `(resolution: ${win.devicePixelRatio || 1}dppx)`,
        );
        unwatchPixelRatio = scope.listen(query, 'change', () => {
            onResize();
            watchPixelRatio();
        });
    };
    watchPixelRatio();

    // prefers-reduced-motion：關閉漣漪、碰壁抖動與閃爍
    const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
    renderer.reducedMotion = reducedMotion.matches;
    scope.listen(reducedMotion, 'change', () => {
        renderer.reducedMotion = reducedMotion.matches;
    });

    // 字型下載好之後，用 Andika 重畫答案區的文字（canvas 上的字畫在快取的圖層裡）
    Promise.all(
        QUIZ_FONT_WEIGHTS.map((weight) =>
            doc.fonts.load(`${weight} 16px "${ZOO_THEME.quizFontFamily}"`),
        ),
    ).then(
        () => {
            if (destroyed) return;
            renderer.fontsChanged();
            fitPrompt(promptText, win, root);
        },
        () => undefined, // 字型載入失敗就用後備字型，不中斷遊戲
    );

    // ─── 輸入 ───────────────────────────────────────────────────

    const accepting = (): boolean => !destroyed && !suspended;

    const onDirection = (direction: Direction): void => {
        if (!accepting()) return;
        if (session.steer(direction) === 'bumped')
            renderer.bump(direction, win.performance.now());
    };

    function pauseByPlayer(): void {
        if (!accepting()) return;
        session.pause();
        ctx.audio.stopAll();
    }

    // Esc 或 P：暫停；已經暫停時再按一次就繼續
    const togglePause = (): void => {
        if (!accepting()) return;
        if (session.state.phase.kind === 'paused') session.resume();
        else pauseByPlayer();
    };

    attachKeyboard(scope, win, {
        onDirection,
        onPause: togglePause,
        isPlaying: () => accepting() && isPlayPhase(session.state.phase),
    });
    attachDpad(scope, win, dpad, onDirection);
    attachPointer(
        scope,
        win,
        stage,
        {
            screenToTile: (x, y) => renderer.screenToTile(x, y),
            playerPosition: () =>
                session.state.phase.kind === 'playing'
                    ? (session.state.level?.player ?? null)
                    : null,
            deadZoneTiles: CONFIG.player.pointerDeadZoneTiles,
        },
        {
            onDirection,
            onPress: (x, y) => {
                if (!renderer.reducedMotion)
                    showRipple(dom, scope, stage, x, y);
            },
        },
    );
    // 平板上兩指誤觸或點兩下會把畫面放大，放大後就看不到題目
    preventZoom(scope, doc, win);
    holdTouches(scope, win, gameRoot);
    // 切換到別的分頁時自動暫停（宿主通常也會呼叫 pause()，重複呼叫沒有關係）
    scope.listen(doc, 'visibilitychange', () => {
        if (doc.hidden) pauseByPlayer();
    });

    // ─── 開始 ───────────────────────────────────────────────────

    const runLoop = (): Loop =>
        startLoop(
            scope,
            {
                update: (dtMs) => {
                    if (destroyed) return;
                    session.step(dtMs);
                    // 結束了：這一幀畫完就停下來，留下結束畫面等宿主換掉
                    if (session.completed) loop.stop();
                },
                render,
            },
            CONFIG.loop.stepHz,
            CONFIG.loop.maxFrameMs,
        );

    hooks.onSession?.(session);
    session.start();
    // 沒有可以玩的題目時 start() 就已經結束了：不跑迴圈，直接停在結束畫面
    let loop: Loop = session.completed ? IDLE_LOOP : runLoop();
    relayout();
    // 第一幀馬上畫，不必等 requestAnimationFrame（題目的音檔也在這時開始播放）
    render(win.performance.now());

    return {
        destroy() {
            if (destroyed) return;
            destroyed = true;
            loop.stop();
            scope.dispose();
            ctx.audio.stopAll();
        },
        pause() {
            if (destroyed || session.completed) return;
            session.pause();
            ctx.audio.stopAll();
            suspended = true;
            loop.stop();
            render(win.performance.now());
        },
        resume() {
            if (destroyed || !suspended) return;
            suspended = false;
            // 遊戲仍停在暫停畫面，由玩家按「繼續」；迴圈先恢復，畫面才會更新
            if (!session.completed) loop = runLoop();
        },
    };
}

/** 走進園區時要顯示的 ✓ ✗ */
function feedbackFor(phase: Phase, level: Level): ZoneFeedback | null {
    if (level.enteredZone === null) return null;
    if (phase.kind === 'wrongFeedback')
        return { zoneIndex: level.enteredZone, kind: 'wrong' };
    if (phase.kind === 'levelComplete')
        return { zoneIndex: level.enteredZone, kind: 'correct' };
    return null;
}

/** 玩家要畫成什麼樣子：受傷動畫、重生後的無敵，或平常。無敵只在 playing 倒數，其他時候不閃爍。 */
function playerCondition(phase: Phase, level: Level): PlayerCondition {
    if (phase.kind === 'lifeLost') return 'hurt';
    return phase.kind === 'playing' && level.invulnerableMs > 0
        ? 'invulnerable'
        : 'normal';
}
