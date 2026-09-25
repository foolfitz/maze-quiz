import { DIRECTION_VECTORS, type DistanceField, type Rect, type Tile } from '../core/grid';
import type { Maze } from '../core/maze';
import type { Direction } from '../core/types';
import type { Theme } from './theme';

/** 答案區裡要顯示的內容，順序與 maze.zones 相同 */
export interface ZoneLabel {
  readonly text: string;
  /** 已經載入的選項圖片；沒有圖片或載入失敗時是 null，只顯示文字 */
  readonly image: HTMLImageElement | null;
}

/** 除錯覆蓋層要畫在迷宮上的資訊（§12.6） */
export interface DebugLayer {
  readonly distances: DistanceField; // 起點到各格的 BFS 距離
  readonly correct: readonly boolean[]; // 各園區的選項是否正確，順序與 maze.zones 相同
}

/** 浮點數格座標，整數值是格子中心（§6.1） */
export interface TilePoint {
  readonly x: number;
  readonly y: number;
}

export interface PlayerView extends TilePoint {
  readonly dir: Direction | null;
  readonly pendingDir: Direction | null;
}

/** 走進園區時的大 ✓ ✗ */
export interface ZoneFeedback {
  readonly zoneIndex: number;
  readonly kind: 'correct' | 'wrong';
}

export interface Scene {
  readonly maze: Maze;
  readonly labels: readonly ZoneLabel[];
  /** 各園區是否已封住，順序與 maze.zones 相同；封門時會換成新陣列 */
  readonly sealed: readonly boolean[];
  readonly feedback: ZoneFeedback | null;
  readonly debug: DebugLayer | null;
  readonly player: PlayerView;
}

/** 選項文字的最小字級（CSS px，§8） */
const MIN_LABEL_FONT_PX = 12;
/** 碰壁抖動的長度 */
const BUMP_MS = 180;

/** 各方向的角度（弧度），畫箭頭時用來旋轉 */
const DIRECTION_ANGLES: Readonly<Record<Direction, number>> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
};

/** 靜態圖層是依哪些資料畫出來的；任何一項變了就重畫 */
interface StaticLayerKey {
  readonly maze: Maze;
  readonly labels: readonly ZoneLabel[];
  readonly sealed: readonly boolean[];
  readonly debug: DebugLayer | null;
  readonly tileSize: number;
  readonly dpr: number;
}

export class Renderer {
  /** prefers-reduced-motion 時關閉碰壁抖動（§12.5） */
  reducedMotion = false;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly theme: Theme;
  private tileSize = 0; // CSS px
  private dpr = 1;

  // 牆、答案區與除錯資訊在一關之內不會變，先畫到另一張 canvas，每幀直接貼上
  private readonly staticLayer: HTMLCanvasElement;
  private readonly staticCtx: CanvasRenderingContext2D;
  private staticKey: StaticLayerKey | null = null;

  private bumpState: { readonly direction: Direction; readonly startMs: number } | null = null;

  constructor(canvas: HTMLCanvasElement, theme: Theme) {
    this.canvas = canvas;
    this.ctx = get2dContext(canvas);
    this.staticLayer = document.createElement('canvas');
    this.staticCtx = get2dContext(this.staticLayer);
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
    this.dpr = dpr;
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    const resize = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void => {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      // 之後都用 CSS px 畫，由 transform 換算成實際像素
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize(this.canvas, this.ctx);
    resize(this.staticLayer, this.staticCtx);
    this.staticKey = null;
  }

  /** 螢幕座標（例如 PointerEvent 的 clientX/Y）→ 浮點數格座標 */
  screenToTile(clientX: number, clientY: number): TilePoint {
    const rect = this.canvas.getBoundingClientRect();
    const size = this.tileSize || 1;
    return { x: (clientX - rect.left) / size - 0.5, y: (clientY - rect.top) / size - 0.5 };
  }

  /** 碰壁回饋：角色往牆的方向輕微抖動 */
  bump(direction: Direction, nowMs: number): void {
    if (!this.reducedMotion) this.bumpState = { direction, startMs: nowMs };
  }

  draw(scene: Scene, nowMs: number): void {
    if (this.tileSize === 0) return;
    this.ensureStaticLayer(scene);
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.staticLayer, 0, 0);
    ctx.restore();

    this.drawPlayer(scene.player, nowMs);

    // 走進園區時的大 ✓ ✗，蓋在玩家上面
    const zone = scene.feedback === null ? undefined : scene.maze.zones[scene.feedback.zoneIndex];
    if (scene.feedback !== null && zone !== undefined) {
      const { rect } = zone;
      const { x, y } = this.center({ x: rect.x + (rect.width - 1) / 2, y: rect.y + (rect.height - 1) / 2 });
      this.drawMark(ctx, x, y, this.tileSize * 0.95, scene.feedback.kind);
    }
  }

  // ─── 靜態圖層 ───────────────────────────────────────────────

  private ensureStaticLayer(scene: Scene): void {
    const key: StaticLayerKey = {
      maze: scene.maze,
      labels: scene.labels,
      sealed: scene.sealed,
      debug: scene.debug,
      tileSize: this.tileSize,
      dpr: this.dpr,
    };
    const old = this.staticKey;
    if (
      old !== null &&
      old.maze === key.maze &&
      old.labels === key.labels &&
      old.sealed === key.sealed &&
      old.debug === key.debug &&
      old.tileSize === key.tileSize &&
      old.dpr === key.dpr
    ) {
      return;
    }
    this.staticKey = key;

    const ctx = this.staticCtx;
    const { theme, tileSize: s } = this;
    const { grid } = scene.maze;

    ctx.fillStyle = theme.path;
    ctx.fillRect(0, 0, grid.width * s, grid.height * s);

    ctx.fillStyle = theme.hedge;
    for (const tile of grid.allTiles()) {
      if (!grid.isFloor(tile)) ctx.fillRect(tile.x * s, tile.y * s, s, s);
    }

    scene.maze.zones.forEach((zone, i) => {
      const sealed = scene.sealed[i] ?? false;
      this.drawZoneCard(ctx, zone.rect, scene.labels[i] ?? { text: '', image: null }, sealed);
      if (sealed) this.drawClosedGate(ctx, zone.door, zone.doorSide);
    });

    if (scene.debug !== null) this.drawDebug(ctx, scene.maze, scene.debug);
  }

  /** 格子中心的 CSS px 座標 */
  private center(tile: TilePoint): { x: number; y: number } {
    return { x: (tile.x + 0.5) * this.tileSize, y: (tile.y + 0.5) * this.tileSize };
  }

  private drawZoneCard(ctx: CanvasRenderingContext2D, rect: Rect, label: ZoneLabel, sealed: boolean): void {
    const { theme } = this;
    const s = this.tileSize;
    const pad = s * 0.12;
    const x = rect.x * s + pad;
    const y = rect.y * s + pad;
    const w = rect.width * s - pad * 2;
    const h = rect.height * s - pad * 2;

    roundedRectPath(ctx, x, y, w, h, s * 0.25);
    ctx.fillStyle = theme.card;
    ctx.fill();
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.strokeStyle = theme.cardEdge;
    ctx.stroke();

    ctx.fillStyle = theme.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (label.image === null) {
      // 沒有圖片時只顯示文字，字級放大；放不下就縮小，最小 12 px（§8）
      const fitted = this.fitText(ctx, label.text, w - pad * 2, s * 0.8, 'bold');
      ctx.font = fitted.font;
      ctx.fillText(fitted.text, x + w / 2, y + h / 2);
    } else {
      // 有圖片：圖片在上、文字在下。圖片等比縮放、不裁切，放進剩下的空間
      const textHeight = label.text === '' ? 0 : Math.max(MIN_LABEL_FONT_PX, s * 0.42) * 1.25;
      const box = { x: x + pad, y: y + pad, width: w - pad * 2, height: h - pad * 2 - textHeight };
      drawContained(ctx, label.image, box);
      if (label.text !== '') {
        const fitted = this.fitText(ctx, label.text, w - pad * 2, s * 0.42, 'bold');
        ctx.font = fitted.font;
        ctx.fillText(fitted.text, x + w / 2, y + h - pad - textHeight / 2);
      }
    }

    // 答錯封住的園區：變暗並保留 ✗（§8）；✗ 放在角落，選項文字仍看得到
    if (sealed) {
      roundedRectPath(ctx, x, y, w, h, s * 0.25);
      ctx.fillStyle = 'rgba(31, 42, 36, 0.45)';
      ctx.fill();
      this.drawMark(ctx, x + w - s * 0.32, y + s * 0.32, s * 0.3, 'wrong');
    }
  }

  /** 關上的柵門：門的位置畫成步道底色，再畫一道橫過通道的柵欄 */
  private drawClosedGate(ctx: CanvasRenderingContext2D, door: Tile, side: Direction): void {
    const { theme } = this;
    const s = this.tileSize;
    const x = door.x * s;
    const y = door.y * s;
    ctx.fillStyle = theme.path;
    ctx.fillRect(x, y, s, s);

    // 通道是水平的（門開在左右兩側）時，柵欄是直的；反之是橫的
    const across = side === 'left' || side === 'right' ? 'vertical' : 'horizontal';
    const thickness = s * 0.3;
    ctx.fillStyle = theme.wrong;
    if (across === 'vertical') ctx.fillRect(x + (s - thickness) / 2, y, thickness, s);
    else ctx.fillRect(x, y + (s - thickness) / 2, s, thickness);

    // 柵欄上的白色橫條，讓它看起來像柵門而不只是一條紅線
    ctx.fillStyle = '#FFFFFF';
    for (const t of [0.3, 0.7]) {
      if (across === 'vertical') ctx.fillRect(x + (s - thickness) / 2, y + s * t - s * 0.04, thickness, s * 0.08);
      else ctx.fillRect(x + s * t - s * 0.04, y + (s - thickness) / 2, s * 0.08, thickness);
    }
  }

  /** 圓形的 ✓ 或 ✗ 標記。對錯不只靠顏色，一律搭配符號（§12.5）。 */
  private drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, kind: 'correct' | 'wrong'): void {
    const { theme } = this;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = kind === 'correct' ? theme.correct : theme.wrong;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, radius * 0.12);
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.round(radius * 1.25)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(kind === 'correct' ? '✓' : '✗', cx, cy + radius * 0.06);
  }

  /** 單行文字：先用最大字級，太寬就依比例縮小；縮到最小字級還放不下就截斷加「…」 */
  private fitText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    maxSize: number,
    weight: string,
  ): { text: string; font: string } {
    const fontAt = (size: number): string => `${weight} ${size}px ${this.theme.quizFont}`;
    const widthAt = (value: string, size: number): number => {
      ctx.font = fontAt(size);
      return ctx.measureText(value).width;
    };

    const fullWidth = widthAt(text, maxSize);
    if (fullWidth <= maxWidth) return { text, font: fontAt(maxSize) };
    const scaled = Math.floor((maxSize * maxWidth) / fullWidth);
    if (scaled >= MIN_LABEL_FONT_PX) return { text, font: fontAt(scaled) };

    // 以 code point 為單位刪字，才不會把 emoji 之類的字元切成一半
    const chars = [...text];
    while (chars.length > 1 && widthAt(`${chars.join('')}…`, MIN_LABEL_FONT_PX) > maxWidth) chars.pop();
    return { text: `${chars.join('')}…`, font: fontAt(MIN_LABEL_FONT_PX) };
  }

  private drawDebug(ctx: CanvasRenderingContext2D, maze: Maze, debug: DebugLayer): void {
    const { theme } = this;
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

    // 各園區的對錯（左上角，不和封住的 ✗ 重疊）
    maze.zones.forEach((zone, i) => {
      const correct = debug.correct[i] ?? false;
      this.drawMark(ctx, zone.rect.x * s + s * 0.3, zone.rect.y * s + s * 0.3, s * 0.22, correct ? 'correct' : 'wrong');
    });
    ctx.font = `${Math.max(9, Math.floor(s * 0.32))}px ui-monospace, monospace`;

    // 敵人出生點
    ctx.font = `${Math.max(9, Math.floor(s * 0.32))}px ui-monospace, monospace`;
    maze.enemySpawns.forEach((spawn: Tile, i) => {
      const { x, y } = this.center(spawn);
      const color = theme.enemies[i % theme.enemies.length] ?? theme.wrong;
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.strokeRect(x - s * 0.3, y - s * 0.3, s * 0.6, s * 0.6);
      ctx.fillStyle = color;
      ctx.fillText(`E${i + 1}`, x, y);
    });
  }

  // ─── 動態部分 ───────────────────────────────────────────────

  private drawPlayer(player: PlayerView, nowMs: number): void {
    const { ctx, theme } = this;
    const s = this.tileSize;
    let { x, y } = this.center(player);

    if (this.bumpState !== null) {
      const t = (nowMs - this.bumpState.startMs) / BUMP_MS;
      if (t < 0 || t >= 1) {
        this.bumpState = null;
      } else {
        // 往牆的方向來回抖兩下，幅度逐漸變小
        const v = DIRECTION_VECTORS[this.bumpState.direction];
        const offset = Math.sin(t * Math.PI * 4) * (1 - t) * s * 0.12;
        x += v.x * offset;
        y += v.y * offset;
      }
    }

    const r = s * 0.36;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = theme.keeper;
    ctx.fill();
    ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();

    // 目前方向：角色身上的小箭頭
    if (player.dir !== null) {
      this.withRotation(x, y, DIRECTION_ANGLES[player.dir], () => {
        ctx.beginPath();
        ctx.moveTo(r * 0.62, 0);
        ctx.lineTo(-r * 0.28, -r * 0.46);
        ctx.lineTo(-r * 0.28, r * 0.46);
        ctx.closePath();
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
      });
    }

    // 等待轉向：角色外面的虛線箭頭
    if (player.pendingDir !== null) {
      this.withRotation(x, y, DIRECTION_ANGLES[player.pendingDir], () => {
        ctx.strokeStyle = theme.keeper;
        ctx.fillStyle = theme.keeper;
        ctx.lineWidth = Math.max(1.5, s * 0.08);
        ctx.setLineDash([s * 0.1, s * 0.08]);
        ctx.beginPath();
        ctx.moveTo(r * 1.2, 0);
        ctx.lineTo(r * 2.0, 0);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(r * 2.5, 0);
        ctx.lineTo(r * 1.95, -r * 0.4);
        ctx.lineTo(r * 1.95, r * 0.4);
        ctx.closePath();
        ctx.fill();
      });
    }
  }

  /** 以 (x, y) 為原點、旋轉 angle 之後畫圖，畫完還原 */
  private withRotation(x: number, y: number, angle: number, draw: () => void): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    draw();
    ctx.restore();
  }
}

/** 把圖片等比縮放後置中放進 box，不裁切 */
function drawContained(ctx: CanvasRenderingContext2D, image: HTMLImageElement, box: Rect): void {
  const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
  if (!Number.isFinite(scale) || scale <= 0) return;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, box.x + (box.width - width) / 2, box.y + (box.height - height) / 2, width, height);
}

/**
 * 圓角矩形的路徑。不用 ctx.roundRect()：它要 Safari 16 以上，
 * 學校裡停在 iPadOS 15 的舊 iPad 會直接出錯、畫面全白。
 */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('瀏覽器不支援 Canvas 2D');
  return ctx;
}
