import * as path from "path";
import type { PaperConfig } from "../domain";

export interface AtbConverter {
    convert(atbText: string, config: PaperConfig): string;
}

export interface FileReader {
    read(filePath: string): Promise<string>;
}

export interface LatexRunner {
    compile(texContent: string, outputPath: string): Promise<{ pageCount: number }>;
}

export interface ConfigReader {
    read(atbPath: string): Promise<PaperConfig>;
}

interface Deps {
    converter:    AtbConverter;
    fileReader:   FileReader;
    latexRunner:  LatexRunner;
    configReader: ConfigReader;
}

export interface ConvertInput  { atbPath: string }
export interface ConvertOutput { pdfPath: string; pageCount: number; config: PaperConfig }

export async function convertAtbToPdf(
    deps: Deps,
    input: ConvertInput
): Promise<ConvertOutput> {
    const [atbText, config] = await Promise.all([
        deps.fileReader.read(input.atbPath),
        deps.configReader.read(input.atbPath),
    ]);
    const texContent = deps.converter.convert(atbText, config);

    const base    = path.basename(input.atbPath, '.atb');
    const pdfPath = path.join('dist', `${base}-honbun.pdf`);

    const { pageCount } = await deps.latexRunner.compile(texContent, pdfPath);
    return { pdfPath, pageCount, config };
}
