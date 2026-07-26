import type { PaperConfig } from "../domain";

// 設定ファイルの読み取り結果。
//
// 「ファイルが無い」と「ファイルはあるが壊れている」を呼び出し側で区別できるようにする。
// 両方を黙って既定値に落とすと、JSON の打ち間違いがあっても「autoGenerate がありません」
// としか案内できず、直すべき場所にたどり着けない。
export type ConfigLoad =
    | { status: 'ok';      config: PaperConfig }
    | { status: 'missing'; config: PaperConfig }
    | { status: 'invalid'; config: PaperConfig; reason: string };

export interface ConfigLoader {
    // atbPath は原稿のパス。その隣の at-book.config.json を読む。
    load(atbPath: string): Promise<ConfigLoad>;
}
