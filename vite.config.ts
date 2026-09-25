import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相對路徑：建置結果放在任何子資料夾都能直接開
  base: './',
  // 不做 SPA fallback：找不到的檔案回 404，而不是回傳 index.html
  appType: 'mpa',
  // 建置時間，顯示在標題畫面：試玩時一看就知道裝置拿到的是不是新版（Safari 有時會用快取的舊版）
  define: {
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
