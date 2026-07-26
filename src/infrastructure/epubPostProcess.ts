import * as path from "path";
import { createWriteStream } from "fs";
import { rm, rename } from "fs/promises";
import archiver from "archiver";
import StreamZip from "node-stream-zip";

// EPUB の OPF に Amazon 独自メタ primary-writing-mode を注入する。
//
// なぜ必要か: Kindle（特に Send to Kindle でサイドロードした EPUB を KFX へ変換する工程）は、
// 本を縦組み日本語書籍として扱うかを OPF の <meta name="primary-writing-mode" content="vertical-rl"/>
// で判定する。これが無いと、CSS の -epub-writing-mode で見た目が縦になっても Kindle の縦中横
// （text-combine）エンジンが起動せず、！？ 等が横並び正立にならず倒れてしまう。
// Vivliostyle は標準 EPUB 仕様外のこのメタを出力しないため、生成後にここで埋める。
// 標準リーダーは未知の <meta name> を無視するので、注入しても無害。
//
// EPUB(OCF) の必須制約を守って再梱包する: mimetype エントリを先頭・無圧縮(store)で置く。
export async function injectPrimaryWritingMode(
    epubPath: string,
    mode: 'vertical-rl' | 'horizontal-tb',
): Promise<void> {
    const absPath = path.resolve(epubPath);

    // 既存 EPUB を全エントリ読み出す（OPF だけ後で書き換え、他はそのまま再梱包する）。
    const zip = new StreamZip.async({ file: absPath });
    let entries: Record<string, { isDirectory: boolean }>;
    const files: { name: string; data: Buffer }[] = [];
    try {
        entries = await zip.entries();
        for (const name of Object.keys(entries)) {
            if (entries[name]!.isDirectory) continue;
            files.push({ name, data: await zip.entryData(name) });
        }
    } finally {
        await zip.close();
    }

    // OPF を書き換える。既に注入済み・metadata が見つからない場合は素通し（多重注入を防ぐ）。
    let changed = false;
    for (const f of files) {
        if (!f.name.endsWith('.opf')) continue;
        const opf = f.data.toString('utf-8');
        if (opf.includes('name="primary-writing-mode"')) break;
        const injected = opf.replace(
            /([ \t]*)<\/metadata>/,
            `$1  <meta name="primary-writing-mode" content="${mode}"/>\n$1</metadata>`,
        );
        if (injected !== opf) {
            f.data = Buffer.from(injected, 'utf-8');
            changed = true;
        }
        break;
    }
    if (!changed) return;

    // 一旦 tmp に書き出してから置き換える（元ファイルを読みつつ同名へ書くのを避ける）。
    const tmpPath = `${absPath}.tmp`;
    await rm(tmpPath, { force: true });
    await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(tmpPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', () => resolve());
        archive.on('error', reject);
        archive.pipe(output);
        // mimetype は先頭・無圧縮でなければ EPUB として不正になる。
        const mimetype = files.find(f => f.name === 'mimetype');
        if (mimetype) archive.append(mimetype.data, { name: 'mimetype', store: true });
        for (const f of files) {
            if (f.name === 'mimetype') continue;
            archive.append(f.data, { name: f.name });
        }
        archive.finalize();
    });

    // 元 EPUB を差し替える。rename は既存ファイルを原子的に置き換えるので、
    // 事前に消さない（消してから rename すると、間で落ちたとき EPUB が消える）。
    await rename(tmpPath, absPath);
}
