import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { findConfigDirs } from './configFinder';

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'at-book-finder-'));
});
afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

async function putConfig(...segments: string[]): Promise<string> {
    const configDir = path.join(dir, ...segments);
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, 'at-book.config.json'), '{}', 'utf-8');
    return configDir;
}

describe('findConfigDirs', () => {
    it('at-book.config.json のあるディレクトリを返す', async () => {
        const configDir = await putConfig('doc');
        expect(await findConfigDirs(dir)).toEqual([configDir]);
    });

    it('入れ子のディレクトリも再帰的に全て見つける', async () => {
        const a = await putConfig('novel', '001', 'manuscript');
        const b = await putConfig('novel', '002', 'manuscript');
        const found = await findConfigDirs(dir);
        expect(found.sort()).toEqual([a, b].sort());
    });

    it('node_modules / .git / dist / at-book-out の下は探さない', async () => {
        await putConfig('node_modules', 'pkg');
        await putConfig('.git', 'info');
        await putConfig('dist');
        await putConfig('at-book-out');
        const real = await putConfig('doc');
        expect(await findConfigDirs(dir)).toEqual([real]);
    });

    it('設定ファイルが無ければ空配列を返す', async () => {
        await mkdir(path.join(dir, 'empty'));
        expect(await findConfigDirs(dir)).toEqual([]);
    });

    it('読めないディレクトリを指定しても落ちずに空配列を返す', async () => {
        expect(await findConfigDirs(path.join(dir, 'sonzai-shinai'))).toEqual([]);
    });
});
