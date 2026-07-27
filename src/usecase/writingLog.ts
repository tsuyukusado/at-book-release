import { countChars } from "./countChars";

// あるコミット時点の、原稿 1 つぶんの総文字数。
export interface CommitCount {
    atbPath:   string;
    date:      Date;
    charCount: number;
}

// 執筆記録の 1 行。「その日の終わりに原稿が何文字あったか」を表す。
export interface DailyRow {
    date:      string;  // YYYY-MM-DD
    charCount: number;
    diff?:     number;  // 前の記録日からの増減。最初の記録日は比較対象が無いので持たない
}

// 作品 1 つぶんの執筆記録。
export interface WorkLog {
    atbPath: string;
    rows:    DailyRow[];
}

// 履歴をたどるのに必要な操作。git そのものは infrastructure 側が持つ。
// ここを差し替えられるようにしておかないと、記録の組み立てを git 無しでテストできない。
export interface GitHistoryReader {
    // 古いコミットから順に並べたコミットハッシュ。
    revList(): string[];
    // そのコミットで追加・変更された .atb のパス（リポジトリルートからの相対）。
    changedAtbFiles(commit: string): string[];
    commitDate(commit: string): Date | undefined;
    showFile(commit: string, filePath: string): string | undefined;
}

// 日付キー。集計は書き手の生活時間で区切りたいので、UTC ではなくローカル時刻で見る。
function toDateKey(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDiff(diff: number): string {
    if (diff > 0) return `+${diff.toLocaleString('ja-JP')}`;
    if (diff < 0) return diff.toLocaleString('ja-JP');
    return '±0';
}

// コミット履歴をたどって、各時点の総文字数を拾い集める。
// 原稿が変わっていないコミットは記録しない（執筆していない日を 0 文字として
// 並べても、記録として読みにくくなるだけなので）。
export function collectCommitCounts(git: GitHistoryReader): CommitCount[] {
    const counts: CommitCount[] = [];
    for (const commit of git.revList()) {
        const changed = git.changedAtbFiles(commit);
        if (changed.length === 0) continue;

        const date = git.commitDate(commit);
        if (!date) continue;

        for (const atbPath of changed) {
            const text = git.showFile(commit, atbPath);
            if (text === undefined) continue;
            counts.push({ atbPath, date, charCount: countChars(text) });
        }
    }
    return counts;
}

// 拾った文字数を、作品ごと・1 日 1 行の記録に畳む。
//
// 同じ日に何度コミットしても記録は 1 行にする。知りたいのは「その日の終わりに
// 原稿が何文字になっていたか」なので、その日の最後のコミットを採用する。
//
// 作品ごとに分けるのは、1 つの作品では執筆と推敲が同時に走らないため。
// 全作品をまとめて数えると、片方を書いて片方を削った日に増減が相殺されて、
// その日何をしたのかが読み取れなくなる。
export function toWritingLog(counts: CommitCount[]): WorkLog[] {
    const byWork = new Map<string, CommitCount[]>();
    for (const count of counts) {
        const list = byWork.get(count.atbPath);
        if (list) list.push(count);
        else byWork.set(count.atbPath, [count]);
    }

    const logs: WorkLog[] = [];
    for (const [atbPath, list] of byWork) {
        // コミットの並び順と日時は必ずしも一致しない（マージやリベースでずれる）ため、
        // 日付で並べ直してから畳む。
        const sorted = [...list].sort((a, b) => a.date.getTime() - b.date.getTime());

        // Map は最初に入れた位置で順序を保つので、日付順のまま「その日の最後の値」が残る。
        const lastOfDay = new Map<string, number>();
        for (const count of sorted) lastOfDay.set(toDateKey(count.date), count.charCount);

        const rows: DailyRow[] = [];
        let prev: number | undefined;
        for (const [date, charCount] of lastOfDay) {
            rows.push({ date, charCount, diff: prev === undefined ? undefined : charCount - prev });
            prev = charCount;
        }
        logs.push({ atbPath, rows });
    }

    logs.sort((a, b) => a.atbPath.localeCompare(b.atbPath));
    return logs;
}

// 記録を読み物として整える。文字数は桁を揃えて、伸び具合が縦に並んで見えるようにする。
export function formatWritingLog(logs: WorkLog[]): string {
    return logs.map(log => {
        const entries = log.rows.map(row => ({ row, count: row.charCount.toLocaleString('ja-JP') }));
        const width   = entries.reduce((max, e) => Math.max(max, e.count.length), 0);
        const lines   = entries.map(({ row, count }) => {
            const diff = row.diff === undefined ? '' : `  (${formatDiff(row.diff)})`;
            return `  ${row.date}   ${count.padStart(width)}文字${diff}`;
        });
        return [log.atbPath, ...lines].join('\n');
    }).join('\n\n');
}
