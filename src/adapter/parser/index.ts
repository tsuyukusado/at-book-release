import { parseLine } from "./blockParser";

export type { ParsedNode, HeadingNode, TocNode, ListItemNode, ParagraphNode, BlankNode } from "./blockParser";
export type { InlineNode, TextNode, RubyNode, KentenNode, DashNode, EllipsisNode } from "./inlineParser";
export { parseInline } from "./inlineParser";

export function parse(text: string): import("./blockParser").ParsedNode[] {
    return text.split('\n').map(parseLine);
}
