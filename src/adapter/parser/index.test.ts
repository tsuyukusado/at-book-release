import { describe, it, expect } from "vitest";
import { parse } from "./index";

describe("parse: 改行コードの正規化", () => {
    it("LF 区切りで ＠目次 が目次ノードになる", () => {
        const nodes = parse("＠章\n＠目次\n本文");
        expect(nodes.map(n => n.kind)).toEqual(["heading", "toc", "paragraph"]);
    });

    it("CRLF でも ＠目次 が見出しに化けず目次ノードになる（Windows 回帰）", () => {
        const nodes = parse("＠章\r\n＠目次\r\n本文");
        expect(nodes.map(n => n.kind)).toEqual(["heading", "toc", "paragraph"]);
    });

    it("CRLF でも ＠＠＠ が改ページノードになる", () => {
        const nodes = parse("本文A\r\n＠＠＠\r\n本文B");
        expect(nodes.map(n => n.kind)).toEqual(["paragraph", "pageBreak", "paragraph"]);
    });

    it("CRLF の見出しテキストに末尾の \\r が残らない", () => {
        const [heading] = parse("＠第一章\r\n");
        expect(heading).toMatchObject({ kind: "heading", level: 1, text: "第一章" });
    });

    it("単独 CR（旧 Mac）区切りも分割できる", () => {
        const nodes = parse("＠章\r＠目次\r本文");
        expect(nodes.map(n => n.kind)).toEqual(["heading", "toc", "paragraph"]);
    });
});
