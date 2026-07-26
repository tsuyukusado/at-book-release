import { describe, it, expect } from 'vitest';
import { parseLine } from './blockParser';

describe('parseLine の行種別判定', () => {
    it('空行は blank になる', () => {
        expect(parseLine('')).toEqual({ kind: 'blank' });
    });

    it('空白（全角スペース含む）だけの行も blank になる', () => {
        expect(parseLine('  ')).toEqual({ kind: 'blank' });
        expect(parseLine('　　')).toEqual({ kind: 'blank' });
    });

    it('＠＠＠ は pageBreak になる', () => {
        expect(parseLine('＠＠＠')).toEqual({ kind: 'pageBreak' });
    });

    it('＠目次 は toc（text=目次）になる', () => {
        expect(parseLine('＠目次')).toMatchObject({ kind: 'toc', text: '目次' });
    });

    it('＠タイトル は heading level 1（先頭の＠を除去）になる', () => {
        expect(parseLine('＠タイトル')).toMatchObject({ kind: 'heading', level: 1, text: 'タイトル' });
    });

    it('＠＠小見出し は heading level 2（先頭の＠＠を除去）になる', () => {
        expect(parseLine('＠＠小見出し')).toMatchObject({ kind: 'heading', level: 2, text: '小見出し' });
    });

    it('・項目 は listItem level 1 になる', () => {
        expect(parseLine('・買い物')).toMatchObject({ kind: 'listItem', text: '買い物', level: 1 });
    });

    it('全角スペースのインデントで listItem の level が深くなる', () => {
        expect(parseLine('　・牛乳')).toMatchObject({ kind: 'listItem', text: '牛乳', level: 2 });
        expect(parseLine('　　・低脂肪')).toMatchObject({ kind: 'listItem', text: '低脂肪', level: 3 });
    });

    it('＠語（るび） で始まる行は見出しではなく paragraph（ルビ記法の除外）', () => {
        expect(parseLine('＠漢字（かんじ）を読む')).toMatchObject({ kind: 'paragraph', text: '＠漢字（かんじ）を読む' });
    });

    it('＠ー で始まる行は見出しではなく paragraph（ダッシュ記法の除外）', () => {
        expect(parseLine('＠ーそれから')).toMatchObject({ kind: 'paragraph', text: '＠ーそれから' });
    });

    it('2文字目も中黒（・・…）なら listItem にならず paragraph（三点リーダ記法）', () => {
        expect(parseLine('・・つづく')).toMatchObject({ kind: 'paragraph', text: '・・つづく' });
    });

    it('通常のテキストは paragraph（text は行そのまま）になる', () => {
        expect(parseLine('ふつうの文章です。')).toMatchObject({ kind: 'paragraph', text: 'ふつうの文章です。' });
    });
});
