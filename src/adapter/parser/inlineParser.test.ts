import { describe, it, expect } from 'vitest';
import { parseInline } from './inlineParser';

describe('ダッシュ記法（＠ー）', () => {
    it('＠ー は dash level 1（ダッシュ２連）になる', () => {
        const nodes = parseInline('闇の中＠ー');
        expect(nodes).toEqual([
            { kind: 'text', text: '闇の中' },
            expect.objectContaining({ kind: 'dash', level: 1 }),
        ]);
    });

    it('＠ーー は dash level 2（ダッシュ４連）になる', () => {
        const nodes = parseInline('＠ーー');
        expect(nodes).toEqual([
            expect.objectContaining({ kind: 'dash', level: 2 }),
        ]);
    });

    it('＠なしの ーー はダッシュにならず、ただのテキストのまま', () => {
        const nodes = parseInline('ーー');
        expect(nodes).toEqual([{ kind: 'text', text: 'ーー' }]);
    });

    it('ルビ（＠夜明け（よあけ））はダッシュと誤認されない', () => {
        const nodes = parseInline('＠夜明け（よあけ）');
        expect(nodes).toEqual([
            expect.objectContaining({ kind: 'ruby', text: '夜明け', ruby: 'よあけ' }),
        ]);
    });

    it('同じ行に ＠ー と ＠圏点 が混在しても、間のテキストを巻き込まない', () => {
        // ＠始まり（・）のルビ判定が先頭の ＠ー まで遡って飲み込まないこと
        const nodes = parseInline('＠ーここが、＠始まり（・）だったのだ。');
        expect(nodes).toEqual([
            expect.objectContaining({ kind: 'dash', level: 1 }),
            { kind: 'text', text: 'ここが、' },
            expect.objectContaining({ kind: 'kenten', text: '始まり' }),
            { kind: 'text', text: 'だったのだ。' },
        ]);
    });
});
