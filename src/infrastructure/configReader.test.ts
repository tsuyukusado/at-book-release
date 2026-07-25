import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
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

    it('web も有効なフォーマットとして採用する', async () => {
        const cfg = await readConfig({ formats: ['pdf', 'web'] });
        expect(cfg.formats).toEqual(['pdf', 'web']);
    });

    it('配列でない・有効値ゼロなら undefined', async () => {
        expect((await readConfig({ formats: 'epub' })).formats).toBeUndefined();
        expect((await readConfig({ formats: ['mobi'] })).formats).toBeUndefined();
    });
});

describe('configReader の用紙・組み方向・紙厚・autoGenerate', () => {
    it('正常な設定は値をそのまま読み取る', async () => {
        const cfg = await readConfig({ paperSize: 'a4', writingMode: 'horizontal', bodyPaperThicknessMm: 0.09, coverPaperThicknessMm: 0.35 });
        expect(cfg.paperSize).toBe('a4');
        expect(cfg.writingMode).toBe('horizontal');
        expect(cfg.bodyPaperThicknessMm).toBe(0.09);
        expect(cfg.coverPaperThicknessMm).toBe(0.35);
    });

    it('不正な paperSize はデフォルト（a6）にフォールバック', async () => {
        expect((await readConfig({ paperSize: 'b4' })).paperSize).toBe('a6');
    });

    it('不正な writingMode はデフォルト（vertical）にフォールバック', async () => {
        expect((await readConfig({ writingMode: 'diagonal' })).writingMode).toBe('vertical');
    });

    it('紙厚が 0 以下・数値でないなら undefined', async () => {
        const cfg = await readConfig({ bodyPaperThicknessMm: 0, coverPaperThicknessMm: '0.35' });
        expect(cfg.bodyPaperThicknessMm).toBeUndefined();
        expect(cfg.coverPaperThicknessMm).toBeUndefined();
    });

    it('autoGenerate は配列から文字列要素だけ抽出する', async () => {
        const cfg = await readConfig({ autoGenerate: ['a.atb', 123, 'b.atb', null] });
        expect(cfg.autoGenerate).toEqual(['a.atb', 'b.atb']);
    });

    it('autoGenerate が配列でなければ undefined', async () => {
        expect((await readConfig({ autoGenerate: 'a.atb' })).autoGenerate).toBeUndefined();
    });

    it('設定ファイルが無ければデフォルト設定を返す', async () => {
        const noConfigDir = path.join(dir, 'no-config');
        await mkdir(noConfigDir, { recursive: true });
        const cfg = await nodeConfigReader.read(path.join(noConfigDir, 'book.atb'));
        expect(cfg).toMatchObject({ paperSize: 'a6', writingMode: 'vertical' });
    });

    it('壊れた JSON ならデフォルト設定を返す', async () => {
        await writeFile(path.join(dir, 'at-book.config.json'), '{こわれてる', 'utf-8');
        const cfg = await nodeConfigReader.read(path.join(dir, 'book.atb'));
        expect(cfg).toMatchObject({ paperSize: 'a6', writingMode: 'vertical' });
    });
});
