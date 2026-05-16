# 貢献ランクチェッカー

ニコニ貢献の「貢献したコンテンツ」と「貢献成績」ページを保存したHTMLから、静画ごとに「ぶどう茶」が広告主ランキング3位以内に入っているかを確認するためのローカルツールです。

## 使い方

### 1. サーバを起動する

```sh
node server.js
```

または `start.bat` を実行します。

起動後、ブラウザで次を開きます。

```text
http://localhost:8787/
```

### 2. 入力HTMLを保存する

サーバ画面のボタンから、それぞれのページを開きます。

- `contentsを開く`: `https://koken.nicovideo.jp/supporter/contents`
- `rewardを開く`: `https://koken.nicovideo.jp/supporter/reward`

各ページを必要なところまで読み込んだあと、ブラウザでHTMLとして保存します。保存名はどちらも既定の `サポーター - ニコニ貢献.html` のままで構いません。

### 3. 入力HTMLを取り込む

サーバ画面で、保存したHTMLを対応する欄からアップロードします。

- contentsページのHTML: `contents HTMLを取り込む`
- rewardページのHTML: `reward HTMLを取り込む`

アップロードされたファイルは、どちらの取り込み口を使ったかで次のように保存されます。

- `input/contents-YYYYMMDD-HHMMSS.html`
- `input/reward-YYYYMMDD-HHMMSS.html`

保存前に簡単な検証を行い、contents/rewardとして必要な情報を抽出できないHTMLは取り込みません。

### 4. HTMLを生成する

サーバ画面で `HTMLを再生成` を押します。最新の `input/contents*.html` と `input/reward*.html` を使って、プロジェクト直下に `result.html` を生成します。

コマンドで生成する場合は次を実行します。

```sh
node generate.js
```

または `generate.bat` を実行します。

## 出力ファイル

- `result.html`: 確認用HTML。フィルタ、検索、順位ソート、広告画面へのリンクを含みます。
- `result-contents.csv`: contentsページから抽出した先頭500件の静画一覧。
- `result-not-in-top3.csv`: rewardページの3位以内リストに見つからなかった静画一覧。
- `result-top3-seiga-ranks.txt`: rewardページから抽出した静画IDと順位。

## result.html の機能

- デフォルトでは `4位以下` の静画のみ表示。
- フィルタ: `4位以下`, `すべて`, `3位以内`, `3位`, `2位`, `1位`
- ソート: `元の順番`, `順位順`
- タイトルまたは静画IDで検索。
- 各静画から `広告画面` と `静画` に直接移動可能。
- `入力ファイルを取り込む` からサーバ画面へ戻れます。

## Git管理

入力ファイルと生成物は `.gitignore` の対象です。

- `input/`
- `assets/thumbs/`
- `result.html`
- `result-*.csv`
- `result-*.txt`

リポジトリには、スクリプトやREADMEなど運用に必要なファイルだけを含める想定です。
