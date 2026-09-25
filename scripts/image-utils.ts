/** 圖片處理腳本用到的純函式；不碰檔案與網路，方便測試 */

export type UnknownRecord = Readonly<Record<string, unknown>>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── 授權（§13.1）────────────────────────────────────────────

/**
 * 只接受 CC0、公眾領域、CC BY、CC BY-SA（任何版本）。
 * 回傳顯示用的授權名稱；不接受時回傳 null。
 */
export function acceptLicense(shortName: string): string | null {
  const name = shortName.trim();
  if (/\b(NC|ND)\b/i.test(name)) return null;
  if (/^CC0( 1\.0)?$/i.test(name)) return 'CC0 1.0';
  if (/^(Public domain|PD\b.*)$/i.test(name)) return 'Public domain';
  const cc = /^CC BY(-SA)? (\d\.\d)( [A-Za-z-]+)?$/i.exec(name);
  if (cc !== null) return `CC BY${(cc[1] ?? '').toUpperCase()} ${cc[2] ?? ''}${(cc[3] ?? '').toUpperCase()}`;
  return null;
}

/** 沒有附授權網址時的預設值 */
export function defaultLicenseUrl(license: string): string | undefined {
  if (license === 'CC0 1.0') return 'https://creativecommons.org/publicdomain/zero/1.0/';
  if (license === 'Public domain') return 'https://creativecommons.org/publicdomain/mark/1.0/';
  return undefined;
}

/** extmetadata 裡的作者是一段 HTML（有時還夾著表格），轉成純文字 */
export function htmlToText(html: string): string {
  const entities: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return html
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(parseInt(code.slice(2), 16));
      if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
      return entities[code.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── JSON 排版 ────────────────────────────────────────────────

/** 短的物件與陣列放在同一行，太長才換行；和手寫的 quiz.json 風格接近 */
export function formatJson(value: unknown, indent = '', prefixLength = 0): string {
  const flat = inlineJson(value);
  const container = Array.isArray(value) || isRecord(value);
  if (!container || indent.length + prefixLength + flat.length <= 100) return flat;
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    return `[\n${value.map((item) => inner + formatJson(item, inner)).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(isRecord(value) ? value : {}).map(([key, item]) => {
    const prefix = `${JSON.stringify(key)}: `;
    return inner + prefix + formatJson(item, inner, prefix.length);
  });
  return `{\n${entries.join(',\n')}\n${indent}}`;
}

function inlineJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inlineJson).join(', ')}]`;
  if (isRecord(value)) {
    const entries = Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${inlineJson(item)}`);
    return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
  }
  return JSON.stringify(value) ?? 'null';
}
