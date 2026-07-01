import { describe, it, expect } from 'vitest';
import { render } from './htmlRenderer';
import { parse } from '../parser';
import type { PaperConfig } from '../../domain';

const horizontal: PaperConfig = { paperSize: 'a6', writingMode: 'horizontal' };
const vertical:   PaperConfig = { paperSize: 'a6', writingMode: 'vertical' };

function html(src: string, config: PaperConfig): string {
    return render(parse(src), config);
}

describe('インライン記法', () => {
    it('段落は一字下げクラス付きの <p> になり、本文はそのまま入る', () => {
        expect(html('ふつうの文章です', horizontal)).toContain('<p class="atb-p">ふつうの文章です</p>');
    });

    it('行頭が「の段落は字下げしない（atb-p-noindent が付く）', () => {
        expect(html('「おはよう」と彼は言った', horizontal))
            .toContain('<p class="atb-p atb-p-noindent">');
    });

    it('行頭が『の段落も字下げしない', () => {
        expect(html('『本の題名』を読む', horizontal))
            .toContain('<p class="atb-p atb-p-noindent">');
    });

    it('括弧以外で始まる段落は通常の字下げ（<p> に atb-p-noindent は付かない）', () => {
        expect(html('ふつうの文章です', horizontal))
            .toContain('<p class="atb-p">ふつうの文章です</p>');
    });

    it('字下げしないクラス用の text-indent: 0 が CSS に含まれる', () => {
        const out = html('「行頭括弧', horizontal);
        expect(out).toContain('p.atb-p-noindent');
        expect(out).toContain('text-indent: 0;');
    });

    it('ルビ（＠漢字（かんじ））は <ruby> になる', () => {
        expect(html('＠漢字（かんじ）', horizontal)).toContain('<ruby>漢字<rt>かんじ</rt></ruby>');
    });

    it('圏点（＠文字（・））は 1 文字ずつ ﹅ を振る ruby になる', () => {
        expect(html('＠強調（・）', horizontal)).toContain(
            '<ruby class="atb-kenten">強<rt>﹅</rt></ruby><ruby class="atb-kenten">調<rt>﹅</rt></ruby>',
        );
    });

    it('ダッシュ（＠ー）は全角ダッシュ(U+2015)2連、＠ーー は4連になる', () => {
        expect(html('闇＠ー', horizontal)).toContain('闇――');
        expect(html('＠ーー', horizontal)).toContain('――――');
    });

    it('三点リーダー（・・）は …… になる', () => {
        expect(html('そう・・', horizontal)).toContain('そう……');
    });

    it('縦中横（！？の2連以上）は縦書きでは半角化して span、横書きでは素通し', () => {
        expect(html('本当に！？', vertical)).toContain('<span class="atb-tcy">!?</span>');
        expect(html('本当に！？', horizontal)).not.toContain('<span class="atb-tcy">');
        expect(html('本当に！？', horizontal)).toContain('<p class="atb-p">本当に！？</p>');
    });

    it('HTML特殊文字はエスケープされる', () => {
        expect(html('a < b & c', horizontal)).toContain('a &lt; b &amp; c');
    });
});

describe('見出しと番号', () => {
    it('横書きの大見出しはアラビア数字＋半角スペース', () => {
        const out = html('＠序章', horizontal);
        expect(out).toContain('<h1 class="atb-h1" id="atb-h1">1 序章</h1>');
    });

    it('縦書きの大見出しは漢数字＋全角スペース', () => {
        const out = html('＠序章', vertical);
        expect(out).toContain('一　序章');
    });

    it('横書きの小見出しは「大-小」番号', () => {
        const out = html('＠序章\n＠＠導入', horizontal);
        expect(out).toContain('<h2 class="atb-h2" id="atb-h2">1-1 導入</h2>');
    });

    it('縦書きの小見出しは「大・小」漢数字番号', () => {
        const out = html('＠序章\n＠＠導入', vertical);
        expect(out).toContain('一・一　導入');
    });

    it('大見出しごとに番号が進み、小見出しは章内でリセットされる', () => {
        const out = html('＠一章\n＠＠節A\n＠二章\n＠＠節B', horizontal);
        expect(out).toContain('>1 一章</h1>');
        expect(out).toContain('>1-1 節A</h2>');
        expect(out).toContain('>2 二章</h1>');
        expect(out).toContain('>2-1 節B</h2>');
    });
});

describe('目次', () => {
    it('＠目次 は nav を生成し、各見出しへのリンクと id が対応する', () => {
        const out = html('＠目次\n＠第一章\n＠＠第一節', horizontal);
        expect(out).toContain('<nav class="atb-toc">');
        expect(out).toContain('<div class="atb-toc-title">目次</div>');
        expect(out).toContain('href="#atb-h1"');
        expect(out).toContain('href="#atb-h2"');
        expect(out).toContain('id="atb-h1"');
        expect(out).toContain('id="atb-h2"');
    });
});

describe('ブロック要素', () => {
    it('箇条書きはネストに応じて ul をネストする', () => {
        const out = html('・親\n　・子', horizontal);
        expect(out).toContain('<ul class="atb-list">');
        expect(out).toContain('<li>親</li>');
        expect(out).toContain('<li>子</li>');
        // 親の ul と子の ul で2つ開く
        expect(out.match(/<ul class="atb-list">/g)?.length).toBe(2);
    });

    it('空行は atb-blank になる', () => {
        expect(html('文\n\n文', horizontal)).toContain('<div class="atb-blank"></div>');
    });

    it('＠＠＠ は改ページになる', () => {
        expect(html('＠＠＠', horizontal)).toContain('<div class="atb-pagebreak"></div>');
    });
});

describe('ページ設定 CSS', () => {
    it('縦書きは vertical-rl を含み、横書きは含まない', () => {
        expect(html('文', vertical)).toContain('writing-mode: vertical-rl;');
        expect(html('文', horizontal)).not.toContain('writing-mode: vertical-rl;');
    });

    it('用紙サイズが @page size に反映される（a6 = 105mm 148mm）', () => {
        expect(html('文', horizontal)).toContain('size: 105mm 148mm;');
    });

    it('綴じ代マージンは縦横とも綴じ側=20mm・小口側=10mm', () => {
        // 横書き(左綴じ) recto(:right) は綴じが左 → margin-left:20mm / 小口右:10mm
        expect(html('文', horizontal)).toContain('margin-left: 20mm;');
        expect(html('文', horizontal)).toContain('margin-right: 10mm;');
        // 縦書き(右綴じ) recto(:left) は綴じが右 → margin-right:20mm / 小口左:10mm
        expect(html('文', vertical)).toContain('margin-right: 20mm;');
        expect(html('文', vertical)).toContain('margin-left: 10mm;');
    });

    it('最終ページ用コロフォンが末尾に置かれる', () => {
        const out = html('文', horizontal);
        expect(out).toContain('class="atb-colophon"');
        expect(out).toContain('Created with at-book.');
    });
});
