// brockType.ts
// ブロック要素（改行で区切る）

import { keySymbol } from "./keySymbol"

export type block = {
    keySymbol : typeof keySymbol;
    text : string
}

export type heading = block & {
    level : 1|2
}

export type index = block & {
    text : '目次'
}

export type listItem = {
    bullet : '・';
    text : string;
    level : number;
}