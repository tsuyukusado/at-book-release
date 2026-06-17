#!/usr/bin/env node
import * as path from "path";
import { execSync } from "child_process";
import { convertAtbToPdf } from "../usecase";
import { generateCoverTemplate } from "../usecase/generateCoverTemplate";
import { atbConverter } from "../adapter/atbConverter";
import { nodeFileReader, nodeLuaLatexRunner, nodeConfigReader, nodeFileWriter, ensureHookInstalled, findConfigDirs, appendCharCount } from "../infrastructure";
import { countChars } from "../usecase/countChars";

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
        commitHash   = execSync('git log -1 --format=%H', { encoding: 'utf-8' }).trim();
        commitMessage = execSync('git log -1 --format=%s', { encoding: 'utf-8' }).trim();
    } catch {}

    const charCount = countChars(atbText);
    console.log(`文字数: ${charCount.toLocaleString('ja-JP')}文字 (${atbPath})`);
    await appendCharCount(CHAR_COUNT_LOG, { atbPath, charCount, commitHash, commitMessage });
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

    await appendCharCount(CHAR_COUNT_LOG, { atbPath, charCount });

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
        if (!rest[0]) {
            console.error("使い方: at-book count <file.atb>");
            process.exit(1);
        }
        await runCountChars(rest[0]);
    } else {
        await runConvert(subcommand);
    }
}

main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
});
