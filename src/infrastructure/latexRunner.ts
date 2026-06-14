import { spawn } from "child_process";
import { writeFile, mkdir, readFile } from "fs/promises";
import * as path from "path";
import type { LatexRunner } from "../usecase";

function spawnAsync(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: 'inherit', env });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`lualatex exited with code ${code}`));
        });
        child.on('error', reject);
    });
}

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

        const absDir     = path.resolve(dir);
        const absTexPath = path.resolve(texPath);

        const args = ['-interaction=nonstopmode', `-output-directory=${absDir}`, absTexPath];
        const env  = { ...process.env, OSFONTDIR: fontsDir };

        await mkdir(absDir, { recursive: true });
        await writeFile(absTexPath, texContent, 'utf-8');
        await spawnAsync('lualatex', args, env);
        await spawnAsync('lualatex', args, env);

        const pageCount = await parsePageCount(logPath);
        return { pageCount };
    }
};
