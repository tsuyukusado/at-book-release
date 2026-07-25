import { defaultPaperConfig } from "../domain";

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
