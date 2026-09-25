import { describe, expect, it } from 'vitest';
import { loadDpadSide, saveDpadSide, type PreferenceStorage } from './preferences';

/** 用 Map 模擬 localStorage */
function memoryStorage(): PreferenceStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

/** 每次讀寫都丟錯，模擬被封鎖的 localStorage */
const brokenStorage: PreferenceStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('方向鍵位置的偏好設定', () => {
  it('沒存過時用預設值', () => {
    expect(loadDpadSide(memoryStorage(), 'right')).toBe('right');
    expect(loadDpadSide(memoryStorage(), 'off')).toBe('off');
  });

  it.each(['right', 'left', 'off'] as const)('存了 %s 之後讀得回來', (side) => {
    const storage = memoryStorage();
    saveDpadSide(storage, side);
    expect(loadDpadSide(storage, 'right')).toBe(side);
  });

  it('存的值不認得時用預設值', () => {
    const storage = memoryStorage();
    storage.setItem('maze-quiz:dpad', 'middle');
    expect(loadDpadSide(storage, 'left')).toBe('left');
  });

  it('localStorage 無法使用時不丟錯，照樣用預設值', () => {
    expect(() => saveDpadSide(brokenStorage, 'left')).not.toThrow();
    expect(loadDpadSide(brokenStorage, 'right')).toBe('right');
    expect(loadDpadSide(null, 'off')).toBe('off');
  });
});
