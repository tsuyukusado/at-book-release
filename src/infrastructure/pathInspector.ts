import { readdir, stat } from "fs/promises";
import * as path from "path";
import type { PathKind } from "../usecase";

// パスの種類を調べる。存在しない場合も例外にせず 'missing' を返す
// （「見つからない」はエラーではなく分岐の材料なので、呼び出し側で扱いたい）。
export async function nodeStatKind(absPath: string): Promise<PathKind> {
    try {
        return (await stat(absPath)).isDirectory() ? 'directory' : 'file';
    } catch {
        return 'missing';
    }
}

export async function nodeExists(absPath: string): Promise<boolean> {
    return (await nodeStatKind(absPath)) !== 'missing';
}

// dir 直下の .atb ファイル名を返す（サブディレクトリは見ない）。
export async function nodeListAtbFileNames(dir: string): Promise<string[]> {
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        return entries
            .filter(e => e.isFile() && path.extname(e.name) === '.atb')
            .map(e => e.name);
    } catch {
        return [];
    }
}
