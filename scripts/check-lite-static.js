const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const docsDir = path.join(root, "docs");
const srcCorePath = path.join(root, "src", "core", "koken-core.js");
const docsCorePath = path.join(docsDir, "koken-core.js");
const srcBookmarkletPath = path.join(root, "src", "core", "bookmarklet.js");
const docsBookmarkletPath = path.join(docsDir, "bookmarklet.js");
const serverPath = path.join(root, "server.js");
const generatePath = path.join(root, "generate.js");
const indexPath = path.join(docsDir, "index.html");
const appCssPath = path.join(docsDir, "app.css");
const appJsPath = path.join(docsDir, "app.js");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function fail(message) {
  console.error(`lite static error: ${message}`);
  process.exitCode = 1;
}

for (const filePath of [srcCorePath, docsCorePath, srcBookmarkletPath, docsBookmarkletPath, serverPath, generatePath, indexPath, appCssPath, appJsPath]) {
  if (!fs.existsSync(filePath)) {
    fail(`missing required file: ${path.relative(root, filePath)}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);

const srcCore = read(srcCorePath);
const docsCore = read(docsCorePath);
const srcBookmarklet = read(srcBookmarkletPath);
const docsBookmarklet = read(docsBookmarkletPath);
const server = read(serverPath);
const generate = read(generatePath);
const index = read(indexPath);
const app = read(appJsPath);
if (!/<details class="input-inner" open>\s*<summary class="input-toggle"><h2 id="input-heading">入力<\/h2><\/summary>/.test(index)) {
  fail("docs/index.html must expose an initially open input disclosure");
}
for (const [name, source] of [["docs/index.html", index], ["generate.js", generate]]) {
  const checkbox = source.match(/<input\b[^>]*id="copy-include-header"[^>]*>/)?.[0];
  if (!checkbox || /\bchecked\b/.test(checkbox)) fail(`${name} must expose an unchecked copy header option`);
}
const resultFileSource = read(path.join(root, "src/core/result-file.js"));
if (resultFileSource !== read(path.join(docsDir, "result-file.js"))) fail("docs/result-file.js is out of sync");

for (const required of [
  'id="selection-delete"',
  'id="selection-restore"',
  'id="result-status"',
  'id="exclusion-list"',
  'id="exclusion-count"',
  'id="exclusion-status"',
  'id="reload-exclusions"',
  'id="download-result"',
  'id="result-file"',
  'id="import-result"',
  'id="import-dialog"',
  'id="import-merge"',
  'id="import-result-only"',
  'id="import-cancel"',
  './result-file.js',
  'id="export-exclusions" type="checkbox" checked',
  'data-filter="deleted"',
  "選択中を一覧から除外",
  "選択中を一覧に戻す",
  "除外済み",
]) {
  if (!index.includes(required)) fail(`docs/index.html is missing ${required}`);
}

if (srcCore !== docsCore) {
  fail("docs/koken-core.js is out of sync with src/core/koken-core.js");
}

if (srcBookmarklet !== docsBookmarklet) {
  fail("docs/bookmarklet.js is out of sync with src/core/bookmarklet.js");
}

for (const reference of ["./app.css", "./koken-core.js", "./bookmarklet.js", "./app.js"]) {
  if (!index.includes(reference)) {
    fail(`docs/index.html must reference ${reference}`);
  }
}

for (const required of [
  "type=\"file\"",
  "id=\"contents-files\"",
  "id=\"reward-file\"",
  "id=\"analyze\"",
  "id=\"download-contents\"",
  "id=\"download-missing\"",
  "id=\"download-ranks\"",
  "id=\"history-list\"",
  "id=\"clear-history\"",
  "id=\"bookmarklet-mode\"",
  "id=\"bookmarklet-action\"",
  "value=\"scroll\" selected",
  "保存したいニコニ貢献ページ",
  "ブックマークレットを実行",
  "クリックでURLをコピー",
  "ブックマークバーへドラッグ",
  "javascript:",
  "手入力",
  'aria-label="HTML取得方法"',
  "クリップボードにコピー",
]) {
  if (!index.includes(required)) {
    fail(`docs/index.html is missing ${required}`);
  }
}

for (const required of [
  "id=\"selection-toggle\"",
  "id=\"selection-select-all\"",
  "id=\"selection-clear\"",
  "id=\"copy-selected\"",
  "選択する",
  "すべて選択",
  "選択解除",
  "選択中をコピー",
]) {
  if (!index.includes(required)) {
    fail(`docs/index.html is missing ${required}`);
  }
  if (!generate.includes(required)) {
    fail(`generate.js is missing ${required}`);
  }
}

for (const required of ["選択をやめる"]) {
  if (!app.includes(required)) {
    fail(`docs/app.js is missing ${required}`);
  }
  if (!generate.includes(required)) {
    fail(`generate.js is missing ${required}`);
  }
}

for (const required of [
  "id=\"bookmarklet-mode\"",
  "id=\"bookmarklet-action\"",
  "value=\"scroll\" selected",
  "保存したいニコニ貢献ページ",
  "ブックマークレットを実行",
  "クリックでURLをコピー",
  "ブックマークバーへドラッグ",
  "javascript:",
  "手入力",
  "HTML取得方法",
  "updateBookmarkletAction",
]) {
  if (!server.includes(required)) {
    fail(`server.js is missing ${required}`);
  }
}

for (const required of [
  "window.KokenCore",
  "file.text()",
  "core.extractContents",
  "core.extractTop3Ranks",
  "core.normalizeResultItem",
  "core.csvText",
  "core.spreadsheetText",
  "new Blob",
  "localStorage",
  "HISTORY_KEY",
  "renderHistory",
  "window.KokenBookmarklet",
  "BOOKMARKLETS",
  "bookmarkletMode",
  "bookmarkletAction",
  "updateBookmarkletAction",
  "preventDefault",
  "ブックマークバーへドラッグ",
  "selectionMode",
  "selectedKeys",
  "selectionToggle",
  "copySelected",
  "selectedVisibleItems",
  "selection-select-all",
  "selection-clear",
  "copy-selected",
  "data-selection-key",
]) {
  if (!app.includes(required)) {
    fail(`docs/app.js is missing ${required}`);
  }
}

for (const required of [
  "BOOKMARKLETS",
  "current",
  "scroll",
  "表示中のHTMLを取得",
  "自動読み込み後にHTMLを取得",
  "bookmarkTitle",
  "ニコニ貢献HTML取得（自動）",
  "autoScroll",
  "scrollToEnd",
  "findLoadMoreButton",
  "clickLoadMoreIfAvailable",
  "ensureRewardContentsTab",
  "isSamePageControl",
  "location.pathname",
  "hasRewardContributionBelow",
  "next-loading-button",
  "100貢未満",
  "一番下まで読み込み中",
]) {
  if (!srcBookmarklet.includes(required)) {
    fail(`src/core/bookmarklet.js is missing ${required}`);
  }
}

try {
  const bookmarkletApi = require(srcBookmarkletPath);
  for (const autoScroll of [false, true]) {
    new Function(bookmarkletApi.sourceFor({ autoScroll }));
  }
} catch (error) {
  fail(`generated bookmarklet source must parse: ${error.message}`);
}

if (!process.exitCode) {
  console.log("Lite static checks OK");
}
