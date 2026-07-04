import { describe, it, expect } from 'vitest';
import { convertAtb } from './convertAtbToPdf';
import type { AtbConverter, FileReader, HtmlToPdfRunner, ConfigReader } from './convertAtbToPdf';
import type { PaperConfig } from '../domain';

// 呼び出し記録つきのスタブ群。vivliostyle を実際に起動せずフォーマット振り分けを検証する。
function makeDeps(config: PaperConfig) {
    const calls: { pdf: string[]; epub: string[] } = { pdf: [], epub: [] };
    const converter: AtbConverter = {
        convert: () => '<html>組んだHTML</html>',
        convertEpubSections: () => [
            { fileName: 'part-001.html', html: '<html>spine1</html>' },
            { fileName: 'part-002.html', html: '<html>spine2</html>' },
        ],
    };
    const fileReader: FileReader = { read: async () => 'あいうえお' };
    const configReader: ConfigReader = { read: async () => config };
    const pdfRunner: HtmlToPdfRunner = {
        async compile(_html, out) { calls.pdf.push(out); return { pageCount: 42 }; },
        async compileEpub(_sections, out) { calls.epub.push(out); },
    };
    return { deps: { converter, fileReader, pdfRunner, configReader }, calls };
}

const base: PaperConfig = { paperSize: 'a6', writingMode: 'horizontal' };

describe('convertAtb のフォーマット振り分け', () => {
    it('formats 未指定なら pdf のみ生成し、ページ数を返す', async () => {
        const { deps, calls } = makeDeps(base);
        const out = await convertAtb(deps, { atbPath: 'doc/test.atb' });
        expect(calls.pdf).toEqual(['dist/at-book/test-honbun.pdf']);
        expect(calls.epub).toEqual([]);
        expect(out.pdfPath).toBe('dist/at-book/test-honbun.pdf');
        expect(out.epubPath).toBeUndefined();
        expect(out.pageCount).toBe(42);
        expect(out.formats).toEqual(['pdf']);
    });

    it('formats:["epub"] なら epub のみ生成し、ページ数は 0', async () => {
        const { deps, calls } = makeDeps({ ...base, formats: ['epub'] });
        const out = await convertAtb(deps, { atbPath: 'doc/test.atb' });
        expect(calls.pdf).toEqual([]);
        expect(calls.epub).toEqual(['dist/at-book/test.epub']);
        expect(out.pdfPath).toBeUndefined();
        expect(out.epubPath).toBe('dist/at-book/test.epub');
        expect(out.pageCount).toBe(0);
    });

    it('formats:["pdf","epub"] なら両方生成する', async () => {
        const { deps, calls } = makeDeps({ ...base, formats: ['pdf', 'epub'] });
        const out = await convertAtb(deps, { atbPath: 'doc/test.atb' });
        expect(calls.pdf).toEqual(['dist/at-book/test-honbun.pdf']);
        expect(calls.epub).toEqual(['dist/at-book/test.epub']);
        expect(out.pdfPath).toBe('dist/at-book/test-honbun.pdf');
        expect(out.epubPath).toBe('dist/at-book/test.epub');
        expect(out.pageCount).toBe(42);
    });

    it('pdf は convert(format=pdf)、epub は convertEpubSections で別々に組む', async () => {
        // 圏点の拡大手法など pdf/epub で CSS が異なり、さらに epub は spine 分割のため
        // 複数文書を返す。両者を別メソッドとして分けて呼び分けていることを検証する。
        const convertFormats: (string | undefined)[] = [];
        let epubSectionsCalls = 0;
        const deps = {
            converter: {
                convert: (_t: string, _c: unknown, f?: 'pdf' | 'epub') => { convertFormats.push(f); return '<html></html>'; },
                convertEpubSections: () => { epubSectionsCalls++; return [{ fileName: 'part-001.html', html: '<html>a</html>' }]; },
            },
            fileReader: { read: async () => 'x' },
            configReader: { read: async () => ({ ...base, formats: ['pdf', 'epub'] as const }) },
            pdfRunner: {
                async compile() { return { pageCount: 1 }; },
                async compileEpub() {},
            },
        };
        await convertAtb(deps, { atbPath: 'doc/test.atb' });
        expect(convertFormats).toEqual(['pdf']);
        expect(epubSectionsCalls).toBe(1);
    });

    it('formats:["web"] なら HTML を組まず pdf/epub も生成しない（web は CLI 側で出力）', async () => {
        let convertCount = 0;
        const { deps, calls } = makeDeps({ ...base, formats: ['web'] });
        const spied = {
            ...deps,
            converter: {
                convert: () => { convertCount++; return '<html></html>'; },
                convertEpubSections: () => { convertCount++; return [{ fileName: 'part-001.html', html: '<html></html>' }]; },
            },
        };
        const out = await convertAtb(spied, { atbPath: 'doc/test.atb' });
        expect(convertCount).toBe(0);
        expect(calls.pdf).toEqual([]);
        expect(calls.epub).toEqual([]);
        expect(out.pdfPath).toBeUndefined();
        expect(out.epubPath).toBeUndefined();
        expect(out.pageCount).toBe(0);
        expect(out.formats).toEqual(['web']);
    });
});
