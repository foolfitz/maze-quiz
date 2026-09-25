import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相對路徑：建置結果放在任何子資料夾都能直接開
  base: './',
  // 不做 SPA fallback：找不到的檔案回 404，而不是回傳 index.html
  appType: 'mpa',
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
