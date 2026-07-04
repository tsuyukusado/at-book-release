import { spawn } from "child_process";
import { writeFile, mkdir, readFile, copyFile, rm } from "fs/promises";
import { existsSync } from "fs";
import * as os from "os";
import * as path from "path";
import { PDFDocument } from "pdf-lib";
import type { HtmlToPdfRunner } from "../usecase";
import type { EpubSection } from "../domain";

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
// 同梱フォント（@font-face 用 兼 fontconfig フォールバック用）の置き場。
const BUNDLED_FONTS_DIR = path.resolve(__dirname, '../../fonts');

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

// 手動配置の Chrome for Testing を使う場合、この環境はフォントも fontconfig 設定も
// 持たない。Chrome/Skia はフォント・フォールバック時に fontconfig を必ず引き、
// 発見可能なフォントが 1 つも無いと SkFontMgr_FontConfigInterface の未実装パスに入って
// SIGABRT で落ちる（「page ... has been closed」の正体）。同梱フォントを指す最小の
// fontconfig 設定を生成し、FONTCONFIG_FILE で読ませてクラッシュを防ぐ。
// フォントが揃った通常環境（システム Chrome 等）には触れない。
async function writeFontconfig(destDir: string): Promise<string> {
    const fcDir    = path.join(destDir, 'fontconfig');
    const cacheDir = path.join(fcDir, 'cache');
    const confPath = path.join(fcDir, 'fonts.conf');
    await mkdir(cacheDir, { recursive: true });
    const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${BUNDLED_FONTS_DIR}</dir>
  <dir>/usr/share/fonts</dir>
  <dir>/usr/local/share/fonts</dir>
  <dir prefix="xdg">fonts</dir>
  <dir>~/.fonts</dir>
  <cachedir>${cacheDir}</cachedir>
  <cachedir prefix="xdg">fontconfig</cachedir>
</fontconfig>
`;
    await writeFile(confPath, conf, 'utf-8');
    return confPath;
}

// 手動配置の Chrome for Testing を使う場合のみ、依存ライブラリの場所を
// LD_LIBRARY_PATH に前置きし、生成した fontconfig 設定を FONTCONFIG_FILE で渡した
// 環境を返す（それ以外は現在の環境をそのまま使う）。
function browserEnv(browser: string | undefined, fontconfigFile: string | undefined): NodeJS.ProcessEnv {
    const env = { ...process.env };
    if (browser === CHROME_FOR_TESTING && existsSync(CHROME_LIB_DIR)) {
        env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH
            ? `${CHROME_LIB_DIR}:${env.LD_LIBRARY_PATH}`
            : CHROME_LIB_DIR;
        if (fontconfigFile) env.FONTCONFIG_FILE = fontconfigFile;
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
    const fontsDir = path.join(destDir, 'fonts');
    await mkdir(fontsDir, { recursive: true });
    for (const name of ['ShipporiMincho-Regular.ttf', 'ShipporiMincho-Bold.ttf']) {
        await copyFile(path.join(BUNDLED_FONTS_DIR, name), path.join(fontsDir, name));
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

// ビルド用ディレクトリを用意する（フォント同梱・fontconfig 生成）。pdf/epub 共通。
// 返り値は生成した fontconfig 設定のパス（Chrome for Testing 使用時のみ使う）。
async function prepareBuildDir(absDir: string): Promise<string> {
    await mkdir(absDir, { recursive: true });
    await copyFonts(absDir);
    return writeFontconfig(absDir);
}

// vivliostyle CLI を起動して成果物を 1 つ書き出す共通処理。
// inputArgs は組版対象の指定（PDF は HTML ファイルのパス、EPUB は entry 配列を持つ設定
// ファイルを `-c <path>` で指定）。'epub' のときのみ `-f epub` を渡す
// （pdf は拡張子から自動推論されるので明示不要）。
async function runVivliostyle(
    inputArgs: string[],
    absOutPath: string,
    absDir: string,
    fontconfigFile: string,
    format: 'pdf' | 'epub',
): Promise<void> {
    const bin = resolveVivliostyleBin();
    const isJs = bin.endsWith('.js') || bin.endsWith('.cjs') || bin.endsWith('.mjs');
    const cmd  = isJs ? process.execPath : bin;
    // 使用ブラウザを解決する。AT_BOOK_CHROME 明示指定 → ローカルの Chrome 自動検出 →
    // 見つからなければ Vivliostyle 同梱 Chromium。環境変数を毎回 export しなくても動くようにする。
    const browser = resolveBrowser();
    const args = [
        ...(isJs ? [bin] : []),
        'build',
        ...inputArgs,
        '-o', absOutPath,
        ...(format === 'epub' ? ['-f', 'epub'] : []),
        '--timeout', '300',
        ...(browser ? ['--executable-browser', browser] : []),
    ];

    await spawnAsync(cmd, args, absDir, browserEnv(browser, fontconfigFile));
}

// 紙面固定の PDF を組む。単一 HTML をそのまま Vivliostyle に渡す。
async function runPdfBuild(htmlContent: string, outputPath: string): Promise<void> {
    const dir      = path.dirname(outputPath);
    const base     = path.basename(outputPath, '.pdf');
    const absDir      = path.resolve(dir);
    const absHtmlPath = path.resolve(path.join(dir, `${base}.html`));
    const absOutPath  = path.resolve(outputPath);

    const fontconfigFile = await prepareBuildDir(absDir);
    await writeFile(absHtmlPath, htmlContent, 'utf-8');

    await runVivliostyle([absHtmlPath], absOutPath, absDir, fontconfigFile, 'pdf');
}

// リフロー型 EPUB を組む。改ページ境界で分割済みの各セクションを個別の HTML ファイルに
// 書き出し、vivliostyle.config.js の entry 配列へ並べる。Vivliostyle は entry 1 つにつき
// spine（XHTML）を 1 つ生成するので、これで改ページ境界ごとに独立した spine 文書となり、
// リーダー上で確実に改ページされる（CSS の break-before:page はリフローでは無視されるため）。
//
// Vivliostyle は entry を含むディレクトリ内の HTML をまとめて EPUB へ取り込むため、出力先
// （dist/at-book）で直接組むと、PDF 用 HTML（transform:scale を含む）や過去ビルドの残骸まで
// manifest に混入し、リーダーが未対応スタイル警告を出す。これを避けるため、セクション・設定・
// フォントだけを置いた専用の隔離ディレクトリで組み、終わったら片付ける。
async function runEpubBuild(sections: EpubSection[], outputPath: string): Promise<void> {
    const base       = path.basename(outputPath, '.epub');
    const absOutPath = path.resolve(outputPath);
    const buildDir   = path.join(path.resolve(path.dirname(outputPath)), `.epub-build-${base}`);

    await rm(buildDir, { recursive: true, force: true });
    const fontconfigFile = await prepareBuildDir(buildDir);

    // 1 セクション = 1 HTML ファイル = 1 spine。ファイル名はレンダラが決める（目次リンクが
    // その名前を指すため、書き出す名前と entry を必ずレンダラ由来の fileName に合わせる）。
    await Promise.all(sections.map(s =>
        writeFile(path.join(buildDir, s.fileName), s.html, 'utf-8')));

    const configPath = path.join(buildDir, 'vivliostyle.config.js');
    const configBody = { title: 'at-book', language: 'ja', entry: sections.map(s => s.fileName) };
    await writeFile(configPath, `module.exports = ${JSON.stringify(configBody, null, 2)};\n`, 'utf-8');

    try {
        // 設定ファイルは `-c` で明示指定する（隔離ディレクトリを entryContext にする）。
        await runVivliostyle(['-c', configPath], absOutPath, buildDir, fontconfigFile, 'epub');
    } finally {
        await rm(buildDir, { recursive: true, force: true });
    }
}

export const vivliostyleRunner: HtmlToPdfRunner = {
    async compile(htmlContent: string, outputPath: string): Promise<{ pageCount: number }> {
        await runPdfBuild(htmlContent, outputPath);
        const pageCount = (await readPdfPageCount(path.resolve(outputPath))) ?? 0;
        return { pageCount };
    },
    async compileEpub(sections: EpubSection[], outputPath: string): Promise<void> {
        await runEpubBuild(sections, outputPath);
    }
};
