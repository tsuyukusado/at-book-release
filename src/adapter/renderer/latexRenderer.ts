import { parseInline } from "../parser";
import type { InlineNode, ParsedNode } from "../parser";
import type { PaperConfig } from "../../domain";

function renderInlineNode(node: InlineNode): string {
    switch (node.kind) {
        case 'text':     return node.text;
        case 'ruby':     return `\\ruby{${node.text}}{${node.ruby}}`;
        case 'kenten':   return `\\kenten{${node.text}}`;
        case 'dash':     return '——';
        case 'ellipsis': return '…'.repeat(node.level);
    }
}

function renderInline(text: string): string {
    return parseInline(text).map(renderInlineNode).join('');
}

function buildPreamble(config: PaperConfig): string {
    const paper    = `${config.paperSize}paper`;
    const isVertical = config.writingMode === 'vertical';
    const docClass = isVertical ? 'ltjtbook' : 'ltjsbook';
    const bindingMargins = isVertical
        ? 'inner=10mm,outer=20mm'
        : 'inner=20mm,outer=10mm';

    return [
        `\\documentclass[${paper},9pt,openany]{${docClass}}`,
        `\\usepackage[${paper},twoside,top=10mm,bottom=10mm,${bindingMargins},footskip=1mm]{geometry}`,
        '\\usepackage{luatexja}',
        '\\usepackage{luatexja-ruby}',
        '\\ltjsetruby{kenten={﹅}}',
        '\\usepackage{luatexja-fontspec}',
        '\\setmainfont[BoldFont=ShipporiMincho-Bold.ttf]{ShipporiMincho-Regular.ttf}',
        '\\setmainjfont[BoldFont=ShipporiMincho-Bold.ttf]{ShipporiMincho-Regular.ttf}',
        '\\setsansjfont[BoldFont=ShipporiMincho-Bold.ttf]{ShipporiMincho-Regular.ttf}',
        '\\usepackage{enumitem}',
        '\\setlist[itemize]{leftmargin=1em,label=・,labelwidth=1em,labelsep=0pt,labelindent=0pt,topsep=0pt,itemsep=0pt,parsep=0pt,partopsep=0pt}',
        '\\usepackage{fancyhdr}',
        '\\pagestyle{fancy}',
        '\\fancyhf{}',
        ...(isVertical
            ? [
                '\\fancyfoot[LO]{\\llap{\\thepage\\hspace{3mm}}}',
                '\\fancyfoot[RE]{\\rlap{\\hspace{3mm}\\thepage}}',
            ]
            : [
                '\\fancyfoot[RO]{\\rlap{\\hspace{3mm}\\thepage}}',
                '\\fancyfoot[LE]{\\llap{\\thepage\\hspace{3mm}}}',
            ]),
        '\\renewcommand{\\headrulewidth}{0pt}',
        ...(isVertical
            ? ['\\fancypagestyle{plain}{\\fancyhf{}\\fancyfoot[LO]{\\llap{\\thepage\\hspace{3mm}}}\\fancyfoot[RE]{\\rlap{\\hspace{3mm}\\thepage}}\\renewcommand{\\headrulewidth}{0pt}}']
            : ['\\fancypagestyle{plain}{\\fancyhf{}\\fancyfoot[RO]{\\rlap{\\hspace{3mm}\\thepage}}\\fancyfoot[LE]{\\llap{\\thepage\\hspace{3mm}}}\\renewcommand{\\headrulewidth}{0pt}}']),
        ...(isVertical
            ? ['\\fancypagestyle{lastpage}{\\fancyhf{}\\fancyfoot[LO]{\\llap{\\thepage\\hspace{3mm}}}\\fancyfoot[RE]{\\rlap{\\hspace{3mm}\\thepage}}\\fancyfoot[C]{\\tiny Created with at-book. Copyright \\textcopyright\\ 2026 tsuyukusado. MIT License.}\\renewcommand{\\headrulewidth}{0pt}}']
            : ['\\fancypagestyle{lastpage}{\\fancyhf{}\\fancyfoot[RO]{\\rlap{\\hspace{3mm}\\thepage}}\\fancyfoot[LE]{\\llap{\\thepage\\hspace{3mm}}}\\fancyfoot[C]{\\tiny Created with at-book. Copyright \\textcopyright\\ 2026 tsuyukusado. MIT License.}\\renewcommand{\\headrulewidth}{0pt}}']),
        '\\renewcommand{\\contentsname}{目次}',
        '\\setcounter{tocdepth}{2}',
        '\\makeatletter',
        '\\renewcommand{\\tableofcontents}{\\par\\vspace{0.2em}\\noindent{\\bfseries\\fontsize{18}{20}\\selectfont\\contentsname}\\par\\vspace{0.1em}\\@starttoc{toc}}',
        ...(isVertical
            ? ['\\def\\@dashedtocline#1#2#3#4#5{\\ifnum #1>\\c@tocdepth\\else\\vskip\\z@\\@plus.2\\p@{\\leftskip #2\\relax\\rightskip\\@tocrmarg\\parfillskip-\\rightskip\\parindent #2\\relax\\@afterindenttrue\\interlinepenalty\\@M\\leavevmode\\@tempdima #3\\relax\\advance\\leftskip\\@tempdima\\null\\nobreak\\hskip-\\leftskip{#4}\\nobreak\\leaders\\hbox{\\normalfont—}\\hfill\\nobreak\\hb@xt@\\@pnumwidth{\\hfil\\normalfont\\normalcolor \\rensuji{#5}}\\par}\\fi}']
            : ['\\def\\@dashedtocline#1#2#3#4#5{\\ifnum #1>\\c@tocdepth\\else\\vskip\\z@\\@plus.2\\p@{\\leftskip #2\\relax\\rightskip\\@tocrmarg\\parfillskip-\\rightskip\\parindent #2\\relax\\@afterindenttrue\\interlinepenalty\\@M\\leavevmode\\@tempdima #3\\relax\\advance\\leftskip\\@tempdima\\null\\nobreak\\hskip-\\leftskip{#4}\\nobreak\\leaders\\hbox{\\normalfont—}\\hfill\\nobreak\\hb@xt@\\@pnumwidth{\\hfil\\normalfont\\normalcolor #5}\\par}\\fi}']),
        ...(isVertical
            ? [
                '\\renewcommand*{\\l@section}{\\@dashedtocline{1}{0\\zw}{3\\zw}}',
                '\\renewcommand*{\\l@subsection}{\\@dashedtocline{2}{1\\zw}{3\\zw}}',
            ]
            : ['\\renewcommand*{\\l@subsection}{\\@tempdima\\jsc@tocl@width\\@dashedtocline{2}{\\@tempdima}{3.683\\zw}}']),
        '\\makeatother',
        '\\begin{document}',
        '\\AtEndDocument{\\thispagestyle{lastpage}}',
        '\\setlength{\\parskip}{0pt}',
        '\\linespread{1.05}\\selectfont',
    ].join('\n');
}

const POSTAMBLE = '\\end{document}';

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

export function render(nodes: ParsedNode[], config: PaperConfig): string {
    const lines: string[] = [];
    const isVertical = config.writingMode === 'vertical';
    let listDepth = 0;
    let h1 = 0;
    let h2 = 0;

    for (const node of nodes) {
        if (node.kind === 'listItem') {
            while (listDepth < node.level) {
                lines.push('\\begin{itemize}');
                listDepth++;
            }
            while (listDepth > node.level) {
                listDepth--;
                lines.push('\\end{itemize}');
            }
            lines.push(`\\item ${renderInline(node.text)}`);
            continue;
        }

        while (listDepth > 0) {
            listDepth--;
            lines.push('\\end{itemize}');
        }

        switch (node.kind) {
            case 'heading':
                if (node.level === 1) {
                    h1++;
                    h2 = 0;
                    const h1str = isVertical ? toKanjiNumber(h1) : `${h1}`;
                    const h1sep = isVertical ? '　' : ' ';
                    const h1title = `${h1str}${h1sep}${renderInline(node.text)}`;
                    lines.push('\\clearpage');
                    lines.push(`\\par\\vspace{0.2em}\\noindent{\\bfseries\\fontsize{18}{20}\\selectfont ${h1title}}\\par\\vspace{0.1em}`);
                    lines.push(`\\addcontentsline{toc}{section}{${h1title}}`);
                } else {
                    h2++;
                    const h1str2 = isVertical ? toKanjiNumber(h1) : `${h1}`;
                    const h2str  = isVertical ? toKanjiNumber(h2) : `${h2}`;
                    const sep    = isVertical ? '・' : '-';
                    const h2sep  = isVertical ? '　' : ' ';
                    const h2title = `${h1str2}${sep}${h2str}${h2sep}${renderInline(node.text)}`;
                    lines.push(`\\par\\vspace{0.1em}\\noindent{\\bfseries ${h2title}}\\par\\vspace{0.1em}`);
                    lines.push(`\\addcontentsline{toc}{subsection}{${h2title}}`);
                }
                break;
            case 'toc':
                lines.push('\\clearpage');
                lines.push('\\tableofcontents');
                lines.push('\\thispagestyle{fancy}');
                lines.push('\\clearpage');
                break;
            case 'paragraph':
                lines.push(`\\noindent\\hspace{\\parindent}${renderInline(node.text)}\\par`);
                break;
            case 'blank':
                lines.push('\\vspace{\\baselineskip}');
                break;
            case 'pageBreak':
                lines.push('\\clearpage');
                break;
        }
    }

    while (listDepth > 0) {
        listDepth--;
        lines.push('\\end{itemize}');
    }

    return `${buildPreamble(config)}\n${lines.join('\n')}\n${POSTAMBLE}`;
}
