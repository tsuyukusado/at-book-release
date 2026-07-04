import { describe, it, expect } from 'vitest';
import { renderInlineWeb, sanitizeName, exportWeb } from './webExporter';

describe('renderInlineWeb（インライン変換）', () => {
    it('ルビ ＠漢字（かんじ） → ｜漢字《かんじ》', () => {
        expect(renderInlineWeb('＠漢字（かんじ）')).toBe('｜漢字《かんじ》');
    });

    it('圏点 ＠文字（・） は一文字ずつ ｜文《﹅》｜字《﹅》 になる', () => {
        expect(renderInlineWeb('点＠文字（・）を打つ')).toBe('点｜文《﹅》｜字《﹅》を打つ');
    });

    it('ダッシュ ＠ー は ―― を直接書く（レベル分くり返す）', () => {
        expect(renderInlineWeb('闇＠ー')).toBe('闇――');
        expect(renderInlineWeb('闇＠ーー')).toBe('闇――――');
    });

    it('三点リーダー ・・ は … を直接書く（中黒の数だけ）', () => {
        expect(renderInlineWeb('はぁ・・')).toBe('はぁ……');
        expect(renderInlineWeb('えっ・・・')).toBe('えっ………');
    });

    it('縦中横（！？・半角数字）はそのまま素通し', () => {
        expect(renderInlineWeb('12月')).toBe('12月');
        expect(renderInlineWeb('本当に！？')).toBe('本当に！？');
    });

    it('！のあとに文章が続くと全角スペースが挟まる（挙動を維持）', () => {
        expect(renderInlineWeb('やった！すごい')).toBe('やった！　すごい');
    });
});

describe('sanitizeName（ファイル名サニタイズ）', () => {
    it('禁止文字は全角に置換される', () => {
        expect(sanitizeName('第1話：出会い/別れ')).toBe('第1話：出会い／別れ');
        expect(sanitizeName('a<b>c*d?e"f|g\\h')).toBe('a＜b＞c＊d？e”f｜g＼h');
    });

    it('先頭・末尾の空白とピリオドは落とす', () => {
        expect(sanitizeName('  タイトル.  ')).toBe('タイトル');
    });

    it('長すぎる名前は切り詰める', () => {
        expect(sanitizeName('あ'.repeat(100)).length).toBe(80);
    });
});

describe('exportWeb（章/話への分割）', () => {
    const text = [
        'ぼくのちいさな物語',
        'これは前書きです。',
        '',
        '＠第一章',
        '章の導入本文。',
        '＠＠出会い',
        '「＠彼女（かのじょ）は笑った」',
        '本文＠ー',
        '＠目次',
        '＠＠別れ',
        '点＠文字（・）を打つ',
        '＠＠＠',
        '続き',
    ].join('\n');

    const result = exportWeb(text);

    it('作品フォルダ名はタイトル1行目の冒頭5文字', () => {
        expect(result.folderName).toBe('ぼくのちい');
    });

    it('レベル1見出しは章フォルダ、レベル2見出しは話ファイルになる', () => {
        const map = Object.fromEntries(
            result.files.map(f => [[...f.dir, f.name].join('/'), f.content]),
        );
        expect(Object.keys(map).sort()).toEqual(
            ['第一章/出会い', '第一章/別れ', '第一章/第一章'].sort(),
        );
    });

    it('章直下（小見出し前）の本文は章見出し名のファイルになる', () => {
        const f = result.files.find(f => f.name === '第一章');
        expect(f?.dir).toEqual(['第一章']);
        expect(f?.content).toBe('章の導入本文。');
    });

    it('話ファイルの本文はウェブ記法に変換される', () => {
        const f = result.files.find(f => f.name === '出会い');
        expect(f?.content).toBe('「｜彼女《かのじょ》は笑った」\n本文――');
    });

    it('目次はまるごと消え、改ページは改行になる', () => {
        const f = result.files.find(f => f.name === '別れ');
        expect(f?.content).toBe('点｜文《﹅》｜字《﹅》を打つ\n\n続き');
    });

    it('見出しが無ければ全文を1ファイルにする', () => {
        const r = exportWeb('ただの文章\nもう一行');
        expect(r.folderName).toBe('ただの文章');
        expect(r.files).toEqual([
            { dir: [], name: 'ただの文章', content: 'ただの文章\nもう一行' },
        ]);
    });

    it('同じ見出しが重なると連番でファイル名の衝突を避ける', () => {
        const r = exportWeb(['＠章', '＠＠同話', 'あ', '＠＠同話', 'い'].join('\n'));
        const names = r.files.map(f => f.name);
        expect(names).toContain('同話');
        expect(names).toContain('同話-2');
    });
});
