const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = __dirname;
const port = Number(process.env.PORT || 8787);
const appPort = Number(process.env.APP_PORT || port + 1);
const clients = new Set();
const ignoredDirectories = new Set([".git", ".jj", "input", "node_modules"]);
let appProcess = null;
let reloadTimer = null;
let watcher = null;
let shuttingDown = false;

function liveReloadScript() {
  return `<script>
(() => {
  if (location.protocol === "file:" || typeof EventSource === "undefined") return;
  const source = new EventSource("/__live_reload_events");
  source.addEventListener("reload", () => location.reload());
  source.addEventListener("error", () => {
    setTimeout(() => {
      if (document.visibilityState !== "hidden") location.reload();
    }, 500);
  });
})();
</script>`;
}

function injectLiveReload(html) {
  const value = String(html);
  if (value.includes('new EventSource("/__live_reload_events")')) return value;
  const script = liveReloadScript();
  return value.includes("</body>") ? value.replace("</body>", `${script}\n</body>`) : `${value}\n${script}`;
}

function handleLiveReload(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  res.write("event: ready\ndata: connected\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
}

function broadcastReload(fileName) {
  for (const client of clients) {
    client.write(`event: reload\ndata: ${JSON.stringify(fileName || "")}\n\n`);
  }
}

function scheduleReload(fileName) {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => broadcastReload(fileName), 100);
}

function watchFiles() {
  try {
    watcher = fs.watch(root, { recursive: true }, (_eventType, fileName) => {
      const normalized = String(fileName || "").replace(/\\/g, "/");
      if (!normalized) return;
      if (ignoredDirectories.has(normalized.split("/")[0])) return;
      scheduleReload(normalized);
    });
    console.log("Live reload: enabled");
  } catch (error) {
    console.warn(`Live reload: disabled (${error.message})`);
  }
}

function proxyRequest(req, res) {
  const proxy = http.request({
    hostname: "127.0.0.1",
    port: appPort,
    method: req.method,
    path: req.url,
    headers: req.headers,
  }, (proxyRes) => {
    const contentType = String(proxyRes.headers["content-type"] || "");
    if (!contentType.startsWith("text/html")) {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
      return;
    }
    const chunks = [];
    proxyRes.on("data", (chunk) => chunks.push(chunk));
    proxyRes.on("end", () => {
      const body = Buffer.from(injectLiveReload(Buffer.concat(chunks).toString("utf8")), "utf8");
      const headers = { ...proxyRes.headers, "content-length": body.length };
      delete headers["transfer-encoding"];
      res.writeHead(proxyRes.statusCode || 500, headers);
      res.end(body);
    });
  });
  proxy.on("error", (error) => {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("Application server is restarting. Reload the page shortly.");
  });
  req.pipe(proxy);
}

function startAppServer() {
  appProcess = spawn(process.execPath, ["--watch", "server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(appPort) },
    stdio: "inherit",
  });
  appProcess.on("exit", (code, signal) => {
    appProcess = null;
    if (!shuttingDown) console.warn(`Application server stopped (${signal || code})`);
  });
}

function stopAppServer() {
  if (appProcess) appProcess.kill();
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (watcher) watcher.close();
  stopAppServer();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/__live_reload_events") {
    handleLiveReload(req, res);
    return;
  }
  proxyRequest(req, res);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", stopAppServer);

startAppServer();
watchFiles();
server.listen(port, () => {
  console.log(`Development server: http://localhost:${port}/`);
});
