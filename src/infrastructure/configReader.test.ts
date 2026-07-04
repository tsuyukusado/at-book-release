import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { nodeConfigReader } from './configReader';

let dir: string;

beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'at-book-cfg-'));
});
afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
});

// at-book.config.json を書き、同ディレクトリの .atb を指して読ませる。
async function readConfig(configBody: unknown) {
    await writeFile(path.join(dir, 'at-book.config.json'), JSON.stringify(configBody), 'utf-8');
    return nodeConfigReader.read(path.join(dir, 'book.atb'));
}

describe('configReader の formats パース', () => {
    it('formats 未指定なら undefined（pdf のみ扱い）', async () => {
        const cfg = await readConfig({ paperSize: 'a6', writingMode: 'horizontal' });
        expect(cfg.formats).toBeUndefined();
    });

    it('有効なフォーマットだけ採用する', async () => {
        const cfg = await readConfig({ formats: ['pdf', 'epub'] });
        expect(cfg.formats).toEqual(['pdf', 'epub']);
    });

    it('未知のフォーマットは捨て、重複は除く', async () => {
        const cfg = await readConfig({ formats: ['epub', 'mobi', 'epub', 'pdf'] });
        expect(cfg.formats).toEqual(['epub', 'pdf']);
    });

    it('配列でない・有効値ゼロなら undefined', async () => {
        expect((await readConfig({ formats: 'epub' })).formats).toBeUndefined();
        expect((await readConfig({ formats: ['mobi'] })).formats).toBeUndefined();
    });
});
