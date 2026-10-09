const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const source = fs.readFileSync(require("path").join(__dirname, "../tools/reward-observer.js"), "utf8");
const stored = new Map();
let failStorage = false;
function newPage() {
  let now = 0;
  const listeners = {};
  class Element {}
  const main = new Element();
  main.querySelectorAll = () => [];
  main.querySelector = () => null;
  const document = {
    body: { scrollHeight: 1000 }, documentElement: { scrollHeight: 1000 }, visibilityState: "visible",
    querySelector: () => main,
    addEventListener: (name, callback) => { listeners[name] = callback; },
    removeEventListener() {},
  };
  const context = {
    location: { hostname: "koken.nicovideo.jp", pathname: "/supporter/reward" },
    sessionStorage: {
      getItem: (key) => stored.get(key),
      setItem: (key, value) => { if (failStorage) throw new Error("quota"); stored.set(key, value); },
    },
    performance: { now: () => now }, document, Element, navigator: { onLine: true },
    console: { info() {}, warn() {} }, scrollY: 0, innerHeight: 800,
    MutationObserver: class { observe() {} disconnect() {} },
    setInterval: () => 1, setTimeout: () => 1, clearInterval() {}, clearTimeout() {},
    addEventListener: (name, callback) => { listeners[name] = callback; }, removeEventListener() {},
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return { api: context.kokenRewardObserver, reload: () => { now = 20000; listeners.pagehide(); } };
}
for (let index = 1; index <= 10; index += 1) {
  const page = newPage();
  assert.strictEqual(page.api.status().run, index);
  page.api.mark("manual observation");
  page.reload();
  assert.strictEqual(page.api.status().active, false);
}
const report = JSON.parse([...stored.values()][0]);
assert.strictEqual(report.runs.length, 10);
assert.ok(report.runs.every((run) => run.events.at(-1).reason === "pagehide"));
const limitPage = newPage();
for (let index = 0; index < 5001; index += 1) limitPage.api.mark("event");
assert.strictEqual(limitPage.api.status().active, false);
const capped = JSON.parse([...stored.values()][0]).runs.at(-1);
assert.strictEqual(capped.truncated, true);
assert.strictEqual(capped.events.at(-1).reason, "event-limit");
failStorage = true;
const quotaPage = newPage();
assert.strictEqual(quotaPage.api.status().storageError, "quota");
quotaPage.api.stop();
console.log("Reward observer tests OK (10 reloads in fixtures, event limit, storage failure)");
