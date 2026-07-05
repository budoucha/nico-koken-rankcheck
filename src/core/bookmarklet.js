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
    function pageHeight() {
      return Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0
      );
    }
    async function scrollToEnd() {
      showNotice("一番下まで読み込み中...");
      let lastHeight = 0;
      let stableCount = 0;
      for (let index = 0; index < 80; index += 1) {
        const height = pageHeight();
        window.scrollTo(0, height);
        await wait(500);
        const currentHeight = pageHeight();
        const atBottom = window.scrollY + window.innerHeight >= currentHeight - 4;
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
      label: "現在の表示分を保存",
      source: sourceFor({ autoScroll: false }),
      url: bookmarkletUrlFor({ autoScroll: false }),
    },
    scroll: {
      label: "一番下まで読み込んで保存",
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
