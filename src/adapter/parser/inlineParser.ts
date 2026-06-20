import { keySymbol } from "../../domain";
import type { ruby, kenten, dash, ellipsis } from "../../domain";

export type TextNode        = { kind: 'text';        text: string };
export type RubyNode        = { kind: 'ruby'        } & ruby;
export type KentenNode      = { kind: 'kenten'      } & kenten;
export type DashNode        = { kind: 'dash'        } & dash;
export type EllipsisNode    = { kind: 'ellipsis'    } & ellipsis;
export type TateChuYokoNode = { kind: 'tatechuyoko'; text: string };

export type InlineNode = TextNode | RubyNode | KentenNode | DashNode | EllipsisNode | TateChuYokoNode;

// ＠text（ruby/・） または ーー以上 または ・・以上（中黒２個以上→三点リーダー） または ！？の組み合わせ（縦中横）
const INLINE_RE = /＠([^（）\n]+)（([^）\n]*)）|ーー+|・・+|[！？]{2,}/g;

export function parseInline(text: string): InlineNode[] {
    const nodes: InlineNode[] = [];
    let lastIndex = 0;

    for (const match of text.matchAll(INLINE_RE)) {
        const matchIndex = match.index ?? 0;

        if (matchIndex > lastIndex) {
            nodes.push({ kind: 'text', text: text.slice(lastIndex, matchIndex) });
        }

        if (match[0].startsWith('＠')) {
            const matchText  = match[1] ?? '';
            const matchRuby  = match[2] ?? '';
            if (matchRuby === '・') {
                nodes.push({ kind: 'kenten', keySymbol, text: matchText, ruby: '﹅' });
            } else {
                nodes.push({ kind: 'ruby', keySymbol, text: matchText, ruby: matchRuby });
            }
        } else if (match[0].startsWith('ー')) {
            nodes.push({ kind: 'dash', keySymbol, text: 'ー', level: match[0].length });
        } else if (match[0].startsWith('・')) {
            nodes.push({ kind: 'ellipsis', keySymbol, text: '・', level: match[0].length });
        } else {
            nodes.push({ kind: 'tatechuyoko', text: match[0] });
        }

        lastIndex = matchIndex + match[0].length;
    }

    if (lastIndex < text.length) {
        nodes.push({ kind: 'text', text: text.slice(lastIndex) });
    }

    return nodes;
}
