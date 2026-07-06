(function initKokenBookmarklet(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.KokenBookmarklet = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createKokenBookmarklet() {
  function sourceFor(options = {}) {
    const autoScroll = Boolean(options.autoScroll);
    return `void (async () => {
    const autoScroll = ${autoScroll};
    const isRewardPage = location.pathname.includes("/reward");
    const pad = (value) => String(value).padStart(2, "0");
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let notice = null;
    function showNotice(message) {
      if (!notice) {
        notice = document.createElement("div");
        notice.style.position = "fixed";
        notice.style.right = "16px";
        notice.style.bottom = "16px";
        notice.style.zIndex = "2147483647";
        notice.style.maxWidth = "320px";
        notice.style.padding = "10px 12px";
        notice.style.borderRadius = "8px";
        notice.style.background = "#0a7c7b";
        notice.style.color = "#fff";
        notice.style.font = "14px/1.5 system-ui, sans-serif";
        notice.style.boxShadow = "0 2px 10px rgba(0,0,0,.18)";
        document.body.appendChild(notice);
      }
      notice.textContent = message;
    }
    function isVisible(element) {
      if (!element || !element.getClientRects().length) return false;
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    }
    function isEnabledButton(button) {
      return button && !button.disabled && button.getAttribute("aria-disabled") !== "true";
    }
    function normalizedText(element) {
      return [
        element.textContent || "",
        element.getAttribute("aria-label") || "",
        element.getAttribute("title") || "",
      ].join(" ").replace(/\\s+/g, " ").trim();
    }
    function uniqueElements(elements) {
      return [...new Set(elements.filter(Boolean))];
    }
    function isSamePageControl(element) {
      const link = element.closest("a[href]");
      if (!link) return true;
      try {
        const url = new URL(link.getAttribute("href"), location.href);
        return url.origin === location.origin && url.pathname === location.pathname;
      } catch {
        return false;
      }
    }
    function pageHeight() {
      return Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0
      );
    }
    async function ensureRewardContentsTab() {
      if (!isRewardPage) return;
      const candidates = uniqueElements([
        ...document.querySelectorAll("[role='tab'], [aria-selected], [aria-pressed], button"),
      ]).filter((element) => isVisible(element) && isSamePageControl(element) && normalizedText(element).includes("コンテンツ"));
      if (!candidates.length) return;
      const selected = candidates.find((element) =>
        element.getAttribute("aria-selected") === "true" ||
        element.getAttribute("aria-pressed") === "true" ||
        element.getAttribute("aria-current") === "page"
      );
      if (selected) return;
      const tab = candidates.find((element) => element.getAttribute("role") === "tab") || candidates[0];
      showNotice("コンテンツタブを選択中...");
      tab.click();
      await wait(800);
    }
    function findLoadMoreButton() {
      const buttons = uniqueElements([
        ...document.querySelectorAll(".next-loading-button button, button[class*='next'], button[class*='more'], button[class*='load'], button"),
      ]).filter((button) => isVisible(button) && isEnabledButton(button));
      const matches = buttons.filter((button) => {
        const text = normalizedText(button);
        const classText = [
          button.className || "",
          button.parentElement ? button.parentElement.className || "" : "",
          button.closest(".next-loading-button") ? "next-loading-button" : "",
        ].join(" ");
        return /もっと|さらに|追加|読み込|次|more|load|next/i.test(text) ||
          /next-loading-button|more|load|next/i.test(classText);
      });
      return matches.find((button) => {
        const rect = button.getBoundingClientRect();
        return rect.bottom >= -20 && rect.top <= window.innerHeight + 80;
      }) || matches[0] || null;
    }
    async function clickLoadMoreIfAvailable() {
      const button = findLoadMoreButton();
      if (!button) return false;
      showNotice("追加読み込みボタンをクリック中...");
      button.scrollIntoView({ block: "center" });
      await wait(100);
      button.click();
      await wait(1200);
      return true;
    }
    function contributionNumber(text) {
      const normalized = String(text || "").replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));
      const match = normalized.match(/[0-9][0-9,，\\s]*/);
      return match ? Number(match[0].replace(/[,，\\s]/g, "")) : NaN;
    }
    function hasRewardContributionBelow(limit) {
      if (!isRewardPage) return false;
      const candidates = uniqueElements([
        ...document.querySelectorAll(".reward-list .contribution, .reward-list [class*='contribution'], span.contribution, [class*='contribution']"),
      ]).filter((element) => isVisible(element) && element.closest("li, [class*='item'], [class*='list-wrapper']"));
      return candidates.some((element) => {
        const value = contributionNumber(element.textContent);
        return Number.isFinite(value) && value < limit;
      });
    }
    async function scrollToEnd() {
      await ensureRewardContentsTab();
      showNotice("一番下まで読み込み中...");
      let lastHeight = 0;
      let stableCount = 0;
      for (let index = 0; index < 120; index += 1) {
        if (hasRewardContributionBelow(100)) {
          showNotice("100貢未満を検知したため保存します...");
          await wait(700);
          break;
        }
        const height = pageHeight();
        window.scrollTo(0, height);
        await wait(500);
        if (hasRewardContributionBelow(100)) {
          showNotice("100貢未満を検知したため保存します...");
          await wait(700);
          break;
        }
        const clicked = await clickLoadMoreIfAvailable();
        const currentHeight = pageHeight();
        const atBottom = window.scrollY + window.innerHeight >= currentHeight - 4;
        if (clicked) {
          stableCount = 0;
          lastHeight = currentHeight;
          continue;
        }
        if (currentHeight === lastHeight && atBottom) {
          stableCount += 1;
          if (stableCount >= 3) break;
        } else {
          stableCount = 0;
        }
        lastHeight = currentHeight;
      }
      window.scrollTo(0, pageHeight());
      await wait(250);
    }
    if (autoScroll) {
      await scrollToEnd();
    }
    if (notice) notice.remove();
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      "-",
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join("");
    const path = location.pathname;
    const kind = path.includes("/reward") ? "reward" : path.includes("/contents") ? "contents" : "page";
    const html = "<!doctype html>\\n" + document.documentElement.outerHTML;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "koken-" + kind + "-" + stamp + ".html";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    alert("HTMLを保存しました。保存したファイルをニコニ貢献ランクチェッカーに入力してください。");
  })().catch((error) => {
    alert("HTML保存に失敗しました: " + (error && error.message ? error.message : String(error)));
  });`;
  }

  function bookmarkletUrlFor(options = {}) {
    return `javascript:${encodeURIComponent(sourceFor(options))}`;
  }

  const BOOKMARKLETS = {
    current: {
      label: "表示中のHTMLを取得",
      bookmarkTitle: "ニコニ貢献HTML取得（表示中）",
      source: sourceFor({ autoScroll: false }),
      url: bookmarkletUrlFor({ autoScroll: false }),
    },
    scroll: {
      label: "自動読み込み後にHTMLを取得",
      bookmarkTitle: "ニコニ貢献HTML取得（自動）",
      source: sourceFor({ autoScroll: true }),
      url: bookmarkletUrlFor({ autoScroll: true }),
    },
  };

  const SOURCE = BOOKMARKLETS.current.source;
  const BOOKMARKLET_URL = BOOKMARKLETS.current.url;

  return {
    SOURCE,
    BOOKMARKLET_URL,
    BOOKMARKLETS,
    sourceFor,
    bookmarkletUrlFor,
  };
});
