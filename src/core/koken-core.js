(function initKokenCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.KokenCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createKokenCore() {
  const CONTENT_TYPES = {
    seiga: {
      label: "静画",
      filterLabel: "静画のみ表示",
      urlPattern: /https:\/\/seiga\.nicovideo\.jp\/seiga\/(im(\d+))/,
      adUrl: (contentId) => `https://nicoad.nicovideo.jp/seiga/publish/${contentId}`,
      remoteThumb: (numericId) => `https://lohas.nicoseiga.jp/thumb/${numericId}u`,
      rewardThumbPattern: /lohas\.nicoseiga\.jp\/thumb\/(\d+)u\b/,
    },
    video: {
      label: "動画",
      filterLabel: "動画のみ表示",
      urlPattern: /https:\/\/www\.nicovideo\.jp\/watch\/(([a-z]{2})(\d+))/,
      adUrl: (contentId) => `https://nicoad.nicovideo.jp/video/publish/${contentId}`,
      remoteThumb: (numericId) => `https://nicovideo.cdn.nimg.jp/thumbnails/${numericId}/${numericId}.M`,
      rewardThumbPattern: /nicovideo\.cdn\.nimg\.jp\/thumbnails\/(\d+)\//,
    },
  };

  const CONTENTS_CSV_HEADER = [
    "index",
    "type",
    "typeLabel",
    "title",
    "url",
    "contentId",
    "numericId",
    "totalContribution",
    "key",
    "inferredNicoadUrl",
  ];

  const MISSING_CSV_HEADER = [
    "index",
    "type",
    "typeLabel",
    "title",
    "url",
    "contentId",
    "numericId",
    "totalContribution",
    "inferredNicoadUrl",
  ];

  const SPREADSHEET_HEADER = ["id", "タイトル", "コンテンツのURL", "獲得貢", "広告画面のURL"];

  function keyFor(type, numericId) {
    return `${type}:${numericId}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function decodeHtmlText(value) {
    return String(value ?? "")
      .replace(/<svg[\s\S]*?<\/svg>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
      .replace(/\s+/g, " ");
  }

  function csvEscape(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function csvText(header, rows, options = {}) {
    const includeBom = options.includeBom !== false;
    const lines = [header.map(csvEscape).join(",")];
    for (const row of rows) {
      lines.push(header.map((key) => csvEscape(row[key])).join(","));
    }
    return `${includeBom ? "\uFEFF" : ""}${lines.join("\r\n")}`;
  }

  function spreadsheetCell(value) {
    return String(value || "").replace(/[\t\r\n]+/g, " ").trim();
  }

  function spreadsheetText(items) {
    const rows = [SPREADSHEET_HEADER];
    for (const item of items) {
      rows.push([
        item.contentId,
        item.title,
        item.url,
        item.totalContribution,
        item.nicoadUrl,
      ]);
    }
    return rows.map((row) => row.map(spreadsheetCell).join("\t")).join("\n");
  }

  function top3RanksText(top3Ranks) {
    return [...top3Ranks.entries()].sort().map(([id, rank]) => `${id},${rank}`).join("\r\n");
  }

  function detectContentsType(contentsHtml) {
    const filterMatch = contentsHtml.match(/<button[^>]*class="trigger"[^>]*aria-selected="true"[^>]*>([^<]+)<\/button>/);
    const filterText = filterMatch ? decodeHtmlText(filterMatch[1]) : "";
    for (const [type, config] of Object.entries(CONTENT_TYPES)) {
      if (filterText.includes(config.filterLabel) || contentsHtml.includes(`class="generic-service-name">${config.label}</span>`)) {
        return type;
      }
    }
    for (const [type, config] of Object.entries(CONTENT_TYPES)) {
      if (config.urlPattern.test(contentsHtml)) return type;
    }
    return "";
  }

  function extractTotalContribution(itemHtml) {
    const contributionMatch = itemHtml.match(/class="total-contribution"[\s\S]*?<strong[^>]*class="value"[^>]*>([\s\S]*?)<\/strong>/);
    if (!contributionMatch) return "";
    const text = decodeHtmlText(contributionMatch[1].replace(/<svg[\s\S]*?<\/svg>/g, ""));
    const numberMatch = text.match(/[0-9][0-9,\s]*/);
    return numberMatch ? numberMatch[0].replace(/\s+/g, "") : "";
  }

  function extractThumbnailSrc(itemHtml) {
    const thumbMatch = itemHtml.match(/<img[^>]+class="thumbnail-image"[^>]+src="([^"]+)"/);
    return thumbMatch ? decodeHtmlText(thumbMatch[1]) : "";
  }

  function extractContents(contentsHtml, fallbackType = "") {
    const detectedType = detectContentsType(contentsHtml) || fallbackType;
    if (!detectedType || !CONTENT_TYPES[detectedType]) {
      throw new Error("contents HTMLのデータ種別を判定できません");
    }
    const config = CONTENT_TYPES[detectedType];
    const blocks = contentsHtml.split('<li data-v-0f929b6d="" class="item"').slice(1);
    const rows = [];
    for (const part of blocks) {
      const end = part.indexOf("</li>");
      const block = end >= 0 ? part.slice(0, end + 5) : part.slice(0, 10000);
      const titleMatch = block.match(/<p[^>]+class="title"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!titleMatch) continue;
      const idMatch = titleMatch[1].match(config.urlPattern);
      if (!idMatch) continue;
      const contentId = idMatch[1];
      const numericId = idMatch[3] || idMatch[2];
      const hasNicoad = block.includes('data-type="nicoad"');
      const totalContribution = extractTotalContribution(block);
      const thumbnailSrc = extractThumbnailSrc(block);
      rows.push({
        index: String(rows.length + 1),
        type: detectedType,
        typeLabel: config.label,
        title: decodeHtmlText(titleMatch[2]),
        url: titleMatch[1],
        contentId,
        numericId,
        totalContribution,
        thumbnailSrc,
        key: keyFor(detectedType, numericId),
        inferredNicoadUrl: hasNicoad ? config.adUrl(contentId) : "",
      });
    }
    return rows;
  }

  function detectRank(itemHtml) {
    const paths = [...itemHtml.matchAll(/<path[^>]+d="([^"]+)"/g)].map((match) => match[1]);
    const digitPath = paths[paths.length - 1] || "";
    if (digitPath.includes("M14.616 19.176V9H11")) return 1;
    if (digitPath.includes("M15.824 19.176v-1.68h-2.992")) return 2;
    if (digitPath.includes("M13.792 19.176c1.355")) return 3;
    return 0;
  }

  function extractTop3Ranks(rewardHtml) {
    const ranks = new Map();
    const itemRegex = /<li\b[^>]*class="item"[\s\S]*?<\/li>/g;
    let match;
    while ((match = itemRegex.exec(rewardHtml)) !== null) {
      const item = match[0];
      let detectedType = "";
      let numericId = "";
      for (const [type, config] of Object.entries(CONTENT_TYPES)) {
        if (!item.includes(`data-type="${type}"`)) continue;
        const thumb = item.match(config.rewardThumbPattern);
        if (!thumb) continue;
        detectedType = type;
        numericId = thumb[1];
        break;
      }
      const rank = detectRank(item);
      if (detectedType && numericId && rank) ranks.set(keyFor(detectedType, numericId), rank);
    }
    return ranks;
  }

  function normalizeResultItem(row, index, options = {}) {
    const rank = Number(options.rank || 0);
    return {
      ...row,
      globalIndex: String(index + 1),
      nicoadUrl: row.inferredNicoadUrl || CONTENT_TYPES[row.type].adUrl(row.contentId),
      thumbnail: options.thumbnail || "",
      rank,
      inTop3: rank > 0,
    };
  }

  function createMissingRows(items) {
    return items
      .filter((item) => !item.inTop3)
      .map((item) => ({
        index: item.index,
        title: item.title,
        url: item.url,
        type: item.type,
        typeLabel: item.typeLabel,
        contentId: item.contentId,
        numericId: item.numericId,
        totalContribution: item.totalContribution,
        inferredNicoadUrl: item.nicoadUrl,
      }));
  }

  function contributionSortValue(value) {
    const numeric = Number(String(value || "").replace(/,/g, ""));
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function itemMatchesRankFilter(item, filter = "missing") {
    if (filter === "all") return true;
    if (filter === "top3") return item.inTop3;
    if (filter === "missing") return !item.inTop3;
    if (filter === "rank1") return Number(item.rank) === 1;
    if (filter === "rank2") return Number(item.rank) === 2;
    if (filter === "rank3") return Number(item.rank) === 3;
    return true;
  }

  function applyResultOperations(items, options = {}) {
    const rankFilter = options.rankFilter || "missing";
    const typeFilter = options.typeFilter || "all";
    const query = String(options.query || "").trim().toLowerCase();
    const sort = options.sort || "index";
    return [...items]
      .filter((item) => {
        const typeMatch = typeFilter === "all" || item.type === typeFilter;
        const rankMatch = itemMatchesRankFilter(item, rankFilter);
        const textMatch =
          query === "" ||
          String(item.title || "").toLowerCase().includes(query) ||
          String(item.contentId || "").toLowerCase().includes(query);
        return typeMatch && rankMatch && textMatch;
      })
      .sort((a, b) => {
        if (sort === "rank-asc" || sort === "rank-desc") {
          const ar = Number(a.rank);
          const br = Number(b.rank);
          if (ar && br && ar !== br) {
            return sort === "rank-asc" ? ar - br : br - ar;
          }
          if (ar !== br) return ar ? -1 : 1;
        }
        if (sort === "contribution-desc") {
          const contributionDiff = contributionSortValue(b.totalContribution) - contributionSortValue(a.totalContribution);
          if (contributionDiff !== 0) return contributionDiff;
        }
        if (sort === "contribution-asc") {
          const contributionDiff = contributionSortValue(a.totalContribution) - contributionSortValue(b.totalContribution);
          if (contributionDiff !== 0) return contributionDiff;
        }
        return Number(a.globalIndex || a.index) - Number(b.globalIndex || b.index);
      });
  }

  return {
    CONTENT_TYPES,
    CONTENTS_CSV_HEADER,
    MISSING_CSV_HEADER,
    SPREADSHEET_HEADER,
    keyFor,
    escapeHtml,
    decodeHtmlText,
    csvEscape,
    csvText,
    spreadsheetText,
    top3RanksText,
    detectContentsType,
    extractTotalContribution,
    extractThumbnailSrc,
    extractContents,
    detectRank,
    extractTop3Ranks,
    normalizeResultItem,
    createMissingRows,
    contributionSortValue,
    applyResultOperations,
  };
});
