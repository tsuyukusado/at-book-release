import { appendFile } from 'fs/promises';

function formatDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
           `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export async function appendCharCount(logPath: string, entry: {
    atbPath: string;
    charCount: number;
}): Promise<void> {
    const lines = [
        `生成日時: ${formatDate(new Date())}`,
        `ファイル: ${entry.atbPath}`,
        `総文字数: ${entry.charCount.toLocaleString('ja-JP')}文字`,
        '',
    ].join('\n');
    await appendFile(logPath, lines, 'utf-8');
}
