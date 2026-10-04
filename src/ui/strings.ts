/** 介面文字（正體中文）。題目內容的語言由題組決定，介面不跟著換。 */
export const STRINGS = {
    // 遊戲畫面
    questionNumber: (current: number, total: number) =>
        `第 ${current} / ${total} 題`,
    ready: '預備',
    lives: (count: number) => `剩下 ${count} 條命`,
    pause: '暫停',
    replayAudio: '再聽一次',
    clockCountUp: (time: string) => `用時 ${time}`,
    clockCountDown: (time: string) => `剩下 ${time}`,

    // 暫停
    pausedTitle: '暫停',
    resume: '繼續',
    dpadSetting: '觸控方向鍵',
    dpadSides: { left: '左邊', right: '右邊', off: '不顯示' },

    // 結束（之後由宿主換成成績畫面）
    ended: {
        gameOver: '沒有命了',
        timeUp: '時間到',
        finished: '全部完成！',
    },
} as const;
