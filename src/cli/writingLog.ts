#!/usr/bin/env node
// 執筆記録コマンド。組版とは独立した入口にしてある。
//
// 組版（at-book）は git を知らないままにしておきたい、というのが分離の理由。
// そのため import も個別に指定している。infrastructure/index.ts 経由で読むと、
// このコマンドには要らない Vivliostyle 一式まで引きずり込むことになる。
import { nodeGitHistory, isGitRepository } from "../infrastructure/gitHistory";
import { collectCommitCounts, toWritingLog, formatWritingLog } from "../usecase/writingLog";

function helpText(): string {
    return [
        '使い方: at-book-log',
        '',
        '  git の履歴をたどって、作品ごとの執筆記録を表示します。',
        '  原稿（.atb）が変更されたコミットを拾い、その日の終わりに',
        '  何文字あったかを 1 日 1 行で並べます。',
        '',
        '  --help, -h                     この使い方を表示',
    ].join('\n');
}

function main(): void {
    const arg = process.argv[2];

    if (arg === '--help' || arg === '-h') {
        console.log(helpText());
        return;
    }
    if (arg !== undefined) {
        console.error(`エラー: 知らない引数です: ${arg}`);
        console.error('');
        console.error(helpText());
        process.exit(1);
    }

    if (!isGitRepository()) {
        console.error('エラー: git リポジトリではないか、コミットがまだありません。');
        console.error('  執筆記録は git の履歴から作るので、原稿を git で管理している必要があります。');
        process.exit(1);
    }

    const logs = toWritingLog(collectCommitCounts(nodeGitHistory));

    if (logs.length === 0) {
        console.log('記録できる原稿（.atb）がコミット履歴に見つかりませんでした。');
        return;
    }

    console.log(formatWritingLog(logs));
}

main();
