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

    it('＠ー の直後に全角括弧（笑）があってもダッシュを巻き込まない', () => {
        const nodes = parseInline('＠ー（笑）');
        expect(nodes).toEqual([
            expect.objectContaining({ kind: 'dash', level: 1 }),
            { kind: 'text', text: '（笑）' },
        ]);
    });

    it('同じ行の後方にルビ（＠なしの語（読み））があっても ＠ー を巻き込まない', () => {
        // 実際の小説本文パターン: ダッシュの後に括弧付き注記が続く。
        // ＠ー の ＠ が後方の（かのじょ）と組んでルビ化してしまわないこと。
        const nodes = parseInline('「まさか＠ー」彼女（かのじょ）は息をのんだ。');
        expect(nodes).toEqual([
            { kind: 'text', text: '「まさか' },
            expect.objectContaining({ kind: 'dash', level: 1 }),
            { kind: 'text', text: '」彼女（かのじょ）は息をのんだ。' },
        ]);
    });

    it('行内に ＠ー と本物のルビ（＠語（読み））が両方あっても、両方正しく解釈する', () => {
        const nodes = parseInline('＠夜明け（よあけ）の＠ー');
        expect(nodes).toEqual([
            expect.objectContaining({ kind: 'ruby', text: '夜明け', ruby: 'よあけ' }),
            { kind: 'text', text: 'の' },
            expect.objectContaining({ kind: 'dash', level: 1 }),
        ]);
    });
});
