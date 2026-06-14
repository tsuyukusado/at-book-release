import { exec } from "child_process";
import { writeFile, mkdir, readFile } from "fs/promises";
import { promisify } from "util";
import * as path from "path";
import type { LatexRunner } from "../usecase";

const execAsync = promisify(exec);

async function parsePageCount(logPath: string): Promise<number> {
    try {
        const log = await readFile(logPath, 'utf-8');
        const m = log.match(/Output written on .+?\((\d+) pages?,/);
        if (m?.[1]) return parseInt(m[1], 10);
    } catch { /* ログが読めない場合はフォールバック */ }
    return 0;
}

export const nodeLuaLatexRunner: LatexRunner = {
    async compile(texContent: string, outputPath: string): Promise<{ pageCount: number }> {
        const dir     = path.dirname(outputPath);
        const base    = path.basename(outputPath, '.pdf');
        const texPath = path.join(dir, `${base}.tex`);
        const logPath = path.join(dir, `${base}.log`);

        const fontsDir = path.resolve(__dirname, '../../fonts');

        await mkdir(dir, { recursive: true });
        await writeFile(texPath, texContent, 'utf-8');
        const cmd = `lualatex -interaction=nonstopmode -output-directory="${dir}" "${texPath}"`;
        const env = { ...process.env, OSFONTDIR: fontsDir };
        await execAsync(cmd, { env, cwd: dir });
        await execAsync(cmd, { env, cwd: dir });

        const pageCount = await parsePageCount(logPath);
        return { pageCount };
    }
};
