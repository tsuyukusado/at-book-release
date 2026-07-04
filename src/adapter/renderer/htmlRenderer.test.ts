import { describe, it, expect } from 'vitest';
import { render, renderSections } from './htmlRenderer';
import { parse } from '../parser';
import type { PaperConfig } from '../../domain';

const horizontal: PaperConfig = { paperSize: 'a6', writingMode: 'horizontal' };
const vertical:   PaperConfig = { paperSize: 'a6', writingMode: 'vertical' };

function html(src: string, config: PaperConfig): string {
    return render(parse(src), config);
}

// renderSections はファイル名付きの spine 群を返す。既存テストは本文 HTML だけ見るので
// html を取り出す。ファイル名やリンクを見るテストは renderSections を直接使う。
function sections(src: string, config: PaperConfig = horizontal): string[] {
    return renderSections(parse(src), config).map(s => s.html);
}

// <body> の中身だけ取り出す。CSS のコメントやセレクタ名（例: 「最後」の「後」や
// .atb-pagebreak）に本文判定が引っかからないようにするため。
function bodyOf(doc: string): string {
    return doc.split('<body>')[1]!.split('</body>')[0]!;
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
            '<ruby class="atb-kenten">強<rt><span>﹅</span></rt></ruby><ruby class="atb-kenten">調<rt><span>﹅</span></rt></ruby>',
        );
    });

    it('圏点の拡大は PDF では transform:scale を使う', () => {
        const out = render(parse('＠強調（・）'), horizontal, 'pdf');
        expect(out).toContain('transform: scale(2.3);');
        expect(out).not.toContain('font-size: 2.3em;');
    });

    it('圏点の拡大は EPUB では transform を使わず font-size で拡大する（リーダー非対応警告の回避）', () => {
        const out = render(parse('＠強調（・）'), horizontal, 'epub');
        expect(out).toContain('font-size: 2.3em;');
        expect(out).not.toContain('transform: scale');
    });

    it('format 省略時は PDF 相当（transform:scale）になる', () => {
        expect(render(parse('＠強調（・）'), horizontal)).toContain('transform: scale(2.3);');
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

    it('！のあとに文章が続く段落は全角スペースが入り、行末の！には入らない', () => {
        expect(html('本当！そうだ', horizontal)).toContain('<p class="atb-p">本当！　そうだ</p>');
        expect(html('やった！', horizontal)).toContain('<p class="atb-p">やった！</p>');
    });
});

describe('見出しと番号', () => {
    it('大見出しが複数あるとき、横書きはアラビア数字＋半角スペースで番号を振る', () => {
        const out = html('＠序章\n＠第二章', horizontal);
        expect(out).toContain('<h1 class="atb-h1" id="atb-h1">1 序章</h1>');
        expect(out).toContain('>2 第二章</h1>');
    });

    it('大見出しが複数あるとき、縦書きは漢数字＋全角スペースで番号を振る', () => {
        const out = html('＠序章\n＠第二章', vertical);
        expect(out).toContain('一　序章');
        expect(out).toContain('二　第二章');
    });

    it('大見出しが複数あるとき、横書きの小見出しは「大-小」番号', () => {
        const out = html('＠序章\n＠＠導入\n＠第二章', horizontal);
        expect(out).toContain('<h2 class="atb-h2" id="atb-h2">1-1 導入</h2>');
    });

    it('大見出しが複数あるとき、縦書きの小見出しは「大・小」漢数字番号', () => {
        const out = html('＠序章\n＠＠導入\n＠第二章', vertical);
        expect(out).toContain('一・一　導入');
    });

    it('大見出しが複数あれば、小見出しが親配下に1つだけでも「大-小」番号を振る', () => {
        const out = html('＠一章\n＠＠節A\n＠二章\n＠＠節B', horizontal);
        expect(out).toContain('>1 一章</h1>');
        expect(out).toContain('>1-1 節A</h2>');
        expect(out).toContain('>2 二章</h1>');
        expect(out).toContain('>2-1 節B</h2>');
    });

    it('大見出しが1つだけなら番号を振らない（横書き）', () => {
        const out = html('＠序章', horizontal);
        expect(out).toContain('<h1 class="atb-h1" id="atb-h1">序章</h1>');
    });

    it('大見出しが1つだけなら番号を振らない（縦書き）', () => {
        const out = html('＠序章', vertical);
        expect(out).toContain('id="atb-h1">序章</h1>');
    });

    it('大見出しが1つ・小見出しも1つなら、どちらも番号を振らない', () => {
        const out = html('＠序章\n＠＠導入', horizontal);
        expect(out).toContain('<h1 class="atb-h1" id="atb-h1">序章</h1>');
        expect(out).toContain('<h2 class="atb-h2" id="atb-h2">導入</h2>');
    });

    it('大見出しが1つ・小見出しが複数なら、小見出しだけ単純連番を振る（横書き）', () => {
        const out = html('＠序章\n＠＠導入\n＠＠展開', horizontal);
        expect(out).toContain('<h1 class="atb-h1" id="atb-h1">序章</h1>');
        expect(out).toContain('<h2 class="atb-h2" id="atb-h2">1 導入</h2>');
        expect(out).toContain('<h2 class="atb-h2" id="atb-h3">2 展開</h2>');
    });

    it('大見出しが1つ・小見出しが複数なら、小見出しだけ単純連番を振る（縦書き）', () => {
        const out = html('＠序章\n＠＠導入\n＠＠展開', vertical);
        expect(out).toContain('id="atb-h2">一　導入</h2>');
        expect(out).toContain('id="atb-h3">二　展開</h2>');
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

    it('各エントリはリンクのみで余計な span を持たない（番号は a::after で出す）', () => {
        const out = html('＠目次\n＠第一章', horizontal);
        expect(out).toContain('<a class="atb-toc-h1" href="#atb-h1">');
        expect(out).not.toContain('atb-toc-page');
    });

    it('ページ番号は a::after でリーダー線と target-counter を同じ生成内容に入れ、縦中横で正立させる', () => {
        // leader() と target-counter を同じ生成ボックスに入れないと番号がリーダー末尾に
        // アンカーされず別行へ回り込む。text-combine-upright はリーダーには効かず数字だけ正立。
        const out = html('＠目次\n＠第一章', vertical);
        expect(out).toContain('nav.atb-toc a::after');
        expect(out).toContain("content: leader('—') target-counter(attr(href url), page)");
        expect(out).toContain('text-combine-upright: all');
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

    // font-size は実行要素側（.atb-colophon）に指定する。@bottom-center の font-size は
    // content:element() で流し込む実行要素には効かないため。
    it('コロフォンの font-size は版面幅に合わせて 6pt 以下に収まる', () => {
        // 小さい紙（A6）では 6pt では横にはみ出すため縮む。
        const a6 = html('文', { paperSize: 'a6', writingMode: 'vertical' });
        const m6 = a6.match(/\.atb-colophon\s*\{[^}]*font-size:\s*([\d.]+)pt/);
        expect(m6).not.toBeNull();
        const a6pt = parseFloat(m6![1]);
        expect(a6pt).toBeLessThan(6);
        expect(a6pt).toBeGreaterThan(0);
    });

    it('大きい紙（A4）ではコロフォンは設計値 6pt のまま', () => {
        const a4 = html('文', { paperSize: 'a4', writingMode: 'horizontal' });
        const m4 = a4.match(/\.atb-colophon\s*\{[^}]*font-size:\s*([\d.]+)pt/);
        expect(m4).not.toBeNull();
        expect(parseFloat(m4![1])).toBe(6);
    });

    it('コロフォンは 1 行に保たれる（white-space:nowrap で左右が切れない）', () => {
        const a6 = html('文', { paperSize: 'a6', writingMode: 'vertical' });
        expect(a6).toMatch(/\.atb-colophon\s*\{[^}]*white-space:\s*nowrap/);
    });

    it('ノンブルは小口側の隅ボックス（本文の外）に置かれる', () => {
        // 縦書き(右綴じ): recto(:left) は小口=左 → @bottom-left-corner
        const v = html('文', vertical);
        expect(v).toMatch(/@bottom-left-corner\s*\{[^}]*content:\s*counter\(page\)/);
        // 横書き(左綴じ): recto(:right) は小口=右 → @bottom-right-corner
        const h = html('文', horizontal);
        expect(h).toMatch(/@bottom-right-corner\s*\{[^}]*content:\s*counter\(page\)/);
    });
});

describe('EPUB の spine 分割（renderSections）', () => {
    it('改ページが無ければ 1 つの spine 文書になる', () => {
        const s = sections('ひとつめ\nふたつめ');
        expect(s).toHaveLength(1);
        expect(bodyOf(s[0]!)).toContain('ひとつめ');
        expect(bodyOf(s[0]!)).toContain('ふたつめ');
    });

    it('各セクションは完全な HTML 文書になる', () => {
        const s = sections('前\n＠＠＠\n後');
        for (const doc of s) {
            expect(doc.startsWith('<!DOCTYPE html>')).toBe(true);
            expect(doc).toContain('<title>at-book</title>');
            expect(doc.trimEnd().endsWith('</html>')).toBe(true);
        }
    });

    it('＠＠＠ で spine が分割され、改ページ用の div は残さない', () => {
        const s = sections('前\n＠＠＠\n後');
        expect(s).toHaveLength(2);
        expect(bodyOf(s[0]!)).toContain('前');
        expect(bodyOf(s[0]!)).not.toContain('後');
        expect(bodyOf(s[1]!)).toContain('後');
        // リフローでは効かない atb-pagebreak の空 div は EPUB では出さない（分割で表現）。
        expect(bodyOf(s[0]!)).not.toContain('atb-pagebreak');
        expect(bodyOf(s[1]!)).not.toContain('atb-pagebreak');
    });

    it('大見出し（＠）は新しい spine から始まる', () => {
        const s = sections('本文0\n＠あたらしい章\n本文2');
        expect(s).toHaveLength(2);
        expect(bodyOf(s[0]!)).toContain('本文0');
        expect(bodyOf(s[0]!)).not.toContain('あたらしい章');
        expect(bodyOf(s[1]!)).toContain('あたらしい章');
        expect(bodyOf(s[1]!)).toContain('本文2');
    });

    it('目次（＠目次）は前後で分割され、単独の spine 文書になる', () => {
        const s = sections('前文\n＠目次\n後文');
        expect(s).toHaveLength(3);
        expect(bodyOf(s[0]!)).toContain('前文');
        expect(bodyOf(s[1]!)).toContain('atb-toc-title');
        expect(bodyOf(s[1]!)).not.toContain('前文');
        expect(bodyOf(s[1]!)).not.toContain('後文');
        expect(bodyOf(s[2]!)).toContain('後文');
    });

    it('コロフォンは最後の spine 文書にだけ入る', () => {
        const s = sections('前\n＠＠＠\n後');
        expect(bodyOf(s[0]!)).not.toContain('atb-colophon');
        expect(bodyOf(s[s.length - 1]!)).toContain('atb-colophon');
    });

    it('各 spine に連番のファイル名が付く', () => {
        const s = renderSections(parse('＠一\n本文\n＠二\n本文'), horizontal);
        expect(s.map(x => x.fileName)).toEqual(['part-001.html', 'part-002.html']);
    });

    it('目次リンクは、見出しが実在する spine ファイルへのクロスファイル参照になる', () => {
        // 目次(part-001) / 第一章(part-002) / 第二章(part-003)。
        // 分割前の #atb-hN ではなく part-00X.xhtml#atb-hN を指すこと。
        const s = renderSections(parse('＠目次\n＠第一章\n本文\n＠第二章\n本文'), horizontal);
        const tocBody = bodyOf(s[0]!.html);
        // 目次自身の中に、生の #atb-h への同一文書内リンクは残っていない。
        expect(tocBody).not.toMatch(/href="#atb-h\d/);
        // 第一章は part-002、第二章は part-003 を指す。
        expect(tocBody).toContain('href="part-002.xhtml#atb-h1"');
        expect(tocBody).toContain('href="part-003.xhtml#atb-h2"');
        // 参照先ファイルに実際にその id の見出しがある。
        expect(s[1]!.fileName).toBe('part-002.html');
        expect(s[1]!.html).toContain('id="atb-h1"');
        expect(s[2]!.fileName).toBe('part-003.html');
        expect(s[2]!.html).toContain('id="atb-h2"');
    });

    it('PDF（単一文書）の目次リンクは従来どおり同一文書内アンカーのまま', () => {
        // 分割しない render() では #id で正しく飛べるので書き換えない。
        const pdf = render(parse('＠目次\n＠第一章\n本文'), horizontal, 'pdf');
        expect(pdf).toContain('href="#atb-h1"');
        expect(pdf).not.toContain('.xhtml#atb-h1');
    });
});
