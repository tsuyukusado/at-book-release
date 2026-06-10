import * as fs from "fs/promises";
import * as nodePath from "path";
import { FileWriter } from "../usecase/generateCoverTemplate";

export const nodeFileWriter: FileWriter = {
    async write(filePath: string, content: string): Promise<void> {
        await fs.mkdir(nodePath.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, "utf8");
    },
};
