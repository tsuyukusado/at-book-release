import { readdir } from "fs/promises";
import * as path from "path";

// 走査から外すディレクトリ。設定ファイルが置かれることのない場所を避けて速くする。
// at-book-out は＠本自身の出力先（既定名）。outDir で名前を変えている場合は
// 走査対象に入るが、成果物の中に at-book.config.json は無いので実害はない。
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "at-book-out"]);

export async function findConfigDirs(baseDir: string): Promise<string[]> {
    const results: string[] = [];
    async function walk(dir: string): Promise<void> {
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) await walk(path.join(dir, entry.name));
            } else if (entry.name === "at-book.config.json") {
                results.push(dir);
            }
        }
    }
    await walk(baseDir);
    return results;
}
