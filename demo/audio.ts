// 遊戲用的音訊，做法與平台的宿主相同：iOS 只允許在使用者手勢中開始播放，
// 所以按「開始」時先用同一個 <audio> 播一段無聲音訊解鎖，之後一律重複使用這個元素。

const SILENCE =
    'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

export class AudioHost {
    private readonly element = new Audio();

    /** 在「開始」的 click 中呼叫 */
    unlock(): void {
        this.element.src = SILENCE;
        this.element.play().catch(() => undefined);
    }

    play(url: string): Promise<void> {
        this.element.pause();
        this.element.src = url;
        return this.element.play();
    }

    stopAll(): void {
        this.element.pause();
    }
}
