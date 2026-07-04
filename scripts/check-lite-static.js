const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const docsDir = path.join(root, "docs");
const srcCorePath = path.join(root, "src", "core", "koken-core.js");
const docsCorePath = path.join(docsDir, "koken-core.js");
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

for (const filePath of [srcCorePath, docsCorePath, indexPath, appCssPath, appJsPath]) {
  if (!fs.existsSync(filePath)) {
    fail(`missing required file: ${path.relative(root, filePath)}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);

const srcCore = read(srcCorePath);
const docsCore = read(docsCorePath);
const index = read(indexPath);
const app = read(appJsPath);

if (srcCore !== docsCore) {
  fail("docs/koken-core.js is out of sync with src/core/koken-core.js");
}

for (const reference of ["./app.css", "./koken-core.js", "./app.js"]) {
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
]) {
  if (!index.includes(required)) {
    fail(`docs/index.html is missing ${required}`);
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
]) {
  if (!app.includes(required)) {
    fail(`docs/app.js is missing ${required}`);
  }
}

if (!process.exitCode) {
  console.log("Lite static checks OK");
}
