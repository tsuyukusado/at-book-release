// webExport.ts
// atb をウェブ投稿用テキストへ変換したときの出力構造。
// 見出しで分割し「作品フォルダ / 章フォルダ / 話ファイル」の木を表す。

export type WebFile = {
    // 作品（トップ）フォルダからの相対ディレクトリ。
    // 例: ['第一章'] なら章フォルダの中。空配列ならトップ直下。
    dir: string[];
    // 拡張子を除いたファイル名（見出しテキスト由来）。
    name: string;
    // 本文（ウェブ投稿用に変換済み）。
    content: string;
};

export type WebExport = {
    // 作品（トップ）フォルダ名。最初の見出しより前の文章の冒頭から作る。
    folderName: string;
    // 出力するファイル群。
    files: WebFile[];
};
