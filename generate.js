const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const inputDir = path.join(projectRoot, "input");
const assetDir = path.join(projectRoot, "assets");
const thumbDir = path.join(assetDir, "thumbs");
const outputHtml = path.join(projectRoot, "result.html");
const extractedCsv = path.join(projectRoot, "result-contents.csv");
const missingCsv = path.join(projectRoot, "result-not-in-top3.csv");
const top3RanksPath = path.join(projectRoot, "result-top3-ranks.txt");
const settingsPath = path.join(projectRoot, "settings.json");

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

function keyFor(type, numericId) {
  return `${type}:${numericId}`;
}

function loadSettings() {
  const defaults = { advertiserName: "ユーザネーム未設定" };
  if (!fs.existsSync(settingsPath)) return defaults;
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(settingsPath, "utf8")) };
  } catch (error) {
    throw new Error(`settings.json を読み込めません: ${error.message}`);
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function latestInput(prefix) {
  ensureDir(inputDir);
  const files = fs.readdirSync(inputDir)
    .filter((name) => name.toLowerCase().startsWith(prefix.toLowerCase()) && name.toLowerCase().endsWith(".html"))
    .map((name) => {
      const fullPath = path.join(inputDir, name);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!files.length) {
    throw new Error(`input/${prefix}*.html が見つかりません`);
  }
  return files[0].fullPath;
}

function latestInputsByContentType() {
  ensureDir(inputDir);
  const latest = new Map();
  for (const name of fs.readdirSync(inputDir)) {
    if (!name.toLowerCase().endsWith(".html")) continue;
    const typeMatch = name.match(/^contents-([a-z]+)(?:-|\.html$)/i);
    let type = typeMatch ? typeMatch[1].toLowerCase() : "";
    const fullPath = path.join(inputDir, name);
    if (!type && name.toLowerCase().startsWith("contents")) {
      try {
        type = detectContentsType(fs.readFileSync(fullPath, "utf8"));
      } catch {
        type = "";
      }
    }
    if (!type || !CONTENT_TYPES[type]) continue;
    const stat = fs.statSync(fullPath);
    const current = latest.get(type);
    if (!current || stat.mtimeMs > current.mtimeMs) latest.set(type, { type, fullPath, mtimeMs: stat.mtimeMs });
  }
  return [...latest.values()].sort((a, b) => a.type.localeCompare(b.type));
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

function writeCsv(filePath, header, rows) {
  const lines = [header.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(header.map((key) => csvEscape(row[key])).join(","));
  }
  fs.writeFileSync(filePath, `\uFEFF${lines.join("\r\n")}`, "utf8");
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
    rows.push({
      index: String(rows.length + 1),
      type: detectedType,
      typeLabel: config.label,
      title: decodeHtmlText(titleMatch[2]),
      url: titleMatch[1],
      contentId,
      numericId,
      totalContribution,
      key: keyFor(detectedType, numericId),
      inferredNicoadUrl: hasNicoad ? config.adUrl(contentId) : "",
    });
  }
  return rows.slice(0, 500);
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

function findLocalThumbnailSource(contentsPath, item) {
  const baseName = path.basename(contentsPath, path.extname(contentsPath));
  const candidatesDirs = [
    path.join(path.dirname(contentsPath), `${baseName}_files`),
    path.join(path.dirname(contentsPath), `${baseName}.files`),
  ];
  const numericId = item.numericId;
  const fileCandidates = item.type === "video"
    ? [`${numericId}.M`, `${numericId}.jpg`, `${numericId}.png`, `${numericId}`]
    : [`${numericId}u`, `${numericId}.jpg`, `${numericId}.png`, `${numericId}`];
  for (const dir of candidatesDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    for (const fileName of fileCandidates) {
      const source = path.join(dir, fileName);
      if (fs.existsSync(source) && fs.statSync(source).isFile()) return source;
    }
    if (item.type === "video") {
      const sourceName = files.find((name) => name.startsWith(`${numericId}.`) && /\.(M|jpg|png|webp)$/i.test(name));
      if (sourceName) return path.join(dir, sourceName);
    }
  }
  return "";
}

function thumbnailFor(contentsPath, item) {
  const source = findLocalThumbnailSource(contentsPath, item);
  if (source) {
    const ext = path.extname(source) || ".jpg";
    const destName = `${item.type}-${item.numericId}${ext}`;
    const dest = path.join(thumbDir, destName);
    fs.copyFileSync(source, dest);
    return `assets/thumbs/${destName}`;
  }
  return CONTENT_TYPES[item.type].remoteThumb(item.numericId);
}

function generateViewer(items, stats) {
  const cards = items.map((item) => `
        <article class="card" data-type="${escapeHtml(item.type)}" data-in-top3="${item.inTop3 ? "true" : "false"}" data-rank="${item.rank || 0}" data-index="${escapeHtml(item.globalIndex)}" data-title="${escapeHtml(item.title.toLowerCase())}" data-id="${escapeHtml(item.contentId.toLowerCase())}">
          <a class="thumb-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(item.title)}を開く">
            <img class="thumb" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy">
          </a>
          <div class="content">
            <div class="meta">
              <span class="index">#${escapeHtml(item.index)}</span>
              <span class="type-badge">${escapeHtml(item.typeLabel)}</span>
              <span class="status ${item.inTop3 ? "ok" : "missing"}">${item.inTop3 ? "3位以内" : "4位以下"}</span>
              ${item.rank ? `<span class="rank-badge rank-${item.rank}">${item.rank}位</span>` : ""}
            </div>
            <h2><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h2>
            <p class="id">${escapeHtml(item.contentId)}</p>
            ${item.totalContribution ? `<p class="contribution"><span class="contribution-label">獲得</span><strong>${escapeHtml(item.totalContribution)}</strong><span class="contribution-unit">貢</span></p>` : ""}
            <div class="actions">
              <a class="button primary" href="${escapeHtml(item.nicoadUrl)}" target="_blank" rel="noopener noreferrer">広告する<svg class="external-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M10 14 20 4"></path><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"></path></svg></a>
            </div>
          </div>
        </article>`).join("\n");

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>貢献ランクチェッカー</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f8;
      --panel: #ffffff;
      --text: #1f2529;
      --muted: #69757d;
      --line: #dce2e6;
      --accent: #0a7c7b;
      --danger: #bf3434;
      --ok: #38723b;
      --shadow: 0 1px 2px rgba(20, 30, 40, .08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 10;
      border-bottom: 1px solid var(--line);
      background: rgba(255, 255, 255, .96);
      backdrop-filter: blur(10px);
    }
    .bar {
      max-width: 1180px;
      margin: 0 auto;
      padding: 16px 20px;
    }
    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    .summary strong { color: var(--text); }
    .source {
      margin-top: 4px;
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .top-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .top-actions form {
      margin: 0;
    }
    .top-actions .button {
      min-height: 38px;
    }
    .controls {
      max-width: 1180px;
      margin: 0 auto;
      padding: 0 20px 16px;
      display: grid;
      grid-template-columns: minmax(150px, 220px) minmax(220px, 360px);
      gap: 12px;
      align-items: center;
    }
    .segmented {
      display: inline-grid;
      grid-template-columns: repeat(6, minmax(76px, 1fr));
      grid-column: 1 / -1;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      background: var(--panel);
    }
    .type-filter {
      grid-template-columns: repeat(auto-fit, minmax(86px, 1fr));
    }
    .segmented button {
      min-height: 38px;
      border: 0;
      border-right: 1px solid var(--line);
      background: transparent;
      color: var(--text);
      font: inherit;
      cursor: pointer;
      padding: 0 12px;
      white-space: nowrap;
    }
    .segmented button:last-child { border-right: 0; }
    .segmented button[aria-pressed="true"] {
      background: var(--accent);
      color: #fff;
      font-weight: 700;
    }
    input[type="search"] {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 12px;
      font: inherit;
      background: var(--panel);
    }
    select {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 10px;
      font: inherit;
      background: var(--panel);
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 20px;
    }
    .result-line {
      margin: 0 0 14px;
      color: var(--muted);
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
      gap: 12px;
    }
    .card {
      display: grid;
      grid-template-columns: 96px 1fr;
      gap: 12px;
      min-width: 0;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: var(--shadow);
    }
    .thumb-link {
      display: block;
      width: 96px;
      height: 96px;
      border-radius: 6px;
      overflow: hidden;
      background: #e9eef1;
    }
    .thumb {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
    }
    .content { min-width: 0; }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 4px;
    }
    .index {
      color: var(--muted);
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }
    .status {
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 700;
    }
    .type-badge {
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 700;
      color: #29414c;
      background: #e7eef2;
    }
    .status.ok {
      color: var(--ok);
      background: #e6f2e7;
    }
    .status.missing {
      color: var(--danger);
      background: #f8e7e7;
    }
    .rank-badge {
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 800;
      color: #1f2529;
      background: #eef1f3;
    }
    .rank-1 { background: #fff1af; }
    .rank-2 { background: #e4e9ed; }
    .rank-3 { background: #f0d2b0; }
    h2 {
      margin: 0;
      font-size: 16px;
      line-height: 1.35;
      letter-spacing: 0;
      overflow-wrap: anywhere;
    }
    h2 a {
      color: var(--text);
      text-decoration: none;
    }
    h2 a:hover { text-decoration: underline; }
    .id {
      margin: 4px 0 10px;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 13px;
    }
    .contribution {
      display: flex;
      align-items: baseline;
      gap: 5px;
      margin: -4px 0 10px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.4;
    }
    .contribution strong {
      color: var(--text);
      font-size: 18px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0;
    }
    .contribution-label,
    .contribution-unit {
      color: var(--muted);
      font-weight: 650;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 34px;
      padding: 0 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      color: var(--text);
      background: #fff;
      text-decoration: none;
      font-size: 14px;
      font-weight: 650;
    }
    .button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
    }
    .external-icon {
      width: 15px;
      height: 15px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      flex: 0 0 auto;
    }
    .hidden { display: none; }
    @media (max-width: 720px) {
      .controls { grid-template-columns: 1fr; }
      .segmented { grid-template-columns: 1fr; }
      .segmented button {
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }
      .segmented button:last-child { border-bottom: 0; }
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div class="bar">
      <h1>貢献ランクチェッカー</h1>
      <div class="summary">
        <span>対象 <strong>${escapeHtml(stats.advertiserName)}</strong></span>
        <span>全件 <strong>${stats.total}</strong></span>
        <span>3位以内 <strong>${stats.inTop3}</strong></span>
        <span>4位以下 <strong>${stats.notInTop3}</strong></span>
      </div>
      <div class="source">contents: ${escapeHtml(path.basename(stats.contentsPath))} / reward: ${escapeHtml(path.basename(stats.rewardPath))}</div>
      <div class="top-actions">
        <a class="button" href="https://koken.nicovideo.jp/supporter/contents" target="_blank" rel="noopener noreferrer">contentsを開く<svg class="external-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M10 14 20 4"></path><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"></path></svg></a>
        <a class="button" href="https://koken.nicovideo.jp/supporter/reward" target="_blank" rel="noopener noreferrer">rewardを開く<svg class="external-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M10 14 20 4"></path><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"></path></svg></a>
        <form id="generate-form" method="post" action="/generate">
          <button class="button primary" type="submit">分析する</button>
        </form>
        <a class="button" href="/" id="server-home">入力ファイルを取り込む</a>
      </div>
    </div>
    <div class="controls">
      <div class="segmented" aria-label="表示フィルタ">
        <button type="button" data-filter="missing" aria-pressed="true">4位以下</button>
        <button type="button" data-filter="all" aria-pressed="false">すべて</button>
        <button type="button" data-filter="top3" aria-pressed="false">3位以内</button>
        <button type="button" data-filter="rank3" aria-pressed="false">3位</button>
        <button type="button" data-filter="rank2" aria-pressed="false">2位</button>
        <button type="button" data-filter="rank1" aria-pressed="false">1位</button>
      </div>
      <div class="segmented type-filter" aria-label="データ種別フィルタ">
        <button type="button" data-type-filter="all" aria-pressed="true">全種別</button>
        ${stats.contentTypes.map((entry) => `<button type="button" data-type-filter="${escapeHtml(entry.type)}" aria-pressed="false">${escapeHtml(entry.label)}</button>`).join("")}
      </div>
      <select id="sort">
        <option value="index">元の順番</option>
        <option value="rank-asc">順位が高い順</option>
        <option value="rank-desc">順位が低い順</option>
      </select>
      <input id="search" type="search" placeholder="タイトルまたはIDで検索">
    </div>
  </header>
  <main>
    <p class="result-line"><span id="visible-count">0</span>件表示</p>
    <section class="grid" id="grid">
${cards}
    </section>
  </main>
  <script>
    const buttons = [...document.querySelectorAll("[data-filter]")];
    const typeButtons = [...document.querySelectorAll("[data-type-filter]")];
    const cards = [...document.querySelectorAll(".card")];
    const grid = document.querySelector("#grid");
    const search = document.querySelector("#search");
    const sort = document.querySelector("#sort");
    const count = document.querySelector("#visible-count");
    let activeFilter = "missing";
    let activeTypeFilter = "all";

    function applySort() {
      const sorted = [...cards].sort((a, b) => {
        if (sort.value === "rank-asc" || sort.value === "rank-desc") {
          const ar = Number(a.dataset.rank);
          const br = Number(b.dataset.rank);
          if (ar && br && ar !== br) {
            return sort.value === "rank-asc" ? ar - br : br - ar;
          }
          if (ar !== br) return ar ? -1 : 1;
        }
        return Number(a.dataset.index) - Number(b.dataset.index);
      });
      sorted.forEach((card) => grid.appendChild(card));
    }

    function applyFilter() {
      applySort();
      const query = search.value.trim().toLowerCase();
      let visible = 0;
      for (const card of cards) {
        const inTop3 = card.dataset.inTop3 === "true";
        const rank = Number(card.dataset.rank);
        const typeMatch = activeTypeFilter === "all" || card.dataset.type === activeTypeFilter;
        const filterMatch =
          activeFilter === "all" ||
          (activeFilter === "top3" && inTop3) ||
          (activeFilter === "missing" && !inTop3) ||
          (activeFilter === "rank1" && rank === 1) ||
          (activeFilter === "rank2" && rank === 2) ||
          (activeFilter === "rank3" && rank === 3);
        const textMatch =
          query === "" ||
          card.dataset.title.includes(query) ||
          card.dataset.id.includes(query);
        const show = typeMatch && filterMatch && textMatch;
        card.classList.toggle("hidden", !show);
        if (show) visible += 1;
      }
      count.textContent = String(visible);
    }

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        activeFilter = button.dataset.filter;
        buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        applyFilter();
      });
    });
    typeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        activeTypeFilter = button.dataset.typeFilter;
        typeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        applyFilter();
      });
    });
    const generateForm = document.querySelector("#generate-form");
    if (generateForm && location.protocol === "file:") {
      generateForm.addEventListener("submit", (event) => {
        event.preventDefault();
        alert("再生成にはローカルサーバーが必要です。プロジェクトで node server.js を実行して http://localhost:8787/ を開いてください。");
      });
    }
    const serverHome = document.querySelector("#server-home");
    if (serverHome && location.protocol === "file:") {
      serverHome.href = "http://localhost:8787/";
    }
    sort.addEventListener("change", applyFilter);
    search.addEventListener("input", applyFilter);
    applyFilter();
  </script>
</body>
</html>`;
}

function main() {
  ensureDir(inputDir);
  ensureDir(thumbDir);

  const contentInputs = latestInputsByContentType();
  if (!contentInputs.length) {
    throw new Error("input/ に有効な contents HTML が見つかりません");
  }
  const rewardPath = latestInput("reward");
  const rewardHtml = fs.readFileSync(rewardPath, "utf8");

  const contentsRows = [];
  for (const input of contentInputs) {
    const html = fs.readFileSync(input.fullPath, "utf8");
    contentsRows.push(...extractContents(html, input.type).map((row) => ({
      ...row,
      sourcePath: input.fullPath,
    })));
  }
  const top3Ranks = extractTop3Ranks(rewardHtml);
  const items = contentsRows.map((row, index) => {
    const rank = top3Ranks.get(row.key) || 0;
    const inTop3 = rank > 0;
    return {
      ...row,
      globalIndex: String(index + 1),
      nicoadUrl: row.inferredNicoadUrl || CONTENT_TYPES[row.type].adUrl(row.contentId),
      thumbnail: thumbnailFor(row.sourcePath, row),
      rank,
      inTop3,
    };
  });
  const missingRows = items
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

  writeCsv(extractedCsv, ["index", "type", "typeLabel", "title", "url", "contentId", "numericId", "totalContribution", "key", "inferredNicoadUrl"], contentsRows);
  writeCsv(missingCsv, ["index", "type", "typeLabel", "title", "url", "contentId", "numericId", "totalContribution", "inferredNicoadUrl"], missingRows);
  fs.writeFileSync(top3RanksPath, [...top3Ranks.entries()].sort().map(([id, rank]) => `${id},${rank}`).join("\r\n"), "utf8");

  const stats = {
    advertiserName: loadSettings().advertiserName,
    total: items.length,
    inTop3: items.filter((item) => item.inTop3).length,
    notInTop3: missingRows.length,
    contentsPath: contentInputs.map((input) => input.fullPath).join(", "),
    contentTypes: contentInputs.map((input) => ({ type: input.type, label: CONTENT_TYPES[input.type].label })),
    rewardPath,
  };
  fs.writeFileSync(outputHtml, generateViewer(items, stats), "utf8");

  return {
    contentsPaths: contentInputs.map((input) => input.fullPath),
    rewardPath,
    total: stats.total,
    top3RankedItems: top3Ranks.size,
    inTop3: stats.inTop3,
    notInTop3: stats.notInTop3,
    outputHtml,
    extractedCsv,
    missingCsv,
    top3RanksPath,
  };
}

if (require.main === module) {
  console.log(JSON.stringify(main(), null, 2));
}

module.exports = { main };
