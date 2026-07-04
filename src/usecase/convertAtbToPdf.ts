import * as path from "path";
import type { PaperConfig, OutputFormat } from "../domain";
import { countChars } from "./countChars";

export interface AtbConverter {
    convert(atbText: string, config: PaperConfig): string;
}

export interface FileReader {
    read(filePath: string): Promise<string>;
}

export interface HtmlToPdfRunner {
    // 紙面固定の PDF を組む。実際に組版しないと分からないページ数を返す。
    compile(htmlContent: string, outputPath: string): Promise<{ pageCount: number }>;
    // 電子書籍向けの epub を書き出す。リフローするためページ数の概念は無い。
    compileEpub(htmlContent: string, outputPath: string): Promise<void>;
}

export interface ConfigReader {
    read(atbPath: string): Promise<PaperConfig>;
}

interface Deps {
    converter:    AtbConverter;
    fileReader:   FileReader;
    pdfRunner:    HtmlToPdfRunner;
    configReader: ConfigReader;
}

export interface ConvertInput  { atbPath: string }
export interface ConvertOutput {
    // 生成したフォーマットのぶんだけパスが入る（要求されなければ undefined）。
    pdfPath?:   string;
    epubPath?:  string;
    // pdf を組んだときのみ有効。epub のみのときは 0（呼び出し側でページ数依存処理を抑止できる）。
    pageCount:  number;
    charCount:  number;
    formats:    OutputFormat[];
    config:     PaperConfig;
}

export async function convertAtb(
    deps: Deps,
    input: ConvertInput
): Promise<ConvertOutput> {
    const [atbText, config] = await Promise.all([
        deps.fileReader.read(input.atbPath),
        deps.configReader.read(input.atbPath),
    ]);
    const base    = path.basename(input.atbPath, '.atb');
    const outDir  = path.join('dist', 'at-book');
    const formats = config.formats && config.formats.length > 0 ? config.formats : ['pdf' as const];

    // HTML は pdf / epub のときだけ 1 回組み、両フォーマットで共有する。
    // web はプレーンテキストで HTML 経路を通らないため、呼び出し側（CLI）が別途出力する。
    const needsHtml = formats.includes('pdf') || formats.includes('epub');
    const htmlContent = needsHtml ? deps.converter.convert(atbText, config) : '';

    let pdfPath:  string | undefined;
    let epubPath: string | undefined;
    let pageCount = 0;

    if (formats.includes('pdf')) {
        pdfPath = path.join(outDir, `${base}-honbun.pdf`);
        ({ pageCount } = await deps.pdfRunner.compile(htmlContent, pdfPath));
    }
    if (formats.includes('epub')) {
        epubPath = path.join(outDir, `${base}.epub`);
        await deps.pdfRunner.compileEpub(htmlContent, epubPath);
    }

    const charCount = countChars(atbText);
    return { pdfPath, epubPath, pageCount, charCount, formats, config };
}
