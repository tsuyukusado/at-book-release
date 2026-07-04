import * as path from "path";
import { exportWeb } from "../adapter/webExporter";
import type { WebExport } from "../domain";

export interface FileReader {
    read(filePath: string): Promise<string>;
}

export interface FileWriter {
    write(filePath: string, content: string): Promise<void>;
}

export interface ConvertAtbToWebPorts {
    fileReader: FileReader;
    fileWriter: FileWriter;
}

export interface ConvertAtbToWebInput {
    atbPath: string;
    // 出力先のベースディレクトリ。この下に「作品フォルダ」を作る。
    outDir: string;
}

export interface ConvertAtbToWebOutput {
    // 作品フォルダの絶対／相対パス（outDir/作品フォルダ名）。
    bookDir: string;
    export: WebExport;
    // 実際に書き出したファイルパス一覧。
    writtenPaths: string[];
}

export async function convertAtbToWeb(
    ports: ConvertAtbToWebPorts,
    input: ConvertAtbToWebInput,
): Promise<ConvertAtbToWebOutput> {
    const atbText = await ports.fileReader.read(input.atbPath);
    const result = exportWeb(atbText);

    const bookDir = path.join(input.outDir, result.folderName);
    const writtenPaths: string[] = [];

    for (const file of result.files) {
        const filePath = path.join(bookDir, ...file.dir, `${file.name}.txt`);
        // 末尾に改行を付けて書き出す。
        await ports.fileWriter.write(filePath, file.content + '\n');
        writtenPaths.push(filePath);
    }

    return { bookDir, export: result, writtenPaths };
}
