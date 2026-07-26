import * as path from "path";
import { CONFIG_FILE_NAME } from "../domain";
import type { ConfigLoader } from "./configLoad";
import { resolveOutDir } from "./resolveOutDir";

// 組版 1 件ぶんの指示。どちらも絶対パス。
export interface BuildTarget {
    atbPath: string;
    outDir:  string;
}

// 解決に失敗した理由。文言は持たせず、CLI 側で利用者向けの案内に翻訳する
// （ここに console を持ち込むと、この層をテストから叩けなくなるため）。
export type ResolveFailure =
    // 指定されたパスが存在しない。
    | { kind: 'targetMissing';  target: string }
    // 設定ファイルはあるが JSON として読めない。
    | { kind: 'configInvalid';  configPath: string; reason: string }
    // 組版対象がひとつも決まらなかった。scope はどの範囲を探した結果かを表す。
    | { kind: 'noAutoGenerate'; scope: 'tree' | 'config'; location: string }
    // autoGenerate に書かれた原稿が実在しない。
    | { kind: 'atbMissing';     configPath: string; relPath: string };

export type ResolveResult =
    | { ok: true;  targets: BuildTarget[] }
    | { ok: false; failure: ResolveFailure };

export type PathKind = 'file' | 'directory' | 'missing';

export interface ResolveBuildTargetsPorts {
    statKind(absPath: string): Promise<PathKind>;
    findConfigDirs(baseDir: string): Promise<string[]>;
    configLoader: ConfigLoader;
}

// 設定ファイル 1 つ分（＝作品 1 つ分）の組版対象を並べる。
// autoGenerate が無い場合は空配列を返す（失敗ではない。ツリー走査では設定ファイルが
// あっても組版対象を持たないディレクトリが普通にあるため）。
async function targetsForConfigDir(
    ports: ResolveBuildTargetsPorts,
    configDir: string,
): Promise<ResolveResult> {
    const configPath = path.join(configDir, CONFIG_FILE_NAME);
    // configLoader は「原稿のパス」を受け取り、その隣の設定ファイルを読む仕様なので、
    // ディレクトリ配下の適当なファイル名を与えて設定を引く。
    const loaded = await ports.configLoader.load(path.join(configDir, '_'));
    if (loaded.status === 'invalid') {
        return { ok: false, failure: { kind: 'configInvalid', configPath, reason: loaded.reason } };
    }

    const targets: BuildTarget[] = [];
    for (const relPath of loaded.config.autoGenerate ?? []) {
        const atbPath = path.resolve(configDir, relPath);
        if (await ports.statKind(atbPath) !== 'file') {
            return { ok: false, failure: { kind: 'atbMissing', configPath, relPath } };
        }
        const forAtb = await resolveConfigForAtb(ports, atbPath);
        if (!forAtb.ok) return forAtb;
        targets.push(...forAtb.targets);
    }
    return { ok: true, targets };
}

// 原稿 1 つを組版対象にする。出力先は「その原稿の隣の設定ファイル」で決める。
// 組版本体（convertAtb）も原稿の隣の設定を読むので、それと同じ設定を見る。
async function resolveConfigForAtb(
    ports: ResolveBuildTargetsPorts,
    atbPath: string,
): Promise<ResolveResult> {
    const loaded = await ports.configLoader.load(atbPath);
    if (loaded.status === 'invalid') {
        return {
            ok: false,
            failure: {
                kind: 'configInvalid',
                configPath: path.join(path.dirname(atbPath), CONFIG_FILE_NAME),
                reason: loaded.reason,
            },
        };
    }
    return { ok: true, targets: [{ atbPath, outDir: resolveOutDir(atbPath, loaded.config) }] };
}

// ビルド対象を決める。引数の種類で振り分ける。
//   省略                 … カレントディレクトリを指定したものとして扱う
//   ディレクトリ         … 配下の設定ファイルを全て探し、その autoGenerate を対象にする
//   at-book.config.json  … その設定ファイルの autoGenerate だけを対象にする
//   それ以外のファイル   … その原稿だけを対象にする（隣の設定ファイルを使う）
// いずれも「設定ファイルを起点に作品を特定する」同じ操作なので、サブコマンドを
// 増やさず引数の種類で分岐させている。
export async function resolveBuildTargets(
    ports: ResolveBuildTargetsPorts,
    target?: string,
): Promise<ResolveResult> {
    const abs  = path.resolve(target ?? '.');
    const kind = await ports.statKind(abs);

    if (kind === 'missing') {
        return { ok: false, failure: { kind: 'targetMissing', target: target ?? '.' } };
    }

    if (kind === 'directory') {
        const targets: BuildTarget[] = [];
        for (const configDir of await ports.findConfigDirs(abs)) {
            const result = await targetsForConfigDir(ports, configDir);
            if (!result.ok) return result;
            targets.push(...result.targets);
        }
        if (targets.length === 0) {
            return { ok: false, failure: { kind: 'noAutoGenerate', scope: 'tree', location: abs } };
        }
        return { ok: true, targets };
    }

    if (path.basename(abs) === CONFIG_FILE_NAME) {
        const result = await targetsForConfigDir(ports, path.dirname(abs));
        if (result.ok && result.targets.length === 0) {
            return { ok: false, failure: { kind: 'noAutoGenerate', scope: 'config', location: abs } };
        }
        return result;
    }

    return resolveConfigForAtb(ports, abs);
}
