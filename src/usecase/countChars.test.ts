import { describe, it, expect } from 'vitest';
import { countChars } from './countChars';

describe('countChars', () => {
    it('段落の文字数を数える', () => {
        expect(countChars('あいうえお')).toBe(5);
    });

    it('ルビ記法は語と読みの両方を数える（記号は数えない）', () => {
        // ＠漢字（かんじ） → 漢字かんじ = 5文字
        expect(countChars('＠漢字（かんじ）')).toBe(5);
    });

    it('空行・目次・改ページは数えない', () => {
        expect(countChars('あ\n\n＠目次\n＠＠＠\nいう')).toBe(3);
    });

    it('見出しと箇条書きは本文として数える', () => {
        // ＠章 → 章(1) / ・項目 → 項目(2)
        expect(countChars('＠章\n・項目')).toBe(3);
    });
});
