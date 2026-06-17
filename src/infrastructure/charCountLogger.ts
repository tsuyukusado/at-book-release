import { appendFile } from 'fs/promises';

function formatDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
           `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export async function appendCharCount(logPath: string, entry: {
    atbPath: string;
    charCount: number;
    commitHash?: string;
    commitMessage?: string;
}): Promise<void> {
    const rows: string[] = [`日時: ${formatDate(new Date())}`];
    if (entry.commitHash) {
        rows.push(`コミット: ${entry.commitHash.slice(0, 7)} ${entry.commitMessage ?? ''}`.trimEnd());
    }
    rows.push(
        `ファイル: ${entry.atbPath}`,
        `総文字数: ${entry.charCount.toLocaleString('ja-JP')}文字`,
        '',
    );
    await appendFile(logPath, rows.join('\n'), 'utf-8');
}
