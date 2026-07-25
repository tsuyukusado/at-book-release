import { describe, it, expect } from 'vitest';
import { buildDefaultConfigContent } from './initConfig';

describe('buildDefaultConfigContent', () => {
    it('デフォルト値と autoGenerate のプレースホルダーを含む JSON を返す', () => {
        const content = buildDefaultConfigContent();
        const parsed = JSON.parse(content);

        expect(parsed).toEqual({
            paperSize:    'a6',
            writingMode:  'vertical',
            autoGenerate: ['your-novel.atb'],
        });
        expect(content.endsWith('\n')).toBe(true);
    });
});
