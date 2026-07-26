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
    // 成果物の出力先。原稿のあるフォルダからの相対パス（絶対パスも可）。
    // 未指定なら DEFAULT_OUT_DIR_NAME。
    outDir?:                string;
}

// 成果物の出力先フォルダの既定名。
// `dist` にしないのは、＠本を既存プロジェクトに入れて使うと、そのプロジェクトの
// ビルド出力（TypeScript 等の dist/）と同じ場所に成果物が混ざるため。
// 名前が被る場合は設定ファイルの outDir で変更できる。
export const DEFAULT_OUT_DIR_NAME = 'at-book-out';

// 設定ファイルの名前。原稿と同じフォルダに置く。
export const CONFIG_FILE_NAME = 'at-book.config.json';

// 日本語の小説を組むツールなので、既定は縦書き。README の設定表も vertical を
// 既定として案内している。
export const defaultPaperConfig: PaperConfig = {
    paperSize:   'a6',
    writingMode: 'vertical',
};
