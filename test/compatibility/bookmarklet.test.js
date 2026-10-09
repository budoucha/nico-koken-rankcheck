const assert = require("assert");
const vm = require("vm");
const { sourceFor } = require("../../src/core/bookmarklet");

async function runPage({ reward = true, autoScroll = true, appearAt = 0, delay = 15000, batches = 2,
  stuck = false, busy = false, fixedHeight = false, belowAt = Infinity, tab = false,
  hideDuringLoad = false, disabledDuringLoad = false, finalEmpty = false }) {
  let now = 0;
  let count = 1;
  let clicks = 0;
  let downloads = 0;
  let downloadedCount = null;
  let tabClicks = 0;
  let duplicateClicks = 0;
  let inFlight = false;
  let removed = false;
  const alerts = [];
  const events = [];
  const schedule = (after, action) => events.push({ at: now + after, action });
  const height = () => fixedHeight ? 1000 : 1000 + count * 100;
  function element(text = "") {
    return {
      textContent: text, style: {}, className: "", disabled: false,
      getClientRects: () => [1], getBoundingClientRect: () => ({ top: 0, bottom: 10 }),
      getAttribute: () => null, closest: () => null, scrollIntoView() {}, click() {}, remove() {},
    };
  }
  const button = element("追加で読み込む");
  button.click = () => {
    if (inFlight) duplicateClicks += 1;
    clicks += 1;
    inFlight = true;
    button.disabled = disabledDuringLoad;
    if (!stuck) schedule(delay, () => {
      inFlight = false;
      button.disabled = false;
      if (!finalEmpty || clicks < batches) count += 1;
      if (clicks >= batches) removed = true;
    });
  };
  const contentsTab = element("コンテンツ");
  contentsTab.getAttribute = (name) => name === "role" ? "tab" : null;
  contentsTab.click = () => { tabClicks += 1; };
  const contribution = element("９９ 貢");
  contribution.closest = () => ({});
  const document = {
    body: { get scrollHeight() { return height(); }, appendChild() {} },
    documentElement: {
      get scrollHeight() { return height(); },
      get outerHTML() { downloadedCount = count; return `<html>${count}</html>`; },
    },
    createElement: (tag) => {
      const node = element();
      if (tag === "a") node.click = () => { downloads += 1; };
      return node;
    },
    getElementById: () => null,
    querySelectorAll: (selector) => {
      if (selector.startsWith("[role='tab']")) return tab ? [contentsTab] : [];
      if (selector.startsWith(".next-loading-button button")) return now >= appearAt && !removed && !(hideDuringLoad && inFlight) ? [button] : [];
      if (selector.startsWith("main [aria-busy")) return busy ? [element()] : [];
      if (selector.startsWith(".reward-list li")) return Array(count).fill({});
      if (selector.startsWith(".reward-list .contribution")) return now >= belowAt ? [contribution] : [];
      throw new Error(`Unexpected selector: ${selector}`);
    },
  };
  const window = { scrollY: 0, innerHeight: 800, scrollTo: (_, y) => { window.scrollY = y - 800; } };
  const FakeDate = class extends Date { static now() { return now; } };
  await vm.runInNewContext(sourceFor({ autoScroll }).replace(/^void /, ""), {
    document, window, Date: FakeDate,
    location: { pathname: reward ? "/reward" : "/contents", href: "https://example.test/reward", origin: "https://example.test" },
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    setTimeout: (callback, ms) => {
      const until = now + ms;
      events.sort((a, b) => a.at - b.at);
      while (events.length && events[0].at <= until) {
        const event = events.shift();
        now = event.at;
        event.action();
      }
      now = until;
      callback();
    },
    Blob, URL: class extends URL { static createObjectURL() { return "blob:test"; } static revokeObjectURL() {} },
    alert: (message) => alerts.push(message),
  });
  return { clicks, downloads, downloadedCount, tabClicks, duplicateClicks, alerts, now };
}

(async () => {
  for (const reward of [true, false]) {
    const result = await runPage({ reward, appearAt: 8000, fixedHeight: true, tab: reward });
    assert.strictEqual(result.downloadedCount, 3, "wait for delayed controls and both slow batches even with unchanged height");
    assert.strictEqual(result.clicks, 2);
    assert.strictEqual(result.duplicateClicks, 0, "do not repeat clicks while a request is pending");
    assert.strictEqual(result.downloads, 1);
    assert.strictEqual(result.tabClicks, reward ? 1 : 0);
  }
  const longList = await runPage({ batches: 125, delay: 500 });
  assert.strictEqual(longList.downloadedCount, 126, "do not truncate at 120 polling iterations");
  for (const options of [{ hideDuringLoad: true }, { disabledDuringLoad: true }]) {
    const result = await runPage(options);
    assert.strictEqual(result.downloadedCount, 3, "wait for a request even if its button disappears or is disabled");
    assert.strictEqual(result.duplicateClicks, 0);
  }
  const finalEmpty = await runPage({ finalEmpty: true });
  assert.strictEqual(finalEmpty.downloadedCount, 2, "a final empty batch may remove the control without adding items");
  assert.strictEqual(finalEmpty.downloads, 1);
  for (const options of [{ stuck: true }, { busy: true }]) {
    const result = await runPage(options);
    assert.strictEqual(result.downloads, 0, "a stalled load must not be saved as complete");
    assert.ok(result.alerts[0].includes("完了を確認できません"));
  }
  const deadline = await runPage({ batches: 2000, delay: 500 });
  assert.strictEqual(deadline.downloads, 0, "the overall deadline must not download a partial long list");
  assert.ok(deadline.alerts[0].includes("完了を確認できません"));
  const cutoff = await runPage({ belowAt: 2000 });
  assert.strictEqual(cutoff.downloads, 1, "reward cutoff still saves without waiting for all batches");
  assert.ok(cutoff.now < 10000);
  const current = await runPage({ autoScroll: false, stuck: true });
  assert.strictEqual(current.clicks, 0);
  assert.strictEqual(current.downloads, 1, "current HTML option remains immediate");
  const emptyEnd = await runPage({ appearAt: Infinity });
  assert.strictEqual(emptyEnd.downloads, 1);
  assert.ok(emptyEnd.now >= 10000, "end detection requires a quiet interval");
  console.log("Bookmarklet loading tests OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
