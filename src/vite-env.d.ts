/** Vite 在建置時替換的值（vite.config.ts 的 define） */
interface ImportMetaEnv {
  /** 建置時間（ISO 8601） */
  readonly VITE_BUILD_TIME: string;
}
