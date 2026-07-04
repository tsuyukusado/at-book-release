import { parse, parseInline } from "./parser";
import type { InlineNode } from "./parser";
import type { WebFile, WebExport } from "../domain";

// ---- インライン要素をウェブ投稿用記法へ ------------------------------------
//   ルビ        ＠漢字（かんじ） → ｜漢字《かんじ》
//   圏点        ＠文字（・）     → ｜文《﹅》｜字《﹅》（一文字ずつ）
//   ダッシュ    ＠ー×n           → ―― を直接（n レベル分）
//   三点リーダー ・・+           → … を直接（中黒の数だけ）
//   縦中横      ！？・半角数字    → そのまま素通し（ウェブは横書き前提）
// ！／？ のあとの全角スペース挿入は parseInline 側で行われ、text ノードに含まれる。

function renderInlineNodeWeb(node: InlineNode): string {
    switch (node.kind) {
        case 'text':
            return node.text;
        case 'ruby':
            return `｜${node.text}《${node.ruby}》`;
        case 'kenten':
            // 圏点は一文字ずつ ｜文《﹅》 の形にする。
            return [...node.text].map(ch => `｜${ch}《${node.ruby}》`).join('');
        case 'dash':
            // ＠ー → 1レベルにつき「――」（U+2015 の2連）を直接書く。
            return '――'.repeat(node.level);
        case 'ellipsis':
            // ・・ → 三点リーダー「…」を直接書く。level は元の中黒の数。
            return '…'.repeat(node.level);
        case 'tatechuyoko':
            // 縦中横は横書きでは素通し。
            return node.text;
    }
}

export function renderInlineWeb(text: string): string {
    return parseInline(text).map(renderInlineNodeWeb).join('');
}

// ---- ファイル／フォルダ名のサニタイズ --------------------------------------

// OS でファイル名に使えない半角記号を全角へ置換する。
const ILLEGAL_MAP: Record<string, string> = {
    '<': '＜', '>': '＞', ':': '：', '"': '”',
    '/': '／', '\\': '＼', '|': '｜', '?': '？', '*': '＊',
};

// ファイル名 1 コンポーネントの上限（UTF-8 で 255 バイト ≒ 日本語 85 文字。余裕を見て 80 文字）。
const MAX_NAME_CHARS = 80;

export function sanitizeName(raw: string, maxChars: number = MAX_NAME_CHARS): string {
    // 禁止文字を全角化、制御文字は除去。
    let s = raw
        .replace(/[<>:"/\\|?*]/g, ch => ILLEGAL_MAP[ch] ?? '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1f]/g, '');
    // 先頭・末尾の空白とピリオドを落とす（Windows が勝手に削るため）。
    s = s.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
    const chars = [...s];
    if (chars.length > maxChars) {
        s = chars.slice(0, maxChars).join('').replace(/[.\s]+$/, '');
    }
    return s;
}

// ---- 本文の前後空行を落とす ------------------------------------------------

function trimBlankEdges(lines: string[]): string[] {
    let start = 0;
    let end = lines.length;
    while (start < end && lines[start]!.trim() === '') start++;
    while (end > start && lines[end - 1]!.trim() === '') end--;
    return lines.slice(start, end);
}

// ---- atb テキスト → ウェブ投稿用の分割出力 --------------------------------

type RawFile = { dir: string[]; name: string; content: string };

export function exportWeb(text: string): WebExport {
    const nodes = parse(text);

    const raw: RawFile[] = [];
    let sawHeading = false;
    let titleFirstLine: string | null = null;  // 作品フォルダ名の元（生テキスト）
    let firstHeadingText: string | null = null; // タイトルが無いときのフォルダ名フォールバック
    const titleLines: string[] = [];            // 見出し前の本文（見出しが無い場合のみ本文化）

    let currentChapter: string | null = null;   // 現在の章フォルダ名（生）
    let currentFileName: string | null = null;  // 現在の話ファイル名（生）
    let buffer: string[] = [];

    const pushLine = (line: string): void => {
        if (!sawHeading) titleLines.push(line);
        else buffer.push(line);
    };

    const flush = (): void => {
        if (currentFileName === null) return;
        const content = trimBlankEdges(buffer);
        buffer = [];
        if (content.length === 0) return; // 中身の無いファイルは作らない
        raw.push({
            dir: currentChapter !== null ? [currentChapter] : [],
            name: currentFileName,
            content: content.join('\n'),
        });
    };

    for (const node of nodes) {
        switch (node.kind) {
            case 'heading':
                if (firstHeadingText === null) firstHeadingText = node.text;
                flush();
                sawHeading = true;
                if (node.level === 1) {
                    // レベル1＝章。以降のファイルはこの章フォルダに入る。
                    // 章直下（小見出しが来る前）の本文は「章見出し名」のファイルにする。
                    currentChapter = node.text;
                }
                currentFileName = node.text;
                buffer = [];
                break;
            case 'toc':
                // 目次はまるごと消去。
                break;
            case 'pageBreak':
                if (currentFileName !== null) buffer.push(''); // 改ページ → 改行
                break;
            case 'listItem':
                // 箇条書きはプレーンテキストとして中黒付きで出す。
                pushLine('・' + renderInlineWeb(node.text));
                break;
            case 'paragraph':
                if (!sawHeading && titleFirstLine === null) titleFirstLine = node.text;
                pushLine(renderInlineWeb(node.text));
                break;
            case 'blank':
                pushLine('');
                break;
        }
    }
    flush();

    // 見出しが1つも無い場合は、全文を1ファイルにする。
    if (raw.length === 0) {
        const body = trimBlankEdges(titleLines);
        if (body.length > 0) {
            raw.push({
                dir: [],
                name: (titleFirstLine && sanitizeName(titleFirstLine)) || '本文',
                content: body.join('\n'),
            });
        }
    }

    // 作品（トップ）フォルダ名 = タイトル1行目の冒頭5文字。
    const titleSource = titleFirstLine ?? firstHeadingText ?? '無題';
    const folderName =
        [...sanitizeName(titleSource)].slice(0, 5).join('').replace(/[.\s]+$/, '') || '無題';

    // 名前をサニタイズし、同一ディレクトリ内での重複は連番で回避する。
    const files: WebFile[] = [];
    const usedPerDir = new Map<string, Set<string>>();
    for (const f of raw) {
        const dir = f.dir.map(d => sanitizeName(d) || '無題');
        const dirKey = dir.join('/');
        const base = sanitizeName(f.name) || '無題';
        const set = usedPerDir.get(dirKey) ?? new Set<string>();
        let unique = base;
        let i = 2;
        while (set.has(unique)) unique = `${base}-${i++}`;
        set.add(unique);
        usedPerDir.set(dirKey, set);
        files.push({ dir, name: unique, content: f.content });
    }

    return { folderName, files };
}
