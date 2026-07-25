#!/usr/bin/env node
import * as path from "path";
import { readFileSync, readdirSync, statSync } from "fs";
import { convertAtb, convertAtbToWeb, buildDefaultConfigContent, resolveOutDir } from "../usecase";
import { DEFAULT_OUT_DIR_NAME } from "../domain";
import { generateCoverTemplate } from "../usecase/generateCoverTemplate";
import { atbConverter } from "../adapter/atbConverter";
import { nodeFileReader, vivliostyleRunner, nodeConfigReader, nodeFileWriter, findConfigDirs } from "../infrastructure";

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

// 1作品ぶんのパス解決結果。
//
// 出力先は「設定ファイル（＝原稿）のあるディレクトリ」を基準に決める。カレント
// ディレクトリ基準にすると、同じ原稿でもどこから実行したかで出力場所が変わってしまう
// （さらに従来はリポジトリルート以外から実行すると読み込み自体が失敗していた）。
// 設定ファイル 1 つ＝作品 1 つと捉え、その隣に成果物を置く。
interface Work {
    // 原稿の実ファイルパス（絶対）。読み込みと出力ファイル名の元になる。
    atbPath:  string;
    // 成果物の出力先（絶対）。既定は <原稿のあるディレクトリ>/at-book-out。
    outDir:   string;
}

async function resolveWork(atbPathArg: string): Promise<Work> {
    const atbPath = path.resolve(atbPathArg);
    const config  = await nodeConfigReader.read(atbPath);
    return { atbPath, outDir: resolveOutDir(atbPath, config) };
}

async function runConvert(atbPathArg: string): Promise<void> {
    const work = await resolveWork(atbPathArg);
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
    const work = await resolveWork(atbPathArg);
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

// カレントディレクトリに初期設定ファイルを配置する。
// 原稿と同じフォルダに at-book.config.json を置く運用（README クイックスタート）なので、
// 原稿フォルダに cd してから実行することを想定している。
async function runInit(): Promise<void> {
    const configPath = path.resolve(CONFIG_FILE_NAME);

    try {
        statSync(configPath);
        console.error(`エラー: ${configPath} は既に存在します。上書きは行いません。`);
        process.exit(1);
    } catch {
        // 存在しない場合のみ続行する。
    }

    const atbFileNames = readdirSync(path.dirname(configPath))
        .filter(name => name.endsWith('.atb'))
        .sort();

    await nodeFileWriter.write(configPath, buildDefaultConfigContent(atbFileNames));
    console.log(`生成完了: ${configPath}`);
    if (atbFileNames.length > 0) {
        console.log(`  autoGenerate に既存の原稿を指定しました: ${atbFileNames.join(', ')}`);
    } else {
        console.log('  autoGenerate に組版したい原稿のファイル名を書いてください。');
    }
}

// 設定ファイル1つ分（＝作品1つ分）をビルドする。
// autoGenerate が無ければ何もせず false を返す。
async function buildConfigDir(configDir: string): Promise<boolean> {
    // configReader は「原稿のパス」を受け取り、その隣の設定ファイルを読む仕様なので、
    // ディレクトリ配下の適当なファイル名を与えて設定を引く。
    const config = await nodeConfigReader.read(path.join(configDir, '_'));
    if (!config.autoGenerate || config.autoGenerate.length === 0) return false;
    for (const relPath of config.autoGenerate) {
        const atbPath = path.join(configDir, relPath);
        // init 直後のプレースホルダーのまま実行する経路が新規ユーザーの最初の一歩に
        // なりやすい。生のスタックトレースではなく、直し方まで日本語で案内する。
        try {
            statSync(atbPath);
        } catch {
            console.error(`エラー: 原稿が見つかりません: ${relPath}`);
            console.error(`  ${path.join(configDir, CONFIG_FILE_NAME)} の autoGenerate に、実在する原稿（.atb）のファイル名を書いてください。`);
            process.exit(1);
        }
        await runConvert(atbPath);
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

// 使い方の一覧。引数なし＝カレント配下ビルドなので、usage の入口はここだけになる。
function printHelp(): void {
    console.log('使い方: at-book [対象|コマンド]');
    console.log('');
    console.log('  at-book                      カレントディレクトリ配下の autoGenerate をビルド');
    console.log('  at-book <フォルダ>           配下の at-book.config.json を全て探してビルド');
    console.log('  at-book <at-book.config.json> その設定ファイルの autoGenerate だけをビルド');
    console.log('  at-book <原稿.atb>           その原稿だけをビルド（隣の設定ファイルを使う）');
    console.log('');
    console.log('  at-book init                 カレントディレクトリに初期設定ファイルを生成');
    console.log('  at-book web <原稿.atb>       ウェブ投稿用テキストに変換');
    console.log('  at-book cover <ページ数> [本文紙厚mm] [表紙紙厚mm] [出力ファイル]');
    console.log('                               表紙テンプレート（SVG）を生成');
    console.log('');
    console.log('  --version, -v                バージョンを表示');
    console.log('  --help, -h                   この使い方を表示');
}

async function main(): Promise<void> {
    const [subcommand, ...rest] = process.argv.slice(2);

    if (subcommand === "--version" || subcommand === "-v") {
        console.log(readVersion());
        return;
    }

    if (subcommand === "--help" || subcommand === "-h") {
        printHelp();
        return;
    }

    if (subcommand === "init") {
        await runInit();
    } else if (subcommand === "cover") {
        await runCover(rest);
    } else if (subcommand === "web") {
        const fileArg = rest.find(a => !a.startsWith("--"));
        if (!fileArg) {
            console.error("使い方: at-book web <file.atb>");
            process.exit(1);
        }
        await runWeb(fileArg);
    } else {
        // 残りはすべてビルド対象の指定として扱う（未指定ならカレントディレクトリ）。
        await runBuild(subcommand);
    }
}

main().catch((err: unknown) => {
    // 利用者向け CLI なので、想定内の失敗はスタックトレースではなくメッセージだけを出す。
    // Error 以外（想定外の投げ方）はそのまま出して手掛かりを残す。
    if (err instanceof Error) console.error(`エラー: ${err.message}`);
    else console.error(err);
    process.exit(1);
});
