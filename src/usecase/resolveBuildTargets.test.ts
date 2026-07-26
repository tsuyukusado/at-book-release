import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { resolveBuildTargets } from './resolveBuildTargets';
import type { ResolveBuildTargetsPorts, PathKind } from './resolveBuildTargets';
import type { ConfigLoad } from './configLoad';
import { defaultPaperConfig } from '../domain';

const ROOT = path.resolve('/works');

// 仮想のファイルツリーで振り分けを検証する。
//   files:   実在するファイルの絶対パス
//   dirs:    実在するディレクトリの絶対パス
//   configs: ディレクトリ → そこの at-book.config.json の読み取り結果
function makePorts(tree: {
    files?:   string[];
    dirs?:    string[];
    configs?: Record<string, ConfigLoad>;
}): ResolveBuildTargetsPorts {
    const files = new Set((tree.files ?? []).map(f => path.resolve(f)));
    const dirs  = new Set((tree.dirs  ?? []).map(d => path.resolve(d)));
    const configs = tree.configs ?? {};
    return {
        async statKind(absPath: string): Promise<PathKind> {
            if (dirs.has(absPath))  return 'directory';
            if (files.has(absPath)) return 'file';
            return 'missing';
        },
        async findConfigDirs(baseDir: string): Promise<string[]> {
            return Object.keys(configs)
                .map(d => path.resolve(d))
                .filter(d => d === baseDir || d.startsWith(baseDir + path.sep))
                .sort();
        },
        configLoader: {
            // 呼び出し側は「原稿のパス」を渡すので、その親ディレクトリの設定を返す。
            async load(atbPath: string): Promise<ConfigLoad> {
                return configs[path.dirname(path.resolve(atbPath))]
                    ?? { status: 'missing', config: defaultPaperConfig };
            },
        },
    };
}

const ok = (autoGenerate: string[], outDir?: string): ConfigLoad =>
    ({ status: 'ok', config: { ...defaultPaperConfig, autoGenerate, outDir } });

describe('resolveBuildTargets', () => {
    it('TARGET-01 ディレクトリ指定で配下の設定ファイルを全て集める', async () => {
        const ports = makePorts({
            dirs:  [ROOT],
            files: [`${ROOT}/a/one.atb`, `${ROOT}/b/two.atb`],
            configs: {
                [`${ROOT}/a`]: ok(['one.atb']),
                [`${ROOT}/b`]: ok(['two.atb']),
            },
        });
        const result = await resolveBuildTargets(ports, ROOT);
        expect(result.ok).toBe(true);
        expect(result.ok && result.targets).toEqual([
            { atbPath: path.resolve(`${ROOT}/a/one.atb`), outDir: path.resolve(`${ROOT}/a/at-book-out`) },
            { atbPath: path.resolve(`${ROOT}/b/two.atb`), outDir: path.resolve(`${ROOT}/b/at-book-out`) },
        ]);
    });

    it('TARGET-02 設定ファイル指定はその設定の autoGenerate だけを対象にする', async () => {
        const ports = makePorts({
            dirs:  [ROOT],
            files: [`${ROOT}/a/one.atb`, `${ROOT}/a/at-book.config.json`, `${ROOT}/b/two.atb`],
            configs: {
                [`${ROOT}/a`]: ok(['one.atb']),
                [`${ROOT}/b`]: ok(['two.atb']),
            },
        });
        const result = await resolveBuildTargets(ports, `${ROOT}/a/at-book.config.json`);
        expect(result.ok && result.targets.map(t => t.atbPath))
            .toEqual([path.resolve(`${ROOT}/a/one.atb`)]);
    });

    it('TARGET-03 .atb 指定はその原稿だけを対象にする（autoGenerate は見ない）', async () => {
        const ports = makePorts({
            dirs:  [ROOT],
            files: [`${ROOT}/a/one.atb`, `${ROOT}/a/other.atb`],
            configs: { [`${ROOT}/a`]: ok(['one.atb']) },
        });
        const result = await resolveBuildTargets(ports, `${ROOT}/a/other.atb`);
        expect(result.ok && result.targets.map(t => t.atbPath))
            .toEqual([path.resolve(`${ROOT}/a/other.atb`)]);
    });

    it('TARGET-04 出力先は設定の outDir を反映する', async () => {
        const ports = makePorts({
            dirs:  [ROOT],
            files: [`${ROOT}/a/one.atb`],
            configs: { [`${ROOT}/a`]: ok(['one.atb'], 'seihin') },
        });
        const result = await resolveBuildTargets(ports, ROOT);
        expect(result.ok && result.targets[0]!.outDir).toBe(path.resolve(`${ROOT}/a/seihin`));
    });

    it('TARGET-05 存在しないパスは targetMissing', async () => {
        const result = await resolveBuildTargets(makePorts({}), `${ROOT}/nai`);
        expect(result.ok).toBe(false);
        expect(!result.ok && result.failure).toEqual({ kind: 'targetMissing', target: `${ROOT}/nai` });
    });

    it('TARGET-06 autoGenerate の原稿が実在しなければ atbMissing', async () => {
        const ports = makePorts({
            dirs: [ROOT],
            configs: { [`${ROOT}/a`]: ok(['your-novel.atb']) },
        });
        const result = await resolveBuildTargets(ports, ROOT);
        expect(!result.ok && result.failure).toEqual({
            kind:       'atbMissing',
            configPath: path.join(path.resolve(`${ROOT}/a`), 'at-book.config.json'),
            relPath:    'your-novel.atb',
        });
    });

    it('TARGET-07 壊れた設定ファイルは autoGenerate 未設定と区別して configInvalid', async () => {
        const ports = makePorts({
            dirs: [ROOT],
            configs: {
                [`${ROOT}/a`]: { status: 'invalid', config: defaultPaperConfig, reason: '末尾にカンマがあります' },
            },
        });
        const result = await resolveBuildTargets(ports, ROOT);
        expect(!result.ok && result.failure).toEqual({
            kind:       'configInvalid',
            configPath: path.join(path.resolve(`${ROOT}/a`), 'at-book.config.json'),
            reason:     '末尾にカンマがあります',
        });
    });

    it('TARGET-08 対象がひとつも無いディレクトリは noAutoGenerate(tree)', async () => {
        const ports = makePorts({ dirs: [ROOT], configs: { [`${ROOT}/a`]: ok([]) } });
        const result = await resolveBuildTargets(ports, ROOT);
        expect(!result.ok && result.failure).toEqual({
            kind: 'noAutoGenerate', scope: 'tree', location: ROOT,
        });
    });

    it('TARGET-09 autoGenerate の無い設定ファイル指定は noAutoGenerate(config)', async () => {
        const configPath = path.resolve(`${ROOT}/a/at-book.config.json`);
        const ports = makePorts({
            dirs:  [ROOT],
            files: [configPath],
            configs: { [`${ROOT}/a`]: ok([]) },
        });
        const result = await resolveBuildTargets(ports, configPath);
        expect(!result.ok && result.failure).toEqual({
            kind: 'noAutoGenerate', scope: 'config', location: configPath,
        });
    });

    it('TARGET-10 引数を省略したらカレントディレクトリを対象にする', async () => {
        const cwd = path.resolve('.');
        const ports = makePorts({
            dirs:  [cwd],
            files: [path.join(cwd, 'one.atb')],
            configs: { [cwd]: ok(['one.atb']) },
        });
        const result = await resolveBuildTargets(ports);
        expect(result.ok && result.targets.map(t => t.atbPath)).toEqual([path.join(cwd, 'one.atb')]);
    });
});
