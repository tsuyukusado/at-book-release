import * as path from "path";
import { defaultPaperConfig, CONFIG_FILE_NAME } from "../domain";
import type { FileWriter } from "./generateCoverTemplate";

// クイックスタート（README）に合わせた初期設定。autoGenerate は必須項目なので、
// フォルダに既に .atb があればそれを指定し、無ければ README と同じプレースホルダー名を例示として入れる。
export function buildDefaultConfigContent(atbFileNames: string[] = []): string {
    return JSON.stringify(
        {
            paperSize:    defaultPaperConfig.paperSize,
            writingMode:  defaultPaperConfig.writingMode,
            autoGenerate: atbFileNames.length > 0 ? atbFileNames : ["your-novel.atb"],
        },
        null,
        2
    ) + "\n";
}

export interface InitConfigPorts {
    exists(absPath: string): Promise<boolean>;
    // dir 直下の .atb ファイル名（ディレクトリ名は含まない）。
    listAtbFileNames(dir: string): Promise<string[]>;
    fileWriter: FileWriter;
}

export type InitConfigResult =
    | { ok: true;  configPath: string; atbFileNames: string[] }
    // 既にある設定を壊さないため、上書きはしない。
    | { ok: false; reason: 'alreadyExists'; configPath: string };

// 指定フォルダに初期設定ファイルを置く。
// 原稿と同じフォルダに at-book.config.json を置く運用（README クイックスタート）なので、
// 呼び出し側は原稿フォルダを渡す。
export async function initConfig(ports: InitConfigPorts, dir: string): Promise<InitConfigResult> {
    const absDir     = path.resolve(dir);
    const configPath = path.join(absDir, CONFIG_FILE_NAME);

    if (await ports.exists(configPath)) {
        return { ok: false, reason: 'alreadyExists', configPath };
    }

    const atbFileNames = (await ports.listAtbFileNames(absDir)).slice().sort();
    await ports.fileWriter.write(configPath, buildDefaultConfigContent(atbFileNames));
    return { ok: true, configPath, atbFileNames };
}
