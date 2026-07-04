// epubSection.ts
// リフロー型 EPUB は改ページ境界で spine（XHTML 文書）に分割する。
// その 1 spine ぶんを表す。目次のクロスファイルリンクを正しく張るため、
// 各 spine のファイル名を出力側（レンダラ）が一元管理する。

export type EpubSection = {
    // Vivliostyle への入力ファイル名（例: part-001.html）。spine の順序を兼ねる。
    // ビルド後は同名の .xhtml になり、目次リンクもこの名前を指す。
    fileName: string;
    // その spine の完全な HTML 文書。
    html: string;
};
