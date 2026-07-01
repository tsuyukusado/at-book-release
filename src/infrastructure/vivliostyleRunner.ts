import { spawn } from "child_process";
import { writeFile, mkdir, readFile, copyFile } from "fs/promises";
import * as path from "path";
import { PDFDocument } from "pdf-lib";
import type { HtmlToPdfRunner } from "../usecase";

function spawnAsync(cmd: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: 'inherit', cwd });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`vivliostyle exited with code ${code}`));
        });
        child.on('error', reject);
    });
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
        // 通常は Vivliostyle が同梱 Chromium を使う。特殊環境向けに
        // AT_BOOK_CHROME で実行ブラウザのパスを上書きできる。
        const customBrowser = process.env.AT_BOOK_CHROME;
        const args = [
            ...(isJs ? [bin] : []),
            'build',
            absHtmlPath,
            '-o', absPdfPath,
            '--timeout', '300',
            ...(customBrowser ? ['--executable-browser', customBrowser] : []),
        ];

        await spawnAsync(cmd, args, absDir);

        const pageCount = (await readPdfPageCount(absPdfPath)) ?? 0;
        return { pageCount };
    }
};
