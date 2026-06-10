import { readFile } from "fs/promises";
import type { FileReader } from "../usecase";

export const nodeFileReader: FileReader = {
    async read(filePath: string): Promise<string> {
        return readFile(filePath, 'utf-8');
    }
};
