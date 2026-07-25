import { describe, it, expect } from 'vitest';
import { calcSpineWidthMm } from './coverSpec';
import type { CoverSpec } from './coverSpec';

const base: CoverSpec = {
    paperSize:             'a6',
    writingMode:           'vertical',
    pageCount:             160,
    bodyPaperThicknessMm:  0.09,
    coverPaperThicknessMm: 0.35,
};

describe('calcSpineWidthMm', () => {
    it('偶数ページ: 枚数（pageCount/2）× 本文紙厚 + 表紙紙厚 × 2', () => {
        // 80 * 0.09 + 0.35 * 2 = 7.9
        expect(calcSpineWidthMm(base)).toBeCloseTo(7.9, 5);
    });

    it('奇数ページは ceil(pageCount/2) で切り上げて計算する', () => {
        // ceil(161/2) = 81 → 81 * 0.09 + 0.7 = 7.99
        expect(calcSpineWidthMm({ ...base, pageCount: 161 })).toBeCloseTo(7.99, 5);
    });
});
