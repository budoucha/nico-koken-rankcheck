(function initKokenBookmarklet(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.KokenBookmarklet = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createKokenBookmarklet() {
  const SOURCE = `(() => {
    const pad = (value) => String(value).padStart(2, "0");
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
  })();`;

  const BOOKMARKLET_URL = `javascript:${encodeURIComponent(SOURCE)}`;

  return {
    SOURCE,
    BOOKMARKLET_URL,
  };
});
