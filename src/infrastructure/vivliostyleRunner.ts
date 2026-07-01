import { spawn } from "child_process";
import { writeFile, mkdir, readFile, copyFile } from "fs/promises";
import { existsSync } from "fs";
import * as os from "os";
import * as path from "path";
import { PDFDocument } from "pdf-lib";
import type { HtmlToPdfRunner } from "../usecase";

function spawnAsync(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: 'inherit', cwd, env });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`vivliostyle exited with code ${code}`));
        });
        child.on('error', reject);
    });
}

// 手動配置した Chrome for Testing の実行ファイル。
const CHROME_FOR_TESTING = path.join(os.homedir(), '.local/chrome-for-testing/chrome-linux64/chrome');
// その Chrome が依存する共有ライブラリ一式（Playwright 非対応環境向けに手動配置）。
const CHROME_LIB_DIR = path.join(os.homedir(), '.local/chrome-libs/usr/lib/x86_64-linux-gnu');

// 組版に使うブラウザを解決する。
//   1. AT_BOOK_CHROME（明示指定）が最優先。
//   2. 手動配置の Chrome for Testing / システムの Chrome・Chromium を自動検出。
//   3. 見つからなければ undefined を返し、Vivliostyle 同梱 Chromium に委ねる。
// これにより、環境変数を毎回 export しなくても `at-book` 一発で生成できる。
function resolveBrowser(): string | undefined {
    const fromEnv = process.env.AT_BOOK_CHROME;
    if (fromEnv && existsSync(fromEnv)) return fromEnv;

    const candidates = [
        CHROME_FOR_TESTING,
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/opt/google/chrome/chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
    ];
    return candidates.find(p => existsSync(p));
}

// 手動配置の Chrome for Testing を使う場合のみ、依存ライブラリの場所を
// LD_LIBRARY_PATH に前置きした環境を返す（それ以外は現在の環境をそのまま使う）。
function browserEnv(browser: string | undefined): NodeJS.ProcessEnv {
    const env = { ...process.env };
    if (browser === CHROME_FOR_TESTING && existsSync(CHROME_LIB_DIR)) {
        env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH
            ? `${CHROME_LIB_DIR}:${env.LD_LIBRARY_PATH}`
            : CHROME_LIB_DIR;
    }
    return env;
}

// 生成済み PDF のページ数を読む（存在しない・壊れている場合は undefined）。
export async function readPdfPageCount(pdfPath: string): Promise<number | undefined> {
    try {
        const bytes = await readFile(pdfPath);
        const doc = await PDFDocument.load(bytes, { updateMetadata: false });
        return doc.getPageCount();
    } catch {
        return undefined;
    }
}

// @font-face が参照する fonts/ を HTML と同じ場所へ配置する。
async function copyFonts(destDir: string): Promise<void> {
    const srcDir = path.resolve(__dirname, '../../fonts');
    const fontsDir = path.join(destDir, 'fonts');
    await mkdir(fontsDir, { recursive: true });
    for (const name of ['ShipporiMincho-Regular.ttf', 'ShipporiMincho-Bold.ttf']) {
        await copyFile(path.join(srcDir, name), path.join(fontsDir, name));
    }
}

// vivliostyle CLI のパスを解決する（ローカル依存の bin を優先）。
function resolveVivliostyleBin(): string {
    try {
        const cliPkg = require.resolve('@vivliostyle/cli/package.json');
        const pkg = require(cliPkg) as { bin?: Record<string, string> | string };
        const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.vivliostyle;
        if (rel) return path.join(path.dirname(cliPkg), rel);
    } catch { /* フォールバックへ */ }
    return 'vivliostyle';
}

export const vivliostyleRunner: HtmlToPdfRunner = {
    async compile(htmlContent: string, outputPath: string): Promise<{ pageCount: number }> {
        const dir      = path.dirname(outputPath);
        const base     = path.basename(outputPath, '.pdf');
        const htmlPath = path.join(dir, `${base}.html`);

        const absDir      = path.resolve(dir);
        const absHtmlPath = path.resolve(htmlPath);
        const absPdfPath  = path.resolve(outputPath);

        await mkdir(absDir, { recursive: true });
        await copyFonts(absDir);
        await writeFile(absHtmlPath, htmlContent, 'utf-8');

        const bin = resolveVivliostyleBin();
        const isJs = bin.endsWith('.js') || bin.endsWith('.cjs') || bin.endsWith('.mjs');
        const cmd  = isJs ? process.execPath : bin;
        // 使用ブラウザを解決する。AT_BOOK_CHROME 明示指定 → ローカルの Chrome 自動検出 →
        // 見つからなければ Vivliostyle 同梱 Chromium。環境変数を毎回 export しなくても動くようにする。
        const browser = resolveBrowser();
        const args = [
            ...(isJs ? [bin] : []),
            'build',
            absHtmlPath,
            '-o', absPdfPath,
            '--timeout', '300',
            ...(browser ? ['--executable-browser', browser] : []),
        ];

        await spawnAsync(cmd, args, absDir, browserEnv(browser));

        const pageCount = (await readPdfPageCount(absPdfPath)) ?? 0;
        return { pageCount };
    }
};
