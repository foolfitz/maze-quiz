import { describe, expect, it } from 'vite-plus/test';
import { startLoop } from '../src/loop';
import { createScope } from '../src/scope';
import { createFakeEnvironment } from './fakeDom';

describe('createScope', () => {
    it('dispose() 移除所有監聽、計時器與 requestAnimationFrame', () => {
        const env = createFakeEnvironment();
        const scope = createScope(env.win);
        const target = env.doc.createElement('div');
        let clicks = 0;
        scope.listen(target, 'click', () => clicks++);
        scope.listen(env.win, 'keydown', () => undefined);
        scope.timeout(() => undefined, 1000);
        scope.frame(() => undefined);
        const cleaned: string[] = [];
        scope.add(() => cleaned.push('observer'));

        target.dispatchEvent(new Event('click'));
        expect(clicks).toBe(1);
        expect(env.listenerCount()).toBe(2);
        expect(env.pendingTimers()).toBe(1);
        expect(env.pendingFrames()).toBe(1);

        scope.dispose();
        expect(env.listenerCount()).toBe(0);
        expect(env.pendingTimers()).toBe(0);
        expect(env.pendingFrames()).toBe(0);
        expect(cleaned).toEqual(['observer']);
        target.dispatchEvent(new Event('click'));
        expect(clicks).toBe(1);

        // 清理之後再登記的東西立刻清掉，不會殘留
        scope.listen(env.win, 'keydown', () => undefined);
        scope.timeout(() => undefined, 1000);
        expect(env.listenerCount()).toBe(0);
        expect(env.pendingTimers()).toBe(0);
        scope.dispose();
    });

    it('觸發過的計時器與 frame 會自動取消登記', () => {
        const env = createFakeEnvironment();
        const scope = createScope(env.win);
        let fired = 0;
        scope.timeout(() => fired++, 10);
        scope.frame(() => fired++);
        env.runTimers();
        env.runFrame(16);
        expect(fired).toBe(2);
        expect(env.pendingTimers()).toBe(0);
        expect(env.pendingFrames()).toBe(0);
        scope.dispose();
    });

    it('子範圍可以單獨清理，父範圍清理時也會一起清理', () => {
        const env = createFakeEnvironment();
        const scope = createScope(env.win);
        const first = scope.child();
        first.listen(env.win, 'resize', () => undefined);
        first.dispose();
        expect(env.listenerCount()).toBe(0);

        const second = scope.child();
        second.listen(env.win, 'resize', () => undefined);
        second.timeout(() => undefined, 100);
        scope.dispose();
        expect(second.disposed).toBe(true);
        expect(env.listenerCount()).toBe(0);
        expect(env.pendingTimers()).toBe(0);
    });
});

describe('startLoop', () => {
    it('以固定步長更新，每幀畫一次；stop() 之後不再排下一幀', () => {
        const env = createFakeEnvironment();
        const scope = createScope(env.win);
        const updates: number[] = [];
        let renders = 0;
        const loop = startLoop(
            scope,
            { update: (dt) => updates.push(dt), render: () => renders++ },
            60,
            250,
        );
        env.runFrame(0);
        env.runFrame(60);
        expect(updates).toHaveLength(3);
        expect(renders).toBe(2);
        // 單幀 dt 上限 250 ms：切回分頁時不會一次補跑太多步
        env.runFrame(10_000);
        expect(updates).toHaveLength(3 + 15);
        loop.stop();
        expect(loop.running).toBe(false);
        expect(env.pendingFrames()).toBe(0);
        scope.dispose();
    });
});
