import type { LeaderboardEntry } from '../core/scoring';
import { button, el } from './dom';
import { formatClock } from './format';
import { STRINGS } from './strings';

const C = STRINGS.leaderboardColumns;

export interface LeaderboardTableOptions {
  /** 不計時模式不顯示用時（§5.2），但排序照樣用得到 */
  readonly showTime: boolean;
  /** 剛登上排行榜的那一筆，加上 ★ 並加粗 */
  readonly highlight: LeaderboardEntry | null;
}

/** 排行榜表格；entries 必須已經排好序（core/scoring.ts 的 entriesFor） */
export function leaderboardTable(
  entries: readonly LeaderboardEntry[],
  options: LeaderboardTableOptions,
): HTMLElement {
  if (entries.length === 0) return el('p', { className: 'muted', text: STRINGS.leaderboardEmpty });

  const headers = [C.rank, C.name, C.score, ...(options.showTime ? [C.time] : []), C.lives];
  const rows = entries.map((entry, i) => {
    const isNew = entry === options.highlight;
    const cells = [
      // 不只靠底色標出剛登上的那一筆，名次前面加 ★；名次是這一列的標題
      el('th', { text: isNew ? `★ ${i + 1}` : String(i + 1), attrs: { scope: 'row' } }),
      el('td', { className: 'leaderboard-name', text: entry.name }),
      el('td', { text: `${entry.score} / ${entry.total}` }),
      ...(options.showTime ? [el('td', { text: formatClock(entry.elapsedMs) })] : []),
      el('td', { text: String(entry.livesLeft) }),
    ];
    return el('tr', { className: isNew ? 'leaderboard-new' : '', children: cells });
  });

  return el('table', {
    className: 'leaderboard',
    children: [
      el('caption', { className: 'visually-hidden', text: STRINGS.leaderboardTitle }),
      el('thead', {
        children: [el('tr', { children: headers.map((text) => el('th', { text, attrs: { scope: 'col' } })) })],
      }),
      el('tbody', { children: rows }),
    ],
  });
}

/** 標題畫面按「排行榜」：只列出和目前設定相同的紀錄（§11.2） */
export type LeaderboardContent =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'entries'; readonly entries: readonly LeaderboardEntry[]; readonly showTime: boolean };

export function showLeaderboardScreen(
  root: HTMLElement,
  content: LeaderboardContent,
  settingsText: string,
  onBack: () => void,
): void {
  const back = button(STRINGS.back, onBack, 'primary');
  const body =
    content.kind === 'unavailable'
      ? el('p', { text: STRINGS.leaderboardUnavailable })
      : leaderboardTable(content.entries, { showTime: content.showTime, highlight: null });
  const card = el('div', {
    className: 'card card-wide',
    children: [
      el('h1', { text: STRINGS.leaderboardTitle }),
      el('p', { className: 'muted', text: STRINGS.leaderboardSettings(settingsText) }),
      body,
      el('div', { className: 'actions', children: [back] }),
    ],
  });
  root.replaceChildren(card);
  root.classList.remove('backdrop');
  root.hidden = false;
  root.scrollTop = 0;
  back.focus({ preventScroll: true });
}
