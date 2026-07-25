#!/usr/bin/env node
import * as path from "path";
import { readFileSync, statSync } from "fs";
import { execSync } from "child_process";
import { convertAtb, convertAtbToWeb } from "../usecase";
import { generateCoverTemplate } from "../usecase/generateCoverTemplate";
import { atbConverter } from "../adapter/atbConverter";
import { nodeFileReader, vivliostyleRunner, readPdfPageCount, nodeConfigReader, nodeFileWriter, findConfigDirs, appendCharCount, readCountState, writeCountState } from "../infrastructure";
import type { CountState } from "../infrastructure";
import { countChars } from "../usecase/countChars";

// git コマンドを実行。失敗時（gitリポジトリでない・対象が存在しない等）は undefined を返す。
function git(args: string): string | undefined {
    try {
        return execSync(`git ${args}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
    } catch {
        return undefined;
    }
}

// 指定コミットの .atb 内容を取得（存在しなければ undefined）。
function gitShow(ref: string, atbPath: string): string | undefined {
    return git(`show "${ref}:${atbPath}"`);
}

// 指定 ref の .atb 内容と現在の文字数を比較して差分を返す。
// ref に当該ファイルが無ければ新規ファイル扱い（isNew=true）。
function charDiffFromRef(ref: string, atbPath: string, currentCount: number): { charDiff?: number; isNew: boolean } {
    const baseText = gitShow(ref, atbPath);
    if (baseText === undefined) return { isNew: true };
    return { charDiff: currentCount - countChars(baseText), isNew: false };
}

// 「前回コミットからの文字数差分」を git から算出する。
// 親コミットに当該ファイルが無ければ新規ファイル扱い（isNew=true）。
function charDiffFromParent(commit: string, atbPath: string, currentCount: number): { charDiff?: number; isNew: boolean } {
    return charDiffFromRef(`${commit}~1`, atbPath, currentCount);
}

async function runCover(args: string[]): Promise<void> {
    // 使い方: at-book cover <ページ数> [本文紙厚mm] [表紙紙厚mm] [出力ファイル]
    // 本文紙厚・表紙紙厚は at-book.config.json で指定可能（CLI引数が優先）
    const [pagesStr, bodyStr, coverStr, outputArg] = args;

    if (!pagesStr) {
        console.error("使い方: at-book cover <ページ数> [本文紙厚mm] [表紙紙厚mm] [出力ファイル]");
        console.error("  例: at-book cover 160 0.09 0.35 cover-template.svg");
        console.error("  ※ 本文紙厚・表紙紙厚は at-book.config.json に記載でも可");
        process.exit(1);
    }

    const pageCount = parseInt(pagesStr, 10);
    if (isNaN(pageCount) || pageCount <= 0) {
        console.error("エラー: ページ数は正の整数で指定してください");
        process.exit(1);
    }

    const config = await nodeConfigReader.read(".");

    const bodyPaperThicknessMm  = bodyStr  ? parseFloat(bodyStr)  : config.bodyPaperThicknessMm;
    const coverPaperThicknessMm = coverStr ? parseFloat(coverStr) : config.coverPaperThicknessMm;

    if (!bodyPaperThicknessMm || bodyPaperThicknessMm <= 0) {
        console.error("エラー: 本文紙厚を指定してください（CLI引数または at-book.config.json の bodyPaperThicknessMm）");
        process.exit(1);
    }
    if (!coverPaperThicknessMm || coverPaperThicknessMm <= 0) {
        console.error("エラー: 表紙紙厚を指定してください（CLI引数または at-book.config.json の coverPaperThicknessMm）");
        process.exit(1);
    }

    // 原稿を伴わない単体実行なので、作品ディレクトリが定まらない。
    // 出力先はカレントディレクトリ基準（または引数で明示）とする。
    const outputPath = outputArg ?? path.join('dist', 'cover-template.svg');

    const { svgPath } = await generateCoverTemplate(
        { fileWriter: nodeFileWriter },
        {
            spec: {
                paperSize:             config.paperSize,
                writingMode:           config.writingMode,
                pageCount,
                bodyPaperThicknessMm,
                coverPaperThicknessMm,
            },
            outputPath: path.resolve(outputPath),
        }
    );

    const spineWidth = Math.ceil(pageCount / 2) * bodyPaperThicknessMm + coverPaperThicknessMm * 2;
    console.log(`生成完了: ${svgPath}`);
    console.log(`  用紙サイズ : ${config.paperSize.toUpperCase()}`);
    console.log(`  ページ数   : ${pageCount}p`);
    console.log(`  背幅       : ${Math.round(spineWidth * 100) / 100}mm`);
}

// 1作品ぶんのパス解決結果。
//
// 出力先は「設定ファイル（＝原稿）のあるディレクトリ」を基準に決める。カレント
// ディレクトリ基準にすると、同じ原稿でもどこから実行したかで出力場所が変わってしまう
// （さらに従来はリポジトリルート以外から実行すると読み込み自体が失敗していた）。
// 設定ファイル 1 つ＝作品 1 つと捉え、その隣に成果物を置く。
interface Work {
    // 原稿の実ファイルパス（絶対）。読み込みと出力ファイル名の元になる。
    atbPath:  string;
    // 成果物の出力先（絶対）。<原稿のあるディレクトリ>/dist。
    outDir:   string;
    // git 操作（show / diff）とログ上の識別子に使うリポジトリルート相対パス。
    // git 管理外なら実パスのまま。
    repoPath: string;
}

function resolveWork(atbPathArg: string): Work {
    const atbPath = path.resolve(atbPathArg);
    return {
        atbPath,
        outDir:   path.join(path.dirname(atbPath), 'dist'),
        repoPath: toRepoRelativePath(atbPath),
    };
}

const charCountLogOf   = (outDir: string) => path.join(outDir, 'char-count.log');
const countStateFileOf = (outDir: string) => path.join(outDir, '.at-book-count.state');

// 履歴ウォーク: 初回は全コミット、以降は前回処理した続きから新着コミットだけを処理し、
// 各コミットで変更された .atb の文字数と「前回コミットからの差分」を char-count.log に記録する。
// ※ ページ数は実際に組版しないと分からないため履歴では記録せず、今後の PDF 生成時にのみ記録する。
async function runCountHistory(): Promise<void> {
    const head = git("rev-parse HEAD")?.trim();
    if (!head) {
        console.error("エラー: gitリポジトリではないか、コミットがまだありません。");
        process.exit(1);
    }
    const repoRoot = git("rev-parse --show-toplevel")?.trim();
    if (!repoRoot) {
        console.error("エラー: gitリポジトリのルートを特定できませんでした。");
        process.exit(1);
    }

    // 記録先は作品ごと（＝原稿の隣の dist/）なので、進捗の基準となる lastCommit も
    // 作品ごとに持つ。全コミットを古い順に走査し、作品ごとに「前回記録した位置」を
    // 追い越してから記録を始める。全作品ぶんの状態を1つのファイルに集約すると、
    // 出力先を作品ごとに分けた意味が無くなるため、この形にしている。
    const revList = git("rev-list --reverse HEAD");
    if (revList === undefined) {
        console.error("エラー: コミット履歴を取得できませんでした。");
        process.exit(1);
    }
    const commits = revList.split("\n").map(s => s.trim()).filter(Boolean);

    // 作品（出力先ディレクトリ）ごとの状態。ファイル I/O を繰り返さないよう保持する。
    type WorkState = { work: Work; state: CountState; active: boolean; touched: boolean };
    const works = new Map<string, WorkState>();

    async function workStateOf(repoRelAtbPath: string): Promise<WorkState> {
        const work = resolveWork(path.join(repoRoot!, repoRelAtbPath));
        const key = work.outDir;
        let ws = works.get(key);
        if (!ws) {
            const state = await readCountState(countStateFileOf(work.outDir));
            // 未記録の作品は最初から、記録済みなら lastCommit を追い越すまで待つ。
            ws = { work, state, active: !state.lastCommit, touched: false };
            works.set(key, ws);
        }
        return ws;
    }

    let logged = 0;
    for (const commit of commits) {
        const changed = (git(`diff-tree --no-commit-id -r --name-only --diff-filter=AM --root ${commit}`) ?? "")
            .split("\n").map(s => s.trim()).filter(f => f.endsWith(".atb"));
        if (changed.length === 0) continue;

        const message = git(`log -1 --format=%s ${commit}`)?.trim() ?? "";
        const isoDate = git(`log -1 --format=%cI ${commit}`)?.trim();
        const date = isoDate ? new Date(isoDate) : undefined;

        for (const atbPath of changed) {
            const ws = await workStateOf(atbPath);
            if (!ws.active) {
                // このコミットが前回の記録位置なら、次のコミットから記録を再開する。
                if (ws.state.lastCommit === commit) ws.active = true;
                continue;
            }

            const curText = gitShow(commit, atbPath);
            if (curText === undefined) continue;
            const charCount = countChars(curText);
            const { charDiff, isNew } = charDiffFromParent(commit, atbPath, charCount);

            await appendCharCount(charCountLogOf(ws.work.outDir), {
                atbPath, charCount, commitHash: commit, commitMessage: message,
                charDiff, isNew, date,
            });

            const diffStr = isNew ? "新規" : `前回比 ${charDiff! >= 0 ? "+" : ""}${charDiff!.toLocaleString("ja-JP")}文字`;
            console.log(`  ${commit.slice(0, 7)} ${atbPath}: ${charCount.toLocaleString("ja-JP")}文字 (${diffStr})`);
            ws.state.chars[atbPath] = charCount;
            ws.touched = true;
            logged++;
        }
    }

    if (logged === 0) {
        console.log("新たに記録するコミットはありません。");
        return;
    }

    for (const ws of works.values()) {
        if (!ws.touched) continue;
        ws.state.lastCommit = head;
        await writeCountState(countStateFileOf(ws.work.outDir), ws.state);
        console.log(`記録: ${charCountLogOf(ws.work.outDir)}`);
    }
    console.log(`完了: ${logged} 件を記録しました。`);
}

async function readExistingPageCount(work: Work): Promise<number | undefined> {
    const base = path.basename(work.atbPath, '.atb');
    return readPdfPageCount(path.join(work.outDir, `${base}-honbun.pdf`));
}

async function runCountChars(atbPathArg: string, opts: { fromCommit?: boolean } = {}): Promise<void> {
    const work = resolveWork(atbPathArg);
    // 読み込みは実ファイルパス、git 操作はリポジトリ相対パスと使い分ける。
    // 両者を同じ変数に詰めると、リポジトリルート以外から実行したときに破綻する。
    const atbPath = work.repoPath;
    let atbText: string;
    if (opts.fromCommit) {
        // コミット済み(HEAD)の内容を数える
        try {
            atbText = execSync(`git show HEAD:${work.repoPath}`, { encoding: 'utf-8' });
        } catch {
            atbText = await nodeFileReader.read(work.atbPath);
        }
    } else {
        // 手動実行: 作業ツリーのローカル内容を数える
        atbText = await nodeFileReader.read(work.atbPath);
    }

    let commitHash: string | undefined;
    let commitMessage: string | undefined;
    try {
        commitHash    = execSync('git log -1 --format=%H', { encoding: 'utf-8' }).trim();
        commitMessage = execSync('git log -1 --format=%s', { encoding: 'utf-8' }).trim();
    } catch {}

    const charCount = countChars(atbText);
    const pageCount = await readExistingPageCount(work);

    const state = await readCountState(countStateFileOf(work.outDir));
    // 差分の基準: --committed 指定時は親コミット(HEAD~1)、既定は現在のコミット(HEAD)
    const baseRef = opts.fromCommit ? "HEAD~1" : "HEAD";
    const { charDiff, isNew } = commitHash
        ? charDiffFromRef(baseRef, atbPath, charCount)
        : { charDiff: undefined, isNew: false };
    const prevPage = state.pages[atbPath];
    const pageDiff = (prevPage !== undefined && pageCount !== undefined && pageCount > 0) ? pageCount - prevPage : undefined;

    const charDiffStr = isNew ? " (新規)" : charDiff !== undefined ? ` (前回比 ${charDiff >= 0 ? "+" : ""}${charDiff.toLocaleString("ja-JP")}文字)` : "";
    console.log(`文字数: ${charCount.toLocaleString('ja-JP')}文字${charDiffStr} (${atbPath})`);
    if (pageCount !== undefined) console.log(`ページ数: ${pageCount}p`);
    await appendCharCount(charCountLogOf(work.outDir), { atbPath, charCount, pageCount, commitHash, commitMessage, charDiff, pageDiff, isNew });

    state.chars[atbPath] = charCount;
    if (pageCount !== undefined && pageCount > 0) state.pages[atbPath] = pageCount;
    await writeCountState(countStateFileOf(work.outDir), state);
}

// 絶対パスをリポジトリルート相対パスに変換する。git show の ref:path 記法は絶対パスを受け付けないため。
function toRepoRelativePath(p: string): string {
    const repoRoot = git("rev-parse --show-toplevel")?.trim();
    if (!repoRoot) return p;
    const abs = path.isAbsolute(p) ? p : path.resolve(p);
    return path.relative(repoRoot, abs);
}

async function runConvert(atbPathArg: string): Promise<void> {
    const work = resolveWork(atbPathArg);
    // ログ上の識別子はリポジトリ相対パス。作業ツリーのどこから実行しても同じキーになる。
    const atbPath = work.repoPath;
    const { pdfPath, epubPath, pageCount, charCount, formats, config } = await convertAtb(
        {
            converter:    atbConverter,
            fileReader:   nodeFileReader,
            pdfRunner:    vivliostyleRunner,
            configReader: nodeConfigReader,
        },
        { atbPath: work.atbPath, outDir: work.outDir }
    );
    if (pdfPath)  console.log(`生成完了: ${pdfPath}`);
    if (epubPath) console.log(`生成完了: ${epubPath}`);
    // web はプレーンテキストで HTML 経路を通らないため、ここで別途出力する。
    if (formats.includes('web')) await runWeb(work.atbPath);
    console.log(`  総文字数 : ${charCount.toLocaleString('ja-JP')}文字`);

    // 差分を算出してログに記録する。
    //   文字数・ページ数ともに前回記録時の値（状態ファイル）との差分
    const stateFile = countStateFileOf(work.outDir);
    const state = await readCountState(stateFile);
    const commitHash = git("rev-parse HEAD")?.trim();
    const commitMessage = commitHash ? git("log -1 --format=%s")?.trim() : undefined;
    const prevChar = state.chars[atbPath];
    const charDiff = prevChar !== undefined ? charCount - prevChar : undefined;
    const prevPage = state.pages[atbPath];
    const pageDiff = (prevPage !== undefined && pageCount > 0) ? pageCount - prevPage : undefined;

    await appendCharCount(charCountLogOf(work.outDir), {
        atbPath, charCount, pageCount,
        charDiff, pageDiff, isNew: false, commitHash, commitMessage,
    });

    state.chars[atbPath] = charCount;
    if (pageCount > 0) state.pages[atbPath] = pageCount;
    if (commitHash) state.lastCommit = commitHash;
    await writeCountState(stateFile, state);

    const { bodyPaperThicknessMm, coverPaperThicknessMm } = config;
    if (bodyPaperThicknessMm && coverPaperThicknessMm && pageCount > 0) {
        const base      = path.basename(work.atbPath, '.atb');
        const coverPath = path.join(work.outDir, `${base}-hyoshi.svg`);
        const { svgPath } = await generateCoverTemplate(
            { fileWriter: nodeFileWriter },
            {
                spec: {
                    paperSize: config.paperSize,
                    writingMode: config.writingMode,
                    pageCount,
                    bodyPaperThicknessMm,
                    coverPaperThicknessMm,
                },
                outputPath: path.resolve(coverPath),
            }
        );
        const spineWidth = Math.ceil(pageCount / 2) * bodyPaperThicknessMm + coverPaperThicknessMm * 2;
        console.log(`表紙テンプレート生成完了: ${svgPath}`);
        console.log(`  ページ数 : ${pageCount}p / 背幅 : ${Math.round(spineWidth * 100) / 100}mm`);
    }
}

// atb をウェブ投稿用テキストへ変換する。
// 見出しで「作品フォルダ / 章フォルダ / 話ファイル(.txt)」に分割して出力する。
async function runWeb(atbPathArg: string): Promise<void> {
    const work = resolveWork(atbPathArg);
    const outDir = path.join(work.outDir, 'web');
    const { bookDir, export: result, writtenPaths } = await convertAtbToWeb(
        { fileReader: nodeFileReader, fileWriter: nodeFileWriter },
        { atbPath: work.atbPath, outDir },
    );
    console.log(`ウェブ投稿用に変換しました: ${bookDir}`);
    console.log(`  作品フォルダ : ${result.folderName}`);
    console.log(`  ファイル数   : ${writtenPaths.length}`);
    for (const p of writtenPaths) {
        console.log(`    - ${path.relative(bookDir, p)}`);
    }
}

const CONFIG_FILE_NAME = 'at-book.config.json';

// 設定ファイル1つ分（＝作品1つ分）をビルドする。
// autoGenerate が無ければ何もせず false を返す。
async function buildConfigDir(configDir: string): Promise<boolean> {
    // configReader は「原稿のパス」を受け取り、その隣の設定ファイルを読む仕様なので、
    // ディレクトリ配下の適当なファイル名を与えて設定を引く。
    const config = await nodeConfigReader.read(path.join(configDir, '_'));
    if (!config.autoGenerate || config.autoGenerate.length === 0) return false;
    for (const relPath of config.autoGenerate) {
        await runConvert(path.join(configDir, relPath));
    }
    return true;
}

// ビルド対象を決めて実行する。引数の種類で振り分ける。
//   省略                 … カレントディレクトリを指定したものとして扱う
//   ディレクトリ         … 配下の設定ファイルを全て探し、その autoGenerate をビルド
//   at-book.config.json  … その設定ファイルの autoGenerate だけをビルド
//   .atb                 … その原稿だけをビルド（隣の設定ファイルを使う）
// いずれも「設定ファイルを起点に作品を特定する」同じ操作なので、サブコマンドを
// 増やさず引数の種類で分岐させている。
async function runBuild(target?: string): Promise<void> {
    const abs = path.resolve(target ?? '.');

    let isDir: boolean;
    try {
        isDir = statSync(abs).isDirectory();
    } catch {
        console.error(`エラー: 見つかりません: ${target ?? '.'}`);
        process.exit(1);
    }

    if (isDir) {
        const configDirs = await findConfigDirs(abs);
        let built = false;
        for (const configDir of configDirs) {
            if (await buildConfigDir(configDir)) built = true;
        }
        if (!built) {
            console.error(`エラー: ${abs} 配下に autoGenerate を持つ ${CONFIG_FILE_NAME} が見つかりませんでした。`);
            console.error(`  原稿と同じフォルダに ${CONFIG_FILE_NAME} を置き、autoGenerate に原稿のファイル名を書いてください。`);
            console.error('  例: { "autoGenerate": ["your-novel.atb"] }');
            process.exit(1);
        }
        return;
    }

    if (path.basename(abs) === CONFIG_FILE_NAME) {
        if (!await buildConfigDir(path.dirname(abs))) {
            console.error(`エラー: ${abs} に autoGenerate がありません。`);
            console.error('  例: { "autoGenerate": ["your-novel.atb"] }');
            process.exit(1);
        }
        return;
    }

    await runConvert(abs);
}

// パッケージ自身のバージョンを読む。__dirname は dist/cli なので二つ上がパッケージルート。
function readVersion(): string {
    try {
        const pkgPath = path.join(__dirname, '..', '..', 'package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
        return pkg.version ?? 'unknown';
    } catch {
        return 'unknown';
    }
}

async function main(): Promise<void> {
    const [subcommand, ...rest] = process.argv.slice(2);

    if (subcommand === "--version" || subcommand === "-v") {
        console.log(readVersion());
        return;
    }

    if (subcommand === "cover") {
        await runCover(rest);
    } else if (subcommand === "web") {
        const fileArg = rest.find(a => !a.startsWith("--"));
        if (!fileArg) {
            console.error("使い方: at-book web <file.atb>");
            process.exit(1);
        }
        await runWeb(fileArg);
    } else if (subcommand === "count") {
        // --committed: コミット済み(HEAD)の内容を数える。
        // フラグ無しは作業ツリーのローカル内容を数える。
        const fromCommit = rest.includes("--committed");
        const fileArg = rest.find(a => !a.startsWith("--"));
        if (fileArg) {
            // ファイル指定あり: 単体ファイルの現時点の文字数を記録
            await runCountChars(fileArg, { fromCommit });
        } else {
            // 引数なし: コミット履歴をたどって記録（初回は全件、以降は新着のみ）
            await runCountHistory();
        }
    } else {
        // 残りはすべてビルド対象の指定として扱う（未指定ならカレントディレクトリ）。
        await runBuild(subcommand);
    }
}

main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
});
