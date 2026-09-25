/**
 * 圖片處理腳本（§13.3）：npm run images
 *
 * 1. 讀 scripts/image-sources.json（每張圖選用的 Wikimedia Commons 檔案）
 * 2. 透過 MediaWiki API 取得授權資訊；有任何一張不在允許清單內就報錯停止，什麼都不寫
 * 3. 下載 1280 px 的縮圖到 scripts/.cache/（已經下載過就跳過）；原始檔常有十幾 MB，
 *    輸出只要 512 px，用縮圖就夠了，也比較不會被限流
 * 4. 長邊縮到 512 px、保持比例、不裁切，輸出 WebP（品質 80）
 * 5. 把授權資訊寫回 quiz.json 的 credit，再用遊戲本身的 validateQuiz 檢查一次
 *
 * 環境變數 WIKIMEDIA_CONTACT 可以加上聯絡方式（網址或 email），會放進 User-Agent；
 * Wikimedia 的使用政策希望 User-Agent 附上聯絡方式。
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { validateQuiz, type ImageCredit } from '../src/core/quiz';
import { acceptLicense, defaultLicenseUrl, formatJson, htmlToText, isRecord, type UnknownRecord } from './image-utils';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES_FILE = path.join(ROOT, 'scripts/image-sources.json');
const CACHE_DIR = path.join(ROOT, 'scripts/.cache');
const QUIZ_DIR = path.join(ROOT, 'public/quizzes/zoo-animals');
const QUIZ_FILE = path.join(QUIZ_DIR, 'quiz.json');

const API = 'https://commons.wikimedia.org/w/api.php';
const CONTACT = process.env['WIKIMEDIA_CONTACT'];
const USER_AGENT = `MazeQuiz/0.1 (educational maze quiz game; image credit script${CONTACT ? `; ${CONTACT}` : ''})`;

const MAX_EDGE = 512;
/** 下載的來源寬度；Wikimedia 只提供固定幾種縮圖寬度，1280 是其中之一 */
const SOURCE_WIDTH = 1280;
const WEBP_QUALITY = 80;
/** 圖片檔下載之間的間隔；連續下載太快會被限流（HTTP 429） */
const DOWNLOAD_INTERVAL_MS = 3000;
/** 被限流時最多等多久；Retry-After 比這個長就停下來，不要空等 */
const MAX_RETRY_WAIT_SECONDS = 120;

// ─── 共用的小工具 ─────────────────────────────────────────────

function stringField(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

/** 加上時間的進度訊息 */
function log(message: string): void {
  console.log(`[${new Date().toLocaleTimeString('zh-TW', { hour12: false })}] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** 腳本無法繼續時丟出的錯誤；訊息會直接顯示給使用者 */
class StopError extends Error {}

// ─── 讀取來源清單 ─────────────────────────────────────────────

async function readSources(): Promise<Map<string, string>> {
  const raw: unknown = JSON.parse(await readFile(SOURCES_FILE, 'utf8'));
  if (!isRecord(raw)) throw new StopError('scripts/image-sources.json 必須是物件：{ "圖片 id": "File:檔名" }');
  const sources = new Map<string, string>();
  for (const [id, title] of Object.entries(raw)) {
    if (typeof title !== 'string' || !title.startsWith('File:')) {
      throw new StopError(`scripts/image-sources.json 的 ${id}：必須是以 "File:" 開頭的檔名`);
    }
    sources.set(id, title);
  }
  return sources;
}

// ─── 授權（§13.1）────────────────────────────────────────────

// ─── Wikimedia API ────────────────────────────────────────────

interface RemoteImage {
  readonly id: string;
  readonly title: string; // 例如 "File:Foo.jpg"
  readonly downloadUrl: string; // 1280 px 縮圖；原圖比這個小時就是原圖
  readonly credit: ImageCredit;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new StopError(`Wikimedia API 回應 HTTP ${response.status}：${url}`);
  return response.json();
}

/** 一次查詢所有檔案的網址與授權資訊（API 一次最多 50 個標題） */
async function fetchImageInfo(sources: ReadonlyMap<string, string>): Promise<RemoteImage[]> {
  const titles = [...sources.values()];
  if (titles.length > 50) throw new StopError('一次最多處理 50 張圖');
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    titles: titles.join('|'),
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: String(SOURCE_WIDTH),
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist',
  });
  const data = await fetchJson(`${API}?${params}`);
  const query = isRecord(data) ? data['query'] : undefined;
  if (!isRecord(query)) throw new StopError('Wikimedia API 的回應格式不對');

  // API 會把標題正規化（例如底線換成空白），建立「原本 → 正規化後」的對照
  const normalized = new Map<string, string>();
  for (const entry of Array.isArray(query['normalized']) ? query['normalized'] : []) {
    if (!isRecord(entry)) continue;
    const from = stringField(entry, 'from');
    const to = stringField(entry, 'to');
    if (from !== undefined && to !== undefined) normalized.set(from, to);
  }
  const pages = new Map<string, UnknownRecord>();
  for (const page of Array.isArray(query['pages']) ? query['pages'] : []) {
    const title = isRecord(page) ? stringField(page, 'title') : undefined;
    if (isRecord(page) && title !== undefined) pages.set(title, page);
  }

  const problems: string[] = [];
  const images: RemoteImage[] = [];
  for (const [id, title] of sources) {
    const page = pages.get(normalized.get(title) ?? title);
    const info = page !== undefined && Array.isArray(page['imageinfo']) ? page['imageinfo'][0] : undefined;
    if (page === undefined || page['missing'] === true || !isRecord(info)) {
      problems.push(`${id}：Commons 上找不到 ${title}`);
      continue;
    }
    const meta = isRecord(info['extmetadata']) ? info['extmetadata'] : {};
    const metaValue = (key: string): string => {
      const field = meta[key];
      return isRecord(field) ? (stringField(field, 'value') ?? '') : '';
    };

    const shortName = metaValue('LicenseShortName');
    const license = acceptLicense(shortName);
    if (license === null) {
      problems.push(`${id}：授權「${shortName || '（沒有標示）'}」不在允許清單內（只接受 CC0、公眾領域、CC BY、CC BY-SA）`);
      continue;
    }
    const author = htmlToText(metaValue('Artist'));
    if (author === '' && license !== 'Public domain' && license !== 'CC0 1.0') {
      problems.push(`${id}：${license} 需要標示作者，但 Commons 上沒有作者資訊`);
      continue;
    }
    const licenseUrl = metaValue('LicenseUrl') || defaultLicenseUrl(license);
    const downloadUrl = stringField(info, 'thumburl') ?? stringField(info, 'url');
    const sourceUrl = stringField(info, 'descriptionurl');
    if (licenseUrl === undefined || downloadUrl === undefined || sourceUrl === undefined) {
      problems.push(`${id}：Commons 回傳的資料缺少網址`);
      continue;
    }

    images.push({
      id,
      title,
      downloadUrl,
      credit: {
        title: title.replace(/^File:/, ''),
        author: author || 'Unknown',
        license,
        licenseUrl: licenseUrl.replace(/^http:/, 'https:'),
        sourceUrl,
      },
    });
  }

  if (problems.length > 0) {
    throw new StopError(`以下圖片不能使用，請在 scripts/image-sources.json 換一張：\n  ${problems.join('\n  ')}`);
  }
  return images;
}

// ─── 下載與轉檔 ───────────────────────────────────────────────

/** 下載原始檔；遇到 429（太多請求）依 Retry-After 等一下再試 */
async function download(url: string, file: string): Promise<void> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (response.ok) {
      await writeFile(file, Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (response.status === 429 || response.status >= 500) {
      const waitSeconds = Number(response.headers.get('retry-after')) || 10 * attempt;
      if (waitSeconds > MAX_RETRY_WAIT_SECONDS) {
        throw new StopError(
          `Wikimedia 要求等 ${waitSeconds} 秒後再下載（HTTP ${response.status}），先停在這裡。\n` +
            '  已經下載的檔案留在 scripts/.cache/，稍後再執行 npm run images 會從中斷的地方繼續。',
        );
      }
      log(`  HTTP ${response.status}，${waitSeconds} 秒後重試…`);
      await sleep(waitSeconds * 1000);
      continue;
    }
    throw new StopError(
      `下載失敗（HTTP ${response.status}）：${url}\n` +
        (response.status === 403 ? '  可能被 Wikimedia 的防機器人機制擋下，請稍後再試或改用瀏覽器下載到 scripts/.cache/。' : ''),
    );
  }
  throw new StopError(`重試多次仍然下載失敗：${url}`);
}

async function processImage(image: RemoteImage): Promise<{ width: number; height: number }> {
  const extension = path.extname(new URL(image.downloadUrl).pathname).toLowerCase() || '.jpg';
  const cached = path.join(CACHE_DIR, `${image.id}${extension}`);
  if (await exists(cached)) {
    log(`  ${image.id}：使用快取`);
  } else {
    log(`  ${image.id}：下載 ${image.title}`);
    await download(image.downloadUrl, cached);
    await sleep(DOWNLOAD_INTERVAL_MS);
  }

  const output = path.join(QUIZ_DIR, 'images', `${image.id}.webp`);
  const info = await sharp(cached)
    .rotate() // 依照 EXIF 的方向轉正
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(output);
  return { width: info.width, height: info.height };
}

// ─── 寫回 quiz.json ───────────────────────────────────────────

async function writeCredits(images: readonly RemoteImage[]): Promise<void> {
  const quiz: unknown = JSON.parse(await readFile(QUIZ_FILE, 'utf8'));
  const assets = isRecord(quiz) ? quiz['images'] : undefined;
  if (!isRecord(quiz) || !isRecord(assets)) throw new StopError('quiz.json 沒有 images');

  // 只改 src 與 credit，其他欄位（例如手動寫的 alt）原封不動
  const updatedAssets: Record<string, unknown> = { ...assets };
  for (const image of images) {
    const asset = assets[image.id];
    if (!isRecord(asset)) throw new StopError(`quiz.json 的 images 裡沒有 ${image.id}`);
    updatedAssets[image.id] = { ...asset, src: `images/${image.id}.webp`, credit: image.credit };
  }
  const updated = { ...quiz, images: updatedAssets };

  const result = validateQuiz(updated);
  if (!result.ok) throw new StopError(`寫回之後 quiz.json 驗證失敗：\n  ${result.errors.join('\n  ')}`);
  await writeFile(QUIZ_FILE, `${formatJson(updated)}\n`);
  for (const warning of result.warnings) console.warn(`  [題組警告] ${warning}`);
}

// ─── 主程式 ───────────────────────────────────────────────────

async function main(): Promise<void> {
  const sources = await readSources();
  log(`查詢 ${sources.size} 張圖的授權資訊…`);
  const images = await fetchImageInfo(sources);

  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(path.join(QUIZ_DIR, 'images'), { recursive: true });
  log('下載並轉檔…');
  const sizes = new Map<string, { width: number; height: number }>();
  for (const image of images) sizes.set(image.id, await processImage(image));

  await writeCredits(images);

  console.log('\n| id | 來源檔案 | 作者 | 授權 | 輸出尺寸 |');
  console.log('|---|---|---|---|---|');
  for (const { id, credit } of images) {
    const size = sizes.get(id);
    console.log(`| ${id} | ${credit.title} | ${credit.author} | ${credit.license} | ${size?.width}×${size?.height} |`);
  }
  console.log(`\n完成：${images.length} 張圖，授權資訊已寫回 ${path.relative(ROOT, QUIZ_FILE)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof StopError ? `\n錯誤：${error.message}` : error);
  process.exitCode = 1;
});
