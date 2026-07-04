import { appendFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

function formatDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
           `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// 符号付きの差分文字列。0 は ±0、正は +N、負は -N（toLocaleString が負号を付ける）。
function formatDiff(diff: number): string {
    if (diff > 0) return `+${diff.toLocaleString('ja-JP')}`;
    if (diff < 0) return diff.toLocaleString('ja-JP');
    return '±0';
}

export async function appendCharCount(logPath: string, entry: {
    atbPath: string;
    charCount: number;
    pageCount?: number;
    commitHash?: string;
    commitMessage?: string;
    charDiff?: number;
    pageDiff?: number;
    isNew?: boolean;
    date?: Date;
}): Promise<void> {
    const rows: string[] = [`日時: ${formatDate(entry.date ?? new Date())}`];
    if (entry.commitHash) {
        rows.push(`コミット: ${entry.commitHash.slice(0, 7)} ${entry.commitMessage ?? ''}`.trimEnd());
    }
    rows.push(`ファイル: ${entry.atbPath}`);
    if (entry.pageCount !== undefined && entry.pageCount > 0) {
        const suffix = entry.pageDiff !== undefined ? ` (前回比 ${formatDiff(entry.pageDiff)}p)` : '';
        rows.push(`ページ数: ${entry.pageCount}p${suffix}`);
    }
    const charSuffix = entry.isNew
        ? ' (新規)'
        : entry.charDiff !== undefined ? ` (前回比 ${formatDiff(entry.charDiff)}文字)` : '';
    rows.push(`総文字数: ${entry.charCount.toLocaleString('ja-JP')}文字${charSuffix}`, '');
    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(logPath, rows.join('\n'), 'utf-8');
}
