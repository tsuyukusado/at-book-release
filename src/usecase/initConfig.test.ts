import { describe, it, expect } from 'vitest';
import { buildDefaultConfigContent } from './initConfig';

describe('buildDefaultConfigContent', () => {
    it('引数が無ければ autoGenerate にプレースホルダーを入れる', () => {
        const content = buildDefaultConfigContent();
        const parsed = JSON.parse(content);

        expect(parsed).toEqual({
            paperSize:    'a6',
            writingMode:  'vertical',
            autoGenerate: ['your-novel.atb'],
        });
        expect(content.endsWith('\n')).toBe(true);
    });

    it('.atb ファイル名を渡すと autoGenerate にそのまま使う', () => {
        const content = buildDefaultConfigContent(['a.atb', 'b.atb']);
        const parsed = JSON.parse(content);

        expect(parsed.autoGenerate).toEqual(['a.atb', 'b.atb']);
    });
});
