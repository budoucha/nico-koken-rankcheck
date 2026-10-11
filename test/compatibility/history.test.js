const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../../src/core/koken-core");
const bookmarklet = require("../../src/core/bookmarklet");

const source = fs.readFileSync(path.join(__dirname, "../../docs/app.js"), "utf8");

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.textContent = "";
    this.value = "";
    this.classes = new Set();
    this.classList = {
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
      remove: (name) => this.classes.delete(name),
    };
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener() {}
}

function start(raw, storageUnavailable = false) {
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    querySelectorAll: () => [],
    createElement: () => new Element(),
    createDocumentFragment: () => new Element(),
  };
  document.querySelector("#results").classes.add("hidden");
  vm.runInNewContext(source, {
    window: { KokenCore: core, KokenBookmarklet: bookmarklet },
    document,
    localStorage: {
      getItem(key) {
        assert.equal(key, "koken-lite-result-history-v1");
        if (storageUnavailable) throw new Error("Storage unavailable");
        return raw;
      },
      setItem() { assert.fail("Opening history must not write storage"); },
      removeItem() { assert.fail("Opening history must not delete storage"); },
    },
  });
  return (selector) => document.querySelector(selector);
}

function entry(id, savedAt) {
  const row = {
    type: "video", contentId: "sm123", numericId: "123", key: "video:123",
    title: id, url: "https://www.nicovideo.jp/watch/sm123", totalContribution: "100",
  };
  return {
    id, savedAt, contentsNames: [`${id}.html`], rewardName: "reward.html",
    contentsRows: [row], items: [core.normalizeResultItem(row, 0, { rank: 0 })],
    top3Ranks: [],
  };
}

function textIn(element) {
  return [element.textContent, ...element.children.map(textIn)].join(" ");
}

const newest = entry("newest", "2026-10-11T12:00:00Z");
const older = entry("older", "2026-10-10T12:00:00Z");
for (const entries of [[newest], [newest, older], [null, newest, older]]) {
  const get = start(JSON.stringify(entries));
  assert.equal(get("#results").classes.has("hidden"), false);
  assert.equal(get("#source-summary").textContent, "contents: newest.html / reward: reward.html");
  assert.equal(get("#visible-count").textContent, "1");
  assert.match(textIn(get("#grid")), /newest/);
  assert.doesNotMatch(textIn(get("#grid")), /older/);
  assert.equal(get("#search").value, "");
  assert.equal(get("#sort").value, "index");
  assert.equal(get("#selection-toggle").attributes["aria-pressed"], "false");
}

for (const raw of [null, "[]", "[null,{}]", "{", "{}"]) {
  const get = start(raw);
  assert.equal(get("#results").classes.has("hidden"), true);
  assert.equal(get("#history-list").children[0].textContent, "履歴なし");
  assert.equal(get("#clear-history").disabled, true);
  assert.ok(get("#bookmarklet-action").href.startsWith("javascript:"));
}
assert.equal(start(null, true)("#results").classes.has("hidden"), true);
console.log("Lite history startup tests OK");
