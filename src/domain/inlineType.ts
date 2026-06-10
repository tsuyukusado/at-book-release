// inlineType.ts
// インライン要素（行の中に埋め込まれる）

import { keySymbol } from "./keySymbol"

type inline = {
    keySymbol : typeof keySymbol;
    text : string;
}

export type ruby = inline & {
    ruby : string
}

export type kenten = inline & {
    ruby : '﹅'
}
