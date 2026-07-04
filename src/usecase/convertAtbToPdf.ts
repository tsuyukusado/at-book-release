import * as path from "path";
import type { PaperConfig, OutputFormat, EpubSection } from "../domain";
import { countChars } from "./countChars";

export interface AtbConverter {
    // format は HTML/CSS の出力先（'pdf' | 'epub'）。省略時は 'pdf'。
    // 圏点の拡大手法など、リーダー対応の都合で pdf と epub で CSS を出し分けるために使う。
    convert(atbText: string, config: PaperConfig, format?: 'pdf' | 'epub'): string;
    // EPUB は改ページ境界で spine（XHTML 文書）を分割する。ファイル名付きの分割済み文書列を返す。
    convertEpubSections(atbText: string, config: PaperConfig): EpubSection[];
}

export interface FileReader {
    read(filePath: string): Promise<string>;
}

export interface HtmlToPdfRunner {
    // 紙面固定の PDF を組む。実際に組版しないと分からないページ数を返す。
    compile(htmlContent: string, outputPath: string): Promise<{ pageCount: number }>;
    // 電子書籍向けの epub を書き出す。リフローするためページ数の概念は無い。
    // sections は改ページ境界で分割済みの spine 文書群（ファイル名付き）。各要素が 1 spine になる。
    compileEpub(sections: EpubSection[], outputPath: string): Promise<void>;
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

    // HTML/CSS は出力先ごとに組む。圏点の拡大などリーダー対応の都合で pdf と epub では
    // CSS が異なるため、共有せずフォーマット別に変換する（変換自体は文字列組みだけで軽い）。
    // web はプレーンテキストで HTML 経路を通らないため、呼び出し側（CLI）が別途出力する。
    let pdfPath:  string | undefined;
    let epubPath: string | undefined;
    let pageCount = 0;

    if (formats.includes('pdf')) {
        pdfPath = path.join(outDir, `${base}-honbun.pdf`);
        const html = deps.converter.convert(atbText, config, 'pdf');
        ({ pageCount } = await deps.pdfRunner.compile(html, pdfPath));
    }
    if (formats.includes('epub')) {
        epubPath = path.join(outDir, `${base}.epub`);
        // 改ページ境界で分割した spine 文書列を組み、複数 XHTML の EPUB として書き出す。
        const sections = deps.converter.convertEpubSections(atbText, config);
        await deps.pdfRunner.compileEpub(sections, epubPath);
    }

    const charCount = countChars(atbText);
    return { pdfPath, epubPath, pageCount, charCount, formats, config };
}
