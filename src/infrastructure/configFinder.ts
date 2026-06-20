import { readdir } from "fs/promises";
import * as path from "path";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist"]);

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
