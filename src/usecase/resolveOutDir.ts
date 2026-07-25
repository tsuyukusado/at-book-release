import * as path from "path";
import type { PaperConfig } from "../domain";
import { DEFAULT_OUT_DIR_NAME } from "../domain";

// 原稿 1 つぶんの成果物をどこへ出すかを決める。
//
// 基準は「原稿のあるフォルダ」。カレントディレクトリ基準にすると、同じ原稿でも
// どこから実行したかで出力場所が変わってしまうため。設定の outDir は原稿の
// フォルダからの相対パスとして解釈する（絶対パスならそれをそのまま使う）。
export function resolveOutDir(atbPath: string, config: Pick<PaperConfig, 'outDir'>): string {
    const atbDir = path.dirname(path.resolve(atbPath));
    return path.resolve(atbDir, config.outDir ?? DEFAULT_OUT_DIR_NAME);
}
