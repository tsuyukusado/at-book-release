import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { nodeFileWriter } from './fileWriter';

let dir: string;

beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'at-book-writer-'));
});
afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('nodeFileWriter', () => {
    it('存在しない中間ディレクトリごと作ってファイルを書く', async () => {
        const file = path.join(dir, 'a', 'b', 'out.txt');
        await nodeFileWriter.write(file, '中身');
        expect(await readFile(file, 'utf-8')).toBe('中身');
    });

    it('既存ファイルは上書きする', async () => {
        const file = path.join(dir, 'over.txt');
        await nodeFileWriter.write(file, '一回目');
        await nodeFileWriter.write(file, '二回目');
        expect(await readFile(file, 'utf-8')).toBe('二回目');
    });
});
