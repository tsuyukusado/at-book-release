#!/usr/bin/env node
import * as path from "path";
import { execSync } from "child_process";
import { convertAtbToPdf } from "../usecase";
import { generateCoverTemplate } from "../usecase/generateCoverTemplate";
import { atbConverter } from "../adapter/atbConverter";
import { nodeFileReader, nodeLuaLatexRunner, nodeConfigReader, nodeFileWriter, ensureHookInstalled, findConfigDirs, appendCharCount, readCountState, writeCountState } from "../infrastructure";
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

// 「前回コミットからの文字数差分」を git から算出する。
// 親コミットに当該ファイルが無ければ新規ファイル扱い（isNew=true）。
function charDiffFromParent(commit: string, atbPath: string, currentCount: number): { charDiff?: number; isNew: boolean } {
    const parentText = gitShow(`${commit}~1`, atbPath);
    if (parentText === undefined) return { isNew: true };
    return { charDiff: currentCount - countChars(parentText), isNew: false };
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

    const outputPath = outputArg ?? path.join('dist', 'at-book', 'cover-template.svg');

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

const CHAR_COUNT_LOG = 'char-count.log';
const COUNT_STATE_FILE = '.at-book-count.state';

// 履歴ウォーク: 初回は全コミット、以降は前回処理した続きから新着コミットだけを処理し、
// 各コミットで変更された .atb の文字数と「前回コミットからの差分」を char-count.log に記録する。
// ※ ページ数は実際に組版しないと分からないため履歴では記録せず、今後の PDF 生成時にのみ記録する。
async function runCountHistory(): Promise<void> {
    const head = git("rev-parse HEAD")?.trim();
    if (!head) {
        console.error("エラー: gitリポジトリではないか、コミットがまだありません。");
        process.exit(1);
    }

    const state = await readCountState(COUNT_STATE_FILE);
    const firstRun = !state.lastCommit;
    const range = state.lastCommit ? `${state.lastCommit}..HEAD` : "HEAD";

    const revList = git(`rev-list --reverse ${range}`);
    if (revList === undefined) {
        console.error("エラー: コミット履歴を取得できませんでした。");
        process.exit(1);
    }
    const commits = revList.split("\n").map(s => s.trim()).filter(Boolean);

    if (commits.length === 0) {
        console.log("新着コミットはありません。");
        return;
    }
    console.log(firstRun
        ? `初回実行: 全 ${commits.length} 件のコミットを処理します...`
        : `新着 ${commits.length} 件のコミットを処理します...`);

    let logged = 0;
    for (const commit of commits) {
        const changed = (git(`diff-tree --no-commit-id -r --name-only --diff-filter=AM --root ${commit}`) ?? "")
            .split("\n").map(s => s.trim()).filter(f => f.endsWith(".atb"));
        if (changed.length === 0) continue;

        const message = git(`log -1 --format=%s ${commit}`)?.trim() ?? "";
        const isoDate = git(`log -1 --format=%cI ${commit}`)?.trim();
        const date = isoDate ? new Date(isoDate) : undefined;

        for (const atbPath of changed) {
            const curText = gitShow(commit, atbPath);
            if (curText === undefined) continue;
            const charCount = countChars(curText);
            const { charDiff, isNew } = charDiffFromParent(commit, atbPath, charCount);

            await appendCharCount(CHAR_COUNT_LOG, {
                atbPath, charCount, commitHash: commit, commitMessage: message,
                charDiff, isNew, date,
            });

            const diffStr = isNew ? "新規" : `前回比 ${charDiff! >= 0 ? "+" : ""}${charDiff!.toLocaleString("ja-JP")}文字`;
            console.log(`  ${commit.slice(0, 7)} ${atbPath}: ${charCount.toLocaleString("ja-JP")}文字 (${diffStr})`);
            logged++;
        }
    }

    state.lastCommit = head;
    await writeCountState(COUNT_STATE_FILE, state);
    console.log(`完了: ${logged} 件を ${CHAR_COUNT_LOG} に記録しました。`);
}

async function readExistingPageCount(atbPath: string): Promise<number | undefined> {
    try {
        const base = path.basename(atbPath, '.atb');
        const logPath = path.join('dist', 'at-book', `${base}-honbun.log`);
        const log = await nodeFileReader.read(logPath);
        const m = log.match(/Output written on .+?\((\d+) pages?,/);
        if (m?.[1]) return parseInt(m[1], 10);
    } catch {}
    return undefined;
}

async function runCountChars(atbPath: string): Promise<void> {
    let atbText: string;
    try {
        atbText = execSync(`git show HEAD:${atbPath}`, { encoding: 'utf-8' });
    } catch {
        atbText = await nodeFileReader.read(atbPath);
    }

    let commitHash: string | undefined;
    let commitMessage: string | undefined;
    try {
        commitHash    = execSync('git log -1 --format=%H', { encoding: 'utf-8' }).trim();
        commitMessage = execSync('git log -1 --format=%s', { encoding: 'utf-8' }).trim();
    } catch {}

    const charCount = countChars(atbText);
    const pageCount = await readExistingPageCount(atbPath);

    const state = await readCountState(COUNT_STATE_FILE);
    const { charDiff, isNew } = commitHash
        ? charDiffFromParent("HEAD", atbPath, charCount)
        : { charDiff: undefined, isNew: false };
    const prevPage = state.pages[atbPath];
    const pageDiff = (prevPage !== undefined && pageCount !== undefined && pageCount > 0) ? pageCount - prevPage : undefined;

    const charDiffStr = isNew ? " (新規)" : charDiff !== undefined ? ` (前回比 ${charDiff >= 0 ? "+" : ""}${charDiff.toLocaleString("ja-JP")}文字)` : "";
    console.log(`文字数: ${charCount.toLocaleString('ja-JP')}文字${charDiffStr} (${atbPath})`);
    if (pageCount !== undefined) console.log(`ページ数: ${pageCount}p`);
    await appendCharCount(CHAR_COUNT_LOG, { atbPath, charCount, pageCount, commitHash, commitMessage, charDiff, pageDiff, isNew });

    if (pageCount !== undefined && pageCount > 0) {
        state.pages[atbPath] = pageCount;
        await writeCountState(COUNT_STATE_FILE, state);
    }
}

async function runConvert(atbPath: string): Promise<void> {
    const { pdfPath, pageCount, charCount, config } = await convertAtbToPdf(
        {
            converter:    atbConverter,
            fileReader:   nodeFileReader,
            latexRunner:  nodeLuaLatexRunner,
            configReader: nodeConfigReader,
        },
        { atbPath }
    );
    console.log(`生成完了: ${pdfPath}`);
    console.log(`  総文字数 : ${charCount.toLocaleString('ja-JP')}文字`);

    // 差分を算出してログに記録する。
    //   文字数: 前回コミット（HEAD~1）との差分を git から算出
    //   ページ数: 前回 PDF 生成時のページ数（状態ファイル）との差分
    const state = await readCountState(COUNT_STATE_FILE);
    const commitHash = git("rev-parse HEAD")?.trim();
    const commitMessage = commitHash ? git("log -1 --format=%s")?.trim() : undefined;
    const { charDiff, isNew } = commitHash
        ? charDiffFromParent("HEAD", atbPath, charCount)
        : { charDiff: undefined, isNew: false };
    const prevPage = state.pages[atbPath];
    const pageDiff = (prevPage !== undefined && pageCount > 0) ? pageCount - prevPage : undefined;

    await appendCharCount(CHAR_COUNT_LOG, {
        atbPath, charCount, pageCount,
        charDiff, pageDiff, isNew, commitHash, commitMessage,
    });

    if (pageCount > 0) state.pages[atbPath] = pageCount;
    if (commitHash) state.lastCommit = commitHash;
    await writeCountState(COUNT_STATE_FILE, state);

    const { bodyPaperThicknessMm, coverPaperThicknessMm } = config;
    if (bodyPaperThicknessMm && coverPaperThicknessMm && pageCount > 0) {
        const base      = path.basename(atbPath, '.atb');
        const coverPath = path.join('dist', 'at-book', `${base}-hyoshi.svg`);
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

async function main(): Promise<void> {
    ensureHookInstalled();

    const [subcommand, ...rest] = process.argv.slice(2);

    if (!subcommand) {
        const configDirs = await findConfigDirs('.');
        let hasAnyAutoGenerate = false;
        for (const configDir of configDirs) {
            const config = await nodeConfigReader.read(path.join(configDir, '_'));
            if (!config.autoGenerate || config.autoGenerate.length === 0) continue;
            hasAnyAutoGenerate = true;
            for (const relPath of config.autoGenerate) {
                await runConvert(path.join(configDir, relPath));
            }
        }
        if (!hasAnyAutoGenerate) {
            console.error("使い方: at-book <file.atb>");
            console.error("        at-book cover <ページ数> [本文紙厚mm] [表紙紙厚mm] [出力ファイル]");
            process.exit(1);
        }
        return;
    }

    if (subcommand === "cover") {
        await runCover(rest);
    } else if (subcommand === "count") {
        if (rest[0]) {
            // ファイル指定あり: 単体ファイルの現時点の文字数を記録
            await runCountChars(rest[0]);
        } else {
            // 引数なし: コミット履歴をたどって記録（初回は全件、以降は新着のみ）
            await runCountHistory();
        }
    } else {
        await runConvert(subcommand);
    }
}

main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
});
