const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const inputDir = path.join(projectRoot, "input");
const assetDir = path.join(projectRoot, "assets");
const thumbDir = path.join(assetDir, "thumbs");
const outputHtml = path.join(projectRoot, "result.html");
const extractedCsv = path.join(projectRoot, "result-contents.csv");
const missingCsv = path.join(projectRoot, "result-not-in-top3.csv");
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

function extractContents(contentsHtml) {
  const blocks = contentsHtml.split('<li data-v-0f929b6d="" class="item"').slice(1);
  const rows = [];
  for (const part of blocks) {
    const end = part.indexOf("</li>");
    const block = end >= 0 ? part.slice(0, end + 5) : part.slice(0, 10000);
    const titleMatch = block.match(/<p[^>]+class="title"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;
    const contentId = (titleMatch[1].match(/im\d+/) || [""])[0];
    if (!contentId) continue;
    const hasNicoad = block.includes('data-type="nicoad"');
    rows.push({
      index: String(rows.length + 1),
      title: decodeHtmlText(titleMatch[2]),
      url: titleMatch[1],
      contentId,
      inferredNicoadUrl: hasNicoad ? `https://nicoad.nicovideo.jp/seiga/publish/${contentId}` : "",
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

function extractTop3SeigaRanks(rewardHtml) {
  const ranks = new Map();
  const itemRegex = /<li\b[^>]*class="item"[\s\S]*?<\/li>/g;
  let match;
  while ((match = itemRegex.exec(rewardHtml)) !== null) {
    const item = match[0];
    if (!item.includes('data-type="seiga"')) continue;
    const thumb = item.match(/lohas\.nicoseiga\.jp\/thumb\/(\d+)u\b/);
    const rank = detectRank(item);
    if (thumb && rank) ranks.set(`im${thumb[1]}`, rank);
  }
  return ranks;
}

function findLocalThumbnailSource(contentsPath, contentId) {
  const baseName = path.basename(contentsPath, path.extname(contentsPath));
  const candidatesDirs = [
    path.join(path.dirname(contentsPath), `${baseName}_files`),
    path.join(path.dirname(contentsPath), `${baseName}.files`),
  ];
  const numericId = contentId.replace(/^im/, "");
  const fileCandidates = [`${numericId}u`, `${numericId}.jpg`, `${numericId}.png`, `${numericId}`];
  for (const dir of candidatesDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const fileName of fileCandidates) {
      const source = path.join(dir, fileName);
      if (fs.existsSync(source) && fs.statSync(source).isFile()) return source;
    }
  }
  return "";
}

function thumbnailFor(contentsPath, contentId) {
  const source = findLocalThumbnailSource(contentsPath, contentId);
  if (source) {
    const ext = path.extname(source) || ".jpg";
    const destName = `${contentId}${ext}`;
    const dest = path.join(thumbDir, destName);
    fs.copyFileSync(source, dest);
    return `assets/thumbs/${destName}`;
  }
  return `https://lohas.nicoseiga.jp/thumb/${contentId.replace(/^im/, "")}u`;
}

function generateViewer(items, stats) {
  const cards = items.map((item) => `
        <article class="card" data-in-top3="${item.inTop3 ? "true" : "false"}" data-rank="${item.rank || 0}" data-index="${escapeHtml(item.index)}" data-title="${escapeHtml(item.title.toLowerCase())}" data-id="${escapeHtml(item.contentId.toLowerCase())}">
          <a class="thumb-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(item.title)}を開く">
            <img class="thumb" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy">
          </a>
          <div class="content">
            <div class="meta">
              <span class="index">#${escapeHtml(item.index)}</span>
              <span class="status ${item.inTop3 ? "ok" : "missing"}">${item.inTop3 ? "3位以内" : "3位以内になし"}</span>
              ${item.rank ? `<span class="rank-badge rank-${item.rank}">${item.rank}位</span>` : ""}
            </div>
            <h2><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h2>
            <p class="id">${escapeHtml(item.contentId)}</p>
            <div class="actions">
              <a class="button primary" href="${escapeHtml(item.nicoadUrl)}" target="_blank" rel="noopener noreferrer">広告画面</a>
              <a class="button" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">静画</a>
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
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
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
        <span>3位以内になし <strong>${stats.notInTop3}</strong></span>
      </div>
      <div class="source">contents: ${escapeHtml(path.basename(stats.contentsPath))} / reward: ${escapeHtml(path.basename(stats.rewardPath))}</div>
      <div class="top-actions">
        <a class="button" href="https://koken.nicovideo.jp/supporter/contents" target="_blank" rel="noopener noreferrer">contentsを開く</a>
        <a class="button" href="https://koken.nicovideo.jp/supporter/reward" target="_blank" rel="noopener noreferrer">rewardを開く</a>
        <form id="generate-form" method="post" action="/generate">
          <button class="button primary" type="submit">HTMLを再生成</button>
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
      <select id="sort">
        <option value="index">元の順番</option>
        <option value="rank">順位順</option>
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
    const cards = [...document.querySelectorAll(".card")];
    const grid = document.querySelector("#grid");
    const search = document.querySelector("#search");
    const sort = document.querySelector("#sort");
    const count = document.querySelector("#visible-count");
    let activeFilter = "missing";

    function applySort() {
      const sorted = [...cards].sort((a, b) => {
        if (sort.value === "rank") {
          const ar = Number(a.dataset.rank);
          const br = Number(b.dataset.rank);
          const av = ar || 99;
          const bv = br || 99;
          if (av !== bv) return av - bv;
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
        const show = filterMatch && textMatch;
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

  const contentsPath = latestInput("contents");
  const rewardPath = latestInput("reward");
  const contentsHtml = fs.readFileSync(contentsPath, "utf8");
  const rewardHtml = fs.readFileSync(rewardPath, "utf8");

  const contentsRows = extractContents(contentsHtml);
  const top3Ranks = extractTop3SeigaRanks(rewardHtml);
  const items = contentsRows.map((row) => {
    const rank = top3Ranks.get(row.contentId) || 0;
    const inTop3 = rank > 0;
    return {
      ...row,
      nicoadUrl: row.inferredNicoadUrl || `https://nicoad.nicovideo.jp/seiga/publish/${row.contentId}`,
      thumbnail: thumbnailFor(contentsPath, row.contentId),
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
      contentId: item.contentId,
      inferredNicoadUrl: item.nicoadUrl,
    }));

  writeCsv(extractedCsv, ["index", "title", "url", "contentId", "inferredNicoadUrl"], contentsRows);
  writeCsv(missingCsv, ["index", "title", "url", "contentId", "inferredNicoadUrl"], missingRows);
  fs.writeFileSync(top3RanksPath, [...top3Ranks.entries()].sort().map(([id, rank]) => `${id},${rank}`).join("\r\n"), "utf8");

  const stats = {
    total: items.length,
    inTop3: items.filter((item) => item.inTop3).length,
    notInTop3: missingRows.length,
    contentsPath,
    rewardPath,
  };
  fs.writeFileSync(outputHtml, generateViewer(items, stats), "utf8");

  return {
    contentsPath,
    rewardPath,
    total: stats.total,
    top3SeigaIds: top3Ranks.size,
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
