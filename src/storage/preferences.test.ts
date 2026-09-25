import { describe, expect, it } from 'vitest';
import {
  loadDifficulty,
  loadDpadSide,
  loadLanguage,
  saveDifficulty,
  saveDpadSide,
  saveLanguage,
  type PreferenceStorage,
} from './preferences';

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

  it.each(['left', 'right', 'off'] as const)('存了 %s 之後讀得回來', (side) => {
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

describe('難度的偏好設定', () => {
  it('沒存過時用預設值；存了之後讀得回來', () => {
    const storage = memoryStorage();
    expect(loadDifficulty(storage, 2)).toBe(2);
    saveDifficulty(storage, 3);
    expect(loadDifficulty(storage, 2)).toBe(3);
  });

  it('存的值不是 1–3 時用預設值（例如被手動改壞）', () => {
    const storage = memoryStorage();
    storage.setItem('maze-quiz:difficulty', '5');
    expect(loadDifficulty(storage, 2)).toBe(2);
  });

  it('localStorage 無法使用時照樣用預設值', () => {
    expect(() => saveDifficulty(brokenStorage, 1)).not.toThrow();
    expect(loadDifficulty(brokenStorage, 2)).toBe(2);
  });
});

describe('語言的偏好設定', () => {
  const languages = ['en', 'zh-Hant'];

  it('每個題組分開記', () => {
    const storage = memoryStorage();
    saveLanguage(storage, 'zoo-animals', 'zh-Hant');
    expect(loadLanguage(storage, 'zoo-animals', languages, 'en')).toBe('zh-Hant');
    expect(loadLanguage(storage, 'other-quiz', languages, 'en')).toBe('en');
  });

  it('題組已經沒有這個語言時用預設值', () => {
    const storage = memoryStorage();
    saveLanguage(storage, 'zoo-animals', 'fr');
    expect(loadLanguage(storage, 'zoo-animals', languages, 'en')).toBe('en');
  });

  it('localStorage 無法使用時照樣用預設值', () => {
    expect(() => saveLanguage(brokenStorage, 'zoo-animals', 'zh-Hant')).not.toThrow();
    expect(loadLanguage(brokenStorage, 'zoo-animals', languages, 'en')).toBe('en');
  });
});
