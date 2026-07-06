const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const docsDir = path.join(root, "docs");
const srcCorePath = path.join(root, "src", "core", "koken-core.js");
const docsCorePath = path.join(docsDir, "koken-core.js");
const srcBookmarkletPath = path.join(root, "src", "core", "bookmarklet.js");
const docsBookmarkletPath = path.join(docsDir, "bookmarklet.js");
const serverPath = path.join(root, "server.js");
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

for (const filePath of [srcCorePath, docsCorePath, srcBookmarkletPath, docsBookmarkletPath, serverPath, indexPath, appCssPath, appJsPath]) {
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
const index = read(indexPath);
const app = read(appJsPath);

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
  "HTML取得方法",
]) {
  if (!index.includes(required)) {
    fail(`docs/index.html is missing ${required}`);
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
