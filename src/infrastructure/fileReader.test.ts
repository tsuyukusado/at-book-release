import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { nodeFileReader } from './fileReader';

let dir: string;

beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'at-book-reader-'));
});
afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('nodeFileReader', () => {
    it('UTF-8 のテキストファイルをそのまま読む', async () => {
        const file = path.join(dir, 'book.atb');
        await writeFile(file, '＠章タイトル\n本文です。', 'utf-8');
        expect(await nodeFileReader.read(file)).toBe('＠章タイトル\n本文です。');
    });

    it('存在しないファイルはエラーになる', async () => {
        await expect(nodeFileReader.read(path.join(dir, 'nai.atb'))).rejects.toThrow();
    });
});
