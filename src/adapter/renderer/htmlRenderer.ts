import { parseInline } from "../parser";
import type { InlineNode, ParsedNode } from "../parser";
import type { PaperConfig } from "../../domain";
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
            // 圏点（ゴマ点）。text-emphasis で再現する。
            return `<span class="atb-kenten">${escapeHtml(node.text)}</span>`;
        case 'dash':
            // ＠ー → 1レベルにつき「――」（全角ダッシュ／ダーシ U+2015 の2連）。
            // 日本語組版の慣例に合わせ、欧文 em dash(U+2014) ではなく U+2015 を使う。
            return escapeHtml('――'.repeat(node.level));
        case 'ellipsis':
            // ・・ → 三点リーダー。level は元の中黒の数。
            return escapeHtml('…'.repeat(node.level));
        case 'tatechuyoko':
            // 縦書き時のみ縦中横。横書きは素通し。
            return isVertical
                ? `<span class="atb-tcy">${escapeHtml(node.text.replace(/！/g, '!').replace(/？/g, '?'))}</span>`
                : escapeHtml(node.text);
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
// 物理的な下端・小口側に置く。縦書きでもアラビア数字を横組み（縦中横相当）で出す。
function nombreBox(corner: '@bottom-left' | '@bottom-right'): string {
    const align = corner === '@bottom-right' ? 'right' : 'left';
    const pad = corner === '@bottom-right' ? 'padding-right: 3mm;' : 'padding-left: 3mm;';
    return `${corner} {
    content: counter(page);
    writing-mode: horizontal-tb;
    text-align: ${align};
    ${pad}
    font-size: 8pt;
  }`;
}

function buildCss(config: PaperConfig): string {
    const isVertical = config.writingMode === 'vertical';
    const { widthMm, heightMm } = PAPER_DIMENSIONS_MM[config.paperSize];

    // 綴じ代（inner=綴じ側 / outer=小口側）。LaTeX geometry と同値。
    const inner = isVertical ? 10 : 20;
    const outer = isVertical ? 20 : 10;

    // 見開きの表裏（recto=表/奇数, verso=裏/偶数）と CSS の :left/:right の対応。
    // 横書き(LTR)は先頭ページが :right、縦書き(vertical-rl)は先頭ページが :left。
    const rectoSel = isVertical ? ':left' : ':right';
    const versoSel = isVertical ? ':right' : ':left';

    // recto の物理配置。横書きは小口=右、縦書きは小口=左（LaTeX の RO/LE・LO/RE と一致）。
    // ノンブルは小口側の下端に置く。verso はその左右反転。
    const recto = isVertical
        ? { left: outer, right: inner, nombre: '@bottom-left'  as const }
        : { left: inner, right: outer, nombre: '@bottom-right' as const };
    const verso = isVertical
        ? { left: inner, right: outer, nombre: '@bottom-right' as const }
        : { left: outer, right: inner, nombre: '@bottom-left'  as const };

    return `
@page {
  size: ${widthMm}mm ${heightMm}mm;
  margin-top: 10mm;
  margin-bottom: 10mm;
  /* 最終ページのみに出るコロフォン（実行組版で最後に流れてくる要素を参照） */
  @bottom-center {
    content: element(atb-colophon);
    writing-mode: horizontal-tb;
    text-align: center;
    font-size: 6pt;
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

@font-face {
  font-family: "Shippori Mincho";
  font-weight: normal;
  src: url("fonts/ShipporiMincho-Regular.ttf") format("truetype");
}
@font-face {
  font-family: "Shippori Mincho";
  font-weight: bold;
  src: url("fonts/ShipporiMincho-Bold.ttf") format("truetype");
}

html {
  font-family: "Shippori Mincho", serif;
  font-size: 9pt;
  line-height: 1.75;
  ${isVertical ? 'writing-mode: vertical-rl;' : ''}
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

/* 空行: 1行分のアキ */
.atb-blank {
  block-size: 1em;
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
nav.atb-toc a::after {
  content: leader('—') target-counter(attr(href url), page);
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

/* 圏点（ゴマ点） */
.atb-kenten {
  text-emphasis-style: filled sesame;
  -webkit-text-emphasis-style: filled sesame;
}

/* 縦中横 */
.atb-tcy {
  text-combine-upright: all;
  -webkit-text-combine-upright: all;
}

/* コロフォン: 流れからは外し、最終ページのフッター中央にのみ出す。
   縦書きでも横組みで出すため writing-mode を明示する（element() で引くと元の縦組みを保持するため）。 */
.atb-colophon {
  position: running(atb-colophon);
  writing-mode: horizontal-tb;
}
`.trim();
}

// ---- 本体 ------------------------------------------------------------------

interface HeadingMeta {
    id: string;
    level: 1 | 2;
    titleHtml: string;
}

const COLOPHON = 'Created with at-book. Copyright © 2026 tsuyukusado. MIT License.';

export function render(nodes: ParsedNode[], config: PaperConfig): string {
    const isVertical = config.writingMode === 'vertical';

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
            const num = isVertical ? toKanjiNumber(h1) : `${h1}`;
            const sep = isVertical ? '　' : ' ';
            const titleHtml = `${escapeHtml(num)}${escapeHtml(sep)}${renderInline(node.text, isVertical)}`;
            const meta: HeadingMeta = { id, level: 1, titleHtml };
            headingMeta.set(i, meta);
            tocEntries.push(meta);
        } else {
            h2++;
            const n1 = isVertical ? toKanjiNumber(h1) : `${h1}`;
            const n2 = isVertical ? toKanjiNumber(h2) : `${h2}`;
            const sep = isVertical ? '・' : '-';
            const tsep = isVertical ? '　' : ' ';
            const titleHtml = `${escapeHtml(n1)}${escapeHtml(sep)}${escapeHtml(n2)}${escapeHtml(tsep)}${renderInline(node.text, isVertical)}`;
            const meta: HeadingMeta = { id, level: 2, titleHtml };
            headingMeta.set(i, meta);
            tocEntries.push(meta);
        }
    });

    // 第2パス: 本文 HTML を組み立てる。
    const body: string[] = [];
    let listDepth = 0;

    const closeLists = () => {
        while (listDepth > 0) {
            listDepth--;
            body.push('</ul>');
        }
    };

    nodes.forEach((node, i) => {
        if (node.kind === 'listItem') {
            while (listDepth < node.level) {
                body.push('<ul class="atb-list">');
                listDepth++;
            }
            while (listDepth > node.level) {
                listDepth--;
                body.push('</ul>');
            }
            body.push(`<li>${renderInline(node.text, isVertical)}</li>`);
            return;
        }

        closeLists();

        switch (node.kind) {
            case 'heading': {
                const meta = headingMeta.get(i)!;
                if (meta.level === 1) {
                    body.push(`<h1 class="atb-h1" id="${meta.id}">${meta.titleHtml}</h1>`);
                } else {
                    body.push(`<h2 class="atb-h2" id="${meta.id}">${meta.titleHtml}</h2>`);
                }
                break;
            }
            case 'toc': {
                const entries = tocEntries
                    .map(e => `<a class="atb-toc-${e.level === 1 ? 'h1' : 'h2'}" href="#${e.id}">${e.titleHtml}</a>`)
                    .join('\n');
                body.push(`<nav class="atb-toc"><div class="atb-toc-title">目次</div>\n${entries}\n</nav>`);
                break;
            }
            case 'paragraph':
                body.push(`<p class="atb-p">${renderInline(node.text, isVertical)}</p>`);
                break;
            case 'blank':
                body.push('<div class="atb-blank"></div>');
                break;
            case 'pageBreak':
                body.push('<div class="atb-pagebreak"></div>');
                break;
        }
    });

    closeLists();

    // コロフォンは流れの最後に置く（最終ページのフッターに実行組版される）。
    body.push(`<div class="atb-colophon">${escapeHtml(COLOPHON)}</div>`);

    const css = buildCss(config);

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
${body.join('\n')}
</body>
</html>
`;
}
