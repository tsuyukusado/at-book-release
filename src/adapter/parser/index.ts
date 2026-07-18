import { parseLine } from "./blockParser";

export type { ParsedNode, HeadingNode, TocNode, ListItemNode, ParagraphNode, BlankNode } from "./blockParser";
export type { InlineNode, TextNode, RubyNode, KentenNode, DashNode, EllipsisNode } from "./inlineParser";
export { parseInline } from "./inlineParser";

export function parse(text: string): import("./blockParser").ParsedNode[] {
    // 改行は CRLF / CR / LF いずれでも分割する。CRLF の \r を残すと行末に \r が付き、
    // ＠目次 や ＠＠＠ など完全一致の判定（blockParser）を外して見出しに化けるため。
    return text.split(/\r\n?|\n/).map(parseLine);
}
