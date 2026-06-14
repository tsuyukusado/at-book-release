import { parseLine } from '../adapter/parser/blockParser';

function processInlineMarkup(text: string): string {
    // ＠word（reading）→ wordreading（ルビの読みも含めてカウント）
    return text.replace(/＠([^（）]+)（([^（）]*)）/g, '$1$2');
}

export function countChars(atbText: string): number {
    let count = 0;
    for (const line of atbText.split('\n')) {
        const node = parseLine(line);
        switch (node.kind) {
            case 'blank':
            case 'toc':
            case 'pageBreak':
                break;
            case 'heading':
            case 'paragraph':
            case 'listItem':
                count += processInlineMarkup(node.text).length;
                break;
        }
    }
    return count;
}
