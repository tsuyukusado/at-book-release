import { defaultPaperConfig } from "../domain";

// クイックスタート（README）に合わせた初期設定。autoGenerate は必須項目だが
// 中身までは推測できないため、README と同じプレースホルダー名を例示として入れる。
export function buildDefaultConfigContent(): string {
    return JSON.stringify(
        {
            paperSize:    defaultPaperConfig.paperSize,
            writingMode:  defaultPaperConfig.writingMode,
            autoGenerate: ["your-novel.atb"],
        },
        null,
        2
    ) + "\n";
}
