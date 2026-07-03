import { keySymbol } from "../../domain";
import type { ruby, kenten, dash, ellipsis } from "../../domain";

export type TextNode        = { kind: 'text';        text: string };
export type RubyNode        = { kind: 'ruby'        } & ruby;
export type KentenNode      = { kind: 'kenten'      } & kenten;
export type DashNode        = { kind: 'dash'        } & dash;
export type EllipsisNode    = { kind: 'ellipsis'    } & ellipsis;
export type TateChuYokoNode = { kind: 'tatechuyoko'; text: string };

export type InlineNode = TextNode | RubyNode | KentenNode | DashNode | EllipsisNode | TateChuYokoNode;

// ＠ー以上（＠＋長音記号→ダッシュ／ー１個につき２連） または ＠text（ruby/・） または ・・以上（中黒２個以上→三点リーダー） または ！？の組み合わせ（縦中横） または 半角数字１〜２桁（縦中横）
// ダッシュ（＠ー）をルビより先に判定する。そうしないと、同じ行の後方に全角括弧（…）やルビがあると、
// ルビ候補の貪欲な基底 [^＠（）\n]+ が ＠ー の ＠ を横取りし、ダッシュごと巻き込んでしまう。
// 半角数字は 1〜2 桁のみ縦中横にする。前後を数字以外で挟む境界（前後読み）で、3 桁以上の連なりは
// どの位置からも一致させない（「12」→縦中横、「123」→そのまま）。
const INLINE_RE = /＠(ー+)|＠([^＠（）\n]+)（([^）\n]*)）|・・+|[！？]{2,}|(?<![0-9])[0-9]{1,2}(?![0-9])/g;

export function parseInline(text: string): InlineNode[] {
    const nodes: InlineNode[] = [];
    let lastIndex = 0;

    for (const match of text.matchAll(INLINE_RE)) {
        const matchIndex = match.index ?? 0;

        if (matchIndex > lastIndex) {
            nodes.push({ kind: 'text', text: text.slice(lastIndex, matchIndex) });
        }

        if (match[1] !== undefined) {
            nodes.push({ kind: 'dash', keySymbol, text: 'ー', level: match[1].length });
        } else if (match[0].startsWith('＠')) {
            const matchText  = match[2] ?? '';
            const matchRuby  = match[3] ?? '';
            if (matchRuby === '・') {
                nodes.push({ kind: 'kenten', keySymbol, text: matchText, ruby: '﹅' });
            } else {
                nodes.push({ kind: 'ruby', keySymbol, text: matchText, ruby: matchRuby });
            }
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
