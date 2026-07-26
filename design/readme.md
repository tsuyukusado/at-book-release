# ＠本（at-book）組版 Design System

＠本の**組版 GUI** のためのデザインシステム。
原稿をコピペするか、ファイルをドラッグ＆ドロップで放り込み、設定して組版し、
PDF / EPUB / テキストを受け取る——その一連の画面を作るための部品と規則。

土台になっている CLI は [at-book](https://github.com/tsuyukusado/at-book-release)。
＠マークだけの記法で書いた `.atb` 原稿を、縦書きの印刷用 PDF・EPUB・
投稿サイト向けテキスト・表紙テンプレートに組む Node.js ツール。

---

## この系の一行

**本を書いている画面に見せる。** 紙と墨だけで作り、朱は校正の朱入れとして
ごく少量だけ差す。角を立て、余白を空け、影は紙一枚ぶんに留める。

---

## 三つの色しか持たない

| 系統 | 役割 | 使いどころ |
|---|---|---|
| **墨** `--sumi-*` | 文字・罫・主ボタンのベタ | 九段。純黒 `#000` は使わない |
| **紙** `--washi-*` | 面 | 四段。純白 `#fff` は使わない。生成りの温度を残す |
| **朱** `--shu-*` | 差し色 | 四段。**画面の 2% を超えない** |

### 朱を使ってよい場所

- 失敗の状態表示（`--failed`）とエラー帯の左縦罫
- ドラッグが領域に入った瞬間の枠（`.atb-drop--over`）
- フォーカス輪（`--shadow-focus`）
- 選択中タブの下線
- 戻せない操作のボタン（`.atb-btn--danger`）

### 使ってはいけない場所

主ボタンのベタ塗り（墨で塗る）・見出しの着色・面の背景色・
グラデーション・発光。**朱が増えたらデザインが壊れているサイン。**

夜（`[data-theme="dark"]` / `prefers-color-scheme: dark`）では紙と墨を反転させ、
沈む朱だけ明度を上げる。

---

## 書体の三分担

| 用途 | 書体 | トークン |
|---|---|---|
| 見出し・書名・**原稿プレビュー** | Shippori Mincho | `--font-display` / `--font-manuscript` |
| UI 操作系（ボタン・入力・ラベル） | Zen Kaku Gothic New | `--font-body` |
| パス・ビルドログ・数値 | JetBrains Mono | `--font-mono` |

＠本が組む紙面そのものが明朝なので、GUI の見出しと原稿枠も明朝で通す。
これが「本を書いている感」の主たる出どころ。操作系だけゴシックに落として可読性を確保する。

強調は級数を上げるのではなく、**明朝に替えるか字間を空けて**作る。

> **注意 —** このシステムは Google Fonts CDN から書体を読んでいる。
> ＠本リポジトリ本体は `fonts/` に Shippori Mincho の実体（TTF）を同梱しているので、
> 実装に落とすときは CDN ではなくそちらを `@font-face` で読むこと。

---

## 形

- **角** — `--r-xs 2px` 〜 `--r-lg 6px`。本と活字は角が立っている。
  `--r-pill` はタグと状態ドットのみ、ボタンには使わない。
- **余白** — 4px 基準の 9 段。版面設計と同じで、余白そのものが意匠。詰めるより空ける。
- **影** — 黒ではなく墨で落とす。`--shadow-page` を許すのは紙面プレビューだけ。
- **動き** — 90〜260ms、跳ねない。紙をめくる程度。`prefers-reduced-motion` で 0 に落とす。

---

## 収録物

### `tokens/`
`fonts.css` · `colors.css` · `typography.css` · `spacing.css` · `effects.css`

### `components/components.css`
`atb-` 接頭辞のコンポーネント一式。JS なしで状態が出せるものは
`:checked` と修飾クラスで表現している。

| クラス | 中身 |
|---|---|
| `.atb-btn` | primary / secondary / ghost / danger ・ sm / md / lg / block |
| `.atb-field` `.atb-input` | ラベル・ヒント・エラー・単位付き（mm） |
| `.atb-seg` | `paperSize`（A4/A5/A6/B5）と `writingMode`（縦/横） |
| `.atb-fmt` | `formats` の複数選択（PDF / EPUB / WEB） |
| `.atb-drop` | ドロップ領域。idle / over / filled / reject |
| `.atb-paste` | 原稿貼り付け枠（明朝・行送り 1.95）＋ 字数帯 |
| `.atb-files` `.atb-file` | 受理した原稿の一覧。`autoGenerate` の順序 |
| `.atb-tabs` `.atb-tab` | 貼り付け ⇄ ファイル |
| `.atb-status` | idle / running / done / failed |
| `.atb-callout` | 注意帯。通常 / エラー |
| `.atb-log` | ビルドログ。等幅・時刻つき |
| `.atb-artifact` | 成果物の行 |
| `.atb-preview` | 紙面。縦組み・ルビ・圏点・縦中横・ノンブル |

### `templates/typeset-app/TypesetApp.dc.html`
組版画面の全体像。タブ切り替えと「組版する」の状態遷移だけ動く。

### `guidelines/*.card.html`
色・級数・余白の見本カード。

---

## 使い方

```css
@import url('styles.css');   /* tokens + components を全部読む */
```

```html
<button class="atb-btn atb-btn--primary atb-btn--lg atb-btn--block">組版する</button>
```

カードは素の HTML/CSS で自己完結している（React バンドルに依存しない）。
そのままブラウザで開いても崩れない。

---

## ＠本の設定との対応

GUI のコントロールは `at-book.config.json` の項目にそのまま対応する。

| UI | 設定キー | 値 |
|---|---|---|
| 用紙 | `paperSize` | `a4` / `a5` / `a6`（既定） / `b5` |
| 組方向 | `writingMode` | `vertical`（既定） / `horizontal` |
| 出力形式 | `formats` | `pdf` / `epub` / `web`（未指定なら pdf のみ） |
| 出力先 | `outDir` | 既定 `at-book-out` |
| 原稿一覧の順序 | `autoGenerate` | ファイル名の配列 |
| 本文用紙の厚さ | `bodyPaperThicknessMm` | 数値（背幅計算用） |
| 表紙用紙の厚さ | `coverPaperThicknessMm` | 数値（背幅計算用） |

---

## 設計上の判断

- **進捗バーを置かない。** Vivliostyle の所要時間は読めないので、嘘の進捗率を出さない。
  代わりに明滅するドットとログ行で「動いている」ことだけ伝える。
- **「設定が無い」と「設定が壊れている」を潰さない。** ＠本の `ConfigLoad` は
  `missing` / `invalid` を区別する。UI もそれぞれ別の文面で出し、直すべき行を指す。
- **ドロップ領域は受理したら帯まで縮む。** 主役をファイル一覧に譲る。
- **原稿枠だけ明朝・行送り 1.95。** 書いている最中の見え方を組み上がりに寄せる。

---

## 未確定 / 引き継ぎ

- **アイコンセットが無い。** 現状は `＠` `×` と状態ドットだけで通している。
  実装で本当に必要になったら、線の均一な丸みのある輪郭セットを一つ選ぶこと。
- **アプリの器が未定。** Electron / Tauri / ローカル Web のどれで包むかは決めていない。
  このシステムは素の CSS なので、どれでも載る。
- **プレビューの実データ連携が未定。** 紙面カードは静的な見本。
  実際に PDF の該当頁を出すのか、HTML を再現するのかは実装時の判断。
