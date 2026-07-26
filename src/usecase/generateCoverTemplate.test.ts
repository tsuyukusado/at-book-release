import { describe, it, expect } from 'vitest';
import { generateCoverTemplate } from './generateCoverTemplate';
import type { CoverSpec } from '../domain/coverSpec';

const spec: CoverSpec = {
    paperSize:             'a6',
    writingMode:           'vertical',
    pageCount:             160,
    bodyPaperThicknessMm:  0.09,
    coverPaperThicknessMm: 0.35,
};

describe('generateCoverTemplate', () => {
    it('fileWriter に SVG を書き出し、svgPath を返す', async () => {
        const written: { path: string; content: string }[] = [];
        const fileWriter = { write: async (path: string, content: string) => { written.push({ path, content }); } };

        const out = await generateCoverTemplate({ fileWriter }, { spec, outputPath: 'dist/cover.svg' });

        expect(out.svgPath).toBe('dist/cover.svg');
        expect(written.length).toBe(1);
        expect(written[0]!.path).toBe('dist/cover.svg');
        expect(written[0]!.content).toContain('<svg');
    });
});
