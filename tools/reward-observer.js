// Run manually as a DevTools Snippet after each reload. Observation never drives the page.
(() => {
  "use strict";
  if (location.hostname !== "koken.nicovideo.jp" || !location.pathname.includes("/reward")) {
    throw new Error("rewardページで実行してください。");
  }
  if (window.kokenRewardObserver) {
    console.info("既に記録中です。", window.kokenRewardObserver.status());
    return;
  }
  const storageKey = "koken-reward-observation-v1";
  let report;
  try {
    report = JSON.parse(sessionStorage.getItem(storageKey) || "null");
  } catch (error) {
    throw new Error("保存済みログを読めません。sessionStorageを消さずに内容を確認してください: " + error.message);
  }
  if (!report) report = { version: 1, runs: [] };
  if (report.version !== 1 || !Array.isArray(report.runs)) throw new Error("ログの形式が異なります。");
  const started = performance.now();
  const run = { number: report.runs.length + 1, startedAt: new Date().toISOString(),
    path: location.pathname, events: [], truncated: false };
  report.runs.push(run);
  let active = true;
  let previous = "";
  let dirty = false;
  let storageError = null;
  const elapsed = () => Math.round(performance.now() - started);
  const visible = (element) => {
    const style = getComputedStyle(element);
    return Boolean(element.getClientRects().length) && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };
  const shape = (element) => ({
    tag: element.tagName.toLowerCase(), classes: String(element.getAttribute("class") || "").slice(0, 240),
    role: element.getAttribute("role"), ariaBusy: element.getAttribute("aria-busy"),
    ariaDisabled: element.getAttribute("aria-disabled"), disabled: Boolean(element.disabled),
  });
  const text = (element) => (element.textContent || "").replace(/\s+/g, " ").trim();
  const isMore = (button) => /もっと|さらに|追加|読み込|次|more|load|next/i.test(
    text(button) + " " + button.getAttribute("aria-label") + " " + button.className + " " +
    (button.parentElement?.className || ""));
  function record(kind, data) {
    if (!active) return;
    if (run.events.length >= 5000) {
      run.truncated = true;
      stop("event-limit");
      console.warn("記録上限です。ログをエクスポートしてください。");
      return;
    }
    run.events.push({ ms: elapsed(), kind, ...data });
    dirty = true;
  }
  function snapshot(reason) {
    const main = document.querySelector("main") || document.body;
    const buttons = [...main.querySelectorAll("button")].filter(isMore);
    const signals = [...main.querySelectorAll(
      "[aria-busy], [role='progressbar'], [role='alert'], [class*='load' i], [class*='spin' i], " +
      "[class*='progress' i], [class*='error' i], [class*='retry' i], [class*='fail' i]"
    )].slice(0, 80).map((element) => ({ ...shape(element), visible: visible(element),
      animation: getComputedStyle(element).animationName,
      children: [...element.children].slice(0, 8).map(shape) }));
    const list = main.querySelector(".reward-list");
    const state = {
      height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
      scrollY: Math.round(scrollY), viewportHeight: innerHeight,
      rewardItems: main.querySelectorAll(".reward-list li").length,
      contentItems: main.querySelectorAll(".content-area li").length,
      buttons: buttons.map((button) => ({ ...shape(button), label: text(button).slice(0, 80),
        visible: visible(button), top: Math.round(button.getBoundingClientRect().top) })),
      signals,
      listTail: list ? [...list.querySelectorAll("*")].slice(-16).map(shape) : [],
    };
    const serialized = JSON.stringify(state);
    if (serialized !== previous) {
      previous = serialized;
      record("state", { reason, state });
    }
  }
  function persist() {
    if (!dirty) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(report));
      dirty = false;
      storageError = null;
    } catch (error) {
      if (!storageError) console.warn("ログ保存失敗。再読込前にexport()してください。", error.message);
      storageError = error.message;
    }
  }
  const observer = new MutationObserver((changes) => {
    const relevant = changes.filter((change) => (change.target instanceof Element) && change.target.closest("main"));
    if (relevant.length) {
      record("mutation", { count: relevant.length, changes: relevant.slice(0, 24).map((change) => ({
        type: change.type, attribute: change.attributeName, target: shape(change.target),
        added: [...change.addedNodes].filter((node) => node instanceof Element).slice(0, 4).map(shape),
        removed: [...change.removedNodes].filter((node) => node instanceof Element).slice(0, 4).map(shape),
      })) });
      snapshot("mutation");
    }
  });
  function onClick(event) {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (button && isMore(button)) {
      record("load-more-click", { button: shape(button), label: text(button).slice(0, 80) });
      snapshot("before-click-handler");
    }
  }
  function onOffline() { record("browser-offline", {}); }
  function onOnline() { record("browser-online", {}); }
  function onPageHide() { stop("pagehide"); }
  function stop(reason = "manual") {
    if (!active) return;
    run.events.push({ ms: elapsed(), kind: "stop", reason });
    active = false;
    run.endedAt = new Date().toISOString();
    run.durationMs = elapsed();
    dirty = true;
    observer.disconnect();
    clearInterval(sampleTimer);
    clearInterval(saveTimer);
    clearTimeout(limitTimer);
    document.removeEventListener("click", onClick, true);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("pagehide", onPageHide);
    persist();
  }
  // Sampling also catches visibility changes caused by CSS rather than DOM mutations.
  const sampleTimer = setInterval(() => snapshot("poll"), 100);
  const saveTimer = setInterval(persist, 2000);
  const limitTimer = setTimeout(() => stop("10-minute-limit"), 10 * 60 * 1000);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
    attributeFilter: ["class", "style", "disabled", "aria-disabled", "aria-busy", "role", "hidden"], characterData: true });
  document.addEventListener("click", onClick, true);
  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);
  window.addEventListener("pagehide", onPageHide);
  window.kokenRewardObserver = {
    status: () => ({ run: run.number, active, events: run.events.length, storageError }),
    mark: (label) => { record("manual-mark", { label: String(label).slice(0, 240) }); persist(); },
    stop: () => stop(),
    export: () => {
      persist();
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "koken-reward-observations.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
  record("start", { online: navigator.onLine, visibility: document.visibilityState });
  snapshot("start");
  persist();
  console.info("reward記録開始（第" + run.number + "回）。停止: kokenRewardObserver.stop() / 保存: kokenRewardObserver.export()");
})();
