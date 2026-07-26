import { parseInline } from "../parser";
import type { InlineNode, ParsedNode } from "../parser";
import type { PaperConfig, EpubSection } from "../../domain";
import { PAPER_DIMENSIONS_MM } from "../../domain";

// ---- インライン要素 ----------------------------------------------------------

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderInlineNode(node: InlineNode, isVertical: boolean): string {
    switch (node.kind) {
        case 'text':
            return escapeHtml(node.text);
        case 'ruby':
            return `<ruby>${escapeHtml(node.text)}<rt>${escapeHtml(node.ruby)}</rt></ruby>`;
        case 'kenten':
            // 圏点（ゴマ点）。text-emphasis はマークが 0.5em 固定で小さくできず、
            // ShipporiMincho の ﹅ グリフが太いと大きすぎる。ルビと同じ <ruby> 機構で
            // 1 文字ずつ ﹅ を振り、rt の font-size でサイズを絞る（.atb-kenten の CSS 参照）。
            return [...node.text]
                .map(ch => `<ruby class="atb-kenten">${escapeHtml(ch)}<rt><span>${escapeHtml(node.ruby)}</span></rt></ruby>`)
                .join('');
        case 'dash':
            // ＠ー → 1レベルにつき「――」（全角ダッシュ／ダーシ U+2015 の2連）。
            // 日本語組版の慣例に合わせ、欧文 em dash(U+2014) ではなく U+2015 を使う。
            return escapeHtml('――'.repeat(node.level));
        case 'ellipsis':
            // ・・ → 三点リーダー。level は元の中黒の数。
            return escapeHtml('…'.repeat(node.level));
        case 'tatechuyoko':
            // 横書きは素通し。縦書きは縦中横にする。
            if (!isVertical) return escapeHtml(node.text);
            // 半角化して text-combine-upright の span で横並び正立させる（.atb-tcy の CSS 参照）。
            // かつて ！？→⁉ 等の合成済み文字（Vertical_Orientation=U）に置換していたが、Kindle の
            // 変換器（Send to Kindle の KFX 化）は vo=U を無視して単独グリフを回してしまい倒れる。
            // Amazon が縦中横として解釈するのは半角＋text-combine の系統だけなので、そちらに一本化。
            // これは OPF の primary-writing-mode: vertical-rl（縦組み判定）と噛み合って初めて効く。
            return `<span class="atb-tcy">${escapeHtml(node.text.replace(/！/g, '!').replace(/？/g, '?'))}</span>`;
    }
}

function renderInline(text: string, isVertical: boolean): string {
    return parseInline(text).map(node => renderInlineNode(node, isVertical)).join('');
}

// ---- 見出し番号（縦書きは漢数字） -------------------------------------------

const KANJI_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function toKanjiNumber(n: number): string {
    if (n <= 0) return '〇';
    if (n < 10) return KANJI_DIGITS[n]!;
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    const tensStr = tens === 1 ? '十' : KANJI_DIGITS[tens] + '十';
    const onesStr = ones === 0 ? '' : KANJI_DIGITS[ones];
    return tensStr + onesStr;
}

// ---- CSS -------------------------------------------------------------------

// ノンブル（ページ番号）を配置する余白ボックス。
// 物理的な下端・小口側の *隅ボックス*（corner）に置く。隅ボックスの横幅は小口側マージン
// （outer=10mm）ぶんなので、ノンブルは版面（本文）の外側・小口余白に収まり、本文には
// 食い込まない。縦書きでもアラビア数字を横組み（縦中横相当）で出す。
function nombreBox(corner: '@bottom-left-corner' | '@bottom-right-corner'): string {
    return `${corner} {
    content: counter(page);
    writing-mode: horizontal-tb;
    text-align: center;
    font-size: 8pt;
  }`;
}

// コロフォンの font-size(pt) を版面幅に合わせて決める。
// 欧文プロポーショナル書体の平均字幅を約 0.6em と見積もり、版面幅（本文が入る
// 横幅）に COLOPHON の全文字が収まる font-size を逆算する。安全側に 0.9 を掛け、
// 設計値 6pt を上限とする（大きい紙では 6pt のまま、小さい紙でのみ縮む）。
//
// 字幅係数を 0.55→0.6・安全率を 0.95→0.9 に引き上げているのは、実際に使う明朝系
// 書体の欧文グリフが 0.55em より横に広く、A6 では旧値の見積もりだと右端が見切れて
// いたため。見積もりを保守側に振り、小さい紙で確実に収まる余裕を確保する。
function fitColophonFontPt(contentWidthMm: number): number {
    const AVG_GLYPH_EM = 0.6;
    const SAFETY = 0.9;
    const MAX_PT = 6;
    const contentWidthPt = (contentWidthMm / 25.4) * 72;
    const fitPt = (contentWidthPt * SAFETY) / (COLOPHON.length * AVG_GLYPH_EM);
    // 小数第2位までに丸める（CSS 出力を安定させ、スナップショットを扱いやすくする）。
    return Math.round(Math.min(MAX_PT, fitPt) * 100) / 100;
}

function buildCss(config: PaperConfig, format: 'pdf' | 'epub'): string {
    const isVertical = config.writingMode === 'vertical';
    const { widthMm, heightMm } = PAPER_DIMENSIONS_MM[config.paperSize];

    // 綴じ代（inner=綴じ側 / outer=小口側）。綴じ側を広く取るのは縦横で共通
    // （綴じは物理的な製本側の余白なので、向きに依存させない）。左右への割り当ては
    // 下の recto/verso ロジックが担当する。
    const inner = 20;
    const outer = 10;

    // 見開きの表裏（recto=表/奇数, verso=裏/偶数）と CSS の :left/:right の対応。
    // 横書き(LTR)は先頭ページが :right、縦書き(vertical-rl)は先頭ページが :left。
    const rectoSel = isVertical ? ':left' : ':right';
    const versoSel = isVertical ? ':right' : ':left';

    // recto の物理配置。横書きは小口=右、縦書きは小口=左（LaTeX の RO/LE・LO/RE と一致）。
    // ノンブルは小口側の下端「隅」に置く（本文の外側・小口余白）。verso はその左右反転。
    const recto = isVertical
        ? { left: outer, right: inner, nombre: '@bottom-left-corner'  as const }
        : { left: inner, right: outer, nombre: '@bottom-right-corner' as const };
    const verso = isVertical
        ? { left: inner, right: outer, nombre: '@bottom-right-corner' as const }
        : { left: outer, right: inner, nombre: '@bottom-left-corner'  as const };

    // コロフォン（MIT 表記など）は横組み 1 行の欧文。@bottom-center は版面幅（＝紙幅
    // −左右マージン）ぶんの横箱で、その中央にコロフォンを流す。紙が小さいと設計値 6pt
    // では版面幅を超えて左右が切れるため、版面幅に収まる font-size を概算して縮める。
    // ※ font-size は実行要素側（.atb-colophon）に指定する。余白ボックス（@bottom-center）
    //   の font-size は content:element() で流し込む実行要素には効かず、要素は定義元の
    //   本文サイズ（9pt）を引き継いでしまうため。ここを取り違えると縮小が無視される。
    const colophonFontPt = fitColophonFontPt(widthMm - inner - outer);

    // 縦中横の宣言群。認識する構文がリーダーごとに違うため、EPUB では標準・WebKit(新)・
    // EPUB3・レガシー(旧 WebKit / EPUB3 プロファイル) の全構文を併記して広く網を張る。
    // Kindle など旧エンジンは標準の text-combine-upright を無視し、レガシーの
    // -webkit-text-combine: horizontal だけを解釈することがあり、これが無いと ！？ が
    // 縦中横にならず倒れる。無接頭辞の text-combine はどのリーダーも実装していない
    // 草案時代のプロパティなので出さない（EPUBCheck の CSS 警告になるだけ）。
    // PDF(Vivliostyle) は標準構文で足りるので併記しない。
    const tcyDecls = format === 'epub'
        ? [
            'text-combine-upright: all;',
            '-webkit-text-combine-upright: all;',
            '-epub-text-combine-upright: all;',
            '-webkit-text-combine: horizontal;',
            '-epub-text-combine: horizontal;',
          ].join('\n  ')
        : [
            'text-combine-upright: all;',
            '-webkit-text-combine-upright: all;',
          ].join('\n  ');

    // 本文フォント。PDF は紙面を固定する成果物なので、環境によって書体が変わらないよう
    // 同梱の Shippori Mincho を @font-face で埋め込む（実体は組版時にビルドディレクトリへ
    // コピーされ、PDF にはサブセットだけが残る）。
    // EPUB は埋め込まず、読者の端末のフォントに委ねる。リフロー型の一般的な作法であり、
    // かつ EPUB はビルドディレクトリの中身がそのまま同梱されるため、埋め込むと本文数十KB
    // に対して 17MB の TTF が入って配信サイズが跳ね上がる。
    const fontFaceCss = format === 'epub' ? '' : `@font-face {
  font-family: "Shippori Mincho";
  font-weight: normal;
  src: url("fonts/ShipporiMincho-Regular.ttf") format("truetype");
}
@font-face {
  font-family: "Shippori Mincho";
  font-weight: bold;
  src: url("fonts/ShipporiMincho-Bold.ttf") format("truetype");
}
`;
    const bodyFontFamily = format === 'epub' ? 'serif' : '"Shippori Mincho", serif';

    // 紙面固定（ページメディア）の CSS 一式。@page とノンブルはページメディア専用の
    // 機構で、リフロー型 EPUB リーダーは解釈しないため EPUB には出さない。
    // コロフォンもここでは position:running（＝最終ページのフッターへ流す）を使うので
    // PDF 専用。EPUB では最後の spine を丸ごと奥付にして出す（colophonCss を参照）。
    const pageCss = format === 'epub' ? '' : `@page {
  size: ${widthMm}mm ${heightMm}mm;
  margin-top: 10mm;
  margin-bottom: 10mm;
  /* 最終ページのみに出るコロフォン（実行組版で最後に流れてくる要素を参照） */
  @bottom-center {
    content: element(atb-colophon);
    text-align: center;
  }
}
@page ${rectoSel} {
  margin-left: ${recto.left}mm;
  margin-right: ${recto.right}mm;
  ${nombreBox(recto.nombre)}
}
@page ${versoSel} {
  margin-left: ${verso.left}mm;
  margin-right: ${verso.right}mm;
  ${nombreBox(verso.nombre)}
}

/* コロフォン: 流れからは外し、最終ページのフッター中央にのみ出す。
   縦書きでも横組みで出すため writing-mode を明示する（element() で引くと元の縦組みを保持するため）。
   font-size は版面幅に収める縮小値をここ（実行要素側）に指定する（@bottom-center 側は効かない）。
   white-space:nowrap で 1 行に保ち、版面幅に収まる font-size なので左右が切れない。 */
.atb-colophon {
  position: running(atb-colophon);
  writing-mode: horizontal-tb;
  white-space: nowrap;
  font-size: ${colophonFontPt}pt;
}
`;

    // EPUB のコロフォン。リフロー型リーダーは position:running を解釈しないため、
    // 最後の spine 文書を丸ごと奥付にして、その中に通常のブロックとして置く
    // （本文の末尾に地の文として続くと読み物の途中に混ざってしまう）。
    // 縦組みの本でもクレジットは欧文 1 行なので、この要素だけ横組みへ戻す
    // （横組みの本では文書がもともと横組みなので、上書きは要らない）。
    const colophonCss = format === 'epub' ? `
/* 奥付（最後の spine 文書に単独で入る） */
.atb-colophon {
  ${isVertical ? '-epub-writing-mode: horizontal-tb;\n  writing-mode: horizontal-tb;\n  ' : ''}text-align: center;
  font-size: 0.75em;
}
` : '';

    return `
${pageCss}${fontFaceCss}
html {
  font-family: ${bodyFontFamily};
  font-size: 9pt;
  line-height: 1.75;
  ${isVertical ? (format === 'epub' ? '-epub-writing-mode: vertical-rl;\n  writing-mode: vertical-rl;' : 'writing-mode: vertical-rl;') : ''}
  text-align: justify;
  text-justify: inter-character;
  line-break: strict;
  word-break: normal;
}

body {
  margin: 0;
  padding: 0;
}

/* 段落: 一字下げ・段落間アキなし */
p.atb-p {
  margin: 0;
  text-indent: 1em;
}

/* 行頭が始め括弧（「『）の段落は字下げしない（天付き） */
p.atb-p-noindent {
  text-indent: 0;
}

/* 空行: 1行分のアキ (本文の line-height 1.75 に合わせる)。
   中身は &#160;（不可視スペース）を入れて実体のある行ボックスを持たせる。
   リフロー型 EPUB リーダーは中身の無い空ブロックを潰して block-size を無視する
   ことが多く、空行が消えてしまうため。PDF は 1 行の内容が block-size に収まり見た目不変。 */
.atb-blank {
  block-size: 1.75em;
}

/* 改ページ */
.atb-pagebreak {
  break-before: page;
}

/* 大見出し: 改ページして18pt太字 */
h1.atb-h1 {
  break-before: page;
  font-size: 18pt;
  line-height: 20pt;
  font-weight: bold;
  margin: 0.2em 0 0.1em 0;
}

/* 小見出し: 本文サイズの太字 */
h2.atb-h2 {
  font-size: 1em;
  font-weight: bold;
  margin: 0.1em 0;
}

/* 目次 */
nav.atb-toc {
  break-before: page;
  break-after: page;
}
.atb-toc-title {
  font-size: 18pt;
  line-height: 20pt;
  font-weight: bold;
  margin: 0.2em 0 0.1em 0;
}
nav.atb-toc a {
  display: block;
  text-decoration: none;
  color: inherit;
}
nav.atb-toc a.atb-toc-h2 {
  margin-inline-start: 1em;
}
/* 目次の行末: リーダー線＋ページ番号。leader() と target-counter は同じ生成
   ボックスに入れないと番号がリーダー末尾にアンカーされず別行へ回り込む。
   text-combine-upright はリーダー（グルー）には効かず、数字だけを縦中横で正立
   させる（横書きでは無効果）。 */
nav.atb-toc a::after {
  content: leader('—') target-counter(attr(href url), page);
  ${tcyDecls}
}

/* 箇条書き */
ul.atb-list {
  list-style-type: '・';
  margin: 0;
  padding-inline-start: 1em;
}
ul.atb-list li {
  padding-inline-start: 0;
}

/* ルビ */
ruby > rt {
  font-size: 0.5em;
}

/* 圏点。ルビと同じ <ruby> 機構で 1 文字ずつ ﹅ を振る。ゴマ点グリフ(U+FE45)は
   ShipporiMincho では em の約 58% と太いため、通常ルビ(0.5em)より小さい 0.22em に
   絞って控えめな圏点にする。← 大きさはこの値で調整する。 */
ruby.atb-kenten > rt {
  font-size: 0.22em;
}
/* PDF は span を拡大変換(scale)する。レイアウト寸法(0.22em)は据え置きのまま＝縦書きでも
   字送り・行間を変えずに見た目だけ大きくできる。EPUB リーダーの多くは拡大変換に非対応で
   （未対応スタイル警告になり拡大も効かず圏点が小さいまま）なので、代わりに font-size で
   拡大する。リフロー表示では rt が少し大きくなるだけで問題なく、0.22em×2.3≒0.5em で
   PDF と同等の見た目になる。← 大きさはこの倍率で調整する。 */
ruby.atb-kenten > rt > span {
  display: inline-block;
  ${format === 'epub' ? 'font-size: 2.3em;' : 'transform: scale(2.3);'}
}

/* 縦中横。認識する構文がリーダーごとに違うため、EPUB では全構文を併記する（tcyDecls）。
   これが無い／標準構文しか無いと、Kindle 等では ！？ が縦中横にならず倒れてしまう。 */
.atb-tcy {
  ${tcyDecls}
}
${colophonCss}`.trim();
}

// ---- 本体 ------------------------------------------------------------------

interface HeadingMeta {
    id: string;
    level: 1 | 2;
    titleHtml: string;
}

const COLOPHON = 'Created with at-book. Copyright © 2026 tsuyukusado. MIT License.';

// 本文を組み立てる最小単位。EPUB では改ページ境界で spine（XHTML）を分割するため、
// 各ブロックが「直前で改ページするか（breakBefore）」「直後で改ページするか（breakAfter）」
// を持つ。pageBreakOnly は ＠＠＠（中身の無い純粋な改ページ）で、EPUB では HTML を捨てて
// 分割の合図だけに使う（PDF では atb-pagebreak の div をそのまま流し込む）。
// headingId は見出しブロックの id（EPUB でどの spine に入ったか記録し、目次リンクを張り直す）。
// isToc は目次ブロックの目印（EPUB でリンクをクロスファイル参照へ書き換える対象）。
interface Block {
    html: string;
    breakBefore?: boolean;
    breakAfter?: boolean;
    pageBreakOnly?: boolean;
    headingId?: string;
    isToc?: boolean;
}

// 見出しの番号付けと目次項目の収集（PDF・EPUB 共通の事前パス）。
function computeHeadingMeta(
    nodes: ParsedNode[],
    isVertical: boolean,
): { headingMeta: Map<number, HeadingMeta>; tocEntries: HeadingMeta[] } {
    // 事前スキャン: 番号の要否を決めるために、大見出しの総数と、各小見出しが
    // 属する兄弟グループ（直前の大見出し配下）のサイズを求める。
    //   - 大見出しが唯一 → 大見出しは番号なし。小見出しは同じ親配下に複数あるときだけ
    //     単純連番（親番号を持たないので「1」「2」…）、唯一なら番号なし。
    //   - 大見出しが複数 → 大見出しは連番。小見出しは数に関係なく「親-子」の階層番号。
    let h1Total = 0;
    const h2GroupSize = new Map<number, number>();
    let group: number[] = [];
    const flushGroup = () => {
        for (const idx of group) h2GroupSize.set(idx, group.length);
        group = [];
    };
    nodes.forEach((node, i) => {
        if (node.kind !== 'heading') return;
        if (node.level === 1) {
            flushGroup();
            h1Total++;
        } else {
            group.push(i);
        }
    });
    flushGroup();
    const multipleH1 = h1Total >= 2;

    // 第1パス: 見出しに id と番号付きタイトルを割り当て、目次項目を収集する。
    const headingMeta = new Map<number, HeadingMeta>();
    const tocEntries: HeadingMeta[] = [];
    let h1 = 0;
    let h2 = 0;
    let hid = 0;
    nodes.forEach((node, i) => {
        if (node.kind !== 'heading') return;
        hid++;
        const id = `atb-h${hid}`;
        if (node.level === 1) {
            h1++;
            h2 = 0;
            const inline = renderInline(node.text, isVertical);
            // 大見出しが唯一のときは番号を振らない。
            let titleHtml = inline;
            if (multipleH1) {
                const num = isVertical ? toKanjiNumber(h1) : `${h1}`;
                const sep = isVertical ? '　' : ' ';
                titleHtml = `${escapeHtml(num)}${escapeHtml(sep)}${inline}`;
            }
            const meta: HeadingMeta = { id, level: 1, titleHtml };
            headingMeta.set(i, meta);
            tocEntries.push(meta);
        } else {
            h2++;
            const inline = renderInline(node.text, isVertical);
            const tsep = isVertical ? '　' : ' ';
            let titleHtml = inline;
            if (multipleH1) {
                // 親-子 の階層番号（子が唯一でも問答無用で振る）。
                const n1 = isVertical ? toKanjiNumber(h1) : `${h1}`;
                const n2 = isVertical ? toKanjiNumber(h2) : `${h2}`;
                const sep = isVertical ? '・' : '-';
                titleHtml = `${escapeHtml(n1)}${escapeHtml(sep)}${escapeHtml(n2)}${escapeHtml(tsep)}${inline}`;
            } else if ((h2GroupSize.get(i) ?? 0) >= 2) {
                // 親が唯一で子が複数 → 親番号を持てないので単純連番。
                const n2 = isVertical ? toKanjiNumber(h2) : `${h2}`;
                titleHtml = `${escapeHtml(n2)}${escapeHtml(tsep)}${inline}`;
            }
            const meta: HeadingMeta = { id, level: 2, titleHtml };
            headingMeta.set(i, meta);
            tocEntries.push(meta);
        }
    });

    return { headingMeta, tocEntries };
}

// 本文をブロック列に組み立てる（PDF・EPUB 共通）。改ページ属性を各ブロックに持たせ、
// PDF は html を素直に連結、EPUB は breakBefore/breakAfter で spine を分割する。
function buildBlocks(
    nodes: ParsedNode[],
    isVertical: boolean,
    headingMeta: Map<number, HeadingMeta>,
    tocEntries: HeadingMeta[],
): Block[] {
    const blocks: Block[] = [];
    let listDepth = 0;

    const closeLists = () => {
        while (listDepth > 0) {
            listDepth--;
            blocks.push({ html: '</ul>' });
        }
    };

    nodes.forEach((node, i) => {
        if (node.kind === 'listItem') {
            while (listDepth < node.level) {
                blocks.push({ html: '<ul class="atb-list">' });
                listDepth++;
            }
            while (listDepth > node.level) {
                listDepth--;
                blocks.push({ html: '</ul>' });
            }
            blocks.push({ html: `<li>${renderInline(node.text, isVertical)}</li>` });
            return;
        }

        closeLists();

        switch (node.kind) {
            case 'heading': {
                const meta = headingMeta.get(i)!;
                if (meta.level === 1) {
                    // 大見出しは改ページして始まる（EPUB では章ごとに spine 分割）。
                    blocks.push({ html: `<h1 class="atb-h1" id="${meta.id}">${meta.titleHtml}</h1>`, breakBefore: true, headingId: meta.id });
                } else {
                    blocks.push({ html: `<h2 class="atb-h2" id="${meta.id}">${meta.titleHtml}</h2>`, headingId: meta.id });
                }
                break;
            }
            case 'toc': {
                // ページ番号はリーダー線とともに a::after で出す（target-counter は
                // 自要素 a の href を読む）。縦書きでは text-combine-upright で数字だけ
                // 正立させる。leader と番号を同じ生成内容に入れないと番号が別行へ回り込む。
                const entries = tocEntries
                    .map(e => `<a class="atb-toc-${e.level === 1 ? 'h1' : 'h2'}" href="#${e.id}">${e.titleHtml}</a>`)
                    .join('\n');
                // 目次は前後で改ページ（EPUB では単独の spine 文書になる）。リンクは
                // #id の同一文書内アンカーで組み、EPUB ではあとで実ファイル参照へ書き換える。
                blocks.push({ html: `<nav class="atb-toc"><div class="atb-toc-title">目次</div>\n${entries}\n</nav>`, breakBefore: true, breakAfter: true, isToc: true });
                break;
            }
            case 'paragraph': {
                // 行頭が始め括弧（「『）の段落は字下げ（天付き）にしない。
                const noIndent = /^[「『]/.test(node.text);
                const cls = noIndent ? 'atb-p atb-p-noindent' : 'atb-p';
                blocks.push({ html: `<p class="${cls}">${renderInline(node.text, isVertical)}</p>` });
                break;
            }
            case 'blank':
                // 中身の &#160; は必須。空の <div> だとリフロー型 EPUB リーダーが
                // 潰して空行が消えるため、実体のある行ボックスを持たせる。
                blocks.push({ html: '<div class="atb-blank">&#160;</div>' });
                break;
            case 'pageBreak':
                // ＠＠＠。PDF は break-before:page の div、EPUB は spine 分割の合図。
                blocks.push({ html: '<div class="atb-pagebreak"></div>', breakBefore: true, pageBreakOnly: true });
                break;
        }
    });

    closeLists();

    return blocks;
}

const COLOPHON_HTML = `<div class="atb-colophon">${escapeHtml(COLOPHON)}</div>`;

// 完全な HTML 文書の外枠。PDF は 1 文書、EPUB は spine ごとに同じ外枠で包む。
function wrapDocument(bodyHtml: string, css: string): string {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>at-book</title>
<style>
${css}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

// PDF 用（紙面固定）。全ブロックを 1 文書に連結する。改ページは CSS（break-before:page）が担う。
export function render(nodes: ParsedNode[], config: PaperConfig, format: 'pdf' | 'epub' = 'pdf'): string {
    const isVertical = config.writingMode === 'vertical';
    const { headingMeta, tocEntries } = computeHeadingMeta(nodes, isVertical);
    const blocks = buildBlocks(nodes, isVertical, headingMeta, tocEntries);

    const body = blocks.map(b => b.html);
    // コロフォンは流れの最後に置く（最終ページのフッターに実行組版される）。
    // ページメディア専用の機構なので PDF のときだけ入れる。
    if (format !== 'epub') body.push(COLOPHON_HTML);

    return wrapDocument(body.join('\n'), buildCss(config, format));
}

// EPUB の各 spine のファイル名（Vivliostyle への入力名）。ビルド後は同名の .xhtml になる。
// 隔離ディレクトリで単独ビルドするため、連番だけで衝突しない。
function sectionFileName(index: number): string {
    return `part-${String(index + 1).padStart(3, '0')}.html`;
}
// 目次リンクが指す先。入力 .html はビルド後 .xhtml になるので参照も .xhtml で張る。
function sectionHref(index: number): string {
    return sectionFileName(index).replace(/\.html$/, '.xhtml');
}

// EPUB 用（リフロー）。改ページ境界で spine（XHTML 文書）に分割して返す。
// リフロー型 EPUB リーダーは CSS の break-before:page を尊重しないため、改ページは
// 「新しい spine 文書は必ず新しいページから始まる」という EPUB の性質で実現する。
// 分割で見出しが別ファイルへ移るため、目次リンクは #id の同一文書内参照から
// 「見出しが実在する spine ファイル名 + #id」のクロスファイル参照へ書き換える。
export function renderSections(nodes: ParsedNode[], config: PaperConfig): EpubSection[] {
    const isVertical = config.writingMode === 'vertical';
    const { headingMeta, tocEntries } = computeHeadingMeta(nodes, isVertical);
    const blocks = buildBlocks(nodes, isVertical, headingMeta, tocEntries);
    const css = buildCss(config, 'epub');

    // ブロック列を改ページ境界でセクション（＝spine 文書）に切り分けつつ、
    // 各見出し id がどの section に入ったかを記録する（目次リンクの張り直し用）。
    const sections: Block[][] = [];
    let current: Block[] = [];
    let pendingBreak = false;
    const idToSection = new Map<string, number>();
    const flush = () => {
        if (current.length > 0) {
            sections.push(current);
            current = [];
        }
    };
    for (const b of blocks) {
        // ＠＠＠ は中身を持たず、次の内容を新しい spine へ送るだけ。
        if (b.pageBreakOnly) {
            pendingBreak = true;
            continue;
        }
        if ((b.breakBefore || pendingBreak) && current.length > 0) flush();
        pendingBreak = false;
        // この current が最終的に入る section の添字は sections.length（flush で末尾に積むため）。
        if (b.headingId) idToSection.set(b.headingId, sections.length);
        current.push(b);
        if (b.breakAfter) flush();
    }
    flush();

    // コロフォンは最後の spine 文書に単独で入れて奥付にする。
    // 本文の流れの末尾に足すと（PDF と違って position:running が効かないぶん）読み物の
    // 途中に地の文として混ざるため、1 文書＝1 ページの独立した奥付にする。
    // これで spine が必ず 1 つ以上になるので、原稿が空でも EPUB として成立する。
    sections.push([{ html: COLOPHON_HTML }]);

    // 目次の #id を、その見出しが入った spine ファイルへのクロスファイル参照に置き換える。
    const rewriteTocLinks = (html: string): string =>
        html.replace(/href="#(atb-h\d+)"/g, (whole, id: string) => {
            const sec = idToSection.get(id);
            return sec === undefined ? whole : `href="${sectionHref(sec)}#${id}"`;
        });

    return sections.map((blks, i) => {
        const body = blks.map(b => (b.isToc ? rewriteTocLinks(b.html) : b.html)).join('\n');
        return { fileName: sectionFileName(i), html: wrapDocument(body, css) };
    });
}
