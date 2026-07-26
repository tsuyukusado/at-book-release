import { readFile } from "fs/promises";
import * as path from "path";
import type { ConfigReader, ConfigLoader, ConfigLoad } from "../usecase";
import type { PaperConfig, PaperSize, WritingMode, OutputFormat } from "../domain";
import { defaultPaperConfig } from "../domain";

const VALID_PAPER_SIZES: PaperSize[]   = ['a4', 'a5', 'a6', 'b5'];
const VALID_WRITING_MODES: WritingMode[] = ['vertical', 'horizontal'];
const VALID_FORMATS: OutputFormat[]      = ['pdf', 'epub', 'web'];

// 読み取れた JSON から設定を組む。値の検証はここに閉じる。
// 個々の項目は不正でも既定値へ落とす（設定ファイル全体を無効にはしない）。
function toPaperConfig(parsed: Record<string, unknown>): PaperConfig {
    const paperSize   = VALID_PAPER_SIZES.includes(parsed.paperSize as PaperSize)
        ? parsed.paperSize as PaperSize
        : defaultPaperConfig.paperSize;
    const writingMode = VALID_WRITING_MODES.includes(parsed.writingMode as WritingMode)
        ? parsed.writingMode as WritingMode
        : defaultPaperConfig.writingMode;

    const rawBody  = parsed.bodyPaperThicknessMm;
    const rawCover = parsed.coverPaperThicknessMm;
    const bodyPaperThicknessMm  = typeof rawBody  === 'number' && rawBody  > 0 ? rawBody  : undefined;
    const coverPaperThicknessMm = typeof rawCover === 'number' && rawCover > 0 ? rawCover : undefined;

    const rawAutoGenerate = parsed.autoGenerate;
    const autoGenerate = Array.isArray(rawAutoGenerate)
        ? rawAutoGenerate.filter((v): v is string => typeof v === 'string')
        : undefined;

    // 生成フォーマット。既知の値のみ採用し重複を除く。
    // 有効な指定が無ければ undefined（＝呼び出し側で pdf のみにフォールバック）。
    const rawFormats = parsed.formats;
    const formats = Array.isArray(rawFormats)
        ? [...new Set(rawFormats.filter((v): v is OutputFormat => VALID_FORMATS.includes(v as OutputFormat)))]
        : undefined;

    // 出力先。空文字・空白だけの指定は「未指定」と同じ扱いにする
    // （そのまま使うと原稿と同じフォルダに成果物を撒いてしまうため）。
    const rawOutDir = parsed.outDir;
    const outDir = typeof rawOutDir === 'string' && rawOutDir.trim() !== '' ? rawOutDir.trim() : undefined;

    return { paperSize, writingMode, bodyPaperThicknessMm, coverPaperThicknessMm, autoGenerate, formats: formats && formats.length > 0 ? formats : undefined, outDir };
}

async function loadConfig(atbPath: string): Promise<ConfigLoad> {
    const configPath = path.join(path.dirname(atbPath), 'at-book.config.json');

    let raw: string;
    try {
        raw = await readFile(configPath, 'utf-8');
    } catch {
        // 設定ファイルが無いのは異常ではない（.atb を直接指定した場合など）。
        return { status: 'missing', config: defaultPaperConfig };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        return { status: 'invalid', config: defaultPaperConfig, reason: err instanceof Error ? err.message : String(err) };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { status: 'invalid', config: defaultPaperConfig, reason: '全体が { } のオブジェクトになっていません' };
    }

    return { status: 'ok', config: toPaperConfig(parsed as Record<string, unknown>) };
}

export const nodeConfigReader: ConfigReader & ConfigLoader = {
    // 設定が読めなくても既定値で組版は続ける。読めたかどうかを気にする呼び出し側は load を使う。
    async read(atbPath: string): Promise<PaperConfig> {
        return (await loadConfig(atbPath)).config;
    },
    load: loadConfig,
};
