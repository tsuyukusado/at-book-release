export type PaperSize = 'a4' | 'a5' | 'a6' | 'b5';
export type WritingMode = 'vertical' | 'horizontal';
// 出力フォーマット。pdf は紙面固定（ノンブル・綴じ代・表紙テンプレートを伴う）、
// epub は電子書籍向けリフロー（紙面まわりの装飾は付かない）、
// web は小説投稿サイト向けのプレーンテキスト（見出しで章/話に分割）。
export type OutputFormat = 'pdf' | 'epub' | 'web';

export interface PaperConfig {
    paperSize:              PaperSize;
    writingMode:            WritingMode;
    bodyPaperThicknessMm?:  number;
    coverPaperThicknessMm?: number;
    autoGenerate?:          string[];
    // 生成するフォーマット。未指定なら pdf のみ（従来動作）。
    formats?:               OutputFormat[];
}

export const defaultPaperConfig: PaperConfig = {
    paperSize:   'a6',
    writingMode: 'horizontal',
};
