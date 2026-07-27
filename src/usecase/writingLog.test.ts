import { describe, it, expect } from 'vitest';
import { collectCommitCounts, toWritingLog, formatWritingLog } from './writingLog';
import type { GitHistoryReader, CommitCount } from './writingLog';

// 履歴を模した git。日時は接尾辞を付けずに書くことでローカル時刻として解釈させる
// （集計をローカル時刻で区切っているため、ここで UTC を混ぜると日付境界がずれる）。
interface FakeCommit {
    hash:  string;
    date:  string;
    files: Record<string, string>;
}

function fakeGit(commits: FakeCommit[]): GitHistoryReader {
    const find = (hash: string) => commits.find(c => c.hash === hash);
    return {
        revList:         () => commits.map(c => c.hash),
        changedAtbFiles: (commit) => Object.keys(find(commit)?.files ?? {}),
        commitDate:      (commit) => { const c = find(commit); return c ? new Date(c.date) : undefined; },
        showFile:        (commit, filePath) => find(commit)?.files[filePath],
    };
}

// countChars は 1 文字 = 1 とそのまま数えるので、長さで文字数を作れる。
const text = (chars: number) => 'あ'.repeat(chars);

describe('collectCommitCounts', () => {
    it('LOG-01 原稿が変更されたコミットだけを拾う', () => {
        const git = fakeGit([
            { hash: 'c1', date: '2026-07-25T10:00:00', files: { 'novel.atb': text(100) } },
            { hash: 'c2', date: '2026-07-25T11:00:00', files: {} },
            { hash: 'c3', date: '2026-07-26T10:00:00', files: { 'novel.atb': text(300) } },
        ]);
        expect(collectCommitCounts(git).map(c => c.charCount)).toEqual([100, 300]);
    });

    it('LOG-02 同じコミットで複数の作品が変わっていれば両方拾う', () => {
        const git = fakeGit([
            { hash: 'c1', date: '2026-07-25T10:00:00', files: { 'a.atb': text(100), 'b.atb': text(200) } },
        ]);
        expect(collectCommitCounts(git).map(c => [c.atbPath, c.charCount])).toEqual([
            ['a.atb', 100],
            ['b.atb', 200],
        ]);
    });
});

describe('toWritingLog', () => {
    const count = (atbPath: string, date: string, charCount: number): CommitCount =>
        ({ atbPath, date: new Date(date), charCount });

    it('LOG-03 同じ日の複数コミットは、その日の最後の値で 1 行に畳む', () => {
        const logs = toWritingLog([
            count('novel.atb', '2026-07-25T09:00:00', 100),
            count('novel.atb', '2026-07-25T22:00:00', 900),
        ]);
        expect(logs[0].rows).toEqual([{ date: '2026-07-25', charCount: 900, diff: undefined }]);
    });

    it('LOG-04 前の記録日との増減を出す。最初の記録日は比較対象が無いので持たない', () => {
        const logs = toWritingLog([
            count('novel.atb', '2026-07-25T10:00:00', 1000),
            count('novel.atb', '2026-07-26T10:00:00', 4000),
            count('novel.atb', '2026-07-27T10:00:00', 3500),
        ]);
        expect(logs[0].rows).toEqual([
            { date: '2026-07-25', charCount: 1000, diff: undefined },
            { date: '2026-07-26', charCount: 4000, diff:  3000 },
            { date: '2026-07-27', charCount: 3500, diff:  -500 },
        ]);
    });

    it('LOG-05 作品ごとに分けて記録する', () => {
        const logs = toWritingLog([
            count('b.atb', '2026-07-25T10:00:00', 200),
            count('a.atb', '2026-07-25T10:00:00', 100),
        ]);
        expect(logs.map(l => l.atbPath)).toEqual(['a.atb', 'b.atb']);
    });

    it('LOG-06 コミットの並び順と日時がずれていても日付順に並べ直す', () => {
        // マージやリベースで、履歴の並びが日時の順と一致しないことがある。
        const logs = toWritingLog([
            count('novel.atb', '2026-07-27T10:00:00', 3000),
            count('novel.atb', '2026-07-25T10:00:00', 1000),
        ]);
        expect(logs[0].rows).toEqual([
            { date: '2026-07-25', charCount: 1000, diff: undefined },
            { date: '2026-07-27', charCount: 3000, diff:  2000 },
        ]);
    });
});

describe('formatWritingLog', () => {
    it('LOG-07 作品名の下に、桁を揃えて日付と文字数を並べる', () => {
        const logs = toWritingLog([
            { atbPath: 'novel.atb', date: new Date('2026-07-25T10:00:00'), charCount: 100 },
            { atbPath: 'novel.atb', date: new Date('2026-07-26T10:00:00'), charCount: 1500 },
        ]);
        expect(formatWritingLog(logs)).toBe(
            'novel.atb\n' +
            '  2026-07-25     100文字\n' +
            '  2026-07-26   1,500文字  (+1,400)'
        );
    });

    it('LOG-08 増減は符号付きで示し、変わらなかった日は ±0 と書く', () => {
        const logs = toWritingLog([
            { atbPath: 'novel.atb', date: new Date('2026-07-25T10:00:00'), charCount: 500 },
            { atbPath: 'novel.atb', date: new Date('2026-07-26T10:00:00'), charCount: 500 },
            { atbPath: 'novel.atb', date: new Date('2026-07-27T10:00:00'), charCount: 200 },
        ]);
        expect(formatWritingLog(logs)).toContain('(±0)');
        expect(formatWritingLog(logs)).toContain('(-300)');
    });

    it('LOG-09 作品が複数あれば空行で区切る', () => {
        const logs = toWritingLog([
            { atbPath: 'a.atb', date: new Date('2026-07-25T10:00:00'), charCount: 100 },
            { atbPath: 'b.atb', date: new Date('2026-07-25T10:00:00'), charCount: 200 },
        ]);
        expect(formatWritingLog(logs)).toBe(
            'a.atb\n' +
            '  2026-07-25   100文字\n' +
            '\n' +
            'b.atb\n' +
            '  2026-07-25   200文字'
        );
    });
});
