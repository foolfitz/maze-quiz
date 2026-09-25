import type { MazeResult, MazeViolation } from '../core/maze';
import { assertNever } from '../core/types';
import { el } from './dom';
import { STRINGS } from './strings';

const T = STRINGS.debug;

export interface DebugPanelInfo {
  readonly baseSeed: number;
  readonly levelIndex: number;
  readonly result: MazeResult;
  /** 各答案區的名稱與起點到門外的步數，順序與 maze.zones 相同 */
  readonly zoneDistances: readonly { readonly label: string; readonly distance: number | null }[];
  readonly warnings: readonly string[];
}

/** 除錯覆蓋層的文字部分；格線、距離等畫在 canvas 上（renderer.ts） */
export function renderDebugPanel(root: HTMLElement, info: DebugPanelInfo): void {
  const { result, zoneDistances } = info;
  const labels = zoneDistances.map((z) => z.label);

  const distances = zoneDistances.map((z) => `${z.label} ${z.distance ?? '—'}`).join('、');
  const known = zoneDistances.flatMap((z) => (z.distance === null ? [] : [z.distance]));
  const ratio = known.length > 0 ? (Math.max(...known) / Math.min(...known)).toFixed(2) : '—';

  const children: Node[] = [
    el('p', { className: 'debug-fps', text: T.fps('—') }),
    el('p', { className: 'debug-player' }),
    el('p', { text: T.seed(info.baseSeed) }),
    el('p', { text: T.level(info.levelIndex + 1, result.seed, result.attempt) }),
    el('p', { text: `${T.distances}${distances}（${T.ratio(ratio)}）` }),
  ];

  if (result.violations.length > 0) {
    children.push(
      el('p', { className: 'debug-alert', text: T.fallback }),
      el('ul', { children: result.violations.map((v) => el('li', { text: describeViolation(v, labels) })) }),
    );
  }

  children.push(
    el('details', {
      children: [
        el('summary', { text: T.warnings(info.warnings.length) }),
        el('ul', { children: info.warnings.map((w) => el('li', { text: w })) }),
      ],
    }),
    el('p', { className: 'debug-muted', text: T.shortcuts }),
  );

  // 換關時保留使用者收合或展開的狀態
  const [wasOpen, warningsWereOpen] = [...root.querySelectorAll('details')].map((d) => d.open);
  const panel = el('details', { children: [el('summary', { text: T.title }), ...children] });
  panel.open = wasOpen ?? true;
  const warningsDetails = panel.querySelector('details');
  if (warningsDetails !== null) warningsDetails.open = warningsWereOpen ?? false;

  root.replaceChildren(panel);
  root.hidden = false;
}

/** 更新幀率；遊戲迴圈每半秒算一次 */
export function updateDebugFps(root: HTMLElement, fps: number): void {
  const line = root.querySelector('.debug-fps');
  if (line !== null) line.textContent = T.fps(fps.toFixed(0));
}

/** 更新玩家狀態那一行；內容沒變就不動 DOM */
export function updateDebugPlayer(root: HTMLElement, text: string): void {
  const line = root.querySelector('.debug-player');
  if (line !== null && line.textContent !== text) line.textContent = text;
}

function describeViolation(violation: MazeViolation, zoneLabels: readonly string[]): string {
  const V = T.violation;
  switch (violation.kind) {
    case 'disconnected':
      return V.disconnected(violation.unreachable);
    case 'badDoor':
      return V.badDoor(zoneLabels[violation.zoneIndex] ?? String(violation.zoneIndex));
    case 'wideArea':
      return V.wideArea(violation.at.x, violation.at.y);
    case 'deadEnd':
      return V.deadEnd(violation.at.x, violation.at.y);
    case 'unfair':
      return V.unfair(violation.ratio.toFixed(2), violation.limit);
    case 'zoneTooClose':
      return V.zoneTooClose(violation.distance, violation.limit);
    case 'notEnoughSpawns':
      return V.notEnoughSpawns(violation.found, violation.needed);
    default:
      return assertNever(violation);
  }
}
