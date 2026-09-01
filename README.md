# ニコニ貢献ランクチェッカー

ニコニ貢献の「貢献したコンテンツ」と「貢献成績」ページを保存したHTMLから、コンテンツごとにランキング3位以内に入っているかを確認するためのローカルツールです。

現在は静画と動画に対応しています。

## lite版

サーバを起動せずにブラウザだけで使うlite版は `docs/index.html` です。GitHub Pagesでは `docs/` を公開元にする想定です。

ローカルで試す場合は、次を直接開きます。

```text
docs/index.html
```

lite版では、contents HTMLとreward HTMLをページ上で選択すると、その場で結果を表示します。解析済みの実行結果はブラウザのLocalStorageに保存され、履歴から開き直せます。CSV/TXTはブラウザからダウンロードできます。サーバ側の `input/` 保存、`result.html` 生成、保存HTMLに付属するローカルサムネイルフォルダの自動探索は行いません。アップロードしたHTML本文はLocalStorageに保存しません。

Node版とlite版の入力画面には、HTML取得ブックマークレット用のボタンがあります。クリックするとブックマークレットURLをコピーし、ブックマークバーへドラッグすると登録できます。保存したいニコニ貢献のcontents/rewardページを開いてから、登録したブックマークレットを呼び出すか、アドレスバーで実行すると入力用HTMLを保存できます。アドレスバーに貼り付けて使う場合は、ブラウザの保護機能で `javascript:` が消えることがあるため、先頭の `javascript:` を手入力してから続きのURLを貼り付けてください。ブックマークレットは表示中のHTMLを取得する通常版と、自動読み込み後にHTMLを取得する版を選べます。

## 使い方

### 1. サーバを起動する

```sh
npm start
```

または `start.bat` を実行します。`npm start` と `start.bat` では開発用の `dev-server.js` が起動し、ファイル変更時に開いているブラウザページも自動更新されます。

ライブリロードなしでアプリケーションサーバーだけを起動したい場合は、次を使います。

```sh
npm run start:plain
```

起動後、ブラウザで次を開きます。

```text
http://localhost:8787/
```

### 2. 入力HTMLを保存する

サーバ画面のボタンから、それぞれのページを開きます。

- `contentsを開く`: `https://koken.nicovideo.jp/supporter/contents`
- `rewardを開く`: `https://koken.nicovideo.jp/supporter/reward`

contentsページは、対象のデータ種別で絞り込んだ状態で保存します。例えば、静画を調べる場合は `静画のみ表示`、動画を調べる場合は `動画のみ表示` の状態で保存します。

各ページを必要なところまで読み込んだあと、ブラウザでHTMLとして保存します。保存名は既定の `サポーター - ニコニ貢献.html` のままで構いません。

### 3. 入力HTMLを取り込む

サーバ画面で、保存したHTMLを対応する欄からアップロードします。

- contentsページのHTML: `contents HTMLを取り込む`
- rewardページのHTML: `reward HTMLを取り込む`

アップロードされたファイルは、どちらの取り込み口を使ったかとcontentsのデータ種別で次のように保存されます。

- `input/contents-seiga-YYYYMMDD-HHMMSS.html`
- `input/contents-video-YYYYMMDD-HHMMSS.html`
- `input/reward-YYYYMMDD-HHMMSS.html`

保存前に簡単な検証を行い、contents/rewardとして必要な情報を抽出できないHTMLは取り込みません。contentsはHTML内の `静画のみ表示` / `動画のみ表示` などからデータ種別を判定します。

### 4. HTMLを生成する

サーバ画面で `HTMLを再生成` を押します。保存済みの各データ種別ごとの最新 `input/contents-*.html` と、最新の `input/reward*.html` を使って、プロジェクト直下に `result.html` を生成します。

コマンドで生成する場合は次を実行します。

```sh
node generate.js
```

または `generate.bat` を実行します。

## 出力ファイル

- `result.html`: 確認用HTML。フィルタ、検索、順位/獲得貢ソート、広告画面へのリンクを含みます。
- `result-contents.csv`: contentsページから抽出したコンテンツ一覧。
- `result-not-in-top3.csv`: rewardページの3位以内リストに見つからなかったコンテンツ一覧。
- `result-top3-ranks.txt`: rewardページから抽出したコンテンツIDと順位。

## result.html の機能

- デフォルトでは `4位以下` のコンテンツのみ表示。
- フィルタ: `4位以下`, `すべて`, `3位以内`, `3位`, `2位`, `1位`
- データ種別フィルタ: `全種別`, `静画`, `動画`
- ソート: `元の順番`, `順位が高い順`, `順位が低い順`, `獲得貢が少ない順`, `獲得貢が多い順`
- タイトルまたはコンテンツIDで検索。
- `選択する` から選択モードに移行し、表示中のコンテンツを個別または一括で選択可能。選択モード中は `選択中をコピー` で選択したコンテンツだけをコピーできます。
- 表示中の結果を、スプレッドシートに貼り付けやすいタブ区切り形式でクリップボードにコピー可能。列は `id`, `タイトル`, `コンテンツのURL`, `獲得貢`, `広告画面のURL`。
- 各コンテンツから `広告画面` と元コンテンツに直接移動可能。
- `入力ファイルを取り込む` からサーバ画面へ戻れます。

## Git管理

入力ファイルと生成物は `.gitignore` の対象です。

- `input/`
- `assets/thumbs/`
- `result.html`
- `result-*.csv`
- `result-*.txt`

リポジトリには、スクリプトやREADMEなど運用に必要なファイルだけを含める想定です。
