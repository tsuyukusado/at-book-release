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

    it('章フォルダ・話ファイル名の先頭に連番が付く（01_タイトル）', () => {
        const paths = result.files.map(f => [...f.dir, f.name].join('/')).sort();
        expect(paths).toEqual(
            ['01_第一章/01_第一章', '01_第一章/02_出会い', '01_第一章/03_別れ'].sort(),
        );
    });

    it('章直下（小見出し前）の本文は章見出し名のファイル（話番号01）になる', () => {
        const f = result.files.find(f => f.name.endsWith('_第一章'));
        expect(f?.dir).toEqual(['01_第一章']);
        expect(f?.name).toBe('01_第一章');
        expect(f?.content).toBe('章の導入本文。');
    });

    it('話ファイルの本文はウェブ記法に変換される', () => {
        const f = result.files.find(f => f.name.endsWith('_出会い'));
        expect(f?.content).toBe('「｜彼女《かのじょ》は笑った」\n本文――');
    });

    it('目次はまるごと消え、改ページは改行になる', () => {
        const f = result.files.find(f => f.name.endsWith('_別れ'));
        expect(f?.content).toBe('点｜文《﹅》｜字《﹅》を打つ\n\n続き');
    });

    it('話番号は章ごとに 01 からリセットし、章番号は作品を通して振る', () => {
        const r = exportWeb(
            ['＠第一章', '＠＠A', 'あ', '＠＠B', 'い', '＠第二章', '＠＠C', 'う'].join('\n'),
        );
        const paths = r.files.map(f => [...f.dir, f.name].join('/')).sort();
        expect(paths).toEqual(
            ['01_第一章/01_A', '01_第一章/02_B', '02_第二章/01_C'].sort(),
        );
    });

    it('件数が10以上ならゼロ埋め桁数が自動で増える', () => {
        const lines: string[] = ['＠章'];
        for (let i = 1; i <= 10; i++) lines.push(`＠＠話${i}`, `本文${i}`);
        const r = exportWeb(lines.join('\n'));
        expect(r.files.map(f => f.name)).toContain('01_話1');
        expect(r.files.map(f => f.name)).toContain('10_話10');
    });

    it('見出しが無ければ全文を1ファイル（話番号01）にする', () => {
        const r = exportWeb('ただの文章\nもう一行');
        expect(r.folderName).toBe('ただの文章');
        expect(r.files).toEqual([
            { dir: [], name: '01_ただの文章', content: 'ただの文章\nもう一行' },
        ]);
    });

    it('同じ見出しが重なっても話番号が異なるので名前が衝突しない', () => {
        const r = exportWeb(['＠章', '＠＠同話', 'あ', '＠＠同話', 'い'].join('\n'));
        const names = r.files.map(f => f.name).sort();
        expect(names).toEqual(['01_同話', '02_同話']);
    });
});
