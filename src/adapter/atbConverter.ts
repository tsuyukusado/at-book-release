import { parse } from "./parser";
import { render, renderSections } from "./renderer";
import type { AtbConverter } from "../usecase";
import type { PaperConfig } from "../domain";

export const atbConverter: AtbConverter = {
    convert(text: string, config: PaperConfig, format: 'pdf' | 'epub' = 'pdf'): string {
        return render(parse(text), config, format);
    },
    // EPUB は改ページ境界で spine（XHTML）を分割するため、複数の HTML 文書を返す。
    convertEpubSections(text: string, config: PaperConfig): string[] {
        return renderSections(parse(text), config);
    }
};
