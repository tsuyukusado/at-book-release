import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWriteStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import archiver from 'archiver';
import StreamZip from 'node-stream-zip';
import { injectPrimaryWritingMode } from './epubPostProcess';

// primary-writing-mode を含まない最小 EPUB（mimetype + content.opf）を組む。
function buildMinimalEpub(dest: string, opf: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const output = createWriteStream(dest);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', () => resolve());
        archive.on('error', reject);
        archive.pipe(output);
        archive.append('application/epub+zip', { name: 'mimetype', store: true });
        archive.append(opf, { name: 'EPUB/content.opf' });
        archive.finalize();
    });
}

const OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:test</dc:identifier>
    <dc:title>t</dc:title>
    <dc:language>ja</dc:language>
  </metadata>
  <manifest></manifest>
  <spine page-progression-direction="rtl"></spine>
</package>`;

describe('injectPrimaryWritingMode', () => {
    let dir: string;
    let epub: string;

    beforeEach(async () => {
        dir = await mkdtemp(path.join(os.tmpdir(), 'atb-epub-'));
        epub = path.join(dir, 'sample.epub');
    });
    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    async function readEpub(file: string) {
        const zip = new StreamZip.async({ file });
        const entries = await zip.entries();
        const names = Object.keys(entries);
        const opf = (await zip.entryData('EPUB/content.opf')).toString('utf-8');
        const mimetype = entries['mimetype']!;
        await zip.close();
        return { names, opf, mimetypeMethod: mimetype.method };
    }

    it('OPF の metadata に primary-writing-mode を注入する', async () => {
        await buildMinimalEpub(epub, OPF);
        await injectPrimaryWritingMode(epub, 'vertical-rl');
        const { opf } = await readEpub(epub);
        expect(opf).toContain('<meta name="primary-writing-mode" content="vertical-rl"/>');
        // metadata 内（</metadata> の前）に入っていること。
        expect(opf.indexOf('primary-writing-mode')).toBeLessThan(opf.indexOf('</metadata>'));
    });

    it('mimetype を先頭・無圧縮(store)で保ったまま再梱包する', async () => {
        await buildMinimalEpub(epub, OPF);
        await injectPrimaryWritingMode(epub, 'vertical-rl');
        const { names, mimetypeMethod } = await readEpub(epub);
        expect(names[0]).toBe('mimetype');
        expect(mimetypeMethod).toBe(0); // 0 = STORED
    });

    it('二重に呼んでも注入は一度だけ（冪等）', async () => {
        await buildMinimalEpub(epub, OPF);
        await injectPrimaryWritingMode(epub, 'vertical-rl');
        await injectPrimaryWritingMode(epub, 'vertical-rl');
        const { opf } = await readEpub(epub);
        const count = opf.split('primary-writing-mode').length - 1;
        expect(count).toBe(1);
    });

    it('OPF に </metadata> が無ければ何もしない（素通し）', async () => {
        const opfWithoutMetadata = '<package><manifest></manifest></package>';
        await buildMinimalEpub(epub, opfWithoutMetadata);
        await injectPrimaryWritingMode(epub, 'vertical-rl');
        const { opf } = await readEpub(epub);
        expect(opf).toBe(opfWithoutMetadata);
        expect(opf).not.toContain('primary-writing-mode');
    });

    it('mimetype やディレクトリエントリの無い・有る EPUB でも再梱包できる', async () => {
        // mimetype を持たず、ディレクトリエントリを含む zip でも落ちずに注入できること。
        await new Promise<void>((resolve, reject) => {
            const output = createWriteStream(epub);
            const archive = archiver('zip', { zlib: { level: 9 } });
            output.on('close', () => resolve());
            archive.on('error', reject);
            archive.pipe(output);
            archive.append(Buffer.alloc(0), { name: 'EPUB/' });
            archive.append(OPF, { name: 'EPUB/content.opf' });
            archive.finalize();
        });
        await injectPrimaryWritingMode(epub, 'vertical-rl');

        const zip = new StreamZip.async({ file: epub });
        const opf = (await zip.entryData('EPUB/content.opf')).toString('utf-8');
        const names = Object.keys(await zip.entries());
        await zip.close();
        expect(opf).toContain('primary-writing-mode');
        expect(names).not.toContain('mimetype');
    });
});
