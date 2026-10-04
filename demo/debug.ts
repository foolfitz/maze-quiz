import {
    debugCompleteLevel,
    debugLoseLife,
    debugToggleInvincible,
    difficultyRow,
    levelMaze,
    type Level,
} from '../src/core/game';
import { bfs } from '../src/core/grid';
import { isCorridor, type MazeViolation } from '../src/core/maze';
import { assertNever } from '../src/core/types';
import type { Session } from '../src/session';

// 除錯畫面（?debug=1）：FPS、玩家位置、種子、起點到各答案區的步數，以及快捷鍵
// N（直接過關）、K（扣一條命）、I（切換無敵）。只在示範頁使用，平台上沒有。

/** FPS 每半秒算一次 */
const FPS_INTERVAL_MS = 500;

function el(tag: string, className: string, text = ''): HTMLElement {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
}

/** 在 parent 裡顯示除錯畫面；回傳的函式移除畫面與所有監聽 */
export function startDebugPanel(
    parent: HTMLElement,
    session: Session,
    seed: number,
): () => void {
    const { state } = session;
    const fps = el('p', '');
    const player = el('p', '');
    const invincible = el('p', '');
    const levelInfo = el('div', '');
    const panel = el('details', 'demo-debug');
    panel.setAttribute('open', '');
    panel.append(
        el('summary', '', '除錯資訊'),
        fps,
        el('p', '', `種子 ${seed}（網址加上 ?seed=${seed} 可重現）`),
        levelInfo,
        player,
        invincible,
        el(
            'p',
            'demo-debug-muted',
            '快捷鍵　N：直接過關　K：扣一條命　I：切換無敵',
        ),
    );
    parent.append(panel);

    let shownLevel: Level | null = null;
    let frames = 0;
    let since = performance.now();
    let frame = 0;

    const update = (now: number): void => {
        frames += 1;
        if (now - since >= FPS_INTERVAL_MS) {
            fps.textContent = `FPS ${Math.round((frames * 1000) / (now - since))}`;
            frames = 0;
            since = now;
        }
        const { level } = state;
        if (level !== shownLevel) {
            shownLevel = level;
            levelInfo.replaceChildren(...describeLevel(session, level));
        }
        if (level !== null) {
            const { x, y, dir, pendingDir } = level.player;
            setText(
                player,
                `玩家 (${x.toFixed(2)}, ${y.toFixed(2)})　方向 ${dir ?? '—'}　等待轉向 ${pendingDir ?? '—'}`,
            );
        }
        setText(
            invincible,
            `無敵（I）：${state.debugInvincible ? '開' : '關'}`,
        );
        frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);

    const onKey = (event: KeyboardEvent): void => {
        if (event.repeat || event.ctrlKey || event.metaKey || event.altKey)
            return;
        if (event.code === 'KeyN') debugCompleteLevel(state);
        else if (event.code === 'KeyK') debugLoseLife(state);
        else if (event.code === 'KeyI') debugToggleInvincible(state);
    };
    window.addEventListener('keydown', onKey);

    return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('keydown', onKey);
        panel.remove();
    };
}

/** 內容沒變就不動 DOM */
function setText(node: HTMLElement, text: string): void {
    if (node.textContent !== text) node.textContent = text;
}

/** 換關時才重算的部分：難度、這一關的迷宮種子、起點到各答案區門外的步數 */
function describeLevel(session: Session, level: Level | null): HTMLElement[] {
    const { state } = session;
    const row = difficultyRow(state);
    const lines = [
        el(
            'p',
            '',
            `難度 ${state.options.difficulty}：敵人 ${row.enemyCount} 隻，速度 ${row.enemySpeedRatio}×，聰明程度 ${row.smartRatio}`,
        ),
    ];
    if (level === null) return lines;

    const { mazeResult } = level;
    const maze = levelMaze(level);
    const source = session.levels[level.questionIndex];
    const distances = bfs(maze.grid, maze.start, (tile) =>
        isCorridor(maze, tile),
    );
    const zones = maze.zones.map((zone) => {
        const option = source?.options[zone.choiceIndex];
        return {
            label: `${option?.correct ? '✓' : ''}${option?.face.text ?? `選項 ${zone.choiceIndex + 1}`}`,
            distance: distances.get(zone.outside),
        };
    });
    const known = zones.flatMap((zone) =>
        zone.distance === null ? [] : [zone.distance],
    );
    const ratio =
        known.length > 0
            ? (Math.max(...known) / Math.min(...known)).toFixed(2)
            : '—';

    lines.push(
        el(
            'p',
            '',
            `第 ${level.questionIndex + 1} 關：迷宮種子 ${mazeResult.seed}，第 ${mazeResult.attempt + 1} 次嘗試`,
        ),
        el(
            'p',
            '',
            `起點到各答案區的步數：${zones.map((zone) => `${zone.label} ${zone.distance ?? '—'}`).join('、')}（最遠 ÷ 最近 = ${ratio}）`,
        ),
    );
    if (mazeResult.violations.length > 0) {
        const labels = zones.map((zone) => zone.label);
        const list = el('ul', '');
        list.append(
            ...mazeResult.violations.map((violation) =>
                el('li', '', describeViolation(violation, labels)),
            ),
        );
        lines.push(
            el(
                'p',
                'demo-debug-alert',
                '⚠ 迷宮沒有完全符合條件，採用最接近的一張：',
            ),
            list,
        );
    }
    return lines;
}

function describeViolation(
    violation: MazeViolation,
    zoneLabels: readonly string[],
): string {
    switch (violation.kind) {
        case 'disconnected':
            return `有 ${violation.unreachable} 格地板走不到`;
        case 'badDoor':
            return `答案區「${zoneLabels[violation.zoneIndex] ?? violation.zoneIndex}」的門不正確`;
        case 'wideArea':
            return `(${violation.at.x}, ${violation.at.y}) 有 2×2 的地板`;
        case 'deadEnd':
            return `(${violation.at.x}, ${violation.at.y}) 是死路`;
        case 'unfair':
            return `距離差距 ${violation.ratio.toFixed(2)} 超過上限 ${violation.limit}`;
        case 'zoneTooClose':
            return `最近的答案區只有 ${violation.distance} 步，少於 ${violation.limit} 步`;
        case 'notEnoughSpawns':
            return `敵人出生點只有 ${violation.found} 個，需要 ${violation.needed} 個`;
        default:
            return assertNever(violation);
    }
}
