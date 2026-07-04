import { describe, it, expect } from 'vitest';
import { convertAtb } from './convertAtbToPdf';
import type { AtbConverter, FileReader, HtmlToPdfRunner, ConfigReader } from './convertAtbToPdf';
import type { PaperConfig } from '../domain';

// 呼び出し記録つきのスタブ群。vivliostyle を実際に起動せずフォーマット振り分けを検証する。
function makeDeps(config: PaperConfig) {
    const calls: { pdf: string[]; epub: string[] } = { pdf: [], epub: [] };
    const converter: AtbConverter = { convert: () => '<html>組んだHTML</html>' };
    const fileReader: FileReader = { read: async () => 'あいうえお' };
    const configReader: ConfigReader = { read: async () => config };
    const pdfRunner: HtmlToPdfRunner = {
        async compile(_html, out) { calls.pdf.push(out); return { pageCount: 42 }; },
        async compileEpub(_html, out) { calls.epub.push(out); },
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

    it('HTML はフォーマットごとに組み、それぞれ対応する format 引数を渡す', async () => {
        // 圏点の拡大手法など pdf/epub で CSS が異なるため、共有せずフォーマット別に変換する。
        const formatsSeen: (string | undefined)[] = [];
        const deps = {
            converter: { convert: (_t: string, _c: unknown, f?: 'pdf' | 'epub') => { formatsSeen.push(f); return '<html></html>'; } },
            fileReader: { read: async () => 'x' },
            configReader: { read: async () => ({ ...base, formats: ['pdf', 'epub'] as const }) },
            pdfRunner: {
                async compile() { return { pageCount: 1 }; },
                async compileEpub() {},
            },
        };
        await convertAtb(deps, { atbPath: 'doc/test.atb' });
        expect(formatsSeen).toEqual(['pdf', 'epub']);
    });

    it('formats:["web"] なら HTML を組まず pdf/epub も生成しない（web は CLI 側で出力）', async () => {
        let convertCount = 0;
        const { deps, calls } = makeDeps({ ...base, formats: ['web'] });
        const spied = {
            ...deps,
            converter: { convert: () => { convertCount++; return '<html></html>'; } },
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
