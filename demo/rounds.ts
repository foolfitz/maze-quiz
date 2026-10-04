import type { Face, Round } from '@kancil-quiz/games-sdk';
import { normalizeForMatch } from '@kancil-quiz/text';
import type { Rng } from '../src/core/rng';
import type { DemoSet, FaceField, VocabItem } from './sets';

/** 每題的選項數：正解加 3 個干擾選項，與平台相同 */
export const OPTION_COUNT = 4;

type Option = Extract<Round, { shape: 'mcq' }>['options'][number];

/**
 * 詞彙組轉成迷宮要的選擇題。這是平台 @kancil-quiz/deck 的簡化版，示範頁不引入它：
 * 題目與選項依題組的 faces 組成，干擾選項從同題組的其他詞抽，答案看起來一樣的不會同時出現。
 * 沒有平台的相容檢查；遊戲會略過選項不足 2 個的題目。
 */
export function vocabRounds(
    set: DemoSet,
    mediaUrl: (src: string) => string | undefined,
    rng: Rng,
): Round[] {
    const { faces } = set;
    if (set.kind !== 'vocab' || faces === undefined)
        throw new Error('示範頁只支援詞彙組');

    const cards = set.entries.flatMap(({ id, item }) =>
        item === undefined
            ? []
            : [
                  {
                      entryId: id,
                      question: vocabFace(item, faces.prompt, mediaUrl),
                      answer: vocabFace(item, faces.answer, mediaUrl),
                  },
              ],
    );
    const key = (face: Face): string =>
        JSON.stringify([
            face.text === undefined
                ? null
                : normalizeForMatch(face.text, { language: set.language }),
            face.romanization ?? null,
            face.image ?? null,
            face.audio ?? null,
        ]);

    return rng.shuffle(cards).map((card) => {
        const used = new Set([key(card.answer)]);
        const distractors: Option[] = [];
        for (const other of rng.shuffle(cards)) {
            if (distractors.length >= OPTION_COUNT - 1) break;
            if (used.has(key(other.answer))) continue;
            used.add(key(other.answer));
            distractors.push({
                id: other.entryId,
                face: other.answer,
                correct: false,
            });
        }
        return {
            shape: 'mcq',
            entryId: card.entryId,
            prompt: card.question,
            options: rng.shuffle([
                { id: card.entryId, face: card.answer, correct: true },
                ...distractors,
            ]),
        };
    });
}

/** 依 faces 組出一面；text 與 translation_zh 都放進 Face.text（與平台相同） */
function vocabFace(
    item: VocabItem,
    fields: readonly FaceField[],
    mediaUrl: (src: string) => string | undefined,
): Face {
    const face: Face = {};
    for (const field of fields) {
        switch (field) {
            case 'text':
                face.text = item.text;
                break;
            case 'translation_zh':
                if (item.translation_zh) face.text = item.translation_zh;
                break;
            case 'romanization':
                if (item.romanization) face.romanization = item.romanization;
                break;
            case 'image': {
                const url = item.image && mediaUrl(item.image.src);
                if (url) face.image = url;
                break;
            }
            case 'audio': {
                const first = item.audio?.[0];
                const url = first && mediaUrl(first.src);
                if (url) face.audio = url;
                break;
            }
        }
    }
    return face;
}
