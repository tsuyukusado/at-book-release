import { describe, it, expect } from 'vitest';
import { atbConverter } from './atbConverter';
import type { PaperConfig } from '../domain';

const config: PaperConfig = { paperSize: 'a6', writingMode: 'vertical' };

describe('atbConverter（parse と render の結線）', () => {
    it('convert は原稿を HTML 文書に変換する', () => {
        const html = atbConverter.convert('こんにちは', config);
        expect(html).toContain('<p class="atb-p">こんにちは</p>');
    });

    it('format 省略時は pdf 扱い（同梱フォントの @font-face を含む）', () => {
        expect(atbConverter.convert('本文', config)).toContain('@font-face');
    });

    it('format=epub では @font-face を出さない（読者の端末フォントに委ねる）', () => {
        expect(atbConverter.convert('本文', config, 'epub')).not.toContain('@font-face');
    });

    it('convertEpubSections は改ページ境界でファイル名付きの複数 spine に分割する', () => {
        const sections = atbConverter.convertEpubSections('前半\n＠＠＠\n後半', config);
        expect(sections.length).toBe(2);
        expect(sections[0]!.fileName).not.toBe(sections[1]!.fileName);
        expect(sections[0]!.html).toContain('前半');
        expect(sections[1]!.html).toContain('後半');
    });
});
