import { parse } from "./parser";
import { render, renderSections } from "./renderer";
import type { AtbConverter } from "../usecase";
import type { PaperConfig, EpubSection } from "../domain";

export const atbConverter: AtbConverter = {
    convert(text: string, config: PaperConfig, format: 'pdf' | 'epub' = 'pdf'): string {
        return render(parse(text), config, format);
    },
    // EPUB は改ページ境界で spine（XHTML）を分割するため、ファイル名付きの複数文書を返す。
    convertEpubSections(text: string, config: PaperConfig): EpubSection[] {
        return renderSections(parse(text), config);
    }
};
