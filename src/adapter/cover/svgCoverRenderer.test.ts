import { describe, it, expect } from 'vitest';
import { renderCoverSvg } from './svgCoverRenderer';
import type { CoverSpec } from '../../domain/coverSpec';

const baseSpec: CoverSpec = {
    paperSize:             'a5',
    writingMode:           'horizontal',
    pageCount:             160,
    bodyPaperThicknessMm:  0.09,
    coverPaperThicknessMm: 0.35,
};

// 背幅 = ceil(160/2) * 0.09 + 0.35 * 2 = 80 * 0.09 + 0.7 = 7.2 + 0.7 = 7.9
const EXPECTED_SPINE_MM = 7.9;

describe('紙厚の変更が背幅に反映される', () => {
    it('デフォルト設定で背幅が正しく計算される', () => {
        const svg = renderCoverSvg(baseSpec);
        expect(svg).toContain(`背 ${EXPECTED_SPINE_MM}mm`);
    });

    it('本文紙厚を変えると背幅が変わる', () => {
        // ceil(160/2) * 0.12 + 0.35 * 2 = 80 * 0.12 + 0.7 = 9.6 + 0.7 = 10.3
        const svg = renderCoverSvg({ ...baseSpec, bodyPaperThicknessMm: 0.12 });
        expect(svg).toContain('背 10.3mm');
        expect(svg).not.toContain(`背 ${EXPECTED_SPINE_MM}mm`);
    });

    it('表紙紙厚を変えると背幅が変わる', () => {
        // ceil(160/2) * 0.09 + 0.40 * 2 = 7.2 + 0.8 = 8.0
        const svg = renderCoverSvg({ ...baseSpec, coverPaperThicknessMm: 0.40 });
        expect(svg).toContain('背 8mm');
        expect(svg).not.toContain(`背 ${EXPECTED_SPINE_MM}mm`);
    });

    it('spec文字列に紙厚が含まれる', () => {
        const svg = renderCoverSvg(baseSpec);
        expect(svg).toContain('本文紙 0.09mm');
        expect(svg).toContain('表紙紙 0.35mm');
    });
});

describe('縦書き/横書きで表紙・裏表紙の配置が変わる', () => {
    it('横書き（左綴じ）では左側が表紙、右側が裏表紙', () => {
        const svg = renderCoverSvg({ ...baseSpec, writingMode: 'horizontal' });
        const frontIdx = svg.indexOf('>表紙<');
        const backIdx  = svg.indexOf('>裏表紙<');
        expect(svg).toContain('左綴じ');
        // SVG は左から順に出力されるので、表紙（左側）が先に現れる
        expect(frontIdx).toBeLessThan(backIdx);
    });

    it('縦書き（右綴じ）では右側が表紙、左側が裏表紙', () => {
        const svg = renderCoverSvg({ ...baseSpec, writingMode: 'vertical' });
        const frontIdx = svg.indexOf('>表紙<');
        const backIdx  = svg.indexOf('>裏表紙<');
        expect(svg).toContain('右綴じ');
        // SVG は左から順に出力されるので、裏表紙（左側）が先に現れる
        expect(backIdx).toBeLessThan(frontIdx);
    });
});
