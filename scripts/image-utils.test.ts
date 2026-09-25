import { describe, expect, it } from 'vitest';
import { acceptLicense, defaultLicenseUrl, formatJson, htmlToText } from './image-utils';

describe('acceptLicense（§13.1）', () => {
  it.each([
    ['CC0', 'CC0 1.0'],
    ['CC0 1.0', 'CC0 1.0'],
    ['Public domain', 'Public domain'],
    ['PD-self', 'Public domain'],
    ['CC BY 4.0', 'CC BY 4.0'],
    ['CC BY-SA 3.0', 'CC BY-SA 3.0'],
    ['CC BY-SA 2.0 de', 'CC BY-SA 2.0 DE'],
    ['CC BY-SA 3.0 us', 'CC BY-SA 3.0 US'],
  ])('接受 %s', (input, expected) => {
    expect(acceptLicense(input)).toBe(expected);
  });

  it.each(['CC BY-NC 4.0', 'CC BY-NC-SA 3.0', 'CC BY-ND 2.0', 'GFDL', 'FAL', 'Fair use', '', 'All rights reserved'])(
    '不接受 %j',
    (input) => {
      expect(acceptLicense(input)).toBeNull();
    },
  );

  it('CC0 與公眾領域沒有附網址時補上預設值', () => {
    expect(defaultLicenseUrl('CC0 1.0')).toContain('publicdomain/zero');
    expect(defaultLicenseUrl('Public domain')).toContain('publicdomain/mark');
    expect(defaultLicenseUrl('CC BY 4.0')).toBeUndefined();
  });
});

describe('htmlToText', () => {
  it('去掉標籤與夾在作者欄位裡的表格，轉換 HTML entity', () => {
    const html =
      '<p><b><a href="x">Muhammad Mahdi Karim</a></b> <a href="y">Facebook</a>\n</p>' +
      '<table><tr><td>Wikimédia CH banner</td></tr></table>';
    expect(htmlToText(html)).toBe('Muhammad Mahdi Karim Facebook');
    expect(htmlToText('Tom &amp; Jerry&#39;s &#x4E2D;')).toBe("Tom & Jerry's 中");
  });
});

describe('formatJson', () => {
  it('短的放同一行，長的換行', () => {
    const value = {
      short: { a: 1, b: [1, 2] },
      long: { text: 'x'.repeat(120) },
    };
    expect(formatJson(value)).toBe(
      ['{', '  "short": { "a": 1, "b": [1, 2] },', '  "long": {', `    "text": "${'x'.repeat(120)}"`, '  }', '}'].join('\n'),
    );
  });

  it('解析回來和原本相同', () => {
    const value = { a: [{ id: 'q1', choices: [{ id: 'a', text: 'A "quoted"', correct: true }] }], b: null, c: {} };
    expect(JSON.parse(formatJson(value))).toEqual(value);
  });
});
