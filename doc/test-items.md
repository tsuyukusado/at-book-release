# テスト項目一覧

at-book の各機能が正しく動くことを検証するためのテスト項目チェックリスト。

- **状態**: ✅ テスト実装済み / ⬜ 未実装 / 🟡 一部のみ
- **テスト名には ID を埋め込む**（例: `it('[PAPER-01] ...', ...)`）。一覧とコードを双方向で追えるようにするため。
- 項目を増やす／直すときは、この表を編集してから「未実装をテスト化して」とキリトに頼む運用。

凡例:
- **L** = レイヤー（domain / adapter / usecase / infra / e2e）
- 「テスト」列はテストを置く想定ファイル。

---

## 1. ブロック解析 — `adapter/parser/blockParser.ts` `parseLine`

入力1行 → ノード種別の判定。

| ID | 条件（入力） | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| BLOCK-01 | 空行・空白のみ | `blank` | blockParser.test.ts | ✅ |
| BLOCK-02 | `＠＠＠` | `pageBreak` | blockParser.test.ts | ✅ |
| BLOCK-03 | `＠目次` | `toc`（text=目次） | blockParser.test.ts | ✅ |
| BLOCK-04 | `＠タイトル` | `heading` level 1（先頭＠を除去） | blockParser.test.ts | ✅ |
| BLOCK-05 | `＠＠小見出し` | `heading` level 2（先頭＠＠を除去） | blockParser.test.ts | ✅ |
| BLOCK-06 | `・項目` | `listItem` level 1 | blockParser.test.ts | ✅ |
| BLOCK-07 | `　・項目`（全角空白1個でインデント） | `listItem` level 2（level=indent数+1） | blockParser.test.ts | ✅ |
| BLOCK-08 | `＠語（るび）` で始まる行 | 見出しではなく `paragraph`（ルビ記法の除外） | blockParser.test.ts | ✅ |
| BLOCK-09 | `・・…` のように2個目も中黒 | `listItem` にならず `paragraph` | blockParser.test.ts | ✅ |
| BLOCK-10 | 通常テキスト | `paragraph`（text=行そのまま） | blockParser.test.ts | ✅ |

## 2. インライン解析 — `adapter/parser/inlineParser.ts` `parseInline`

行内マークアップ → ノード列への分解。

| ID | 条件（入力） | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| INLINE-01 | `＠漢字（かんじ）` | `ruby`（text=漢字, ruby=かんじ） | inlineParser.test.ts | ✅ |
| INLINE-02 | `＠強調（・）` | `kenten`（ruby が `・` の特例） | inlineParser.test.ts | ✅ |
| INLINE-03 | `＠ー` | `dash` level 1（＠＋長音記号の数=level） | inlineParser.test.ts | ✅ |
| INLINE-04 | `＠ーー` | `dash` level 2（連続数=level） | inlineParser.test.ts | ✅ |
| INLINE-04b | `ーー`（＠なし） | `text`（ダッシュにならない） | inlineParser.test.ts | ✅ |
| INLINE-05 | `・・` | `ellipsis` level 2 | inlineParser.test.ts | ✅ |
| INLINE-06 | `！！` / `？？` / `！？` / `？！` | `tatechuyoko`（`[！？]{2,}` は順不同で2個以上にマッチ） | inlineParser.test.ts | ✅ |
| INLINE-07 | マークアップ無しのテキスト | `text` 1ノード | inlineParser.test.ts | ✅ |
| INLINE-08 | テキスト+ルビ+テキスト混在 | 前後テキストが分割され順序保持 | inlineParser.test.ts | ✅ |

## 3. HTML/CSS レンダリング — `adapter/renderer/htmlRenderer.ts` `render`

ノード列+設定 → HTML 文字列（＋ページ用 CSS）。**ブラウザは動かさず文字列を検証。** PDF 組版は Vivliostyle が担う。

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| PAPER-01 | paperSize=a4 | `@page` の `size: 210mm 297mm` | htmlRenderer.test.ts | ✅ |
| PAPER-02 | paperSize=a5 | `size: 148mm 210mm` | htmlRenderer.test.ts | ✅ |
| PAPER-03 | paperSize=a6 | `size: 105mm 148mm` | htmlRenderer.test.ts | ✅ |
| PAPER-04 | paperSize=b5 | `size: 182mm 257mm` | htmlRenderer.test.ts | ✅ |
| MODE-01 | writingMode=vertical | `writing-mode: vertical-rl` を含む | htmlRenderer.test.ts | ✅ |
| MODE-02 | writingMode=horizontal | `vertical-rl` を含まない | htmlRenderer.test.ts | ✅ |
| MODE-03 | vertical | 綴じ代 inner=10mm（recto `@page :left` の margin-right） | htmlRenderer.test.ts | ✅ |
| MODE-04 | horizontal | 綴じ代 inner=20mm（recto `@page :right` の margin-left） | htmlRenderer.test.ts | ✅ |
| REND-01 | 見出し level1 | `break-before:page` + 連番付き `<h1 class="atb-h1">` | htmlRenderer.test.ts | ✅ |
| REND-02 | 見出し level1（縦書き） | 章番号が漢数字（一,二…） | htmlRenderer.test.ts | ✅ |
| REND-03 | 見出し level1（横書き） | 章番号がアラビア数字 | htmlRenderer.test.ts | ✅ |
| REND-04 | 見出し level2 | `h1-h2`（縦は `・`、横は `-`）形式 | htmlRenderer.test.ts | ✅ |
| REND-05 | 目次ノード | `<nav class="atb-toc">` + 各見出しへの `<a href="#id">`（`leader()`+`target-counter` でノンブル） | htmlRenderer.test.ts | ✅ |
| REND-06 | 段落 | `<p class="atb-p">`（`text-indent:1em` で一字下げ） | htmlRenderer.test.ts | ✅ |
| REND-07 | 空行 | `<div class="atb-blank">`（1行アキ） | htmlRenderer.test.ts | ✅ |
| REND-08 | 改ページ | `<div class="atb-pagebreak">`（`break-before:page`） | htmlRenderer.test.ts | ✅ |
| REND-09 | リスト（ネスト） | `<ul class="atb-list">` の入れ子と `<li>` | htmlRenderer.test.ts | ✅ |
| REND-10 | インライン: ルビ | `<ruby>語<rt>読</rt></ruby>` | htmlRenderer.test.ts | ✅ |
| REND-11 | インライン: 圏点 | `<span class="atb-kenten">語</span>`（`text-emphasis` ゴマ点） | htmlRenderer.test.ts | ✅ |
| REND-12 | インライン: ダッシュ level n | `——`（em ダッシュ2連）を n 回 | htmlRenderer.test.ts | ✅ |
| REND-13 | インライン: 三点リーダ level n | `…` を n 回 | htmlRenderer.test.ts | ✅ |
| REND-14 | 縦中横（縦書き） | `<span class="atb-tcy">`（`text-combine-upright`）、！→!・？→? 変換 | htmlRenderer.test.ts | ✅ |
| REND-15 | 縦中横（横書き） | 変換せず素通し（span で包まない） | htmlRenderer.test.ts | ✅ |
| REND-16 | HTML特殊文字 | `<` `>` `&` をエスケープ | htmlRenderer.test.ts | ✅ |
| REND-17 | 最終ページのコロフォン（PDF） | 末尾に `<div class="atb-colophon">`（`running()` で最終ページ脚注へ） | htmlRenderer.test.ts | ✅ |
| REND-18 | 紙面固定 CSS（`@page`・ノンブル・`running()`） | EPUB には出さない | htmlRenderer.test.ts | ✅ |
| FONT-01 | PDF の本文フォント | `@font-face` で同梱フォントを埋め込み、`font-family: "Shippori Mincho", serif` | htmlRenderer.test.ts | ✅ |
| FONT-02 | EPUB の本文フォント | `@font-face` を出さず `font-family: serif`（読者の端末のフォントに委ねる） | htmlRenderer.test.ts | ✅ |

## 4. EPUB の spine 分割 — `adapter/renderer/htmlRenderer.ts` `renderSections`

リフロー型リーダーは CSS の `break-before:page` を尊重しないため、改ページは spine（XHTML 文書）の分割で表現する。

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| SEC-01 | 改ページ無し | 本文は 1 つの spine 文書 | htmlRenderer.test.ts | ✅ |
| SEC-02 | `＠＠＠` | spine が分割され、改ページ用 div は残らない | htmlRenderer.test.ts | ✅ |
| SEC-03 | 大見出し（`＠`） | 新しい spine から始まる | htmlRenderer.test.ts | ✅ |
| SEC-04 | `＠目次` | 前後で分割され、単独の spine になる | htmlRenderer.test.ts | ✅ |
| SEC-05 | 各 spine | 完全な HTML 文書・連番のファイル名 | htmlRenderer.test.ts | ✅ |
| SEC-06 | 目次リンク | 見出しが実在する spine へのクロスファイル参照 | htmlRenderer.test.ts | ✅ |
| SEC-07 | クレジット | 最後の spine に単独で入る（奥付ページ） | htmlRenderer.test.ts | ✅ |
| SEC-08 | 原稿が空 | spine は 0 件にならない（0 件は EPUB として不正） | htmlRenderer.test.ts | ✅ |
| SEC-09 | 空行 div | 中身に `&#160;` を持ち、空ブロックで潰れない | htmlRenderer.test.ts | ✅ |

## 5. 背幅計算 — `domain/coverSpec.ts` `calcSpineWidthMm`

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| SPINE-01 | 160p / 本文0.09 / 表紙0.35 | 背幅 7.9mm | svgCoverRenderer.test.ts | ✅ |
| SPINE-02 | 本文紙厚を変更 | 背幅が連動（0.12→10.3mm） | svgCoverRenderer.test.ts | ✅ |
| SPINE-03 | 表紙紙厚を変更 | 背幅が連動（0.40→8.0mm） | svgCoverRenderer.test.ts | ✅ |
| SPINE-04 | 奇数ページ | `ceil(pageCount/2)` で計算 | coverSpec.test.ts | ✅ |

## 6. 表紙 SVG — `adapter/cover/svgCoverRenderer.ts` `renderCoverSvg`

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| COVER-01 | paperSize=a6 | キャンバスに実寸 105×148mm が反映（塗り足し3mm込みで算出） | svgCoverRenderer.test.ts | ✅ |
| COVER-02 | paperSize ごと | a5=148×210 / b5=182×257 等が反映 | svgCoverRenderer.test.ts | ✅ |
| COVER-03 | spec 文字列 | 紙厚（本文/表紙）が含まれる | svgCoverRenderer.test.ts | ✅ |
| COVER-04 | 横書き（左綴じ） | 左=表紙 / 右=裏表紙、`左綴じ` 表記 | svgCoverRenderer.test.ts | ✅ |
| COVER-05 | 縦書き（右綴じ） | 右=表紙 / 左=裏表紙、`右綴じ` 表記 | svgCoverRenderer.test.ts | ✅ |
| COVER-06 | 背幅 < 5mm | 背ラベルを出力しない | svgCoverRenderer.test.ts | ✅ |
| COVER-07 | viewBox / width / height | 塗り足し込みの入稿サイズで出力 | svgCoverRenderer.test.ts | ✅ |

## 7. 設定読み込み — `infrastructure/configReader.ts` `nodeConfigReader`

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| CONF-01 | 正常な config.json | 値を読み取って返す | configReader.test.ts | ✅ |
| CONF-02 | 不正な paperSize | デフォルト（a6）にフォールバック | configReader.test.ts | ✅ |
| CONF-03 | 不正な writingMode | デフォルト（vertical）にフォールバック | configReader.test.ts | ✅ |
| CONF-04 | 紙厚が 0 以下/数値でない | `undefined` | configReader.test.ts | ✅ |
| CONF-05 | autoGenerate が配列 | 文字列要素のみ抽出 | configReader.test.ts | ✅ |
| CONF-06 | autoGenerate が非配列 | `undefined` | configReader.test.ts | ✅ |
| CONF-07 | ファイル無し / 壊れた JSON | `read` は `defaultPaperConfig` を返す | configReader.test.ts | ✅ |
| CONF-08 | formats | 既知の値のみ採用し重複を除く | configReader.test.ts | ✅ |
| CONF-09 | outDir が文字列 | 前後の空白を落として採用 | configReader.test.ts | ✅ |
| CONF-10 | outDir が空文字・空白のみ・非文字列 | `undefined` | configReader.test.ts | ✅ |
| CONF-11 | `load`: 正常 / ファイル無し / 壊れた JSON | `ok` / `missing` / `invalid`（理由付き）を区別 | configReader.test.ts | ✅ |

## 8. 設定探索 — `infrastructure/configFinder.ts` `findConfigDirs`

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| FIND-01 | config.json があるディレクトリ | そのディレクトリを返す | configFinder.test.ts | ✅ |
| FIND-02 | 入れ子ディレクトリ | 再帰的に全て検出 | configFinder.test.ts | ✅ |
| FIND-03 | node_modules / .git / dist / at-book-out | スキップする | configFinder.test.ts | ✅ |

## 9. 文字数カウント — `usecase/countChars.ts` `countChars`

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| COUNT-01 | 通常段落 | 文字数を正しく数える | countChars.test.ts | ✅ |
| COUNT-02 | ルビ `＠語（読み）` | 本文+読みの両方を数える（語+読み） | countChars.test.ts | ✅ |
| COUNT-03 | 見出し・リスト行 | カウント対象に含む | countChars.test.ts | ✅ |
| COUNT-04 | 空行・目次・改ページ | カウント対象外（0） | countChars.test.ts | ✅ |

## 10. 出力先の解決 — `usecase/resolveOutDir.ts` `resolveOutDir`

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| OUT-01 | outDir 未指定 | `<原稿のフォルダ>/at-book-out` | resolveOutDir.test.ts | ✅ |
| OUT-02 | outDir が相対パス | 原稿のフォルダを基準に解決 | resolveOutDir.test.ts | ✅ |
| OUT-03 | outDir が絶対パス | そのまま使う | resolveOutDir.test.ts | ✅ |
| OUT-04 | 相対パスの原稿 | カレントディレクトリに依存しない | resolveOutDir.test.ts | ✅ |

## 11. ビルド対象の解決 — `usecase/resolveBuildTargets.ts` `resolveBuildTargets`

引数の種類（フォルダ / 設定ファイル / 原稿）で対象を決める。失敗は種類で返し、文言は CLI が持つ。

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| TARGET-01 | ディレクトリ指定 | 配下の設定ファイルを全て集める | resolveBuildTargets.test.ts | ✅ |
| TARGET-02 | `at-book.config.json` 指定 | その設定の autoGenerate だけ | resolveBuildTargets.test.ts | ✅ |
| TARGET-03 | `.atb` 指定 | その原稿だけ（autoGenerate は見ない） | resolveBuildTargets.test.ts | ✅ |
| TARGET-04 | 設定に outDir | 出力先に反映される | resolveBuildTargets.test.ts | ✅ |
| TARGET-05 | 存在しないパス | `targetMissing` | resolveBuildTargets.test.ts | ✅ |
| TARGET-06 | autoGenerate の原稿が無い | `atbMissing` | resolveBuildTargets.test.ts | ✅ |
| TARGET-07 | 壊れた設定ファイル | `configInvalid`（autoGenerate 未設定と区別） | resolveBuildTargets.test.ts | ✅ |
| TARGET-08 | 対象ゼロのディレクトリ | `noAutoGenerate`(tree) | resolveBuildTargets.test.ts | ✅ |
| TARGET-09 | autoGenerate の無い設定ファイル指定 | `noAutoGenerate`(config) | resolveBuildTargets.test.ts | ✅ |
| TARGET-10 | 引数省略 | カレントディレクトリを対象にする | resolveBuildTargets.test.ts | ✅ |

## 12. 設定ファイルの初期生成 — `usecase/initConfig.ts`

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| INIT-01 | 設定ファイルが無い | 既定の内容で書き、パスを返す | initConfig.test.ts | ✅ |
| INIT-02 | 既に設定ファイルがある | 上書きせず `alreadyExists` | initConfig.test.ts | ✅ |
| INIT-03 | フォルダに `.atb` がある | autoGenerate に名前順で並べる | initConfig.test.ts | ✅ |
| INIT-04 | `.atb` が無い | autoGenerate にプレースホルダー | initConfig.test.ts | ✅ |

## 13. ユースケース結線（fake ポートで検証）

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| UC-01 | `convertAtbToPdf` | ファイル読込→変換→compile の順で呼ぶ | convertAtb.test.ts | ✅ |
| UC-02 | `convertAtbToPdf` の出力パス | 渡された outDir 配下の `{base}-honbun.pdf` | convertAtb.test.ts | ✅ |
| UC-03 | `convertAtbToPdf` の charCount | 入力本文の文字数を返す | convertAtb.test.ts | ✅ |
| UC-04 | `generateCoverTemplate` | fileWriter に SVG を書き、svgPath を返す | generateCoverTemplate.test.ts | ✅ |
| UC-05 | `convertAtbToWeb` | outDir 直下の作品フォルダへ話ファイルを書く | convertAtbToWeb.test.ts | ✅ |
| UC-06 | `convertAtbToWeb` の章分割 | 連番付きの章フォルダの下に話ファイル | convertAtbToWeb.test.ts | ✅ |
| UC-07 | `atbConverter` | parse と render を結線し、EPUB は spine 分割まで行う | atbConverter.test.ts | ✅ |

## 14. ファイル入出力 — `infrastructure/fileReader.ts` / `fileWriter.ts`

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| IO-01 | UTF-8 のテキスト | そのまま読む | fileReader.test.ts | ✅ |
| IO-02 | 存在しないファイル | エラーになる | fileReader.test.ts | ✅ |
| IO-03 | 中間ディレクトリが無い | 作ってから書く | fileWriter.test.ts | ✅ |
| IO-04 | 既存ファイル | 上書きする | fileWriter.test.ts | ✅ |

## 15. 組版の起動と後始末 — `infrastructure/vivliostyleRunner.ts`

vivliostyle CLI（＝ヘッドレスブラウザ）は起動せず、コマンドの組み立てとビルドディレクトリの扱いを検証する。

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| RUN-01 | PDF 組版 | 隔離ディレクトリに HTML とフォントを置いて `build -o <出力>` を起動 | vivliostyleRunner.test.ts | ✅ |
| RUN-02 | PDF 組版に成功 | 隔離ディレクトリを片付ける | vivliostyleRunner.test.ts | ✅ |
| RUN-03 | 出力先に既存の `fonts/` | 後始末で巻き込んで消さない | vivliostyleRunner.test.ts | ✅ |
| RUN-04 | PDF 組版に失敗 | 隔離ディレクトリを残し、場所を知らせる | vivliostyleRunner.test.ts | ✅ |
| RUN-05 | `AT_BOOK_CHROME` が実在パス | `--executable-browser` に渡す | vivliostyleRunner.test.ts | ✅ |
| RUN-06 | `AT_BOOK_CHROME` 未指定で失敗 | 指定方法を案内する（指定済みなら重ねない） | vivliostyleRunner.test.ts | ✅ |
| RUN-07 | 投げ直したエラー | 元の例外を `cause` に残す | vivliostyleRunner.test.ts | ✅ |
| RUN-08 | EPUB 組版 | 隔離ディレクトリにセクションと設定を置いて組み、片付ける | vivliostyleRunner.test.ts | ✅ |
| RUN-09 | 縦組みの EPUB | 生成後の OPF に `primary-writing-mode` を注入 | vivliostyleRunner.test.ts | ✅ |
| RUN-10 | 生成済み PDF | ページ数を読む（壊れている・無い場合は `undefined`） | vivliostyleRunner.test.ts | ✅ |

## 16. EPUB の後処理 — `infrastructure/epubPostProcess.ts`

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| EPUB-01 | 縦組み | OPF の metadata に `primary-writing-mode` を注入 | epubPostProcess.test.ts | ✅ |
| EPUB-02 | 再梱包 | `mimetype` を先頭・無圧縮のまま保つ | epubPostProcess.test.ts | ✅ |
| EPUB-03 | 二重呼び出し | 注入は一度だけ（冪等） | epubPostProcess.test.ts | ✅ |
| EPUB-04 | `</metadata>` が無い OPF | 何もせず素通し | epubPostProcess.test.ts | ✅ |

## 17. E2E（Vivliostyle のヘッドレスブラウザが必要 / `it.skipIf` で保護）

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| E2E-01 | サンプル .atb を実変換 | PDF が生成され、ページ数 > 0 | e2e.test.ts | ⬜ |
| E2E-02 | `at-book cover <頁数>` | SVG ファイルが生成される | e2e.test.ts | ⬜ |

---

## 進め方メモ

1. この一覧の ⬜ から着手対象を選ぶ。
2. dev からブランチ＋ワークツリーを切る。
3. テストを書く（テスト名に ID を埋め込む）→ `npm test` を通す。
4. この表の該当行を ✅ に更新。
5. コミット → dev にマージ → ブランチ／ワークツリー削除。
