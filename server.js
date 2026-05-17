const http = require("http");
const fs = require("fs");
const path = require("path");
const { main: generate } = require("./generate");

const root = __dirname;
const inputDir = path.join(root, "input");
const settingsPath = path.join(root, "settings.json");
const port = Number(process.env.PORT || 8787);

const CONTENT_TYPES = {
  seiga: {
    label: "静画",
    filterLabel: "静画のみ表示",
    urlPattern: /https:\/\/seiga\.nicovideo\.jp\/seiga\/im\d+/,
  },
  video: {
    label: "動画",
    filterLabel: "動画のみ表示",
    urlPattern: /https:\/\/www\.nicovideo\.jp\/watch\/[a-z]{2}\d+/,
  },
};

function send(res, status, body, contentType = "text/html; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  }[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  fs.createReadStream(filePath).pipe(res);
}

function dashboard(message = "") {
  const viewerExists = fs.existsSync(path.join(root, "result.html"));
  const inputStatus = [latestContentsInfo(), latestInputInfo("reward")];
  const settingsExists = fs.existsSync(settingsPath);
  const settings = loadSettings();
  const externalIcon = `<svg class="external-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M10 14 20 4"></path><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"></path></svg>`;
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>貢献ランクチェッカー</title>
  <style>
    :root {
      --bg: #f6f7f8;
      --panel: #fff;
      --text: #1f2529;
      --muted: #69757d;
      --line: #dce2e6;
      --accent: #0a7c7b;
      --danger: #c62828;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(720px, calc(100vw - 32px));
      padding: 24px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 1px 2px rgba(20, 30, 40, .08);
    }
    h1 {
      margin: 0 0 16px;
      font-size: 22px;
      letter-spacing: 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 14px;
    }
    form { margin: 0; }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      padding: 0 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      color: var(--text);
      background: #fff;
      text-decoration: none;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
      gap: 6px;
    }
    .button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
    }
    .note {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }
    .advertiser-line {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 14px;
    }
    .advertiser-line.missing {
      color: var(--danger);
    }
    .tips {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .tips summary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border: 1px solid currentColor;
      border-radius: 50%;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      list-style: none;
    }
    .tips summary::-webkit-details-marker {
      display: none;
    }
    .tips[open] .tips-body {
      display: block;
    }
    .tips-body {
      display: none;
      position: absolute;
      z-index: 1;
      top: calc(100% + 6px);
      left: 0;
      width: min(360px, calc(100vw - 48px));
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      color: var(--text);
      box-shadow: 0 6px 18px rgba(20, 30, 40, .14);
      font-size: 13px;
      line-height: 1.6;
    }
    .message {
      margin: 0 0 14px;
      padding: 10px 12px;
      border-radius: 8px;
      background: #eef7f7;
      color: #075f5e;
      font-size: 14px;
      white-space: pre-wrap;
    }
    .upload-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin: 16px 0;
    }
    .upload-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fafbfb;
    }
    .upload-card h2 {
      margin: 0 0 8px;
      font-size: 15px;
      letter-spacing: 0;
    }
    .upload-card .button {
      margin-bottom: 10px;
    }
    .upload-help {
      margin: 0 0 10px;
      padding-left: 18px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }
    .upload-card input {
      width: 100%;
      margin-bottom: 10px;
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
    .status {
      margin: 10px 0 0;
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    @media (max-width: 640px) {
      .upload-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <h1>貢献ランクチェッカー</h1>
    <div class="note advertiser-line${settingsExists ? "" : " missing"}">対象広告主: <strong>${escapeHtml(settings.advertiserName)}</strong>${settingsExists ? "" : `<details class="tips"><summary aria-label="settings.jsonの作り方">?</summary><span class="tips-body">settings.template.json をコピーして settings.json を作成し、advertiserName に対象広告主名を入力してください。</span></details>`}</div>
    ${message ? `<p class="message">${escapeHtml(message)}</p>` : ""}
    <div class="actions">
      <form method="post" action="/generate">
        <button class="button primary" type="submit">分析する</button>
      </form>
      ${viewerExists ? `<a class="button" href="/result.html">分析結果を見る</a>` : ""}
    </div>
    <section class="upload-grid">
      <form class="upload-card" method="post" action="/upload?kind=contents" enctype="multipart/form-data">
        <h2>contents HTMLを取り込む</h2>
        <a class="button" href="https://koken.nicovideo.jp/supporter/contents" target="_blank" rel="noopener noreferrer">contentsを開く${externalIcon}</a>
        <ul class="upload-help">
          <li>contents のページをファイルとして保存し、ここに入力してください。</li>
          <li>対象ページでリストを必要な長さだけ読み込んでから保存してください。</li>
          <li>コンテンツ種別は単一種別（「動画のみ」や「静画のみ」）に限定してください。</li>
        </ul>
        <input type="file" name="html" accept=".html,text/html" required>
        <button class="button" type="submit">contentsとして保存</button>
        <p class="status">${escapeHtml(inputStatus[0])}</p>
      </form>
      <form class="upload-card" method="post" action="/upload?kind=reward" enctype="multipart/form-data">
        <h2>reward HTMLを取り込む</h2>
        <a class="button" href="https://koken.nicovideo.jp/supporter/reward" target="_blank" rel="noopener noreferrer">rewardを開く${externalIcon}</a>
        <ul class="upload-help">
          <li>reward のページをファイルとして保存し、ここに入力してください。</li>
          <li>対象ページでリストを必要な長さだけ読み込んでから保存してください。</li>
        </ul>
        <input type="file" name="html" accept=".html,text/html" required>
        <button class="button" type="submit">rewardとして保存</button>
        <p class="status">${escapeHtml(inputStatus[1])}</p>
      </form>
    </section>
    <p class="note">contentsはコンテンツ種別を自動判定して保存します。結果画面の生成には各種別の最新contentsそして最新rewardを使います。</p>
  </main>
</body>
</html>`;
}

function latestInputInfo(kind) {
  if (!fs.existsSync(inputDir)) return `${kind}: no input directory`;
  const files = fs.readdirSync(inputDir)
    .filter((name) => name.toLowerCase().startsWith(kind) && name.toLowerCase().endsWith(".html"))
    .map((name) => {
      const fullPath = path.join(inputDir, name);
      const stat = fs.statSync(fullPath);
      return { name, stat };
    })
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  if (!files.length) return `${kind}: not uploaded yet`;
  const newest = files[0];
  return `${kind}: ${newest.name} (${Math.round(newest.stat.size / 1024)} KB, ${newest.stat.mtime.toLocaleString("ja-JP")})`;
}

function detectContentsType(html) {
  const filterMatch = html.match(/<button[^>]*class="trigger"[^>]*aria-selected="true"[^>]*>([^<]+)<\/button>/);
  const filterText = filterMatch ? stripHtml(filterMatch[1]) : "";
  for (const [type, config] of Object.entries(CONTENT_TYPES)) {
    if (filterText.includes(config.filterLabel) || html.includes(`class="generic-service-name">${config.label}</span>`)) {
      return type;
    }
  }
  for (const [type, config] of Object.entries(CONTENT_TYPES)) {
    if (config.urlPattern.test(html)) return type;
  }
  return "";
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function latestContentsInfo() {
  if (!fs.existsSync(inputDir)) return "contents: no input directory";
  const byType = new Map();
  for (const name of fs.readdirSync(inputDir)) {
    if (!name.toLowerCase().startsWith("contents") || !name.toLowerCase().endsWith(".html")) continue;
    const fullPath = path.join(inputDir, name);
    const stat = fs.statSync(fullPath);
    let type = (name.match(/^contents-([a-z]+)(?:-|\.html$)/i) || [])[1] || "";
    if (!type || !CONTENT_TYPES[type]) {
      try {
        type = detectContentsType(fs.readFileSync(fullPath, "utf8"));
      } catch {
        type = "";
      }
    }
    if (!type || !CONTENT_TYPES[type]) continue;
    const current = byType.get(type);
    if (!current || stat.mtimeMs > current.stat.mtimeMs) byType.set(type, { name, stat });
  }
  if (!byType.size) return "contents: not uploaded yet";
  return [...byType.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, info]) => `${CONTENT_TYPES[type].label}: ${info.name} (${Math.round(info.stat.size / 1024)} KB, ${info.stat.mtime.toLocaleString("ja-JP")})`)
    .join(" / ");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadSettings() {
  const defaults = { advertiserName: "ユーザネーム未設定" };
  if (!fs.existsSync(settingsPath)) return defaults;
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(settingsPath, "utf8")) };
  } catch {
    return defaults;
  }
}

function localPathFromUrl(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const clean = decoded === "/" ? "/index.html" : decoded;
  const normalized = path.normalize(clean.replace(/^\/+/, ""));
  const fullPath = path.join(root, normalized);
  if (!fullPath.startsWith(root)) return "";
  return fullPath;
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function readRequestBody(req, limitBytes = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(new Error("Uploaded file is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function extractMultipartFile(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error("Missing multipart boundary");
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const headerEndMarker = Buffer.from("\r\n\r\n");
  let offset = 0;
  while (offset < buffer.length) {
    const partStart = buffer.indexOf(boundary, offset);
    if (partStart < 0) break;
    let headersStart = partStart + boundary.length;
    if (buffer.slice(headersStart, headersStart + 2).toString() === "--") break;
    if (buffer.slice(headersStart, headersStart + 2).toString() === "\r\n") headersStart += 2;
    const headersEnd = buffer.indexOf(headerEndMarker, headersStart);
    if (headersEnd < 0) break;
    const headers = buffer.slice(headersStart, headersEnd).toString("utf8");
    const dataStart = headersEnd + headerEndMarker.length;
    const nextBoundary = buffer.indexOf(boundary, dataStart);
    if (nextBoundary < 0) break;
    let dataEnd = nextBoundary;
    if (buffer[dataEnd - 2] === 13 && buffer[dataEnd - 1] === 10) dataEnd -= 2;
    if (/name="html"/.test(headers) && /filename="[^"]+"/.test(headers)) {
      return buffer.slice(dataStart, dataEnd);
    }
    offset = nextBoundary;
  }
  throw new Error("Uploaded HTML file was not found in the request");
}

function validateUpload(kind, file) {
  const html = file.toString("utf8");
  if (kind === "contents") {
    const blocks = html.split('<li data-v-0f929b6d="" class="item"').length - 1;
    const detectedType = detectContentsType(html);
    if (blocks > 0 && detectedType) return "";
    return "contents HTMLとして一覧を抽出できませんでした。supporter/contents を保存したHTMLか確認してください。";
  }
  if (kind === "reward") {
    const hasSupportedType = Object.keys(CONTENT_TYPES).some((type) => html.includes(`data-type="${type}"`));
    const hasKnownThumb = /lohas\.nicoseiga\.jp\/thumb\/\d+u\b/.test(html) || /nicovideo\.cdn\.nimg\.jp\/thumbnails\/\d+\//.test(html);
    if (hasSupportedType && hasKnownThumb) return "";
    return "reward HTMLとして3位以内のコンテンツIDを抽出できませんでした。supporter/reward を保存したHTMLか確認してください。";
  }
  return "Invalid upload kind";
}

async function handleUpload(req, res, kind) {
  if (!["contents", "reward"].includes(kind)) {
    send(res, 400, dashboard("Invalid upload kind"));
    return;
  }
  const contentType = req.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    send(res, 400, dashboard("Upload must be multipart/form-data"));
    return;
  }
  const body = await readRequestBody(req);
  const file = extractMultipartFile(body, contentType);
  const head = file.slice(0, 512).toString("utf8").toLowerCase();
  if (!head.includes("<!doctype html") && !head.includes("<html")) {
    send(res, 400, dashboard("Uploaded file does not look like HTML"));
    return;
  }
  const validationError = validateUpload(kind, file);
  if (validationError) {
    send(res, 400, dashboard(validationError));
    return;
  }
  fs.mkdirSync(inputDir, { recursive: true });
  const detectedType = kind === "contents" ? detectContentsType(file.toString("utf8")) : "";
  const destName = kind === "contents" ? `${kind}-${detectedType}-${timestamp()}.html` : `${kind}-${timestamp()}.html`;
  fs.writeFileSync(path.join(inputDir, destName), file);
  send(res, 200, dashboard(`${destName} として保存しました。`));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      send(res, 200, dashboard());
      return;
    }
    if (req.method === "GET" && req.url === "/index.html") {
      send(res, 200, dashboard());
      return;
    }
    if (req.method === "POST" && req.url === "/generate") {
      const result = await generate();
      res.writeHead(303, { Location: "/result.html" });
      res.end(JSON.stringify(result));
      return;
    }
    if (req.method === "POST" && req.url.startsWith("/upload")) {
      const parsed = new URL(req.url, `http://localhost:${port}`);
      await handleUpload(req, res, parsed.searchParams.get("kind") || "");
      return;
    }
    if (req.method === "GET") {
      const filePath = localPathFromUrl(req.url);
      if (!filePath) {
        send(res, 403, "Forbidden", "text/plain; charset=utf-8");
        return;
      }
      serveFile(res, filePath);
      return;
    }
    send(res, 405, "Method not allowed", "text/plain; charset=utf-8");
  } catch (error) {
    send(res, 500, dashboard(error && error.stack ? error.stack : String(error)));
  }
});

server.listen(port, () => {
  console.log(`貢献ランクチェッカー: http://localhost:${port}/`);
});
