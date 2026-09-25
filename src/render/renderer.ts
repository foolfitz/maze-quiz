import type { DistanceField, Tile } from '../core/grid';
import type { Maze } from '../core/maze';
import type { Theme } from './theme';

/** 答案區裡要顯示的內容，順序與 maze.zones 相同 */
export interface ZoneLabel {
  readonly text: string;
}

/** 除錯覆蓋層要畫在迷宮上的資訊（§12.6） */
export interface DebugLayer {
  readonly distances: DistanceField; // 起點到各格的 BFS 距離
  readonly correct: readonly boolean[]; // 各園區的選項是否正確，順序與 maze.zones 相同
}

export interface Scene {
  readonly maze: Maze;
  readonly labels: readonly ZoneLabel[];
  readonly debug: DebugLayer | null;
}

/** 浮點數格座標，整數值是格子中心（§6.1） */
export interface TilePoint {
  readonly x: number;
  readonly y: number;
}

/** 選項文字的最小字級（CSS px，§8） */
const MIN_LABEL_FONT_PX = 12;

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly theme: Theme;
  private tileSize = 0; // CSS px

  constructor(canvas: HTMLCanvasElement, theme: Theme) {
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('瀏覽器不支援 Canvas 2D');
    this.canvas = canvas;
    this.ctx = ctx;
    this.theme = theme;
  }

  /**
   * 依可用空間決定格子邊長（§12.2）：floor(min(可用寬度 / width, 可用高度 / height))。
   * Canvas 的內部解析度乘上 devicePixelRatio，在平板上才不會模糊。
   */
  layout(availableWidth: number, availableHeight: number, gridWidth: number, gridHeight: number): void {
    const tileSize = Math.max(1, Math.floor(Math.min(availableWidth / gridWidth, availableHeight / gridHeight)));
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = tileSize * gridWidth;
    const cssHeight = tileSize * gridHeight;
    this.tileSize = tileSize;
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    // 之後都用 CSS px 畫，由 transform 換算成實際像素
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** 螢幕座標（例如 PointerEvent 的 clientX/Y）→ 浮點數格座標 */
  screenToTile(clientX: number, clientY: number): TilePoint {
    const rect = this.canvas.getBoundingClientRect();
    const size = this.tileSize || 1;
    return { x: (clientX - rect.left) / size - 0.5, y: (clientY - rect.top) / size - 0.5 };
  }

  draw(scene: Scene): void {
    if (this.tileSize === 0) return;
    const { ctx, theme } = this;
    const { grid } = scene.maze;

    ctx.fillStyle = theme.path;
    ctx.fillRect(0, 0, grid.width * this.tileSize, grid.height * this.tileSize);

    ctx.fillStyle = theme.hedge;
    for (const tile of grid.allTiles()) {
      if (!grid.isFloor(tile)) this.fillTile(tile);
    }

    scene.maze.zones.forEach((zone, i) => {
      const label = scene.labels[i];
      this.drawZoneCard(zone.rect, label?.text ?? '');
    });

    this.drawKeeper(scene.maze.start);

    if (scene.debug !== null) this.drawDebug(scene.maze, scene.debug);
  }

  // ─── 各部分的畫法 ───────────────────────────────────────────

  private fillTile(tile: Tile): void {
    const s = this.tileSize;
    this.ctx.fillRect(tile.x * s, tile.y * s, s, s);
  }

  /** 格子中心的 CSS px 座標 */
  private center(tile: TilePoint): { x: number; y: number } {
    return { x: (tile.x + 0.5) * this.tileSize, y: (tile.y + 0.5) * this.tileSize };
  }

  private drawZoneCard(rect: { x: number; y: number; width: number; height: number }, text: string): void {
    const { ctx, theme } = this;
    const s = this.tileSize;
    const pad = s * 0.12;
    const x = rect.x * s + pad;
    const y = rect.y * s + pad;
    const w = rect.width * s - pad * 2;
    const h = rect.height * s - pad * 2;

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, s * 0.25);
    ctx.fillStyle = theme.card;
    ctx.fill();
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.strokeStyle = theme.cardEdge;
    ctx.stroke();

    // 沒有圖片時只顯示文字，字級放大；放不下就縮小，最小 12 px
    const fitted = this.fitText(text, w - pad * 2, s * 0.8, 'bold');
    ctx.fillStyle = theme.ink;
    ctx.font = fitted.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitted.text, x + w / 2, y + h / 2);
  }

  /** 單行文字：先用最大字級，太寬就依比例縮小；縮到最小字級還放不下就截斷加「…」 */
  private fitText(text: string, maxWidth: number, maxSize: number, weight: string): { text: string; font: string } {
    const { ctx } = this;
    const fontAt = (size: number): string => `${weight} ${size}px ${this.theme.quizFont}`;
    const widthAt = (value: string, size: number): number => {
      ctx.font = fontAt(size);
      return ctx.measureText(value).width;
    };

    const fullWidth = widthAt(text, maxSize);
    if (fullWidth <= maxWidth) return { text, font: fontAt(maxSize) };
    const scaled = Math.floor((maxSize * maxWidth) / fullWidth);
    if (scaled >= MIN_LABEL_FONT_PX) return { text, font: fontAt(scaled) };

    let shortened = text;
    while (shortened.length > 1 && widthAt(`${shortened}…`, MIN_LABEL_FONT_PX) > maxWidth) {
      shortened = shortened.slice(0, -1);
    }
    return { text: `${shortened}…`, font: fontAt(MIN_LABEL_FONT_PX) };
  }

  private drawKeeper(position: TilePoint): void {
    const { ctx, theme } = this;
    const { x, y } = this.center(position);
    ctx.beginPath();
    ctx.arc(x, y, this.tileSize * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = theme.keeper;
    ctx.fill();
    ctx.lineWidth = Math.max(1, this.tileSize * 0.06);
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
  }

  private drawDebug(maze: Maze, debug: DebugLayer): void {
    const { ctx, theme } = this;
    const s = this.tileSize;
    const { grid } = maze;

    // 格線
    ctx.strokeStyle = 'rgba(31, 42, 36, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= grid.width; x++) {
      ctx.moveTo(x * s + 0.5, 0);
      ctx.lineTo(x * s + 0.5, grid.height * s);
    }
    for (let y = 0; y <= grid.height; y++) {
      ctx.moveTo(0, y * s + 0.5);
      ctx.lineTo(grid.width * s, y * s + 0.5);
    }
    ctx.stroke();

    // 起點到各格的 BFS 距離
    ctx.font = `${Math.max(9, Math.floor(s * 0.32))}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(31, 42, 36, 0.55)';
    for (const tile of grid.allTiles()) {
      const d = debug.distances.get(tile);
      if (d === null || d === 0) continue;
      // 出生點另外標示，不畫距離以免文字重疊
      if (maze.enemySpawns.some((spawn) => spawn.x === tile.x && spawn.y === tile.y)) continue;
      const { x, y } = this.center(tile);
      ctx.fillText(String(d), x, y);
    }

    // 各園區的對錯：顏色之外一定搭配 ✓ ✗ 符號（§12.5）
    maze.zones.forEach((zone, i) => {
      const correct = debug.correct[i] ?? false;
      const cx = (zone.rect.x + zone.rect.width) * s - s * 0.3;
      const cy = zone.rect.y * s + s * 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = correct ? theme.correct : theme.wrong;
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${Math.floor(s * 0.34)}px system-ui, sans-serif`;
      ctx.fillText(correct ? '✓' : '✗', cx, cy + 1);
    });

    // 敵人出生點
    maze.enemySpawns.forEach((spawn, i) => {
      const { x, y } = this.center(spawn);
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.enemies[i % theme.enemies.length] ?? theme.wrong;
      ctx.strokeRect(x - s * 0.3, y - s * 0.3, s * 0.6, s * 0.6);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(`E${i + 1}`, x, y);
    });
  }
}
