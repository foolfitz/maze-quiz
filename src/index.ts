// 迷宮問答（docs/SPEC.md 7.5）：由原本獨立運作的 maze-quiz 網頁改寫成遊戲模組。
// 中繼資料（id、requires、optionsSchema…）在 meta.ts，老師端只需要那些時可以 import '…/meta'。

import type { GameModule } from '@kancil-quiz/games-sdk';
import { meta, type MazeQuizOptions } from './meta';
import { mount } from './mount';

export type { MazeQuizOptions } from './meta';

export const mazeQuiz: GameModule<MazeQuizOptions> = { ...meta, mount };

export default mazeQuiz;
