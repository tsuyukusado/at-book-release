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

describe('半角数字の縦中横', () => {
    it('半角1桁は縦中横になる', () => {
        const nodes = parseInline('第7章');
        expect(nodes).toEqual([
            { kind: 'text', text: '第' },
            { kind: 'tatechuyoko', text: '7' },
            { kind: 'text', text: '章' },
        ]);
    });

    it('半角2桁は縦中横になる', () => {
        const nodes = parseInline('午後10時');
        expect(nodes).toEqual([
            { kind: 'text', text: '午後' },
            { kind: 'tatechuyoko', text: '10' },
            { kind: 'text', text: '時' },
        ]);
    });

    it('半角3桁以上は縦中横にせず、そのままテキストのまま', () => {
        const nodes = parseInline('全123ページ');
        expect(nodes).toEqual([{ kind: 'text', text: '全123ページ' }]);
    });

    it('数字の間に非数字を挟めば、それぞれ1〜2桁ずつ縦中横になる', () => {
        const nodes = parseInline('12月8日');
        expect(nodes).toEqual([
            { kind: 'tatechuyoko', text: '12' },
            { kind: 'text', text: '月' },
            { kind: 'tatechuyoko', text: '8' },
            { kind: 'text', text: '日' },
        ]);
    });

    it('全角数字は対象外（縦中横にしない）', () => {
        const nodes = parseInline('第１０章');
        expect(nodes).toEqual([{ kind: 'text', text: '第１０章' }]);
    });

    it('半角英字は対象外（数字だけが縦中横）', () => {
        const nodes = parseInline('AI時代');
        expect(nodes).toEqual([{ kind: 'text', text: 'AI時代' }]);
    });

    it('既存の ！？ 縦中横と共存できる', () => {
        const nodes = parseInline('まさか10連勝！？');
        expect(nodes).toEqual([
            { kind: 'text', text: 'まさか' },
            { kind: 'tatechuyoko', text: '10' },
            { kind: 'text', text: '連勝' },
            { kind: 'tatechuyoko', text: '！？' },
        ]);
    });
});
