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

    it('paperSize=a6 なら実寸 105×148mm がキャンバスに反映される（塗り足し3mm込み）', () => {
        // 幅 = 3 + 105 + 7.9 + 105 + 3 = 223.9 / 高さ = 3 + 148 + 3 = 154
        const svg = renderCoverSvg({ ...baseSpec, paperSize: 'a6' });
        expect(svg).toContain('viewBox="0 0 223.9 154"');
    });

    it('paperSize ごとの実寸が反映される（a5=148×210 / b5=182×257）', () => {
        expect(renderCoverSvg({ ...baseSpec, paperSize: 'a5' })).toContain('viewBox="0 0 309.9 216"');
        expect(renderCoverSvg({ ...baseSpec, paperSize: 'b5' })).toContain('viewBox="0 0 377.9 263"');
    });

    it('viewBox と width / height は塗り足し込みの入稿サイズ（mm）で一致する', () => {
        const svg = renderCoverSvg({ ...baseSpec, paperSize: 'a6' });
        expect(svg).toContain('width="223.9mm"');
        expect(svg).toContain('height="154mm"');
    });

    it('背幅が 5mm 未満なら背ラベルを出力しない', () => {
        // ceil(20/2) * 0.09 + 0.35 * 2 = 0.9 + 0.7 = 1.6mm < 5mm
        const svg = renderCoverSvg({ ...baseSpec, pageCount: 20 });
        expect(svg).not.toContain('背 ');
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
