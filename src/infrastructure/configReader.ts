import { readFile } from "fs/promises";
import * as path from "path";
import type { ConfigReader } from "../usecase";
import type { PaperConfig, PaperSize, WritingMode } from "../domain";
import { defaultPaperConfig } from "../domain";

const VALID_PAPER_SIZES: PaperSize[]   = ['a4', 'a5', 'a6', 'b5'];
const VALID_WRITING_MODES: WritingMode[] = ['vertical', 'horizontal'];

export const nodeConfigReader: ConfigReader = {
    async read(atbPath: string): Promise<PaperConfig> {
        const configPath = path.join(path.dirname(atbPath), 'at-book.config.json');
        try {
            const raw    = await readFile(configPath, 'utf-8');
            const parsed = JSON.parse(raw) as Record<string, unknown>;

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

            return { paperSize, writingMode, bodyPaperThicknessMm, coverPaperThicknessMm };
        } catch {
            return defaultPaperConfig;
        }
    }
};
