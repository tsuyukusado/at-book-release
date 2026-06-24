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
| BLOCK-01 | 空行・空白のみ | `blank` | blockParser.test.ts | ⬜ |
| BLOCK-02 | `＠＠＠` | `pageBreak` | blockParser.test.ts | ⬜ |
| BLOCK-03 | `＠目次` | `toc`（text=目次） | blockParser.test.ts | ⬜ |
| BLOCK-04 | `＠タイトル` | `heading` level 1（先頭＠を除去） | blockParser.test.ts | ⬜ |
| BLOCK-05 | `＠＠小見出し` | `heading` level 2（先頭＠＠を除去） | blockParser.test.ts | ⬜ |
| BLOCK-06 | `・項目` | `listItem` level 1 | blockParser.test.ts | ⬜ |
| BLOCK-07 | `　・項目`（全角空白1個でインデント） | `listItem` level 2（level=indent数+1） | blockParser.test.ts | ⬜ |
| BLOCK-08 | `＠語（るび）` で始まる行 | 見出しではなく `paragraph`（ルビ記法の除外） | blockParser.test.ts | ⬜ |
| BLOCK-09 | `・・…` のように2個目も中黒 | `listItem` にならず `paragraph` | blockParser.test.ts | ⬜ |
| BLOCK-10 | 通常テキスト | `paragraph`（text=行そのまま） | blockParser.test.ts | ⬜ |

## 2. インライン解析 — `adapter/parser/inlineParser.ts` `parseInline`

行内マークアップ → ノード列への分解。

| ID | 条件（入力） | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| INLINE-01 | `＠漢字（かんじ）` | `ruby`（text=漢字, ruby=かんじ） | inlineParser.test.ts | ⬜ |
| INLINE-02 | `＠強調（・）` | `kenten`（ruby が `・` の特例） | inlineParser.test.ts | ⬜ |
| INLINE-03 | `ーー` | `dash` level 2 | inlineParser.test.ts | ⬜ |
| INLINE-04 | `ーーー` | `dash` level 3（連続数=level） | inlineParser.test.ts | ⬜ |
| INLINE-05 | `・・` | `ellipsis` level 2 | inlineParser.test.ts | ⬜ |
| INLINE-06 | `！！` / `？？` / `！？` / `？！` | `tatechuyoko`（`[！？]{2,}` は順不同で2個以上にマッチ） | inlineParser.test.ts | ⬜ |
| INLINE-07 | マークアップ無しのテキスト | `text` 1ノード | inlineParser.test.ts | ⬜ |
| INLINE-08 | テキスト+ルビ+テキスト混在 | 前後テキストが分割され順序保持 | inlineParser.test.ts | ⬜ |

## 3. LaTeX レンダリング — `adapter/renderer/latexRenderer.ts` `render`

ノード列+設定 → LaTeX 文字列。**lualatex は動かさず文字列を検証。**

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| PAPER-01 | paperSize=a4 | プリアンブルに `a4paper`（documentclass と geometry 両方） | latexRenderer.test.ts | ⬜ |
| PAPER-02 | paperSize=a5 | `a5paper` | latexRenderer.test.ts | ⬜ |
| PAPER-03 | paperSize=a6 | `a6paper` | latexRenderer.test.ts | ⬜ |
| PAPER-04 | paperSize=b5 | `b5paper` | latexRenderer.test.ts | ⬜ |
| MODE-01 | writingMode=vertical | 文書クラス `ltjtbook` | latexRenderer.test.ts | ⬜ |
| MODE-02 | writingMode=horizontal | 文書クラス `ltjsbook` | latexRenderer.test.ts | ⬜ |
| MODE-03 | vertical | 綴じ余白 `inner=10mm,outer=20mm` | latexRenderer.test.ts | ⬜ |
| MODE-04 | horizontal | 綴じ余白 `inner=20mm,outer=10mm` | latexRenderer.test.ts | ⬜ |
| REND-01 | 見出し level1 | `\clearpage` + 連番付き見出し | latexRenderer.test.ts | ⬜ |
| REND-02 | 見出し level1（縦書き） | 章番号が漢数字（一,二…） | latexRenderer.test.ts | ⬜ |
| REND-03 | 見出し level1（横書き） | 章番号がアラビア数字 | latexRenderer.test.ts | ⬜ |
| REND-04 | 見出し level2 | `h1-h2`（縦は `・`、横は `-`）形式 | latexRenderer.test.ts | ⬜ |
| REND-05 | 目次ノード | `\tableofcontents` 出力 | latexRenderer.test.ts | ⬜ |
| REND-06 | 段落 | `\noindent\hspace{\parindent}…\par` | latexRenderer.test.ts | ⬜ |
| REND-07 | 空行 | `\vspace{\baselineskip}` | latexRenderer.test.ts | ⬜ |
| REND-08 | 改ページ | `\clearpage` | latexRenderer.test.ts | ⬜ |
| REND-09 | リスト（ネスト） | `\begin{itemize}` の入れ子と `\item` | latexRenderer.test.ts | ⬜ |
| REND-10 | インライン: ルビ | `\ruby{語}{読}` | latexRenderer.test.ts | ⬜ |
| REND-11 | インライン: 圏点 | `\kenten{語}` | latexRenderer.test.ts | ⬜ |
| REND-12 | インライン: ダッシュ | `——`（全角ダッシュ2連） | latexRenderer.test.ts | ⬜ |
| REND-13 | インライン: 三点リーダ level n | `…` を n 回 | latexRenderer.test.ts | ⬜ |
| REND-14 | 縦中横（縦書き） | `\tatechuyoko{…}`、！→!・？→? 変換 | latexRenderer.test.ts | ⬜ |
| REND-15 | 縦中横（横書き） | 変換せず素通し | latexRenderer.test.ts | ⬜ |

## 4. 文字数カウント — `usecase/countChars.ts` `countChars`

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| COUNT-01 | 通常段落 | 文字数を正しく数える | countChars.test.ts | ⬜ |
| COUNT-02 | ルビ `＠語（読み）` | 本文+読みの両方を数える（語+読み） | countChars.test.ts | ⬜ |
| COUNT-03 | 見出し・リスト行 | カウント対象に含む | countChars.test.ts | ⬜ |
| COUNT-04 | 空行・目次・改ページ | カウント対象外（0） | countChars.test.ts | ⬜ |
| COUNT-05 | 複数行の合算 | 全行の合計 | countChars.test.ts | ⬜ |

## 5. 背幅計算 — `domain/coverSpec.ts` `calcSpineWidthMm`

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| SPINE-01 | 160p / 本文0.09 / 表紙0.35 | 背幅 7.9mm | svgCoverRenderer.test.ts | ✅ |
| SPINE-02 | 本文紙厚を変更 | 背幅が連動（0.12→10.3mm） | svgCoverRenderer.test.ts | ✅ |
| SPINE-03 | 表紙紙厚を変更 | 背幅が連動（0.40→8.0mm） | svgCoverRenderer.test.ts | ✅ |
| SPINE-04 | 奇数ページ | `ceil(pageCount/2)` で計算 | coverSpec.test.ts | ⬜ |

## 6. 表紙 SVG — `adapter/cover/svgCoverRenderer.ts` `renderCoverSvg`

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| COVER-01 | paperSize=a6 | キャンバスに実寸 105×148mm が反映（塗り足し3mm込みで算出） | svgCoverRenderer.test.ts | ⬜ |
| COVER-02 | paperSize ごと | a5=148×210 / b5=182×257 等が反映 | svgCoverRenderer.test.ts | ⬜ |
| COVER-03 | spec 文字列 | 紙厚（本文/表紙）が含まれる | svgCoverRenderer.test.ts | ✅ |
| COVER-04 | 横書き（左綴じ） | 左=表紙 / 右=裏表紙、`左綴じ` 表記 | svgCoverRenderer.test.ts | ✅ |
| COVER-05 | 縦書き（右綴じ） | 右=表紙 / 左=裏表紙、`右綴じ` 表記 | svgCoverRenderer.test.ts | ✅ |
| COVER-06 | 背幅 < 5mm | 背ラベルを出力しない | svgCoverRenderer.test.ts | ⬜ |
| COVER-07 | viewBox / width / height | 塗り足し込みの入稿サイズで出力 | svgCoverRenderer.test.ts | ⬜ |

## 7. 設定読み込み — `infrastructure/configReader.ts` `nodeConfigReader`

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| CONF-01 | 正常な config.json | 値を読み取って返す | configReader.test.ts | ⬜ |
| CONF-02 | 不正な paperSize | デフォルト（a6）にフォールバック | configReader.test.ts | ⬜ |
| CONF-03 | 不正な writingMode | デフォルト（horizontal）にフォールバック | configReader.test.ts | ⬜ |
| CONF-04 | 紙厚が 0 以下/数値でない | `undefined` | configReader.test.ts | ⬜ |
| CONF-05 | autoGenerate が配列 | 文字列要素のみ抽出 | configReader.test.ts | ⬜ |
| CONF-06 | autoGenerate が非配列 | `undefined` | configReader.test.ts | ⬜ |
| CONF-07 | ファイル無し / 壊れた JSON | `defaultPaperConfig` を返す | configReader.test.ts | ⬜ |

## 8. 設定探索 — `infrastructure/configFinder.ts` `findConfigDirs`

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| FIND-01 | config.json があるディレクトリ | そのディレクトリを返す | configFinder.test.ts | ⬜ |
| FIND-02 | 入れ子ディレクトリ | 再帰的に全て検出 | configFinder.test.ts | ⬜ |
| FIND-03 | node_modules / .git / dist | スキップする | configFinder.test.ts | ⬜ |

## 9. ログ出力 — `infrastructure/charCountLogger.ts` `appendCharCount`

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| LOG-01 | charDiff 正/負/0 | `+N` / `-N` / `±0` の符号表記 | charCountLogger.test.ts | ⬜ |
| LOG-02 | isNew=true | `(新規)` 表記 | charCountLogger.test.ts | ⬜ |
| LOG-03 | pageCount あり | ページ数行を出力（差分付き） | charCountLogger.test.ts | ⬜ |
| LOG-04 | commitHash あり | コミット行（短縮7桁+メッセージ） | charCountLogger.test.ts | ⬜ |
| LOG-05 | ログファイルが無い | ディレクトリを作って追記 | charCountLogger.test.ts | ⬜ |

## 10. カウント状態 — `infrastructure/countState.ts`

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| STATE-01 | 正常な state ファイル | 読み取って返す | countState.test.ts | ⬜ |
| STATE-02 | キー欠損 / 壊れたファイル | `{pages:{},chars:{}}` のデフォルト | countState.test.ts | ⬜ |
| STATE-03 | write→read 往復 | 同じ内容が復元される | countState.test.ts | ⬜ |

## 11. ユースケース結線（fake ポートで検証）

| ID | 条件 | 期待結果 | テスト | 状態 |
|----|------|----------|--------|------|
| UC-01 | `convertAtbToPdf` | ファイル読込→変換→compile の順で呼ぶ | convertAtbToPdf.test.ts | ⬜ |
| UC-02 | `convertAtbToPdf` の出力パス | `dist/at-book/{base}-honbun.pdf` | convertAtbToPdf.test.ts | ⬜ |
| UC-03 | `convertAtbToPdf` の charCount | 入力本文の文字数を返す | convertAtbToPdf.test.ts | ⬜ |
| UC-04 | `generateCoverTemplate` | fileWriter に SVG を書き、svgPath を返す | generateCoverTemplate.test.ts | ⬜ |

## 12. E2E（lualatex が必要 / `it.skipIf` で保護）

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
