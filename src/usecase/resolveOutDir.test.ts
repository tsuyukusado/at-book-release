import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { resolveOutDir } from './resolveOutDir';

describe('resolveOutDir', () => {
    it('OUT-01 既定では原稿と同じフォルダの at-book-out', () => {
        expect(resolveOutDir('/works/novel/doc/book.atb', {}))
            .toBe(path.resolve('/works/novel/doc/at-book-out'));
    });

    it('OUT-02 outDir 指定は原稿のフォルダからの相対パスとして解決する', () => {
        expect(resolveOutDir('/works/novel/doc/book.atb', { outDir: 'out' }))
            .toBe(path.resolve('/works/novel/doc/out'));
        expect(resolveOutDir('/works/novel/doc/book.atb', { outDir: '../build/本' }))
            .toBe(path.resolve('/works/novel/build/本'));
    });

    it('OUT-03 outDir が絶対パスならそのまま使う', () => {
        const abs = path.resolve('/tmp/at-book');
        expect(resolveOutDir('/works/novel/doc/book.atb', { outDir: abs })).toBe(abs);
    });

    it('OUT-04 実行時のカレントディレクトリに依存しない', () => {
        // 相対指定の原稿でも、原稿のフォルダが基準になる。
        const rel = path.join('doc', 'book.atb');
        expect(resolveOutDir(rel, {})).toBe(path.resolve('doc', 'at-book-out'));
    });
});
