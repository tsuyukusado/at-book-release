#!/usr/bin/env node
import * as path from "path";
import { readFileSync } from "fs";
import { convertAtb, convertAtbToWeb, initConfig, resolveOutDir, resolveBuildTargets } from "../usecase";
import type { BuildTarget, ResolveFailure } from "../usecase";
import { DEFAULT_OUT_DIR_NAME, CONFIG_FILE_NAME } from "../domain";
import { generateCoverTemplate } from "../usecase/generateCoverTemplate";
import { atbConverter } from "../adapter/atbConverter";
import { nodeFileReader, vivliostyleRunner, nodeConfigReader, nodeFileWriter, findConfigDirs, nodeStatKind, nodeExists, nodeListAtbFileNames } from "../infrastructure";

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
    const outputPath = outputArg ?? path.join(config.outDir ?? DEFAULT_OUT_DIR_NAME, 'cover-template.svg');

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

// 原稿 1 つを、指定された出力先へ組版する。
async function runConvert(work: BuildTarget): Promise<void> {
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
    if (formats.includes('web')) await runWeb(work);
    console.log(`  総文字数 : ${charCount.toLocaleString('ja-JP')}文字`);

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

// 原稿 1 つを指定して単体で走らせる経路（at-book web <原稿.atb>）用の解決。
// ビルドと同じく、出力先は原稿の隣の設定ファイルで決める。
async function resolveWork(atbPathArg: string): Promise<BuildTarget> {
    const atbPath = path.resolve(atbPathArg);
    const config  = await nodeConfigReader.read(atbPath);
    return { atbPath, outDir: resolveOutDir(atbPath, config) };
}

// atb をウェブ投稿用テキストへ変換する。
// 見出しで「作品フォルダ / 章フォルダ / 話ファイル(.txt)」に分割して出力する。
async function runWeb(work: BuildTarget): Promise<void> {
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

// カレントディレクトリに初期設定ファイルを配置する。
// 原稿と同じフォルダに at-book.config.json を置く運用（README クイックスタート）なので、
// 原稿フォルダに cd してから実行することを想定している。
async function runInit(): Promise<void> {
    const result = await initConfig(
        { exists: nodeExists, listAtbFileNames: nodeListAtbFileNames, fileWriter: nodeFileWriter },
        '.'
    );

    if (!result.ok) {
        console.error(`エラー: ${result.configPath} は既に存在します。上書きは行いません。`);
        process.exit(1);
    }

    console.log(`生成完了: ${result.configPath}`);
    if (result.atbFileNames.length > 0) {
        console.log(`  autoGenerate に既存の原稿を指定しました: ${result.atbFileNames.join(', ')}`);
    } else {
        console.log('  autoGenerate に組版したい原稿のファイル名を書いてください。');
    }
}

// ビルド対象を決められなかった理由を、直し方まで含めて案内する。
// 新規ユーザーが最初に踏むのはこの経路なので、生のスタックトレースは出さない。
function printResolveFailure(failure: ResolveFailure): void {
    const example = '  例: { "autoGenerate": ["your-novel.atb"] }';
    switch (failure.kind) {
        case 'targetMissing':
            console.error(`エラー: 見つかりません: ${failure.target}`);
            break;
        case 'configInvalid':
            console.error(`エラー: 設定ファイルを読めませんでした: ${failure.configPath}`);
            console.error(`  JSON の書き方に誤りがあります（${failure.reason}）。`);
            console.error('  末尾のカンマや閉じ括弧の抜けがないか確認してください。');
            console.error(example);
            break;
        case 'noAutoGenerate':
            if (failure.scope === 'tree') {
                console.error(`エラー: ${failure.location} 配下に autoGenerate を持つ ${CONFIG_FILE_NAME} が見つかりませんでした。`);
                console.error(`  原稿と同じフォルダに ${CONFIG_FILE_NAME} を置き、autoGenerate に原稿のファイル名を書いてください。`);
            } else {
                console.error(`エラー: ${failure.location} に autoGenerate がありません。`);
            }
            console.error(example);
            break;
        case 'atbMissing':
            console.error(`エラー: 原稿が見つかりません: ${failure.relPath}`);
            console.error(`  ${failure.configPath} の autoGenerate に、実在する原稿（.atb）のファイル名を書いてください。`);
            break;
    }
}

// ビルド対象を決めて、順に組版する。振り分けの規則は resolveBuildTargets を参照。
async function runBuild(target?: string): Promise<void> {
    const result = await resolveBuildTargets(
        { statKind: nodeStatKind, findConfigDirs, configLoader: nodeConfigReader },
        target
    );

    if (!result.ok) {
        printResolveFailure(result.failure);
        process.exit(1);
    }

    for (const work of result.targets) await runConvert(work);
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

// 使い方の一覧。引数なし＝カレント配下ビルドなので、usage の入口はここだけになる。
function helpText(): string {
    return [
        '使い方: at-book [対象|コマンド]',
        '',
        '  at-book                        カレントディレクトリ配下の autoGenerate をビルド',
        '  at-book <フォルダ>             配下の at-book.config.json を全て探してビルド',
        '  at-book <at-book.config.json>  その設定ファイルの autoGenerate だけをビルド',
        '  at-book <原稿.atb>             その原稿だけをビルド（隣の設定ファイルを使う）',
        '',
        '  at-book init                   カレントディレクトリに初期設定ファイルを生成',
        '  at-book web <原稿.atb>         ウェブ投稿用テキストに変換',
        '  at-book cover <ページ数> [本文紙厚mm] [表紙紙厚mm] [出力ファイル]',
        '                                 表紙テンプレート（SVG）を生成',
        '',
        '  --version, -v                  バージョンを表示',
        '  --help, -h                     この使い方を表示',
    ].join('\n');
}

// ＠本が受け付けるオプションはこれだけ。他はすべて打ち間違いとして扱う。
const KNOWN_FLAGS = new Set(['--version', '-v', '--help', '-h']);

// 知らないオプションを弾く。
// ビルド対象として扱ってしまうと「見つかりません: --varsion」というパスの話になり、
// 打ち間違いだと気づきにくい。オプションとして拒否し、使い方を添える。
function rejectUnknownOption(arg: string): never {
    console.error(`エラー: 知らないオプションです: ${arg}`);
    console.error('');
    console.error(helpText());
    process.exit(1);
}

async function main(): Promise<void> {
    const [subcommand, ...rest] = process.argv.slice(2);

    if (subcommand?.startsWith('-') && !KNOWN_FLAGS.has(subcommand)) rejectUnknownOption(subcommand);

    if (subcommand === "--version" || subcommand === "-v") {
        console.log(readVersion());
        return;
    }

    if (subcommand === "--help" || subcommand === "-h") {
        console.log(helpText());
        return;
    }

    // サブコマンドはどれもオプションを取らないので、残りに現れた `-` 始まりは打ち間違い。
    const strayOption = rest.find(a => a.startsWith('-'));
    if (strayOption) rejectUnknownOption(strayOption);

    if (subcommand === "init") {
        await runInit();
    } else if (subcommand === "cover") {
        await runCover(rest);
    } else if (subcommand === "web") {
        const fileArg = rest[0];
        if (!fileArg) {
            console.error("使い方: at-book web <原稿.atb>");
            process.exit(1);
        }
        await runWeb(await resolveWork(fileArg));
    } else {
        // 残りはすべてビルド対象の指定として扱う（未指定ならビルド対象はカレントディレクトリ）。
        await runBuild(subcommand);
    }
}

main().catch((err: unknown) => {
    // 利用者向け CLI なので、想定内の失敗はスタックトレースではなくメッセージだけを出す。
    // Error 以外（想定外の投げ方）はそのまま出して手掛かりを残す。
    if (err instanceof Error) {
        console.error(`エラー: ${err.message}`);
        // 原因の連鎖とスタックは既定では伏せる（利用者には読む負担でしかない）。
        // 不具合を報告するときなど、詳細が要る場合だけ AT_BOOK_DEBUG=1 を付ける。
        if (process.env.AT_BOOK_DEBUG) console.error(err);
    } else {
        console.error(err);
    }
    process.exit(1);
});
