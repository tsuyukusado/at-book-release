import { PaperSize, WritingMode } from "./paperConfig";

export const PAPER_DIMENSIONS_MM: Record<PaperSize, { widthMm: number; heightMm: number }> = {
    a4: { widthMm: 210, heightMm: 297 },
    a5: { widthMm: 148, heightMm: 210 },
    a6: { widthMm: 105, heightMm: 148 },
    b5: { widthMm: 182, heightMm: 257 },
};

export interface CoverSpec {
    paperSize:             PaperSize;
    writingMode:           WritingMode;
    pageCount:             number;
    bodyPaperThicknessMm:  number;
    coverPaperThicknessMm: number;
}

// 背幅 = 本文ページ数/2 × 本文紙厚 + 表紙紙厚 × 2（表裏ボード分）
export function calcSpineWidthMm(spec: Pick<CoverSpec, "pageCount" | "bodyPaperThicknessMm" | "coverPaperThicknessMm">): number {
    const sheets = Math.ceil(spec.pageCount / 2);
    return sheets * spec.bodyPaperThicknessMm + spec.coverPaperThicknessMm * 2;
}
