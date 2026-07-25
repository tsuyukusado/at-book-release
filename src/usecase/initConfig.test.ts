import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { buildDefaultConfigContent, initConfig } from './initConfig';
import type { InitConfigPorts } from './initConfig';

describe('buildDefaultConfigContent', () => {
    it('引数が無ければ autoGenerate にプレースホルダーを入れる', () => {
        const content = buildDefaultConfigContent();
        const parsed = JSON.parse(content);

        expect(parsed).toEqual({
            paperSize:    'a6',
            writingMode:  'vertical',
            autoGenerate: ['your-novel.atb'],
        });
        expect(content.endsWith('\n')).toBe(true);
    });

    it('.atb ファイル名を渡すと autoGenerate にそのまま使う', () => {
        const content = buildDefaultConfigContent(['a.atb', 'b.atb']);
        const parsed = JSON.parse(content);

        expect(parsed.autoGenerate).toEqual(['a.atb', 'b.atb']);
    });
});

function makePorts(opts: { existing?: string[]; atbFiles?: string[] } = {}) {
    const written: { path: string; content: string }[] = [];
    const existing = new Set((opts.existing ?? []).map(p => path.resolve(p)));
    const ports: InitConfigPorts = {
        async exists(absPath) { return existing.has(absPath); },
        async listAtbFileNames() { return opts.atbFiles ?? []; },
        fileWriter: { async write(p, content) { written.push({ path: p, content }); } },
    };
    return { ports, written };
}

describe('initConfig', () => {
    it('INIT-01 指定フォルダに設定ファイルを書き、そのパスを返す', async () => {
        const { ports, written } = makePorts();
        const result = await initConfig(ports, '/works/doc');

        expect(result.ok).toBe(true);
        expect(result.configPath).toBe(path.resolve('/works/doc/at-book.config.json'));
        expect(written).toHaveLength(1);
        expect(JSON.parse(written[0]!.content).autoGenerate).toEqual(['your-novel.atb']);
    });

    it('INIT-02 既に設定ファイルがあれば上書きせず alreadyExists', async () => {
        const configPath = '/works/doc/at-book.config.json';
        const { ports, written } = makePorts({ existing: [configPath] });
        const result = await initConfig(ports, '/works/doc');

        expect(result).toEqual({ ok: false, reason: 'alreadyExists', configPath: path.resolve(configPath) });
        expect(written).toHaveLength(0);
    });

    it('INIT-03 フォルダに .atb があれば autoGenerate に並べる（名前順）', async () => {
        const { ports, written } = makePorts({ atbFiles: ['b.atb', 'a.atb'] });
        const result = await initConfig(ports, '/works/doc');

        expect(result.ok && result.atbFileNames).toEqual(['a.atb', 'b.atb']);
        expect(JSON.parse(written[0]!.content).autoGenerate).toEqual(['a.atb', 'b.atb']);
    });
});
