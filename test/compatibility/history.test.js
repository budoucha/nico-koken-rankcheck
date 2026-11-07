const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../../src/core/koken-core");
const bookmarklet = require("../../src/core/bookmarklet");

const source = fs.readFileSync(path.join(__dirname, "../../docs/app.js"), "utf8");
const index = fs.readFileSync(path.join(__dirname, "../../docs/index.html"), "utf8");

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.textContent = "";
    this.value = "";
    this.classes = new Set();
    this.listeners = new Map();
    this.classList = {
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
      remove: (name) => this.classes.delete(name),
    };
  }
  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }
  matches(selector) {
    if (selector.startsWith(".")) return (this.className || "").split(" ").includes(selector.slice(1));
    const match = /^\[data-([\w-]+)\]$/.exec(selector);
    if (!match) return false;
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return Object.hasOwn(this.dataset, key);
  }
  closest(selector) {
    if (this.matches(selector)) return this;
    return this.parentElement ? this.parentElement.closest(selector) : null;
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  async fire(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) {
      await handler({ target: this, ...event });
    }
  }
  click() {}
  remove() {}
}

function start(raw, storageUnavailable = false, allowWrites = false, exclusionsRaw = "[]", options = {}) {
  const elements = new Map();
  const filters = [...index.matchAll(/data-filter="([^"]+)"/g)].map((match) => {
    const button = new Element();
    button.dataset.filter = match[1];
    return button;
  });
  const historyKey = "koken-lite-result-history-v1";
  const exclusionsKey = "koken-lite-excluded-keys-v1";
  const storage = {
    raw, exclusionsRaw, unavailable: storageUnavailable, failWrites: false, writes: 0,
    failHistoryWrites: false, failExclusionWrites: false, failExclusionReads: false, ...options,
  };
  const downloads = [];
  const copied = [];
  const document = {
    body: new Element(),
    querySelector(selector) {
      if (!elements.has(selector)) {
        const element = new Element();
        const input = index.match(new RegExp(`<input[^>]*id="${selector.slice(1)}"[^>]*>`));
        element.checked = Boolean(input && /\bchecked\b/.test(input[0]));
        elements.set(selector, element);
      }
      return elements.get(selector);
    },
    querySelectorAll: (selector) => selector === "[data-filter]" ? filters : [],
    createElement: () => new Element(),
    createDocumentFragment: () => new Element(),
  };
  document.querySelector("#results").classes.add("hidden");
  const window = Object.assign(new Element(), {
    KokenCore: core, KokenBookmarklet: bookmarklet, isSecureContext: true, confirm: () => true,
  });
  vm.runInNewContext(source, {
    window,
    document,
    navigator: { clipboard: { writeText: async (text) => copied.push(text) } },
    Blob,
    URL: {
      createObjectURL(blob) { downloads.push(blob); return "blob:test"; },
      revokeObjectURL() {},
    },
    setTimeout: () => 1,
    clearTimeout() {},
    localStorage: {
      getItem(key) {
        assert.ok(key === historyKey || key === exclusionsKey);
        if (storage.unavailable) throw new Error("Storage unavailable");
        if (key === exclusionsKey && storage.failExclusionReads) throw new Error("Exclusions unavailable");
        return key === historyKey ? storage.raw : storage.exclusionsRaw;
      },
      setItem(key, value) {
        assert.ok(allowWrites, "Opening existing history and exclusions must not write storage");
        assert.ok(key === historyKey || key === exclusionsKey);
        if (storage.unavailable || storage.failWrites) throw new Error("Storage unavailable or full");
        if (key === historyKey && storage.failHistoryWrites) throw new Error("History full");
        if (key === exclusionsKey && storage.failExclusionWrites) throw new Error("Exclusions full");
        if (key === historyKey) storage.raw = value;
        else storage.exclusionsRaw = value;
        storage.writes++;
      },
      removeItem(key) {
        assert.ok(allowWrites, "Opening history must not delete storage");
        assert.equal(key, historyKey);
        if (storage.unavailable || storage.failWrites) throw new Error("Storage unavailable");
        storage.raw = null;
      },
    },
  });
  const get = (selector) => document.querySelector(selector);
  return Object.assign(get, { storage, filters, downloads, copied, window });
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

function fixture(id) {
  const rows = [
    ["video", "123", 0, "A video", "100"],
    ["seiga", "123", 1, "B seiga", "2,000"],
    ["video", "456", 3, "C video", "300"],
    ["seiga", "789", 0, "D seiga", "400"],
  ].map(([type, numericId, rank, title, totalContribution], i) => ({
    type, numericId, rank, title, totalContribution, index: String(i + 1),
    key: `${type}:${numericId}`, contentId: `${type === "video" ? "sm" : "im"}${numericId}`,
    typeLabel: core.CONTENT_TYPES[type].label,
    url: `https://example.com/${type}/${numericId}`,
    ownerName: "future-owner", sourceName: `${id}.html`,
  }));
  return {
    id, savedAt: "2026-11-08T01:00:00Z", contentsNames: [`${id}.html`], rewardName: "reward.html",
    summary: { total: 4, inTop3: 2, missing: 2 }, contentsRows: rows,
    items: rows.map((row, i) => core.normalizeResultItem(row, i, { rank: row.rank })),
    top3Ranks: rows.filter((row) => row.rank).map((row) => [row.key, row.rank]),
  };
}

const click = (get, selector) => get(selector).fire("click");
async function filter(get, name) {
  const button = get.filters.find((item) => item.dataset.filter === name);
  assert.ok(button, `Missing filter: ${name}`);
  await button.fire("click");
}
async function typeFilter(get, type) {
  const button = get("#type-filter").children.find((item) => item.dataset.typeFilter === type);
  await get("#type-filter").fire("click", { target: button });
}
async function search(get, query) {
  get("#search").value = query;
  await get("#search").fire("input");
}
function cards(get) { return get("#grid").querySelectorAll(".card"); }
function keys(get) { return cards(get).map((card) => card.dataset.selectionKey); }
async function check(get, key, checked) {
  const card = cards(get).find((item) => item.dataset.selectionKey === key);
  assert.ok(card, `Missing card: ${key}`);
  const checkbox = card.querySelectorAll(".selection-checkbox")[0];
  checkbox.checked = checked;
  await get("#grid").fire("change", { target: checkbox });
}
async function historyAction(get, id, action) {
  const key = action === "open" ? "historyOpen" : "historyRemove";
  const selector = action === "open" ? "[data-history-open]" : "[data-history-remove]";
  const button = get("#history-list").querySelectorAll(selector).find((item) => item.dataset[key] === id);
  assert.ok(button, `Missing history action: ${action} ${id}`);
  await get("#history-list").fire("click", { target: button });
}
function saved(get, id) { return JSON.parse(get.storage.raw).find((item) => item.id === id); }
function excluded(get) { return JSON.parse(get.storage.exclusionsRaw); }

async function testDeletionAndRestoration() {
  const original = fixture("current");
  const other = fixture("other");
  const get = start(JSON.stringify([original, other]), false, true);
  assert.equal(get("#selection-delete").hidden, true);
  await filter(get, "all");
  await click(get, "#selection-toggle");
  assert.equal(get("#selection-delete").hidden, false);
  assert.equal(get("#selection-restore").hidden, true);
  // Filtering prunes hidden selections, including a different type with the same numeric ID.
  await typeFilter(get, "video");
  await search(get, "A video");
  await click(get, "#selection-delete");
  assert.deepEqual(excluded(get), ["video:123"]);
  assert.deepEqual(saved(get, "current"), original);
  assert.deepEqual(saved(get, "other"), other);
  assert.equal(JSON.parse(get.storage.raw).length, 2);
  assert.equal(saved(get, "current").savedAt, original.savedAt);
  assert.deepEqual(saved(get, "current").items, original.items);
  assert.deepEqual(saved(get, "current").contentsRows, original.contentsRows);
  assert.deepEqual(saved(get, "current").top3Ranks, original.top3Ranks);
  assert.equal(get("#selection-delete").disabled, true);
  assert.match(textIn(get("#summary")), /通常一覧\s+3.*除外済み\s+1/);

  await search(get, "");
  await typeFilter(get, "all");
  for (const [name, expected] of [
    ["all", ["seiga:123", "video:456", "seiga:789"]],
    ["missing", ["seiga:789"]], ["top3", ["seiga:123", "video:456"]],
    ["rank1", ["seiga:123"]], ["rank2", []], ["rank3", ["video:456"]],
    ["deleted", ["video:123"]],
  ]) {
    await filter(get, name);
    assert.deepEqual(keys(get), expected);
  }
  assert.equal(get("#selection-delete").hidden, true);
  assert.equal(get("#selection-restore").hidden, false);
  await click(get, "#selection-select-all");
  await click(get, "#copy-selected");
  assert.equal(get.copied.at(-1), core.spreadsheetText([original.items[0]]));
  await check(get, "video:123", false);
  assert.equal(get("#selection-restore").disabled, true);
  await check(get, "video:123", true);
  assert.equal(get("#selection-restore").disabled, false);

  const reopened = start(get.storage.raw, false, false, get.storage.exclusionsRaw);
  await filter(reopened, "all");
  assert.equal(keys(reopened).length, 3);
  await filter(reopened, "deleted");
  assert.deepEqual(keys(reopened), ["video:123"]);
  assert.equal(reopened("#selection-toggle").attributes["aria-pressed"], "false");

  for (const selector of ["#download-contents", "#download-missing", "#download-ranks"]) await click(get, selector);
  assert.deepEqual(Buffer.from(await get.downloads[0].arrayBuffer()), Buffer.from(core.csvText(core.CONTENTS_CSV_HEADER, original.contentsRows)));
  assert.deepEqual(Buffer.from(await get.downloads[1].arrayBuffer()), Buffer.from(core.csvText(core.MISSING_CSV_HEADER, core.createMissingRows(original.items))));
  assert.equal(await get.downloads[2].text(), core.top3RanksText(new Map(original.top3Ranks)));

  await click(get, "#selection-restore");
  assert.deepEqual(excluded(get), []);
  await filter(get, "missing");
  assert.deepEqual(keys(get), ["video:123", "seiga:789"]);
  assert.match(get("#result-status").textContent, /除外から解除しました。すべての履歴/);
  assert.deepEqual(saved(get, "current").items, original.items);
  const restored = start(get.storage.raw, false, false, get.storage.exclusionsRaw);
  assert.deepEqual(keys(restored), ["video:123", "seiga:789"]);

  // Delete ranked items too, restore a subset from the deleted view, and retain original ranks/order.
  await filter(get, "top3");
  await click(get, "#selection-select-all");
  await click(get, "#selection-delete");
  await filter(get, "deleted");
  assert.deepEqual(keys(get), ["seiga:123", "video:456"]);
  get("#sort").value = "contribution-desc";
  await get("#sort").fire("change");
  assert.deepEqual(keys(get), ["seiga:123", "video:456"]);
  await click(get, "#selection-select-all");
  await typeFilter(get, "video");
  await click(get, "#selection-restore");
  assert.deepEqual(excluded(get), ["seiga:123"]);
  await typeFilter(get, "all");
  await filter(get, "rank3");
  assert.deepEqual(keys(get), ["video:456"]);

  // Every history uses the common list, and exclusion operations never rewrite history snapshots.
  const before = get.storage.raw;
  await historyAction(get, "other", "open");
  assert.equal(get("#selection-toggle").attributes["aria-pressed"], "false");
  await click(get, "#selection-toggle");
  await click(get, "#selection-delete");
  assert.deepEqual(excluded(get), ["seiga:123", "seiga:789", "video:123"]);
  assert.equal(get.storage.raw, before);
  assert.deepEqual(JSON.parse(get.storage.raw).map((item) => item.id), ["current", "other"]);
  await historyAction(get, "current", "open");
  await filter(get, "all");
  assert.deepEqual(keys(get), ["video:456"]);
}

async function testStorageFailures() {
  const get = start(JSON.stringify([fixture("current")]), false, true);
  await click(get, "#selection-toggle");
  const before = get.storage.exclusionsRaw;
  get.storage.failWrites = true;
  await click(get, "#selection-delete");
  assert.equal(get.storage.exclusionsRaw, before);
  assert.deepEqual(keys(get), ["video:123", "seiga:789"]);
  assert.equal(get("#selection-delete").disabled, false);
  assert.match(get("#result-status").textContent, /反映していません/);
  assert.ok(get("#result-status").classes.has("error"));
  get.storage.failWrites = false;
  await click(get, "#selection-delete");
  await filter(get, "deleted");
  await click(get, "#selection-select-all");
  get.storage.failWrites = true;
  const deleted = get.storage.exclusionsRaw;
  await click(get, "#selection-restore");
  assert.equal(get.storage.exclusionsRaw, deleted);
  assert.deepEqual(keys(get), ["video:123", "seiga:789"]);
  get.storage.failWrites = false;
  get.storage.unavailable = true;
  await click(get, "#selection-restore");
  assert.equal(get.storage.exclusionsRaw, deleted);
  assert.deepEqual(keys(get), ["video:123", "seiga:789"]);
  get.storage.unavailable = false;
  await click(get, "#selection-restore");
  assert.equal(get("#result-status").classes.has("error"), false);

  // Exclusion edits remain available after another tab removes all history.
  get.storage.raw = "[]";
  await filter(get, "missing");
  await click(get, "#selection-select-all");
  await click(get, "#selection-delete");
  assert.equal(get.storage.raw, "[]");
  assert.equal(keys(get).length, 0);
  assert.deepEqual(excluded(get), ["seiga:789", "video:123"]);
}

async function testRemovedHistory() {
  for (const removeAll of [false, true]) {
    const get = start(JSON.stringify([fixture("current"), fixture("other")]), false, true);
    await click(get, "#selection-toggle");
    await click(get, "#selection-delete");
    const exclusions = get.storage.exclusionsRaw;
    if (removeAll) await click(get, "#clear-history");
    else await historyAction(get, "current", "remove");
    const before = get.storage.raw;
    assert.equal(get.storage.exclusionsRaw, exclusions);
    await filter(get, "deleted");
    await click(get, "#selection-select-all");
    await click(get, "#selection-restore");
    assert.equal(get.storage.raw, before);
    assert.equal(keys(get).length, 0);
    assert.deepEqual(excluded(get), []);
  }
  // A failed history removal leaves the entry available for later item edits.
  for (const removeAll of [false, true]) {
    const get = start(JSON.stringify([fixture("current")]), false, true);
    get.storage.failWrites = true;
    if (removeAll) await click(get, "#clear-history");
    else await historyAction(get, "current", "remove");
    get.storage.failWrites = false;
    await click(get, "#selection-toggle");
    await click(get, "#selection-delete");
    assert.deepEqual(excluded(get), ["seiga:789", "video:123"]);
    assert.deepEqual(saved(get, "current"), fixture("current"));
  }
}

async function testFreshHistoryOnEdit() {
  const get = start(JSON.stringify([fixture("current"), fixture("other")]), false, true);
  await click(get, "#selection-toggle");
  await search(get, "A video");
  // Merge with the latest persisted list, retaining keys absent from the open result.
  get.storage.exclusionsRaw = JSON.stringify(["seiga:123", "video:999"]);
  await click(get, "#selection-delete");
  assert.deepEqual(excluded(get), ["seiga:123", "video:123", "video:999"]);
  assert.deepEqual(saved(get, "current"), fixture("current"));
  get.storage.exclusionsRaw = JSON.stringify(["video:456"]);
  await get.window.fire("storage", { key: "koken-lite-excluded-keys-v1" });
  await search(get, "");
  await filter(get, "deleted");
  assert.deepEqual(keys(get), ["video:456"]);
  get.storage.exclusionsRaw = "[]";
  await click(get, "#reload-exclusions");
  assert.deepEqual(keys(get), []);
}

async function testNewAnalysis() {
  const contents = '<!doctype html><html><button class="trigger" aria-selected="true">動画のみ表示</button><ul><li data-v-0f929b6d="" class="item"><p class="title"><a href="https://www.nicovideo.jp/watch/sm999">New video</a></p><div class="total-contribution"><strong class="value">999</strong></div></li></ul></html>';
  const reward = '<!doctype html><html><li class="item"><span data-type="video"></span><img src="https://nicovideo.cdn.nimg.jp/thumbnails/888/888.12345.M"><svg><path d="background"></path><path d="M14.616 19.176V9H11"></path></svg></li></html>';
  for (const failSave of [false, true]) {
    const original = { ...fixture("old"), deletedKeys: ["video:123"] };
    const get = start(JSON.stringify([original]), false, true, '["video:999"]');
    get("#contents-files").files = [{ name: "new.html", text: async () => contents }];
    get("#reward-file").files = [{ name: "reward.html", text: async () => reward }];
    get.storage.failHistoryWrites = failSave;
    await click(get, "#analyze");
    assert.equal(get("#status").classes.has("error"), false, get("#status").textContent);
    assert.deepEqual(keys(get), []);
    assert.equal(get("#selection-toggle").attributes["aria-pressed"], "false");
    const before = get.storage.raw;
    get.storage.failHistoryWrites = false;
    await filter(get, "deleted");
    await click(get, "#selection-toggle");
    await click(get, "#selection-restore");
    assert.deepEqual(excluded(get), []);
    assert.deepEqual(saved(get, "old"), original);
    if (failSave) {
      assert.equal(get.storage.raw, before);
      assert.deepEqual(keys(get), []);
    } else {
      const entries = JSON.parse(get.storage.raw);
      assert.equal(entries.length, 2);
      assert.notEqual(entries[0].id, "old");
      assert.equal(Object.hasOwn(entries[0], "deletedKeys"), false);
      assert.equal(keys(get).length, 0);
    }
  }
}

async function testExclusionMigration() {
  const latest = { ...fixture("latest"), deletedKeys: ["video:123", "video:123", "video:999", "bad", null] };
  const older = { ...fixture("older"), deletedKeys: ["seiga:123"] };
  const raw = JSON.stringify([null, latest, older]);
  const get = start(raw, false, true, null);
  assert.deepEqual(excluded(get), ["video:123", "video:999"]);
  assert.equal(get.storage.raw, raw);
  assert.deepEqual(keys(get), ["seiga:789"]);
  await historyAction(get, "older", "open");
  await filter(get, "deleted");
  assert.deepEqual(keys(get), ["video:123"]);

  // Empty lists are authoritative; opening or restarting from old snapshots cannot re-import keys.
  const empty = start(raw);
  await filter(empty, "deleted");
  assert.deepEqual(keys(empty), []);
  assert.equal(empty.storage.writes, 0);
  const noLegacy = start(JSON.stringify([fixture("latest"), older]), false, true, null);
  assert.deepEqual(excluded(noLegacy), []);
  for (const rawHistory of [null, "[]", "[null,{}]", "{"]) {
    const fresh = start(rawHistory, false, true, null);
    assert.deepEqual(excluded(fresh), []);
    assert.equal(fresh.storage.raw, rawHistory);
  }

  // A failed migration remains absent and can be retried without modifying old history.
  const failed = start(raw, false, true, null, { failExclusionWrites: true });
  assert.equal(failed.storage.exclusionsRaw, null);
  assert.equal(failed.storage.raw, raw);
  assert.match(failed("#exclusion-status").textContent, /読み込めません/);
  failed.storage.failExclusionWrites = false;
  await click(failed, "#reload-exclusions");
  assert.deepEqual(excluded(failed), ["video:123", "video:999"]);

  // Existing malformed or unreadable data must never trigger legacy fallback or overwrite.
  for (const malformed of ["", "{", "null", "{}", '"video:123"', '["unknown:1"]', '["video:123",4]']) {
    const broken = start(raw, false, true, malformed);
    assert.equal(broken.storage.exclusionsRaw, malformed);
    assert.match(broken("#exclusion-status").textContent, /読み込めません/);
    assert.equal(broken.storage.writes, 0);
    await click(broken, "#selection-toggle");
    await click(broken, "#selection-delete");
    assert.equal(broken.storage.exclusionsRaw, malformed);
    assert.deepEqual(keys(broken), ["video:123", "seiga:789"]);
  }
  const unreadable = start(raw, false, true, '["seiga:123"]', { failExclusionReads: true });
  assert.equal(unreadable.storage.writes, 0);
  assert.equal(unreadable.storage.exclusionsRaw, '["seiga:123"]');
  assert.match(unreadable("#result-status").textContent, /読み込めません/);
}

async function testKeysWithoutHistory() {
  const get = start(null, false, true, '["video:999","seiga:123"]');
  assert.equal(get("#results").classes.has("hidden"), true);
  assert.equal(get("#exclusion-count").textContent, "2件");
  assert.match(textIn(get("#exclusion-list")), /video:999/);
  const button = get("#exclusion-list").querySelectorAll("[data-exclusion-remove]")
    .find((item) => item.dataset.exclusionRemove === "video:999");
  await get("#exclusion-list").fire("click", { target: button });
  assert.deepEqual(excluded(get), ["seiga:123"]);
  assert.equal(get.storage.raw, null);
  assert.equal(get("#results").classes.has("hidden"), true);
  const result = start(JSON.stringify([fixture("current")]), false, false, '["video:999"]');
  assert.deepEqual(keys(result), ["video:123", "seiga:789"]);
  assert.match(textIn(result("#summary")), /通常一覧\s+4.*除外済み\s+0/);
  await filter(result, "deleted");
  assert.deepEqual(keys(result), []);
}

async function run() {
  for (const deletedKeys of [undefined, null, {}, "video:123", [null, 2, "unknown"]]) {
    const legacy = { ...fixture("legacy"), deletedKeys };
    const get = start(JSON.stringify([legacy]));
    await filter(get, "all");
    assert.equal(keys(get).length, 4);
    await filter(get, "deleted");
    assert.equal(keys(get).length, 0);
  }
  await testDeletionAndRestoration();
  await testStorageFailures();
  await testRemovedHistory();
  await testFreshHistoryOnEdit();
  await testNewAnalysis();
  await testExclusionMigration();
  await testKeysWithoutHistory();
  console.log("Lite history and common exclusion tests OK");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
