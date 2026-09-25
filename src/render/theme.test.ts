import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QUIZ_FONT_WEIGHTS } from '../loader';
import { ZOO_THEME, type Theme } from './theme';

/** 去掉註解的 style.css：註解裡的 } 或 --x: y; 不會干擾解析 */
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** style.css 裡 :root 的 CSS 變數，例如 { hedge: '#2f5e3b', ... } */
function rootVariables(source: string): ReadonlyMap<string, string> {
  const root = /:root\s*\{([^}]*)\}/.exec(source)?.[1] ?? '';
  const variables = new Map<string, string>();
  for (const match of root.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) variables.set(name, value.trim());
  }
  return variables;
}

/** canvas（theme.ts）和 DOM（style.css）都會用到的顏色；兩邊要一樣（§12.3） */
const SHARED_COLORS = ['hedge', 'path', 'ink', 'keeper', 'correct', 'wrong', 'card'] as const satisfies readonly (keyof Theme)[];

describe('ZOO_THEME 與 style.css', () => {
  const variables = rootVariables(css);

  it.each(SHARED_COLORS)('--%s 和 theme.ts 相同', (token) => {
    expect(variables.get(token)?.toLowerCase()).toBe(ZOO_THEME[token].toLowerCase());
  });

  it('§12.3 的六個色碼照規格', () => {
    expect(ZOO_THEME).toMatchObject({
      hedge: '#2F5E3B',
      path: '#EAD9A6',
      ink: '#1F2A24',
      keeper: '#1C6FD1',
      correct: '#2E9E4F',
      wrong: '#C4402F',
    });
    expect(Object.values(ZOO_THEME.enemies)).toEqual(['#E03131', '#9C36B5', '#E8590C']);
  });

  it('題目字型：canvas 與 DOM 都以同一個字型開頭', () => {
    const family = ZOO_THEME.quizFontFamily;
    expect(ZOO_THEME.quizFont.startsWith(`${family},`)).toBe(true);
    expect(variables.get('font-quiz')).toMatch(new RegExp(`^['"]?${family}['"]?,`));
  });

  it('loader.ts 下載的每個字重都有 @font-face，而且字型檔在 public/fonts/', () => {
    const family = ZOO_THEME.quizFontFamily;
    const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)]
      .map((match) => match[1] ?? '')
      .filter((face) => new RegExp(`font-family:\\s*['"]?${family}['"]?\\s*;`).test(face))
      .map((face) => ({
        weight: /font-weight:\s*(\d+)/.exec(face)?.[1],
        url: /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(face)?.[1],
      }));
    const weights = faces.map((face) => face.weight).sort();
    expect(weights).toEqual(QUIZ_FONT_WEIGHTS.map(String).sort());
    // CSS 裡的 /fonts/… 對應到 public/fonts/…（建置時 Vite 會改寫成相對路徑）
    for (const face of faces) {
      expect(face.url).toMatch(/^\/fonts\//);
      expect(existsSync(new URL(`../../public${face.url ?? ''}`, import.meta.url))).toBe(true);
    }
  });

  it('後備字型（介面中文）和 --font-ui 相同', () => {
    const fallback = ZOO_THEME.quizFont.slice(`${ZOO_THEME.quizFontFamily}, `.length);
    expect(fallback.replaceAll('"', "'")).toBe(variables.get('font-ui'));
  });
});
