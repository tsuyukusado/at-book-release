import { readFile, writeFile } from 'fs/promises';

// 文字数カウントの進捗状態。
//   lastCommit: 履歴ウォークで最後に処理したコミット（次回はここから先だけ処理する）
//   pages:      ファイルごとの最後に記録したページ数（ページ数差分の算出に使う）
export interface CountState {
    lastCommit?: string;
    pages: Record<string, number>;
}

export async function readCountState(statePath: string): Promise<CountState> {
    try {
        const data = JSON.parse(await readFile(statePath, 'utf-8'));
        return { lastCommit: data.lastCommit, pages: data.pages ?? {} };
    } catch {
        return { pages: {} };
    }
}

export async function writeCountState(statePath: string, state: CountState): Promise<void> {
    await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}
