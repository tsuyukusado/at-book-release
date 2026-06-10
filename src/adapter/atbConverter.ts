import { parse } from "./parser";
import { render } from "./renderer";
import type { AtbConverter } from "../usecase";
import type { PaperConfig } from "../domain";

export const atbConverter: AtbConverter = {
    convert(text: string, config: PaperConfig): string {
        return render(parse(text), config);
    }
};
