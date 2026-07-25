import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWriteStream, existsSync, readFileSync } from 'fs';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import archiver from 'archiver';
import { PDFDocument } from 'pdf-lib';
import StreamZip from 'node-stream-zip';
import { spawn } from 'child_process';
import { vivliostyleRunner, readPdfPageCount } from './vivliostyleRunner';

// vivliostyle CLI（＝ヘッドレスブラウザ）を実際に起動せず、起動コマンドの組み立てと
// ビルドディレクトリの前処理・後始末だけを検証する。
vi.mock('child_process', () => ({ spawn: vi.fn() }));

const spawnMock = vi.mocked(spawn);

// close イベントだけ発火する子プロセスの代役。
function fakeChild(code: number) {
    const child = {
        on(event: string, cb: (arg: number) => void) {
            if (event === 'close') queueMicrotask(() => cb(code));
            return child;
        },
    };
    return child as unknown as ReturnType<typeof spawn>;
}

// spawn 呼び出しの引数配列（cmd が node のときは先頭の bin パスも含む）。
function spawnedArgs(): string[] {
    const call = spawnMock.mock.calls[0]!;
    return [call[0] as string, ...(call[1] as string[])];
}

async function makePdf(file: string, pages: number): Promise<void> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage();
    await writeFile(file, await doc.save());
}

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'at-book-vivlio-'));
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => fakeChild(0));
});
afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    delete process.env.AT_BOOK_CHROME;
});

describe('readPdfPageCount', () => {
    it('生成済み PDF のページ数を読む', async () => {
        const pdf = path.join(dir, 'book.pdf');
        await makePdf(pdf, 3);
        expect(await readPdfPageCount(pdf)).toBe(3);
    });

    it('壊れたファイル・存在しないファイルは undefined', async () => {
        const broken = path.join(dir, 'broken.pdf');
        await writeFile(broken, 'PDFではない中身');
        expect(await readPdfPageCount(broken)).toBeUndefined();
        expect(await readPdfPageCount(path.join(dir, 'nai.pdf'))).toBeUndefined();
    });
});

describe('compile（PDF 組版）', () => {
    it('HTML を出力先に書き、vivliostyle build を出力パス付きで起動する', async () => {
        const outPdf = path.join(dir, 'book-honbun.pdf');
        await makePdf(outPdf, 2); // 実際の組版はモックなので、成果物は先に置いておく

        // 中間 HTML は組版後に片付けられるため、組版中（spawn 時点）の中身を覗いておく。
        const htmlPath = path.join(dir, 'book-honbun.html');
        let htmlAtSpawn: string | undefined;
        spawnMock.mockImplementation(() => {
            htmlAtSpawn = readFileSync(htmlPath, 'utf-8');
            return fakeChild(0);
        });

        const { pageCount } = await vivliostyleRunner.compile('<html>本文</html>', outPdf);

        expect(htmlAtSpawn).toBe('<html>本文</html>');
        expect(pageCount).toBe(2);

        const args = spawnedArgs();
        expect(args).toContain('build');
        expect(args).toContain('-o');
        expect(args).toContain(path.resolve(outPdf));
        expect(args).not.toContain('-f'); // pdf は拡張子から推論させる
    });

    it('@font-face 用に置いた fonts/ と中間 HTML を組版後に片付ける', async () => {
        const outPdf = path.join(dir, 'book-honbun.pdf');
        await makePdf(outPdf, 1);
        await vivliostyleRunner.compile('<html></html>', outPdf);
        expect(existsSync(path.join(dir, 'fonts'))).toBe(false);
        expect(existsSync(path.join(dir, 'book-honbun.html'))).toBe(false);
    });

    it('AT_BOOK_CHROME が実在パスなら --executable-browser に渡す', async () => {
        process.env.AT_BOOK_CHROME = process.execPath; // 「実在するファイル」の代表
        const outPdf = path.join(dir, 'book-honbun.pdf');
        await makePdf(outPdf, 1);
        await vivliostyleRunner.compile('<html></html>', outPdf);
        const args = spawnedArgs();
        expect(args).toContain('--executable-browser');
        expect(args).toContain(process.execPath);
    });

    it('vivliostyle が非 0 で終了したら失敗し、fonts/ の後始末はそれでも行う', async () => {
        spawnMock.mockImplementation(() => fakeChild(1));
        const outPdf = path.join(dir, 'book-honbun.pdf');
        await expect(vivliostyleRunner.compile('<html></html>', outPdf))
            .rejects.toThrow('vivliostyle exited with code 1');
        expect(existsSync(path.join(dir, 'fonts'))).toBe(false);
    });

    it('AT_BOOK_CHROME 未指定の失敗では AT_BOOK_CHROME の指定を案内する', async () => {
        // 同梱 Chromium のダウンロードに失敗する環境（Playwright 非対応 OS 等）でも、
        // 手元のブラウザを指せば組める。その道筋をエラーに含める。
        spawnMock.mockImplementation(() => fakeChild(1));
        const outPdf = path.join(dir, 'book-honbun.pdf');
        await expect(vivliostyleRunner.compile('<html></html>', outPdf))
            .rejects.toThrow('AT_BOOK_CHROME');
    });

    it('AT_BOOK_CHROME 指定済みの失敗では重ねて案内しない', async () => {
        process.env.AT_BOOK_CHROME = process.execPath;
        spawnMock.mockImplementation(() => fakeChild(1));
        const outPdf = path.join(dir, 'book-honbun.pdf');
        const err = await vivliostyleRunner.compile('<html></html>', outPdf).then(
            () => undefined,
            (e: unknown) => e as Error,
        );
        expect(err).toBeInstanceOf(Error);
        expect(err!.message).toContain('組版に失敗しました');
        expect(err!.message).not.toContain('AT_BOOK_CHROME');
    });

    it('成果物の PDF が無ければページ数 0 を返す', async () => {
        const outPdf = path.join(dir, 'book-honbun.pdf');
        const { pageCount } = await vivliostyleRunner.compile('<html></html>', outPdf);
        expect(pageCount).toBe(0);
    });
});

describe('compileEpub（EPUB 組版）', () => {
    const sections = [
        { fileName: 'part-001.html', html: '<html>前半</html>' },
        { fileName: 'part-002.html', html: '<html>後半</html>' },
    ];

    it('隔離ディレクトリにセクションと設定を置いて組み、終わったら片付ける', async () => {
        const outEpub = path.join(dir, 'book.epub');
        const buildDir = path.join(dir, '.epub-build-book');

        // 組版中（spawn 時点）の隔離ディレクトリの中身を覗いておく。
        let seenAtSpawn: { config: string; sections: boolean[] } | undefined;
        spawnMock.mockImplementation(() => {
            seenAtSpawn = {
                config: readFileSync(path.join(buildDir, 'vivliostyle.config.js'), 'utf-8'),
                sections: sections.map(s => existsSync(path.join(buildDir, s.fileName))),
            };
            return fakeChild(0);
        });

        await vivliostyleRunner.compileEpub(sections, outEpub, 'rtl');

        expect(seenAtSpawn!.sections).toEqual([true, true]);
        expect(seenAtSpawn!.config).toContain('"readingProgression": "rtl"');
        expect(seenAtSpawn!.config).toContain('part-001.html');
        expect(existsSync(buildDir)).toBe(false); // 後始末

        const args = spawnedArgs();
        expect(args).toContain('-c');
        expect(args).toContain('-f');
        expect(args).toContain('epub');
    });

    it('縦組みでは生成後の EPUB へ primary-writing-mode を注入する', async () => {
        const outEpub = path.join(dir, 'book.epub');
        // 組版はモックなので、注入対象の EPUB を先に置いておく。
        await new Promise<void>((resolve, reject) => {
            const output = createWriteStream(outEpub);
            const archive = archiver('zip');
            output.on('close', () => resolve());
            archive.on('error', reject);
            archive.pipe(output);
            archive.append('application/epub+zip', { name: 'mimetype', store: true });
            archive.append('<package><metadata>\n</metadata></package>', { name: 'EPUB/content.opf' });
            archive.finalize();
        });

        await vivliostyleRunner.compileEpub(sections, outEpub, 'rtl', 'vertical-rl');

        const zip = new StreamZip.async({ file: outEpub });
        const opf = (await zip.entryData('EPUB/content.opf')).toString('utf-8');
        await zip.close();
        expect(opf).toContain('<meta name="primary-writing-mode" content="vertical-rl"/>');
    });
});
