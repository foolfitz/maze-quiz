import { describe, expect, it } from 'vite-plus/test';
import { parseParams } from '../../demo/params';

const parse = (query: string) =>
    parseParams(new URLSearchParams(query), 'id-1-3');

describe('示範頁的網址參數', () => {
    it('沒有參數：預設題組、隨機種子、不顯示除錯畫面、遊戲照預設設定', () => {
        expect(parse('')).toEqual({
            ok: true,
            params: { set: 'id-1-3', seed: null, debug: false, options: {} },
        });
    });

    it('讀取題組、種子、除錯與遊戲設定', () => {
        expect(
            parse(
                '?set=vi-demo&seed=42&debug=1&difficulty=3&lives=5&timer=countDown&seconds=90',
            ),
        ).toEqual({
            ok: true,
            params: {
                set: 'vi-demo',
                seed: 42,
                debug: true,
                options: {
                    difficulty: 3,
                    lives: 5,
                    timerMode: 'countDown',
                    countDownSeconds: 90,
                },
            },
        });
    });

    it('空白的參數當作沒給', () => {
        expect(parse('?set=&seed=%20&lives=')).toEqual({
            ok: true,
            params: { set: 'id-1-3', seed: null, debug: false, options: {} },
        });
    });

    it('不合法的值全部列出來', () => {
        const result = parse(
            '?difficulty=4&lives=0&timer=slow&seconds=10&seed=-1',
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors).toEqual([
            'difficulty 要是 1、2、3 其中之一（收到「4」）',
            'lives 要是 1 到 9 的整數（收到「0」）',
            'timer 要是 none、countUp、countDown 其中之一（收到「slow」）',
            'seconds 要是 30 到 3600 的整數（收到「10」）',
            'seed 要是 0 到 4294967295 的整數（收到「-1」）',
        ]);
    });
});
