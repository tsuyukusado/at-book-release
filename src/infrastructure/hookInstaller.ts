import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const HOOK_MARKER = "# [at-book] auto-generated hook";

const HOOK_CONTENT = `#!/bin/sh
${HOOK_MARKER}
changed=$(git diff-tree --no-commit-id -r --name-only HEAD | grep '\\.atb$')
if [ -z "$changed" ]; then
    exit 0
fi

targets=""
if [ -f "at-book.config.json" ]; then
    targets=$(node -e "
        try {
            const fs = require('fs');
            const cfg = JSON.parse(fs.readFileSync('at-book.config.json', 'utf-8'));
            if (Array.isArray(cfg.autoGenerate) && cfg.autoGenerate.length > 0) {
                process.stdout.write(cfg.autoGenerate.join('\\n'));
            }
        } catch (_) {}
    " 2>/dev/null)
fi

echo "[at-book] .atb ファイルの変更を検出しました。PDF を生成しています..."
for file in $changed; do
    if [ ! -f "$file" ]; then
        continue
    fi
    if [ -n "$targets" ]; then
        echo "$targets" | grep -qF "$file" || continue
    fi
    at-book "$file" && echo "[at-book] $file → 生成完了"
done
`;

function getHooksDir(): string | null {
    try {
        const customPath = execSync("git config core.hooksPath", { encoding: "utf-8" }).trim();
        if (customPath) return path.resolve(customPath);
    } catch {
        // core.hooksPath 未設定の場合は fall through
    }
    try {
        const gitDir = execSync("git rev-parse --git-dir", { encoding: "utf-8" }).trim();
        return path.join(gitDir, "hooks");
    } catch {
        return null;
    }
}

export function ensureHookInstalled(): void {
    const hooksDir = getHooksDir();
    if (!hooksDir) return; // git リポジトリ外なら何もしない

    const hookPath = path.join(hooksDir, "post-commit");

    if (fs.existsSync(hookPath)) {
        const existing = fs.readFileSync(hookPath, "utf-8");
        if (existing.includes(HOOK_MARKER)) return; // 既にインストール済み

        // 既存フックに追記する
        const appended = existing.trimEnd() + "\n\n" + HOOK_CONTENT;
        fs.writeFileSync(hookPath, appended, { encoding: "utf-8", mode: 0o755 });
        console.log("[at-book] 既存の post-commit フックに自動生成フックを追記しました");
        return;
    }

    if (!fs.existsSync(hooksDir)) {
        fs.mkdirSync(hooksDir, { recursive: true });
    }
    fs.writeFileSync(hookPath, HOOK_CONTENT, { encoding: "utf-8", mode: 0o755 });
    console.log("[at-book] post-commit フックをセットアップしました（コミット時に .atb ファイルが自動生成されます）");
}
