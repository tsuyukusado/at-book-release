import * as path from "path";
import type { PaperConfig } from "../domain";
import { countChars } from "./countChars";

export interface AtbConverter {
    convert(atbText: string, config: PaperConfig): string;
}

export interface FileReader {
    read(filePath: string): Promise<string>;
}

export interface HtmlToPdfRunner {
    compile(htmlContent: string, outputPath: string): Promise<{ pageCount: number }>;
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
export interface ConvertOutput { pdfPath: string; pageCount: number; charCount: number; config: PaperConfig }

export async function convertAtbToPdf(
    deps: Deps,
    input: ConvertInput
): Promise<ConvertOutput> {
    const [atbText, config] = await Promise.all([
        deps.fileReader.read(input.atbPath),
        deps.configReader.read(input.atbPath),
    ]);
    const htmlContent = deps.converter.convert(atbText, config);

    const base    = path.basename(input.atbPath, '.atb');
    const pdfPath = path.join('dist', 'at-book', `${base}-honbun.pdf`);

    const { pageCount } = await deps.pdfRunner.compile(htmlContent, pdfPath);
    const charCount = countChars(atbText);
    return { pdfPath, pageCount, charCount, config };
}
