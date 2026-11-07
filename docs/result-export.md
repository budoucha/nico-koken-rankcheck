# 解析結果JSONの形式

Lite版の「解析結果JSONを保存」は、現在開いている解析結果全体をUTF-8の `.koken-result.json` としてダウンロードします。現在のフィルタ・検索・ソート・選択状態によって対象を絞り込みません。LocalStorageへの履歴保存に失敗した結果も出力できます。

「共通除外リストを含める」は既定でONです。ONの場合、現在の結果にないキーも含めた共通リスト全体を同梱します。OFFの場合は `excludedKeys` プロパティを省略します。ONで除外0件の場合は `excludedKeys: []` を出力します。共通リストを読み取れない場合、ONでのエクスポートは失敗を通知し、空のリストで代用しません。OFFで解析結果だけを出力することはできます。

## スキーマバージョン1

| プロパティ | 内容 |
|---|---|
| `format` | 固定値 `"koken-result"` |
| `schemaVersion` | 数値 `1` |
| `exportedAt` | エクスポート日時のISO 8601文字列。入力HTMLの取得日時を表すものではありません。 |
| `result` | 以下の解析結果オブジェクト |
| `excludedKeys` | 任意の文字列配列。共通除外リスト全体のキーを重複なし・文字列順で格納します。省略は「除外情報を含めなかった」、空配列は「除外0件」を意味します。 |

`result` は次の情報を保持します。

| プロパティ | 内容 |
|---|---|
| `contentsNames` | contents入力元の表示名の配列 |
| `rewardName` | reward入力元の表示名 |
| `summary` | 全解析項目の件数 `total`、3位以内の件数 `inTop3`、4位以下の件数 `missing`。除外済みを含みます。 |
| `contentsRows` | 共通coreの `CONTENTS_CSV_HEADER` の各列と `sourceName` を保持する全入力行 |
| `items` | 全結果項目。`index`, `globalIndex`, `type`, `typeLabel`, `title`, `url`, `contentId`, `numericId`, `totalContribution`, `key`, `inferredNicoadUrl`, `nicoadUrl`, `thumbnail`, `rank`, `inTop3` を保持します。旧履歴で欠けていた値を推測で補完しません。 |
| `missingRows` | 全結果項目から `core.createMissingRows()` で生成する4位以下の行。除外済みも含みます。 |
| `top3Ranks` | `[コンテンツキー, 順位]` の配列。Mapのエントリ形式です。 |

コンテンツキーは `seiga:数値ID` / `video:数値ID` です。結果の元の表示順は `index` / `globalIndex` で保持します。サムネイルの扱いは履歴保存と共通で、20,000文字を超えるData URLは種別ごとのリモートサムネイルURLに置き換えます。元のアップロードHTML本文や、一時的な画面操作状態は含めません。

この形式は元HTMLなしで結果表示・CSV/TXT・コピーを再構成するためのものです。履歴内の旧 `deletedKeys` は出力せず、除外状態は任意のトップレベル `excludedKeys` に分離します。キーだけの項目を結果へ追加したり、貢数・順位を補完したりしません。

現時点ではJSONのインポート機能はありません。将来インポートを実装する際は、同梱リストを既存の共通リストへ追加するか、置き換えるかを選べる仕様とします。`excludedKeys` が省略されたファイルで既存リストを消さないことが必要です。

## ブラウザ内の共通除外リスト

LocalStorageの `koken-lite-excluded-keys-v1` にキーのJSON配列だけを保存します。解析履歴の `koken-lite-result-history-v1` から独立しており、履歴の削除や件数上限の影響を受けません。

共通リストの保存キーが未作成（`getItem()` が `null`）の場合だけ、履歴の先頭にある最新の有効なエントリの `deletedKeys` から有効なキーを取り込みます。最新エントリに除外情報がない場合や履歴がない場合は、空配列を保存します。古い履歴との合併や遡及は行いません。既存の空配列は優先され、解除したキーが旧履歴から再登録されることはありません。JSONの破損、配列以外の値、不正なキー、読み取り不能は未作成と区別して通知し、旧履歴で上書きしません。
