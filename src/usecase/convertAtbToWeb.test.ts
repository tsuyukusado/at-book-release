import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { convertAtbToWeb } from './convertAtbToWeb';

const ATB = [
    '通勤戦記',
    '',
    '＠第一章　旅立ち',
    '',
    '＠＠朝の支度',
    '',
    '本文です。',
].join('\n');

// 読み書きを記録する fake ポート。
function makePorts(atbText: string) {
    const written: { path: string; content: string }[] = [];
    return {
        ports: {
            fileReader: { read: async () => atbText },
            fileWriter: { write: async (p: string, c: string) => { written.push({ path: p, content: c }); } },
        },
        written,
    };
}

describe('convertAtbToWeb', () => {
    it('原稿を読み、outDir 直下の作品フォルダへ話ファイルを書き出す', async () => {
        const { ports, written } = makePorts(ATB);
        const out = await convertAtbToWeb(ports, { atbPath: 'doc/book.atb', outDir: 'doc/dist/web' });

        expect(out.bookDir).toBe(path.join('doc/dist/web', out.export.folderName));
        expect(out.writtenPaths).toEqual(written.map(w => w.path));
        expect(out.writtenPaths.length).toBeGreaterThan(0);
        for (const p of out.writtenPaths) {
            expect(p.startsWith(out.bookDir)).toBe(true);
            expect(p.endsWith('.txt')).toBe(true);
        }
    });

    it('各ファイルは末尾に改行を付けて書き出す', async () => {
        const { ports, written } = makePorts(ATB);
        await convertAtbToWeb(ports, { atbPath: 'doc/book.atb', outDir: 'out' });
        for (const w of written) {
            expect(w.content.endsWith('\n')).toBe(true);
        }
    });

    it('章フォルダ（連番付き）の下に話ファイルが入る', async () => {
        const { ports, written } = makePorts(ATB);
        const out = await convertAtbToWeb(ports, { atbPath: 'doc/book.atb', outDir: 'out' });
        const rel = written.map(w => path.relative(out.bookDir, w.path));
        expect(rel).toContain(path.join('01_第一章　旅立ち', '01_朝の支度.txt'));
    });
});
