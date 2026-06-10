import { CoverSpec } from "../domain/coverSpec";
import { renderCoverSvg } from "../adapter/cover/svgCoverRenderer";

export interface FileWriter {
    write(path: string, content: string): Promise<void>;
}

export interface GenerateCoverTemplatePorts {
    fileWriter: FileWriter;
}

export interface GenerateCoverTemplateInput {
    spec:       CoverSpec;
    outputPath: string;
}

export async function generateCoverTemplate(
    ports: GenerateCoverTemplatePorts,
    input: GenerateCoverTemplateInput,
): Promise<{ svgPath: string }> {
    const svg = renderCoverSvg(input.spec);
    await ports.fileWriter.write(input.outputPath, svg);
    return { svgPath: input.outputPath };
}
