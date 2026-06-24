import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const CURRENT_MARKER = "# [at-book] auto-generated hook v7";
const ANY_MARKER     = "# [at-book] auto-generated hook";

const HOOK_CONTENT = `#!/bin/sh
${CURRENT_MARKER}
changed=$(git diff-tree --no-commit-id -r --name-only HEAD | grep '\\.atb$')
if [ -z "$changed" ]; then
    exit 0
fi

targets=$(node -e "
    try {
        const fs = require('fs');
        const path = require('path');
        function findConfigs(dir, results) {
            try {
                for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
                    const full = path.join(dir, e.name);
                    if (e.isDirectory()) findConfigs(full, results);
                    else if (e.name === 'at-book.config.json') results.push(full);
                }
            } catch (_) {}
        }
        const configs = [];
        findConfigs('.', configs);
        const targets = [];
        for (const cfgPath of configs) {
            try {
                const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
                if (Array.isArray(cfg.autoGenerate)) {
                    const dir = path.dirname(cfgPath).replace(/^\\.\\//,'');
                    targets.push(...cfg.autoGenerate.map(f => dir === '.' ? f : dir + '/' + f));
                }
            } catch (_) {}
        }
        if (targets.length > 0) process.stdout.write(targets.join('\\n'));
    } catch (_) {}
" 2>/dev/null)

if [ -z "$targets" ]; then
    exit 0
fi

PROJ_DIR=$(pwd)
for file in $changed; do
    if [ ! -f "$file" ]; then
        continue
    fi
    echo "$targets" | grep -qxF "$file" || continue

    at-book count "$file" 2>/dev/null || true

    AFILE="$PROJ_DIR/$file"
    echo "[at-book] .atb ファイルの変更を検出しました。PDF を生成しています..."
    if [ -w /dev/tty ]; then
        at-book "$AFILE" >/dev/tty 2>&1
        [ $? -eq 0 ] && echo "[at-book] $file → 生成完了" >/dev/tty || echo "[at-book] $file → 生成失敗" >/dev/tty
    else
        osascript -e "tell application \\"Terminal\\"" -e "activate" -e "do script \\"cd '$PROJ_DIR' && at-book '$AFILE'\\"" -e "end tell" 2>/dev/null || true
    fi
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
    if (!hooksDir) return;

    const hookPath = path.join(hooksDir, "post-commit");

    if (fs.existsSync(hookPath)) {
        const existing = fs.readFileSync(hookPath, "utf-8");

        if (existing.includes(CURRENT_MARKER)) return; // 最新版が既にインストール済み

        if (existing.includes(ANY_MARKER)) {
            // 古いバージョンを最新に置き換える
            const markerIndex = existing.indexOf(ANY_MARKER);
            const before = existing.slice(0, markerIndex).trimEnd();
            // shebang だけが残る場合はユーザー独自の処理がないとみなして全置換
            const userContent = before.replace(/^#!\/bin\/sh/, "").trim();
            const updated = userContent ? before + "\n\n" + HOOK_CONTENT : HOOK_CONTENT;
            fs.writeFileSync(hookPath, updated, { encoding: "utf-8", mode: 0o755 });
            console.log("[at-book] post-commit フックを最新バージョンに更新しました");
            return;
        }

        // 無関係の既存フックに追記する
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
