export type PaperSize = 'a4' | 'a5' | 'a6' | 'b5';
export type WritingMode = 'vertical' | 'horizontal';

export interface PaperConfig {
    paperSize:              PaperSize;
    writingMode:            WritingMode;
    bodyPaperThicknessMm?:  number;
    coverPaperThicknessMm?: number;
    autoGenerate?:          string[];
}

export const defaultPaperConfig: PaperConfig = {
    paperSize:   'a6',
    writingMode: 'horizontal',
};
