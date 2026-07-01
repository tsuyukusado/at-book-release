import { keySymbol } from "../../domain";
import type { heading, index, listItem, paragraph } from "../../domain";

export type HeadingNode   = { kind: 'heading'   } & heading;
export type TocNode       = { kind: 'toc'       } & index;
export type ListItemNode  = { kind: 'listItem'  } & listItem;
export type ParagraphNode = { kind: 'paragraph' } & paragraph;
export type BlankNode     = { kind: 'blank' };
export type PageBreakNode = { kind: 'pageBreak' };

export type ParsedNode = HeadingNode | TocNode | ListItemNode | ParagraphNode | BlankNode | PageBreakNode;

export function parseLine(line: string): ParsedNode {
    if (line.trim() === '') return { kind: 'blank' };

    if (line === '＠＠＠') {
        return { kind: 'pageBreak' };
    }

    if (line.startsWith('＠＠')) {
        return { kind: 'heading', keySymbol, level: 2, text: line.slice(2) };
    }

    if (line === '＠目次') {
        return { kind: 'toc', keySymbol, text: '目次' };
    }

    if (line.startsWith('＠') && !line.startsWith('＠ー') && !/^＠[^＠（）\n]+（/.test(line)) {
        return { kind: 'heading', keySymbol, level: 1, text: line.slice(1) };
    }

    const listMatch = line.match(/^(　*)・([^・].*)/);
    if (listMatch) {
        const indent = listMatch[1] ?? '';
        const text   = listMatch[2] ?? '';
        return { kind: 'listItem', bullet: '・', text, level: indent.length + 1 };
    }

    return { kind: 'paragraph', text: line };
}
