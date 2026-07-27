import { execSync } from "child_process";
import type { GitHistoryReader } from "../usecase/writingLog";

// git を呼ぶのはこのファイルだけ。組版側は git を一切知らないままにしておきたいので、
// 依存をここに閉じ込めている。
// 失敗時（git が無い・リポジトリでない・対象が存在しない等）は undefined を返す。
function git(args: string): string | undefined {
    try {
        return execSync(`git ${args}`, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "ignore"],
            // 原稿 1 本が既定の 1MB を超えることは十分あるので広げておく。
            maxBuffer: 64 * 1024 * 1024,
        });
    } catch {
        return undefined;
    }
}

function lines(out: string | undefined): string[] {
    return (out ?? "").split("\n").map(s => s.trim()).filter(Boolean);
}

export const nodeGitHistory: GitHistoryReader = {
    revList: () => lines(git("rev-list --reverse HEAD")),

    // 追加(A)と変更(M)だけを見る。削除されたコミットで数えても、
    // 直後に「0 文字になった」と記録されるだけで執筆記録の役に立たない。
    // --root を付けないと最初のコミットが空になる。
    changedAtbFiles: (commit) =>
        lines(git(`diff-tree --no-commit-id -r --name-only --diff-filter=AM --root ${commit}`))
            .filter(f => f.endsWith(".atb")),

    // %cI はコミット日時（ISO 8601）。著者日時ではなく、実際に記録された時刻を使う。
    commitDate: (commit) => {
        const iso = git(`log -1 --format=%cI ${commit}`)?.trim();
        return iso ? new Date(iso) : undefined;
    },

    showFile: (commit, filePath) => git(`show "${commit}:${filePath}"`),
};

// 執筆記録は git の履歴が前提なので、入口で確かめる。
export function isGitRepository(): boolean {
    return git("rev-parse HEAD") !== undefined;
}
